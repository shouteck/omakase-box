// The board's reads, shared by the pages' API and the machine interface: the
// filters, the private rule at render, and what a state or a history line says.
import { type Env, GitHub, GitHubUnavailable, BudgetSpent } from './github.js';
import { ownersMatching, OWNER_RECORD_FILTERS } from './payments.js';
import { readRepository } from './refresh.js';
import { type Db, getMeta } from './store.js';

const MAX_QUERY = 100;
const RENDER_RECHECK_MS = 5 * 60000;
const HISTORY_MAX = 50;
export const DAY = 86400000;

/** How old the facts are, and why, in the words the page shows. */
export async function freshness(env: Env): Promise<{ read_at: string | null; stale: string | null; sample?: true }> {
  const at = await getMeta(env.DB, 'read_at');
  const error = await getMeta(env.DB, 'last_error');
  return { read_at: at === null ? null : new Date(Number(at)).toISOString(), stale: error === null || error === '' ? null : error, ...(env.SAMPLE ? { sample: true as const } : {}) };
}

const ENUMS: Record<string, readonly string[]> = {
  solutions: ['none', 'some'],
  approved_by: ['owner-this-bounty', 'owner-standing-rule'],
  owner_record: Object.keys(OWNER_RECORD_FILTERS),
  sort: ['newest', 'reward']
};
const WHOLE = /^\d{1,9}$/;

/** Open and unmerged, as listed: what every list starts from. */
export const OPEN_WHERE = [`b.issue_state = 'open'`, `NOT EXISTS (SELECT 1 FROM pull_requests m WHERE m.bounty_id = b.id AND m.state = 'merged')`];
export const OPEN_COUNT = `(SELECT COUNT(*) FROM pull_requests p WHERE p.bounty_id = b.id AND p.state = 'open')`;
export const FROM_LISTED = 'FROM bounties b JOIN repositories r ON r.name = b.repository';

export type Filter = { where: string[]; values: (string | number)[] };

/** The filters both lists share, or the words of what is wrong with one. `wholes` names the numeric inputs this list takes. */
export function filterOf(q: URLSearchParams, now: number, wholes: readonly string[]): Filter | { error: string } {
  for (const [name, allowed] of Object.entries(ENUMS)) {
    const value = q.get(name);
    if (value && !allowed.includes(value)) return { error: `${name}: "${value.slice(0, 40)}" is not allowed. Next: one of ${allowed.join(', ')}.` };
  }
  for (const name of wholes) {
    const value = q.get(name);
    if (value && !WHOLE.test(value)) return { error: `${name}: must be a whole number. Next: remove it or give a number.` };
  }
  const query = q.get('query') ?? '';
  if (query.length > MAX_QUERY) return { error: `query: at most ${MAX_QUERY} characters. Next: shorten it.` };

  const where = [...OPEN_WHERE];
  const values: (string | number)[] = [];
  const add = (sql: string, ...bound: (string | number)[]) => { where.push(sql); values.push(...bound); };
  if (q.get('language')) add('r.language = ? COLLATE NOCASE', q.get('language')!);
  if (q.get('repository')) add('b.repository = ?', q.get('repository')!);
  if (q.get('min_reward')) add('b.amount >= ?', Number(q.get('min_reward')));
  if (q.get('max_age_days')) add('b.created_at >= ?', new Date(now - Number(q.get('max_age_days')) * DAY).toISOString());
  if (q.get('approved_by')) add('b.approved_by = ?', q.get('approved_by')!);
  if (q.get('solutions') === 'none') where.push(`${OPEN_COUNT} = 0`);
  if (q.get('solutions') === 'some') where.push(`${OPEN_COUNT} > 0`);
  if (query) {
    const like = `%${query.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    add(`(b.title LIKE ? ESCAPE '\\' OR b.repository LIKE ? ESCAPE '\\')`, like, like);
  }
  return { where, values };
}

/** The one filter that needs the counts: they are worked out on read, so it runs after filterOf. */
export async function addOwnerRecord(db: Db, q: URLSearchParams, filter: Filter, now: number): Promise<void> {
  const asked = q.get('owner_record');
  if (!asked) return;
  const { logins, negate } = await ownersMatching(db, asked, now);
  filter.where.push(`LOWER(b.poster) ${negate ? 'NOT ' : ''}IN (SELECT value FROM json_each(?))`);
  filter.values.push(JSON.stringify(logins));
}

export type BountyRow = { id: string; repository: string; issue_number: number; title: string; task: string; poster: string; issue_state: string; closed_at: string | null; amount: number; created_at: string; work_commit: string; approved_by: string | null; language: string | null; default_branch: string; read_at: number };
export type PullRow = { number: number; author: string; state: string; opened_at: string; merged_at: string | null };
type EventRow = { at: string; type: string; pull_request: number | null; amount: number | null; withdrawn: number | null; kind: string | null };
export type Line = { at: string; event: string; source: 'github' | 'project-record' };

/** The shared memory's events, and GitHub's facts for whatever they do not cover. */
export function historyOf(b: Pick<BountyRow, 'created_at' | 'issue_state' | 'closed_at'>, pulls: readonly PullRow[], events: readonly EventRow[]): Line[] {
  const lines: Line[] = [];
  const has = (type: string) => events.some(event => event.type === type);
  for (const event of events) {
    const source = 'project-record' as const;
    if (event.type === 'posted') lines.push({ at: event.at, event: 'posted', source });
    else if (event.type === 'solution') lines.push({ at: event.at, event: event.pull_request === null ? 'solution collected' : `solution collected: pull request #${event.pull_request}`, source });
    else if (event.type === 'merged') lines.push({ at: event.at, event: 'merged', source });
    else if (event.type === 'closed') lines.push({ at: event.at, event: event.kind === null ? 'closed' : `closed: ${event.kind}`, source });
    else if (event.type === 'paid') lines.push({ at: event.at, event: event.withdrawn ? `paid record withdrawn (the owner's word)` : `recorded paid${event.amount === null ? '' : `: $${event.amount}`} (the owner's word)`, source });
  }
  if (!has('posted')) lines.push({ at: b.created_at, event: 'posted', source: 'github' });
  for (const pull of pulls) {
    if (!events.some(event => event.type === 'solution' && event.pull_request === pull.number)) lines.push({ at: pull.opened_at, event: `solution: pull request #${pull.number}`, source: 'github' });
    if (pull.merged_at !== null) lines.push({ at: pull.merged_at, event: `merged: pull request #${pull.number}`, source: 'github' });
  }
  if (b.issue_state === 'closed' && b.closed_at !== null && !has('closed') && !pulls.some(pull => pull.merged_at !== null)) lines.push({ at: b.closed_at, event: 'closed without a merge', source: 'github' });
  return lines.sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).slice(-HISTORY_MAX);
}

export function stateOf(issueState: string, pulls: readonly Pick<PullRow, 'state'>[]): 'open' | 'solutions-waiting' | 'merged' | 'merged-more-than-one' | 'closed-none' {
  const merged = pulls.filter(pull => pull.state === 'merged').length;
  if (merged > 1) return 'merged-more-than-one';
  if (merged === 1) return 'merged';
  if (issueState === 'closed') return 'closed-none';
  return pulls.some(pull => pull.state === 'open') ? 'solutions-waiting' : 'open';
}

export type BountyFacts = { row: BountyRow; pulls: readonly PullRow[]; history: Line[] };

/** One bounty, or null when the board may not say anything about it. */
export async function readBounty(env: Env, id: string, now: number): Promise<BountyFacts | null> {
  if (!/^bt-[a-f\d]{12}$/.test(id)) return null;
  const select = `SELECT b.*, r.language, r.default_branch, r.read_at FROM bounties b JOIN repositories r ON r.name = b.repository WHERE b.id = ?`;
  const row = await env.DB.prepare(select).bind(id).first<BountyRow>();
  if (row === null) return null;
  // The private rule at render: an old read is read again before anything is sent.
  if (now - row.read_at > RENDER_RECHECK_MS) {
    try {
      if (!await readRepository(env, new GitHub(env, false), row.repository, now)) return null;
    } catch (error) {
      // GitHub cannot say; the answer shows what was read, and says when.
      if (!(error instanceof GitHubUnavailable || error instanceof BudgetSpent)) throw error;
    }
  }
  const pulls = (await env.DB.prepare('SELECT number, author, state, opened_at, merged_at FROM pull_requests WHERE bounty_id = ? ORDER BY number').bind(id).all<PullRow>()).results;
  const events = (await env.DB.prepare('SELECT at, type, pull_request, amount, withdrawn, kind FROM events WHERE bounty_id = ? AND type IS NOT NULL').bind(id).all<EventRow>()).results;
  return { row, pulls, history: historyOf(row, pulls, events) };
}
