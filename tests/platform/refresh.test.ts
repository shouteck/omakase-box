import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { LIMITS } from '../../packages/box-platform/src/github.js';
import { lookNow, refresh, taskOf, titleOf } from '../../packages/box-platform/src/refresh.js';
import type { Db, Statement } from '../../packages/box-platform/src/store.js';
import { bodyOf, commitFor, type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { askJson, MINUTE, NOW, refreshUntilDone, rig, type Rig } from './support.js';

const issue = (over: Partial<StandinIssue> = {}): StandinIssue => ({
  id: 'bt-aaaaaaaaaaaa', repository: 'example-tidepool/ledger', number: 44, title: 'Skip no months', task: 'Fix the 31st.',
  poster: 'example-mara', amount: 45, createdAt: new Date(NOW - 4 * 86400000).toISOString(), ...over
});
const logged = async (r: Rig) => (await r.env.DB.prepare('SELECT reason, issue FROM log').all<{ reason: string; issue: string | null }>()).results;
const dump = async (r: Rig) => {
  const parts: unknown[] = [];
  for (const table of ['repositories', 'bounties', 'pull_requests', 'events', 'log', 'meta']) parts.push((await r.env.DB.prepare(`SELECT * FROM ${table}`).all()).results);
  return JSON.stringify(parts);
};

describe('finding bounties', () => {
  let r: Rig;
  beforeEach(async () => { r = await rig(); });
  afterEach(() => r.close());

  it('lists a public repository with a valid block, every card field matching the stand-in', async () => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'TypeScript', visibility: 'public' });
    r.standin.issues.push(issue({ pulls: [{ number: 45, author: 'example-fern', state: 'open', created_at: new Date(NOW - MINUTE).toISOString() }] }));
    await refreshUntilDone(r);
    const { body } = await askJson(r, handle, '/api/board');
    expect(body.bounties).toEqual([{ id: 'bt-aaaaaaaaaaaa', title: 'Skip no months', amount: 45, repository: 'example-tidepool/ledger', language: 'TypeScript', poster: 'example-mara', record: { has_history: false, merged: 0, recorded_paid: 0, confirmed_received: 0, from_solvers: 0, owed_now: 0, oldest_owed_days: 0, says_not_received: 0, median_days_to_record_paid: null }, solutions_open: 1, age_days: 4 }]);
    expect(body.open_total).toBe(1);
    expect(body.read_at).toBe(new Date(NOW).toISOString());
  });

  // @guards BD1
  it('never lists, renders or stores a private repository with a valid block', async () => {
    r.standin.repositories.set('example-hidden/vault', { language: 'Go', visibility: 'private' });
    r.standin.issues.push(issue({ repository: 'example-hidden/vault', title: 'PRIVATE SAMPLE' }));
    await refreshUntilDone(r);
    expect((await askJson(r, handle, '/api/board')).body.bounties).toEqual([]);
    expect((await askJson(r, handle, '/api/b/bt-aaaaaaaaaaaa')).status).toBe(404);
    const held = await dump(r);
    expect(held).not.toContain('vault');
    expect(held).not.toContain('PRIVATE SAMPLE');
    expect(await logged(r)).toEqual([{ reason: 'repository-not-public', issue: null }]);
  });

  it('treats a repository GitHub will not show (404) as not public', async () => {
    r.standin.issues.push(issue({ repository: 'example-gone/vault' }));
    await refreshUntilDone(r);
    expect((await askJson(r, handle, '/api/board')).body.bounties).toEqual([]);
  });

  // @guards BD1
  it('drops a repository that turns private, at the next refresh', async () => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    r.standin.issues.push(issue());
    await refreshUntilDone(r);
    expect((await askJson(r, handle, '/api/board')).body.count).toBe(1);
    r.standin.repositories.get('example-tidepool/ledger')!.visibility = 'private';
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    expect((await askJson(r, handle, '/api/board')).body.count).toBe(0);
    expect((await askJson(r, handle, '/api/b/bt-aaaaaaaaaaaa')).status).toBe(404);
    expect(await dump(r)).not.toContain('Skip no months');
  });

  // @guards BD1
  it('drops it at render, before any refresh, and that empties the list too', async () => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    r.standin.issues.push(issue());
    await refreshUntilDone(r);
    r.standin.repositories.get('example-tidepool/ledger')!.visibility = 'private';
    r.clock.at += 6 * MINUTE;
    expect((await askJson(r, handle, '/api/b/bt-aaaaaaaaaaaa')).status).toBe(404);
    expect((await askJson(r, handle, '/api/board')).body.count).toBe(0);
  });

  it('does not list a malformed or missing block, and records the reason', async () => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    const good = issue();
    r.standin.issues.push(
      issue({ id: 'bt-bbbbbbbbbbbb', number: 50, rawBody: 'An issue with no block.' }),
      issue({ id: 'bt-cccccccccccc', number: 51, rawBody: `${bodyOf(good).replace('"amount":45', '"amount":"lots"')}` }),
      issue({ id: 'bt-dddddddddddd', number: 52, rawBody: bodyOf(issue({ id: 'bt-dddddddddddd' })).replace('<!-- box-bounty:bt-dddddddddddd -->', '') }),
      issue({ id: 'bt-eeeeeeeeeeee', number: 53, rawBody: bodyOf(issue({ id: 'bt-eeeeeeeeeeee', repository: 'someone/else' })) })
    );
    await refreshUntilDone(r);
    expect((await askJson(r, handle, '/api/board')).body.count).toBe(0);
    const reasons = (await logged(r)).map(line => line.reason).sort();
    expect(reasons).toEqual(['format-absent', 'format-invalid', 'format-names-another-repository', 'marker-missing']);
    expect((await logged(r)).find(line => line.reason === 'format-absent')?.issue).toBe('https://github.com/example-tidepool/ledger/issues/50');
  });

  it('keeps the first issue to claim an id; a copy elsewhere cannot overwrite it', async () => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    r.standin.repositories.set('someone/else', { language: 'Go', visibility: 'public' });
    r.standin.issues.push(issue(), issue({ repository: 'someone/else', title: 'A copy', number: 9 }));
    await refreshUntilDone(r);
    const { body } = await askJson(r, handle, '/api/board');
    expect(body.bounties.map((b: { repository: string }) => b.repository)).toEqual(['example-tidepool/ledger']);
    expect((await logged(r)).map(line => line.reason)).toContain('id-claimed-by-another-issue');
  });

  it('shows two pull requests on the bounty branch, one merged, with their states and no solver title', async () => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    r.standin.issues.push(issue({ pulls: [
      { number: 45, author: 'example-fern', state: 'open', created_at: '2026-10-29T00:00:00Z' },
      { number: 46, author: 'example-quill', state: 'closed', created_at: '2026-10-29T01:00:00Z', merged_at: '2026-10-30T00:00:00Z' }
    ] }));
    await refreshUntilDone(r);
    const response = await handle(new Request('http://board.test/api/b/bt-aaaaaaaaaaaa'), r.env);
    const text = await response.text();
    expect(text).not.toContain('A SOLVER WROTE THIS TITLE');
    const { bounty } = JSON.parse(text);
    expect(bounty.solutions.map((s: { number: number; author: string; state: string }) => [s.number, s.author, s.state])).toEqual([[45, 'example-fern', 'open'], [46, 'example-quill', 'merged']]);
    expect(bounty.state).toBe('merged');
    expect((await askJson(r, handle, '/api/board')).body.count).toBe(0);
  });

  it('builds history from the shared memory, sourced, reading each event commit once', async () => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    r.standin.issues.push(issue({ events: [
      { v: 1, type: 'posted', at: '2026-10-27T00:00:00Z', task: 'SECRET FREE TEXT', allowedBy: { decision: 'once', level: 'project' } },
      { v: 1, type: 'closed', at: '2026-10-28T00:00:00Z', kind: 'rejected', reason: 'A REASON STRING' },
      { v: 1, type: 'paid', at: '2026-10-29T00:00:00Z', amount: 45, by: 'example-mara', withdrawn: false },
      { v: 2, type: 'posted', at: 'nonsense' }
    ] }));
    await refreshUntilDone(r);
    const response = await handle(new Request('http://board.test/api/b/bt-aaaaaaaaaaaa'), r.env);
    const text = await response.text();
    expect(text).not.toContain('SECRET FREE TEXT');
    expect(text).not.toContain('A REASON STRING');
    const { bounty } = JSON.parse(text);
    expect(bounty.approved_by).toBe('owner-this-bounty');
    expect(bounty.history).toEqual([
      { at: '2026-10-27T00:00:00Z', event: 'posted', source: 'project-record' },
      { at: '2026-10-28T00:00:00Z', event: 'closed: rejected', source: 'project-record' },
      { at: '2026-10-29T00:00:00Z', event: `recorded paid: $45 (the owner's word)`, source: 'project-record' }
    ]);
    const reads = r.standin.requests.filter(path => path.endsWith('event.json')).length;
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    expect(r.standin.requests.filter(path => path.endsWith('event.json')).length).toBe(reads);
  });

  it('removes a bounty whose issue GitHub no longer has', async () => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    r.standin.issues.push(issue());
    await refreshUntilDone(r);
    r.standin.issues.length = 0;
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    expect((await askJson(r, handle, '/api/b/bt-aaaaaaaaaaaa')).status).toBe(404);
  });

  it('a closed bounty: the page keeps it, the board does not', async () => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    const entry = issue();
    r.standin.issues.push(entry);
    await refreshUntilDone(r);
    entry.state = 'closed';
    entry.closedAt = '2026-10-31T13:00:00Z';
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    expect((await askJson(r, handle, '/api/board')).body.count).toBe(0);
    const { body } = await askJson(r, handle, '/api/b/bt-aaaaaaaaaaaa');
    expect(body.bounty.state).toBe('closed-none');
    expect(body.bounty.history.at(-1)).toEqual({ at: '2026-10-31T13:00:00Z', event: 'closed without a merge', source: 'github' });
  });

  it('reads the task out of the issue body, and undoes the poster tool escape', () => {
    const body = bodyOf(issue({ task: 'Use &lt;b> here.\n\n## Not a real heading' }));
    expect(taskOf(body, body.indexOf('<!-- box-bounty-format'))).toBe('Use <b> here.\n\n## Not a real heading');
    expect(titleOf('[box bounty bt-aaaaaaaaaaaa] Fix &lt;x>', 'bt-aaaaaaaaaaaa')).toBe('Fix <x>');
    expect(commitFor('bt-aaaaaaaaaaaa')).toHaveLength(40);
  });
});

describe('rate limits', () => {
  let r: Rig;
  beforeEach(async () => { r = await rig(); });
  afterEach(() => r.close());
  const seed = (n: number) => {
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    for (let i = 0; i < n; i++) r.standin.issues.push(issue({ id: `bt-${String(i).padStart(12, '0')}`, number: i + 1, pulls: [], events: [] }));
  };

  it('stops at the stated budget and resumes from where it stopped', async () => {
    seed(20);
    const first = await refresh(r.env);
    expect(first).toEqual({ requests: LIMITS.anonymous.tick, state: 'budget-spent' });
    // What it has read so far is on the board: search and repository came first.
    expect((await askJson(r, handle, '/api/board')).body.open_total).toBe(20);
    r.clock.at += 15 * MINUTE;
    expect((await refresh(r.env)).requests).toBe(LIMITS.anonymous.tick);
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    const unread = await r.env.DB.prepare('SELECT COUNT(*) AS n FROM bounties WHERE details_read_at = 0 OR events_read_at = 0').first<{ n: number }>();
    expect(unread?.n).toBe(0);
  });

  it('never spends more than the hour allows, across refreshes that come too fast', async () => {
    seed(100);
    let total = 0;
    for (let i = 0; i < 6; i++) total += (await refresh(r.env)).requests;
    expect(total).toBe(LIMITS.anonymous.hour);
    expect(r.standin.requests.length).toBe(LIMITS.anonymous.hour);
  });

  it('gives a token its larger budget, under the Workers subrequest limit', async () => {
    const tokened = await rig('not-a-real-token');
    tokened.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    for (let i = 0; i < 40; i++) tokened.standin.issues.push(issue({ id: `bt-${String(i).padStart(12, '0')}`, number: i + 1, events: [] }));
    expect((await refresh(tokened.env)).requests).toBe(LIMITS.token.tick);
    expect(LIMITS.token.tick).toBeLessThanOrEqual(50);
    await tokened.close();
  });

  describe('database calls in one run (Workers Free: each call costs CPU)', () => {
    /** Counts every call that reaches the database; a batch is one. */
    const counted = (env: Rig['env']) => {
      const calls = { n: 0 };
      const wrap = (one: Statement): Statement => ({
        bind: (...values) => wrap(one.bind(...values)),
        all: () => { calls.n += 1; return one.all(); },
        first: () => { calls.n += 1; return one.first(); },
        run: () => { calls.n += 1; return one.run(); }
      });
      const DB: Db = { prepare: sql => wrap(env.DB.prepare(sql)), batch: async statements => { const after = calls.n + 1; await env.DB.batch(statements); calls.n = after; } };
      return { calls, env: { ...env, DB } };
    };

    it('a search over 25 stored bounties stays few, whatever the page holds', async () => {
      seed(25);
      await refreshUntilDone(r);
      r.clock.at += 15 * MINUTE;
      const { calls, env } = counted({ ...r.env, tickReads: 1 });
      expect(await refresh(env)).toEqual({ requests: 1, state: 'budget-spent' });
      expect(calls.n).toBeLessThanOrEqual(10);
    });

    it('a run with nothing due asks GitHub nothing and leaves read_at alone', async () => {
      seed(3);
      await refreshUntilDone(r);
      const before = (await askJson(r, handle, '/api/board')).body.read_at;
      r.clock.at += MINUTE;
      const asked = r.standin.requests.length;
      const { calls, env } = counted(r.env);
      expect(await refresh(env)).toEqual({ requests: 0, state: 'done' });
      expect(r.standin.requests.length).toBe(asked);
      expect(calls.n).toBeLessThanOrEqual(4);
      expect((await askJson(r, handle, '/api/board')).body.read_at).toBe(before);
    });

    it('gives back what a run reserved and did not spend', async () => {
      seed(1);
      await refreshUntilDone(r);
      const used = await r.env.DB.prepare(`SELECT value FROM meta WHERE key = 'budget_used'`).first<{ value: string }>();
      expect(Number(used?.value)).toBe(r.standin.requests.length);
    });

    it('leaves a closed bounty alone until its longer wait, and an open one does not wait', async () => {
      seed(2);
      r.standin.issues[0]!.state = 'closed';
      await refreshUntilDone(r);
      const asked = () => r.standin.requests.filter(line => line.endsWith('/pulls')).length;
      const before = asked();
      r.clock.at += 16 * MINUTE;
      await refresh({ ...r.env, closedStaleMs: 60 * MINUTE });
      expect(asked() - before).toBe(1);
      r.clock.at += 61 * MINUTE;
      await refresh({ ...r.env, closedStaleMs: 60 * MINUTE });
      expect(asked() - before).toBe(3);
    });

    it('a look stopped by the budget goes first in the next refresh, even when closed', async () => {
      seed(2);
      r.standin.issues[0]!.state = 'closed';
      await refreshUntilDone(r);
      const id = r.standin.issues[0]!.id;
      expect(await lookNow({ ...r.env, tickReads: 2 }, 'example-tidepool/ledger', 1, id, r.clock.at)).toBe('budget-spent');
      const row = await r.env.DB.prepare('SELECT details_read_at AS at FROM bounties WHERE id = ?').bind(id).first<{ at: number }>();
      expect(row?.at).toBe(0);
    });

    it('keeps the events it read when the budget stops the walk', async () => {
      r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
      const events = Array.from({ length: 8 }, (_, i) => ({ v: 1, type: 'solution', at: new Date(NOW + i).toISOString() }));
      r.standin.issues.push(issue({ id: 'bt-000000000001', number: 1, pulls: [], events }));
      const small = { ...r.env, tickReads: 6 };
      await refresh(small);
      const stored = await r.env.DB.prepare('SELECT COUNT(*) AS n FROM events').first<{ n: number }>();
      expect(stored?.n).toBeGreaterThan(0);
    });
  });

  it('when GitHub says the limit is used up: says so, keeps what it read, waits for the reset, then resumes', async () => {
    seed(3);
    await refreshUntilDone(r);
    r.standin.rateLimitAfter = 0;
    r.standin.resetAt = Math.floor((r.clock.at + 30 * MINUTE) / 1000);
    r.clock.at += 15 * MINUTE;
    const limited = await refresh(r.env);
    expect(limited.state).toBe('github-unavailable');
    expect(limited.reason).toContain('rate limit');
    const { body } = await askJson(r, handle, '/api/board');
    expect(body.count).toBe(3);
    expect(body.stale).toContain('rate limit');
    expect(body.read_at).toBe(new Date(NOW).toISOString());
    // Before the reset it does not even ask.
    const asked = r.standin.requests.length;
    r.clock.at += 5 * MINUTE;
    expect((await refresh(r.env)).state).toBe('github-unavailable');
    expect(r.standin.requests.length).toBe(asked);
    r.standin.rateLimitAfter = null;
    r.clock.at += 15 * MINUTE;
    expect((await refresh(r.env)).state).toBe('done');
    expect((await askJson(r, handle, '/api/board')).body.stale).toBeNull();
  });

  it('a render that cannot re-read GitHub shows stored facts and says how old they are', async () => {
    seed(1);
    await refreshUntilDone(r);
    r.standin.rateLimitAfter = 0;
    r.standin.resetAt = Math.floor((r.clock.at + 30 * MINUTE) / 1000);
    r.clock.at += 6 * MINUTE;
    const { status, body } = await askJson(r, handle, '/api/b/bt-000000000000');
    expect(status).toBe(200);
    expect(body.read_at).toBe(new Date(NOW).toISOString());
  });
});
