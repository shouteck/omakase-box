import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBounty, BountyRefused, closeBounty, finalizeBounty, lookBounty, planBounty, postBounty, renderStatus, resolveRepoRoot } from '../../../packages/box-bounty/index.js';
import type { BountyManifest, BountyRecord, CreateOptions } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, fingerprint, git, listTree, makeRepo, ownerSays, runRoot, write } from './support.js';

// The return journey: a solver hands the bounty folder back; `look --from`
// collects it — binds it to this bounty, extracts the change against the
// recorded hashes, reports the facts, running nothing — and `apply` lands it
// with git's own merge, or names exactly why not. Every wrong move is a named
// refusal, never a crash and never silence.

const readRecord = (repo: string, id: string): BountyRecord =>
  JSON.parse(readFileSync(join(repo, '.box', 'bounties', `${id}.json`), 'utf8')) as BountyRecord;

const readManifest = (dir: string): BountyManifest => JSON.parse(readFileSync(join(dir, 'bounty.json'), 'utf8')) as BountyManifest;

// The refusal reason a command carries, or '' when it did not refuse.
const refusalOf = (run: () => unknown): string => {
  try { run(); } catch (error) { return error instanceof BountyRefused ? error.reason : String(error); }
  return '';
};

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('out'), 'bounty'), ...extra };
}

// create → post, the whole outbound half — the owner already allowed the
// tool (BT8: one decision, not one per bounty). `delivered` is the copy a
// solver edits and hands back through `look --from`.
function posted(repo: string, extra: Partial<CreateOptions> = {}): { id: string; folder: string; delivered: string } {
  const result = finalizeBounty(planBounty(options(repo, extra)));
  ownerSays(repo, 'allowed');
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

describe('collection — every solution is a numbered attempt, and nothing in it is run', () => {
  it('an answer lands at answered and waits; apply is a separate command that merges it naming the bounty', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));

    const result = lookBounty(repo, id, { from: dir });
    expect(result.attempt.outcome).toBe('answered');
    const record = readRecord(repo, id);
    // The events tell the true story: taken is implicit in the answer's arrival.
    expect(record.events.map(event => event.stage)).toEqual(['drafted', 'posted', 'taken', 'answered']);
    expect(record.stage).toBe('answered');
    expect(record.attempts?.[0]?.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(record.attempts?.[0]?.outcome).toBe('answered');
    // Nothing was applied: HEAD and the worktree are untouched.
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('x\n');
    // The report is stored on the attempt and names the next command.
    expect(result.attempt.report.join('\n')).toContain(`box bounty apply ${id} 1`);
    expect(result.attempt.report.join('\n')).toContain('nothing in the solution was run and this report says nothing about whether it works');

    const applied = applyBounty(repo, id);
    expect(applied.outcome).toBe('applied');
    const after = readRecord(repo, id);
    expect(after.stage).toBe('applied');
    expect(after.events.map(event => event.stage)).toEqual(['drafted', 'posted', 'taken', 'answered', 'applied']);
    // The decision is recorded: which command ended it, on which attempt.
    const appliedEvent = after.events.at(-1)!;
    expect(appliedEvent.command).toBe('apply');
    expect(appliedEvent.attempt).toBe(1);
    expect(appliedEvent.merge).toMatch(/^[a-f0-9]{40}$/);
    // A real merge commit on the owner's branch, naming the bounty.
    const head = git(repo, ['rev-parse', 'HEAD']);
    expect(applied.mergeCommit).toBe(head);
    expect(head).not.toBe(headBefore);
    expect(git(repo, ['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(' ')).toHaveLength(3);
    expect(git(repo, ['log', '-1', '--format=%s'])).toContain(`bounty ${id}`);
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('fixed\n');
    expect(refGone(repo, id)).toBe(true);
    expect(renderStatus(resolveRepoRoot(repo))).toContain(`${id} applied (job: a task)`);
  });

  it('an answer that does not fix the task is still a numbered attempt — the report states facts, never a verdict', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'still broken\n'));

    const result = lookBounty(repo, id, { from: dir });
    expect(result.attempt.outcome).toBe('answered'); // nothing is run — an unhelpful answer still waits on a decision
    const record = readRecord(repo, id);
    expect(record.stage).toBe('answered');
    expect(record.events.map(event => event.stage)).toEqual(['drafted', 'posted', 'taken', 'answered']);
    expect(record.attempts).toHaveLength(1);
    expect(result.attempt.report.join('\n')).toContain('nothing in the solution was run');
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(headBefore); // nothing was applied
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('x\n');
    // Still open: the durability ref stays, and status says so.
    expect(refGone(repo, id)).toBe(false);
    expect(renderStatus(resolveRepoRoot(repo))).toContain(`${id}  answered`);
  });

  it('a conflicting answer reports the paths dry — no merge ran — and apply still proves the abort boundary', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    // The repository moved on while the bounty was out — on the same lines.
    write(repo, 'src/app.py', 'moved on\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=bt3', '-c', 'user.email=bt3@test.invalid', 'commit', '-qm', 'moved on']);
    const before = { head: git(repo, ['rev-parse', 'HEAD']), index: git(repo, ['ls-files', '--stage']), files: fingerprint(repo).files };
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));

    const result = lookBounty(repo, id, { from: dir });
    expect(result.attempt.outcome).toBe('answered'); // the conflict is a fact, not an ending
    expect(result.attempt.conflicts).toEqual(['src/app.py']);
    expect(result.attempt.report.join('\n')).toContain('src/app.py');
    const record = readRecord(repo, id);
    expect(record.stage).toBe('answered');
    expect(record.attempts?.[0]?.conflicts).toEqual(['src/app.py']);
    // The dry merge touched nothing: HEAD, the index's staged entries and
    // every worktree byte are exactly what they were.
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(before.head);
    expect(git(repo, ['ls-files', '--stage'])).toBe(before.index);
    expect(fingerprint(repo).files).toEqual(before.files);
    expect(spawnSync('git', ['-C', repo, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], { encoding: 'utf8' }).status).not.toBe(0);

    // status repeats the conflict paths as the next step.
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain('src/app.py');
    expect(status).toContain(`box bounty apply ${id}`);

    // The real merge on apply still aborts byte-identical; close --reason still ends it.
    expect(applyBounty(repo, id).outcome).toBe('conflict');
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(before.head);
    expect(git(repo, ['ls-files', '--stage'])).toBe(before.index);
    expect(fingerprint(repo).files).toEqual(before.files);
    closeBounty(repo, id, 'resolved by hand instead');
    expect(readRecord(repo, id).stage).toBe('rejected');
    expect(refGone(repo, id)).toBe(true);
  });

  it('a conflict aborts clean with .box/ untracked — the default state — and the conflict survives on the record', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    // The repository moved on — commit only the conflicting file. `.box/` and
    // TASK.md stay untracked, exactly as they are on a real checkout; an
    // `git add -A` here would track the records and hide the untracked-dir
    // porcelain entry from the boundary the bug lived in.
    write(repo, 'src/app.py', 'moved on\n');
    git(repo, ['add', 'src/app.py']);
    git(repo, ['-c', 'user.name=bt3', '-c', 'user.email=bt3@test.invalid', 'commit', '-qm', 'moved on']);
    expect(git(repo, ['status', '--porcelain'])).toContain('.box/');
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));

    const result = lookBounty(repo, id, { from: dir });
    expect(result.attempt.outcome).toBe('answered');
    expect(result.attempt.conflicts).toEqual(['src/app.py']);
    const record = readRecord(repo, id);
    expect(record.stage).toBe('answered');

    const applied = applyBounty(repo, id);
    expect(applied.outcome).toBe('conflict'); // the untracked .box/ dir must not crash the abort
    expect(applied.conflicts).toEqual(['src/app.py']);
    const after = readRecord(repo, id);
    expect(after.stage).toBe('answered');
    expect(after.conflicts?.paths).toEqual(['src/app.py']);
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('moved on\n'); // byte-identical
    expect(git(repo, ['status', '--porcelain'])).toContain('.box/'); // and .box/ itself is still there

    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain('src/app.py');
    expect(status).toContain(`box bounty look ${id}`);
    // BT7b: a clash names the manual path — the owner's own merge lands it,
    // never "resolve the paths and run apply again".
    expect(status).toContain(`box bounty close ${id}`);

    // Retry still conflicts; after the owner resolves the file by hand it lands.
    expect(applyBounty(repo, id).outcome).toBe('conflict');
    write(repo, 'src/app.py', 'fixed\n');
    git(repo, ['add', 'src/app.py']);
    git(repo, ['-c', 'user.name=bt3', '-c', 'user.email=bt3@test.invalid', 'commit', '-qm', 'resolved by hand']);
    expect(applyBounty(repo, id).outcome).toBe('applied');
    expect(readRecord(repo, id).stage).toBe('applied');
  });
});

describe('collection — an answered bounty waits on a decision', () => {
  it('an added-file answer applies and lands its bytes naming the bounty', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/notes.md', 'the answer\n'));

    const result = lookBounty(repo, id, { from: dir });
    expect(result.attempt.outcome).toBe('answered');
    const record = readRecord(repo, id);
    expect(record.stage).toBe('answered');
    expect(record.events.map(event => event.stage)).toEqual(['drafted', 'posted', 'taken', 'answered']);
    expect(record.attempts?.[0]?.added).toEqual(['notes.md']);
    // No check-only stage ever exists: nothing claims a run that did not happen.
    expect(record.events.some(event => event.stage === 'verified')).toBe(false);
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain(`box bounty apply ${id}`);
    expect(status).toContain(`box bounty close ${id}`);

    const applied = applyBounty(repo, id);
    expect(applied.outcome).toBe('applied');
    expect(readFileSync(join(repo, 'notes.md'), 'utf8')).toBe('the answer\n');
    expect(git(repo, ['log', '-1', '--format=%s'])).toContain(`bounty ${id}`);
    expect(refGone(repo, id)).toBe(true);
  });

  it('close --reason ends an answered bounty with the reason kept on the event', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'y\n'));
    expect(lookBounty(repo, id, { from: dir }).attempt.outcome).toBe('answered');

    closeBounty(repo, id, 'not what was asked for');
    const record = readRecord(repo, id);
    expect(record.stage).toBe('rejected');
    expect(record.events.at(-1)!.reason).toBe('not what was asked for');
    expect(refGone(repo, id)).toBe(true);
    expect(renderStatus(resolveRepoRoot(repo))).toContain(`${id} rejected (job: a task)`);
  });
});

describe('collection — binding refuses anything that is not this bounty, by name', () => {
  it('a bounty.json naming another id is answer-mismatch', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => {
      const manifest = readManifest(root);
      writeFileSync(join(root, 'bounty.json'), JSON.stringify({ ...manifest, id: 'bt-000000000000' }, null, 2) + '\n');
      write(root, 'repo/src/app.py', 'y\n');
    });
    expectRefusal(() => lookBounty(repo, id, { from: dir }), 'answer-mismatch');
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
    expectRefusal(() => lookBounty(repo, id, { from: dir }), 'snapshot-mismatch');
  });

  it('a doctored bounty.json that keeps id and commit is manifest-tampered', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => {
      const manifest = readManifest(root);
      writeFileSync(join(root, 'bounty.json'), JSON.stringify({ ...manifest, title: 'doctored' }, null, 2) + '\n');
      write(root, 'repo/src/app.py', 'y\n');
    });
    expectRefusal(() => lookBounty(repo, id, { from: dir }), 'manifest-tampered');
  });

  it('a folder missing bounty.json or repo/ is answer-malformed', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const noManifest = returned(delivered, root => {
      writeFileSync(join(root, 'bounty.json'), 'not json\n');
      write(root, 'repo/src/app.py', 'y\n');
    });
    expectRefusal(() => lookBounty(repo, id, { from: noManifest }), 'answer-malformed');
    const bare = join(runRoot('answer'), 'empty');
    mkdirSync(bare, { recursive: true });
    expectRefusal(() => lookBounty(repo, id, { from: bare }), 'answer-malformed');
  });

  it('an answer on a bounty that is not posted is a named refusal', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const drafted = finalizeBounty(planBounty(options(repo)));
    expectRefusal(() => lookBounty(repo, drafted.id, { from: drafted.outDir }), 'not-posted');
    // Held for the owner is still not posted.
    expectRefusal(() => postBounty(repo, drafted.id, join(runRoot('dest'), 'inbox')), 'owner-allow-needed');
    expectRefusal(() => lookBounty(repo, drafted.id, { from: drafted.outDir }), 'not-posted');
    expectRefusal(() => lookBounty(repo, 'bt-000000000000', { from: drafted.outDir }), 'unknown-bounty');
  });
});

describe('collection — the extracted change', () => {
  it('a return that changes nothing is answer-empty, never a pass', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const refusal = expectRefusal(() => lookBounty(repo, id, { from: returned(delivered) }), 'answer-empty');
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
    const result = lookBounty(repo, id, { from: dir });
    expect(result.attempt.outcome).toBe('answered');
    const record = readRecord(repo, id);
    expect(record.attempts?.[0]?.changed).toEqual(['src/app.py']);
    expect(record.attempts?.[0]?.added).toEqual(['new/deep.txt']);
    expect(record.attempts?.[0]?.deleted).toEqual(['stale.txt']);
    expect(applyBounty(repo, id).outcome).toBe('applied');
    expect(existsSync(join(repo, 'stale.txt'))).toBe(false);
    expect(readFileSync(join(repo, 'new', 'deep.txt'), 'utf8')).toBe('added\n');
  });

  it('a repo/ holding .git, .box or any link is refused by name — nothing foreign but plain files', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const withGit = returned(delivered, root => write(root, 'repo/.git/config', '[core]\n'));
    expectRefusal(() => lookBounty(repo, id, { from: withGit }), 'answer-never-ship');
    const withBox = returned(delivered, root => write(root, 'repo/.box/bounties/x.json', '{}'));
    expectRefusal(() => lookBounty(repo, id, { from: withBox }), 'answer-never-ship');
    const withLink = returned(delivered, root => {
      write(root, 'repo/src/app.py', 'y\n');
      symlinkSync(repo, join(root, 'repo', 'link'), 'junction');
    });
    expect(readlinkSync(join(withLink, 'repo', 'link'))).toBeTruthy();
    expectRefusal(() => lookBounty(repo, id, { from: withLink }), 'answer-unsafe-path');
    expect(readRecord(repo, id).stage).toBe('posted');
  });

  it('a pruned durability ref is snapshot-lost, not a crash', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    git(repo, ['update-ref', '-d', `refs/box-bounty/${id}`]);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'fixed\n'));
    expectRefusal(() => lookBounty(repo, id, { from: dir }), 'snapshot-lost');
    expect(readRecord(repo, id).stage).toBe('posted');
  });
});

describe('apply and close — stage rules and the dirty-worktree boundary', () => {
  it('apply on a dirty path the merge would overwrite is a named refusal, not damage', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/src/app.py', 'y\n'));
    expect(lookBounty(repo, id, { from: dir }).attempt.outcome).toBe('answered');
    write(repo, 'src/app.py', 'uncommitted local work\n');
    const refusal = expectRefusal(() => applyBounty(repo, id), 'apply-worktree-dirty');
    expect(refusal.message).toContain('src/app.py');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('uncommitted local work\n');
    expect(readRecord(repo, id).stage).toBe('answered');
  });

  it('apply names wrong-stage and already-ended refusals; close ends any open stage', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const drafted = finalizeBounty(planBounty(options(repo)));
    expectRefusal(() => applyBounty(repo, drafted.id), 'wrong-stage');
    // close works where only withdraw once did — a draft ends as withdrawn.
    expect(closeBounty(repo, drafted.id).outcome).toBe('withdrawn');
    const { id } = posted(repo, { outDir: join(runRoot('out'), 'bounty2') });
    expectRefusal(() => applyBounty(repo, id), 'wrong-stage');
    expect(closeBounty(repo, id, 'closed early').outcome).toBe('rejected');
    expect(readRecord(repo, id).stage).toBe('rejected');
    expect(refGone(repo, id)).toBe(true);
    expectRefusal(() => applyBounty(repo, id), 'already-ended');
    expect(closeBounty(repo, id, 'again').outcome).toBe('already-ended');
    expectRefusal(() => lookBounty(repo, id, { from: id }), 'already-ended');
  });

  it('close with an empty reason is refused; a posted bounty can be closed with one', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = posted(repo);
    expectRefusal(() => closeBounty(repo, id, '   '), 'missing-reason');
    expect(closeBounty(repo, id, 'solver went quiet').outcome).toBe('rejected');
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
    lookBounty(repo, id, { from: dir });
    closeBounty(repo, id, 'not needed');
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain(`${id} rejected (job: JOB.md)`);
  });
});

describe('the boundary the pass proved open', () => {
  it("a solver-added path the owner's .boxignore names is refused by name — the return enforces the same table create did", () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', '.boxignore': 'credentials.json\n' });
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/credentials.json', 'password=hunter2\n'));
    const refusal = expectRefusal(() => lookBounty(repo, id, { from: dir }), 'answer-never-ship');
    expect(refusal.message).toContain('credentials.json');
    expect(readRecord(repo, id).stage).toBe('posted');
    expect(existsSync(join(repo, 'credentials.json'))).toBe(false);
  });

  it('nothing a solver wrote runs — hostile attributes, a merge driver, a hook and a submodule declaration fire no sentinel through look or apply', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const marks = join(runRoot('sentinel'), 'marks');
    mkdirSync(marks, { recursive: true });
    const mark = (name: string) => join(marks, name).split('\\').join('/');
    // Armed in the OWNER's git config — the channel a solver's .gitattributes
    // would select if the merge let it. None of these may ever fire.
    git(repo, ['config', 'filter.pwn.clean', `node -e "require('node:fs').writeFileSync('${mark('filter')}','x')"`]);
    git(repo, ['config', 'filter.pwn.smudge', 'cat']);
    git(repo, ['config', 'merge.pwn.driver', `node -e "require('node:fs').writeFileSync('${mark('driver')}','x')" %O %A %B`]);
    write(join(repo, '.git', 'hooks'), 'post-merge', `#!/bin/sh\nnode -e "require('node:fs').writeFileSync('${mark('hook')}','x')"\n`);
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => {
      write(root, 'repo/.gitattributes', '* filter=pwn merge=pwn\n');
      write(root, 'repo/.gitmodules', '[submodule "evil"]\n\tpath = evil\n\turl = https://invalid.example/x.git\n');
      write(root, 'repo/hooks/post-merge', 'solver text\n');
      write(root, 'repo/src/app.py', 'y\n');
    });

    const result = lookBounty(repo, id, { from: dir });
    expect(result.attempt.outcome).toBe('answered');
    // Since BT6b the merge refuses before anything is touched: `node -e` is a
    // wrapper whose payload the tool cannot place inside or outside the
    // repository, and a configured command it cannot place is refused by
    // name. The solver's files never land — and no sentinel can fire.
    expect(refusalOf(() => applyBounty(repo, id))).toBe('apply-unsafe-config');
    expect(existsSync(join(repo, '.gitattributes'))).toBe(false);
    for (const name of ['filter', 'driver', 'hook']) {
      expect(existsSync(join(marks, name)), `sentinel ${name} fired`).toBe(false);
    }
    // Nothing landed, and nothing of the solver's ran anywhere in between.
    for (const name of ['filter', 'driver', 'hook']) {
      expect(existsSync(join(marks, name)), `sentinel ${name} fired`).toBe(false);
    }
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
    expect(lookBounty(repo, id, { from: dir }).attempt.outcome).toBe('answered');
    expect(applyBounty(repo, id).outcome).toBe('applied');
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('y\r\n'); // landed under the repo's own convention
  });

  it('a solver-added path that exists ignored in the worktree is a named refusal — porcelain never lists ignored files', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', '.gitignore': 'precious.txt\n' });
    write(repo, 'precious.txt', 'PRECIOUS LOCAL BYTES\n');
    expect(git(repo, ['status', '--porcelain', '--ignored'])).toContain('precious.txt'); // prove it really is ignored
    const { id, delivered } = posted(repo);
    const dir = returned(delivered, root => write(root, 'repo/precious.txt', 'FOREIGN\n'));
    expect(lookBounty(repo, id, { from: dir }).attempt.outcome).toBe('answered');
    const refusal = expectRefusal(() => applyBounty(repo, id), 'apply-worktree-dirty');
    expect(refusal.message).toContain('precious.txt');
    expect(readFileSync(join(repo, 'precious.txt'), 'utf8')).toBe('PRECIOUS LOCAL BYTES\n');
    expect(readRecord(repo, id).stage).toBe('answered');
  });
});

// The agent-facing surface, driven through the built CLI: exit codes and the
// printed states for the whole return. Skipped unless the bundle exists —
// verify builds first.
describe('box bounty look/apply/close (built cli)', () => {
  const cli = (cwd: string, args: string[]) =>
    spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8' });
  const built = existsSync(CLI_DIST);
  const need = () => { if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first'); };

  it('the whole return journey through the CLI: look collects, apply merges, status names the job', () => {
    need();
    const repo = makeRepo({ 'src/app.py': 'x\n', 'TASK.md': 'fix it\n', 'JOB.md': 'winter launch\n' });
    const out = join(runRoot('out'), 'bounty');
    const create = cli(repo, ['bounty', 'create', '--why', 'w', '--title', 'fix app', '--task', 'TASK.md', '--job', 'JOB.md', '--out', out]);
    expect(create.status).toBe(0);
    const id = /bt-[a-f0-9]{12}/.exec(create.stdout)![0];
    ownerSays(repo, 'allowed');
    const inbox = join(runRoot('dest'), 'inbox');
    expect(cli(repo, ['bounty', 'post', id, '--to', inbox]).status).toBe(0);
    const delivered = join(inbox, id);
    write(delivered, 'repo/src/app.py', 'fixed\n');
    const look = cli(repo, ['bounty', 'look', id, '--from', delivered]);
    expect(look.status).toBe(0);
    expect(look.stdout).toContain('collected first');
    expect(look.stdout).toContain('written by the solver');
    expect(look.stdout).toContain(`box bounty apply ${id} 1`);
    // An answered attempt waits: nothing merged yet.
    expect(readFileSync(join(repo, 'src', 'app.py'), 'utf8')).toBe('x\n');
    const apply = cli(repo, ['bounty', 'apply', id, '1']);
    expect(apply.status).toBe(0);
    expect(apply.stdout).toContain('applied');
    expect(apply.stdout).toContain('JOB.md');
    const status = cli(repo, ['bounty', 'status']);
    expect(status.stdout).toContain(`${id} applied (job: JOB.md)`);
    // An ended bounty refuses further transitions by name.
    const again = cli(repo, ['bounty', 'look', id, '--from', delivered]);
    expect(again.status).toBe(3);
    expect(again.stderr).toContain('already-ended');
  });

  it('look --from on a not-posted bounty fails by name; close without a reason ends a draft', () => {
    need();
    const repo = makeRepo({ 'src/app.py': 'x\n', 'TASK.md': 't\n' });
    const out = join(runRoot('out'), 'bounty');
    const create = cli(repo, ['bounty', 'create', '--why', 'w', '--title', 't', '--task', 'TASK.md', '--out', out]);
    const id = /bt-[a-f0-9]{12}/.exec(create.stdout)![0];
    const look = cli(repo, ['bounty', 'look', id, '--from', out]);
    expect(look.status).toBe(3);
    expect(look.stderr).toContain('not-posted');
    const close = cli(repo, ['bounty', 'close', id]);
    expect(close.status).toBe(0);
    expect(close.stdout).toContain('withdrawn');
  });
});

