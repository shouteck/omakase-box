// The three ways to pay (PF15), in one place for the tool, the feed, MCP and the site, so
// their words cannot differ in fact. Here on its own, importing nothing, so the tool and the
// pages can read it. Three ways, never levels: by hand reaches the most people.
export type WayId = 'by-hand' | 'one-click' | 'on-merge';
export type Provider = 'Stripe' | 'PayPal';
export type WaysSetUp = { readonly by_hand: true; readonly one_click: readonly Provider[]; readonly on_merge: boolean };

export const NOT_SET_UP = 'not set up on this board yet';

export const WAYS: readonly { readonly id: WayId; readonly name: string; readonly through: string; readonly afterMerge: string; readonly whoSays: string; readonly shows: string }[] = [
  { id: 'by-hand', name: 'By hand', through: 'Wise, wallet, any listed way', afterMerge: 'You pay, then record it.', whoSays: 'The owner', shows: 'Record $45 paid' },
  { id: 'one-click', name: 'One click', through: 'Stripe or PayPal', afterMerge: 'You click and pay on the provider\'s page.', whoSays: 'The provider', shows: 'Pay $45' },
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

/** Which ways can apply to one bounty. On merge only where this poster's switch says so; a way is a fact, not a promise. */
export const waysOfBounty = (amount: number, here: WaysSetUp, paysOnMerge: boolean): WayId[] => amount <= 0 ? [] : [
  'by-hand',
  ...(here.one_click.length > 0 ? ['one-click' as const] : []),
  ...(here.on_merge && paysOnMerge ? ['on-merge' as const] : [])
];
