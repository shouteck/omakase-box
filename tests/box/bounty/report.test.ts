import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerBounty, applyBounty, attemptsOf, BountyRefused, confirmBounty, finalizeBounty, planBounty, postBounty, renderStatus, resolveRepoRoot, undoBounty } from '../../../packages/box-bounty/index.js';
import type { BountyManifest, BountyRecord, CreateOptions } from '../../../packages/box-bounty/index.js';
import { fingerprint, git, listTree, makeRepo, runRoot, write } from './support.js';

// BT3a — report, do not judge. `answer` checks the returned folder and writes a
// report of facts: the check before and after, the declared guard, the change
// with counts and lines, a dry merge read of the current code, eager flags, and
// what was not checked. A passing answer stops at verified; a failing one is a
// recorded attempt and the bounty stays open. `apply` names the attempt;
// `undo` reverses an applied merge. Nothing in the report is a verdict.

const readRecord = (repo: string, id: string): BountyRecord =>
  JSON.parse(readFileSync(join(repo, '.box', 'bounties', `${id}.json`), 'utf8')) as BountyRecord;

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('out'), 'bounty'), ...extra };
}

function posted(repo: string, extra: Partial<CreateOptions> = {}): { id: string; delivered: string } {
  const result = finalizeBounty(planBounty(options(repo, extra)));
  confirmBounty(repo, result.id);
  const { destination } = postBounty(repo, result.id, join(runRoot('dest'), 'inbox'));
  return { id: result.id, delivered: destination };
}

function returned(delivered: string, mutate?: (dir: string) => void): string {
  const dir = join(runRoot('answer'), 'returned');
  cpSync(delivered, dir, { recursive: true });
  mutate?.(dir);
  return dir;
}

// A mechanical check: exits 0 only once src/app.py contains 'fixed'.
const FIX_CHECK = ['node', '-e', 'process.exit(require("node:fs").readFileSync("src/app.py", "utf8").includes("fixed") ? 0 : 1)'];
// A check that prints a line, for the output-tail fact.
const LOUD_CHECK = ['node', '-e', 'console.log("probe still red"); process.exit(require("node:fs").readFileSync("src/app.py", "utf8").includes("fixed") ? 0 : 1)'];
// A check that passes only when the environment carries a mark — lets a test
// make the check pass on the untouched snapshot, proving nothing.
const MARKED_CHECK = ['node', '-e', 'process.exit(process.env.BOX_BT3A_MARK === "1" ? 0 : 1)'];
// A guard that holds while keep.txt exists.
const KEEP_GUARD = ['node', '-e', 'process.exit(require("node:fs").existsSync("keep.txt") ? 0 : 1)'];

const expectRefusal = (fn: () => unknown, reason: string): BountyRefused => {
  try {
    fn();
    expect.unreachable('expected a refusal');
  } catch (error) {
    expect(error).toBeInstanceOf(BountyRefused);
    expect((error as BountyRefused).reason).toBe(reason);
    return error as BountyRefused;
  }
  throw new Error('unreachable');
};

const refExists = (repo: string, ref: string): boolean =>
  spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', ref], { encoding: 'utf8' }).status === 0;

describe('the fact report', () => {
  it('states the check before and after, the guard, the change, the merge read, flags, what was not checked, and the next command', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));

    const result = answerBounty(repo, id, dir);
    const report = result.report.join('\n');
    // The check: what it did at create (exited 1) and what it does on the answer.
    expect(report).toContain('check: node -e');
    expect(report).toContain('exited 1 at create');
    expect(report).toContain('exits 0');
    expect(report).toContain('guard: none declared');
    expect(report).toContain('1 changed, 0 added, 0 deleted');
    expect(report).toContain('lines added');
    expect(report).toContain('current code: the answer would merge cleanly');
    // src/app.py is named in the check command's own text — flagged, not blocked.
    expect(report).toContain('flag: the answer edits src/app.py, which the check command');
    expect(report).toContain('not checked:');
    expect(report).toContain(`next: box bounty apply ${id} 1`);
  });

  it('a failing answer reports the exit and the tail, keeps the attempt and returns the bounty to posted', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: LOUD_CHECK });
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'still broken\n'));

    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('check-failed');
    const report = result.report.join('\n');
    expect(report).toContain('exits 1');
    expect(report).toContain('check output tail:');
    expect(report).toContain('probe still red');
    expect(report).toContain('not checked:');
    expect(report).toContain('the bounty is open again');
  });

  it('a reviewed answer reports that no check was declared', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'y\n'));
    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('answered');
    expect(result.report.join('\n')).toContain('check: none declared');
  });
});

describe('flags — observations, never blocks', () => {
  it('an answer editing the file the check names still passes the check and is flagged', () => {
    // The check IS the file the solver edited — the answer rewrites the test
    // itself to exit 0. It passes, and the report says what it did.
    const repo = makeRepo({ 'tests/app.test.js': 'process.exit(1)\n' });
    const { id, delivered } = posted(repo, { check: ['node', 'tests/app.test.js'] });
    const dir = returned(delivered, root => write(root, 'repo/tests/app.test.js', 'process.exit(0)\n'));

    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('verified');
    const report = result.report.join('\n');
    expect(report).toContain("which the check command's own text names");
    expect(report).toContain('marked as a test by the stated rule');
  });

  it('adds, deletes and a large change are each flagged', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'stale.txt': 'gone\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    const dir = returned(delivered, root => {
      write(root, 'repo/src/app.py', 'fixed\n');
      rmSync(join(root, 'repo', 'stale.txt'));
      for (let i = 0; i < 22; i += 1) write(root, `repo/gen/f${i}.txt`, `f${i}\n`);
    });
    const report = answerBounty(repo, id, dir).report.join('\n');
    expect(report).toContain('the answer adds 22 file(s)');
    expect(report).toContain('the answer deletes 1 file(s)');
    expect(report).toContain('above the stated size');
  });

  it('a check that passes on the untouched snapshot is flagged as saying nothing', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: MARKED_CHECK });
    process.env.BOX_BT3A_MARK = '1';
    try {
      const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'anything\n'));
      const result = answerBounty(repo, id, dir);
      expect(result.outcome).toBe('verified'); // the check exits 0 — but so does it on the shipped set
      expect(result.report.join('\n')).toContain('its pass on this answer says nothing');
    } finally {
      delete process.env.BOX_BT3A_MARK;
    }
  });
});

describe('several answers — each is its own attempt', () => {
  it('a failing attempt is kept; a later passing attempt is #2 and apply picks it alone', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    const bad = returned(delivered, root => write(root, 'repo/src/app.py', 'still broken\n'));
    expect(answerBounty(repo, id, bad).outcome).toBe('check-failed');
    expect(readRecord(repo, id).stage).toBe('posted');

    const good = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    const second = answerBounty(repo, id, good);
    expect(second.outcome).toBe('verified');
    expect(second.attempt).toBe(2);
    const record = readRecord(repo, id);
    expect(record.attempts).toHaveLength(2);
    expect(refExists(repo, `refs/box-bounty/${id}-answer-1`)).toBe(true);
    expect(refExists(repo, `refs/box-bounty/${id}-answer-2`)).toBe(true);
    // status lists the attempts with the passing one first.
    const status = renderStatus(resolveRepoRoot(repo));
    const firstIdx = status.indexOf('#2 verified');
    const secondIdx = status.indexOf('#1 check-failed');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);

    expect(applyBounty(repo, id).outcome).toBe('applied'); // only one applicable — no number needed
    expect(refExists(repo, `refs/box-bounty/${id}-answer-1`)).toBe(false); // the other's ref is gone
    expect(refExists(repo, `refs/box-bounty/${id}-answer-2`)).toBe(false);
    expect(refExists(repo, `refs/box-bounty/${id}`)).toBe(false);
  });

  it('two verified attempts make apply name which one; apply <n> lands it', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    const first = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    expect(answerBounty(repo, id, first).outcome).toBe('verified');
    const second = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed again\n'));
    expect(answerBounty(repo, id, second).outcome).toBe('verified');

    const refusal = expectRefusal(() => applyBounty(repo, id), 'apply-ambiguous');
    expect(refusal.message).toContain('#1');
    expect(refusal.message).toContain('#2');
    expectRefusal(() => applyBounty(repo, id, 9), 'unknown-attempt');

    const applied = applyBounty(repo, id, 2);
    expect(applied.outcome).toBe('applied');
    expect(applied.attempt).toBe(2);
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('fixed again\n');
    expect(readRecord(repo, id).events.at(-1)!.attempt).toBe(2);
  });
});

describe('guard — a must-keep-passing command declared at create', () => {
  it('create runs the guard on the shipped set and refuses by name when it fails or cannot run', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'keep.txt': 'here\n' });
    const failing = expectRefusal(() => finalizeBounty(planBounty(options(repo, { check: FIX_CHECK, guard: ['node', '-e', 'process.exit(3)'] }))), 'guard-failed');
    expect(failing.message).toContain('exits 3');
    expectRefusal(() => finalizeBounty(planBounty(options(repo, { check: FIX_CHECK, guard: ['box-bt3a-no-such-program'] }))), 'guard-unrunnable');
    // Neither refusal left a folder or a record behind.
    const bountiesDir = join(repo, '.box', 'bounties');
    expect(existsSync(bountiesDir) ? listTree(bountiesDir) : []).toEqual([]);
  });

  it('answer runs the guard after the check and reports its exit as a fact', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'keep.txt': 'here\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK, guard: KEEP_GUARD });
    const manifest = JSON.parse(readFileSync(join(delivered, 'bounty.json'), 'utf8')) as BountyManifest;
    expect(manifest.guard).toEqual({ argv: KEEP_GUARD });
    expect(manifest.verification?.guard?.result).toBe('pass');

    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    const report = answerBounty(repo, id, dir).report.join('\n');
    expect(report).toContain('guard: node -e');
    expect(report).toContain('exits 0 on the answer');
  });

  it('a guard red on the answer is a fact in the report, not a verdict — the attempt still verifies', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'keep.txt': 'here\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK, guard: KEEP_GUARD });
    const dir = returned(delivered, root => {
      write(root, 'repo/src/app.py', 'fixed\n');
      rmSync(join(root, 'repo', 'keep.txt'));
    });
    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('verified');
    expect(result.report.join('\n')).toContain('exits 1 on the answer');
    expect(applyBounty(repo, id).outcome).toBe('applied'); // the decision is the agent's
  });
});

describe('undo — reverses an applied merge as a new commit', () => {
  const appliedRepo = () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    answerBounty(repo, id, dir);
    const treeBefore = fingerprint(repo).files;
    applyBounty(repo, id);
    return { repo, id, treeBefore };
  };

  it('apply then undo leaves the tree equal to before the apply, and records it', () => {
    const { repo, id, treeBefore } = appliedRepo();
    const headAfterApply = git(repo, ['rev-parse', 'HEAD']);
    const undone = undoBounty(repo, id);
    expect(undone.outcome).toBe('undone');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('x\n');
    expect(fingerprint(repo).files).toEqual(treeBefore);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(undone.undoCommit);
    expect(undone.undoCommit).not.toBe(headAfterApply);
    expect(git(repo, ['log', '-1', '--format=%s'])).toContain(`bounty ${id}`);
    const record = readRecord(repo, id);
    expect(record.stage).toBe('undone');
    expect(record.events.at(-1)!.command).toBe('undo');
    expect(record.events.at(-1)!.merge).toBe(undone.undoCommit);
    expect(renderStatus(resolveRepoRoot(repo))).toContain(`${id} undone`);
  });

  it('refuses by name when the reversal conflicts and on uncommitted work at a touched path — nothing changes either way', () => {
    const { repo, id } = appliedRepo();

    // The reversal would conflict: the applied file moved on since.
    write(repo, 'src/app.py', 'moved after apply\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=bt3a', '-c', 'user.email=bt3a@test.invalid', 'commit', '-qm', 'moved after apply']);
    const refusal = expectRefusal(() => undoBounty(repo, id), 'undo-conflict');
    expect(refusal.message).toContain('src/app.py');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('moved after apply\n'); // nothing changed

    // Uncommitted work at a touched path is a named refusal, not damage.
    write(repo, 'src/app.py', 'uncommitted\n');
    const dirty = expectRefusal(() => undoBounty(repo, id), 'undo-worktree-dirty');
    expect(dirty.message).toContain('src/app.py');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('uncommitted\n');
  });

  it('refuses by name when the merge is no longer on this branch', () => {
    const { repo, id } = appliedRepo();
    git(repo, ['reset', '--hard', 'HEAD~1']); // drop the merge commit from history
    expectRefusal(() => undoBounty(repo, id), 'undo-not-on-branch');
  });

  it('undo on a bounty that was never applied, and undo twice, are named refusals', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    expectRefusal(() => undoBounty(repo, id), 'not-applied');
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    answerBounty(repo, id, dir);
    applyBounty(repo, id);
    undoBounty(repo, id);
    expectRefusal(() => undoBounty(repo, id), 'already-undone');
    expectRefusal(() => applyBounty(repo, id), 'already-ended');
  });
});

describe('older records still load', () => {
  it('a record written before attempts existed reads as one attempt — status says there is no report and apply still works', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    answerBounty(repo, id, dir);
    // Rewrite the record into the pre-BT3a shape: a single `answer`, no
    // `attempts`, the ref named <id>-answer.
    const record = readRecord(repo, id);
    const attempt = attemptsOf(record)[0]!;
    const legacy: Record<string, unknown> = { ...record, answer: { commit: attempt.commit, changed: attempt.changed, added: attempt.added, deleted: attempt.deleted } };
    delete legacy['attempts'];
    writeFileSync(join(repo, '.box', 'bounties', `${id}.json`), JSON.stringify(legacy, null, 2) + '\n');
    git(repo, ['update-ref', `refs/box-bounty/${id}-answer`, attempt.commit]);
    git(repo, ['update-ref', '-d', `refs/box-bounty/${id}-answer-1`]);

    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain(`${id}  verified`);
    expect(status).toContain('before fact reports existed');
    expect(applyBounty(repo, id).outcome).toBe('applied');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('fixed\n');
    expect(refExists(repo, `refs/box-bounty/${id}-answer`)).toBe(false);
  });
});

describe('the words are policed — facts, never verdicts', () => {
  const BANNED = /\b(correct|correctly|safe|safely|good|recommended|recommendation|should accept|should reject)\b/i;

  it("no outcome's report carries a verdict word", () => {
    // verified — with a flag firing
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    const verified = answerBounty(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n')));
    expect(verified.report.join('\n')).not.toMatch(BANNED);
    expect(renderStatus(resolveRepoRoot(repo))).not.toMatch(BANNED);

    // check-failed
    const repo2 = makeRepo({ 'src/app.py': 'x\n' });
    const posted2 = posted(repo2, { check: FIX_CHECK });
    const failed = answerBounty(repo2, posted2.id, returned(posted2.delivered, root => write(root, 'repo/src/app.py', 'nope\n')));
    expect(failed.report.join('\n')).not.toMatch(BANNED);

    // answered (reviewed)
    const repo3 = makeRepo({ 'src/app.py': 'x\n' });
    const posted3 = posted(repo3);
    const answered = answerBounty(repo3, posted3.id, returned(posted3.delivered, root => write(root, 'repo/src/app.py', 'y\n')));
    expect(answered.report.join('\n')).not.toMatch(BANNED);

    // verified with a merge conflict
    const repo4 = makeRepo({ 'src/app.py': 'x\n' });
    const posted4 = posted(repo4, { check: FIX_CHECK });
    write(repo4, 'src/app.py', 'moved\n');
    git(repo4, ['add', '-A']);
    git(repo4, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'moved']);
    const conflicted = answerBounty(repo4, posted4.id, returned(posted4.delivered, root => write(root, 'repo/src/app.py', 'fixed\n')));
    expect(conflicted.report.join('\n')).not.toMatch(BANNED);
    expect(renderStatus(resolveRepoRoot(repo4))).not.toMatch(BANNED);
  });
});
