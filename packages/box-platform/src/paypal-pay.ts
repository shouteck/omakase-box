// The owner's click through PayPal (PF13). PayPal's `payee` sends the money straight to the
// account the merged author connected, and only the board's capture moves it: an order the
// board has dropped can never be paid. The payee and amount are enforced here; PayPal would take any.
import { claimCharge, claimPage, decidePay, payeeFacts, retireStripePage, type Merged } from './charge.js';
import type { ChargeState } from './charge-words.js';
import type { Env } from './github.js';
import { issueOf, paypal, paypalOn } from './paypal.js';
import { stripeOn } from './stripe.js';
import { setMeta } from './store.js';
import { requireRailChoice } from './payment-rail.js';

export async function vaultSetup(env: Env, githubId: number, origin: string, now: number): Promise<{ url: string } | { error: string }> {
  const made = await paypal(env, 'POST', '/v3/vault/setup-tokens', { payment_source: { paypal: { usage_type: 'MERCHANT', customer_type: 'CONSUMER',
    experience_context: { return_url: `${origin}/me/?vault=return#pay`, cancel_url: `${origin}/me/#pay` } } } });
  const links = made.json['links'] as { rel?: string; href?: string }[] | undefined;
  const url = Array.isArray(links) ? links.find(link => link.rel === 'approve' || link.rel === 'payer-action')?.href : undefined;
  if (made.status >= 300 || typeof made.json['id'] !== 'string' || typeof url !== 'string' || !url.startsWith('https://')) return { error: 'PayPal did not start setup. Nothing was saved. Next: try again.' };
  await env.DB.prepare('INSERT INTO paypal_vault_setup (github_id, setup_id, expires_at) VALUES (?, ?, ?) ON CONFLICT (github_id) DO UPDATE SET setup_id = excluded.setup_id, expires_at = excluded.expires_at')
    .bind(githubId, made.json['id'], now + 3600000).run();
  return { url };
}

export async function vaultSaved(env: Env, githubId: number, setupId: unknown, limit: unknown, now: number): Promise<{ saved: true } | { error: string }> {
  if (typeof setupId !== 'string' || !Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100000) return { error: 'Name your setup token and a whole-dollar limit from 1 to 100000. Nothing was saved.' };
  const held = await env.DB.prepare('SELECT setup_id FROM paypal_vault_setup WHERE github_id = ? AND setup_id = ? AND expires_at > ?').bind(githubId, setupId, now).first();
  if (held === null) return { error: 'That setup was not started by this GitHub account or has expired. Nothing was saved.' };
  const made = await paypal(env, 'POST', '/v3/vault/payment-tokens', { payment_source: { token: { id: setupId, type: 'SETUP_TOKEN' } } }, `pf52/vault/${githubId}/${setupId}`);
  if (made.status >= 300 || typeof made.json['id'] !== 'string') return { error: 'PayPal did not confirm a saved payment method. Nothing was saved. Next: approve setup on PayPal and try again.' };
  await env.DB.prepare('INSERT INTO paypal_vault (github_id, payment_token, label, limit_per_bounty) VALUES (?, ?, ?, ?) ON CONFLICT (github_id) DO UPDATE SET payment_token = excluded.payment_token, label = excluded.label, limit_per_bounty = excluded.limit_per_bounty')
    .bind(githubId, made.json['id'], 'Saved PayPal', limit as number).run();
  await env.DB.prepare('DELETE FROM paypal_vault_setup WHERE github_id = ?').bind(githubId).run();
  await requireRailChoice(env, githubId);
  return { saved: true };
}

export async function removeVault(env: Env, githubId: number): Promise<void> {
  const held = await env.DB.prepare('SELECT payment_token FROM paypal_vault WHERE github_id = ?').bind(githubId).first<{ payment_token: string }>();
  await env.DB.prepare('DELETE FROM paypal_vault WHERE github_id = ?').bind(githubId).run();
  await env.DB.prepare('DELETE FROM paypal_vault_setup WHERE github_id = ?').bind(githubId).run();
  await env.DB.prepare('DELETE FROM pay_repositories WHERE github_id = ? AND NOT EXISTS (SELECT 1 FROM pay_settings WHERE github_id = ? AND payment_method IS NOT NULL)').bind(githubId, githubId).run();
  if (held !== null) await paypal(env, 'DELETE', `/v3/vault/payment-tokens/${encodeURIComponent(held.payment_token)}`);
}

type Row = { state: string; provider: string | null; account_id: string | null; amount: number | null; payment_intent: string | null; at: number };
type Order = Record<string, unknown>;
type Unit = { amount?: { value?: unknown; currency_code?: unknown }; payee?: { merchant_id?: unknown }; custom_id?: unknown; payments?: { captures?: { id?: unknown; status?: unknown }[] } };

const rowOf = (env: Env, id: string): Promise<Row | null> => env.DB.prepare('SELECT state, provider, account_id, amount, payment_intent, at FROM charges WHERE bounty_id = ?').bind(id).first<Row>();
const unitOf = (order: Order): Unit => (order['purchase_units'] as Unit[] | undefined)?.[0] ?? {};
const usd = (amount: number): string => `${amount}.00`;

/** The order is the one the board made for this bounty, for this account and this amount. */
const isOurs = (order: Order, id: string, row: Pick<Row, 'account_id' | 'amount'>): boolean => {
  const unit = unitOf(order);
  return unit.custom_id === id && unit.payee?.merchant_id === row.account_id && row.amount !== null && unit.amount?.value === usd(row.amount) && unit.amount?.currency_code === 'USD';
};

const completedCapture = (order: Order): string | null => {
  const capture = unitOf(order).payments?.captures?.[0];
  return capture?.status === 'COMPLETED' && typeof capture.id === 'string' ? capture.id : null;
};

/** PayPal says it was paid. From here the row holds the capture's id, because a refund or a dispute names the capture. */
async function recordCapture(env: Env, id: string, capture: string, now: number): Promise<void> {
  await env.DB.prepare(`UPDATE charges SET state = 'paid', payment_intent = ?, at = ? WHERE bounty_id = ? AND state IN ('owner-paying', 'charging') AND provider = 'paypal'`).bind(capture, now, id).run();
  await env.DB.prepare('DELETE FROM meta WHERE key = ?').bind(`paypal_action/${id}`).run();
}

export async function paypalAction(env: Env, id: string): Promise<string | null> {
  const held = await env.DB.prepare(`SELECT json_extract(m.value, '$.url') AS url FROM charges c JOIN meta m ON m.key = 'paypal_action/' || c.bounty_id
    WHERE c.bounty_id = ? AND c.provider = 'paypal' AND c.state = 'owner-paying' AND json_extract(m.value, '$.order') = c.payment_intent`).bind(id).first<{ url: string }>();
  return held !== null && typeof held.url === 'string' && held.url.startsWith('https://') ? held.url : null;
}

export async function chargeVault(env: Env, id: string, amount: number, pull: Merged, account: string, token: string, heldAt: number | null, now: number): Promise<void> {
  if (!await claimCharge(env, id, amount, pull, account, token, 'paypal', heldAt, now)) return;
  const made = await paypal(env, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE', purchase_units: [{ custom_id: id, amount: { currency_code: 'USD', value: usd(amount) }, payee: { merchant_id: account } }],
    payment_source: { paypal: { vault_id: token } }
  }, `pf52/${id}/${pull.number}/${token}`);
  const capture = made.json['status'] === 'COMPLETED' && isOurs(made.json, id, { account_id: account, amount }) ? completedCapture(made.json) : null;
  if (capture !== null) { await recordCapture(env, id, capture, now); return; }
  const order = typeof made.json['id'] === 'string' ? made.json['id'] : null;
  const state = made.status >= 500 ? 'charging' : made.status >= 400 ? (issueOf(made) === 'INSTRUMENT_DECLINED' ? 'declined' : 'provider-refused') : order !== null && isOurs(made.json, id, { account_id: account, amount }) ? 'owner-paying' : 'provider-refused';
  const links = made.json['links'] as { rel?: unknown; href?: unknown }[] | undefined;
  const link = Array.isArray(links) ? links.find(entry => entry.rel === 'payer-action' || entry.rel === 'approve')?.href : undefined;
  if (state === 'owner-paying' && typeof link === 'string' && link.startsWith('https://')) await setMeta(env.DB, `paypal_action/${id}`, JSON.stringify({ order, url: link }));
  await env.DB.prepare(`UPDATE charges SET state = ?, payment_intent = ?, at = ? WHERE bounty_id = ? AND state = 'charging' AND provider = 'paypal'`).bind(state, order, now, id).run();
}

/**
 * Whatever has happened to the open order, carried as far as it goes: approved is captured, completed is recorded.
 * This is what makes a closed page safe: an owner who approved and left is still recorded, from any look.
 */
export async function finishOrder(env: Env, id: string, now: number): Promise<'paid' | 'open' | 'none'> {
  const row = await rowOf(env, id);
  if (row?.state !== 'owner-paying' || row.provider !== 'paypal' || row.payment_intent === null) return 'none';
  if ((await payeeFacts(env, id)).recorded) return 'none'; // The owner says they paid by hand: an approved order is left uncaptured, so nobody pays twice.
  const read = await paypal(env, 'GET', `/v2/checkout/orders/${row.payment_intent}`);
  if (read.status !== 200 || !isOurs(read.json, id, row)) return 'none';
  const done = completedCapture(read.json);
  if (done !== null) { await recordCapture(env, id, done, now); return 'paid'; }
  if (read.json['status'] !== 'APPROVED') return 'open';
  const captured = await paypal(env, 'POST', `/v2/checkout/orders/${row.payment_intent}/capture`, {}, `pf13/${id}/capture/${row.payment_intent}`);
  const capture = completedCapture(captured.json);
  if (capture !== null) { await recordCapture(env, id, capture, now); return 'paid'; }
  return 'open';
}

/** The payee rule, with the account tied to the merged author's GitHub id. Never read from anything a solver wrote. */
async function decidePayPal(env: Env, bounty: { amount: number; poster: string }, id: string, chosen?: string) {
  const facts = await payeeFacts(env, id, chosen);
  const row = await rowOf(env, id);
  const authorId = facts.landed.length === 1 ? facts.landed[0]!.author_id : null;
  const connected = authorId === null ? null : await env.DB.prepare('SELECT payer_id FROM paypal_accounts WHERE github_id = ?').bind(authorId).first<{ payer_id: string }>();
  const decision = decidePay({ amount: bounty.amount, poster: bounty.poster, poster_id: facts.poster_id ?? null, landed: facts.landed, recorded: facts.recorded, state: row?.state as ChargeState | undefined ?? null, solver: connected === null ? null : { account_id: connected.payer_id, ready: true }, provider: 'PayPal' });
  return { decision, row, facts };
}

/** The poster's click. One bounty has one live order: an unfinished one is opened again, and clicks at once share one key. */
export async function openPayPalPage(env: Env, id: string, origin: string, now: number, chosen?: string): Promise<{ url: string } | { paid: true } | { error: string }> {
  const bounty = await env.DB.prepare('SELECT amount, poster FROM bounties WHERE id = ?').bind(id).first<{ amount: number; poster: string }>();
  if (bounty === null) return { error: 'This bounty is not on the board. Nothing was charged.' };
  if (await finishOrder(env, id, now) === 'paid') return { paid: true };
  const { decision, row } = await decidePayPal(env, bounty, id, chosen);
  if (decision.act === 'refuse') return { error: decision.words };
  const { pull, account } = decision;
  const held = row?.provider === 'paypal' && row.state === 'owner-paying' ? row.payment_intent : null;
  if (held !== null && row!.account_id === account && row!.amount === bounty.amount) {
    const read = await paypal(env, 'GET', `/v2/checkout/orders/${held}`);
    const link = (read.json['links'] as { rel?: unknown; href?: unknown }[] | undefined)?.find(entry => entry.rel === 'payer-action' || entry.rel === 'approve')?.href;
    if (read.status === 200 && read.json['status'] !== 'VOIDED' && typeof link === 'string') return { url: link };
  }
  // A Stripe page left open could be paid as well, so it goes first, or the click stops.
  const stripePage = await retireStripePage(env, id, now);
  if (stripePage === 'paid') return { paid: true };
  if (stripePage === 'failed') return { error: 'Stripe\'s page for this bounty is still open and could not be closed. Nothing was charged. Next: try again.' };
  const claimed = await claimPage(env, id, row, pull, account, bounty.amount, 'paypal', held, now);
  if (claimed === null) return { error: 'A charge has been started and has not finished. Nothing more was charged. Next: reload this page in a few minutes.' };
  const page = `${origin}/b/${id}/`;
  const order = await paypal(env, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ custom_id: id, description: `Bounty ${id}`, amount: { currency_code: 'USD', value: usd(bounty.amount) }, payee: { merchant_id: account } }],
    payment_source: { paypal: { experience_context: { user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING', return_url: page, cancel_url: page } } }
  }, `pf13/${id}/paypal/${held ?? 'first'}/${bounty.amount}`);
  const link = (order.json['links'] as { rel?: unknown; href?: unknown }[] | undefined)?.find(entry => entry.rel === 'payer-action' || entry.rel === 'approve')?.href;
  if ((order.status !== 200 && order.status !== 201) || typeof order.json['id'] !== 'string' || typeof link !== 'string') {
    return { error: issueOf(order) === 'PAYEE_ACCOUNT_INVALID' ? 'PayPal does not accept this solver\'s connected account. Nothing was charged. Next: pay by a method they listed.' : `PayPal refused this order${issueOf(order) === null ? '' : ` (${issueOf(order)})`}. Nothing was charged. Next: try again.` };
  }
  await env.DB.prepare(`UPDATE charges SET payment_intent = ? WHERE bounty_id = ? AND state = 'owner-paying' AND provider = 'paypal'`).bind(order.json['id'], id).run();
  return { url: link };
}

/** What the poster's page offers. Calls no one: the click checks with PayPal. */
export async function paypalOffer(env: Env, id: string, githubId: number, chosen?: string): Promise<{ can_pay_paypal: boolean; note: string | null }> {
  if (!paypalOn(env)) return { can_pay_paypal: false, note: null };
  const bounty = await env.DB.prepare('SELECT amount, poster, poster_id FROM bounties WHERE id = ?').bind(id).first<{ amount: number; poster: string; poster_id: number | null }>();
  if (bounty === null || bounty.poster_id !== githubId) return { can_pay_paypal: false, note: null };
  const { decision, facts } = await decidePayPal(env, bounty, id, chosen);
  if (facts.recorded || facts.landed.length === 0 || bounty.amount <= 0) return { can_pay_paypal: false, note: null };
  return { can_pay_paypal: decision.act === 'open', note: decision.act === 'refuse' && decision.shown ? decision.words : null };
}

/** For a machine: whether this bounty's one merged author can be paid through PayPal. Null: no one merged yet, or not one. A fact; no account detail. */
export async function authorTakes(env: Env, id: string): Promise<{ author_takes_stripe: boolean | null; author_takes_paypal: boolean | null }> {
  const { landed, solver } = await payeeFacts(env, id);
  if (landed.length !== 1) return { author_takes_stripe: null, author_takes_paypal: null };
  const author_takes_stripe = stripeOn(env) && solver?.ready === true;
  if (!paypalOn(env) || landed[0]!.author_id === null) return { author_takes_stripe, author_takes_paypal: false };
  return { author_takes_stripe, author_takes_paypal: await env.DB.prepare('SELECT 1 FROM paypal_accounts WHERE github_id = ?').bind(landed[0]!.author_id).first() !== null };
}

const SWEEP_MS = 6 * 3600000; // An owner who approved and closed the page is finished by the next run; after this, by their own next look.

const WATCH_MS = 180 * 86400000; // How long a paid capture is re-read for refunds. Our choice: after this the record stays as it stands.

/** One open order and one paid capture a run: Workers Free allows little CPU, and this runs every minute. */
export async function settlePayPal(env: Env): Promise<void> {
  if (!paypalOn(env)) return;
  const now = env.now?.() ?? Date.now();
  const due = await env.DB.prepare(`SELECT bounty_id FROM charges WHERE state = 'owner-paying' AND provider = 'paypal' AND at > ? AND at <= ? ORDER BY RANDOM() LIMIT 1`).bind(now - SWEEP_MS, now - 60000).first<{ bounty_id: string }>();
  if (due !== null) await finishOrder(env, due.bounty_id, now);
  // A refund made on the solver's own account sends the platform no event (PF13's proof), and its status can still be read.
  const paid = await env.DB.prepare(`SELECT payment_intent FROM charges WHERE state = 'paid' AND provider = 'paypal' AND at > ? ORDER BY RANDOM() LIMIT 1`).bind(now - WATCH_MS).first<{ payment_intent: string }>();
  if (paid === null) return;
  const read = await paypal(env, 'GET', `/v2/payments/captures/${paid.payment_intent}`);
  if (read.json['status'] === 'REFUNDED' || read.json['status'] === 'REVERSED') await env.DB.prepare(`UPDATE charges SET state = 'refunded', at = ? WHERE payment_intent = ? AND provider = 'paypal' AND state = 'paid'`).bind(now, paid.payment_intent).run();
}

type Event = { event_type?: unknown; resource?: Record<string, unknown> };

const captureOfLinks = (resource: Record<string, unknown>): string | null => {
  const links = resource['links'] as { href?: unknown; rel?: unknown }[] | undefined;
  for (const link of links ?? []) {
    const found = typeof link.href === 'string' ? /\/captures\/([A-Z\d]{1,40})$/.exec(link.href) : null;
    if (found !== null) return found[1]!;
  }
  return null;
};

/** A verified event. Only the row holding that id moves, and what a refund means is read from PayPal itself. */
export async function applyPayPalEvent(env: Env, event: Event, now: number): Promise<void> {
  const resource = event.resource ?? {};
  const rowFor = (paymentId: string) => env.DB.prepare(`SELECT bounty_id FROM charges WHERE payment_intent = ? AND provider = 'paypal'`).bind(paymentId).first<{ bounty_id: string }>();
  const set = (state: string, capture: string) => env.DB.prepare(`UPDATE charges SET state = ?, at = ? WHERE payment_intent = ? AND provider = 'paypal'`).bind(state, now, capture).run();
  if (event.event_type === 'CHECKOUT.ORDER.APPROVED' && typeof resource['id'] === 'string') {
    const row = await rowFor(resource['id']);
    if (row !== null) await finishOrder(env, row.bounty_id, now);
    return;
  }
  if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED' || event.event_type === 'PAYMENT.CAPTURE.REVERSED') {
    const capture = event.event_type === 'PAYMENT.CAPTURE.REFUNDED' ? captureOfLinks(resource) : captureOfLinks(resource) ?? (typeof resource['id'] === 'string' ? resource['id'] : null);
    if (capture === null || await rowFor(capture) === null) return;
    const read = await paypal(env, 'GET', `/v2/payments/captures/${capture}`);
    if (read.json['status'] === 'REFUNDED' || read.json['status'] === 'REVERSED') await set('refunded', capture);
    return;
  }
  if (event.event_type === 'CUSTOMER.DISPUTE.CREATED') {
    for (const entry of (resource['disputed_transactions'] as { seller_transaction_id?: unknown }[] | undefined) ?? []) {
      if (typeof entry.seller_transaction_id === 'string') await set('disputed', entry.seller_transaction_id);
    }
  }
}
