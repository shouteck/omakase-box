import { payeeFacts } from './charge.js';
import type { Env } from './github.js';
import { parseStored, publicOnly } from './methods.js';
import { payComment, setupLinks } from './payment-setup.js';

export async function owedNow(env: Env, id: string, origin = '') {
  const bounty = await env.DB.prepare('SELECT amount, repository, issue_number FROM bounties WHERE id = ?').bind(id).first<{ amount: number; repository: string; issue_number: number }>();
  if (bounty === null || bounty.amount <= 0) return null;
  const { landed, recorded } = await payeeFacts(env, id);
  const settled = await env.DB.prepare(`SELECT 1 FROM charges WHERE bounty_id = ? AND state IN ('paid', 'refunded', 'disputed')`).bind(id).first();
  if (recorded || settled !== null || landed.length === 0) return null;
  const authors = [...new Set(landed.map(pull => pull.author))];
  const payees = await Promise.all(authors.map(async login => {
    const all = parseStored((await env.DB.prepare('SELECT kind, value, chain, visibility FROM methods WHERE login = ? COLLATE NOCASE ORDER BY position').bind(login).all()).results);
    return { login, methods: publicOnly(all), methods_more: all.filter(method => method.visibility !== 'everyone').length };
  }));
  return { state: authors.length === 1 ? 'owed' : 'owner-decides', amount: bounty.amount, currency: 'USD', payees,
    payout_setup_urls: { stripe: setupLinks(origin, id).stripe_payouts, paypal: setupLinks(origin, id).paypal_payouts },
    pay_now: { comment: payComment(id, bounty.amount), note: 'The poster may request payment from a saved method within its default limit. Stripe is preferred when ready, else PayPal Vault. No browser or merge is required for this command; a prior payment, record or in-flight charge blocks it.' },
    record_payment: {
      cli: `omakase-box config set paid ${id}`,
      github_issue: `https://github.com/${bounty.repository}/issues/${bounty.issue_number}`,
      comment: `omakase paid ${id} $${bounty.amount} to @<solver-login>`,
      note: 'After paying, the poster GitHub account can comment the exact line with a linked solver login. This records the owner’s word, not provider verification. The CLI command applies to a bounty record in the poster repository. Owner-only methods remain private.'
    } };
}
