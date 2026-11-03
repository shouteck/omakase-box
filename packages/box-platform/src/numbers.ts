// PF29: the board as a whole, in numbers. Computed from what the board already stores, with no GitHub read, so an
// agent comparing channels compares facts. Every number carries its base; zeros are zeros; nothing is a rate without
// its counts, and nothing is a judgement.
//
// What earns a place here (owner, 4 November 2026): a number goes in only if it would change an earning agent's
// decision to check this board or to take a bounty here, and only if the board already stores what it needs.
import { payingIds } from './charge.js';
import type { Env } from './github.js';
import { LISTED_WITH_ACCESS, loadPayments, paymentOf } from './payments.js';
import { DAY, freshness, OPEN_WHERE } from './query.js';

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
};

/** Pull requests by others: the owner record's own rule, as the per-owner merge odds use it. */
const BY_OTHERS = `p.author != b.poster COLLATE NOCASE AND p.association IS NOT NULL AND p.association NOT IN (${LISTED_WITH_ACCESS.map(() => '?').join(', ')})`;
const RECENT_DAYS = 30;

export const NUMBERS_ABOUT = 'The board as a whole, from what it has read from GitHub and what owners and solvers recorded on it. Each number says what it counts. Facts, not a rating of anyone.';

export async function numbersOf(env: Env) {
  const db = env.DB;
  const now = env.now?.() ?? Date.now();
  const recent = new Date(now - RECENT_DAYS * DAY).toISOString();
  const count = async (sql: string, ...values: (string | number)[]) => (await db.prepare(sql).bind(...values).first<{ n: number | null }>())?.n ?? 0;
  const OPEN = OPEN_WHERE.join(' AND ');
  const listed = await count('SELECT COUNT(*) AS n FROM bounties b');
  const open = await count(`SELECT COUNT(*) AS n FROM bounties b WHERE ${OPEN}`);
  const rewarded = (await db.prepare(`SELECT b.id, b.amount, (SELECT COUNT(*) FROM pull_requests p WHERE p.bounty_id = b.id AND p.state = 'open') AS attempts FROM bounties b WHERE ${OPEN} AND b.amount > 0`).all<{ id: string; amount: number; attempts: number }>()).results;
  const paying = await payingIds(env, rewarded.map(row => row.id));
  const pulls = (await db.prepare(`SELECT SUM(p.state = 'merged') AS merged, SUM(p.state = 'closed') AS closed, SUM(p.state = 'open') AS open, COUNT(DISTINCT LOWER(p.author)) AS solvers
    FROM pull_requests p JOIN bounties b ON b.id = p.bounty_id WHERE ${BY_OTHERS}`).bind(...LISTED_WITH_ACCESS).first<{ merged: number | null; closed: number | null; open: number | null; solvers: number }>())!;
  const perBounty = (await db.prepare('SELECT COUNT(*) AS n FROM pull_requests GROUP BY bounty_id').all<{ n: number }>()).results.map(row => row.n);
  const decided = (await db.prepare(`SELECT MIN(p.opened_at) AS first, COALESCE(MIN(p.merged_at), b.closed_at) AS at FROM bounties b JOIN pull_requests p ON p.bounty_id = b.id GROUP BY b.id HAVING at IS NOT NULL`).all<{ first: string; at: string }>()).results
    .map(row => Math.max(0, Math.floor((Date.parse(row.at) - Date.parse(row.first)) / DAY))).filter(Number.isFinite);
  // Does the money arrive: merged, rewarded bounties counted by the owner record's rule (a self-dealt merge is not one).
  const counted = (await loadPayments(db, '1 = 1')).map(input => ({ amount: input.amount, payment: paymentOf(input) })).filter(({ payment }) => payment.owed !== null && payment.excluded_from_counts === null);
  const inState = (...states: string[]) => counted.filter(({ payment }) => states.includes(payment.state));
  const owing = inState('owed', 'owner-decides');
  const postedRecently = await count('SELECT COUNT(*) AS n FROM bounties b WHERE b.created_at >= ?', recent);
  const mergedRecently = await count(`SELECT COUNT(*) AS n FROM pull_requests p JOIN bounties b ON b.id = p.bounty_id WHERE p.state = 'merged' AND p.merged_at >= ? AND ${BY_OTHERS}`, recent, ...LISTED_WITH_ACCESS);
  const { sample, ...fresh } = await freshness(env);
  return {
    board: 'Open bounty board', about: NUMBERS_ABOUT, schema: '/numbers.schema.json', ...fresh, ...(sample ? { sample_data: true as const } : {}),
    bounties: { listed, open, open_with_reward: rewarded.length, base: 'bounties on public repositories the board lists now; a bounty whose repository went private is not counted' },
    rewards: {
      stated_on_open_bounties_usd: rewarded.reduce((sum, row) => sum + row.amount, 0),
      pays_on_merge: { bounties: paying.size, usd: rewarded.filter(row => paying.has(row.id)).reduce((sum, row) => sum + row.amount, 0) },
      no_attempt_yet: { bounties: rewarded.filter(row => row.attempts === 0).length, usd: rewarded.filter(row => row.attempts === 0).reduce((sum, row) => sum + row.amount, 0) },
      base: 'open bounties with a reward above $0. pays_on_merge: the owner turned it on and approved this reward, with a saved card. no_attempt_yet: no open pull request'
    },
    payments: {
      merged_with_reward: counted.length,
      recorded_paid: inState('recorded', 'confirmed', 'says-not-received').length,
      confirmed_received: inState('confirmed').length,
      says_not_received: inState('says-not-received').length,
      owed_now: { bounties: owing.length, usd: owing.reduce((sum, { amount }) => sum + amount, 0), oldest_days: owing.reduce((oldest, { payment }) => Math.max(oldest, Math.max(0, Math.floor((now - Date.parse(payment.owed!.since)) / DAY))), 0) },
      base: 'rewarded bounties with a merged solution on the default branch, by others (not the poster, an owner, member or collaborator). recorded_paid: the owner\'s word, or the provider\'s for a payment through the board; confirmed_received and says_not_received: the solver\'s word'
    },
    last_30_days: { posted: postedRecently, merged: mergedRecently, base: `bounties posted, and pull requests by others merged, since ${recent.slice(0, 10)}` },
    pull_requests: { merged: pulls.merged ?? 0, closed: pulls.closed ?? 0, open: pulls.open ?? 0, base: 'by others: not the poster, and not an owner, member or collaborator of the repository' },
    attempts_per_bounty: { median: median(perBounty), bounties: perBounty.length, base: 'pull requests per bounty, over bounties with at least one' },
    solvers: { distinct: pulls.solvers, base: 'GitHub accounts with a pull request by others, as above' },
    days_to_decision: { median: median(decided), bounties: decided.length, base: 'whole days from a bounty\'s first pull request to its first merge or its close' }
  };
}
export type Numbers = Awaited<ReturnType<typeof numbersOf>>;
