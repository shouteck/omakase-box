// BT17 measurement: every command's normal output on the standard journey,
// in lines and characters — the wave's before/after table. Same stand-in
// setup as bt14-measure; run against the built CLI (dist/cli.js).
//
//   node tests/box/bounty/bt17-measure.mjs
//
// Prints one JSON object: { steps: { label: {lines, characters, exit} },
// totals }. Non-normal detail views are measured but labelled "(detail)".
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

const root = mkdtempSync(join(tmpdir(), 'box-bt17-measure-'));
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
const box = (cwd, args, runEnv = env) => {
  const out = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: runEnv });
  if (out.error) throw new Error(`box ${args.join(' ')}: ${out.error}`);
  if (![0, 2, 3].includes(out.status)) throw new Error(`box ${args.join(' ')} exited ${out.status}: ${out.stderr}`);
  return out;
};

const steps = {};
const measure = (label, run) => {
  const out = `${run.stdout ?? ''}${run.status !== 0 ? run.stderr ?? '' : ''}`;
  steps[label] = { exit: run.status, characters: out.length, lines: out.split('\n').filter(line => line.trim() !== '').length };
  return out;
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

try {
  git(root, ['init', '--bare', '-q', bare]);

  // The collecting journey's world: one posted bounty, two waiting pull
  // requests (one pays, one clashes), a second draft for `close` to end.
  const collect = makeRepo('collect');
  writeFileSync(join(collect, 'TASK.md'), 'Repair the app.\n');
  measure('create (collect)', box(collect, ['bounty', 'create', '--task', 'TASK.md', '--why', 'beyond this agent']));
  const id = /bt-[a-f\d]{12}/.exec(box(collect, ['bounty', 'status']).stdout)?.[0];
  writeFileSync(join(collect, 'TASK2.md'), 'Something else.\n');
  box(collect, ['bounty', 'create', '--task', 'TASK2.md', '--why', 'another handoff']);
  const ids = [...box(collect, ['bounty', 'status']).stdout.matchAll(/bt-[a-f\d]{12}/g)].map(m => m[0]);
  const id2 = ids.find(v => v !== id);
  measure('allow', box(root, ['bounty', 'allow', 'owner/project', '--reward', '10', '--reward-limit', '30']));
  const posted = box(collect, ['bounty', 'post', id, '--to', 'github']);
  if (posted.status !== 0) throw new Error(`post failed: ${posted.stdout}${posted.stderr}`);
  measure('post', posted);
  for (const [name, body, file] of [['solver-a', `fixes the bounty\n\npay-to: ${PAY}`, 'fix.txt'], ['solver-b', 'a different fix', 'app.txt']]) {
    const solver = join(root, name);
    git(root, ['clone', '-q', bare, solver]);
    git(solver, ['checkout', '-q', `box-bounty/${id}`]);
    writeFileSync(join(solver, file), 'fixed\n');
    git(solver, ['add', '-A']);
    git(solver, ['commit', '-qm', `fix (${name})`]);
    const st = JSON.parse(readFileSync(state, 'utf8'));
    const n = 1 + Math.max(0, ...st.issues.map(issue => issue.number), ...st.prs.map(pr => pr.number));
    git(solver, ['push', '-q', 'origin', `HEAD:refs/pull/${n}/head`]);
    const prInput = join(root, `pr-${n}.json`);
    writeFileSync(prInput, JSON.stringify({ title: `fix (${name})`, body, base: `box-bounty/${id}`, author: name }));
    spawnSync(process.execPath, [STANDIN, 'api', 'repos/owner/project/pulls', '--method', 'POST', '--input', prInput], { encoding: 'utf8', env });
  }
  writeFileSync(join(collect, 'app.txt'), 'owner moved it\n');
  git(collect, ['commit', '-qam', 'owner work']);

  measure('bounty (overview)', box(collect, ['bounty']));
  measure('status (posted, waiting)', box(collect, ['bounty', 'status']));
  measure('status --full (detail)', box(collect, ['bounty', 'status', '--full']));
  measure('status --comments', box(collect, ['bounty', 'status', id, '--comments']));
  const prNumbers = JSON.parse(readFileSync(state, 'utf8')).prs.map(pr => String(pr.number)).sort();
  const [prA, prB] = prNumbers; // solver-a (pays) then solver-b (clashes)
  measure('look (collect + show)', box(collect, ['bounty', 'look', id, prA]));
  measure('look --full (detail)', box(collect, ['bounty', 'look', id, prA, '--full']));
  measure('apply (conflict)', box(collect, ['bounty', 'apply', id, prB]));
  measure('apply (merged)', box(collect, ['bounty', 'apply', id, prA]));
  measure('status (ended)', box(collect, ['bounty', 'status']));
  measure('status --since', box(collect, ['bounty', 'status', '--since', '2000-01-01T00:00:00Z']));
  measure('close (drafted, reason)', box(collect, ['bounty', 'close', id2, '--reason', 'no longer needed']));
  measure('config', box(root, ['bounty', 'config']));
  measure('config --full (detail)', box(root, ['bounty', 'config', '--full']));
  measure('deny', box(root, ['bounty', 'deny', 'owner/project']));

  // The posting journey: a fresh settings folder, a repo nobody allowed.
  const posting = makeRepo('posting', false);
  writeFileSync(join(posting, 'TASK.md'), 'Repair the app.\n');
  const postSettings = join(root, 'posting-settings');
  mkdirSync(postSettings, { recursive: true });
  const postEnv = { ...env, BOX_BOUNTY_SETTINGS_DIR: postSettings };
  measure('box --help', box(posting, ['--help'], postEnv));
  measure('bounty help', box(posting, ['bounty', 'help'], postEnv));
  measure('bounty describe', box(posting, ['bounty', 'describe'], postEnv));
  measure('bounty describe --rules', box(posting, ['bounty', 'describe', '--rules'], postEnv));
  measure('create', box(posting, ['bounty', 'create', '--task', 'TASK.md', '--why', 'beyond this agent'], postEnv));
  const pid = /bt-[a-f\d]{12}/.exec(box(posting, ['bounty', 'status'], postEnv).stdout)?.[0];
  measure('status (drafted, unaallowed)', box(posting, ['bounty', 'status'], postEnv));
  measure('post --preview (detail)', box(posting, ['bounty', 'post', pid, '--preview'], postEnv));
  measure('post (held for owner)', box(posting, ['bounty', 'post', pid, '--to', 'github'], postEnv));
  measure('status (waiting on owner)', box(posting, ['bounty', 'status'], postEnv));

  const normal = Object.keys(steps).filter(k => !k.includes('detail'));
  console.log(JSON.stringify({ steps, totals: {
    allCharacters: Object.values(steps).reduce((s, e) => s + e.characters, 0),
    allLines: Object.values(steps).reduce((s, e) => s + e.lines, 0),
    normalCharacters: normal.reduce((s, k) => s + steps[k].characters, 0),
    normalLines: normal.reduce((s, k) => s + steps[k].lines, 0)
  } }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
