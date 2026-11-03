// PF28: no bounty can stall the board's reading. The live Worker allows 2 GitHub reads a run (worker.ts); these tests run at that cap.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lookNow, refresh } from '../../packages/box-platform/src/refresh.js';
import type { StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, rig, type Rig } from './support.js';

const REPOSITORY = 'example-tidepool/ledger';
const DAY = 86400000;
const bounty = (n: number, over: Partial<StandinIssue> = {}): StandinIssue => ({
  id: `bt-${String(n).padStart(12, '0')}`, repository: REPOSITORY, number: n, title: 't', task: 't', poster: 'example-mara', amount: 0,
  createdAt: new Date(NOW - DAY).toISOString(), pulls: [], events: [], ...over
});
const closed = (n: number, over: Partial<StandinIssue> = {}) => bounty(n, { state: 'closed', closedAt: new Date(NOW - DAY / 2).toISOString(), ...over });
const pullsOf = async (r: Rig, id: string) => (await r.env.DB.prepare('SELECT number, draft FROM pull_requests WHERE bounty_id = ? ORDER BY number').bind(id).all<{ number: number; draft: number }>()).results;
const eventsOf = async (r: Rig, id: string) => (await r.env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE bounty_id = ?').bind(id).first<{ n: number }>())!.n;

describe('no bounty can stall the board\'s reading', { timeout: 120000 }, () => {
  let r: Rig;
  let live: Rig['env'] & { tickReads: number; closedStaleMs: number };
  beforeEach(async () => {
    r = await rig('token');
    live = { ...r.env, tickReads: 2, closedStaleMs: 60 * MINUTE };
    r.standin.repositories.set(REPOSITORY, { language: 'Go', visibility: 'public' });
  });
  afterEach(() => r.close());
  /** Minute runs, as the Worker's cron, until done() or the limit. The number of runs it took, or null. */
  const runs = async (limit: number, done: () => Promise<boolean>): Promise<number | null> => {
    for (let n = 1; n <= limit; n++) {
      r.clock.at += MINUTE;
      await refresh(live);
      if (await done()) return n;
    }
    return null;
  };

  it('a squash-merged bounty, which needs more reads than a run has, does not keep a new bounty\'s draft from being read', async () => {
    for (let n = 1; n <= 25; n++) r.standin.issues.push(closed(n, { pulls: [{ number: 100 + n, author: 'example-fern', state: 'closed', created_at: new Date(NOW - DAY).toISOString() }] }));
    // Two merged into its bounty branch; that branch is not on the default branch, so the head is compared again at each read.
    r.standin.issues.push(closed(40, { pulls: [{ number: 140, author: 'example-fern', state: 'closed', merged_at: new Date(NOW - DAY / 2).toISOString(), created_at: new Date(NOW - DAY).toISOString(), landed: false },
      { number: 141, author: 'example-fern', state: 'closed', merged_at: new Date(NOW - DAY / 2).toISOString(), created_at: new Date(NOW - DAY).toISOString(), landed: false }] }));
    expect(await runs(120, async () => false)).toBeNull();
    // Its pull request step is done once the list is stored, so its head is compared at the closed cadence (hourly), not every run.
    expect(r.standin.requests.filter(line => line.includes('/compare/')).length).toBeLessThanOrEqual(6);
    const fresh = bounty(59, { createdAt: new Date(r.clock.at).toISOString(), pulls: [{ number: 60, author: 'example-fern', state: 'open', draft: true, created_at: new Date(r.clock.at).toISOString() }] });
    r.standin.issues.push(fresh);
    // Listed by the next search, then read within the board's 15-minute refresh.
    expect(await runs(30, async () => (await pullsOf(r, fresh.id)).length === 1)).not.toBeNull();
    expect(await pullsOf(r, fresh.id)).toEqual([{ number: 60, draft: 1 }]);
  });

  it('a bounty with more new events than a run can read is read to the end over several runs, while another bounty\'s pull requests are read', async () => {
    const events = Array.from({ length: 40 }, (_, i) => ({ v: 1, type: 'solution', at: new Date(NOW + i).toISOString() }));
    r.standin.issues.push(bounty(1, { events }));
    r.standin.issues.push(bounty(2, { pulls: [{ number: 7, author: 'example-fern', state: 'open', created_at: new Date(NOW).toISOString() }] }));
    // The other bounty's pull requests are not held up behind the long chain: read within a few runs.
    expect(await runs(5, async () => (await pullsOf(r, 'bt-000000000002')).length === 1)).not.toBeNull();
    expect(await runs(60, async () => await eventsOf(r, 'bt-000000000001') === 40)).not.toBeNull();
  });

  it('a notice at 2 reads stores a new pull request on a bounty the board holds, the repository still read first', async () => {
    const one = bounty(1);
    r.standin.issues.push(one);
    expect(await runs(30, async () => (await r.env.DB.prepare('SELECT details_read_at AS at FROM bounties').first<{ at: number }>())?.at !== 0)).not.toBeNull();
    one.pulls!.push({ number: 9, author: 'example-fern', state: 'open', draft: true, created_at: new Date(r.clock.at).toISOString() });
    const asked = r.standin.requests.length;
    expect(await lookNow(live, REPOSITORY, 1, one.id, r.clock.at)).toBe('budget-spent');
    expect(r.standin.requests.slice(asked)).toEqual([`/repos/${REPOSITORY}`, `/repos/${REPOSITORY}/pulls`]);
    expect(await pullsOf(r, one.id)).toEqual([{ number: 9, draft: 1 }]);
    // The rest goes first in the next run.
    expect(await r.env.DB.prepare('SELECT details_read_at + events_read_at AS at FROM bounties WHERE id = ?').bind(one.id).first<{ at: number }>()).toEqual({ at: 0 });
    // A repository that turned private is read and dropped before anything of it is read.
    r.standin.repositories.get(REPOSITORY)!.visibility = 'private';
    const before = r.standin.requests.length;
    expect(await lookNow(live, REPOSITORY, 1, one.id, r.clock.at)).toBe('not-public');
    expect(r.standin.requests.slice(before)).toEqual([`/repos/${REPOSITORY}`]);
  });
});
