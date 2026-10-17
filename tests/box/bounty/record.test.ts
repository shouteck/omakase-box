import { postToGitHub, collectPullRequest, applyGitHub, closeGitHub, statusGitHub } from './github-solver.js';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, closeBounty, finalizeBounty, loadRecord, planBounty, postBounty, renderStatus, resolveRepoRoot } from '../../../packages/box-bounty/index.js';
import type { BountyRecord, CreateOptions } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, RECORDS_DIR_REL, git, listTree, makeRepo, ownerSays, readRecord, recordExists, runRoot, write, writeRecord } from './support.js';

// The record and the lifecycle: the record file is written at create
// and the bounty moves drafted → posted through recorded events — or ends as
// withdrawn, or waits on the owner. The create-time capture is used while
// `create` runs and kept nowhere; records from before that carry `snapshot`
// and a `refs/box-bounty/<id>` pin and still load and close. Every wrong move
// is a named refusal, never a crash and never silence.

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md'), ...extra };
}

function created(repo: string) {
  return finalizeBounty(planBounty(options(repo)));
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

describe('the bounty record', () => {
  it(`create writes ${RECORDS_DIR_REL}/<id>.json at stage drafted and pins nothing — no snapshot field, no ref`, () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const result = created(repo);
    const record = readRecord(repo, result.id);
    expect(record.kind).toBe('box-bounty-record');
    expect(record.stage).toBe('drafted');
    expect(record.title).toBe('a task');
    expect('level' in record).toBe(false); // records written now carry no level
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect('snapshot' in record).toBe(false); // records written now keep no snapshot
    expect(record.folder).toBeUndefined();
    expect(record.content?.task.text).toBe('the task\n');
    expect(record.events).toEqual([{ stage: 'drafted', at: record.createdAt }]);
    // The capture serves the scan and the note while create runs; nothing is
    // pinned afterwards, so the draft leaves no refs/box-bounty/<id> behind.
    expect(git(repo, ['for-each-ref', '--format=%(refname)', 'refs/box-bounty/'])).toBe('');
  });

  it('an old record that kept `snapshot` and its ref still loads, survives gc and closes the ref away', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const result = created(repo);
    // Hand-made pre-BT24 shape: the record stored the snapshot field and
    // create had pinned refs/box-bounty/<id> at its commit.
    const record = { ...readRecord(repo, result.id), snapshot: result.plan.snapshot };
    writeRecord(repo, record);
    git(repo, ['update-ref', `refs/box-bounty/${result.id}`, result.plan.snapshot.commit]);
    expect(loadRecord(repo, result.id).snapshot?.commit).toBe(result.plan.snapshot.commit);
    // The durability ref pins snapshot.commit: gc --prune=now cannot take it.
    git(repo, ['gc', '--prune=now', '-q']);
    expect(git(repo, ['cat-file', '-t', result.plan.snapshot.commit])).toBe('commit');
    closeGitHub(repo, result.id);
    const ref = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', `refs/box-bounty/${result.id}`], { encoding: 'utf8' });
    expect(ref.status).not.toBe(0); // the ref is gone with the record closed
  });

  it('never ships .box records inside a later bounty', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const first = created(repo);
    expect(recordExists(repo, first.id)).toBe(true);
    const second = finalizeBounty(planBounty(options(repo, { })));
    const shipped = second.plan.files.map(file => file.path);
    expect(shipped.some(path => path.startsWith('.box/'))).toBe(false);
    expect(shipped.some(path => path.includes(first.id))).toBe(false);
    // The removal is accounted under the new built-in rule (names shown only in
    // the local preview, never inside the bounty): the record itself, and the
    // open-bounties line file BT4 writes alongside it.
    const dotBox = second.plan.ruleRemovals.find(entry => entry.rule === 'dot-box');
    expect(dotBox?.removed).toBe(2);
    expect(dotBox?.paths).toEqual([`${RECORDS_DIR_REL}/${first.id}.json`, `${RECORDS_DIR_REL}/OPEN`].sort());
  });

  it('status says what to do on an empty project — never nothing', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const status = statusGitHub(resolveRepoRoot(repo));
    expect(status).toContain('no open bounties');
    expect(status).toContain('box bounty create');
    expect(status).toContain('ended: none');
  });

  it('status lists every open bounty with id, stage and next step; ended are a compact line', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const open = created(repo);
    const second = finalizeBounty(planBounty(options(repo, { })));
    const closed = finalizeBounty(planBounty(options(repo, { })));
    closeGitHub(repo, closed.id);
    const status = statusGitHub(resolveRepoRoot(repo));
    expect(status).toContain('2 open');
    expect(status).toContain(`${open.id}  drafted`);
    expect(status).toContain(`${second.id}  drafted`);
    expect(status).toContain(`box bounty post ${open.id}`);
    expect(status).toContain('owner: nothing written');
    expect(status).toContain(`ended: ${closed.id} withdrawn`);
  });

  it('a record left `undone` by the removed command still loads, shows what it is, and names a next step that exists', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    // Only `undo` could leave this stage; the file is rewritten the way an
    // old record sits on disk, never produced through a live command.
    const older = readRecord(repo, id);
    older.stage = 'undone';
    older.events = [...older.events, { stage: 'undone' as BountyRecord['stage'], at: new Date().toISOString() }];
    writeRecord(repo, older);
    const status = statusGitHub(resolveRepoRoot(repo));
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
    const older = readRecord(repo, id);
    older.stage = 'confirmed';
    older.events = [...older.events, { stage: 'confirmed' as BountyRecord['stage'], at: new Date().toISOString(), command: 'confirm' }];
    writeRecord(repo, older);
    const { record } = postToGitHub(repo, id);
    expect(record.stage).toBe('posted');
    expect(record.allowedBy?.decision).toBe('once');
    expect(readRecord(repo, id).events.map(event => event.stage)).toEqual(['drafted', 'confirmed', 'posted']);
  });

  it('refuses an unknown id by name, whatever the owner wrote', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    ownerSays(repo, 'allowed');
    expectRefusal(() => postToGitHub(repo, 'bt-000000000000'), 'unknown-bounty');
  });
});

describe('post — gated first delivery to a local folder', () => {
  it('holds the first post when the owner has not decided: owner-allow-needed', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    const refusal = expectRefusal(() => postToGitHub(repo, id), 'owner-allow-needed');
    expect(loadRecord(repo, id).stage).toBe('waiting');
  });
});

describe('close — ends an open bounty cleanly', () => {
  it('ends any open stage, removes the durability ref, and repeats as a named state', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    const first = closeGitHub(repo, id);
    expect(first.outcome).toBe('withdrawn');
    expect(readRecord(repo, id).stage).toBe('withdrawn');
    expect(readRecord(repo, id).events.map(event => event.stage)).toEqual(['drafted', 'withdrawn']);
    const ref = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', `refs/box-bounty/${id}`], { encoding: 'utf8' });
    expect(ref.status).not.toBe(0); // the ref is gone; gc may now prune the snapshot
    const second = closeGitHub(repo, id);
    expect(second.outcome).toBe('already-ended'); // a named state, not an error
    const status = statusGitHub(resolveRepoRoot(repo));
    expect(status).toContain('no open bounties');
    expect(status).toContain(`${id} withdrawn`);
  });

  it('closes a posted bounty too', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = created(repo);
    ownerSays(repo, 'allowed');
    postToGitHub(repo, id);
    expect(closeGitHub(repo, id).outcome).toBe('withdrawn');
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
});

