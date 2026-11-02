// The three ways to pay (PF15), in one place for the tool, the feed, MCP and the site, so
// their words cannot differ in fact. Here on its own, importing nothing, so the tool and the
// pages can read it. Three ways, never levels: by hand reaches the most people.
export type WayId = 'by-hand' | 'one-click' | 'on-merge';
export type Provider = 'Stripe' | 'PayPal';
export type WaysSetUp = { readonly by_hand: true; readonly one_click: readonly Provider[]; readonly on_merge: boolean };

export const NOT_SET_UP = 'not set up on this board yet';

export const WAYS: readonly { readonly id: WayId; readonly name: string; readonly through: string; readonly afterMerge: string; readonly whoSays: string; readonly shows: string }[] = [
  { id: 'by-hand', name: 'By hand', through: 'Wise, wallet, any listed way', afterMerge: 'You pay, then record it.', whoSays: 'The owner', shows: 'Record $45 paid' },
  { id: 'one-click', name: 'One click', through: 'A payment provider', afterMerge: 'You click and pay on the provider\'s page.', whoSays: 'The provider', shows: 'Pay $45' },
  { id: 'on-merge', name: 'On merge', through: 'Stripe', afterMerge: 'You do nothing, after saving a card and limit once.', whoSays: 'The provider', shows: '$45 paid' }
];

/** Which ways this board's keys allow. By hand needs none. */
export const waysSetUp = (keys: { readonly stripe: boolean; readonly paypal: boolean }): WaysSetUp => ({
  by_hand: true,
  one_click: [...(keys.stripe ? ['Stripe' as const] : []), ...(keys.paypal ? ['PayPal' as const] : [])],
  on_merge: keys.stripe
});

/** One way as a reader on this board should see it: its name, and whether it is set up here. */
export const isSetUp = (id: WayId, here: WaysSetUp): boolean => id === 'by-hand' || (id === 'one-click' ? here.one_click.length > 0 : here.on_merge);

/** A way's "through" line on this board. Until the board has answered, or with no key, it names no provider. */
export const throughHere = (way: { readonly id: WayId; readonly through: string }, here: WaysSetUp | null): string =>
  way.id === 'one-click' && here !== null && here.one_click.length > 0 ? here.one_click.join(' or ') : way.through;

/** Whose page one click opens, on this board. */
export const pageWords = (here: WaysSetUp): string => here.one_click.length === 0 ? 'a provider\'s page' : `${here.one_click.map(name => `${name}'s`).join(' or ')} page`;

/** What a solver does on their page, on this board. */
export const connectWords = (here: WaysSetUp | null): string => {
  const names = here?.one_click ?? [];
  const byHand = names.length === 0 ? 'On your page, list a way and be paid by hand.' : 'Or list a way and be paid by hand.';
  if (names.length === 0) return byHand;
  const onMerge = here?.on_merge !== true ? ' with one click' : names.length === 1 ? ' with one click or on merge' : ' with one click; connected Stripe also covers on merge';
  return `On your page, connect ${names.join(' or ')} and an owner can pay you${onMerge}. ${byHand}`;
};

/**
 * Where a solver's Stripe account can be: K46's refusals and PF18's run, an account and a charge in each.
 * Stripe's own list also has India and Indonesia, in preview, and five countries through Paystack; none is offered here.
 */
export const STRIPE_COUNTRIES = ['AE', 'AT', 'AU', 'BE', 'BG', 'BR', 'CA', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GI', 'GR', 'HK', 'HR', 'HU', 'IE', 'IT', 'JP', 'LI', 'LT', 'LU', 'LV', 'MT', 'MX', 'MY', 'NL', 'NO', 'NZ', 'PL', 'PT', 'RO', 'SE', 'SG', 'SI', 'SK', 'TH', 'US'] as const;
export const STRIPE_REACH = 'Stripe\'s ways need a bank account in a supported country; a solver elsewhere is paid by hand.';
export const countryName = (code: string): string => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; } };

/** Which ways can apply to one bounty. On merge only where this poster's switch says so; a way is a fact, not a promise. */
export const waysOfBounty = (amount: number, here: WaysSetUp, paysOnMerge: boolean): WayId[] => amount <= 0 ? [] : [
  'by-hand',
  ...(here.one_click.length > 0 ? ['one-click' as const] : []),
  ...(here.on_merge && paysOnMerge ? ['on-merge' as const] : [])
];
