import type { Env } from './github.js';
import { paymentRail, type Rail } from './payment-rail.js';

export const SETUP_KINDS = ['stripe-card', 'paypal-vault', 'stripe-payouts', 'paypal-payouts', 'payment-rail'] as const;
export type SetupKind = typeof SETUP_KINDS[number];
export const payComment = (id = '<id>', amount: number | string = '<amount>') => `omakase pay ${id} $${amount} to @<solver-login>`;
export const setupLinks = (origin: string, bounty?: string) => {
  const suffix = bounty === undefined ? '' : `?bounty=${encodeURIComponent(bounty)}`;
  return {
    stripe_card: `${origin}/setup/stripe-card/${suffix}`,
    paypal_vault: `${origin}/setup/paypal-vault/${suffix}`,
    stripe_payouts: `${origin}/setup/stripe-payouts/${suffix}`,
    paypal_payouts: `${origin}/setup/paypal-payouts/${suffix}`,
    payment_rail: `${origin}/setup/payment-rail/${suffix}`
  };
};
export function paymentSetup(origin: string, role: 'poster' | 'solver', bounty?: string) {
  const links = setupLinks(origin, bounty);
  return role === 'poster'
    ? { role, links: { stripe: links.stripe_card, paypal: links.paypal_vault }, consent: 'omakase approve <id> $<amount> on merge', plain_approval: 'omakase approve <id> $<amount>', pay_now: payComment(), note: 'A human saves a payment method and a whole-dollar limit once after GitHub sign-in. Only the exact on merge approval comment authorizes automatic payment for an imported bounty. Plain approval stays owner-chooses/manual or agent-initiated pay; repository switches never authorize imports. The poster can instead comment pay_now on the issue to pay a linked PR author from a saved method without a merge or browser. The reward must be within that method’s default limit. The poster chooses a default rail when both are saved. Fallback is off unless explicitly enabled; a via stripe or via paypal override never falls back. Manual and Checkout remain available.' }
    : { role, links: { stripe: links.stripe_payouts, paypal: links.paypal_payouts }, note: 'A human connects a payout account once after GitHub sign-in. A ready Stripe account or connected PayPal account can receive pay on merge.' };
}

export async function paymentSetupFacts(env: Env, origin: string, role: 'poster' | 'solver', bounty?: string) {
  const base = paymentSetup(origin, role, bounty);
  if (role !== 'poster') return base;
  const owner = bounty === undefined ? null : await env.DB.prepare('SELECT poster_id, merge_rail FROM bounties WHERE id = ?').bind(bounty).first<{ poster_id: number | null; merge_rail: Rail | null }>();
  return { ...base, rail_choice: owner === null ? { saved_rails: null, chosen_rail: null, fallback: null } : await paymentRail(env, owner.poster_id, owner.merge_rail),
    choice_url: setupLinks(origin, bounty).payment_rail,
    via: ['omakase approve <id> $<amount> on merge via stripe', 'omakase approve <id> $<amount> on merge via paypal', `${payComment()} via stripe`, `${payComment()} via paypal`] };
}
