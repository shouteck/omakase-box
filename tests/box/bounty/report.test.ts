import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerBounty, applyBounty, attemptsOf, BountyRefused, confirmBounty, finalizeBounty, planBounty, postBounty, renderStatus, resolveRepoRoot, undoBounty } from '../../../packages/box-bounty/index.js';
import type { Attempt, BountyRecord, CreateOptions } from '../../../packages/box-bounty/index.js';
import { fingerprint, git, makeRepo, runRoot, write } from './support.js';

// Report, do not judge. `answer` binds the returned folder and writes a report
// of facts: who sent it and when, the change with counts and lines, a dry merge
// read of the current code, and eager flags — ending with the nothing-was-run
// sentence. Every answer is a numbered attempt that waits on a decision;
// `apply` names the attempt and `undo` reverses an applied merge. Nothing in
// the report is a verdict.

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
  it('states who sent it and when, the change, the merge read, flags, the nothing-was-run sentence, and the next command', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));

    const result = answerBounty(repo, id, dir);
    const report = result.report.join('\n');
    expect(report).toContain(`report — attempt 1 for ${id}`);
    expect(report).toContain('from: a returned folder — no account was named — arrived');
    expect(report).toContain('1 changed, 0 added, 0 deleted');
    expect(report).toContain('lines added');
    expect(report).toContain('current code: the answer would merge cleanly');
    expect(report).toContain('nothing in the solution was run and this report says nothing about whether it works');
    expect(report).toContain(`next: box bounty apply ${id} 1`);
    // No check path exists to report on.
    expect(report).not.toContain('check:');
    expect(report).not.toContain('guard:');
  });

  it('an answer from a named GitHub account says who sent it', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'y\n'));
    const result = answerBounty(repo, id, dir, 'octocat');
    expect(result.report.join('\n')).toContain('from: GitHub account octocat');
    const record = readRecord(repo, id);
    expect(record.attempts?.[0]?.author).toBe('octocat');
  });

  it('a conflicting merge read is a fact in the report, not an ending', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    write(repo, 'src/app.py', 'moved\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'moved']);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('answered');
    expect(result.report.join('\n')).toContain('would conflict in "src/app.py"');
    expect(result.report.join('\n')).toContain('nothing in the solution was run');
  });
});

describe('flags — observations, never blocks', () => {
  it('a test path, adds, deletes and a large change are each flagged', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'stale.txt': 'gone\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => {
      write(root, 'repo/src/app.py', 'fixed\n');
      write(root, 'repo/tests/app.test.js', 'process.exit(0)\n');
      rmSync(join(root, 'repo', 'stale.txt'));
      for (let i = 0; i < 22; i += 1) write(root, `repo/gen/f${i}.txt`, `f${i}\n`);
    });
    const report = answerBounty(repo, id, dir).report.join('\n');
    expect(report).toContain('marked as a test by the stated rule');
    expect(report).toContain('the answer adds 23 file(s)');
    expect(report).toContain('the answer deletes 1 file(s)');
    expect(report).toContain('above the stated size');
  });
});

describe('several answers — each is its own attempt', () => {
  it('full status includes every report once when a later acceptable attempt sorts first', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    answerBounty(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'first\n')));
    answerBounty(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'second\n')));
    const record = readRecord(repo, id);
    record.attempts = attemptsOf(record).map((attempt): Attempt => ({ ...attempt, outcome: attempt.n === 1 ? 'check-failed' : 'answered', report: [attempt.n === 1 ? 'FIRST_FAILED_REPORT_73c5' : 'SECOND_ANSWERED_REPORT_73c5'] }));
    writeFileSync(join(repo, '.box', 'bounties', `${id}.json`), JSON.stringify(record));
    const status = renderStatus(repo, { id, full: true });
    expect(status.split('FIRST_FAILED_REPORT_73c5')).toHaveLength(2);
    expect(status.split('SECOND_ANSWERED_REPORT_73c5')).toHaveLength(2);
  });

  it('each answer is its own numbered attempt — refs pinned, status lists both', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const bad = returned(delivered, root => write(root, 'repo/src/app.py', 'still broken\n'));
    expect(answerBounty(repo, id, bad).outcome).toBe('answered');
    expect(readRecord(repo, id).stage).toBe('answered');

    const good = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    const second = answerBounty(repo, id, good);
    expect(second.outcome).toBe('answered');
    expect(second.attempt).toBe(2);
    const record = readRecord(repo, id);
    expect(record.attempts).toHaveLength(2);
    expect(refExists(repo, `refs/box-bounty/${id}-answer-1`)).toBe(true);
    expect(refExists(repo, `refs/box-bounty/${id}-answer-2`)).toBe(true);
    // status lists every attempt in order — no check sorts one above another.
    const status = renderStatus(resolveRepoRoot(repo));
    const firstIdx = status.indexOf('#1 answered');
    const secondIdx = status.indexOf('#2 answered');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);

    expect(applyBounty(repo, id, 2).outcome).toBe('applied');
    expect(refExists(repo, `refs/box-bounty/${id}-answer-1`)).toBe(false); // the other's ref is gone
    expect(refExists(repo, `refs/box-bounty/${id}-answer-2`)).toBe(false);
    expect(refExists(repo, `refs/box-bounty/${id}`)).toBe(false);
  });

  it('two answered attempts make apply name which one; apply <n> lands it', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const first = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    expect(answerBounty(repo, id, first).outcome).toBe('answered');
    const second = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed again\n'));
    expect(answerBounty(repo, id, second).outcome).toBe('answered');

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

describe('undo — reverses an applied merge as a new commit', () => {
  const appliedRepo = () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
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

  it('an ignored file at a folded rename source is refused, never clobbered — the touched set names what the reversal writes', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    // Identical bytes at a new path: git pairs the return as a rename, and a
    // folded --name-only read of the merge then names only the target — but
    // the reversal writes the source back.
    const dir = returned(delivered, root => {
      write(root, 'repo/src/renamed.py', 'x\n');
      rmSync(join(root, 'repo', 'src', 'app.py'));
    });
    answerBounty(repo, id, dir);
    expect(applyBounty(repo, id).outcome).toBe('applied');
    // An ignored file at the folded-away source: invisible to porcelain, so
    // only the touched set's own completeness can save it.
    write(repo, '.gitignore', 'src/app.py\n');
    write(repo, 'src/app.py', 'LOCAL-BUILD-ARTIFACT\n');
    expect(git(repo, ['status', '--porcelain', '--ignored'])).toContain('!! src/app.py');
    const refusal = expectRefusal(() => undoBounty(repo, id), 'undo-worktree-dirty');
    expect(refusal.message).toContain('src/app.py');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('LOCAL-BUILD-ARTIFACT\n'); // untouched
    expect(readRecord(repo, id).stage).toBe('applied');
  });

  it('refuses by name when the merge is no longer on this branch', () => {
    const { repo, id } = appliedRepo();
    git(repo, ['reset', '--hard', 'HEAD~1']); // drop the merge commit from history
    expectRefusal(() => undoBounty(repo, id), 'undo-not-on-branch');
  });

  it('undo on a bounty that was never applied, and undo twice, are named refusals', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
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
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    answerBounty(repo, id, dir);
    // Rewrite the record into the pre-BT3a shape: a single `answer`, no
    // `attempts`, the ref named <id>-answer — and a `level` key, which records
    // written while checks existed carried. A mechanical record's single
    // answer reads as `verified` history; a reviewed one's as `answered`.
    const record = readRecord(repo, id);
    const attempt = attemptsOf(record)[0]!;
    const legacy: Record<string, unknown> = { ...record, level: 'mechanical', answer: { commit: attempt.commit, changed: attempt.changed, added: attempt.added, deleted: attempt.deleted } };
    delete legacy['attempts'];
    writeFileSync(join(repo, '.box', 'bounties', `${id}.json`), JSON.stringify(legacy, null, 2) + '\n');
    git(repo, ['update-ref', `refs/box-bounty/${id}-answer`, attempt.commit]);
    git(repo, ['update-ref', '-d', `refs/box-bounty/${id}-answer-1`]);

    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain(`${id}  answered`);
    expect(status).toContain('declared check'); // the recorded outcome still says what the check did back then
    expect(status).toContain('before fact reports existed');
    expect(applyBounty(repo, id).outcome).toBe('applied');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('fixed\n');
    expect(refExists(repo, `refs/box-bounty/${id}-answer`)).toBe(false);
  });
});

describe('the words are policed — facts, never verdicts', () => {
  const BANNED = /\b(correct|correctly|safe|safely|good|recommended|recommendation|should accept|should reject)\b/i;
  // A solver-supplied path reaches the report only inside JSON quoting, so the
  // rule reads the tool's prose: the text with quoted spans — solver data,
  // never the tool's statements — blanked out.
  const prose = (text: string): string => text.replace(/"(?:[^"\\]|\\.)*"/g, '""');

  it("no attempt's report carries a verdict word", () => {
    // answered — clean merge read
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const clean = answerBounty(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n')));
    expect(clean.report.join('\n')).not.toMatch(BANNED);
    expect(renderStatus(resolveRepoRoot(repo))).not.toMatch(BANNED);

    // answered — with flags firing
    const repo2 = makeRepo({ 'src/app.py': 'x\n', 'tests/t.js': 'x\n' });
    const posted2 = posted(repo2);
    const flagged = answerBounty(repo2, posted2.id, returned(posted2.delivered, root => {
      write(root, 'repo/tests/t.js', 'y\n');
      write(root, 'repo/new.txt', 'n\n');
    }));
    expect(flagged.report.join('\n')).not.toMatch(BANNED);

    // answered — from a named account
    const repo3 = makeRepo({ 'src/app.py': 'x\n' });
    const posted3 = posted(repo3);
    const authored = answerBounty(repo3, posted3.id, returned(posted3.delivered, root => write(root, 'repo/src/app.py', 'y\n')), 'octocat');
    expect(authored.report.join('\n')).not.toMatch(BANNED);

    // answered — with a merge conflict
    const repo4 = makeRepo({ 'src/app.py': 'x\n' });
    const posted4 = posted(repo4);
    write(repo4, 'src/app.py', 'moved\n');
    git(repo4, ['add', '-A']);
    git(repo4, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'moved']);
    const conflicted = answerBounty(repo4, posted4.id, returned(posted4.delivered, root => write(root, 'repo/src/app.py', 'fixed\n')));
    expect(conflicted.report.join('\n')).not.toMatch(BANNED);
    expect(renderStatus(resolveRepoRoot(repo4))).not.toMatch(BANNED);

    // answered — a solver-named path carrying verdict words stays quoted data
    const repo5 = makeRepo({ 'src/app.py': 'x\n' });
    const posted5 = posted(repo5);
    const named = answerBounty(repo5, posted5.id, returned(posted5.delivered, root => write(root, 'repo/tests/should accept.py', 'x\n')));
    const namedReport = named.report.join('\n');
    expect(namedReport).toContain('"tests/should accept.py"');
    expect(prose(namedReport)).not.toMatch(BANNED);
    expect(prose(renderStatus(resolveRepoRoot(repo5)))).not.toMatch(BANNED);
  });

  it('a quoted path cannot break out of the prose — a double quote or a newline shows JSON-escaped, not raw', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    answerBounty(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'y\n')));
    // No filesystem the tests run on can hold this name — the record is the
    // rendering boundary, so a hostile path is written into it directly, the
    // same way the pre-attempts record test rewrites history.
    const hostile = 'tests/say "accept"\n.py';
    const record = readRecord(repo, id);
    record.conflicts = { paths: [hostile], at: new Date().toISOString() };
    record.attempts = attemptsOf(record).map(attempt => ({ ...attempt, conflicts: [hostile] }));
    writeFileSync(join(repo, '.box', 'bounties', `${id}.json`), JSON.stringify(record, null, 2) + '\n');
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain(JSON.stringify(hostile));
    expect(status).not.toContain(hostile);
    expect(prose(status)).not.toMatch(BANNED);
  });
});
