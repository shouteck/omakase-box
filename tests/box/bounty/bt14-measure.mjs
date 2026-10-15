// BT14 before/after measurement, the two journeys as K18 ran them, against
// the built CLI of the working tree — never a library stub. The GitHub is
// the K19 stand-in (kitchen/demo/gh-standin.cjs), reached through the same
// NODE_OPTIONS --require spawn patch bt11b-replay.mjs uses: `gh` resolves to
// the stand-in and the GitHub remote URL in `git` args becomes a local bare
// remote. Nothing leaves the machine.
//
//   node tests/box/bounty/bt14-measure.mjs
//
// Prints one JSON object. For every captured command: the characters its
// stdout carried (what an agent must read) and the 1-based line the thing it
// acts on first appears on. "First useful" is the first line that names an
// action or a waiting thing — a pull request, a solution, a `box bounty`
// command, or the owner block.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = join(REPO, 'packages/box-cli/dist/cli.js');
const STANDIN = join(REPO, 'kitchen/demo/gh-standin.cjs');
const REMOTE_URL = 'https://github.com/owner/project.git';
const PAY = 'https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00';

const root = mkdtempSync(join(tmpdir(), 'box-bt14-measure-'));
const state = join(root, 'state.json');
const bare = join(root, 'remote.git');
const settings = join(root, 'settings');
const shim = join(root, 'shim.cjs');
mkdirSync(settings, { recursive: true });
writeFileSync(state, JSON.stringify({ account: 'owner', issues: [], comments: [], prs: [], labels: [] }));
writeFileSync(shim, `const cp = require('node:child_process');\nconst { syncBuiltinESMExports } = require('node:module');\nconst standin = process.env.REPLAY_GH_STANDIN;\nconst bare = process.env.REPLAY_BARE;\nconst remoteUrl = process.env.REPLAY_REMOTE_URL;\nconst original = cp.spawnSync;\ncp.spawnSync = function (file, args, options) {\n  const base = String(file).split(/[\\\\/]/).pop().toLowerCase();\n  if (standin && (base === 'gh' || base === 'gh.exe')) return original.call(this, process.execPath, [standin, ...(args ?? [])], options);\n  if (bare && remoteUrl && (base === 'git' || base === 'git.exe')) return original.call(this, file, (args ?? []).map(a => a === remoteUrl ? bare : a), options);\n  return original.call(this, file, args, options);\n};\ntry { syncBuiltinESMExports(); } catch {}\n`);
const env = { ...process.env, BOX_BOUNTY_SETTINGS_DIR: settings, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${shim.replaceAll(String.fromCharCode(92), '/')}`.trim(), REPLAY_STATE: state, REPLAY_BARE: bare, REPLAY_REMOTE_URL: REMOTE_URL, REPLAY_GH_STANDIN: STANDIN };

const git = (cwd, args) => {
  const out = spawnSync('git', ['-c', `safe.directory=${cwd.replaceAll(String.fromCharCode(92), '/')}`, '-c', 'user.name=measure', '-c', 'user.email=measure@invalid', '-C', cwd, ...args], { encoding: 'utf8', env });
  if (out.status !== 0) throw new Error(`git ${args.join(' ')}: ${out.stderr}`);
  return out.stdout.trim();
};
const box = (cwd, args) => {
  const out = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env });
  if (out.error) throw new Error(`box ${args.join(' ')}: ${out.error}`);
  if (![0, 2, 3].includes(out.status)) throw new Error(`box ${args.join(' ')} exited ${out.status}: ${out.stderr}`);
  return out;
};

const USEFUL = /pull request #\d|solution \d|box bounty (look|apply|status|post|allow|close)|for the owner|for you|waiting for the owner/;
const measure = (label, run) => {
  const out = `${run.stdout ?? ''}${run.status !== 0 ? run.stderr ?? '' : ''}`;
  const lines = out.split('\n').filter(line => line.trim() !== '');
  return { label, exit: run.status, characters: out.length, lines: lines.length, firstUsefulLine: lines.findIndex(line => USEFUL.test(line)) + 1 || null, output: out };
};

const makeRepo = (label, push = true) => {
  const repo = join(root, label);
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main', '-q']);
  writeFileSync(join(repo, 'app.txt'), 'broken\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'base']);
  git(repo, ['remote', 'add', 'origin', REMOTE_URL]);
  if (push) git(repo, ['push', '-q', bare, 'main']);
  return repo;
};

git(root, ['init', '--bare', '-q', bare]);

// --- the collecting journey (K18 collect): a posted bounty, two pull
// requests waiting — one with a payment link, one clashing with current
// code — and saved job context the collector did not write.
const collect = makeRepo('collect');
writeFileSync(join(collect, 'TASK.md'), 'Repair the app.\n'); // untracked, as the drafting agent left it
const drafted = box(collect, ['bounty', 'create', '--task', 'TASK.md', '--why', 'beyond this agent']);
const id = /bt-[a-f\d]{12}/.exec(drafted.stdout)?.[0];
if (id === undefined) throw new Error(`no id in create output: ${drafted.stdout}${drafted.stderr}`);
const allowed = box(root, ['bounty', 'allow', 'owner/project', '--reward', '10', '--reward-limit', '30']);
if (allowed.status !== 0) throw new Error(`allow failed: ${allowed.stderr}`);
const posted = box(collect, ['bounty', 'post', id, '--to', 'github']);
if (posted.status !== 0) throw new Error(`post failed: ${posted.stdout}${posted.stderr}`);
for (const [name, body] of [['solver-a', `fixes the bounty\n\npay-to: ${PAY}`], ['solver-b', 'a different fix']]) {
  const solver = join(root, name);
  git(root, ['clone', '-q', bare, solver]);
  git(solver, ['checkout', '-q', `box-bounty/${id}`]);
  writeFileSync(join(solver, 'app.txt'), 'fixed\n');
  git(solver, ['add', '-A']);
  git(solver, ['commit', '-qm', `fix (${name})`]);
  const st = JSON.parse(readFileSync(state, 'utf8'));
  const n = 1 + Math.max(0, ...st.issues.map(issue => issue.number), ...st.prs.map(pr => pr.number));
  git(solver, ['push', '-q', 'origin', `HEAD:refs/pull/${n}/head`]);
  const prInput = join(root, `pr-${n}.json`);
  writeFileSync(prInput, JSON.stringify({ title: `fix (${name})`, body, base: `box-bounty/${id}`, author: name }));
  spawnSync(process.execPath, [STANDIN, 'api', 'repos/owner/project/pulls', '--method', 'POST', '--input', prInput], { encoding: 'utf8', env });
}
// solver-b's clash: the owner's own work moves app.txt before the collector arrives.
writeFileSync(join(collect, 'app.txt'), 'owner moved it\n');
git(collect, ['commit', '-qam', 'owner work']);

const overview = measure('collect: box bounty', box(collect, ['bounty']));
const status = measure('collect: box bounty status', box(collect, ['bounty', 'status']));
const statusFull = measure('collect: box bounty status --full', box(collect, ['bounty', 'status', '--full']));

// --- the posting journey (K18 yes): a fresh agent, a repository nobody has
// allowed — read what the tool offers, draft, post, learn it waits.
const posting = makeRepo('posting', false); // its post waits for the owner — nothing is ever pushed
writeFileSync(join(posting, 'TASK.md'), 'Repair the app.\n');
// A second settings folder untouched by the collect journey's allow.
const postEnv = { ...env, BOX_BOUNTY_SETTINGS_DIR: join(root, 'posting-settings') };
mkdirSync(postEnv.BOX_BOUNTY_SETTINGS_DIR, { recursive: true });
const pbox = (cwd, args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: postEnv });
const postRuns = [
  measure('post: box --help', pbox(posting, ['--help'])),
  measure('post: box bounty describe', pbox(posting, ['bounty', 'describe'])),
  measure('post: box bounty create', pbox(posting, ['bounty', 'create', '--task', 'TASK.md', '--why', 'beyond this agent'])),
];
const pid = /bt-[a-f\d]{12}/.exec(postRuns.at(-1).output)?.[0];
if (pid === undefined) throw new Error(`no id in create output (exit ${postRuns.at(-1).exit}): ${postRuns.at(-1).output}`);
postRuns.push(measure('post: box bounty post', pbox(posting, ['bounty', 'post', pid, '--to', 'github'])));

const read = (entry) => ({ characters: entry.characters, lines: entry.lines, firstUsefulLine: entry.firstUsefulLine });
console.log(JSON.stringify({
  collecting: { 'box bounty': read(overview), 'box bounty status': read(status), 'box bounty status --full': read(statusFull) },
  posting: Object.fromEntries(postRuns.map(entry => [entry.label.slice(6), read(entry)])),
  postingTotal: postRuns.reduce((sum, entry) => sum + entry.characters, 0),
  outputs: { 'box bounty': overview.output, 'post held': postRuns.at(-1).output }
}, null, 2));
rmSync(root, { recursive: true, force: true });
