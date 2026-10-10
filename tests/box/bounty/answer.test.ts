import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerBounty, applyBounty, BountyRefused, confirmBounty, finalizeBounty, planBounty, postBounty, rejectBounty, renderStatus, resolveRepoRoot } from '../../../packages/box-bounty/index.js';
import type { BountyManifest, BountyRecord, CreateOptions } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, fingerprint, git, listTree, makeRepo, runRoot, write } from './support.js';

// The return journey: a solver hands the bounty folder back; `answer` binds it
// to this bounty, extracts the change against the recorded hashes, proves it on
// the recreated snapshot and lands it with git's own merge — or names exactly
// why not. Every wrong move is a named refusal, never a crash and never
// silence.

const readRecord = (repo: string, id: string): BountyRecord =>
  JSON.parse(readFileSync(join(repo, '.box', 'bounties', `${id}.json`), 'utf8')) as BountyRecord;

const readManifest = (dir: string): BountyManifest => JSON.parse(readFileSync(join(dir, 'bounty.json'), 'utf8')) as BountyManifest;

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, title: 'a task', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('out'), 'bounty'), ...extra };
}

// create → confirm → post, the whole outbound half. `delivered` is the copy a
// solver edits and hands back through `answer --from`.
function posted(repo: string, extra: Partial<CreateOptions> = {}): { id: string; folder: string; delivered: string } {
  const result = finalizeBounty(planBounty(options(repo, extra)));
  confirmBounty(repo, result.id);
  const { destination } = postBounty(repo, result.id, join(runRoot('dest'), 'inbox'));
  return { id: result.id, folder: result.outDir, delivered: destination };
}

// The solver's return: the delivered folder copied to a scratch dir, with the
// given edits applied inside repo/ — exactly what the CLI's --from receives.
function returned(delivered: string, mutate?: (dir: string) => void): string {
  const dir = join(runRoot('answer'), 'returned');
  cpSync(delivered, dir, { recursive: true });
  mutate?.(dir);
  return dir;
}

// A mechanical check: exits 0 only once src/app.py contains 'fixed' — it fails
// at create time and passes only when the answer lands the right change.
const FIX_CHECK = ['node', '-e', 'process.exit(require("node:fs").readFileSync("src/app.py", "utf8").includes("fixed") ? 0 : 1)'];

const refGone = (repo: string, id: string): boolean =>
  spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', `refs/box-bounty/${id}`], { encoding: 'utf8' }).status !== 0;

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

describe('answer — a mechanical answer is verified on the snapshot it was made for, then merged', () => {
  it('a fixing answer lands verified → applied as a merge commit naming the bounty; ref removed', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));

    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('applied');
    const record = readRecord(repo, id);
    // The events tell the true story: taken is implicit in the answer's arrival.
    expect(record.events.map(event => event.stage)).toEqual(['drafted', 'confirmed', 'posted', 'taken', 'answered', 'verified', 'applied']);
    expect(record.stage).toBe('applied');
    expect(record.answer?.commit).toMatch(/^[a-f0-9]{40}$/);
    // A real merge commit on the owner's branch, naming the bounty.
    const head = git(repo, ['rev-parse', 'HEAD']);
    expect(result.mergeCommit).toBe(head);
    expect(head).not.toBe(headBefore);
    expect(git(repo, ['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(' ')).toHaveLength(3);
    expect(git(repo, ['log', '-1', '--format=%s'])).toContain(`bounty ${id}`);
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('fixed\n');
    expect(refGone(repo, id)).toBe(true);
    expect(renderStatus(resolveRepoRoot(repo))).toContain(`${id} applied (job: a task)`);
  });

  it('an answer that does not fix it ends rejected with the failure class, exit and tail recorded', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'still broken\n'));

    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('rejected');
    expect(result.rejection).toContain('implementation-failure');
    expect(result.rejection).toContain('exited 1');
    const record = readRecord(repo, id);
    expect(record.stage).toBe('rejected');
    expect(record.events.map(event => event.stage)).toEqual(['drafted', 'confirmed', 'posted', 'taken', 'answered', 'rejected']);
    expect(record.events.at(-1)!.reason).toContain('implementation-failure');
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(headBefore); // nothing was applied
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('x\n');
    expect(refGone(repo, id)).toBe(true);
    expect(renderStatus(resolveRepoRoot(repo))).toContain(`${id} rejected (job: a task)`);
  });

  it('a conflict aborts clean: the record stays verified naming the paths, worktree and index are untouched', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    // The repository moved on while the bounty was out — on the same lines.
    write(repo, 'src/app.py', 'moved on\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=bt3', '-c', 'user.email=bt3@test.invalid', 'commit', '-qm', 'moved on']);
    const before = { head: git(repo, ['rev-parse', 'HEAD']), index: git(repo, ['ls-files', '--stage']), files: fingerprint(repo).files };
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));

    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('conflict');
    expect(result.conflicts).toEqual(['src/app.py']);
    const record = readRecord(repo, id);
    expect(record.stage).toBe('verified');
    expect(record.conflicts?.paths).toEqual(['src/app.py']);
    // Byte-identical: HEAD, the index's staged entries and every worktree byte
    // are exactly what they were before the aborted merge.
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(before.head);
    expect(git(repo, ['ls-files', '--stage'])).toBe(before.index);
    expect(fingerprint(repo).files).toEqual(before.files);
    // The .box/ record line legitimately shows modified — persistRecord wrote
    // the new events — but nothing else may. (Porcelain paths come after the
    // XY prefix; the trimmed helper can shave a leading space, so strip the
    // prefix by pattern, not by column.)
    expect(git(repo, ['status', '--porcelain']).split('\n')
      .filter(line => line !== '' && !line.replace(/^[ MADRCU?!]{1,2} /, '').startsWith('.box/'))).toEqual([]);
    expect(spawnSync('git', ['-C', repo, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], { encoding: 'utf8' }).status).not.toBe(0);

    // status names the conflicting paths as the next step.
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain('src/app.py');
    expect(status).toContain(`box bounty apply ${id}`);

    // Retrying while the conflict is real aborts clean again; reject still ends it.
    expect(applyBounty(repo, id).outcome).toBe('conflict');
    rejectBounty(repo, id, 'resolved by hand instead');
    expect(readRecord(repo, id).stage).toBe('rejected');
    expect(refGone(repo, id)).toBe(true);
  });

  it('a conflict aborts clean with .box/ untracked — the default state — and the conflict survives on the record', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    // The repository moved on — commit only the conflicting file. `.box/` and
    // TASK.md stay untracked, exactly as they are on a real checkout; an
    // `git add -A` here would track the records and hide the untracked-dir
    // porcelain entry from the boundary the bug lived in.
    write(repo, 'src/app.py', 'moved on\n');
    git(repo, ['add', 'src/app.py']);
    git(repo, ['-c', 'user.name=bt3', '-c', 'user.email=bt3@test.invalid', 'commit', '-qm', 'moved on']);
    expect(git(repo, ['status', '--porcelain'])).toContain('.box/');
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));

    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('conflict'); // the untracked .box/ dir must not crash the abort
    expect(result.conflicts).toEqual(['src/app.py']);
    const record = readRecord(repo, id);
    expect(record.stage).toBe('verified');
    expect(record.conflicts?.paths).toEqual(['src/app.py']);
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('moved on\n'); // byte-identical
    expect(git(repo, ['status', '--porcelain'])).toContain('.box/'); // and .box/ itself is still there

    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain('src/app.py');
    expect(status).toContain(`box bounty apply ${id}`);

    // Retry still conflicts; after the owner resolves the file by hand it lands.
    expect(applyBounty(repo, id).outcome).toBe('conflict');
    write(repo, 'src/app.py', 'fixed\n');
    git(repo, ['add', 'src/app.py']);
    git(repo, ['-c', 'user.name=bt3', '-c', 'user.email=bt3@test.invalid', 'commit', '-qm', 'resolved by hand']);
    expect(applyBounty(repo, id).outcome).toBe('applied');
    expect(readRecord(repo, id).stage).toBe('applied');
  });
});

describe('answer — a reviewed bounty waits on a person', () => {
  it('lands at answered with apply/reject as the next step; apply merges it naming the bounty', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/notes.md', 'the answer\n'));

    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('answered');
    const record = readRecord(repo, id);
    expect(record.stage).toBe('answered');
    expect(record.events.map(event => event.stage)).toEqual(['drafted', 'confirmed', 'posted', 'taken', 'answered']);
    expect(record.answer?.added).toEqual(['notes.md']);
    // Nothing claims a verification that did not happen: no verified event.
    expect(record.events.some(event => event.stage === 'verified')).toBe(false);
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain(`box bounty apply ${id}`);
    expect(status).toContain(`box bounty reject ${id}`);

    const applied = applyBounty(repo, id);
    expect(applied.outcome).toBe('applied');
    expect(readFileSync(join(repo, 'notes.md'), 'utf8')).toBe('the answer\n');
    expect(git(repo, ['log', '-1', '--format=%s'])).toContain(`bounty ${id}`);
    expect(refGone(repo, id)).toBe(true);
  });

  it('reject ends an answered bounty with the reason kept on the event', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'y\n'));
    expect(answerBounty(repo, id, dir).outcome).toBe('answered');

    rejectBounty(repo, id, 'not what was asked for');
    const record = readRecord(repo, id);
    expect(record.stage).toBe('rejected');
    expect(record.events.at(-1)!.reason).toBe('not what was asked for');
    expect(refGone(repo, id)).toBe(true);
    expect(renderStatus(resolveRepoRoot(repo))).toContain(`${id} rejected (job: a task)`);
  });
});

describe('answer — binding refuses anything that is not this bounty, by name', () => {
  it('a bounty.json naming another id is answer-mismatch', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => {
      const manifest = readManifest(root);
      writeFileSync(join(root, 'bounty.json'), JSON.stringify({ ...manifest, id: 'bt-000000000000' }, null, 2) + '\n');
      write(root, 'repo/src/app.py', 'y\n');
    });
    expectRefusal(() => answerBounty(repo, id, dir), 'answer-mismatch');
    expect(readRecord(repo, id).stage).toBe('posted'); // nothing moved
  });

  it('a bounty.json pinning a different snapshot commit is snapshot-mismatch', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => {
      const manifest = readManifest(root);
      writeFileSync(join(root, 'bounty.json'), JSON.stringify({ ...manifest, snapshot: { ...manifest.snapshot, commit: '0'.repeat(40) } }, null, 2) + '\n');
      write(root, 'repo/src/app.py', 'y\n');
    });
    expectRefusal(() => answerBounty(repo, id, dir), 'snapshot-mismatch');
  });

  it('a doctored bounty.json that keeps id and commit is manifest-tampered', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => {
      const manifest = readManifest(root);
      writeFileSync(join(root, 'bounty.json'), JSON.stringify({ ...manifest, title: 'doctored' }, null, 2) + '\n');
      write(root, 'repo/src/app.py', 'y\n');
    });
    expectRefusal(() => answerBounty(repo, id, dir), 'manifest-tampered');
  });

  it('a folder missing bounty.json or repo/ is answer-malformed', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const noManifest = returned(delivered, root => {
      writeFileSync(join(root, 'bounty.json'), 'not json\n');
      write(root, 'repo/src/app.py', 'y\n');
    });
    expectRefusal(() => answerBounty(repo, id, noManifest), 'answer-malformed');
    const bare = join(runRoot('answer'), 'empty');
    mkdirSync(bare, { recursive: true });
    expectRefusal(() => answerBounty(repo, id, bare), 'answer-malformed');
  });

  it('an answer on a bounty that is not posted is a named refusal', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const drafted = finalizeBounty(planBounty(options(repo)));
    expectRefusal(() => answerBounty(repo, drafted.id, drafted.outDir), 'not-posted');
    confirmBounty(repo, drafted.id);
    expectRefusal(() => answerBounty(repo, drafted.id, drafted.outDir), 'not-posted');
    expectRefusal(() => answerBounty(repo, 'bt-000000000000', drafted.outDir), 'unknown-bounty');
  });
});

describe('answer — the extracted change', () => {
  it('a return that changes nothing is answer-empty, never a pass', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const refusal = expectRefusal(() => answerBounty(repo, id, returned(delivered)), 'answer-empty');
    expect(refusal.message).toContain('byte-identical');
    expect(readRecord(repo, id).stage).toBe('posted');
    expect(refGone(repo, id)).toBe(false); // still durable — the bounty is open
  });

  it('changed, added and deleted paths are all carried into the merge', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'stale.txt': 'gone soon\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => {
      write(root, 'repo/src/app.py', 'edited\n');
      write(root, 'repo/new/deep.txt', 'added\n');
      rmSync(join(root, 'repo', 'stale.txt'));
    });
    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('answered');
    const record = readRecord(repo, id);
    expect(record.answer?.changed).toEqual(['src/app.py']);
    expect(record.answer?.added).toEqual(['new/deep.txt']);
    expect(record.answer?.deleted).toEqual(['stale.txt']);
    expect(applyBounty(repo, id).outcome).toBe('applied');
    expect(existsSync(join(repo, 'stale.txt'))).toBe(false);
    expect(readFileSync(join(repo, 'new', 'deep.txt'), 'utf8')).toBe('added\n');
  });

  it('a repo/ holding .git, .box or any link is refused by name — nothing foreign but plain files', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const withGit = returned(delivered, root => write(root, 'repo/.git/config', '[core]\n'));
    expectRefusal(() => answerBounty(repo, id, withGit), 'answer-never-ship');
    const withBox = returned(delivered, root => write(root, 'repo/.box/bounties/x.json', '{}'));
    expectRefusal(() => answerBounty(repo, id, withBox), 'answer-never-ship');
    const withLink = returned(delivered, root => {
      write(root, 'repo/src/app.py', 'y\n');
      symlinkSync(repo, join(root, 'repo', 'link'), 'junction');
    });
    expect(readlinkSync(join(withLink, 'repo', 'link'))).toBeTruthy();
    expectRefusal(() => answerBounty(repo, id, withLink), 'answer-unsafe-path');
    expect(readRecord(repo, id).stage).toBe('posted');
  });

  it('a pruned durability ref is snapshot-lost, not a crash', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo, { check: FIX_CHECK });
    git(repo, ['update-ref', '-d', `refs/box-bounty/${id}`]);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    expectRefusal(() => answerBounty(repo, id, dir), 'snapshot-lost');
    expect(readRecord(repo, id).stage).toBe('posted');
  });
});

describe('apply and reject — stage rules and the dirty-worktree boundary', () => {
  it('apply on a dirty path the merge would overwrite is a named refusal, not damage', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'y\n'));
    expect(answerBounty(repo, id, dir).outcome).toBe('answered');
    write(repo, 'src/app.py', 'uncommitted local work\n');
    const refusal = expectRefusal(() => applyBounty(repo, id), 'apply-worktree-dirty');
    expect(refusal.message).toContain('src/app.py');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('uncommitted local work\n');
    expect(readRecord(repo, id).stage).toBe('answered');
  });

  it('apply and reject name wrong-stage and already-ended refusals', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const drafted = finalizeBounty(planBounty(options(repo)));
    expectRefusal(() => applyBounty(repo, drafted.id), 'wrong-stage');
    expectRefusal(() => rejectBounty(repo, drafted.id, 'why'), 'wrong-stage');
    confirmBounty(repo, drafted.id);
    expectRefusal(() => rejectBounty(repo, drafted.id, 'why'), 'wrong-stage');
    const { id } = posted(repo, { outDir: join(runRoot('out'), 'bounty2') });
    expectRefusal(() => applyBounty(repo, id), 'wrong-stage');
    rejectBounty(repo, id, 'closed early');
    expect(readRecord(repo, id).stage).toBe('rejected');
    expect(refGone(repo, id)).toBe(true);
    expectRefusal(() => applyBounty(repo, id), 'already-ended');
    expectRefusal(() => rejectBounty(repo, id, 'again'), 'already-ended');
    expectRefusal(() => answerBounty(repo, id, id), 'already-ended');
  });

  it('reject without a reason is refused; a posted bounty can be rejected', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = posted(repo);
    expectRefusal(() => rejectBounty(repo, id, '   '), 'missing-reason');
    rejectBounty(repo, id, 'solver went quiet');
    expect(readRecord(repo, id).stage).toBe('rejected');
  });
});

describe('create --job — owner context that lives only in the record', () => {
  it('the job text is in the record, never in bounty.json, the listing or the folder; ended status names it', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    // The job file lives outside the repository — a file inside it would
    // legitimately ship in repo/, which is not the point of this flag.
    const jobDir = runRoot('job');
    write(jobDir, 'JOB.md', 'ship the winter launch\n');
    const jobFile = join(jobDir, 'JOB.md');
    const { id, delivered } = posted(repo, { jobPath: jobFile });
    const record = readRecord(repo, id);
    expect(record.job).toEqual({ file: 'JOB.md', text: 'ship the winter launch\n' });
    const manifest = readFileSync(join(delivered, 'bounty.json'), 'utf8');
    expect(manifest).not.toContain('winter launch');
    expect(readFileSync(join(delivered, 'README.md'), 'utf8')).not.toContain('winter launch');
    expect(listTree(delivered).some(path => path === 'JOB.md' || path === 'repo/JOB.md')).toBe(false);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'y\n'));
    answerBounty(repo, id, dir);
    rejectBounty(repo, id, 'not needed');
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain(`${id} rejected (job: JOB.md)`);
  });
});

describe('the boundary the pass proved open', () => {
  it("a solver-added path the owner's .boxignore names is refused by name — the return enforces the same table create did", () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', '.boxignore': 'credentials.json\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/credentials.json', 'password=hunter2\n'));
    const refusal = expectRefusal(() => answerBounty(repo, id, dir), 'answer-never-ship');
    expect(refusal.message).toContain('credentials.json');
    expect(readRecord(repo, id).stage).toBe('posted');
    expect(existsSync(join(repo, 'credentials.json'))).toBe(false);
  });

  it('the check runs on the shipped set — a never-ship file inside the snapshot commit must not materialise for verification', () => {
    // .env is tracked, so the snapshot commit contains it — but never-ship
    // removed it from the bounty the solver saw. Verifying on the whole commit
    // would resurrect it and reject a correct answer for bytes it never had.
    const repo = makeRepo({ '.env': 'SECRET=hunter2\n', 'src/app.py': 'x\n' });
    const check = ['node', '-e', 'const fs=require("node:fs");process.exit(fs.existsSync(".env")||!fs.readFileSync("src/app.py","utf8").includes("fixed")?1:0)'];
    const { id, delivered } = posted(repo, { check });
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    const result = answerBounty(repo, id, dir);
    expect(result.outcome).toBe('applied');
    expect(readRecord(repo, id).stage).toBe('applied');
  });

  it('an autocrlf=true checkout lands an existing-file change — a CRLF-clean file is not a false dirty refusal', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    git(repo, ['config', 'core.autocrlf', 'true']);
    // A file git itself materialised under autocrlf: CRLF bytes, stat-clean —
    // exactly a default Windows checkout. Hand-writing the CRLF would only
    // make it stat-dirty, a different case.
    rmSync(join(repo, 'src', 'app.py'));
    git(repo, ['checkout', '--', 'src/app.py']);
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('x\r\n');
    expect(git(repo, ['status', '--porcelain'])).toBe('');
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'y\n'));
    expect(answerBounty(repo, id, dir).outcome).toBe('answered');
    expect(applyBounty(repo, id).outcome).toBe('applied');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('y\r\n'); // landed under the repo's own convention
  });

  it('a solver-added path that exists ignored in the worktree is a named refusal — porcelain never lists ignored files', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', '.gitignore': 'precious.txt\n' });
    write(repo, 'precious.txt', 'PRECIOUS LOCAL BYTES\n');
    expect(git(repo, ['status', '--porcelain', '--ignored'])).toContain('precious.txt'); // prove it really is ignored
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/precious.txt', 'FOREIGN\n'));
    expect(answerBounty(repo, id, dir).outcome).toBe('answered');
    const refusal = expectRefusal(() => applyBounty(repo, id), 'apply-worktree-dirty');
    expect(refusal.message).toContain('precious.txt');
    expect(readFileSync(join(repo, 'precious.txt'), 'utf8')).toBe('PRECIOUS LOCAL BYTES\n');
    expect(readRecord(repo, id).stage).toBe('answered');
  });
});

// The agent-facing surface, driven through the built CLI: exit codes and the
// printed states for the whole return. Skipped unless the bundle exists —
// verify builds first.
describe('box bounty answer/apply/reject (built cli)', () => {
  const cli = (cwd: string, args: string[]) =>
    spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8' });
  const built = existsSync(CLI_DIST);
  const need = () => { if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first'); };

  it('the whole return journey through the CLI: answer verifies and applies, status names the job', () => {
    need();
    const repo = makeRepo({ 'src/app.py': 'x\n', 'TASK.md': 'fix it\n', 'JOB.md': 'winter launch\n' });
    const out = join(runRoot('out'), 'bounty');
    const create = cli(repo, ['bounty', 'create', '--title', 'fix app', '--task', 'TASK.md', '--job', 'JOB.md', '--check', '--', ...FIX_CHECK, '--out', out]);
    expect(create.status).toBe(0);
    const id = /bt-[a-f0-9]{12}/.exec(create.stdout)![0];
    expect(cli(repo, ['bounty', 'confirm', id]).status).toBe(0);
    const inbox = join(runRoot('dest'), 'inbox');
    expect(cli(repo, ['bounty', 'post', id, '--to', inbox]).status).toBe(0);
    const delivered = join(inbox, id);
    write(delivered, 'repo/src/app.py', 'fixed\n');
    const answer = cli(repo, ['bounty', 'answer', id, '--from', delivered]);
    expect(answer.status).toBe(0);
    expect(answer.stdout).toContain('verified');
    expect(answer.stdout).toContain('applied');
    expect(answer.stdout).toContain('JOB.md');
    const status = cli(repo, ['bounty', 'status']);
    expect(status.stdout).toContain(`${id} applied (job: JOB.md)`);
    // An ended bounty refuses further transitions by name.
    const again = cli(repo, ['bounty', 'answer', id, '--from', delivered]);
    expect(again.status).toBe(3);
    expect(again.stderr).toContain('already-ended');
  });

  it('answer on a not-posted bounty and reject without --reason fail with named exits', () => {
    need();
    const repo = makeRepo({ 'src/app.py': 'x\n', 'TASK.md': 't\n' });
    const out = join(runRoot('out'), 'bounty');
    const create = cli(repo, ['bounty', 'create', '--title', 't', '--task', 'TASK.md', '--out', out]);
    const id = /bt-[a-f0-9]{12}/.exec(create.stdout)![0];
    const answer = cli(repo, ['bounty', 'answer', id, '--from', out]);
    expect(answer.status).toBe(3);
    expect(answer.stderr).toContain('not-posted');
    const reject = cli(repo, ['bounty', 'reject', id]);
    expect(reject.status).toBe(2);
  });
});

