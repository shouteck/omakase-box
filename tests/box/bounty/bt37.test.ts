// BT37 — the five fixes real use exposed:
//  1. `apply` says the merge is local to this checkout and the exact publish
//     command (git's own ahead/upstream convention) — the tool never pushes
//     (its designed close-up removes only the bounty branch, nothing else).
//  2. status counts waiting, uncollected pull requests — never
//     "no solution yet" beside one; --json's lastActivityAt follows.
//  3. describe names the case a solver cannot help either.
//  4. the tracked-records warning is said once per checkout (status and
//     config share the 'records-tracked' topic); --full always states it.
//  5. the OPEN index beside the records is rewritten only when its content
//     changed — bytes
//     and mtime stand, and a CRLF-smudged file under autocrlf is not a change.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { postedFixture } from './github-fixture.js';
import { boxFile, CLI_DIST, git, makeRepo, RECORDS_DIR_REL } from './support.js';
import { bountyAge, waitingPullRequests } from '../../../packages/box-bounty/render.js';
import type { BountyRecord } from '../../../packages/box-bounty/index.js';

const box = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

// Matches the warning without naming the records folder — record-access
// guard keeps that spelling out of test files (support.ts is the only
// allowed reader).
const RECORDS_WARNING = /records: \d+ file\(s\).*are tracked in Git/;
const PUBLISH_LINE = /not on GitHub yet:/;

// What the apply run must NOT move: the remote's main and every pull ref.
// (The bounty branch's removal is the designed close-up, not a publish.)
const remoteSafeRefs = (bare: string): string =>
  git(bare, ['for-each-ref', 'refs/heads/main', 'refs/pull']);

// A minimal record shape for the two age helpers — enough fields for
// attemptsOf and the posted event, typed as what they read.
const recordWith = (fields: Record<string, unknown>): BountyRecord => ({
  id: 'bt-0000000000aa', title: 'seed', stage: 'posted',
  createdAt: '2026-10-01T00:00:00.000Z',
  events: [{ stage: 'drafted', at: '2026-10-01T00:00:00.000Z' }, { stage: 'posted', at: '2026-10-01T00:00:00.000Z' }],
  ...fields
} as unknown as BountyRecord);

const PR = (n: number, commit: string, at: string) => ({ n, commit, at });

describe('1. an applied merge says it is local and how it reaches GitHub', () => {
  it('with an upstream: ahead count and `git push`; main and pull refs untouched', () => postedFixture(({ repo, id, bare }) => {
    // Give main an upstream without a fetch: the remote-tracking ref plus the
    // branch config lines git push -u would have written.
    git(repo, ['update-ref', 'refs/remotes/origin/main', git(repo, ['rev-parse', 'main'])]);
    git(repo, ['config', 'branch.main.remote', 'origin']);
    git(repo, ['config', 'branch.main.merge', 'refs/heads/main']);
    const remoteBefore = remoteSafeRefs(bare);
    const run = box(repo, ['apply', id, '1']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('applied');
    const line = run.stdout.split('\n').find(l => PUBLISH_LINE.test(l));
    expect(line, `no publish line in:\n${run.stdout}`).toMatch(/this branch is \d+ commit\(s\) ahead of origin\/main — publish it with: git push$/);
    expect(remoteSafeRefs(bare)).toBe(remoteBefore);
  }));

  it('with no upstream: `git push -u origin <branch>`; main and pull refs untouched', () => postedFixture(({ repo, id, bare }) => {
    const remoteBefore = remoteSafeRefs(bare);
    const run = box(repo, ['apply', id, '1']);
    expect(run.status).toBe(0);
    const line = run.stdout.split('\n').find(l => PUBLISH_LINE.test(l));
    expect(line, `no publish line in:\n${run.stdout}`).toBe('not on GitHub yet: this branch has no upstream — publish it with: git push -u origin main');
    expect(remoteSafeRefs(bare)).toBe(remoteBefore);
  }));

  it('detached HEAD: the local fact without a fabricated publish command', () => postedFixture(({ repo, id, bare }) => {
    git(repo, ['checkout', '-q', '--detach', 'HEAD']);
    const remoteBefore = remoteSafeRefs(bare);
    const run = box(repo, ['apply', id, '1']);
    expect(run.status).toBe(0);
    const line = run.stdout.split('\n').find(l => PUBLISH_LINE.test(l));
    expect(line, `no publish line in:\n${run.stdout}`).toBe('not on GitHub yet: the merge is local to this checkout');
    expect(line).not.toContain('git push');
    expect(remoteSafeRefs(bare)).toBe(remoteBefore);
  }));

  it('a recognised hand merge comments the honest clause on the issue', () => postedFixture(({ repo, id, waitingPr, bare, state }) => {
    // The tool must have seen the pull request before the hand merge lands.
    expect(box(repo, ['status']).status).toBe(0);
    // Merge the solution on the bounty's branch with plain git — the next
    // bounty command recognises it, ends the bounty and comments the decision.
    git(repo, ['fetch', '-q', bare, `+refs/pull/1/head:refs/box-test/pr-${waitingPr.slice(0, 8)}`]);
    git(repo, ['merge', '--no-ff', '-m', 'solver solution', waitingPr]);
    const run = box(repo, ['status']);
    expect(run.status).toBe(0);
    const bodies = state().comments.map(comment => comment.body);
    const decision = bodies.find(body => body.includes(`<!-- box-bounty:${id}:merged -->`));
    expect(decision, `no merged comment in: ${JSON.stringify(bodies)}`).toContain('merged in the owner\'s checkout; it reaches this repository when the owner pushes it');
  }));
});

describe('2. status never says "no solution yet" while a pull request waits', () => {
  it('a waiting uncollected pull request shows "1 solution(s) waiting"', () => postedFixture(({ repo, id }) => {
    // The first status refreshes outside state: the stand-in's PR lands on
    // availablePullRequests. Nothing is collected.
    const run = box(repo, ['status']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('1 solution(s) waiting');
    expect(run.stdout).not.toContain('no solution yet');
    const doc = JSON.parse(box(repo, ['status', '--json']).stdout) as { bounties: { id: string; openedAt: unknown; lastActivityAt: unknown }[] };
    const entry = doc.bounties.find(row => row.id === id)!;
    expect(entry.openedAt).not.toBeNull();
    // The newest waiting pull request's time is the latest activity — recorded,
    // so it matches the ISO contract rather than staying null.
    expect(entry.lastActivityAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  }));

  it('seen + available of the same request count once; a collected one counts never', () => {
    const record = recordWith({
      attempts: [{ n: 1, at: '2026-10-05T00:00:00.000Z', commit: 'c'.repeat(40), changed: [], added: [], deleted: [], outcome: 'answered', conflicts: null, report: [] }],
      github: {
        availablePullRequests: [PR(7, 'b'.repeat(40), '2026-10-04T00:00:00.000Z'), PR(8, 'c'.repeat(40), '2026-10-06T00:00:00.000Z')],
        seenPullRequests: [PR(7, 'b'.repeat(40), '2026-10-04T00:00:00.000Z'), PR(8, 'c'.repeat(40), '2026-10-06T00:00:00.000Z')]
      }
    });
    // PR 7 listed twice counts once; PR 8's commit is the collected attempt —
    // it is a solution already, not waiting.
    expect(waitingPullRequests(record)).toEqual([PR(7, 'b'.repeat(40), '2026-10-04T00:00:00.000Z')]);
  });

  it('a malformed waiting time makes lastActivityAt unavailable, never a false older fact', () => {
    const record = recordWith({
      github: { availablePullRequests: [PR(7, 'b'.repeat(40), 'not-a-time')] }
    });
    expect(bountyAge(record).lastActivityAt).toBeNull();
    const good = recordWith({
      github: { availablePullRequests: [PR(7, 'b'.repeat(40), '2026-10-05T00:00:00.000Z')] }
    });
    expect(bountyAge(good).lastActivityAt).toBe('2026-10-05T00:00:00.000Z');
  });
});

describe('3. describe names the case a solver cannot help either', () => {
  it('the not-worth-it list carries the new clause', () => {
    const repo = makeRepo({ 'app.txt': 'seed\n' });
    const run = box(repo, ['describe']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('a solver could not do');
    expect(run.stdout).toContain('it needs a machine, access or data you cannot share');
  });
});

describe('4. the tracked-records warning is said once per checkout', () => {
  it('first status warns; second does not; config shares it; --full and --json always state it', () => {
    const repo = makeRepo({ 'TASK.md': 'seed\n' });
    expect(box(repo, ['create', '--task', 'TASK.md', '--why', 'x']).status).toBe(0);
    git(repo, ['add', '-f', RECORDS_DIR_REL]); // records tracked on purpose, as here
    const first = box(repo, ['status']);
    expect(first.status).toBe(0);
    expect(first.stdout).toMatch(RECORDS_WARNING);
    expect(box(repo, ['status']).stdout).not.toMatch(RECORDS_WARNING);
    // One shared topic: `config` does not repeat it either.
    const config = box(repo, ['config']);
    expect(config.status).toBe(0);
    expect(config.stdout).not.toMatch(RECORDS_WARNING);
    // --full still always states the tracking fact.
    for (const args of [['status', '--full'], ['config', '--full']]) {
      const full = box(repo, args);
      expect(full.status).toBe(0);
      expect(full.stdout).toMatch(RECORDS_WARNING);
    }
    // And --json always carries the fact as data.
    const doc = JSON.parse(box(repo, ['status', '--json']).stdout) as { records: { tracked: boolean } };
    expect(doc.records.tracked).toBe(true);
  });
});

describe('5. OPEN is rewritten only when it changes', () => {
  // A posted bounty with a waiting pull request: every `status` persists the
  // record again (seen-pull-request bookkeeping), so each run reaches the
  // OPEN write while its content stands unchanged — the phantom-dirty case
  // real use hit under autocrlf.
  it('two consecutive status runs leave OPEN byte-identical, mtime included', () => postedFixture(({ repo }) => {
    // The first two runs are real changes: the refresh lands, then the
    // pull requests are marked seen — OPEN's own line reflects both. Only
    // the settled third run is the no-change case.
    expect(box(repo, ['status']).status).toBe(0);
    expect(box(repo, ['status']).status).toBe(0);
    const openPath = boxFile(repo, 'OPEN');
    const before = { bytes: readFileSync(openPath), mtime: statSync(openPath).mtimeMs };
    expect(box(repo, ['status']).status).toBe(0);
    expect(readFileSync(openPath).equals(before.bytes)).toBe(true);
    expect(statSync(openPath).mtimeMs).toBe(before.mtime);
  }));

  it('a CRLF-smudged OPEN under autocrlf is not a change — still no rewrite', () => postedFixture(({ repo }) => {
    git(repo, ['config', 'core.autocrlf', 'true']);
    // Let the content settle first, as above.
    expect(box(repo, ['status']).status).toBe(0);
    expect(box(repo, ['status']).status).toBe(0);
    const openPath = boxFile(repo, 'OPEN');
    // What the file looks like after an autocrlf checkout wrote it back.
    writeFileSync(openPath, readFileSync(openPath, 'utf8').replaceAll('\n', '\r\n'));
    const before = { bytes: readFileSync(openPath), mtime: statSync(openPath).mtimeMs };
    expect(box(repo, ['status']).status).toBe(0);
    expect(readFileSync(openPath).equals(before.bytes)).toBe(true);
    expect(statSync(openPath).mtimeMs).toBe(before.mtime);
    // A real change still lands: close the bounty and OPEN rewrites.
    const closed = box(repo, ['close', '--reason', 'done']);
    expect(closed.status).toBe(0);
    expect(readFileSync(openPath, 'utf8').replaceAll('\r\n', '\n')).toBe('open bounties: none\n');
  }));
});
