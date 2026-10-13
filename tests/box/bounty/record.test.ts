import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, closeBounty, finalizeBounty, loadRecord, planBounty, postBounty, renderStatus, resolveRepoRoot } from '../../../packages/box-bounty/index.js';
import type { BountyRecord, CreateOptions } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, git, listTree, makeRepo, ownerSays, runRoot, write } from './support.js';

// The record and the lifecycle: `.box/bounties/<id>.json` is written at create,
// the snapshot commit is pinned under refs/box-bounty/<id>, and the bounty moves
// drafted → posted through recorded events — or ends as withdrawn, or waits on
// the owner. Every wrong move is a named refusal, never a crash and never
// silence.

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('out'), 'bounty'), ...extra };
}

function created(repo: string) {
  return finalizeBounty(planBounty(options(repo)));
}

const readRecord = (repo: string, id: string): BountyRecord =>
  JSON.parse(readFileSync(join(repo, '.box', 'bounties', `${id}.json`), 'utf8')) as BountyRecord;

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

describe('the bounty record', () => {
  it('create writes .box/bounties/<id>.json at stage drafted and pins the snapshot under a ref gc cannot prune', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const result = created(repo);
    const record = readRecord(repo, result.id);
    expect(record.kind).toBe('box-bounty-record');
    expect(record.stage).toBe('drafted');
    expect(record.title).toBe('a task');
    expect('level' in record).toBe(false); // records written now carry no level
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.snapshot.commit).toBe(result.plan.snapshot.commit);
    expect(record.snapshot.tree).toBe(result.plan.snapshot.tree);
    expect(record.folder).toBe(result.outDir);
    expect(record.folder).toMatch(/^[A-Za-z]:[/\\]|^\//); // absolute
    expect(record.events).toEqual([{ stage: 'drafted', at: record.createdAt }]);
    // The durability ref pins snapshot.commit: gc --prune=now cannot take it.
    expect(git(repo, ['rev-parse', `refs/box-bounty/${result.id}`])).toBe(result.plan.snapshot.commit);
    git(repo, ['gc', '--prune=now', '-q']);
    expect(git(repo, ['cat-file', '-t', result.plan.snapshot.commit])).toBe('commit');
  });

  it('never ships .box records inside a later bounty', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const first = created(repo);
    expect(existsSync(join(repo, '.box', 'bounties', `${first.id}.json`))).toBe(true);
    const second = finalizeBounty(planBounty(options(repo, { outDir: join(runRoot('out'), 'bounty2') })));
    const shipped = listTree(join(second.outDir, 'repo'));
    expect(shipped.some(path => path.startsWith('.box/'))).toBe(false);
    expect(shipped.some(path => path.includes(first.id))).toBe(false);
    // The removal is accounted under the new built-in rule (names shown only in
    // the local preview, never inside the bounty): the record itself, and the
    // open-bounties line file BT4 writes alongside it.
    const dotBox = second.plan.ruleRemovals.find(entry => entry.rule === 'dot-box');
    expect(dotBox?.removed).toBe(2);
    expect(dotBox?.paths).toEqual([`.box/bounties/${first.id}.json`, '.box/bounties/OPEN'].sort());
  });

  it('status says what to do on an empty project — never nothing', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain('no open bounties');
    expect(status).toContain('box bounty create');
    expect(status).toContain('ended: none');
  });

  it('status lists every open bounty with id, stage and next step; ended are a compact line', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const open = created(repo);
    const second = finalizeBounty(planBounty(options(repo, { outDir: join(runRoot('out'), 'b2') })));
    const closed = finalizeBounty(planBounty(options(repo, { outDir: join(runRoot('out'), 'b3') })));
    closeBounty(repo, closed.id);
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain('2 open');
    expect(status).toContain(`${open.id}  drafted`);
    expect(status).toContain(`${second.id}  drafted`);
    expect(status).toContain(`box bounty post ${open.id} --to <dir|github>`);
    expect(status).toContain('owner: nothing written');
    expect(status).toContain(`ended: ${closed.id} withdrawn`);
  });

  it('a record left `undone` by the removed command still loads, shows what it is, and names a next step that exists', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    // Only `undo` could leave this stage; the file is rewritten the way an
    // old record sits on disk, never produced through a live command.
    const file = join(repo, '.box', 'bounties', `${id}.json`);
    const older = JSON.parse(readFileSync(file, 'utf8')) as BountyRecord;
    older.stage = 'undone';
    older.events = [...older.events, { stage: 'undone' as BountyRecord['stage'], at: new Date().toISOString() }];
    writeFileSync(file, JSON.stringify(older, null, 2) + '\n');
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain(`ended: ${id} undone`);
    expect(status).toContain(`box bounty status ${id} --full`);
    expect(status).toContain('box bounty create --task <file>');
    for (const gone of ['answer', 'questions', 'reply', 'undo', 'reject', 'withdraw', 'remind', 'confirm']) {
      expect(status).not.toContain(`bounty ${gone}`);
    }
  });
});

describe('the owner\'s written yes — the gate every post passes once', () => {
  it('a pre-BT8 record at stage `confirmed` still loads and posts — the yes written on the record stands', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    // The file is rewritten the way a record from before the owner decision
    // moved to the settings folder sits on disk — `confirm` wrote this stage
    // and its event; nothing writes it today.
    const file = join(repo, '.box', 'bounties', `${id}.json`);
    const older = JSON.parse(readFileSync(file, 'utf8')) as BountyRecord;
    older.stage = 'confirmed';
    older.events = [...older.events, { stage: 'confirmed' as BountyRecord['stage'], at: new Date().toISOString(), command: 'confirm' }];
    writeFileSync(file, JSON.stringify(older, null, 2) + '\n');
    const { record } = postBounty(repo, id, join(runRoot('dest'), 'inbox'));
    expect(record.stage).toBe('posted');
    expect(record.allowedBy?.decision).toBe('once');
    expect(readRecord(repo, id).events.map(event => event.stage)).toEqual(['drafted', 'confirmed', 'posted']);
  });

  it('refuses an unknown id by name, whatever the owner wrote', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    ownerSays(repo, 'allowed');
    expectRefusal(() => postBounty(repo, 'bt-000000000000', join(runRoot('dest'), 'inbox')), 'unknown-bounty');
  });
});

describe('post — gated first delivery to a local folder', () => {
  it('holds the first post when the owner has not decided: owner-allow-needed', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    const refusal = expectRefusal(() => postBounty(repo, id, join(runRoot('dest'), 'inbox')), 'owner-allow-needed');
    expect(loadRecord(repo, id).stage).toBe('waiting');
  });

  it('copies the bounty folder to <dir>/<id> and marks the record posted with the destination', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, outDir } = created(repo);
    ownerSays(repo, 'allowed');
    const inbox = join(runRoot('dest'), 'inbox');
    const { record, destination } = postBounty(repo, id, inbox);
    expect(destination).toBe(join(inbox, id));
    expect(existsSync(join(destination, 'bounty.json'))).toBe(true);
    expect(existsSync(join(destination, 'repo', 'src', 'app.py'))).toBe(true);
    // Copy, not move: the recorded folder is still where create wrote it.
    expect(existsSync(join(outDir, 'bounty.json'))).toBe(true);
    expect(record.stage).toBe('posted');
    const onDisk = readRecord(repo, id);
    expect(onDisk.events.map(event => event.stage)).toEqual(['drafted', 'posted']);
    expect(onDisk.events[1]!.destination).toBe(destination);
  });

  it('refuses a destination inside the repository, by name', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    ownerSays(repo, 'allowed');
    const refusal = expectRefusal(() => postBounty(repo, id, join(repo, 'delivered')), 'destination-inside-repo');
    expect(refusal.message).toContain('inside the repository');
  });

  it('refuses a destination that already exists, by name', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    ownerSays(repo, 'allowed');
    const inbox = join(runRoot('dest'), 'inbox');
    mkdirSync(join(inbox, id), { recursive: true });
    expectRefusal(() => postBounty(repo, id, inbox), 'destination-exists');
  });

  it('refuses when the recorded folder is gone, by name', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id, outDir } = created(repo);
    ownerSays(repo, 'allowed');
    rmSync(outDir, { recursive: true, force: true });
    const refusal = expectRefusal(() => postBounty(repo, id, join(runRoot('dest'), 'inbox')), 'folder-missing');
    expect(refusal.message).toContain(outDir);
  });

  it('refuses when the recorded folder\'s bounty.json names a different id', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const first = created(repo);
    const second = finalizeBounty(planBounty(options(repo, { outDir: join(runRoot('out'), 'b2') })));
    ownerSays(repo, 'allowed');
    // Point the first record at the second bounty's folder — not the bounty it names.
    const path = join(repo, '.box', 'bounties', `${first.id}.json`);
    const tampered = { ...readRecord(repo, first.id), folder: second.outDir };
    writeFileSync(path, JSON.stringify(tampered, null, 2) + '\n');
    expectRefusal(() => postBounty(repo, first.id, join(runRoot('dest'), 'inbox')), 'folder-mismatch');
  });

  // Host-only (K10): junction semantics exist only on Windows — the residual
  // the pass proved in BT2: a nonexistent --to under a junction used to land
  // inside the repository because only an existing --to was realpathed.
  it.skipIf(process.platform !== 'win32')('refuses a nonexistent --to under a junction pointing into the repository', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'inbox/.keep': 'x\n' });
    const { id } = created(repo);
    ownerSays(repo, 'allowed');
    const link = join(runRoot('link'), 'via-junction');
    symlinkSync(join(repo, 'inbox'), link, 'junction');
    // link/sub does not exist — its nearest existing ancestor is the junction.
    expectRefusal(() => postBounty(repo, id, join(link, 'sub')), 'destination-inside-repo');
  });
});

describe('close — ends an open bounty cleanly', () => {
  it('ends any open stage, removes the durability ref, and repeats as a named state', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    const first = closeBounty(repo, id);
    expect(first.outcome).toBe('withdrawn');
    expect(readRecord(repo, id).stage).toBe('withdrawn');
    expect(readRecord(repo, id).events.map(event => event.stage)).toEqual(['drafted', 'withdrawn']);
    const ref = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', `refs/box-bounty/${id}`], { encoding: 'utf8' });
    expect(ref.status).not.toBe(0); // the ref is gone; gc may now prune the snapshot
    const second = closeBounty(repo, id);
    expect(second.outcome).toBe('already-ended'); // a named state, not an error
    const status = renderStatus(resolveRepoRoot(repo));
    expect(status).toContain('no open bounties');
    expect(status).toContain(`${id} withdrawn`);
  });

  it('closes a posted bounty too', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    ownerSays(repo, 'allowed');
    postBounty(repo, id, join(runRoot('dest'), 'inbox'));
    expect(closeBounty(repo, id).outcome).toBe('withdrawn');
    expect(loadRecord(repo, id).stage).toBe('withdrawn');
  });
});

// The agent-facing surface, driven through the built CLI: exit codes and the
// exact printed states. Skipped unless the bundle exists — verify builds first.
describe('box bounty lifecycle (built cli)', () => {
  const cli = (cwd: string, args: string[]) =>
    spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8' });
  const built = existsSync(CLI_DIST);
  const need = () => { if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first'); };

  it('status on an empty project exits 0 and says what to do', () => {
    need();
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const run = cli(repo, ['bounty', 'status']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('no open bounties');
    expect(run.stdout).toContain('box bounty create');
  });


  it('typed `confirm` exits 3 as command-removed; an allowed post --to <dir> delivers through the CLI', () => {
    need();
    const repo = makeRepo({ 'src/app.py': 'x\n', 'TASK.md': 'the task\n' });
    const out = join(runRoot('out'), 'bounty');
    const create = cli(repo, ['bounty', 'create', '--why', 'w', '--title', 't', '--task', 'TASK.md', '--out', out]);
    const id = /bt-[a-f0-9]{12}/.exec(create.stdout)![0];
    const gone = cli(repo, ['bounty', 'confirm', id]);
    expect(gone.status).toBe(3);
    expect(gone.stderr).toContain('command-removed');
    expect(gone.stderr).toContain('box bounty post');
    ownerSays(repo, 'allowed');
    const inbox = join(runRoot('dest'), 'inbox');
    const post = cli(repo, ['bounty', 'post', id, '--to', inbox]);
    expect(post.status).toBe(0);
    expect(post.stdout).toContain('— posted —');
    expect(post.stdout).toContain('allowed by');
    expect(existsSync(join(inbox, id, 'bounty.json'))).toBe(true);
  });
});

