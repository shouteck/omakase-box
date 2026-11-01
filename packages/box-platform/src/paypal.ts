// The only file that talks to PayPal. Plain fetch, no SDK. PayPal's own words never
// leave here: an answer is named by its issue code, so no text of theirs reaches a page or a log.

export type PayPalEnv = { readonly PAYPAL_CLIENT_ID?: string; readonly PAYPAL_SECRET?: string; readonly PAYPAL_WEBHOOK_ID?: string; readonly PAYPAL_API?: string; readonly PAYPAL_WEB?: string };
export type PayPalAnswer = { readonly status: number; readonly json: Record<string, unknown> };

/** PayPal could not be reached or read. Named; what was asked may or may not have happened. */
export class PayPalUnavailable extends Error {}

export const paypalOn = (env: PayPalEnv): boolean => Boolean(env.PAYPAL_CLIENT_ID) && Boolean(env.PAYPAL_SECRET);
const apiOf = (env: PayPalEnv): string => env.PAYPAL_API ?? 'https://api-m.paypal.com';
const basicOf = (env: PayPalEnv): string => `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`)}`;
const FORM = 'application/x-www-form-urlencoded';

async function sent(url: string, init: RequestInit): Promise<PayPalAnswer> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) }); } catch { throw new PayPalUnavailable('PayPal could not be reached'); }
  if (response.status >= 500 || response.status === 429) throw new PayPalUnavailable(`PayPal answered ${response.status}`);
  try {
    const json: unknown = await response.json();
    return { status: response.status, json: json !== null && typeof json === 'object' ? json as Record<string, unknown> : {} };
  } catch { throw new PayPalUnavailable('PayPal sent an answer that could not be read'); }
}

async function appToken(env: PayPalEnv): Promise<string> {
  const answer = await sent(`${apiOf(env)}/v1/oauth2/token`, { method: 'POST', headers: { authorization: basicOf(env), 'content-type': FORM }, body: 'grant_type=client_credentials' });
  if (typeof answer.json['access_token'] !== 'string') throw new PayPalUnavailable('PayPal refused the board\'s credentials');
  return answer.json['access_token'];
}

/** A call as the board. `request` is PayPal's idempotency key: the same key gives the same answer. */
export async function paypal(env: PayPalEnv, method: 'GET' | 'POST', path: string, body?: unknown, request?: string): Promise<PayPalAnswer> {
  return sent(`${apiOf(env)}${path}`, {
    method,
    headers: { authorization: `Bearer ${await appToken(env)}`, 'content-type': 'application/json', prefer: 'return=representation', ...(request === undefined ? {} : { 'paypal-request-id': request }) },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {})
  });
}

/** The issue PayPal names, for the board to act on. Its code, never its description. */
export const issueOf = (answer: PayPalAnswer): string | null => {
  const details = answer.json['details'];
  const issue = Array.isArray(details) ? (details[0] as { issue?: unknown } | undefined)?.issue : undefined;
  return typeof issue === 'string' && /^[A-Z_]{1,80}$/.test(issue) ? issue : null;
};

// The fewest details that give an account ID `payee` accepts: `openid` alone gives one it refuses (PF13's proof).
const LOGIN_SCOPE = 'openid https://uri.paypal.com/services/paypalattributes';

export function loginAddress(env: PayPalEnv, redirectUri: string, state: string): string {
  const to = new URL('/signin/authorize', env.PAYPAL_WEB ?? 'https://www.paypal.com');
  for (const [name, value] of Object.entries({ flowEntry: 'static', client_id: env.PAYPAL_CLIENT_ID!, response_type: 'code', scope: LOGIN_SCOPE, redirect_uri: redirectUri, state })) to.searchParams.set(name, value);
  return to.href;
}

const PAYER_ID = /^[A-Z\d]{13}$/;

/** The person's token is held only in this function's locals: exchanged, used once, dropped. Only the account ID is returned, whatever else PayPal sends. */
export async function payerFrom(env: PayPalEnv, code: string): Promise<string | null> {
  const exchanged = await sent(`${apiOf(env)}/v1/oauth2/token`, { method: 'POST', headers: { authorization: basicOf(env), 'content-type': FORM }, body: new URLSearchParams({ grant_type: 'authorization_code', code }).toString() });
  const token = exchanged.json['access_token'];
  if (typeof token !== 'string') return null;
  const person = await sent(`${apiOf(env)}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, { headers: { authorization: `Bearer ${token}` } });
  const payer = person.json['payer_id'];
  return typeof payer === 'string' && PAYER_ID.test(payer) ? payer : null;
}

const STALE_MS = 3 * 86400000; // PayPal retries an event for up to three days, so an older one is a replay.

/** PayPal's own check of a webhook. The raw body goes back as sent: parsed and rebuilt, it can fail to match. */
export async function webhookHolds(env: PayPalEnv, headers: Headers, body: string, now: number): Promise<boolean> {
  const [id, time, url, algorithm, signature] = ['transmission-id', 'transmission-time', 'cert-url', 'auth-algo', 'transmission-sig'].map(name => headers.get(`paypal-${name}`));
  if (env.PAYPAL_WEBHOOK_ID === undefined || !id || !time || !url || !algorithm || !signature) return false;
  const at = Date.parse(time);
  if (!Number.isFinite(at) || now - at > STALE_MS) return false;
  const answer = await sent(`${apiOf(env)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await appToken(env)}`, 'content-type': 'application/json' },
    body: `{"transmission_id":${JSON.stringify(id)},"transmission_time":${JSON.stringify(time)},"cert_url":${JSON.stringify(url)},"auth_algo":${JSON.stringify(algorithm)},"transmission_sig":${JSON.stringify(signature)},"webhook_id":${JSON.stringify(env.PAYPAL_WEBHOOK_ID)},"webhook_event":${body}}`
  });
  return answer.json['verification_status'] === 'SUCCESS';
}
