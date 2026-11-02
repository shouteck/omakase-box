// Pay on merge (PF11): whether a merge starts a charge, and what happened. decide()
// is the whole rule and calls nothing. The board never holds money: a direct charge
// goes from the owner's saved card to the solver's own Stripe account. The limit and
// the payee are enforced here and nowhere else; Stripe would accept any (K46).
import { CHARGE_WORDS, type ChargeState } from './charge-words.js';
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
  if (row?.state === 'owner-must-authenticate' || row?.state === 'owner-paying') return { act: 'nothing' }; // Never again off-session: the owner finishes it or it stands.
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

/** Whether this account can be charged now, and a payment already on it answers first, so a lost key cannot charge twice. Null: nothing stands in the way. */
async function lookFirst(env: Env, bounty: string, account: string): Promise<Attempt | null> {
  const about = await stripe(env, 'GET', `/v1/accounts/${account}`);
  if (about.status === 401 || about.status === 403 || about.status === 404) return { state: 'solver-disconnected', payment_intent: null };
  if (about.json['charges_enabled'] !== true) return { state: 'solver-not-ready', payment_intent: null };
  const found = await stripe(env, 'GET', `/v1/payment_intents/search?query=${encodeURIComponent(`metadata['bounty']:'${bounty}' AND status:'succeeded'`)}&limit=20`, undefined, { account });
  if (found.status === 401 || found.status === 403) return { state: 'solver-disconnected', payment_intent: null };
  // Only a payment this platform made counts: a solver can put any metadata on a payment of their own.
  const existing = Array.isArray(found.json['data']) ? (found.json['data'] as { id?: string; application?: unknown }[]).find(entry => typeof entry.application === 'string') : undefined;
  return existing?.id === undefined ? null : { state: 'paid', payment_intent: existing.id };
}

/** The calls, once decide() said to charge. */
async function attempt(env: Env, bounty: string, amount: number, decision: Extract<Decision, { act: 'charge' }>): Promise<Attempt> {
  const { account, card, pull } = decision;
  const on = { account };
  const first = await lookFirst(env, bounty, account);
  if (first !== null) return first;
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
const DUE = `SELECT b.id, b.amount, b.poster, b.poster_id, r.on_at, s.customer_id, s.payment_method, COALESCE(r.limit_per_bounty, s.limit_per_bounty) AS limit_per_bounty
  FROM bounties b
  JOIN pay_repositories r ON r.github_id = b.poster_id AND r.repository = b.repository
  JOIN pay_settings s ON s.github_id = b.poster_id
  LEFT JOIN charges c ON c.bounty_id = b.id
  WHERE b.amount > 0 AND s.payment_method IS NOT NULL AND COALESCE(r.limit_per_bounty, s.limit_per_bounty) IS NOT NULL
    AND EXISTS (SELECT 1 FROM pull_requests p WHERE p.bounty_id = b.id AND p.state = 'merged' AND p.on_default = 1)
    AND (c.state IS NULL OR c.state NOT IN ('paid', 'refunded', 'disputed', 'owner-must-authenticate', 'owner-paying'))
    AND (c.at IS NULL OR c.at <= ?)
  ORDER BY c.at IS NOT NULL, c.at, b.id LIMIT ?`;
type DueRow = { id: string; amount: number; poster: string; poster_id: number; on_at: string; customer_id: string; payment_method: string; limit_per_bounty: number };

const LOOK_AGAIN_MS = 300000; // A state that may change is looked at this often, never faster.

/** Who can be paid here, by GitHub's facts and the account tied to the merged author's id. Shared by the machine and the owner's click. */
export async function payeeFacts(env: Env, id: string): Promise<Pick<ChargeFacts, 'landed' | 'solver' | 'recorded'>> {
  const db = env.DB;
  const landed = (await db.prepare(`SELECT number, author, author_id, merged_at, association, on_default FROM pull_requests WHERE bounty_id = ? AND state = 'merged' AND on_default = 1 ORDER BY number`).bind(id).all<Merged>()).results;
  const authorId = landed.length === 1 ? landed[0]!.author_id : null;
  const solver = authorId === null ? null : await db.prepare('SELECT account_id, ready FROM stripe_accounts WHERE github_id = ?').bind(authorId).first<{ account_id: string; ready: number }>();
  const events = await db.prepare(`SELECT 1 FROM events WHERE bounty_id = ? AND type = 'paid' AND withdrawn = 0 UNION SELECT 1 FROM paid_clicks WHERE bounty_id = ? AND withdrawn = 0 LIMIT 1`).bind(id, id).first();
  return { landed, solver: solver === null ? null : { account_id: solver.account_id, ready: solver.ready === 1 }, recorded: events !== null };
}

/** The switch is on, a merge landed: start what is due. Returns how many were looked at. */
export async function settleCharges(env: Env): Promise<number> {
  if (!stripeOn(env)) return 0;
  const db = env.DB;
  const now = env.now?.() ?? Date.now();
  const due = (await db.prepare(DUE).bind(now - LOOK_AGAIN_MS, CHARGES_PER_RUN).all<DueRow>()).results;
  for (const row of due) {
    const { landed, solver, recorded } = await payeeFacts(env, row.id);
    const held = await db.prepare('SELECT state, payment_method, at FROM charges WHERE bounty_id = ?').bind(row.id).first<ChargeRow>();
    const decision = decide({
      amount: row.amount, poster: row.poster, landed, on_at: row.on_at,
      card: { payment_method: row.payment_method, customer: row.customer_id, limit: row.limit_per_bounty },
      solver, recorded, row: held
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
    ON CONFLICT (bounty_id) DO UPDATE SET state = excluded.state, pull_number = excluded.pull_number, solver = excluded.solver, account_id = excluded.account_id, amount = excluded.amount, payment_method = excluded.payment_method, payment_intent = excluded.payment_intent, at = excluded.at, provider = NULL`)
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
  if (event.type === 'checkout.session.completed') {
    // From here on the row holds the payment's id, because a refund or a dispute names the payment and not the session.
    if (object['payment_status'] !== 'paid' || typeof object['id'] !== 'string' || typeof object['payment_intent'] !== 'string') return;
    await db.prepare('UPDATE charges SET state = ?, payment_intent = ?, at = ? WHERE payment_intent = ? AND account_id = ?').bind('paid', object['payment_intent'], now, object['id'], account).run();
    return;
  }
  if (event.type === 'payment_intent.succeeded') {
    if (typeof object['id'] !== 'string') return;
    // An event can come twice: a repeat must not undo a refund or a dispute.
    await db.prepare(`UPDATE charges SET state = 'paid', at = ? WHERE payment_intent = ? AND account_id = ? AND state NOT IN ('refunded', 'disputed')`).bind(now, object['id'], account).run();
    return;
  }
  const intent = object['payment_intent'];
  if (typeof intent !== 'string') return;
  const state: ChargeState | null = event.type === 'charge.refunded' ? (object['refunded'] === true ? 'refunded' : null)
    : event.type === 'charge.dispute.created' ? 'disputed' : null;
  if (state === null) return;
  await db.prepare('UPDATE charges SET state = ?, at = ? WHERE payment_intent = ? AND account_id = ?').bind(state, now, intent, account).run();
}

/**
 * What every page on Stripe for this bounty carries. Cards only: a method that settles later would complete unpaid.
 * The stated reward's currency: left on, Stripe's page offered S$59.82 under a button saying $45 (PF13).
 */
const checkoutForm = (id: string, amount: number, pull: number, origin: string): Record<string, string> => ({
  mode: 'payment', success_url: `${origin}/b/${id}/`, cancel_url: `${origin}/b/${id}/`, 'payment_method_types[0]': 'card', 'adaptive_pricing[enabled]': 'false',
  'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': String(amount * 100), 'line_items[0][price_data][product_data][name]': `Bounty ${id}`,
  'payment_intent_data[metadata][bounty]': id, 'payment_intent_data[metadata][pull_request]': String(pull)
});

/**
 * The owner finishing a card that asked to authenticate. The stopped payment is cancelled, then Stripe's own
 * page takes the same amount to the same account. The session id is what the completed event must name.
 */
export async function authenticationPage(env: Env, id: string, origin: string, now: number): Promise<{ url: string } | { error: string }> {
  const row = await env.DB.prepare('SELECT account_id, amount, payment_intent, pull_number FROM charges WHERE bounty_id = ? AND state = ?').bind(id, 'owner-must-authenticate').first<{ account_id: string; amount: number; payment_intent: string | null; pull_number: number }>();
  if (row === null) return { error: 'Nothing here is waiting for authentication. Nothing changed.' };
  const on = { account: row.account_id };
  if (row.payment_intent?.startsWith('pi_') === true) await stripe(env, 'POST', `/v1/payment_intents/${row.payment_intent}/cancel`, {}, on);
  const session = await stripe(env, 'POST', '/v1/checkout/sessions', checkoutForm(id, row.amount, row.pull_number, origin), { ...on, idempotency: `pf11/${id}/authenticate/${Math.floor(now / 3600000)}` });
  if (session.status !== 200 || typeof session.json['url'] !== 'string' || typeof session.json['id'] !== 'string') return { error: `${errorWords(session)} Nothing was charged.` };
  await env.DB.prepare('UPDATE charges SET payment_intent = ?, at = ? WHERE bounty_id = ?').bind(session.json['id'], now, id).run();
  return { url: session.json['url'] };
}

// ---- the owner's own click (PF13) ---------------------------------------------

export type PayFacts = Pick<ChargeFacts, 'amount' | 'poster' | 'landed' | 'solver' | 'recorded'> & { state: ChargeState | null; provider?: 'Stripe' | 'PayPal' };
export type PayDecision =
  | { act: 'open'; pull: Merged; account: string }
  /** `shown`: a fact the owner's page states without being asked. */
  | { act: 'refuse'; words: string; shown: boolean };

/**
 * Whether the poster's click opens the provider's page. The payee rule is pay on merge's. The limit is not here:
 * it guards a charge nobody is watching, and here a person sees the amount on that page. The order is the rule.
 */
export function decidePay(facts: PayFacts): PayDecision {
  const refuse = (words: string, shown = false): PayDecision => ({ act: 'refuse', words, shown });
  const provider = facts.provider ?? 'Stripe';
  if (facts.state !== null && SETTLED.includes(facts.state)) return refuse('A provider already records a payment on this bounty. Nothing was charged.');
  if (facts.recorded) return refuse('A payment is already recorded on this bounty. Nothing was charged. Next: withdraw that record first.');
  if (facts.state === 'owner-must-authenticate') return refuse('This payment is waiting for the card to authenticate. Nothing was charged. Next: finish it on Stripe\'s page from this page.');
  if (facts.state === 'charging') return refuse('A charge has been started and has not finished. Nothing more was charged. Next: reload this page in a few minutes.');
  if (facts.amount <= 0 || facts.landed.length === 0) return refuse('Nothing is owed on this bounty. Nothing was charged.');
  if (facts.landed.length > 1) return refuse('More than one solution landed. Nothing was charged. Next: pay the one you choose by a method they listed.');
  const pull = facts.landed[0]!;
  const excluded = notCounted(pull, facts.poster);
  if (excluded !== null) return refuse(`Not paid from here: ${excluded.because}. Nothing was charged.`);
  if (facts.solver === null) return refuse(`${pull.author} has not connected ${provider}. Nothing was charged. Next: pay by a method they listed.`, true);
  if (!facts.solver.ready) return refuse(`${pull.author} has not finished connecting ${provider}. Nothing was charged. Next: pay by a method they listed.`, true);
  return { act: 'open', pull, account: facts.solver.account_id };
}

const PAGE_MINUTES = 31; // Stripe's shortest life for a page is 30 minutes.
type PayRow = { state: ChargeState; provider: string | null; account_id: string | null; amount: number | null; payment_intent: string | null; at: number };

const payFacts = async (env: Env, id: string): Promise<{ facts: PayFacts; row: PayRow | null; poster_id: number | null } | null> => {
  const bounty = await env.DB.prepare('SELECT amount, poster, poster_id FROM bounties WHERE id = ?').bind(id).first<{ amount: number; poster: string; poster_id: number | null }>();
  if (bounty === null) return null;
  const row = await env.DB.prepare('SELECT state, provider, account_id, amount, payment_intent, at FROM charges WHERE bounty_id = ?').bind(id).first<PayRow>();
  return { facts: { amount: bounty.amount, poster: bounty.poster, ...await payeeFacts(env, id), state: row?.state ?? null }, row, poster_id: bounty.poster_id };
};

/** What the poster's page offers. Calls no one: the click checks with Stripe. */
export async function payOffer(env: Env, id: string, githubId: number): Promise<{ can_pay: boolean; pay_note: string | null }> {
  const found = await payFacts(env, id);
  if (found === null || found.poster_id !== githubId || found.facts.recorded || found.facts.landed.length === 0 || found.facts.amount <= 0) return { can_pay: false, pay_note: null };
  if (!stripeOn(env)) return { can_pay: false, pay_note: 'Paying through Stripe is not set up on this board. The ways to pay on this page still work.' };
  const decision = decidePay(found.facts);
  return { can_pay: decision.act === 'open', pay_note: decision.act === 'refuse' && decision.shown ? decision.words : null };
}

const isPaid = (session: Record<string, unknown>): boolean => session['status'] === 'complete' && session['payment_status'] === 'paid';

/** Stripe's page says it was paid, so the board's row does. The same words as the webhook, for when that one is late. */
async function recordPage(env: Env, id: string, session: Record<string, unknown>, now: number): Promise<void> {
  await env.DB.prepare(`UPDATE charges SET state = 'paid', payment_intent = ?, at = ? WHERE bounty_id = ? AND state = 'owner-paying' AND provider IS NULL`).bind(typeof session['payment_intent'] === 'string' ? session['payment_intent'] : null, now, id).run();
}

/**
 * The claim on a bounty's one live page. Whoever loses it uses the winner's time, so every click at once asks the provider
 * for the same thing under the same key. Null: something else holds it, a charge or the other provider's page.
 */
export async function claimPage(env: Env, id: string, row: { at: number; state: string } | null, pull: Merged, account: string, amount: number, provider: 'paypal' | null, held: string | null, now: number): Promise<{ at: number } | null> {
  const claimed = await env.DB.prepare(`INSERT INTO charges (bounty_id, state, pull_number, solver, account_id, amount, payment_intent, at, provider) VALUES (?, 'owner-paying', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (bounty_id) DO UPDATE SET state = 'owner-paying', pull_number = excluded.pull_number, solver = excluded.solver, account_id = excluded.account_id, amount = excluded.amount, payment_method = NULL, payment_intent = excluded.payment_intent, at = excluded.at, provider = excluded.provider
    WHERE charges.at = ? AND charges.state = ? RETURNING at`).bind(id, pull.number, pull.author, account, amount, held, now, provider, row?.at ?? -1, row?.state ?? '').first<{ at: number }>();
  if (claimed !== null) return claimed;
  const winner = await env.DB.prepare(`SELECT at, provider FROM charges WHERE bounty_id = ? AND state = 'owner-paying'`).bind(id).first<{ at: number; provider: string | null }>();
  return winner !== null && winner.provider === provider ? { at: winner.at } : null;
}

/** Before PayPal's page opens: a Stripe page still open could be paid as well, so it must go first. */
export async function retireStripePage(env: Env, id: string, now: number): Promise<'paid' | 'gone' | 'failed'> {
  const row = await env.DB.prepare(`SELECT account_id, payment_intent FROM charges WHERE bounty_id = ? AND state = 'owner-paying' AND provider IS NULL`).bind(id).first<{ account_id: string; payment_intent: string | null }>();
  if (row === null || row.payment_intent?.startsWith('cs_') !== true) return 'gone';
  const on = { account: row.account_id };
  const read = await stripe(env, 'GET', `/v1/checkout/sessions/${row.payment_intent}`, undefined, on);
  if (read.status === 200 && isPaid(read.json)) { await recordPage(env, id, read.json, now); return 'paid'; }
  if (read.status === 200 && read.json['status'] === 'expired') return 'gone';
  const expired = await stripe(env, 'POST', `/v1/checkout/sessions/${row.payment_intent}/expire`, {}, on);
  return expired.status === 200 ? 'gone' : 'failed';
}

/**
 * The poster's click. One bounty has one live page: a page still open is opened again, and clicks at once share
 * one key, so they share one page. The claim stops the machine charging while a person is on Stripe's page.
 */
export async function openPayPage(env: Env, id: string, origin: string, now: number): Promise<{ url: string } | { paid: true } | { error: string }> {
  const found = await payFacts(env, id);
  if (found === null) return { error: 'This bounty is not on the board. Nothing was charged.' };
  const decision = decidePay(found.facts);
  if (decision.act === 'refuse') return { error: decision.words };
  const { pull, account } = decision;
  const { amount } = found.facts;
  const { row } = found;
  const held = row?.state === 'owner-paying' && row.payment_intent?.startsWith('cs_') === true ? row.payment_intent : null;
  if (held !== null && row!.account_id === account) {
    const read = await stripe(env, 'GET', `/v1/checkout/sessions/${held}`, undefined, { account });
    if (read.status === 200 && isPaid(read.json)) { await recordPage(env, id, read.json, now); return { paid: true }; }
    if (read.status === 200 && read.json['status'] === 'open') {
      if (read.json['amount_total'] === amount * 100 && typeof read.json['url'] === 'string') return { url: read.json['url'] };
      await stripe(env, 'POST', `/v1/checkout/sessions/${held}/expire`, {}, { account }); // The reward changed: the old page must not stay payable.
    }
  }
  const first = await lookFirst(env, id, account);
  if (first?.state === 'paid') {
    await saveCharge(env, id, 'paid', pull, account, null, first.payment_intent, amount, now);
    return { paid: true };
  }
  if (first !== null) return { error: CHARGE_WORDS[first.state as 'solver-disconnected' | 'solver-not-ready'] };
  const now_held = await claimPage(env, id, row, pull, account, amount, null, held, now);
  if (now_held === null) return { error: 'A charge has been started and has not finished. Nothing more was charged. Next: reload this page in a few minutes.' };
  const session = await stripe(env, 'POST', '/v1/checkout/sessions', { ...checkoutForm(id, amount, pull.number, origin), expires_at: String(Math.floor(now_held.at / 1000) + PAGE_MINUTES * 60) }, { account, idempotency: `pf13/${id}/pay/${held ?? 'first'}` });
  if (session.status !== 200 || typeof session.json['url'] !== 'string' || typeof session.json['id'] !== 'string') return { error: `${errorWords(session)} Nothing was charged.` };
  await env.DB.prepare(`UPDATE charges SET payment_intent = ? WHERE bounty_id = ? AND state = 'owner-paying' AND provider IS NULL`).bind(session.json['id'], id).run();
  return { url: session.json['url'] };
}

/** The poster back from Stripe's page, ahead of the webhook. Nothing to do for anyone else. */
export async function readPayPage(env: Env, id: string, githubId: number, now: number): Promise<void> {
  if (!stripeOn(env)) return;
  const row = await env.DB.prepare(`SELECT c.account_id, c.payment_intent FROM charges c JOIN bounties b ON b.id = c.bounty_id WHERE c.bounty_id = ? AND c.state = 'owner-paying' AND c.provider IS NULL AND b.poster_id = ?`).bind(id, githubId).first<{ account_id: string; payment_intent: string | null }>();
  if (row === null || row.payment_intent === null) return;
  const read = await stripe(env, 'GET', `/v1/checkout/sessions/${row.payment_intent}`, undefined, { account: row.account_id });
  if (read.status === 200 && isPaid(read.json)) await recordPage(env, id, read.json, now);
}

/** Which of these bounties pay on merge right now: the poster's own switch, a saved card, and a reward within the limit. */
export async function payingIds(env: Env, ids: readonly string[]): Promise<ReadonlySet<string>> {
  if (!stripeOn(env) || ids.length === 0) return new Set();
  const { results } = await env.DB.prepare(`SELECT b.id FROM bounties b
    JOIN pay_repositories r ON r.github_id = b.poster_id AND r.repository = b.repository
    JOIN pay_settings s ON s.github_id = b.poster_id
    WHERE b.id IN (SELECT value FROM json_each(?)) AND b.amount > 0 AND s.payment_method IS NOT NULL AND b.amount <= COALESCE(r.limit_per_bounty, s.limit_per_bounty)`).bind(JSON.stringify(ids)).all<{ id: string }>();
  return new Set(results.map(row => row.id));
}

/**
 * Whose bounties on one repository pay on merge (PF20): the owner's tool reads it to name the one step only the
 * signed-in page takes. Logins only, as each bounty's pays_on_merge already shows: no card, no amount, no account.
 */
export async function payOnMergeOf(env: Env, repository: string): Promise<{ repository: string; set_up: boolean; on_for: string[] }> {
  if (!stripeOn(env)) return { repository, set_up: false, on_for: [] };
  const { results } = await env.DB.prepare(`SELECT COALESCE(
      (SELECT login FROM sessions WHERE github_id = r.github_id ORDER BY expires_at DESC LIMIT 1),
      (SELECT poster FROM bounties WHERE poster_id = r.github_id ORDER BY created_at DESC LIMIT 1)) AS login
    FROM pay_repositories r JOIN pay_settings s ON s.github_id = r.github_id
    WHERE r.repository = ? AND s.payment_method IS NOT NULL ORDER BY r.on_at LIMIT 10`).bind(repository).all<{ login: string | null }>();
  return { repository, set_up: true, on_for: results.map(row => row.login).filter((login): login is string => login !== null) };
}

/** One bounty's charge, for its facts. `looked` is the board's own bookkeeping and says nothing. */
export const chargeOf = async (env: Env, id: string): Promise<{ state: Exclude<ChargeState, 'looked'>; at: number; amount: number | null; solver: string | null } | null> =>
  env.DB.prepare(`SELECT state, at, amount, solver FROM charges WHERE bounty_id = ? AND state != 'looked'`).bind(id).first();
