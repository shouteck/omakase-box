// What a bounty's payment facts are, and what they add up to (PLATFORM-UX section 5).
// Every rule is here, computed on read, so no count outlives a click, a refresh or a
// purge. Each fact says whose word it is; none of this says who is right.
import { CHARGE_WORDS, PAYPAL_WORDS } from './charge-words.js';
import type { Db } from './store.js';
import { currentReceipt, type PaidEvent, payeeOf, type PaymentFacts, type Receipt, same, standingRecord } from './visibility.js';

const DAY = 86400000;
const LATE_DAYS = 14; // What is shown first, and one filter value. Never a deadline.
const LISTED_WITH_ACCESS: readonly string[] = ['OWNER', 'MEMBER', 'COLLABORATOR'];

export type MergedPull = { number: number; author: string; merged_at: string; association: string | null; on_default: number | null };
export type Paid = PaidEvent & { by: string; source: 'project-record' | 'board' | 'stripe' | 'paypal' };
/** What a provider did (charge.ts, paypal-pay.ts). Its own fact: the provider's word, not the owner's. */
export type ChargeFact = { state: string; at: string; solver: string | null; provider?: string | null };
export type BountyPayment = {
  id: string; title: string; repository: string; amount: number; poster: string;
  pulls: readonly MergedPull[];
  chain: readonly PaidEvent[];
  click: (PaidEvent & { by: string }) | null;
  receipt: (Receipt & { payee: string }) | null;
  charge?: ChargeFact | null;
};

/** The standing word, or null. A charge a provider made outranks anyone's word; a record that names no merged author, or none where several merged, settles nothing. */
function standing(input: BountyPayment, landed: readonly MergedPull[]): Paid | null {
  const charged = input.charge;
  if (charged?.state === 'paid' && landed.some(pull => same(pull.author, charged.solver))) return { at: charged.at, amount: input.amount, withdrawn: 0, to: charged.solver, ...(charged.provider === 'paypal' ? { by: 'PayPal', source: 'paypal' as const } : { by: 'Stripe', source: 'stripe' as const }) };
  const clicked = input.click === null ? [] : [input.click];
  const latest = standingRecord([...input.chain, ...clicked]);
  if (latest === null || landed.length === 0) return null;
  if (latest.to != null ? !landed.some(pull => same(pull.author, latest.to!)) : landed.length !== 1) return null;
  const fromClick = input.click !== null && latest.at === input.click.at && latest.to === input.click.to;
  return { ...latest, by: fromClick ? input.click!.by : input.poster, source: fromClick ? 'board' : 'project-record' };
}

/** GitHub's two facts: merged, and its head on the default branch. Only those can be owed. */
export const landedOf = (input: Pick<BountyPayment, 'pulls'>): MergedPull[] => input.pulls.filter(pull => pull.on_default === 1);

export function factsOf(input: BountyPayment): PaymentFacts {
  const landed = landedOf(input);
  const record = standing(input, landed);
  return { amount: input.amount, poster: input.poster, merged: landed.map(({ number, author }) => ({ number, author })), record, receipt: currentReceipt(record, input.receipt) };
}

export type NotCounted = { solver: string; because: string };

/** The self-dealing rule, for one merged pull request. An association GitHub did not state errs towards not counting. */
export function notCounted(pull: Pick<MergedPull, 'author' | 'association'>, poster: string): NotCounted | null {
  if (same(pull.author, poster)) return { solver: pull.author, because: 'the solver is the poster' };
  if (pull.association === null) return { solver: pull.author, because: 'GitHub did not say how they relate to the repository' };
  return LISTED_WITH_ACCESS.includes(pull.association) ? { solver: pull.author, because: `GitHub lists them as ${pull.association.toLowerCase()} of the repository` } : null;
}

const AUTHORS_SHOWN = 10; // A detail has a stated size; solution_list and the issue have the rest.
const shownOf = <T>(list: readonly T[]): readonly T[] => list.slice(0, AUTHORS_SHOWN);

export type PaymentState ='no-reward' | 'nothing-owed' | 'merged-not-on-default' | 'owed' | 'owner-decides' | 'recorded' | 'confirmed' | 'says-not-received';

export function paymentOf(input: BountyPayment) {
  const facts = factsOf(input);
  const landed = landedOf(input);
  const viaPayPal = input.charge?.provider === 'paypal';
  const charge = input.charge == null ? null : { state: input.charge.state, at: input.charge.at, words: (viaPayPal ? PAYPAL_WORDS[input.charge.state as keyof typeof CHARGE_WORDS] : undefined) ?? CHARGE_WORDS[input.charge.state as keyof typeof CHARGE_WORDS] ?? null, whose_word: viaPayPal ? 'the board\'s, from PayPal\'s answer' as const : 'the board\'s, from Stripe\'s answer' as const };
  const none = { owed: null, recorded_paid: null, solver_says: null, excluded_from_counts: null, charge };
  if (input.amount === 0) return { state: 'no-reward' as PaymentState, ...none, note: 'No reward is stated, so nothing is owed.' };
  if (landed.length === 0) {
    const waiting = input.pulls[0];
    if (waiting === undefined) return { state: 'nothing-owed' as PaymentState, ...none, note: `Nothing is owed. When a solution is merged, its author is owed $${input.amount} by the owner, paid directly.` };
    return { state: 'merged-not-on-default' as PaymentState, ...none, note: `GitHub records pull request #${waiting.number} as merged, and the board has not confirmed its head on the default branch. Nothing is owed yet.` };
  }
  const payee = payeeOf(facts);
  const paidPull = payee === null ? undefined : landed.find(pull => same(pull.author, payee));
  const since = (paidPull ?? landed.reduce((first, pull) => pull.merged_at < first.merged_at ? pull : first)).merged_at;
  const fact = paidPull === undefined ? `pull requests ${shownOf(landed).map(pull => `#${pull.number}`).join(' and ')}${landed.length > AUTHORS_SHOWN ? ` and ${landed.length - AUTHORS_SHOWN} more` : ''} merged` : `pull request #${paidPull.number} merged`;
  const owed = { to: payee, ...(payee === null ? { to_one_of: shownOf(landed).map(pull => pull.author) } : {}), amount: input.amount, since, fact, source: 'github' as const };
  const reasons = (paidPull === undefined ? landed : [paidPull]).map(pull => notCounted(pull, input.poster));
  const excluded = reasons.every(reason => reason !== null) ? reasons[0]! : null;
  const record = facts.record as Paid | null;
  const receipt = facts.receipt as (Receipt & { payee: string }) | null;
  const state: PaymentState = record === null ? (payee === null ? 'owner-decides' : 'owed') : receipt === null ? 'recorded' : receipt.says === 'received' ? 'confirmed' : 'says-not-received';
  return {
    state, owed, charge,
    recorded_paid: record === null ? null : {
      by: record.by, at: record.at, amount: record.amount, whose_word: record.source === 'stripe' ? 'Stripe\'s' as const : record.source === 'paypal' ? 'PayPal\'s' as const : 'the owner\'s' as const, source: record.source,
      ...(landed.length > 1 ? { chosen_by_owner_from: shownOf(landed).map(pull => pull.author) } : {})
    },
    solver_says: receipt === null ? null : { by: receipt.payee, at: receipt.at, word: receipt.says, whose_word: 'the solver\'s' as const, source: 'board' as const },
    excluded_from_counts: excluded
  };
}
export type Payment = ReturnType<typeof paymentOf>;

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return Math.round(sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2);
};
const daysBetween = (from: string, to: number): number => Math.max(0, Math.floor((to - Date.parse(from)) / DAY));

export type OwnerRecord = { has_history: boolean; merged: number; recorded_paid: number; confirmed_received: number; from_solvers: number; owed_now: number; oldest_owed_days: number; says_not_received: number; median_days_to_record_paid: number | null };

/** One owner's counts, from their bounties. Always this shape; a merge not counted is in none of them. */
export function ownerRecord(inputs: readonly BountyPayment[], now: number): OwnerRecord {
  const counted = inputs.map(paymentOf).filter(payment => payment.owed !== null && payment.excluded_from_counts === null);
  const inState = (...states: PaymentState[]) => counted.filter(payment => states.includes(payment.state));
  const recorded = inState('recorded', 'confirmed', 'says-not-received');
  const owing = inState('owed', 'owner-decides');
  const confirmed = inState('confirmed');
  return {
    has_history: counted.length > 0,
    merged: counted.length,
    recorded_paid: recorded.length,
    confirmed_received: confirmed.length,
    from_solvers: new Set(confirmed.map(payment => payment.solver_says!.by.toLowerCase())).size,
    owed_now: owing.length,
    oldest_owed_days: owing.reduce((oldest, payment) => Math.max(oldest, daysBetween(payment.owed!.since, now)), 0),
    says_not_received: inState('says-not-received').length,
    median_days_to_record_paid: median(recorded.map(payment => daysBetween(payment.owed!.since, Date.parse(payment.recorded_paid!.at))))
  };
}

export const notCountedOf = (inputs: readonly BountyPayment[]): NotCounted[] =>
  inputs.map(paymentOf).flatMap(payment => payment.owed !== null && payment.excluded_from_counts !== null ? [payment.excluded_from_counts] : []);

/** One solver's counts: merges GitHub records with their head on the default branch, and payments they confirmed. */
export function solverRecord(login: string, inputs: readonly BountyPayment[]) {
  let merged = 0;
  let confirmed = 0;
  for (const input of inputs) {
    const mine = landedOf(input).find(pull => same(pull.author, login));
    if (mine === undefined || notCounted(mine, input.poster) !== null) continue;
    merged += 1;
    const payment = paymentOf(input);
    if (payment.state === 'confirmed' && same(payment.owed!.to, login)) confirmed += 1;
  }
  return { has_history: merged > 0, merged, confirmed_received: confirmed };
}

export const OWNER_RECORD_FILTERS: Record<string, (record: OwnerRecord) => boolean> = {
  'confirmed-payments': record => record.confirmed_received > 0,
  'confirmed-none-late': record => record.confirmed_received > 0 && record.says_not_received === 0 && record.oldest_owed_days <= LATE_DAYS,
  'no-history': record => !record.has_history
};

/** Every bounty matching `where` that has a merge, whole. `where` is SQL over `b`; only this file's callers write it. */
export async function loadPayments(db: Db, where: string, ...values: readonly (string | number)[]): Promise<BountyPayment[]> {
  const scope = `FROM bounties b WHERE ${where} AND EXISTS (SELECT 1 FROM pull_requests m WHERE m.bounty_id = b.id AND m.state = 'merged')`;
  const rows = (await db.prepare(`SELECT b.id, b.title, b.repository, b.amount, b.poster ${scope}`).bind(...values).all<Pick<BountyPayment, 'id' | 'title' | 'repository' | 'amount' | 'poster'>>()).results;
  if (rows.length === 0) return [];
  const within = `bounty_id IN (SELECT b.id ${scope})`;
  const pulls = (await db.prepare(`SELECT bounty_id, number, author, merged_at, association, on_default FROM pull_requests WHERE state = 'merged' AND ${within} ORDER BY number`).bind(...values).all<MergedPull & { bounty_id: string }>()).results;
  const chain = (await db.prepare(`SELECT bounty_id, at, amount, withdrawn FROM events WHERE type = 'paid' AND ${within}`).bind(...values).all<PaidEvent & { bounty_id: string }>()).results;
  const clicks = (await db.prepare(`SELECT bounty_id, by_login AS by, to_login AS "to", at, amount, withdrawn FROM paid_clicks WHERE ${within}`).bind(...values).all<PaidEvent & { bounty_id: string; by: string }>()).results;
  const receipts = (await db.prepare(`SELECT bounty_id, payee, says, record_at, at FROM receipts WHERE ${within}`).bind(...values).all<Receipt & { bounty_id: string; payee: string }>()).results;
  const charges = (await db.prepare(`SELECT bounty_id, state, at, solver, provider FROM charges WHERE state != 'looked' AND ${within}`).bind(...values).all<{ bounty_id: string; state: string; at: number; solver: string | null; provider: string | null }>()).results;
  return rows.map(row => ({
    charge: ((found = charges.find(entry => entry.bounty_id === row.id)) => found === undefined ? null : { state: found.state, at: new Date(found.at).toISOString(), solver: found.solver, provider: found.provider })(),
    ...row,
    pulls: pulls.filter(pull => pull.bounty_id === row.id),
    chain: chain.filter(event => event.bounty_id === row.id),
    click: clicks.find(click => click.bounty_id === row.id) ?? null,
    receipt: receipts.find(receipt => receipt.bounty_id === row.id) ?? null
  }));
}

/** A bounty with no merge has nothing to load, and still has a payment answer. */
export const emptyPayment = (row: Pick<BountyPayment, 'id' | 'title' | 'repository' | 'amount' | 'poster'>): BountyPayment => ({ id: row.id, title: row.title, repository: row.repository, amount: row.amount, poster: row.poster, pulls: [], chain: [], click: null, receipt: null });

/** Each named owner's counts, keyed in lower case. An owner with no merges has the same shape, zeros and no history. */
export async function ownerRecords(db: Db, logins: readonly string[], now: number): Promise<Map<string, OwnerRecord>> {
  const lower = [...new Set(logins.map(login => login.toLowerCase()))];
  const all = await loadPayments(db, 'LOWER(b.poster) IN (SELECT value FROM json_each(?))', JSON.stringify(lower));
  return new Map(lower.map(login => [login, ownerRecord(all.filter(input => input.poster.toLowerCase() === login), now)]));
}

/** The lower-case logins of owners with a counted merge meeting this filter; `no-history` is everyone but those with history. */
export async function ownersMatching(db: Db, filter: string, now: number): Promise<{ logins: string[]; negate: boolean }> {
  const all = await loadPayments(db, '1 = 1');
  const posters = [...new Set(all.map(input => input.poster.toLowerCase()))];
  const records = posters.map(login => [login, ownerRecord(all.filter(input => input.poster.toLowerCase() === login), now)] as const);
  if (filter === 'no-history') return { logins: records.filter(([, record]) => record.has_history).map(([login]) => login), negate: true };
  const test = OWNER_RECORD_FILTERS[filter]!;
  return { logins: records.filter(([, record]) => test(record)).map(([login]) => login), negate: false };
}
