// The ways a solver accepts payment: each checked for shape, never followed.
// One table entry per kind; a stored row is parsed again when read.
export const MAX_METHODS = 10;

export type Visibility = 'everyone' | 'owner-only';
export type Method = { kind: string; value: string; chain: string | null; visibility: Visibility };

type Kind = { label: string; visibility: Visibility; link: boolean; shape: RegExp; refusal: string };

export const KINDS: Record<string, Kind> = {
  paypal: { label: 'PayPal.me', visibility: 'everyone', link: true, shape: /^https:\/\/(www\.)?paypal\.me\/[A-Za-z\d_-]{1,64}\/?$/, refusal: 'That is not a PayPal.me. Next: paste a link that starts with https://paypal.me/' },
  stripe: { label: 'Stripe payment link', visibility: 'everyone', link: true, shape: /^https:\/\/(buy|donate)\.stripe\.com\/[A-Za-z\d_/-]{1,128}$/, refusal: 'That is not a Stripe payment link. Next: paste a link that starts with https://buy.stripe.com/' },
  'github-sponsors': { label: 'GitHub Sponsors', visibility: 'everyone', link: true, shape: /^https:\/\/github\.com\/sponsors\/[A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?\/?$/, refusal: 'That is not a GitHub Sponsors page. Next: paste a link that starts with https://github.com/sponsors/' },
  'wise-email': { label: 'Wise email', visibility: 'owner-only', link: false, shape: /^[^\s@<>"':;,/\\]{1,64}@[A-Za-z\d-]+(\.[A-Za-z\d-]+)+$/, refusal: 'That is not an email address. Next: paste the address your Wise account uses.' },
  wallet: { label: 'Wallet address', visibility: 'owner-only', link: false, shape: /^[A-Za-z\d_-]{20,128}$/, refusal: 'That is not a wallet address. Next: paste the address alone, with no spaces or prefix.' }
};
const CHAIN = /^[A-Za-z\d][A-Za-z\d -]{0,31}$/;
const VISIBILITIES: readonly unknown[] = ['everyone', 'owner-only'];

export const isLink = (method: Pick<Method, 'kind'>): boolean => KINDS[method.kind]?.link === true;
const kindOf = (name: string): Kind | undefined => Object.hasOwn(KINDS, name) ? KINDS[name] : undefined;

/** One method as the board may hold it, or the reason and the next step. */
export function checkMethod(input: unknown): Method | { error: string } {
  if (input === null || typeof input !== 'object') return { error: 'A method must name its kind, value and who sees it. Next: fill in all three.' };
  const { kind, value, chain, visibility } = input as Record<string, unknown>;
  const entry = typeof kind === 'string' ? kindOf(kind) : undefined;
  if (entry === undefined) return { error: `That kind is not offered. Next: one of ${Object.keys(KINDS).join(', ')}.` };
  if (typeof value !== 'string' || value.length > 254 || !entry.shape.test(value)) return { error: entry.refusal };
  if (!VISIBILITIES.includes(visibility)) return { error: 'Say who sees it. Next: choose "Everyone, on my profile" or "Only an owner who owes me".' };
  if (kind === 'wallet') {
    if (typeof chain !== 'string' || !CHAIN.test(chain)) return { error: 'A wallet needs its chain named. Next: type the chain, for example Ethereum.' };
    return { kind, value, chain, visibility: visibility as Visibility };
  }
  return { kind: kind as string, value, chain: null, visibility: visibility as Visibility };
}

/** Rows as stored: anything that no longer passes is dropped, never shown. */
export function parseStored(rows: readonly unknown[]): Method[] {
  return rows.map(checkMethod).filter((row): row is Method => !('error' in row));
}

export const publicOnly = (methods: readonly Method[]): Method[] => methods.filter(method => method.visibility === 'everyone');
