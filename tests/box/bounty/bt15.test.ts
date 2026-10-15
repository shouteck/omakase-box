import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { applyBounty, closeBounty, finalizeBounty, loadRecord, lookBounty, planBounty, postBounty, renderDescribe, renderHelp, renderStatus, settingsFile } from '../../../packages/box-bounty/index.js';
import { fixture, postedFixture, refused, withoutGh } from './github-fixture.js';
import { CLI_DIST, fingerprint, git, makeRepo, ownerSays, runRoot, write } from './support.js';
import { settleScanFindings } from '../../../packages/box-bounty/record.js';

const cli = (repo: string, args: string[], input?: string) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: repo, encoding: 'utf8', env: process.env, ...(input === undefined ? {} : { input }) });
const state = (repo: string) => ({
  files: fingerprint(repo),
  refs: git(repo, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/box-bounty/']),
  settings: existsSync(settingsFile()) ? readFileSync(settingsFile(), 'utf8') : null,
  records: readdirSync(join(repo, '.box/bounties')).filter(name => name.endsWith('.json')).map(name => [name, readFileSync(join(repo, '.box/bounties', name), 'utf8')])
});
const draft = (repo: string) => finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'another perspective' }));

it('global help advertises only supported create options and retains post preview', () => {
  const result = spawnSync(process.execPath, [CLI_DIST, '--help'], { encoding: 'utf8', env: process.env });
  expect(result.status, result.stderr).toBe(0);
  const lines = result.stdout.split('\n');
  expect(lines.find(line => line.startsWith('usage: box bounty create '))).toBe('usage: box bounty create --task <file|-> --why "<one line>" [--title "<one line>"] [--resume "<context>"] [--repo <path>]');
  expect(lines.find(line => line.includes('box bounty post '))).toContain('[--preview]');
});

it('an old folder post waiting for owner permission refuses before either saved file changes', () => {
  const repo = makeRepo({ 'TASK.md': 'Legacy task.\n' });
  const made = draft(repo);
  const record = loadRecord(repo, made.id);
  const folder = join(runRoot('BT15-waiting-folder'), 'old-delivery');
  writeFileSync(made.recordPath, JSON.stringify({ ...record, stage: 'waiting', waiting: { for: 'post', reason: 'owner-allow', to: folder, at: record.createdAt } }));
  ownerSays(repo, 'allowed');
  const before = state(repo);
  const result = cli(repo, ['allow', made.id]);
  expect(result.status).toBe(3);
  expect(result.stderr).toContain('(legacy-delivery-retired)');
  expect(result.stderr).toContain(`box bounty close ${made.id}`);
  expect(state(repo)).toEqual(before);
  expect(loadRecord(repo, made.id).waiting?.answered).toBeUndefined();
});

it('new scan settlements name GitHub publication while old folder settlement text still loads', () => {
  const repo = makeRepo({ 'TASK.md': 'Legacy task.\n' });
  const made = draft(repo);
  const record = loadRecord(repo, made.id);
  const legacy = 'the bounty went out to a folder — the scan does not run on a folder post, so the flagged content was not re-checked';
  record.scanFindings = [
    { at: record.createdAt, where: 'post', hits: [{ path: 'app.txt', line: 1, rule: 'test' }], settled: legacy },
    { at: record.createdAt, where: 'post', hits: [{ path: 'app.txt', line: 1, rule: 'test' }], settled: null }
  ];
  settleScanFindings(repo, record, 'went-out');
  expect(record.scanFindings.map(finding => finding.settled)).toEqual([legacy, 'the flagged content changed — the bounty went out']);
  writeFileSync(made.recordPath, JSON.stringify(record));
  expect(loadRecord(repo, made.id).scanFindings?.[0]?.settled).toBe(legacy);
});

it('the network guard refuses an unregistered gh executable even inside a fixture-shaped path', () => {
  const root = runRoot('BT15-unregistered-gh');
  const program = join(root, 'gh.exe');
  const marker = join(root, 'executed');
  copyFileSync(process.execPath, program);
  const result = spawnSync(program, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('real GitHub disabled in bounty tests');
  expect(existsSync(marker)).toBe(false);
});

it('the network guard refuses shell gh regardless of a fixture-shaped argument', () => {
  const root = runRoot('BT15-shell-gh');
  const marker = join(root, 'executed');
  const command = `"${process.execPath}" -e "require('node:fs').writeFileSync(${JSON.stringify(marker).replaceAll('"', "'")}, 'ran')" & rem gh box-bt1-`;
  const result = process.platform === 'win32'
    ? spawnSync(process.env['COMSPEC'] ?? 'cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', env: process.env })
    : spawnSync('sh', ['-c', `touch '${marker}' # gh box-bt1-`], { encoding: 'utf8', env: process.env });
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('real GitHub disabled in bounty tests');
  expect(existsSync(marker)).toBe(false);
});

it('only the active fixture gh path is registered, including inherited children and nested restoration', () => {
  const before = process.env['BT15_GH_PROGRAM'];
  let outer: string | undefined;
  fixture(() => {
    outer = process.env['BT15_GH_PROGRAM'];
    expect(outer).toBeDefined();
    const child = spawnSync(process.execPath, ['-e', `const cp = require('node:child_process'); const r = cp.spawnSync(process.env.BT15_GH_PROGRAM, ['version'], { encoding: 'utf8', env: process.env }); process.stdout.write(r.stdout); process.exit(r.status);`], { encoding: 'utf8', env: process.env });
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toBe('gh version 2.40.0\n');
    fixture(() => {
      expect(process.env['BT15_GH_PROGRAM']).not.toBe(outer);
      const blocked = spawnSync(outer!, ['version'], { encoding: 'utf8', env: process.env });
      expect(blocked.status).toBe(1);
      expect(blocked.stderr).toBe('real GitHub disabled in bounty tests');
    });
    expect(process.env['BT15_GH_PROGRAM']).toBe(outer);
  });
  expect(process.env['BT15_GH_PROGRAM']).toBe(before);
  const blocked = spawnSync(outer!, ['version'], { encoding: 'utf8', env: process.env });
  expect(blocked.status).toBe(1);
  expect(blocked.stderr).toBe('real GitHub disabled in bounty tests');
});

it.each([
  ['--out', 'folder-delivery-retired', 'GitHub'],
  ['--note', 'create-option-retired', 'task file'],
  ['--job', 'create-option-retired', '--resume'],
  ['--preview', 'create-option-retired', 'post --preview'],
  ['--out=unused', 'folder-delivery-retired', 'GitHub'],
  ['--note=unused', 'create-option-retired', 'task file'],
  ['--job=unused', 'create-option-retired', '--resume'],
  ['--preview=true', 'create-option-retired', 'post --preview']
])('create %s refuses before any draft or input mutation', (option, reason, next) => {
  const repo = makeRepo({ 'TASK.md': 'Repair the app.\n', 'app.txt': 'owner bytes\n' });
  draft(repo);
  const legacy = join(dirname(repo), 'bounties/repair-the-app');
  write(legacy, 'keep.txt', 'an existing owner folder\n');
  const before = state(repo);
  const result = cli(repo, ['create', '--task', 'TASK.md', '--why', 'stuck', option, legacy]);
  expect(result.status).toBe(3);
  expect(result.stderr).toContain(`(${reason})`);
  expect(result.stderr).toContain(next);
  expect(state(repo)).toEqual(before);
  expect(readFileSync(join(legacy, 'keep.txt'), 'utf8')).toBe('an existing owner folder\n');
});

it.each(['post', 'look', 'apply'])('%s refuses its retired folder spelling without changing the record or folder', command => {
  const repo = makeRepo({ 'TASK.md': 'Repair the app.\n', 'app.txt': 'owner bytes\n' });
  const made = draft(repo);
  const old = join(runRoot('BT15-old-folder'), 'existing');
  write(old, 'keep.txt', 'owner folder stays\n');
  const before = state(repo);
  const result = cli(repo, [command, made.id, command === 'post' ? '--to' : '--from', old]);
  expect(result.status).toBe(3);
  expect(result.stderr).toContain('(folder-delivery-retired)');
  expect(state(repo)).toEqual(before);
  expect(readFileSync(join(old, 'keep.txt'), 'utf8')).toBe('owner folder stays\n');
  const equals = cli(repo, [command, made.id, `${command === 'post' ? '--to' : '--from'}=${old}`]);
  expect(equals.status).toBe(3);
  expect(equals.stderr).toContain('(folder-delivery-retired)');
  expect(state(repo)).toEqual(before);
});

it('standard input keeps the exact task in the record, creates no task file and leaves an existing sibling untouched', () => {
  const repo = makeRepo({ 'app.txt': 'owner bytes\n' });
  const old = join(dirname(repo), 'bounties/repair-the-app');
  write(old, 'keep.txt', 'owner folder stays\n');
  const before = fingerprint(repo);
  const task = '# Repair the app. More detail for the solver.\nI tried the existing implementation twice.\n';
  const result = cli(repo, ['create', '--task', '-', '--why', 'need another view'], task);
  expect(result.status, result.stderr).toBe(0);
  const id = /bt-[a-f0-9]{12}/.exec(result.stdout)![0];
  const record = loadRecord(repo, id);
  expect(record.content?.task).toEqual({ file: 'standard input', text: task });
  expect(record.title).toBe('Repair the app.');
  expect(record.folder).toBeUndefined();
  expect(record.manifestSha256).toBeUndefined();
  expect(result.stdout).toContain('task: standard input');
  expect(result.stdout).toContain('creates no task file');
  expect(result.stdout).not.toContain('would ship:');
  expect(fingerprint(repo)).toEqual(before);
  expect(readFileSync(join(old, 'keep.txt'), 'utf8')).toBe('owner folder stays\n');
  expect(readdirSync(old)).toEqual(['keep.txt']);
  expect(git(repo, ['rev-parse', `refs/box-bounty/${id}`])).toBe(record.snapshot.commit);
});

it('empty standard input is missing-task and writes no new draft or bookmark', () => {
  const repo = makeRepo({ 'TASK.md': 'Existing task.\n' });
  draft(repo);
  const before = state(repo);
  const result = cli(repo, ['create', '--task', '-', '--why', 'stuck'], ' \n');
  expect(result.status).toBe(3);
  expect(result.stderr).toContain('(missing-task)');
  expect(result.stderr).toContain('standard input');
  expect(state(repo)).toEqual(before);
});

it('standard input reaches the same issue formatter and owner permission gate', () => fixture(({ repo, state: remote }) => {
  const task = 'Repair the input flow.\nI tried the <guest> route twice.\n';
  const created = cli(repo, ['create', '--task', '-', '--why', 'need another view'], task);
  expect(created.status, created.stderr).toBe(0);
  const id = /(bt-[a-f0-9]{12}) — drafted/.exec(created.stdout)![1]!;
  ownerSays(repo, 'ask');
  const held = cli(repo, ['post', id]);
  expect(held.status, held.stderr).toBe(0);
  expect(held.stdout).toContain('waiting for the owner');
  expect(loadRecord(repo, id).waiting?.reason).toBe('owner-ask');
  expect(remote().issues).toEqual([]);
  ownerSays(repo, 'allowed');
  const posted = cli(repo, ['post', id]);
  expect(posted.status, posted.stderr).toBe(0);
  expect(remote().issues[0]!.body).toContain('Repair the input flow.\nI tried the &lt;guest> route twice.');
  expect(remote().issues[0]!.body).not.toContain('need another view');
}));

it('resume holds both unfinished work and the larger job without a tool length limit, and neither it nor why reaches the issue', () => fixture(({ repo, state: remote }) => {
  const resume = 'PRIVATE_UNFINISHED_WORK: continue the checkout.\nPRIVATE_LARGER_JOB: ship the account page.\n' + 'more private job context\n'.repeat(400);
  const created = cli(repo, ['create', '--task', 'TASK.md', '--why', 'PRIVATE_WHY', '--resume', resume]);
  expect(created.status, created.stderr).toBe(0);
  const id = /(bt-[a-f0-9]{12}) — drafted/.exec(created.stdout)![1]!;
  const record = loadRecord(repo, id);
  expect(record.resume?.kind === 'recorded' ? record.resume.note : null).toBe(resume.trim());
  expect(record.job).toBeUndefined();
  const posted = cli(repo, ['post', id]);
  expect(posted.status, posted.stderr).toBe(0);
  const body = remote().issues[0]!.body;
  for (const marker of ['PRIVATE_UNFINISHED_WORK', 'PRIVATE_LARGER_JOB', 'PRIVATE_WHY']) expect(body).not.toContain(marker);
}));

it.each([
  ['missing', 'github-cli-missing'],
  ['not-signed-in', 'github-not-signed-in'],
  ['unreachable', 'github-visibility-unreadable']
])('create still drafts with GitHub %s and names the reason', (cause, reason) => fixture(({ repo, id, update }) => {
  if (cause === 'not-signed-in') update({ auth: false });
  if (cause === 'unreachable') update({ fail: 'repos/' });
  const run = () => {
    const result = cli(repo, ['create', '--task', 'TASK.md', '--why', 'another opinion']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Publication plan unavailable (${reason})`);
    expect(result.stdout).toContain('post works it out and shows it before anything becomes public');
    const created = /(bt-[a-f0-9]{12}) — drafted/.exec(result.stdout)![1]!;
    expect(created).not.toBe(id);
    expect(loadRecord(repo, created).stage).toBe('drafted');
  };
  if (cause === 'missing') withoutGh(run); else run();
}));

it('create describes the same default publication as post preview and keeps uncommitted work home', () => fixture(({ repo }) => {
  write(repo, 'app.txt', 'uncommitted owner progress\n');
  const created = cli(repo, ['create', '--task', 'TASK.md', '--why', 'another opinion']);
  expect(created.status, created.stderr).toBe(0);
  const id = /(bt-[a-f0-9]{12}) — drafted/.exec(created.stdout)![1]!;
  const posted = cli(repo, ['post', id, '--preview']);
  expect(posted.status, posted.stderr).toBe(0);
  const plan = posted.stdout.split('\nIssue title:')[0]!;
  expect(created.stdout).toContain(plan);
  expect(created.stdout).toContain('stay home');
  expect(created.stdout).not.toContain('would ship:');
}));

it('an old folder-posted record is readable and closes offline, while collection refuses and leaves the folder alone', () => {
  const repo = makeRepo({ 'TASK.md': 'Legacy task.\n' });
  const made = draft(repo);
  const old = join(runRoot('BT15-old-record'), 'original');
  write(old, 'keep.txt', 'old owner bytes\n');
  const original = loadRecord(repo, made.id);
  const { content, ...legacy } = original;
  const record = { ...legacy, folder: old, job: { file: 'OLD_JOB.md', text: 'the larger job' }, stage: 'posted', events: [...original.events, { stage: 'posted', at: original.createdAt, destination: old }] };
  writeFileSync(made.recordPath, JSON.stringify(record));
  const before = readFileSync(made.recordPath);
  withoutGh(() => {
    expect(renderStatus(repo, { id: made.id })).toContain(`box bounty close ${made.id}`);
    refused(() => lookBounty(repo, made.id, 1), 'legacy-delivery-retired');
    refused(() => applyBounty(repo, made.id, 1), 'legacy-delivery-retired');
    expect(readFileSync(made.recordPath)).toEqual(before);
    expect(closeBounty(repo, made.id, 'retired delivery').outcome).toBe('rejected');
    expect(renderStatus(repo, { id: made.id })).toContain('OLD_JOB.md');
  });
  expect(readFileSync(join(old, 'keep.txt'), 'utf8')).toBe('old owner bytes\n');
});

it('a pre-BT6a GitHub publication still shows its history and closes; collection requires closing the retired route', () => postedFixture(({ repo, id, state: remote }) => {
  const record = loadRecord(repo, id);
  const { kind, ...publication } = record.github!;
  const old = { ...record, github: publication };
  const file = join(repo, '.box/bounties', id + '.json');
  writeFileSync(file, JSON.stringify(old));
  expect(renderStatus(repo, { id, full: true })).toContain('snapshot-posted');
  const before = readFileSync(file);
  refused(() => lookBounty(repo, id, 1), 'legacy-delivery-retired');
  refused(() => applyBounty(repo, id, 1), 'legacy-delivery-retired');
  expect(readFileSync(file)).toEqual(before);
  expect(closeBounty(repo, id).outcome).toBe('withdrawn');
  expect(remote().issues[0]?.state).toBe('closed');
}));

it('the accepted --to github spelling posts normally and is absent from output and help', () => fixture(({ repo, id }) => {
  const result = cli(repo, ['post', id, '--to', 'github']);
  expect(result.status, result.stderr).toBe(0);
  expect(loadRecord(repo, id).stage).toBe('posted');
  expect(result.stdout).not.toContain('--to github');
  const help = renderHelp();
  for (const spelling of ['--out', '--from', '--note', '--job', '--to']) expect(help).not.toContain(spelling);
  expect(help).toContain('--task <file|->');
  expect(help).toContain('written for the solver');
  expect(help).toContain('Put what you tried in the task');
  expect(renderDescribe(repo)).not.toContain('local folder');
}));
