#!/usr/bin/env node
// BT13 — the messages meant for the owner, printed word for word for the
// two-agent relay check and the stand-in owner runs. Fresh agents do the
// measuring; this script only produces what a real agent's terminal would
// show, against the same GitHub stand-in as bt11b-replay.mjs. Nothing leaves
// the machine.
//
//   node kitchen/demo/bt13-relay.mjs [--scene <name>] [--keep]
//
// Scenes (default: all):
//   first-use      a post that waits — the first-use owner block
//   allow-free     `allow` output — allowed, $0
//   allow-reward   `allow --reward 5 --reward-limit 20` output
//   allow-ask      `allow --ask` output — asked before posts and merges
//   merge-wait     ask mode: `apply` holds the merge — the owner block
//   secret-scan    a publish-held post on a secret-shaped hit
//   pay-partial    a hand merge that kept none of the solution's files —
//                  the pay message names them and says who was not asked
//
// Every scene builds its own scratch world (repository, bare remote,
// stand-in state, settings folder under BOX_BOUNTY_SETTINGS_DIR) so a scene
// can be rerun alone. Output is the tool's stdout verbatim, framed by
// `=== scene` / `$ command` lines a harness reader can strip.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const CLI = join(REPO, 'packages', 'box-cli', 'dist', 'cli.js');
const STANDIN = join(HERE, 'gh-standin.cjs');
const REMOTE_URL = 'https://github.com/owner/project.git';
const TEST_LINK = 'https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00';

const args = process.argv.slice(2);
const only = (i => i >= 0 ? args[i + 1] : undefined)(args.indexOf('--scene'));
const keep = args.includes('--keep');

if (!existsSync(CLI)) { console.log('!! the tool is not built — run the workspace build first'); process.exit(1); }

const scratch = mkdtempSync(join(tmpdir(), 'box-bt13-'));
const git = (cwd, argv) => {
  const out = spawnSync('git', ['-c', 'user.name=bt13', '-c', 'user.email=bt13@example.invalid', ...argv], { cwd, encoding: 'utf8' });
  if (out.status !== 0) { console.log(`!! git ${argv.join(' ')} failed: ${out.stderr}`); process.exit(1); }
  return out.stdout.trim();
};
const run = (cwd, argv, env) => {
  console.log(`$ box bounty ${argv.join(' ')}`);
  const out = spawnSync(process.execPath, [CLI, 'bounty', ...argv], { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000 });
  process.stdout.write(out.stdout ?? '');
  if (out.stderr) process.stdout.write(`[stderr] ${out.stderr}`);
  console.log(`[exit ${out.status ?? out.error}]`);
  return out;
};

// One scratch world per scene: settings folder, repository, bare remote and
// stand-in state — the same seam github-fixture mocks, via NODE_OPTIONS.
function world(name) {
  const root = join(scratch, name);
  const repo = join(root, 'project');
  const bare = join(root, 'remote.git');
  const settings = join(root, 'settings');
  const state = join(root, 'state.json');
  const shim = join(root, 'shim.cjs');
  mkdirSync(repo, { recursive: true });
  mkdirSync(settings, { recursive: true });
  writeFileSync(state, JSON.stringify({ account: 'owner', issues: [], comments: [], prs: [], labels: [] }));
  const shimSrc = [
    "const cp = require('node:child_process');",
    "const { syncBuiltinESMExports } = require('node:module');",
    `const standin = ${JSON.stringify(STANDIN)};`,
    `const bare = ${JSON.stringify(bare)};`,
    `const remoteUrl = ${JSON.stringify(REMOTE_URL)};`,
    'const original = cp.spawnSync;',
    'cp.spawnSync = function (file, args, options) {',
    '  const base = String(file).split(/[\\\\/]/).pop().toLowerCase();',
    "  if (base === 'gh' || base === 'gh.exe') return original.call(this, process.execPath, [standin, ...(args ?? [])], options);",
    '  if (base === \'git\' || base === \'git.exe\') return original.call(this, file, (args ?? []).map(a => a === remoteUrl ? bare : a), options);',
    '  return original.call(this, file, args, options);',
    '};',
    'try { syncBuiltinESMExports(); } catch {}',
  ].join('\n');
  writeFileSync(shim, shimSrc + '\n');
  const env = {
    BOX_BOUNTY_SETTINGS_DIR: settings,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${shim.replaceAll('\\', '/')}`.trim(),
    REPLAY_STATE: state, REPLAY_BARE: bare, REPLAY_REMOTE_URL: REMOTE_URL,
  };
  git(root, ['init', '-q', '-b', 'main', repo]);
  writeFileSync(join(repo, 'app.txt'), 'broken\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'initial — app is broken']);
  git(root, ['init', '--bare', '-q', bare]);
  git(repo, ['remote', 'add', 'origin', REMOTE_URL]);
  git(repo, ['push', '-q', bare, 'main']);
  return { root, repo, bare, settings, state, env };
}

// Draft + read the id off status, the way an agent would.
function draft(w) {
  writeFileSync(join(w.repo, 'TASK.md'), 'Repair the app: app.txt should read fixed.\n');
  run(w.repo, ['create', '--task', 'TASK.md', '--why', 'a solver can repair the app faster'], w.env);
  const status = run(w.repo, ['status'], w.env);
  const id = /bt-[a-f\d]{12}/.exec(status.stdout)?.[0];
  if (!id) { console.log('!! could not read the bounty id'); process.exit(1); }
  return id;
}

const writeSettings = (w, repositories) =>
  writeFileSync(join(w.settings, 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories }, null, 2));
const AT = '2026-10-14T00:00:00.000Z';
const ASK = { 'owner/project': { bounty: 'ask', at: AT, changes: [] } };
const ALLOWED = { 'owner/project': { bounty: 'allowed', at: AT, changes: [] } };
const REWARDED = { 'owner/project': { bounty: 'allowed', at: AT, changes: [], reward: { amount: 5, at: AT }, rewardLimit: { amount: 20, at: AT } } };

// A solver's pull request on the stand-in: clone, fix, push branch and
// refs/pull/<n>/head, register the PR — exactly what the replay does.
function solverPr(w, id, body, extra = {}) {
  const solver = join(w.root, 'solver');
  git(w.root, ['clone', '-q', w.bare, solver]);
  git(solver, ['checkout', '-q', `box-bounty/${id}`]);
  writeFileSync(join(solver, 'app.txt'), 'fixed\n');
  for (const [path, text] of Object.entries(extra)) writeFileSync(join(solver, path), text);
  git(solver, ['add', '-A']);
  git(solver, ['commit', '-qm', 'fix']);
  const st = JSON.parse(readFileSync(w.state, 'utf8'));
  const n = 1 + Math.max(0, ...st.issues.map(i => i.number), ...st.prs.map(p => p.number));
  git(solver, ['push', '-q', 'origin', `HEAD:refs/heads/solver-${id}`, `HEAD:refs/pull/${n}/head`]);
  const input = join(w.root, `pr-${n}.json`);
  writeFileSync(input, JSON.stringify({ title: 'fix', body, base: `box-bounty/${id}`, author: 'solver' }));
  spawnSync(process.execPath, [STANDIN, 'api', 'repos/owner/project/pulls', '--method', 'POST', '--input', input], { env: { ...process.env, ...w.env }, encoding: 'utf8' });
  return { n, head: git(solver, ['rev-parse', 'HEAD']) };
}

const scenes = {
  'first-use': () => {
    const w = world('first-use');
    const id = draft(w);
    console.log('\n# nothing is written — the first post waits for the owner');
    run(w.repo, ['post', id, '--to', 'github'], w.env);
  },
  'allow-free': () => {
    const w = world('allow-free');
    draft(w);
    run(w.repo, ['allow', 'owner/project'], w.env);
  },
  'allow-reward': () => {
    const w = world('allow-reward');
    draft(w);
    run(w.repo, ['allow', 'owner/project', '--reward', '5', '--reward-limit', '20'], w.env);
  },
  'allow-ask': () => {
    const w = world('allow-ask');
    draft(w);
    run(w.repo, ['allow', 'owner/project', '--ask'], w.env);
  },
  'merge-wait': () => {
    const w = world('merge-wait');
    writeSettings(w, ASK);
    const id = draft(w);
    run(w.repo, ['post', id, '--to', 'github'], w.env);      // held — ask mode
    run(w.repo, ['allow', id], w.env);                      // the owner's yes posts it
    const { n } = solverPr(w, id, 'fixes the bounty');
    run(w.repo, ['look', id, String(n)], w.env);
    console.log('\n# apply under "ask me each time" — the merge waits');
    run(w.repo, ['apply', id, String(n)], w.env);           // merge-held
    run(w.repo, ['status'], w.env);                         // status names the wait
  },
  'secret-scan': () => {
    const w = world('secret-scan');
    writeSettings(w, ALLOWED);
    const id = draft(w);
    // A secret-shaped value built at run time — this file holds no token.
    const secret = 'aB3' + 'q'.repeat(30);
    mkdirSync(join(w.repo, 'config'));
    writeFileSync(join(w.repo, 'config', 'creds.txt'), `api_key = "${secret}"\n`);
    git(w.repo, ['add', 'config/creds.txt']);
    git(w.repo, ['commit', '-qm', 'add config']);
    console.log('\n# the post is held by the pre-publish scan');
    run(w.repo, ['post', id, '--to', 'github'], w.env);
  },
  'pay-partial': () => {
    const w = world('pay-partial');
    writeSettings(w, { 'owner/project': { ...REWARDED['owner/project'], bounty: 'ask' } });
    const id = draft(w);
    run(w.repo, ['post', id, '--to', 'github'], w.env);      // held — ask mode
    run(w.repo, ['allow', id], w.env);                      // the owner's yes posts it
    // The solver also adds a file so the merge can keep only part of the
    // solution — the pay message must name what it left.
    const { n, head } = solverPr(w, id, `fixes the bounty\n\npay-to: ${TEST_LINK}`, { 'new-file.txt': 'the solver added this\n' });
    run(w.repo, ['look', id, String(n)], w.env);
    console.log('\n# a hand merge that keeps only one of the solution’s files — under ask, unasked');
    git(w.repo, ['merge', '--no-ff', '--no-commit', head]);
    git(w.repo, ['checkout', 'HEAD', '--', 'app.txt']);      // keep new-file.txt, leave app.txt
    git(w.repo, ['commit', '-qm', 'hand merge, keeping part']);
    run(w.repo, ['status'], w.env);                         // notices the merge, closes, pays
  },
};

const names = only ? [only] : Object.keys(scenes);
for (const name of names) {
  if (scenes[name] === undefined) { console.log(`!! unknown scene ${name} — one of: ${Object.keys(scenes).join(', ')}`); process.exit(1); }
  console.log(`\n=== scene: ${name} ===`);
  scenes[name]();
}
if (keep) console.log(`\nscratch kept at ${scratch}`);
else rmSync(scratch, { recursive: true, force: true });
