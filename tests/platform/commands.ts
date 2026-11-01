// PF7: runs the front page's commands, with the arguments the page prints, through the
// whole journey on the built tool: a stand-in GitHub and a bare remote, never real
// GitHub (the same world tests/box/bounty/bt12-install.test.ts stages).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CLI = join(ROOT, 'packages/box-cli/dist/cli.js');
const STANDIN = join(ROOT, 'kitchen/demo/gh-standin.cjs');
const REMOTE_URL = 'https://github.com/owner/project.git';
const SHIM = `const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const original = cp.spawnSync;
cp.spawnSync = function (file, args, options) {
  const base = String(file).split(/[\\\\/]/).pop().toLowerCase();
  if (base === 'gh' || base === 'gh.exe') return original.call(this, process.execPath, [process.env.REPLAY_GH_STANDIN, ...(args ?? [])], options);
  if (base === 'git' || base === 'git.exe') return original.call(this, file, (args ?? []).map(a => a === process.env.REPLAY_REMOTE_URL ? process.env.REPLAY_BARE : a), options);
  return original.call(this, file, args, options);
};
try { syncBuiltinESMExports(); } catch {}
`;

/** A page command's words, quotes respected. */
export const wordsOf = (line: string): string[] => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]!);

export type Ran = { line: string; status: number | null; output: string };

/** The stand-in world, one project with a remote, and a second open bounty so a command that omits its id must refuse. */
export function journeyWorld() {
  const root = mkdtempSync(join(tmpdir(), 'kitchen-PF7-'));
  const bin = join(root, 'bin');
  const state = join(root, 'state.json');
  const bare = join(root, 'remote.git');
  const repo = join(root, 'project');
  const home = join(root, 'home');
  for (const dir of [bin, repo, join(root, 'settings'), join(home, 'AppData', 'Roaming'), join(home, 'AppData', 'Local')]) mkdirSync(dir, { recursive: true });
  writeFileSync(state, JSON.stringify({ account: 'owner', issues: [], comments: [], prs: [], labels: [] }));
  writeFileSync(join(root, 'shim.cjs'), SHIM);
  if (process.platform === 'win32') copyFileSync(process.execPath, join(bin, 'gh.exe'));
  else { writeFileSync(join(bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 }); }
  const gitDir = (process.env.PATH ?? '').split(delimiter).find(dir => dir !== '' && ['', '.exe', '.cmd'].some(ext => existsSync(join(dir, `git${ext}`))));
  if (gitDir === undefined) throw new Error('git is not on PATH');
  const keep = Object.fromEntries(['SystemRoot', 'windir', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR'].flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]!]]));
  const env: Record<string, string> = {
    ...keep,
    PATH: [bin, dirname(process.execPath), gitDir].join(delimiter),
    HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming'), LOCALAPPDATA: join(home, 'AppData', 'Local'),
    BOX_BOUNTY_SETTINGS_DIR: join(root, 'settings'),
    NODE_OPTIONS: `--require ${join(root, 'shim.cjs').replaceAll('\\', '/')}`,
    REPLAY_STATE: state, REPLAY_BARE: bare, REPLAY_REMOTE_URL: REMOTE_URL, REPLAY_GH_STANDIN: STANDIN
  };
  const git = (cwd: string, args: string[]) => {
    const run = spawnSync('git', ['-c', `safe.directory=${cwd.replaceAll('\\', '/')}`, '-c', 'user.name=pf7', '-c', 'user.email=pf7@invalid', '-C', cwd, ...args], { encoding: 'utf8', env });
    if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
  };
  git(root, ['init', '--bare', '-q', bare]);
  git(repo, ['init', '-b', 'main', '-q']);
  writeFileSync(join(repo, 'app.txt'), 'broken\n');
  writeFileSync(join(repo, 'TASK.md'), 'Repair the app.\n');
  writeFileSync(join(repo, 'OTHER.md'), 'Something else.\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'base']);
  git(repo, ['remote', 'add', 'origin', REMOTE_URL]);
  git(repo, ['push', '-q', bare, 'main']);

  const box = (args: readonly string[]) => {
    const run = spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: 'utf8', env, windowsHide: true, input: '' });
    return { status: run.status, output: `${run.stdout}\n${run.stderr}` };
  };
  /** A solver's pull request against the bounty's branch. Its number comes back. */
  const answer = (id: string): number => {
    const solver = join(root, 'solver');
    git(root, ['clone', '-q', bare, solver]);
    git(solver, ['checkout', '-q', `box-bounty/${id}`]);
    writeFileSync(join(solver, 'app.txt'), 'fixed\n');
    git(solver, ['add', '-A']);
    git(solver, ['commit', '-qm', 'fix']);
    const seen = JSON.parse(readFileSync(state, 'utf8')) as { issues: { number: number }[]; prs: { number: number }[] };
    const n = 1 + Math.max(0, ...seen.issues.map(issue => issue.number), ...seen.prs.map(pr => pr.number));
    git(solver, ['push', '-q', 'origin', `HEAD:refs/pull/${n}/head`]);
    const input = join(root, `pr-${n}.json`);
    writeFileSync(input, JSON.stringify({ title: 'fix', body: 'fixes it', base: `box-bounty/${id}`, author: 'solver' }));
    const opened = spawnSync(process.execPath, [STANDIN, 'api', 'repos/owner/project/pulls', '--method', 'POST', '--input', input], { encoding: 'utf8', env });
    if (opened.status !== 0) throw new Error(opened.stderr);
    return n;
  };
  return {
    repo, box, answer,
    fixed: () => readFileSync(join(repo, 'app.txt'), 'utf8').trim() === 'fixed',
    close: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
  };
}
