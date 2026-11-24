// BT100's harness, rebuilt from its notes for BT101 (stage 3): the checks the event log was chosen on, run on the real
// code. Reads run as separate CLI processes, because the hand-merge scan runs once per process, as on the command line.
//   1  no lost update: a stale copy written after another writer applied keeps both changes
//   2  a fault midway, then a rerun: one issue, one comment per marker
//   3  reads send nothing: after a hand merge, look, status, status --json and hook start write nothing to GitHub and
//      move no remote ref; what the merge owes waits in the outbox, and the next close sends it and says so
//   5  "what changed in my name", from the store alone
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { closeBounty, loadRecord, persistRecord, postBounty, transitionTo } from '../../../packages/box-bounty/index.js';
import { outboxRows } from '../../../packages/box-bounty/store.js';
import { fixture, postedFixture, refused } from './github-fixture.js';
import { CLI_DIST, git } from './support.js';

const cli = (root: string, ...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: root, encoding: 'utf8', env: process.env, timeout: 120000 });
// A write is any gh call carrying a payload, a GraphQL read excepted (it passes one to read).
const writes = (calls: string[][]) => calls.filter(call => call.includes('--method') && !call.some(arg => arg === 'graphql'));
const pending = (repo: string, id: string) => outboxRows(repo, id).filter(row => row.state === 'pending').map(row => row.key).sort();

describe('BT100 harness, on BT101', () => {
  it('check 1: a stale copy written after another writer applied keeps both changes', () => postedFixture(({ repo, id }) => {
    const stale = loadRecord(repo, id);
    transitionTo(repo, loadRecord(repo, id), 'applied', { command: 'merged', attempt: 1 });
    (stale as { why?: string }).why = 'the stale writer';
    persistRecord(repo, stale);
    expect(loadRecord(repo, id).stage).toBe('applied');
    expect(loadRecord(repo, id).why).toBe('the stale writer');
  }, { collected: true }));

  it('check 2: a lost issue response and a failed comment, each rerun: one issue, one comment per marker', () => fixture(({ repo, id, state, update }) => {
    update({ loseIssueResponse: true });
    refused(() => postBounty(repo, id, 'github'), 'github-post-incomplete');
    postBounty(repo, id, 'github');
    expect(state().issues).toHaveLength(1);
    update({ fail: '/comments' });
    closeBounty(repo, id);
    update({ fail: undefined });
    closeBounty(repo, id);
    const markers = state().comments.map(comment => /<!-- box-bounty:[^ ]+ -->/.exec(comment.body)?.[0]).filter(Boolean);
    expect(markers.length).toBeGreaterThan(0);
    expect(new Set(markers).size).toBe(markers.length);
  }));

  it('check 3: after a hand merge, reads as processes send nothing; the next close sends what they owed and says so', () => postedFixture(({ repo, bare, id, state, waitingPr }) => {
    git(repo, ['merge', '--no-ff', '-m', 'hand merge', waitingPr]);
    const before = state().calls.length;
    const refs = git(bare, ['for-each-ref']);
    for (const args of [['look', id, '1'], ['status'], ['status', '--json'], ['status', id], ['hook', 'start']]) {
      const run = cli(repo, ...args);
      expect(run.status, `${args.join(' ')}: ${run.stderr}`).toBe(0);
    }
    expect(writes(state().calls.slice(before)), 'a read wrote to GitHub').toEqual([]);
    expect(git(bare, ['for-each-ref']), 'a read moved a remote ref').toBe(refs);
    expect(state().issues[0]!.state).toBe('open');
    expect(loadRecord(repo, id).stage).toBe('applied');
    expect(pending(repo, id)).toEqual([`chain:${id}`, `decision:${id}`]);
    const close = cli(repo, 'close', id);
    expect(close.status, close.stderr).toBe(0);
    expect(close.stdout + close.stderr).toContain(`sent decision:${id}`);
    expect(close.stdout + close.stderr).toContain(`sent chain:${id}`);
    expect(state().issues[0]!.state).toBe('closed');
    expect(pending(repo, id)).toEqual([]);
  }, { collected: true }));

  it('check 5: what changed in my name, from the store alone', () => postedFixture(({ repo, id }) => {
    closeBounty(repo, id);
    const run = cli(repo, 'status', id, '--history');
    expect(run.status, run.stderr).toBe(0);
    for (const expected of ['created', 'patched', `owed      issue:${id}`, `sent      issue:${id}`, `owed      decision:${id}`, `sent      decision:${id}`]) expect(run.stdout).toContain(expected);
  }));
});
