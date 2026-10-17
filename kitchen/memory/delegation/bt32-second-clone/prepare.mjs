// BT32 participant world builder. Creates, under --out (default
// %TEMP%\kitchen-BT32-participant):
//   remote.git     bare remote standing in for the project's GitHub remote
//   machine-a/     clone that "posted" the bounty (history writer)
//   machine-b/     THE PARTICIPANT'S CLONE — a plain `git clone` of the remote
//   settings/      the participant's own BOX_BOUNTY_SETTINGS_DIR
//   box.cmd        wrapper: node <built cli> bounty, cwd=machine-b, isolated env
//   go-offline.cmd flips the remote to a dead path (repo-local config only)
//   go-online.cmd  restores it
// The chain history is written by the PRODUCTION chain.ts (bundled once via
// vite): posted -> solution -> closed(withdrawn) for one bounty, then
// machine-b is cloned fresh so its memory is empty. Nothing touches the
// owner's credentials, PATH, or settings; no gh, no network.
//
//   node kitchen/memory/delegation/bt32-second-clone/prepare.mjs [--out <dir>]
// Refuses a nonempty --out without .kitchen-BT32-owned.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const BS = String.fromCharCode(92);
const slash = p => p.split(BS).join('/');
const REPO = slash(fileURLToPath(new URL('../../../..', import.meta.url)).replace(/[\/]+$/, ''));
const i = process.argv.indexOf('--out');
const out = resolve(i >= 0 ? process.argv[i + 1] : join(mkdtempSync(join(tmpdir(), 'kitchen-BT32-participant-')), 'run'));
if (existsSync(out) && readdirSync(out).length > 0 && !existsSync(join(out, '.kitchen-BT32-owned'))) {
  console.error(`refusing: ${out} is nonempty and lacks .kitchen-BT32-owned`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, '.kitchen-BT32-owned'), new Date().toISOString());

// Bundle the production package (chain.ts + readers) once.
const entry = join(out, 'entry.ts');
writeFileSync(entry, `export * from '${REPO}/packages/box-bounty/index.ts';\n`);
const vite = spawnSync(process.execPath, [join(REPO, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--ssr', entry, '--outDir', join(out, 'bundle'), '--emptyOutDir', '--logLevel', 'warn'], { encoding: 'utf8', cwd: REPO });
if (vite.status !== 0) { console.error(vite.stdout, vite.stderr); process.exit(1); }

const gitc = (repo, args) => execFileSync('git', ['-c', `safe.directory=${slash(repo)}`, '-C', repo, ...args], { encoding: 'utf8' }).trim();
const gitDir = dirname(execFileSync('where', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim());
// git sits in Git\mingw64\bin (or \bin); transports spawn sh from Git\usr\bin.
const gitUsrBin = join(gitDir, '..', '..', 'usr', 'bin');
const remote = join(out, 'remote.git');
mkdirSync(remote);
gitc(remote, ['init', '--bare']);
const a = join(out, 'machine-a'), b = join(out, 'machine-b');
gitc(out, ['clone', remote, a]);
writeFileSync(join(a, 'app.txt'), 'broken\n');
writeFileSync(join(a, 'TASK.md'), 'Repair the app.\n');
gitc(a, ['add', '.']);
gitc(a, ['-c', 'user.name=a', '-c', 'user.email=a@a', 'commit', '-m', 'init']);
gitc(a, ['push', 'origin', 'HEAD:refs/heads/main']);
gitc(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
const named = 'https://github.com/owner/project.git';

gitc(a, ['remote', 'set-url', 'origin', named]);
// The remote URL stays exactly what a real checkout carries; a child-process
// arg rewrite (the test stand-in's own mechanism) maps it to the bare path.
// The live target sits in remote-target.txt so go-offline/go-online flip it
// without touching anything outside the world.
writeFileSync(join(out, 'remote-target.txt'), remote + '\n');
const preload = join(out, 'git-rewrite-preload.cjs');
writeFileSync(preload, String.raw`
const cp = require('node:child_process');
const orig = cp.spawnSync;
cp.spawnSync = function (program, args, options) {
  if (/(^|[\\/])git(?:\.exe)?$/i.test(program) && Array.isArray(args)) {
    let target = process.env.BT8A_GIT_REMOTE;
    try { target = require('node:fs').readFileSync(process.env.BT32_REMOTE_FILE, 'utf8').trim(); } catch {}
    args = args.map(arg => arg === process.env.BT6_GH_REMOTE_URL ? target : arg);
  }
  return orig.call(this, program, args, options);
};
require('node:module').syncBuiltinESMExports();
`);

// Every product call runs in a child process under the arg-rewrite preload —
// the same mechanism the test fixture uses, so pushes/fetches to the github
// URL land on the bare remote.
const driver = join(out, 'driver.mjs');
writeFileSync(driver, `import { appendEvent, pushChain, syncChains } from ${JSON.stringify(pathToFileURL(join(out, 'bundle', 'entry.js')).href)};
const job = JSON.parse(process.argv[2]);
if (job.op === 'append') { appendEvent(job.repo, job.id, job.event); console.log('appended'); }
else if (job.op === 'push') { console.log(JSON.stringify(pushChain(job.repo, job.id))); }
else if (job.op === 'sync') { syncChains(job.repo, true); console.log('synced'); }
`);
const run = (job) => {
  const r = spawnSync(process.execPath, [driver, JSON.stringify(job)], {
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: `--require ${preload}`, BT32_REMOTE_FILE: join(out, 'remote-target.txt'), BT6_GH_REMOTE_URL: named, BOX_BOUNTY_SETTINGS_DIR: join(out, 'settings') }
  });
  if (r.status !== 0) throw new Error(`driver failed: ${r.stderr} ${r.stdout}`);
  return r.stdout.trim();
};

const settings = join(out, 'settings');
mkdirSync(settings, { recursive: true });
writeFileSync(join(settings, 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', default: { bounty: 'allowed', at: '2026-10-18T00:00:00.000Z', changes: [] }, projects: {} }) + '\n');
process.env.BOX_BOUNTY_SETTINGS_DIR = settings;

// Deterministic known history, written by the production code path.
const ID = 'bt-aa11bb22cc33';
const base = gitc(a, ['rev-parse', 'HEAD']);
const ev = (type, extra) => ({ v: 1, type, at: '2026-10-18T00:00:00.000Z', actor: 'owner', ...extra });
run({ op: 'append', repo: a, id: ID, event: ev('posted', {
  id: ID, title: 'Repair app startup crash', task: 'Repair the app so it starts.\nTried: node app.txt locally; the failure is in startup. Done looks like: app.txt reads "fixed" and the check exits 0.',
  why: 'startup crash blocks the release; tried "node app.txt" locally and the failure is in startup', partOf: 'release-42 readiness', followup: 'release-42 waits on this; resume on branch release-42 after the fix lands',
  base, branch: 'main', issue: { number: 7, url: 'https://github.com/owner/project/issues/7' }, published: { pushed: [{ sha: base, subject: 'init' }] }, allowedBy: { decision: 'allowed', level: 'default' }
}) });
run({ op: 'push', repo: a, id: ID });
run({ op: 'append', repo: a, id: ID, event: ev('solution', { n: 1, pullRequest: 3, author: 'solver-mq', commit: 'c'.repeat(40), changed: ['app.txt'], added: [], deleted: [], payTo: { state: 'none' } }) });
run({ op: 'push', repo: a, id: ID });
run({ op: 'append', repo: a, id: ID, event: ev('closed', { kind: 'withdrawn', reason: 'owner fixed it in the meantime' }) });
run({ op: 'push', repo: a, id: ID });

// The participant's clone: a plain clone — no chain refs fetched.
gitc(out, ['clone', '--no-local', remote, b]);
gitc(b, ['remote', 'set-url', 'origin', named]);

// The wrapper the participant runs. It never sees the owner's PATH gh,
// credentials or settings: PATH is stripped to node+git, the settings dir is
// the world's own, and the work tree is machine-b.
writeFileSync(join(out, 'empty.gitconfig'), '# intentionally empty — the participant world sees no owner git config\n');
const cli = join(REPO, 'packages', 'box-cli', 'dist', 'cli.js');
writeFileSync(join(out, 'box.cmd'), [
  '@echo off',
  `set "PATH=${dirname(process.execPath)};${gitDir};${gitUsrBin};%SystemRoot%\\System32"`,
  'set "GIT_CONFIG_NOSYSTEM=1"',
  `set "GIT_CONFIG_GLOBAL=${join(out, 'empty.gitconfig')}"`,
  `set "GIT_CONFIG_SYSTEM=${join(out, 'empty.gitconfig')}"`,
  `set "BOX_BOUNTY_SETTINGS_DIR=${settings}"`,
  `set "BT6_GH_REMOTE_URL=${named}"`,
  `set "BT32_REMOTE_FILE=${join(out, 'remote-target.txt')}"`,
  `set "NODE_OPTIONS=--require ${slash(preload)}"`,
  `cd /d "${b}"`,
  `"${process.execPath}" "${cli}" bounty %*`,
  ''
].join('\r\n'));
writeFileSync(join(out, 'go-offline.cmd'), [
  '@echo off',
  `echo ${join(out, 'dead-remote.git')}> "${join(out, 'remote-target.txt')}"`,
  '@echo remote is now dead; box will answer from its last cache'
].join('\r\n'));
writeFileSync(join(out, 'go-online.cmd'), [
  '@echo off',
  `echo ${remote}> "${join(out, 'remote-target.txt')}"`,
  '@echo remote is live again'
].join('\r\n'));
// Participant pack: the prompt is all a fresh agent gets. The truth key was
// written from the seeded events below, before any participant ran — it is the
// grader's reference, not something the participant needs.
writeFileSync(join(out, 'command.txt'), `cd /d ${out} && box.cmd status\r\n`);
writeFileSync(join(out, 'prompt.md'), [
  '# Box bounty — second-machine memory check',
  '',
  `You are on machine B of a two-machine setup. The checkout in front of you`,
  `(${b}) shares its Git remote with machine A, which ran the bounty before`,
  'you. All bounty facts you can recover travel through the shared bounty',
  'memory — nothing local to this checkout knows them.',
  '',
  'Your only tool is `box.cmd` in this directory (run it from here).',
  `It answers for the repository ${b}. The remote can be switched off and`,
  'on with `go-offline.cmd` / `go-online.cmd` — the tool still answers from',
  'what it already imported. You may not write to the repository, post,',
  'close or pay anything; read commands only.',
  '',
  `Answer these questions about bounty ${ID}:`,
  '',
  '1. Why was this bounty posted, and what had already been tried?',
  '2. What was the task — what was the solver asked to fix?',
  '3. What larger piece of work is this bounty part of?',
  '4. What should happen after it — the follow-up the poster recorded?',
  '5. How did it end? Was a solution submitted, and what was the final',
  '   outcome?',
  '6. Switch the remote off (`go-offline.cmd`) and ask again: does the',
  '   answer survive, and does the tool say it could not refresh?',
  '',
  'Report the answers as plain lines. Do not modify the repository.',
  ''
].join('\r\n'));
writeFileSync(join(out, 'truth-key.md'), [
  `# Truth key — ${ID} (written before the participant ran)`,
  '',
  '1. why: "startup crash blocks the release; tried node app.txt locally',
  '   and the failure is in startup"',
  '2. task: repair the app so it starts (title: "Repair app startup crash";',
  '   the task text is searchable via `box bounty find` but not rendered — a',
  '   correct answer names the startup crash, not the file contents)',
  '3. partOf: "release-42 readiness"',
  '4. followup: "release-42 waits on this; resume on branch release-42 after',
  '   the fix lands"',
  '5. outcome: one solution submitted (n=1, PR #3 by solver-mq, commit',
  `   ${'c'.repeat(40)}), then the bounty was closed as withdrawn — "owner`,
  '   fixed it in the meantime"',
  '6. offline: `box.cmd status` still shows the bounty (ended: withdrawn) and',
  '   reports "shared bounty memory not refreshed ... showing what this',
  '   machine last saw"',
  ''
].join('\r\n'));
console.log(JSON.stringify({ world: out, machineB: b, bountyId: ID, wrapper: join(out, 'box.cmd') }, null, 2));
