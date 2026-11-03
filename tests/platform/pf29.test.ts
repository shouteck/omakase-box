// PF29: an earning agent can price a bounty from the board alone. Each fact is shown on a world where the rows it
// counts and the rows it must leave out are both really on the board.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { checksOf, refresh, type ChecksState } from '../../packages/box-platform/src/refresh.js';
import { idOf, type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { NOW, refreshUntilDone, rig, type Rig } from './support.js';

const ORIGIN = 'http://board.test';
const askJson = async (r: Rig, path: string): Promise<any> => (await handle(new Request(`${ORIGIN}${path}`), r.env)).json();
const DAY = 86400000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const REPOSITORY = 'example-org/pf29';
const issue = (n: number, over: Partial<StandinIssue> = {}): StandinIssue => ({ id: idOf(0xf000 + n), repository: REPOSITORY, number: 9000 + n, title: `PF29 ${n}`, task: `Task ${n}.`, poster: 'pf29-poster', amount: 40, createdAt: ago(3), pulls: [], events: [], ...over });
type Pull = NonNullable<StandinIssue['pulls']>[number];
const pull = (number: number, over: Partial<Pull>): Pull => ({ number, author: 'example-fern', state: 'open', created_at: ago(2), association: 'NONE', ...over } as Pull);

let r: Rig;
beforeEach(async () => { r = await rig('not-a-real-token'); r.standin.repositories.set(REPOSITORY, { language: 'TypeScript', visibility: 'public' }); }, 120000);
afterEach(() => r.close());

describe('the owner\'s merge odds', () => {
  it('counts others\' pull requests merged, closed and open; leaves out the poster\'s own and a collaborator\'s', async () => {
    r.standin.issues.push(
      issue(1, { state: 'closed', closedAt: ago(1), pulls: [pull(101, { state: 'closed', merged_at: ago(1), landed: true }), pull(102, { state: 'closed', author: 'example-quill' })] }),
      // Left out: the poster's own merge, a collaborator's merge, and the poster's own open attempt.
      issue(3, { state: 'closed', closedAt: ago(1), pulls: [pull(104, { author: 'pf29-poster', state: 'closed', merged_at: ago(1), association: 'OWNER' })] }),
      issue(4, { state: 'closed', closedAt: ago(1), pulls: [pull(105, { author: 'example-mate', state: 'closed', merged_at: ago(1), association: 'COLLABORATOR' })] }),
      issue(2, { pulls: [pull(103, {}), pull(106, { author: 'pf29-poster', association: 'OWNER' })] })
    );
    await refreshUntilDone(r);
    // The rows the rule leaves out are really stored.
    const stored = (await r.env.DB.prepare('SELECT number FROM pull_requests ORDER BY number').all<{ number: number }>()).results.map(row => row.number);
    expect(stored).toEqual([101, 102, 103, 104, 105, 106]);
    const page = await askJson(r, '/bounties.json');
    const entry = page.bounties.find((b: { id: string }) => b.id === idOf(0xf002));
    expect(entry.owner.pull_requests).toEqual({ merged: 1, closed: 1, open: 1 });
    expect(page.legend['owner.pull_requests']).toContain('Counts, not a rate');
  });

  it('an owner with no pull requests by others shows zeros, not nothing', async () => {
    r.standin.issues.push(issue(5));
    await refreshUntilDone(r);
    const page = await askJson(r, '/bounties.json');
    expect(page.bounties[0].owner.pull_requests).toEqual({ merged: 0, closed: 0, open: 0 });
  });
});

describe('what GitHub\'s checks say on each attempt', () => {
  it('rolls check runs and statuses into one state; a failure anywhere is failing; nothing at all is none', () => {
    const runs = (...list: [string, string | null][]) => ({ total_count: list.length, check_runs: list.map(([status, conclusion]) => ({ status, conclusion })) });
    const status = (...states: string[]) => ({ state: 'ignored', total_count: states.length, statuses: states.map(state => ({ state })) });
    const table: [unknown, unknown, ChecksState][] = [
      [runs(), status(), 'none'],
      [runs(['completed', 'success']), status(), 'passing'],
      [runs(['completed', 'success'], ['completed', 'skipped']), status('success'), 'passing'],
      [runs(['completed', 'success'], ['in_progress', null]), status(), 'pending'],
      [runs(['completed', 'success']), status('pending'), 'pending'],
      [runs(['completed', 'failure'], ['in_progress', null]), status(), 'failing'],
      [runs(['completed', 'timed_out']), status(), 'failing'],
      [runs(['completed', 'success']), status('error'), 'failing'],
      [runs(), status('success'), 'passing'],
      [{ message: 'Not Found' }, status(), 'unread'],
      [runs(), { message: 'Not Found' }, 'unread']
    ];
    for (const [checkRuns, combined, state] of table) expect(checksOf(checkRuns, combined)).toBe(state);
  });

  it('an attempt\'s checks are shown for its current head only; a head that moved shows nothing until it is read', async () => {
    const attempt = pull(201, { draft: true, checks: { runs: [{ status: 'completed', conclusion: 'failure' }] } });
    r.standin.issues.push(issue(6, { pulls: [attempt] }));
    await refreshUntilDone(r);
    // A pull request stored by a run has its checks read on the next run, as the cron's next minute would.
    await refresh(r.env);
    const draftOf = async () => (await askJson(r, '/bounties.json')).bounties[0].attempts_in_progress.drafts[0];
    const first = await draftOf();
    expect(first.checks).toMatchObject({ state: 'failing', head: '00000000000000000000000000000000000000c9'.replace(/^0+/, m => 'a'.repeat(m.length)) });
    const detail = await askJson(r, `/bounties/${idOf(0xf006)}.json`);
    expect(detail.bounty.solution_list[0].checks.state).toBe('failing');
    // The solver pushes: a new head, now passing. Its pull requests are read before its checks are.
    attempt.head = 'b'.repeat(40);
    attempt.checks = { runs: [{ status: 'completed', conclusion: 'success' }] };
    await r.env.DB.prepare('UPDATE bounties SET details_read_at = 0').run();
    const github = { ...r.env, tickReads: 1 };
    await refresh(github); // one read: the pull request list, not yet the checks
    expect((await r.env.DB.prepare('SELECT head_sha FROM pull_requests WHERE number = 201').first<{ head_sha: string }>())!.head_sha).toBe('b'.repeat(40));
    expect((await draftOf()).checks).toBeNull();
    await refreshUntilDone(r);
    expect(await draftOf()).toMatchObject({ checks: { state: 'passing', head: 'b'.repeat(40) } });
    // No check name, a solver's text, reaches the answer.
    expect(JSON.stringify(await askJson(r, '/bounties.json'))).not.toContain('A SOLVER NAMED');
  });

  it('at the live Worker\'s 2 reads a run, every bounty with a checked attempt is read, and a new draft is still stored within the refresh', async () => {
    const live = { ...r.env, tickReads: 2, closedStaleMs: 60 * 60000 };
    for (let n = 10; n < 30; n++) r.standin.issues.push(issue(n, { pulls: [pull(300 + n, { draft: true, checks: n % 2 === 0 ? { runs: [{ status: 'in_progress', conclusion: null }] } : { statuses: ['success'] } })] }));
    const runs = async (limit: number, done: () => Promise<boolean>): Promise<number | null> => {
      for (let n = 1; n <= limit; n++) { r.clock.at += 60000; await refresh(live); if (await done()) return n; }
      return null;
    };
    const unread = async () => (await r.env.DB.prepare("SELECT COUNT(*) AS n FROM pull_requests WHERE checks_sha IS NULL OR checks_sha != head_sha").first<{ n: number }>())!.n;
    expect(await runs(120, async () => (await r.env.DB.prepare('SELECT COUNT(*) AS n FROM pull_requests').first<{ n: number }>())!.n === 20 && await unread() === 0)).not.toBeNull();
    // A new bounty's draft is not held up behind the pending attempts read again every 15 minutes.
    r.standin.issues.push(issue(40, { createdAt: new Date(r.clock.at).toISOString(), pulls: [pull(340, { draft: true, created_at: new Date(r.clock.at).toISOString() })] }));
    expect(await runs(30, async () => (await r.env.DB.prepare('SELECT COUNT(*) AS n FROM pull_requests WHERE number = 340').first<{ n: number }>())!.n === 1)).not.toBeNull();
  });
});

describe('the numbers page', () => {
  it('an empty board shows zeros and says what each number counts', async () => {
    await refreshUntilDone(r);
    const numbers = await askJson(r, '/numbers.json');
    expect(numbers.bounties).toMatchObject({ listed: 0, open: 0, open_with_reward: 0 });
    expect(numbers.rewards).toMatchObject({ stated_on_open_bounties_usd: 0, pays_on_merge: { bounties: 0, usd: 0 }, no_attempt_yet: { bounties: 0, usd: 0 } });
    expect(numbers.payments).toMatchObject({ merged_with_reward: 0, recorded_paid: 0, confirmed_received: 0, says_not_received: 0, owed_now: { bounties: 0, usd: 0, oldest_days: 0 } });
    expect(numbers.last_30_days).toMatchObject({ posted: 0, merged: 0 });
    expect(numbers.pull_requests).toMatchObject({ merged: 0, closed: 0, open: 0 });
    expect(numbers.attempts_per_bounty).toMatchObject({ median: null, bounties: 0 });
    expect(numbers.days_to_decision).toMatchObject({ median: null, bounties: 0 });
    for (const key of ['bounties', 'rewards', 'payments', 'last_30_days', 'pull_requests', 'attempts_per_bounty', 'solvers', 'days_to_decision']) expect(typeof numbers[key].base).toBe('string');
  });

  it('a seeded world\'s numbers equal a hand count, and a repeat ask with the tag costs a 304', async () => {
    r.standin.issues.push(
      // Merged by another: decided in 1 day; closed issue.
      issue(51, { amount: 30, state: 'closed', closedAt: ago(1), pulls: [pull(501, { state: 'closed', merged_at: ago(1), created_at: ago(2), landed: true }), pull(502, { author: 'example-quill', state: 'closed', created_at: ago(2) })] }),
      // Open, rewarded, two attempts by others, one by the poster (not counted as by others).
      issue(52, { amount: 50, pulls: [pull(503, {}), pull(504, { author: 'example-quill' }), pull(505, { author: 'pf29-poster', association: 'OWNER' })] }),
      // Open, no reward, no attempts.
      issue(53, { amount: 0 }),
      // Open, rewarded, no attempt yet.
      issue(54, { amount: 20 }),
      // Merged by another and recorded paid by the owner; posted long ago, merged inside the 30 days.
      issue(55, { amount: 25, createdAt: ago(60), state: 'closed', closedAt: ago(5), pulls: [pull(506, { state: 'closed', merged_at: ago(5), created_at: ago(6), landed: true })], events: [{ v: 1, type: 'paid', at: ago(4), amount: 25, by: 'pf29-poster', withdrawn: false }] }),
      // Self-dealt: the poster's own merge, rewarded; not counted as paid work.
      issue(56, { amount: 40, state: 'closed', closedAt: ago(1), pulls: [pull(507, { author: 'pf29-poster', association: 'OWNER', state: 'closed', merged_at: ago(1), landed: true })] })
    );
    await refreshUntilDone(r);
    const numbers = await askJson(r, '/numbers.json');
    expect(numbers.bounties).toMatchObject({ listed: 6, open: 3, open_with_reward: 2 });
    expect(numbers.rewards).toMatchObject({ stated_on_open_bounties_usd: 70, pays_on_merge: { bounties: 0, usd: 0 }, no_attempt_yet: { bounties: 1, usd: 20 } });
    // 51 owed (never recorded), 55 recorded paid; 56 is the poster's own and left out.
    expect(numbers.payments).toMatchObject({ merged_with_reward: 2, recorded_paid: 1, confirmed_received: 0, says_not_received: 0, owed_now: { bounties: 1, usd: 30, oldest_days: 1 } });
    // Posted inside 30 days: every bounty but 55; merged by others inside 30 days: 501 and 506.
    expect(numbers.last_30_days).toMatchObject({ posted: 5, merged: 2 });
    expect(numbers.pull_requests).toMatchObject({ merged: 2, closed: 1, open: 2 });
    expect(numbers.solvers.distinct).toBe(2);
    // Pull requests per bounty: 2, 3, 1 and 1 over the four bounties with any; the median of four is the middle pair's mean, rounded.
    expect(numbers.attempts_per_bounty).toMatchObject({ median: 2, bounties: 4 });
    expect(numbers.days_to_decision).toMatchObject({ median: 1, bounties: 3 });
    const first = await handle(new Request(`${ORIGIN}/numbers.json`), r.env);
    const again = await handle(new Request(`${ORIGIN}/numbers.json`, { headers: { 'if-none-match': first.headers.get('etag')! } }), r.env);
    expect(again.status).toBe(304);
  });
});
