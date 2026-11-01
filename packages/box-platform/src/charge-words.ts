// Each state of pay on merge, in the board's and the tool's words. Facts: nobody is
// told to do anything by a reminder. Here on its own so payments.ts needs nothing of charge.ts.
export type ChargeState = 'looked' | 'charging' | 'not-counted' | 'owner-decides' | 'refused-over-limit' | 'solver-not-ready' | 'solver-disconnected' | 'declined' | 'stripe-refused' | 'owner-must-authenticate' | 'paid' | 'refunded' | 'disputed';

export const CHARGE_WORDS: Record<Exclude<ChargeState, 'looked'>, string> = {
  charging: 'A charge has been started and has not finished.',
  'not-counted': 'Pay on merge does not run here: the solver is the poster, or GitHub lists them as having access to the repository.',
  'owner-decides': 'More than one solution landed, so pay on merge did not choose. Nothing was charged.',
  'refused-over-limit': 'The reward is over the owner\'s limit for one bounty. Nothing was charged.',
  'solver-not-ready': 'The solver has not finished connecting Stripe. Nothing was charged.',
  'solver-disconnected': 'The solver\'s Stripe account is no longer connected. Nothing was charged.',
  declined: 'The card was declined. Nothing was charged.',
  'stripe-refused': 'Stripe refused this charge for a reason other than the card. Nothing was charged.',
  'owner-must-authenticate': 'The card asks its owner to authenticate. Nothing has been charged.',
  paid: 'Stripe charged the owner\'s card and paid the solver\'s own account. Stripe\'s fee comes out of the reward.',
  refunded: 'Stripe records this payment as refunded.',
  disputed: 'The card\'s bank is disputing this payment. The dispute is on the solver\'s Stripe account.'
};
