// Each state of pay on merge, in the board's and the tool's words. Facts: nobody is
// told to do anything by a reminder. Here on its own so payments.ts needs nothing of charge.ts.
export type ChargeState = 'looked' | 'charging' | 'choose-rail' | 'not-counted' | 'owner-decides' | 'refused-over-limit' | 'solver-not-ready' | 'solver-disconnected' | 'declined' | 'stripe-refused' | 'provider-refused' | 'owner-must-authenticate' | 'owner-paying' | 'paid' | 'refunded' | 'disputed';

export const CHARGE_WORDS: Record<Exclude<ChargeState, 'looked'>, string> = {
  'choose-rail': 'Choose the default payment rail on your page before this bounty can charge. Neither saved method was charged.',
  charging: 'A charge has been started and has not finished.',
  'not-counted': 'Pay on merge does not run here: the solver is the poster, or GitHub lists them as having access to the repository.',
  'owner-decides': 'More than one solution landed, so pay on merge did not choose. Nothing was charged.',
  'refused-over-limit': 'The reward is not the one the owner approved for pay on merge here. Nothing was charged.',
  'solver-not-ready': 'Automatic charge on merge is off for this bounty because the solver had no usable payout account when payment was evaluated. Once connected, the poster can pay by one-click (Checkout or a fresh omakase pay comment), or record an outside payment. Nothing was charged.',
  'solver-disconnected': 'The solver\'s Stripe account is no longer connected. Nothing was charged.',
  declined: 'The card was declined. Nothing was charged.',
  'stripe-refused': 'Stripe refused this charge for a reason other than the card. Nothing was charged.',
  'provider-refused': 'The payment provider refused this charge. No payment is confirmed. Use Checkout or pay by hand.',
  'owner-must-authenticate': 'The card asks its owner to authenticate. Nothing has been charged.',
  'owner-paying': 'The owner opened Stripe\'s page. Nothing has been charged yet.',
  paid: 'Stripe charged the owner\'s card and paid the solver\'s own account. Stripe\'s fee comes out of the reward.',
  refunded: 'Stripe records this payment as refunded.',
  disputed: 'The card\'s bank is disputing this payment. The dispute is on the solver\'s Stripe account.'
};

/** Where the owner's click went through PayPal, the words that differ. */
export const PAYPAL_WORDS: Partial<typeof CHARGE_WORDS> = {
  'solver-disconnected': 'The solver\'s PayPal account is no longer connected. Nothing was charged.',
  'stripe-refused': 'PayPal refused this payment. No payment is confirmed.',
  'provider-refused': 'PayPal refused this payment. No payment is confirmed. Use Checkout or pay by hand.',
  declined: 'PayPal declined the payment. Nothing was charged.',
  'owner-must-authenticate': 'PayPal has not confirmed a completed payment. The owner must finish payment; no automatic retry is made.',
  'owner-paying': 'PayPal has not confirmed a completed payment. The owner can continue on PayPal if requested.',
  paid: 'PayPal took the payment from the owner and paid the solver\'s own account. PayPal\'s fee comes out of the reward.',
  refunded: 'PayPal records this payment as refunded or reversed.',
  disputed: 'The payer is disputing this payment. The dispute is on the solver\'s PayPal account.'
};

export function chargeWords(state: string, provider: string | null): string | null {
  const key = state as keyof typeof CHARGE_WORDS;
  return (provider === 'paypal' ? PAYPAL_WORDS[key] : undefined) ?? CHARGE_WORDS[key] ?? null;
}
