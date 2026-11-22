import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'packages/box-cli/dist/cli.js');
const standin = fileURLToPath(new URL('./gh-standin.cjs', import.meta.url));
const remote = 'https://github.com/owner/project.git';
const squash = process.argv.includes('--squash');
const [scratch, board = 'http://localhost:4320'] = process.argv.slice(2).filter(arg => arg !== '--squash');
assert(scratch && /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(board), 'Usage: node kitchen/demo/local-board-rehearsal.mjs <empty scratch directory> [http://localhost:4320] [--squash]');
assert(existsSync(cli), 'Build the CLI first: node scripts/workspace.mjs build');
const directory = resolve(scratch);
const home = join(directory, 'home');
const bin = join(directory, 'bin');
const bare = join(directory, 'remote.git');
const poster = join(directory, 'poster');
const solver = join(directory, 'solver');
const state = join(directory, 'state.json');
const shim = join(directory, 'shim.cjs');
const config = join(directory, 'gitconfig');
const gitDir = (process.env.PATH ?? '').split(delimiter).find(dir => dir && ['', '.exe', '.cmd'].some(ext => existsSync(join(dir, `git${ext}`))));
assert(gitDir, 'Git is not on PATH');
mkdirSync(bin);
for (const path of [poster, solver, join(home, 'AppData', 'Roaming'), join(home, 'AppData', 'Local')]) mkdirSync(path, { recursive: true });
writeFileSync(state, JSON.stringify({ issues: [], comments: [], prs: [], labels: [] }), { flag: 'wx' });
writeFileSync(config, '');
writeFileSync(shim, String.raw`
const cp = require('node:child_process');
const original = cp.spawnSync;
cp.spawnSync = function (file, args, options) {
  const base = String(file).split(/[\\/]/).pop().toLowerCase();
  if (/^gh(?:\.exe)?$/.test(base)) return original.call(this, process.execPath, [process.env.REPLAY_GH_STANDIN, ...args], options);
  if (/^git(?:\.exe)?$/.test(base)) args = args.map(arg => arg === process.env.REPLAY_REMOTE_URL ? process.env.REPLAY_BARE : arg);
  return original.call(this, file, args, options);
};
require('node:module').syncBuiltinESMExports();
`);
if (process.platform === 'win32') copyFileSync(process.execPath, join(bin, 'gh.exe'));
else writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });

const keep = Object.fromEntries(['SystemRoot', 'windir', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR'].flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]]]));
const env = {
  ...keep, PATH: [bin, dirname(process.execPath), gitDir].join(delimiter),
  HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming'), LOCALAPPDATA: join(home, 'AppData', 'Local'),
  GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: 'file',
  REPLAY_STATE: state, REPLAY_BARE: bare, REPLAY_REMOTE_URL: remote, REPLAY_GH_STANDIN: standin
};
const run = (file, args, cwd, extra = {}) => {
  const result = spawnSync(file, args, { cwd, env: { ...env, ...extra }, input: '', encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
  return result.stdout.trim();
};
const git = (cwd, ...args) => run('git', ['-c', 'user.name=demo', '-c', 'user.email=demo@invalid', ...args], cwd);
const box = (actor, cwd, ...args) => {
  console.log(`${actor}> omakase-box ${args.join(' ')}`);
  const output = run(process.execPath, [cli, ...args], cwd, {
    NODE_OPTIONS: `--require "${shim.replaceAll('\\', '/')}"`,
    REPLAY_ACTOR: actor, BOX_BOUNTY_SETTINGS_DIR: join(directory, `${actor}-settings`)
  });
  if (args.includes('--json')) return JSON.parse(output);
  console.log(output);
  return output;
};
const get = path => fetch(board + path, { redirect: 'error', signal: AbortSignal.timeout(5000) });

git(directory, 'init', '--bare', '-b', 'main', bare);
git(poster, 'init', '-b', 'main');
writeFileSync(join(poster, 'app.txt'), 'broken\n');
writeFileSync(join(poster, 'TASK.md'), 'Change the word in app.txt from broken to fixed.\n');
git(poster, 'add', 'app.txt', 'TASK.md');
git(poster, 'commit', '-m', 'Create the demo project');
git(poster, 'remote', 'add', 'origin', remote);
git(poster, 'push', bare, 'main');

const post = (...args) => box('owner', poster, ...args);
const solve = (...args) => box('solver', solver, ...args);
solve('config', 'set', 'board', board);
solve('config', 'set', 'solving', 'allowed');
solve('discover', '--from', 'now', '--any-language');

post('config', 'set', 'board', board);
post('allow', '--reward', '10', '--reward-limit', '50');
const { id } = post('create', '--title', 'Fix the demo app', '--task', 'TASK.md', '--why', 'Rehearse the local handoff', '--json');
const pathname = `/bounties/${id}.json`;
assert.equal((await get(pathname)).status, 404);
const posted = post('post', id, '--json');
assert.equal(posted.posted, true);
const detail = async () => {
  const response = await get(pathname);
  assert.equal(response.status, 200, `${pathname}: ${await response.clone().text()}`);
  return response.json();
};
assert.equal((await detail()).bounty.id, id);
console.log(`Posted on the local board: ${board}${pathname}`);

const found = solve('discover', '--json').bounties.find(entry => entry.id === id);
assert(found, 'The solver did not discover the posted bounty');
const taken = solve('take', found.id, '--into', join(solver, 'attempt'), '--json');
assert.equal(taken.outcome, 'taken');
assert.equal(taken.ownBounty, false);
writeFileSync(join(taken.workspace, 'app.txt'), 'fixed\n');
git(taken.workspace, 'add', 'app.txt');
git(taken.workspace, 'commit', '-m', 'Fix the demo app');
git(taken.workspace, 'push', bare, taken.branch);
const submitted = solve('submit', id, '--json');
assert.equal(submitted.outcome, 'submitted');
assert.equal(submitted.pullRequest.number, taken.pullRequest.number);

if (squash) {
  assert.match(post('status', id), /1 solution\(s\) waiting/);
  // GitHub's "Squash and merge": one new commit on the bounty branch, the pull request marked merged with it as merge_commit_sha; the solver's head never reaches the branch.
  const facts = JSON.parse(readFileSync(state, 'utf8'));
  const pr = facts.prs.find(entry => entry.number === submitted.pullRequest.number);
  const squashed = join(directory, 'squash');
  git(directory, 'clone', '-q', bare, squashed);
  git(squashed, 'checkout', '-q', pr.base.ref);
  git(squashed, 'merge', '--squash', pr.head.sha);
  git(squashed, 'commit', '-q', '-m', `${pr.title} (#${pr.number})`);
  const landing = git(squashed, 'rev-parse', 'HEAD');
  git(squashed, 'push', '-q', bare, `HEAD:refs/heads/${pr.base.ref}`);
  const at = new Date().toISOString();
  Object.assign(pr, { merged: true, merged_at: at, updated_at: at, state: 'closed', merge_commit_sha: landing });
  writeFileSync(state, JSON.stringify(facts));
  console.log(`Squash merged pull request #${pr.number} into ${pr.base.ref} as ${landing}`);
  git(poster, 'fetch', '-q', bare, pr.base.ref);
  git(poster, 'merge', '-q', '--ff-only', 'FETCH_HEAD');
  assert.match(post('status', id), new RegExp(`merged on main at ${landing.slice(0, 12)} — the bounty is closed`));
} else {
  post('apply', id, String(submitted.pullRequest.number));
}
assert.equal(readFileSync(join(poster, 'app.txt'), 'utf8'), 'fixed\n');
git(poster, 'push', bare, 'main');
const look = await fetch(`${board}/api/hint`, {
  method: 'POST', body: JSON.stringify({ repository: posted.repository, issue: posted.issue.number, bounty: id, event: 'merged' }),
  redirect: 'error', signal: AbortSignal.timeout(5000)
});
assert.equal(look.status, 202);
assert.deepEqual(await look.json(), { looked: 'read' });
const merged = (await detail()).bounty;
assert(merged.solution_list.some(pr => pr.number === taken.pullRequest.number && pr.author === 'solver' && pr.state === 'merged'), 'The board did not see the solver PR merge');
assert.equal(merged.payment.state, 'owed');
assert.equal(merged.payment.owed.to, 'solver');

post('config', 'set', 'paid', id);
const { bounty } = await detail();
assert.equal(bounty.payment.state, 'recorded');
assert.equal(bounty.payment.recorded_paid.amount, 10);
assert.match(solve('status', id), /recorded paid \$10 to you/);
console.log(`Recorded paid on the local board (no money moved): ${board}${pathname}`);
