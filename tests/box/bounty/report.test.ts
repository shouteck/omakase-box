import { postToGitHub, collectPullRequest, applyPullRequest, applyGitHub, closeGitHub, statusGitHub, pullRequestFor, solverCli } from './github-solver.js';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBounty, attemptsOf, BountyRefused, finalizeBounty, lookBounty, planBounty, postBounty, renderStatus, resolveRepoRoot } from '../../../packages/box-bounty/index.js';
import type { Attempt, BountyRecord, CreateOptions } from '../../../packages/box-bounty/index.js';
import { git, makeRepo, ownerSays, runRoot, write } from './support.js';

// Report, do not judge. `look` binds the returned folder and writes a report
// of facts: who sent it and when, the change with counts and lines, a dry merge
// read of the current code, and eager flags — ending with the nothing-was-run
// sentence. Every answer is a numbered attempt that waits on a decision;
// `apply` names the attempt, and ordinary git reverts an applied merge.
// Nothing in the report is a verdict.

const readRecord = (repo: string, id: string): BountyRecord =>
  JSON.parse(readFileSync(join(repo, '.box', 'bounties', `${id}.json`), 'utf8')) as BountyRecord;

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md'), ...extra };
}

function posted(repo: string, extra: Partial<CreateOptions> = {}): { id: string; delivered: string } {
  const result = finalizeBounty(planBounty(options(repo, extra)));
  ownerSays(repo, 'allowed');
  const { destination } = postToGitHub(repo, result.id);
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

    const result = collectPullRequest(repo, id, dir);
    const report = result.attempt.report.join('\n');
    expect(report).toContain(`report — attempt 1 for ${id}`);
    expect(report).toContain('from: GitHub account solver — arrived');
    expect(report).toContain('1 changed, 0 added, 0 deleted');
    expect(report).toContain('lines added');
    expect(report).toContain('current code: the solution would merge cleanly');
    expect(report).toContain('nothing in the solution was run and this report says nothing about whether it works');
    expect(report).toContain(`next: box bounty look ${id} 1 to read the change; box bounty apply ${id} 1 to merge it; or box bounty close ${id} --reason "<why>"`);
    // No check path exists to report on.
    expect(report).not.toContain('check:');
    expect(report).not.toContain('guard:');
  });

  it('a conflicting merge read is a fact in the report, not an ending', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    write(repo, 'src/app.py', 'moved\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'moved']);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    const result = collectPullRequest(repo, id, dir);
    expect(result.attempt.outcome).toBe('answered');
    expect(result.attempt.report.join('\n')).toContain('would conflict in "src/app.py"');
    expect(result.attempt.report.join('\n')).toContain('nothing in the solution was run');
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
    const report = collectPullRequest(repo, id, dir).attempt.report.join('\n');
    expect(report).toContain('marked as a test by the stated rule');
    expect(report).toContain('the solution adds 23 file(s)');
    expect(report).toContain('the solution deletes 1 file(s)');
    expect(report).toContain('above the stated size');
  });
});

describe('several answers — each is its own attempt', () => {
  it('full status includes every report once when a later acceptable attempt sorts first', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    collectPullRequest(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'first\n')));
    collectPullRequest(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'second\n')));
    const record = readRecord(repo, id);
    record.attempts = attemptsOf(record).map((attempt): Attempt => ({ ...attempt, outcome: attempt.n === 1 ? 'set-aside' : 'answered', report: [attempt.n === 1 ? 'FIRST_FAILED_REPORT_73c5' : 'SECOND_ANSWERED_REPORT_73c5'] }));
    writeFileSync(join(repo, '.box', 'bounties', `${id}.json`), JSON.stringify(record));
    const status = statusGitHub(repo, { id, full: true });
    expect(status.split('FIRST_FAILED_REPORT_73c5')).toHaveLength(2);
    expect(status.split('SECOND_ANSWERED_REPORT_73c5')).toHaveLength(2);
  });

  it('each answer is its own numbered attempt — refs pinned, status lists both', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const bad = returned(delivered, root => write(root, 'repo/src/app.py', 'still broken\n'));
    expect(collectPullRequest(repo, id, bad).attempt.outcome).toBe('answered');
    expect(readRecord(repo, id).stage).toBe('answered');

    const good = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    const second = collectPullRequest(repo, id, good);
    expect(second.attempt.outcome).toBe('answered');
    expect(second.attempt.n).toBe(2);
    const record = readRecord(repo, id);
    expect(record.attempts).toHaveLength(2);
    expect(refExists(repo, `refs/box-bounty/${id}-answer-1`)).toBe(true);
    expect(refExists(repo, `refs/box-bounty/${id}-answer-2`)).toBe(true);
    // status lists every attempt in order — no check sorts one above
    // another. The per-attempt outcome list is the full view's (BT17).
    const status = statusGitHub(resolveRepoRoot(repo), { full: true });
    const firstIdx = status.indexOf('#1 answered');
    const secondIdx = status.indexOf('#2 answered');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);

    expect(applyGitHub(repo, id, 2).outcome).toBe('applied');
    expect(refExists(repo, `refs/box-bounty/${id}-answer-1`)).toBe(false); // the other's ref is gone
    expect(refExists(repo, `refs/box-bounty/${id}-answer-2`)).toBe(false);
    expect(refExists(repo, `refs/box-bounty/${id}`)).toBe(false);
  });

  it('two answered attempts make apply name which one; apply <n> lands it', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const first = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    expect(collectPullRequest(repo, id, first).attempt.outcome).toBe('answered');
    const second = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed again\n'));
    expect(collectPullRequest(repo, id, second).attempt.outcome).toBe('answered');

    const refusal = expectRefusal(() => applyGitHub(repo, id), 'apply-ambiguous');
    expect(refusal.message).toContain('#1');
    expect(refusal.message).toContain('#2');
    expectRefusal(() => applyGitHub(repo, id, 9), 'github-pr-missing');

    const applied = applyGitHub(repo, id, 2);
    expect(applied.outcome).toBe('applied');
    expect(applied.attempt).toBe(2);
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('fixed again\n');
    expect(readRecord(repo, id).events.at(-1)!.attempt).toBe(2);
  });
});

describe('older records still load', () => {
  it('a record written before attempts existed reads as one attempt — status says there is no report and apply still works', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    collectPullRequest(repo, id, dir);
    // Rewrite the record into the pre-BT3a shape: a single `answer`, no
    // `attempts`, the ref named <id>-answer — and a `level` key, which records
    // written while checks existed carried. The load converts it to one
    // `answered` attempt (BT23): a check outcome means the same now nothing
    // runs checks, and the level is dropped.
    const record = readRecord(repo, id);
    const attempt = attemptsOf(record)[0]!;
    const legacy: Record<string, unknown> = { ...record, level: 'mechanical', answer: { commit: attempt.commit, changed: attempt.changed, added: attempt.added, deleted: attempt.deleted } };
    delete legacy['attempts'];
    writeFileSync(join(repo, '.box', 'bounties', `${id}.json`), JSON.stringify(legacy, null, 2) + '\n');
    git(repo, ['update-ref', `refs/box-bounty/${id}-answer`, attempt.commit]);
    git(repo, ['update-ref', '-d', `refs/box-bounty/${id}-answer-1`]);

    const status = statusGitHub(resolveRepoRoot(repo));
    expect(status).toContain(`${id}  answered`);
    // The converted outcome word lives on the attempts list — the full
    // view's since BT17 — where the attempt still says what it is today.
    expect(statusGitHub(resolveRepoRoot(repo), { full: true })).toContain('#1 answered');
    expect(statusGitHub(repo, { id, full: true })).toContain('before fact reports existed');
    expect(applyGitHub(repo, id).outcome).toBe('applied');
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

  // K23: one posted world carries all four answers — the scenarios differ in
  // the returned solution and the owner's later commit, never in the world's
  // build, so four attempts on one bounty prove exactly what four worlds did
  // at a fifth of the Git starts. Assertions are unchanged.
  // K24: the single four-answer `it` ran past half its 30 s limit under load,
  // so it is two consecutive legs on the same world — same checks, same
  // order. The suite wipes owner settings before each `it`, so the second
  // leg re-states the same decision.
  describe("no attempt's report carries a verdict word", () => {
    let repo: string;
    let id: string;
    let delivered: string;

    it('the clean answer and the flagged answer', () => {
      repo = makeRepo({ 'src/app.py': 'x\n', 'tests/t.js': 'x\n' });
      ({ id, delivered } = posted(repo));
      // answered — clean merge read
      const clean = collectPullRequest(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n')));
      expect(clean.attempt.report.join('\n')).not.toMatch(BANNED);
      expect(statusGitHub(resolveRepoRoot(repo))).not.toMatch(BANNED);

      // answered — with flags firing
      const flagged = collectPullRequest(repo, id, returned(delivered, root => {
        write(root, 'repo/tests/t.js', 'y\n');
        write(root, 'repo/new.txt', 'n\n');
      }));
      expect(flagged.attempt.report.join('\n')).not.toMatch(BANNED);
    });

    it('the quoted-path answer and the conflicted answer', () => {
      ownerSays(repo, 'allowed');
      // answered — a solver-named path carrying verdict words stays quoted data
      const named = collectPullRequest(repo, id, returned(delivered, root => write(root, 'repo/tests/should accept.py', 'x\n')));
      const namedReport = named.attempt.report.join('\n');
      expect(namedReport).toContain('"tests/should accept.py"');
      expect(prose(namedReport)).not.toMatch(BANNED);
      expect(prose(statusGitHub(resolveRepoRoot(repo)))).not.toMatch(BANNED);

      // answered — with a merge conflict
      write(repo, 'src/app.py', 'moved\n');
      git(repo, ['add', '-A']);
      git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'moved']);
      const conflicted = collectPullRequest(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n')));
      expect(conflicted.attempt.report.join('\n')).not.toMatch(BANNED);
      expect(statusGitHub(resolveRepoRoot(repo))).not.toMatch(BANNED);
    });
  });

  it('a quoted path cannot break out of the prose — a double quote or a newline shows JSON-escaped, not raw', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    collectPullRequest(repo, id, returned(delivered, root => write(root, 'repo/src/app.py', 'y\n')));
    // No filesystem the tests run on can hold this name — the record is the
    // rendering boundary, so a hostile path is written into it directly, the
    // same way the pre-attempts record test rewrites history.
    const hostile = 'tests/say "accept"\n.py';
    const record = readRecord(repo, id);
    record.conflicts = { paths: [hostile], at: new Date().toISOString() };
    record.attempts = attemptsOf(record).map(attempt => ({ ...attempt, conflicts: [hostile] }));
    writeFileSync(join(repo, '.box', 'bounties', `${id}.json`), JSON.stringify(record, null, 2) + '\n');
    const status = statusGitHub(resolveRepoRoot(repo));
    expect(status).toContain(JSON.stringify(hostile));
    expect(status).not.toContain(hostile);
    expect(prose(status)).not.toMatch(BANNED);
  });
});
