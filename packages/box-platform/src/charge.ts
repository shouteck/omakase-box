// Pay on merge (PF11): whether a merge starts a charge, and what happened. decide()
// is the whole rule and calls nothing. The board never holds money: a direct charge
// goes from the owner's saved card to the solver's own Stripe account. The limit and
// the payee are enforced here and nowhere else; Stripe would accept any (K46).
import type { ChargeState } from './charge-words.js';
import type { Env } from './github.js';
import { notCounted, type MergedPull } from './payments.js';
import { errorCode, errorWords, isCardError, stripe, StripeUnavailable, stripeOn } from './stripe.js';

/** Nothing can change these by trying again. Everything else is looked at again when its facts change. */
const SETTLED: readonly ChargeState[] = ['paid', 'refunded', 'disputed'];
const STALE_CLAIM_MS = 120000;

export type Merged = MergedPull & { author_id: number | null };
export type ChargeRow = { state: ChargeState; payment_method: string | null; at: number };
export type ChargeFacts = {
  amount: number;
  poster: string;
  landed: readonly Merged[];
  /** When the poster's switch for this repository went on, with the poster's GitHub id matched. Null: off. */
  on_at: string | null;
  card: { payment_method: string; customer: string; limit: number } | null;
  /** The account tied to the merged author's GitHub id. Never read from anything a solver wrote. */
  solver: { account_id: string; ready: boolean } | null;
  /** The owner has already said they paid, by hand. */
  recorded: boolean;
  row: ChargeRow | null;
};

export type Decision =
  | { act: 'nothing' }
  | { act: 'settle'; state: ChargeState; pull: Merged | null }
  | { act: 'charge'; pull: Merged; account: string; card: NonNullable<ChargeFacts['card']> };

/** The order is the rule: the first that applies decides. */
export function decide(facts: ChargeFacts, now: number): Decision {
  const { row, card } = facts;
  if (row !== null && SETTLED.includes(row.state)) return { act: 'nothing' };
  if (row?.state === 'owner-must-authenticate') return { act: 'nothing' }; // Never again off-session: the owner finishes it or it stands.
  if (row?.state === 'charging' && now - row.at < STALE_CLAIM_MS) return { act: 'nothing' };
  if (facts.amount <= 0 || facts.landed.length === 0 || facts.on_at === null || card === null || facts.recorded) return { act: 'nothing' };
  if (facts.landed.length > 1) return { act: 'settle', state: 'owner-decides', pull: null };
  const pull = facts.landed[0]!;
  if (Date.parse(pull.merged_at) < Date.parse(facts.on_at)) return { act: 'nothing' }; // Turning it on never charges an old merge.
  if (notCounted(pull, facts.poster) !== null) return { act: 'settle', state: 'not-counted', pull };
  if (facts.amount > card.limit) return { act: 'settle', state: 'refused-over-limit', pull };
  if (facts.solver === null || !facts.solver.ready) return { act: 'settle', state: 'solver-not-ready', pull };
  if ((row?.state === 'declined' || row?.state === 'stripe-refused') && row.payment_method === card.payment_method) return { act: 'nothing' }; // The same card gives the same answer: a new card is a new attempt.
  return { act: 'charge', pull, account: facts.solver.account_id, card };
}

const keyOf = (bounty: string, pull: number, card: string): string => `pf11/${bounty}/${pull}/${card}`;

type Attempt = { state: ChargeState; payment_intent: string | null };

/** The calls, once decide() said to charge. A payment already on the account answers first, so a lost key cannot charge twice. */
async function attempt(env: Env, bounty: string, amount: number, decision: Extract<Decision, { act: 'charge' }>): Promise<Attempt> {
  const { account, card, pull } = decision;
  const on = { account };
  const about = await stripe(env, 'GET', `/v1/accounts/${account}`);
  if (about.status === 401 || about.status === 403 || about.status === 404) return { state: 'solver-disconnected', payment_intent: null };
  if (about.json['charges_enabled'] !== true) return { state: 'solver-not-ready', payment_intent: null };
  const found = await stripe(env, 'GET', `/v1/payment_intents/search?query=${encodeURIComponent(`metadata['bounty']:'${bounty}' AND status:'succeeded'`)}&limit=20`, undefined, on);
  if (found.status === 401 || found.status === 403) return { state: 'solver-disconnected', payment_intent: null };
  // Only a payment this platform made counts: a solver can put any metadata on a payment of their own.
  const existing = Array.isArray(found.json['data']) ? (found.json['data'] as { id?: string; application?: unknown }[]).find(entry => typeof entry.application === 'string') : undefined;
  if (existing?.id !== undefined) return { state: 'paid', payment_intent: existing.id };
  const key = keyOf(bounty, pull.number, card.payment_method);
  const clone = await stripe(env, 'POST', '/v1/payment_methods', { customer: card.customer, payment_method: card.payment_method }, { ...on, idempotency: `${key}/clone` });
  if (clone.status === 401 || clone.status === 403) return { state: 'solver-disconnected', payment_intent: null };
  if (clone.status !== 200 || typeof clone.json['id'] !== 'string') return { state: isCardError(clone) ? 'declined' : 'stripe-refused', payment_intent: null };
  const paid = await stripe(env, 'POST', '/v1/payment_intents', {
    amount: String(amount * 100), currency: 'usd', payment_method: clone.json['id'], confirm: 'true', off_session: 'true',
    'metadata[bounty]': bounty, 'metadata[pull_request]': String(pull.number)
  }, { ...on, idempotency: key });
  if (paid.status === 200) return { state: paid.json['status'] === 'succeeded' ? 'paid' : 'charging', payment_intent: typeof paid.json['id'] === 'string' ? paid.json['id'] : null };
  if (paid.status === 401 || paid.status === 403) return { state: 'solver-disconnected', payment_intent: null };
  const error = paid.json['error'] as { payment_intent?: { id?: unknown } } | undefined;
  const intent = typeof error?.payment_intent?.id === 'string' ? error.payment_intent.id : null;
  return { state: !isCardError(paid) ? 'stripe-refused' : errorCode(paid) === 'authentication_required' ? 'owner-must-authenticate' : 'declined', payment_intent: intent };
}

const CHARGES_PER_RUN = 1; // Workers Free: a charge is five calls to Stripe, and this runs every minute.

/** Only merged, rewarded bounties whose poster's GitHub id has switched this repository on. */
const DUE = `SELECT b.id, b.amount, b.poster, b.poster_id, r.on_at, s.customer_id, s.payment_method, s.limit_per_bounty
  FROM bounties b
  JOIN pay_repositories r ON r.github_id = b.poster_id AND r.repository = b.repository
  JOIN pay_settings s ON s.github_id = b.poster_id
  LEFT JOIN charges c ON c.bounty_id = b.id
  WHERE b.amount > 0 AND s.payment_method IS NOT NULL AND s.limit_per_bounty IS NOT NULL
    AND EXISTS (SELECT 1 FROM pull_requests p WHERE p.bounty_id = b.id AND p.state = 'merged' AND p.on_default = 1)
    AND (c.state IS NULL OR c.state NOT IN ('paid', 'refunded', 'disputed', 'owner-must-authenticate'))
    AND (c.at IS NULL OR c.at <= ?)
  ORDER BY c.at IS NOT NULL, c.at, b.id LIMIT ?`;
type DueRow = { id: string; amount: number; poster: string; poster_id: number; on_at: string; customer_id: string; payment_method: string; limit_per_bounty: number };

const LOOK_AGAIN_MS = 300000; // A state that may change is looked at this often, never faster.

/** The switch is on, a merge landed: start what is due. Returns how many were looked at. */
export async function settleCharges(env: Env): Promise<number> {
  if (!stripeOn(env)) return 0;
  const db = env.DB;
  const now = env.now?.() ?? Date.now();
  const due = (await db.prepare(DUE).bind(now - LOOK_AGAIN_MS, CHARGES_PER_RUN).all<DueRow>()).results;
  for (const row of due) {
    const landed = (await db.prepare(`SELECT number, author, author_id, merged_at, association, on_default FROM pull_requests WHERE bounty_id = ? AND state = 'merged' AND on_default = 1 ORDER BY number`).bind(row.id).all<Merged>()).results;
    const held = await db.prepare('SELECT state, payment_method, at FROM charges WHERE bounty_id = ?').bind(row.id).first<ChargeRow>();
    const authorId = landed.length === 1 ? landed[0]!.author_id : null;
    const solver = authorId === null ? null : await db.prepare('SELECT account_id, ready FROM stripe_accounts WHERE github_id = ?').bind(authorId).first<{ account_id: string; ready: number }>();
    const events = await db.prepare(`SELECT 1 FROM events WHERE bounty_id = ? AND type = 'paid' AND withdrawn = 0 UNION SELECT 1 FROM paid_clicks WHERE bounty_id = ? AND withdrawn = 0 LIMIT 1`).bind(row.id, row.id).first();
    const decision = decide({
      amount: row.amount, poster: row.poster, landed, on_at: row.on_at,
      card: { payment_method: row.payment_method, customer: row.customer_id, limit: row.limit_per_bounty },
      solver: solver === null ? null : { account_id: solver.account_id, ready: solver.ready === 1 },
      recorded: events !== null, row: held
    }, now);
    // Looked at, and its turn passes: one bounty that cannot move must not hold up the others.
    if (decision.act === 'nothing') { await db.prepare(`INSERT INTO charges (bounty_id, state, at) VALUES (?, 'looked', ?) ON CONFLICT (bounty_id) DO UPDATE SET at = excluded.at`).bind(row.id, now).run(); continue; }
    if (decision.act === 'settle') { await saveCharge(env, row.id, decision.state, decision.pull, null, null, null, row.amount, now); continue; }
    // The claim first: whoever gets the row is the only one who calls Stripe.
    const claim = await db.prepare(`INSERT INTO charges (bounty_id, state, pull_number, solver, account_id, amount, payment_method, at) VALUES (?, 'charging', ?, ?, ?, ?, ?, ?)
      ON CONFLICT (bounty_id) DO UPDATE SET state = 'charging', pull_number = excluded.pull_number, solver = excluded.solver, account_id = excluded.account_id, amount = excluded.amount, payment_method = excluded.payment_method, at = excluded.at
      WHERE charges.at = ? RETURNING bounty_id`).bind(row.id, decision.pull.number, decision.pull.author, decision.account, row.amount, decision.card.payment_method, now, held?.at ?? -1).first();
    if (claim === null) continue;
    try {
      const result = await attempt(env, row.id, row.amount, decision);
      await saveCharge(env, row.id, result.state, decision.pull, decision.account, decision.card.payment_method, result.payment_intent, row.amount, now);
    } catch (error) {
      if (!(error instanceof StripeUnavailable)) throw error; // Stays `charging`: the next look finds what happened, under the same key.
    }
  }
  return due.length;
}

async function saveCharge(env: Env, id: string, state: ChargeState, pull: Merged | null, account: string | null, card: string | null, intent: string | null, amount: number, now: number): Promise<void> {
  await env.DB.prepare(`INSERT INTO charges (bounty_id, state, pull_number, solver, account_id, amount, payment_method, payment_intent, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (bounty_id) DO UPDATE SET state = excluded.state, pull_number = excluded.pull_number, solver = excluded.solver, account_id = excluded.account_id, amount = excluded.amount, payment_method = excluded.payment_method, payment_intent = excluded.payment_intent, at = excluded.at`)
    .bind(id, state, pull?.number ?? null, pull?.author ?? null, account, amount, card, intent, now).run();
}

// ---- what Stripe tells the board ---------------------------------------------

type Event = { type?: unknown; account?: unknown; data?: { object?: Record<string, unknown> } };

/** A signed event. Only the row whose account and payment both match changes, so a stray event moves nothing. */
export async function applyEvent(env: Env, event: Event, now: number): Promise<void> {
  const db = env.DB;
  const account = typeof event.account === 'string' ? event.account : null;
  const object = event.data?.object ?? {};
  if (account === null) return;
  if (event.type === 'account.updated') {
    await db.prepare('UPDATE stripe_accounts SET ready = ? WHERE account_id = ?').bind(object['charges_enabled'] === true ? 1 : 0, account).run();
    return;
  }
  if (event.type === 'account.application.deauthorized') {
    await db.prepare('DELETE FROM stripe_accounts WHERE account_id = ?').bind(account).run();
    return;
  }
  // The id must be the one this board recorded: a solver can send Stripe's events about payments of their own.
  const intent = event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed' ? object['id'] : object['payment_intent'];
  if (typeof intent !== 'string') return;
  const state: ChargeState | null = event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed' ? 'paid'
    : event.type === 'charge.refunded' ? (object['refunded'] === true ? 'refunded' : null)
    : event.type === 'charge.dispute.created' ? 'disputed' : null;
  if (state === null) return;
  await db.prepare('UPDATE charges SET state = ?, at = ? WHERE payment_intent = ? AND account_id = ?').bind(state, now, intent, account).run();
}

/**
 * The owner finishing a card that asked to authenticate. The stopped payment is cancelled, then Stripe's own
 * page takes the same amount to the same account. The session id is what the completed event must name.
 */
export async function authenticationPage(env: Env, id: string, origin: string, now: number): Promise<{ url: string } | { error: string }> {
  const row = await env.DB.prepare('SELECT account_id, amount, payment_intent, pull_number FROM charges WHERE bounty_id = ? AND state = ?').bind(id, 'owner-must-authenticate').first<{ account_id: string; amount: number; payment_intent: string | null; pull_number: number }>();
  if (row === null) return { error: 'Nothing here is waiting for authentication. Nothing changed.' };
  const on = { account: row.account_id };
  if (row.payment_intent?.startsWith('pi_') === true) await stripe(env, 'POST', `/v1/payment_intents/${row.payment_intent}/cancel`, {}, on);
  const session = await stripe(env, 'POST', '/v1/checkout/sessions', {
    mode: 'payment', success_url: `${origin}/b/${id}/`, cancel_url: `${origin}/b/${id}/`,
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': String(row.amount * 100), 'line_items[0][price_data][product_data][name]': `Bounty ${id}`,
    'payment_intent_data[metadata][bounty]': id, 'payment_intent_data[metadata][pull_request]': String(row.pull_number)
  }, { ...on, idempotency: `pf11/${id}/authenticate/${Math.floor(now / 3600000)}` });
  if (session.status !== 200 || typeof session.json['url'] !== 'string' || typeof session.json['id'] !== 'string') return { error: `${errorWords(session)} Nothing was charged.` };
  await env.DB.prepare('UPDATE charges SET payment_intent = ?, at = ? WHERE bounty_id = ?').bind(session.json['id'], now, id).run();
  return { url: session.json['url'] };
}

/** Which of these bounties pay on merge right now: the poster's own switch, a saved card, and a reward within the limit. */
export async function payingIds(env: Env, ids: readonly string[]): Promise<ReadonlySet<string>> {
  if (!stripeOn(env) || ids.length === 0) return new Set();
  const { results } = await env.DB.prepare(`SELECT b.id FROM bounties b
    JOIN pay_repositories r ON r.github_id = b.poster_id AND r.repository = b.repository
    JOIN pay_settings s ON s.github_id = b.poster_id
    WHERE b.id IN (SELECT value FROM json_each(?)) AND b.amount > 0 AND s.payment_method IS NOT NULL AND b.amount <= s.limit_per_bounty`).bind(JSON.stringify(ids)).all<{ id: string }>();
  return new Set(results.map(row => row.id));
}

/** One bounty's charge, for its facts. `looked` is the board's own bookkeeping and says nothing. */
export const chargeOf = async (env: Env, id: string): Promise<{ state: Exclude<ChargeState, 'looked'>; at: number; amount: number | null; solver: string | null } | null> =>
  env.DB.prepare(`SELECT state, at, amount, solver FROM charges WHERE bounty_id = ? AND state != 'looked'`).bind(id).first();
