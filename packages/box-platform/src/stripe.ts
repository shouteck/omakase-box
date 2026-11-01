// The only file that talks to Stripe. Plain fetch, no SDK. Stripe's own text can
// echo a masked key (K46), so nothing leaves here without passing redact().

export type StripeEnv = { readonly STRIPE_SECRET_KEY?: string; readonly STRIPE_WEBHOOK_SECRET?: string; readonly STRIPE_API?: string };
export type StripeAnswer = { readonly status: number; readonly json: Record<string, unknown> };
type Options = { readonly account?: string; readonly idempotency?: string };

/** Stripe could not be reached or read. Named; what was asked may or may not have happened. */
export class StripeUnavailable extends Error {}

const KEY = /\b(?:sk|rk|pk|whsec)_[A-Za-z\d_*]+/g;
const MASKED = /[A-Za-z\d_]*\*{3,}[A-Za-z\d_]*/g;
const SECRET = /\b(?:pi|seti|cs)_[A-Za-z\d_]*_secret_[A-Za-z\d]+/g;
export const redact = (text: string): string => text.replace(KEY, '[removed]').replace(SECRET, '[removed]').replace(MASKED, '[removed]');

export const stripeOn = (env: StripeEnv): boolean => env.STRIPE_SECRET_KEY !== undefined && env.STRIPE_SECRET_KEY !== '';

export async function stripe(env: StripeEnv, method: 'GET' | 'POST' | 'DELETE', path: string, form?: Record<string, string>, options: Options = {}): Promise<StripeAnswer> {
  let response: Response;
  try {
    response = await fetch(`${env.STRIPE_API ?? 'https://api.stripe.com'}${path}`, {
      method, signal: AbortSignal.timeout(15000),
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        ...(form === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }),
        ...(options.account === undefined ? {} : { 'stripe-account': options.account }),
        ...(options.idempotency === undefined ? {} : { 'idempotency-key': options.idempotency })
      },
      ...(form === undefined ? {} : { body: new URLSearchParams(form).toString() })
    });
  } catch { throw new StripeUnavailable('Stripe could not be reached'); }
  if (response.status >= 500) throw new StripeUnavailable(`Stripe answered ${response.status}`);
  try {
    const json: unknown = await response.json();
    return { status: response.status, json: json !== null && typeof json === 'object' ? json as Record<string, unknown> : {} };
  } catch { throw new StripeUnavailable('Stripe sent an answer that could not be read'); }
}

const errorOf = (answer: StripeAnswer): Record<string, unknown> => {
  const error = answer.json['error'];
  return error !== null && typeof error === 'object' ? error as Record<string, unknown> : {};
};
export const errorCode = (answer: StripeAnswer): string | null => {
  const { code, decline_code: decline } = errorOf(answer);
  return typeof code === 'string' ? code : typeof decline === 'string' ? decline : null;
};
/** Stripe's words, safe to show. */
export const errorWords = (answer: StripeAnswer): string => {
  const { message } = errorOf(answer);
  return redact(typeof message === 'string' ? message.slice(0, 300) : `Stripe answered ${answer.status}`);
};

// ---- webhooks ---------------------------------------------------------------

const TOLERANCE_MS = 300000;
const unhex = (text: string): Uint8Array<ArrayBuffer> | null => /^(?:[a-f\d]{2})+$/.test(text) ? Uint8Array.from(text.match(/../g)!, pair => parseInt(pair, 16)) : null;

/** Stripe's scheme: HMAC-SHA256 of "<t>.<body>", compared in constant time by the platform. */
export async function signatureHolds(secret: string, header: string | null, body: string, now: number): Promise<boolean> {
  if (header === null) return false;
  const parts = header.split(',').map(part => part.trim().split('='));
  const at = Number(parts.find(([name]) => name === 't')?.[1]);
  if (!Number.isSafeInteger(at) || Math.abs(now - at * 1000) > TOLERANCE_MS) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  for (const [name, value] of parts) {
    const signature = name === 'v1' && value !== undefined ? unhex(value) : null;
    if (signature !== null && await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(`${at}.${body}`))) return true;
  }
  return false;
}
