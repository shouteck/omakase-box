// BT38 — direct tests for four CONTRACTS.md guarantees that were only ever
// proven as side effects: T1 (unasked text stays constant per state), T4
// (reads change nothing shared), C5 (the snapshot commit form resolves —
// post-BT24 it is created during `create` but no longer pinned), and PL3
// (every outcome is a named state with a next step). Each of T1, T4 and PL3
// was broken once in a scratch build and the failure recorded in waves/BT38.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowRepository, changeConfig, createBounty, finalizeBounty, loadRecord, planBounty } from '../../../packages/box-bounty/index.js';
import { refreshGitHubStatus } from '../../../packages/box-bounty/github.js';
import { sharedPostedFixture } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, readRecord, runRoot, write } from './support.js';

const cli = (cwd: string, args: readonly string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

// Every reading command the track stage of docs/box-v4/CONTRACTS.md names —
// the overview, status in every listed form, find, the hook reads, the
// instruction-file sync each command performs, `look` as a read — plus the
// reads the brief adds: describe (--rules), help, config (--full/--json) and
// `post --preview`, which only computes what a post would publish.
const readCommands = (id: string, draftId: string): readonly string[][] => [
  [], // `box bounty` overview
  ['status'],
  ['status', '--full'],
  ['status', '--json'],
  ['status', '--comments'],
  ['status', id],
  ['status', '--since', '2020-01-01T00:00:00.000Z'],
  ['find', 'repair'],
  ['describe'],
  ['describe', '--rules'],
  ['help'],
  ['config'],
  ['config', '--full'],
  ['config', '--json'],
  ['hook'],
  ['hook', 'start'],
  ['look', id, '1'],
  ['post', draftId, '--preview'],
];

describe('BT38 contract guarantees proven directly', () => {
  it('T1: a run that changes nothing leaves the instruction block byte- and time-identical', { timeout: 180000 }, () => {
    const world = sharedPostedFixture({ collected: true });
    world.run(() => {
      write(world.repo, 'AGENTS.md', 'team notes\n');
      changeConfig(world.repo, 'set', 'instructions', 'true');
      // A drafted second bounty gives `post --preview` a postable record.
      const draft = createBounty({ repoPath: world.repo, taskPath: join(world.repo, 'TASK.md'), why: 'a second hand-off', title: 'Second task' });
      const file = join(world.repo, 'AGENTS.md');
      const beforeBytes = readFileSync(file);
      const beforeMtime = statSync(file).mtimeMs;
      expect(beforeBytes.toString('utf8')).toContain('<!-- box-bounty -->');
      for (const args of readCommands(world.id, draft.id)) {
        for (let run = 0; run < 2; run += 1) {
          const result = cli(world.repo, args);
          expect(result.status, `box bounty ${args.join(' ')} exited ${result.status}: ${result.stderr}`).toBe(0);
        }
        expect(readFileSync(file).equals(beforeBytes), `box bounty ${args.join(' ')} changed the instruction block`).toBe(true);
        expect(statSync(file).mtimeMs, `box bounty ${args.join(' ')} touched the instruction file`).toBe(beforeMtime);
      }
      // A changed fact must change the block: a new pull request arrives.
      world.pr('solver');
      refreshGitHubStatus(world.repo, loadRecord(world.repo, world.id));
      expect(readFileSync(file).equals(beforeBytes), 'a new solution left the instruction block unchanged').toBe(false);
    });
  });

  it('T4: every reading command appends no chain event and pushes nothing', { timeout: 180000 }, () => {
    const world = sharedPostedFixture({ collected: true });
    world.run(() => {
      const draft = createBounty({ repoPath: world.repo, taskPath: join(world.repo, 'TASK.md'), why: 'a second hand-off', title: 'Second task' });
      const remoteRefs = () => execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'ls-remote', world.bare, 'refs/box-bounty/*'], { encoding: 'utf8' });
      const localRefs = () => git(world.repo, ['for-each-ref', 'refs/box-bounty', '--format=%(refname) %(objectname)']);
      const remoteBefore = remoteRefs();
      const localBefore = localRefs();
      // The fixture posted: a chain exists on both sides before any read.
      expect(remoteBefore).toContain(`refs/box-bounty/${world.id}`);
      expect(localBefore).toContain(`refs/box-bounty/${world.id}`);
      for (const args of readCommands(world.id, draft.id)) {
        const result = cli(world.repo, args);
        expect(result.status, `box bounty ${args.join(' ')} exited ${result.status}: ${result.stderr}`).toBe(0);
      }
      expect(localRefs(), 'a read appended a chain event or moved a chain tip').toBe(localBefore);
      expect(remoteRefs(), 'a read pushed to the shared bounty memory').toBe(remoteBefore);
    });
  });

  it('C5: the snapshot object create makes resolves and rebuilds the captured state (post-BT24: unpinned)', () => {
    const repo = makeRepo({ 'TASK.md': 'Fix the sum.\n', 'app.txt': 'broken\n' }, current => {
      write(current, 'app.txt', 'changed while drafting\n');
      write(current, 'extra.txt', 'untracked work\n');
    });
    const plan = planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'stuck' });
    // The capture is a real commit object Git itself resolves, and its tree
    // is the captured working state — committed files, uncommitted edits and
    // untracked files alike.
    expect(git(repo, ['cat-file', '-t', plan.snapshot.commit])).toBe('commit');
    expect(git(repo, ['cat-file', '-t', plan.snapshot.tree])).toBe('tree');
    expect(git(repo, ['ls-tree', '-r', '--name-only', plan.snapshot.commit]).split('\n')).toEqual(
      expect.arrayContaining(['TASK.md', 'app.txt', 'extra.txt']));
    // The tree's bytes are the captured working bytes, not the base commit's.
    expect(git(repo, ['show', `${plan.snapshot.commit}:app.txt`]).trim()).toBe('changed while drafting');
    // Post-BT24 contract state: finalizing pins no ref and stores no
    // `snapshot` field — the object stays resolvable but unreferenced, so it
    // is a cache of the capture, not a guaranteed rebuild point.
    const { id } = finalizeBounty(plan);
    expect('snapshot' in readRecord(repo, id)).toBe(false);
    expect(git(repo, ['for-each-ref', `refs/box-bounty/${id}`])).toBe('');
    expect(git(repo, ['cat-file', '-t', plan.snapshot.commit])).toBe('commit');
  });

  it('PL3: a refusal from every CONTRACTS.md section names a state and a next step', { timeout: 120000 }, () => {
    const repo = makeRepo({ 'TASK.md': 'Fix the sum.\n' });
    const draft = createBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'stuck' });
    const notARepo = runRoot('bt38-norepo');
    // One representative refusal per CONTRACTS.md section, driven through the
    // built CLI. Expected reason names are asserted in the output so a moved
    // refusal is caught, not silently re-aimed.
    // The post-section case: two GitHub remotes both on the owner's allowed
    // list — the repository cannot be settled and post refuses by name.
    const repoTwoRemotes = makeRepo({ 'TASK.md': 'Fix the sum.\n' });
    git(repoTwoRemotes, ['remote', 'add', 'origin', 'git@github.com:a/one.git']);
    git(repoTwoRemotes, ['remote', 'add', 'upstream', 'git@github.com:b/two.git']);
    allowRepository(repoTwoRemotes, 'a/one');
    allowRepository(repoTwoRemotes, 'b/two');
    const draftTwo = createBounty({ repoPath: repoTwoRemotes, taskPath: join(repoTwoRemotes, 'TASK.md'), why: 'stuck' });
    const cases: readonly { section: string; cwd: string; args: readonly string[]; reason: string }[] = [
      { section: 'create', cwd: notARepo, args: ['create', '--task', join(repo, 'TASK.md'), '--why', 'x'], reason: 'not-a-repository' },
      { section: 'post', cwd: repoTwoRemotes, args: ['post', draftTwo.id], reason: 'repository-several-allowed' },
      { section: 'track', cwd: repo, args: ['find'], reason: 'missing-query' },
      { section: 'review', cwd: repo, args: ['look', draft.id, '1'], reason: 'unknown-attempt' },
      { section: 'pay', cwd: repo, args: ['create', '--task', 'TASK.md', '--why', 'x', '--reward', '5'], reason: 'reward-agent-set' },
      { section: 'memory', cwd: repo, args: ['status', 'bt-000000000000'], reason: 'unknown-bounty' },
      { section: 'the owner', cwd: repo, args: ['allow', draft.id], reason: 'owner-answer-not-waiting' },
      { section: 'the platform', cwd: repo, args: ['undo'], reason: 'command-removed' },
    ];
    for (const entry of cases) {
      const result = cli(entry.cwd, entry.args);
      const out = `${result.stdout}\n${result.stderr}`;
      expect(result.status, `${entry.section}: box bounty ${entry.args.join(' ')} exited 0 —\n${out}`).not.toBe(0);
      expect(out, `${entry.section}: expected ${entry.reason} —\n${out}`).toContain(`(${entry.reason})`);
      expect(out, `${entry.section}: refusal names no next step —\n${out}`).toMatch(/next: /);
    }
  });

  it('PL3 (decide): a decide-stage refusal names a next step', { timeout: 120000 }, () => {
    const world = sharedPostedFixture();
    world.run(() => {
      const result = cli(world.repo, ['apply', world.id]);
      const out = `${result.stdout}\n${result.stderr}`;
      expect(result.status, `apply on a posted bounty with no attempts exited 0 —\n${out}`).not.toBe(0);
      expect(out).toContain('(wrong-stage)');
      expect(out).toMatch(/next: /);
    });
  });
});
