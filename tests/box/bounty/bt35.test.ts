// BT35 — open bounties show their age, and a long wait is said once.
// For each open bounty, status/box bounty/status --json show how long it has
// been open and how long since anything happened; when a posted bounty has
// had no new solution for 14 days, the tool says so once — for that bounty,
// ever — and never again, and never acts on it.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { importShared } from '../../../packages/box-bounty/store.js';
import { sharedRead } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, git, makeRepo, readRecordRaw, recordExists, writeRecordRaw } from './support.js';
import type { SharedRow } from '../../../packages/box-bounty/store.js';

// The pinned "now" — read by the built CLI through the test-only
// BOX_BOUNTY_NOW the wave documents. Everything below computes days from it.
const NOW = '2026-02-14T12:00:00.000Z';
const iso = (daysAgo: number): string => new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString();

const box = (cwd: string, args: string[], now: string = NOW) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: { ...process.env, BOX_BOUNTY_NOW: now }, timeout: 60000 });

const id = (n: number) => `bt-${String(n).padStart(12, '0')}`;

// A record written straight to disk (the bt28 way): seeded through the
// support helpers for the store to import, never posted for real.
const seedOpen = (repo: string, n: number, stage: string, events: { stage: string; at: string }[], fields: Record<string, unknown> = {}) => {
  const rid = id(n);
  writeRecordRaw(repo, rid, JSON.stringify({
    schemaVersion: 1,
    kind: 'box-bounty-record',
    id: rid,
    resume: { kind: 'not-recorded' },
    noteSource: 'legacy',
    stage,
    title: `seed ${n}`,
    createdAt: events[0]!.at,
    events,
    ...fields
  }, null, 2) + '\n');
  return rid;
};

const posted = (repo: string, n: number, postedDaysAgo: number, fields: Record<string, unknown> = {}) =>
  seedOpen(repo, n, 'posted', [{ stage: 'drafted', at: iso(postedDaysAgo) }, { stage: 'posted', at: iso(postedDaysAgo) }], fields);

const attempt = (n: number, daysAgo: number) => ({
  n,
  at: iso(daysAgo),
  seenAt: iso(daysAgo - 1), // already shown — a read must not rewrite the record
  commit: `${'a'.repeat(39)}${n}`,
  changed: ['a.txt'], added: [], deleted: [],
  outcome: 'answered', conflicts: null, report: []
});

const bytes = (repo: string, ids: string[]) => ids.map(rid => readRecordRaw(repo, rid));

const REMINDER = /has had no new solution for/;

describe('the age facts on every open bounty', () => {
  it('a draft created now reads open today; no solution yet — and no reminder', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    seedOpen(repo, 1, 'drafted', [{ stage: 'drafted', at: iso(0) }]);
    const run = box(repo, ['status']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('open today; no solution yet');
    expect(run.stdout).not.toMatch(REMINDER);
  });

  it('posted 13 days ago reads open 13 days — under the line, no reminder', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    posted(repo, 1, 13);
    const run = box(repo, ['status']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('open 13 days; no solution yet');
    expect(run.stdout).not.toMatch(REMINDER);
  });

  it('an ended bounty shows no age and earns no line — its JSON age facts are null', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = seedOpen(repo, 1, 'rejected', [{ stage: 'drafted', at: iso(40) }, { stage: 'posted', at: iso(30) }, { stage: 'rejected', at: iso(5) }]);
    const run = box(repo, ['status']);
    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain('open 30 days');
    expect(run.stdout).not.toMatch(REMINDER);
    const doc = JSON.parse(box(repo, ['status', '--json']).stdout) as { bounties: { id: string; openedAt: unknown; lastActivityAt: unknown }[] };
    const ended = doc.bounties.find(entry => entry.id === rid)!;
    expect(ended.openedAt).toBeNull();
    expect(ended.lastActivityAt).toBeNull();
  });
});

describe('the once-said long-wait line', () => {
  it('posted 14 days ago: said on the first status, never again — not on status, not on box bounty', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = posted(repo, 1, 14);
    const first = box(repo, ['status']);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain(`${rid} has had no new solution for 14 days`);
    expect(first.stdout).toContain(`box bounty close ${rid} --reason`);
    const second = box(repo, ['status']);
    expect(second.stdout).not.toMatch(REMINDER);
    const overview = box(repo, []);
    expect(overview.status).toBe(0);
    expect(overview.stdout).not.toMatch(REMINDER);
  });

  it('posted 30 days ago with a solution 20 days ago: last activity is the solution, and the wait is said once', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = posted(repo, 1, 30, { attempts: [attempt(1, 20)] });
    const first = box(repo, ['status']);
    expect(first.stdout).toContain('open 30 days; last solution 20 days ago');
    expect(first.stdout).toContain(`${rid} has had no new solution for 20 days`);
    expect(box(repo, ['status']).stdout).not.toMatch(REMINDER);
  });

  it('a solution newer than the post delays the line: posted 30 days ago, solution 10 days ago says nothing', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    posted(repo, 1, 30, { attempts: [attempt(1, 10)] });
    const run = box(repo, ['status']);
    expect(run.stdout).toContain('open 30 days; last solution 10 days ago');
    expect(run.stdout).not.toMatch(REMINDER);
  });

  it('the line is said once per bounty across both entrypoints: box bounty first, then status stays silent', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    posted(repo, 1, 20);
    const overview = box(repo, []);
    expect(overview.stdout).toMatch(REMINDER);
    expect(box(repo, ['status']).stdout).not.toMatch(REMINDER);
  });

  it('five stale bounties: at most three lines in one command, the oldest first, the rest on the next', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    // The oldest wait is the smallest last-activity time: n days each.
    posted(repo, 1, 60);
    posted(repo, 2, 50);
    posted(repo, 3, 40);
    posted(repo, 4, 30);
    posted(repo, 5, 20);
    const first = box(repo, ['status']);
    const lines = first.stdout.split('\n').filter(line => REMINDER.test(line));
    expect(lines.length).toBe(3);
    expect(lines.join('\n')).toContain('60 days');
    expect(lines.join('\n')).toContain('50 days');
    expect(lines.join('\n')).toContain('40 days');
    const second = box(repo, ['status']);
    const rest = second.stdout.split('\n').filter(line => REMINDER.test(line));
    expect(rest.length).toBe(2);
    expect(rest.join('\n')).toContain('30 days');
    expect(rest.join('\n')).toContain('20 days');
    expect(box(repo, ['status']).stdout).not.toMatch(REMINDER);
  });
});

describe('status --json carries the facts and keeps the document alone', () => {
  it('openedAt and lastActivityAt are ISO strings on every open bounty; reminders go to stderr', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    posted(repo, 1, 30, { attempts: [attempt(1, 20)] });
    seedOpen(repo, 2, 'drafted', [{ stage: 'drafted', at: iso(0) }]);
    const run = box(repo, ['status', '--json']);
    expect(run.status).toBe(0);
    const doc = JSON.parse(run.stdout) as { bounties: { id: string; openedAt: string; lastActivityAt: string }[] };
    const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    for (const entry of doc.bounties) {
      expect(entry.openedAt).toMatch(stamp);
      expect(entry.lastActivityAt).toMatch(stamp);
    }
    const stale = doc.bounties.find(entry => entry.id === id(1))!;
    expect(stale.openedAt).toBe(iso(30));
    expect(stale.lastActivityAt).toBe(iso(20));
    const draft = doc.bounties.find(entry => entry.id === id(2))!;
    expect(draft.openedAt).toBe(iso(0));
    // The document is one object on stdout — no reminder leaks ahead of it.
    expect(run.stdout.trimStart().startsWith('{')).toBe(true);
    expect(run.stdout).not.toMatch(REMINDER);
    expect(run.stderr).toMatch(REMINDER);
    // ...and the stderr line still counts as the once-said one.
    expect(box(repo, ['status']).stdout).not.toMatch(REMINDER);
  });
});

describe('nothing changes the records', () => {
  it('the record bytes are identical before and after every read — no automatic action', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const ids = [
      posted(repo, 1, 14),
      posted(repo, 2, 30, { attempts: [attempt(1, 20)] }),
      seedOpen(repo, 3, 'drafted', [{ stage: 'drafted', at: iso(0) }]),
      seedOpen(repo, 4, 'rejected', [{ stage: 'drafted', at: iso(40) }, { stage: 'posted', at: iso(30) }, { stage: 'rejected', at: iso(5) }])
    ];
    const before = bytes(repo, ids);
    box(repo, ['status']);
    box(repo, []);
    box(repo, ['status', '--json']);
    expect(bytes(repo, ids)).toEqual(before);
  });
});

describe('times that do not parse are absent facts, never NaN or invented dates', () => {
  it('a posted event whose at is junk: the age is named unavailable, JSON fields are null, no reminder', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = seedOpen(repo, 1, 'posted', [{ stage: 'drafted', at: iso(30) }, { stage: 'posted', at: 'junk' }]);
    const run = box(repo, ['status']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('age unavailable; no solution yet');
    expect(run.stdout).not.toContain('NaN');
    expect(run.stdout).not.toMatch(REMINDER);
    const doc = JSON.parse(box(repo, ['status', '--json']).stdout) as { bounties: { id: string; openedAt: unknown; lastActivityAt: unknown }[] };
    const entry = doc.bounties.find(row => row.id === rid)!;
    // A posted event's broken time is not republished, and the draft's
    // createdAt is never stood in as a posting date the record does not carry.
    expect(entry.openedAt).toBeNull();
    expect(entry.lastActivityAt).toBeNull();
  });

  it('a createdAt that passes the record shape but never parses: draft age unavailable, JSON nulls', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = seedOpen(repo, 1, 'drafted', [{ stage: 'drafted', at: '9999-99-99T99:99' }]);
    const run = box(repo, ['status']);
    expect(run.stdout).toContain('age unavailable; no solution yet');
    expect(run.stdout).not.toContain('NaN');
    const doc = JSON.parse(box(repo, ['status', '--json']).stdout) as { bounties: { id: string; openedAt: unknown; lastActivityAt: unknown }[] };
    const entry = doc.bounties.find(row => row.id === rid)!;
    expect(entry.openedAt).toBeNull();
    expect(entry.lastActivityAt).toBeNull();
  });

  it('an attempt at that never parses: last activity falls to real times only — the post itself', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = seedOpen(repo, 1, 'posted', [{ stage: 'drafted', at: iso(30) }, { stage: 'posted', at: iso(30) }],
      { attempts: [{ ...attempt(1, 20), at: 'junk' }] });
    const run = box(repo, ['status']);
    expect(run.stdout).not.toContain('NaN');
    const doc = JSON.parse(box(repo, ['status', '--json']).stdout) as { bounties: { id: string; lastActivityAt: unknown }[] };
    expect(doc.bounties.find(row => row.id === rid)!.lastActivityAt).toBe(iso(30));
    // The broken attempt is no new-solution fact — the 30-day wait is said once.
    expect(box(repo, ['status']).stdout).not.toMatch(REMINDER);
  });

  it('a post dated in the future clamps to open today, never a negative or NaN', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    posted(repo, 1, -5);
    const run = box(repo, ['status']);
    expect(run.stdout).toContain('open today; no solution yet');
    expect(run.stdout).not.toContain('NaN');
  });
});

describe('a shared-only stale bounty', () => {
  // One shared row written the way the chain import writes it — record and
  // chain never touched by the notice, only the machine-local said state.
  const sharedPosted = (repo: string, n: number, postedDaysAgo: number): string => {
    const rid = id(n);
    importShared(repo, [{
      id: rid, stage: 'posted', open: true,
      createdAt: iso(postedDaysAgo), updatedAt: iso(postedDaysAgo), endedAt: null,
      record: {
        schemaVersion: 1, kind: 'box-bounty-record', id: rid,
        title: `shared seed ${n}`, noteSource: 'legacy', stage: 'posted',
        content: { task: { file: '(shared)', text: 'task text' }, note: null, tool: 'box-bounty@0.1.0' },
        createdAt: iso(postedDaysAgo),
        resume: { kind: 'not-recorded' },
        events: [{ stage: 'posted', at: iso(postedDaysAgo), destination: `https://github.com/owner/project/issues/${n}` }],
        attempts: [],
        github: {
          repository: 'owner/project', account: 'poster', kind: 'history',
          branch: `box-bounty/${rid}`, commit: 'a'.repeat(40), title: `shared seed ${n}`,
          body: '', state: 'posted', issue: { number: n, url: `https://github.com/owner/project/issues/${n}` }, pending: null
        },
        shared: true
      } as SharedRow['record'],
      searchText: `${rid}\nshared seed ${n}`
    }]);
    return rid;
  };

  it('is noticed once across entrypoints; the line names where it can end, and the chain and row are untouched', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const rid = sharedPosted(repo, 1, 20);
    const rowBefore = JSON.stringify(sharedRead(repo, rid));
    const first = box(repo, ['status']);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain(`${rid} has had no new solution for 20 days`);
    // `box bounty close` on this clone would refuse 'shared-only' — the line
    // names the fact and where ending happens instead of quoting it.
    expect(first.stdout).toContain('posted from another machine');
    expect(box(repo, ['status']).stdout).not.toMatch(REMINDER);
    expect(box(repo, []).stdout).not.toMatch(REMINDER);
    // Nothing written back: no local record, no chain ref, the shared row
    // itself byte-identical.
    expect(recordExists(repo, rid)).toBe(false);
    expect(git(repo, ['for-each-ref', 'refs/box-bounty'])).toBe('');
    expect(JSON.stringify(sharedRead(repo, rid))).toBe(rowBefore);
  });
});
