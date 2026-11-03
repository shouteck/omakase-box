// PF29: the board as a whole, in numbers. Computed from what the board already stores, with no GitHub read, so an
// agent comparing channels compares facts. Every number carries its base; zeros are zeros; nothing is a rate without
// its counts, and nothing is a judgement.
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

export const NUMBERS_ABOUT = 'The board as a whole, from what it has read from GitHub and what owners and solvers recorded on it. Each number says what it counts. Facts, not a rating of anyone.';

export async function numbersOf(env: Env) {
  const db = env.DB;
  const count = async (sql: string, ...values: (string | number)[]) => (await db.prepare(sql).bind(...values).first<{ n: number | null }>())?.n ?? 0;
  const listed = await count('SELECT COUNT(*) AS n FROM bounties b');
  const open = await count(`SELECT COUNT(*) AS n FROM bounties b WHERE ${OPEN_WHERE.join(' AND ')}`);
  const openRewarded = await count(`SELECT COUNT(*) AS n FROM bounties b WHERE ${OPEN_WHERE.join(' AND ')} AND b.amount > 0`);
  const statedOpen = await count(`SELECT COALESCE(SUM(b.amount), 0) AS n FROM bounties b WHERE ${OPEN_WHERE.join(' AND ')}`);
  const pulls = (await db.prepare(`SELECT SUM(p.state = 'merged') AS merged, SUM(p.state = 'closed') AS closed, SUM(p.state = 'open') AS open, COUNT(DISTINCT LOWER(p.author)) AS solvers
    FROM pull_requests p JOIN bounties b ON b.id = p.bounty_id WHERE ${BY_OTHERS}`).bind(...LISTED_WITH_ACCESS).first<{ merged: number | null; closed: number | null; open: number | null; solvers: number }>())!;
  const perBounty = (await db.prepare('SELECT COUNT(*) AS n FROM pull_requests GROUP BY bounty_id').all<{ n: number }>()).results.map(row => row.n);
  const decided = (await db.prepare(`SELECT MIN(p.opened_at) AS first, COALESCE(MIN(p.merged_at), b.closed_at) AS at FROM bounties b JOIN pull_requests p ON p.bounty_id = b.id GROUP BY b.id HAVING at IS NOT NULL`).all<{ first: string; at: string }>()).results
    .map(row => Math.max(0, Math.floor((Date.parse(row.at) - Date.parse(row.first)) / DAY))).filter(Number.isFinite);
  const payments = (await loadPayments(db, '1 = 1')).map(input => ({ amount: input.amount, state: paymentOf(input).state }));
  const paid = payments.filter(payment => payment.state === 'recorded' || payment.state === 'confirmed' || payment.state === 'says-not-received');
  const { sample, ...fresh } = await freshness(env);
  return {
    board: 'Open bounty board', about: NUMBERS_ABOUT, ...fresh, ...(sample ? { sample_data: true as const } : {}),
    bounties: { listed, open, open_with_reward: openRewarded, base: 'bounties on public repositories the board lists now; a bounty whose repository went private is not counted' },
    rewards: { stated_on_open_bounties_usd: statedOpen, recorded_paid: { bounties: paid.length, usd: paid.reduce((sum, payment) => sum + payment.amount, 0) }, base: 'recorded paid: the owner\'s word, or the provider\'s for a payment through the board' },
    pull_requests: { merged: pulls.merged ?? 0, closed: pulls.closed ?? 0, open: pulls.open ?? 0, base: 'by others: not the poster, and not an owner, member or collaborator of the repository' },
    attempts_per_bounty: { median: median(perBounty), bounties: perBounty.length, base: 'pull requests per bounty, over bounties with at least one' },
    solvers: { distinct: pulls.solvers, base: 'GitHub accounts with a pull request by others, as above' },
    days_to_decision: { median: median(decided), bounties: decided.length, base: 'whole days from a bounty\'s first pull request to its first merge or its close' }
  };
}
