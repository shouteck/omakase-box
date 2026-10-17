// BT12 — proved from a clean machine, on the host this suite runs on. A
// temp folder outside the checkout plays the clean machine: the artifact is
// packed, installed with one command into an empty prefix, and the whole $0
// bounty journey runs through the `box` on PATH — never against this
// repository's build, never against real GitHub (the gh-standin and a bare
// remote stand in, the same shape bt17-measure drives). On the hosted
// runner the same file runs on Linux — the off-machine leg of the wave.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { recordIds } from './support.js';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const STANDIN = join(ROOT, 'kitchen/demo/gh-standin.cjs');
const REMOTE_URL = 'https://github.com/owner/project.git';
const BS = String.fromCharCode(92);

const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'box-bt12-clean-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); });

const npm = (args: string[], cwd?: string) => process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm', ...args], { cwd, encoding: 'utf8', windowsHide: true, input: '' })
  : spawnSync('npm', args, { cwd, encoding: 'utf8', input: '' });

let root = '';
let tarball = '';
let prefix = '';
let env: Record<string, string> = {};
let state = '';
let bare = '';

const box = (args: string[], cwd: string) => {
  const bin = process.platform === 'win32' ? join(prefix, 'box.cmd') : join(prefix, 'bin', 'box');
  const run = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', bin, ...args], { cwd, encoding: 'utf8', env, windowsHide: true, input: '' })
    : spawnSync(bin, args, { cwd, encoding: 'utf8', env, input: '' });
  if (run.error !== undefined) throw new Error(`box ${args.join(' ')}: ${run.error}`);
  return run;
};

const git = (cwd: string, args: string[]) => {
  const run = spawnSync('git', ['-c', `safe.directory=${cwd.replaceAll(BS, '/')}`, '-c', 'user.name=bt12', '-c', 'user.email=bt12@invalid', '-C', cwd, ...args], { encoding: 'utf8', env });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
};

// One command gives `box`; before that the stand-in world is staged so the
// journey below needs no network and no credential — the fixture `gh` is a
// copy of node.exe (resolveProgram must find it; the NODE_OPTIONS shim turns
// its calls into gh-standin.cjs runs before it ever executes).
beforeAll(() => {
  root = temp();
  tarball = join(root, 'artifact.tgz');
  const pack = spawnSync(process.execPath, [join(ROOT, 'packages/box-cli/pack.mjs'), '--out', root], { encoding: 'utf8', timeout: 240000 });
  expect(pack.status, `${pack.stdout}\n${pack.stderr}`).toBe(0);
  const summary = JSON.parse(pack.stdout.slice(pack.stdout.indexOf('{'))) as { tarball: string };
  copyFileSync(summary.tarball, tarball);

  const settings = join(root, 'settings');
  const bin = join(root, 'bin');
  state = join(root, 'state.json');
  bare = join(root, 'remote.git');
  const shim = join(root, 'shim.cjs');
  mkdirSync(settings, { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(state, JSON.stringify({ account: 'owner', issues: [], comments: [], prs: [], labels: [] }));
  writeFileSync(shim, `const cp = require('node:child_process');\nconst { syncBuiltinESMExports } = require('node:module');\nconst standin = process.env.REPLAY_GH_STANDIN;\nconst bare = process.env.REPLAY_BARE;\nconst remoteUrl = process.env.REPLAY_REMOTE_URL;\nconst original = cp.spawnSync;\ncp.spawnSync = function (file, args, options) {\n  const base = String(file).split(/[\\\\/]/).pop().toLowerCase();\n  if (standin && (base === 'gh' || base === 'gh.exe')) return original.call(this, process.execPath, [standin, ...(args ?? [])], options);\n  if (bare && remoteUrl && (base === 'git' || base === 'git.exe')) return original.call(this, file, (args ?? []).map(a => a === remoteUrl ? bare : a), options);\n  return original.call(this, file, args, options);\n};\ntry { syncBuiltinESMExports(); } catch {}\n`);
  if (process.platform === 'win32') copyFileSync(process.execPath, join(bin, 'gh.exe'));
  else { writeFileSync(join(bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "$@"\n`); const { chmodSync } = require('node:fs'); chmodSync(join(bin, 'gh'), 0o755); }
  git(root, ['init', '--bare', '-q', bare]);
  // The scrubbed environment: nothing of the runner's is inherited but what
  // starting programs needs. PATH holds only the gh stand-in folder, the
  // folder of the running node (npm and npx live beside it), the folder git
  // is found in and, on Windows, System32 for cmd.exe. HOME, USERPROFILE,
  // APPDATA and LOCALAPPDATA point into the scratch root, so no global git
  // config, npm config or npm cache of this machine is read.
  const home = join(root, 'home');
  mkdirSync(join(home, 'AppData', 'Roaming'), { recursive: true });
  mkdirSync(join(home, 'AppData', 'Local'), { recursive: true });
  const found = (name: string) => (process.env.PATH ?? '').split(delimiter).find(dir => dir !== ''
    && (process.platform === 'win32' ? ['.exe', '.cmd'].some(ext => existsSync(join(dir, name + ext))) : existsSync(join(dir, name))));
  const gitDir = found('git');
  expect(gitDir, 'git on the runner PATH').toBeDefined();
  const path = [bin, dirname(process.execPath), gitDir!];
  const keep: Record<string, string> = {};
  if (process.platform === 'win32') {
    const system = process.env.SystemRoot ?? 'C:\Windows';
    path.push(join(system, 'System32'));
    for (const name of ['SystemRoot', 'windir', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'NoDefaultCurrentDirectoryInExePath']) {
      if (process.env[name] !== undefined) keep[name] = process.env[name]!;
    }
  } else if (process.env.TMPDIR !== undefined) keep.TMPDIR = process.env.TMPDIR;
  env = {
    ...keep,
    PATH: path.join(delimiter),
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home, 'AppData', 'Local'),
    BOX_BOUNTY_SETTINGS_DIR: settings,
    NODE_OPTIONS: `--require ${shim.replaceAll(BS, '/')}`,
    REPLAY_STATE: state,
    REPLAY_BARE: bare,
    REPLAY_REMOTE_URL: REMOTE_URL,
    REPLAY_GH_STANDIN: STANDIN
  };
  for (const dir of path) expect(dir.toLowerCase().startsWith(ROOT.toLowerCase()), `${dir} is inside the checkout`).toBe(false);
}, 300000);

describe('one install command on an empty machine', () => {
  it('npm install -g exposes a working `box`, and npx runs it with no install', () => {
    prefix = join(root, 'prefix');
    const install = npm(['i', '-g', '--prefix', prefix, tarball]);
    expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);
    const help = box(['bounty', 'help'], root);
    expect(help.status, `${help.stdout}\n${help.stderr}`).toBe(0);
    expect(help.stdout).toContain('the journey');
    const ver = box(['bounty', '--version'], root);
    expect(ver.stdout.trim()).toMatch(/^box \d+\.\d+\.\d+$/);

    // `npx <tarball>` treats the tarball itself as the command; for a spec
    // the bin is named through --package — `npx -p <tgz> box …`. Once the
    // name is published it is `npx box-bounty bounty …` with nothing added.
    const npxCmd = process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx', '-y', '--package', tarball, 'box', 'bounty', 'help'], { cwd: root, encoding: 'utf8', env, windowsHide: true, input: '' })
      : spawnSync('npx', ['-y', '--package', tarball, 'box', 'bounty', 'help'], { cwd: root, encoding: 'utf8', env, input: '' });
    expect(npxCmd.status, `${npxCmd.stdout}\n${npxCmd.stderr}`).toBe(0);
    expect(npxCmd.stdout).toContain('the journey');
  }, 120000);

  it('runs the whole $0 bounty journey against stand-ins', () => {
    const repo = join(root, 'project');
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main', '-q']);
    writeFileSync(join(repo, 'app.txt'), 'broken\n');
    writeFileSync(join(repo, 'TASK.md'), 'Repair the app.\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'base']);
    git(repo, ['remote', 'add', 'origin', REMOTE_URL]);
    git(repo, ['push', '-q', bare, 'main']);

    const created = box(['bounty', 'create', '--task', 'TASK.md', '--why', 'beyond this agent'], repo);
    expect(created.status, `${created.stdout}\n${created.stderr}`).toBe(0);
    const id = /bt-[a-f\d]{12}/.exec(created.stdout)?.[0];
    expect(id, created.stdout).toBeDefined();

    const preview = box(['bounty', 'post', id!, '--preview'], repo);
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain('preview only');

    const held = box(['bounty', 'post', id!], repo);
    expect(held.status, `${held.stdout}\n${held.stderr}`).toBe(0); // waits on the owner — the named refusal prints on stdout

    const allowed = box(['bounty', 'allow', 'owner/project'], repo);
    expect(allowed.status).toBe(0);

    const posted = box(['bounty', 'post', id!], repo);
    expect(posted.status, `${posted.stdout}\n${posted.stderr}`).toBe(0);
    expect(posted.stdout).toContain('posted');
    const issue = JSON.parse(readFileSync(state, 'utf8')).issues.at(-1);
    expect(issue.title).toContain('Repair the app.');

    // A solution arrives: a stranger clones, branches off the bounty branch,
    // pushes a pull request head and registers it (the stand-in's POST).
    const solver = join(root, 'solver');
    git(root, ['clone', '-q', bare, solver]);
    git(solver, ['checkout', '-q', `box-bounty/${id}`]);
    writeFileSync(join(solver, 'app.txt'), 'fixed\n');
    git(solver, ['add', '-A']);
    git(solver, ['commit', '-qm', 'fix']);
    const st = JSON.parse(readFileSync(state, 'utf8')) as { issues: { number: number }[]; prs: { number: number }[] };
    const n = 1 + Math.max(0, ...st.issues.map(issue => issue.number), ...st.prs.map(pr => pr.number));
    git(solver, ['push', '-q', 'origin', `HEAD:refs/pull/${n}/head`]);
    const prInput = join(root, `pr-${n}.json`);
    writeFileSync(prInput, JSON.stringify({ title: 'fix', body: 'fixes it', base: `box-bounty/${id}`, author: 'solver' }));
    const opened = spawnSync(process.execPath, [STANDIN, 'api', `repos/owner/project/pulls`, '--method', 'POST', '--input', prInput], { encoding: 'utf8', env });
    expect(opened.status, `${opened.stdout}
${opened.stderr}`).toBe(0);

    const looked = box(['bounty', 'look', id!, String(n)], repo);
    expect(looked.status, `${looked.stdout}
${looked.stderr}`).toBe(0);
    expect(looked.stdout).toContain('written by the solver');

    const applied = box(['bounty', 'apply', id!, String(n)], repo);
    expect(applied.status, `${applied.stdout}
${applied.stderr}`).toBe(0);
    expect(applied.stdout).toContain('applied');
    expect(readFileSync(join(repo, 'app.txt'), 'utf8').trim()).toBe('fixed');

    // A second draft ends by close — then the tool comes off and the
    // project's records are where it left them.
    writeFileSync(join(repo, 'TASK2.md'), 'Something else.\n');
    const second = box(['bounty', 'create', '--task', 'TASK2.md', '--why', 'another handoff'], repo);
    const id2 = /bt-[a-f\d]{12}/.exec(second.stdout)?.[0];
    const closed = box(['bounty', 'close', id2!, '--reason', 'no longer needed'], repo);
    expect(closed.status, `${closed.stdout}
${closed.stderr}`).toBe(0);
    expect(closed.stdout).toContain('rejected');

    const remove = npm(['uninstall', '-g', '--prefix', prefix, 'box-bounty']);
    expect(remove.status).toBe(0);
    expect(existsSync(join(prefix, 'node_modules', 'box-bounty'))).toBe(false);
    expect(recordIds(repo).length).toBeGreaterThan(0);
    expect(existsSync(join(env['BOX_BOUNTY_SETTINGS_DIR']!, 'settings.json'))).toBe(true);
  }, 280000);
});
