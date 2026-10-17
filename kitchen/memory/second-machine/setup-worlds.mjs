// K26 step 4: build the three experiment worlds for the second-machine test.
//
//   node kitchen/memory/second-machine/setup-worlds.mjs [--out <dir>]
//
// Builds <out> (default %TEMP%\kitchen-K26-worlds) containing three isolated
// Git repositories — world-a (full records as today), world-b (shared tiers
// only, as the K26 design proposes), world-c (nothing but the public issue) —
// plus isolated BOX_BOUNTY_SETTINGS_DIR folders settings-a/b/c and a stand-in
// `gh` under gh-standin/. Deterministic: fixed file bytes, fixed commit dates.
// The three fresh agents are dispatched by the head chef (the cook cannot
// spawn agents); AGENT-PROMPTS.md in <out> carries each agent's prompt+env.
//
// The worlds differ ONLY in what the clone carries — same project, same
// commits' content. Each is the brief's worked example: an auth module
// migrating from legacy session tokens to OAuth, a flaky token-refresh test,
// and a half-done session-store move with a clear next step.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const OUT = outFlag === -1 ? join(tmpdir(), 'kitchen-K26-worlds') : args[outFlag + 1];
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = join(REPO, 'packages', 'box-cli', 'dist', 'cli.js');
if (!existsSync(CLI)) throw new Error(`the built box CLI is missing at ${CLI} — build packages/box-cli first`);

const B1 = 'bt-a11ce0000001'; // open posted bounty (the flaky test)
const B2 = 'bt-b22ce0000002'; // ended applied bounty (PKCE headers)

// ---------- the shared project (identical in every world) ----------

const PACKAGE_JSON = JSON.stringify({
  name: 'oauth-migration-demo', private: true, version: '0.0.0', type: 'commonjs',
  scripts: { test: 'node --test test/' }
}, null, 2) + '\n';

const LOGIN_JS = `// Login: issues legacy session tokens today; migrating to OAuth.
const { issueToken } = require('./session');

function login(user, password) {
  if (password !== 'expected') return null;
  return issueToken(user);
}

module.exports = { login };
`;

const SESSION_JS = `const TOKEN_TTL_MS = 3000; // access-token lifetime the issuer stamps
const memoryMap = new Map();
const oauthSessionStore = new Map(); // OAuth-shaped entries: { accessToken, refreshToken, expiresAt }

function issueToken(user) {
  const token = 'legacy-' + user + '-' + Math.floor(Math.random() * 1e6);
  memoryMap.set(token, { user, expiresAt: Date.now() + 3000 });
  return token;
}

function migrateSession(token) {
  const legacy = memoryMap.get(token);
  if (legacy === undefined) return null;
  const migrated = { accessToken: 'oauth-' + token, refreshToken: 'rt-' + token, expiresAt: legacy.expiresAt };
  oauthSessionStore.set(migrated.accessToken, migrated);
  memoryMap.delete(token);
  return migrated;
}

function revokeSession(token) {
  memoryMap.delete(token);
}

function cleanupExpired(now) {
  for (const [token, session] of memoryMap) if (session.expiresAt <= now) memoryMap.delete(token);
}

function refreshToken(refresh) {
  for (const session of oauthSessionStore.values()) {
    if (session.refreshToken === refresh) {
      session.accessToken = 'oauth-refreshed-' + Math.floor(Math.random() * 1e6);
      session.expiresAt = Date.now() + TOKEN_TTL_MS;
      return session.accessToken;
    }
  }
  return null;
}

module.exports = { issueToken, migrateSession, revokeSession, cleanupExpired, refreshToken, memoryMap, oauthSessionStore, TOKEN_TTL_MS };
`;

const TEST_JS = `const { test } = require('node:test');
const assert = require('node:assert');
const { refreshToken, oauthSessionStore, TOKEN_TTL_MS } = require('../src/auth/session');

// Mock verifier: the issuing service keeps its own clock, skewed ahead of
// this machine by the issued token lifetime.
const verifierNow = () => Date.now() + TOKEN_TTL_MS;

test('test_token_refresh passes under concurrent refresh calls', async () => {
  oauthSessionStore.set('oauth-seed', { accessToken: 'oauth-seed', refreshToken: 'rt-seed', expiresAt: Date.now() + 1000 });
  const results = await Promise.all([
    Promise.resolve().then(() => refreshToken('rt-seed')),
    Promise.resolve().then(() => refreshToken('rt-seed')),
    Promise.resolve().then(() => refreshToken('rt-seed'))
  ]);
  assert.ok(results.every(token => typeof token === 'string' && token.startsWith('oauth-refreshed-')));
  const session = oauthSessionStore.get('oauth-seed');
  assert.ok(session.expiresAt > verifierNow(), 'refreshed token must verify against the issuer clock');
});
`;

const agentsShared = (openLine) => `# OAuth migration demo

Small Node project: an auth module being migrated from legacy session tokens
to OAuth. \`npm test\` runs the suite.

<!-- box-bounty -->
box bounty can hand a task to an outside solver and bring solutions back
as facts — \`box bounty describe\` says what it does, what it costs and when it
beats doing the work yourself. Using it is always your call; the owner's
permission applies.
${openLine}<!-- /box-bounty -->

The bounty CLI here is the \`box\` wrapper in this folder (or
\`node ${CLI.replaceAll('\\', '/')} bounty ...\` with
BOX_BOUNTY_SETTINGS_DIR set as the wrapper does).
`;

const AGENTS_C = agentsShared('') + `
GitHub issues for this project are listed in GITHUB-ISSUES.md and through
\`gh issue list\` (the \`gh\` on PATH is a stand-in for this exercise).
`;

// ---------- the bounty content ----------

const TASK_TEXT = `Make test_token_refresh pass reliably under concurrent refresh calls`;

const WHY_TEXT = `tried 3 fixes (1: retry loop in refreshToken, 2: raising expiry timeout to 5000ms, 3: freezing Date.now in the test); suspect clock skew in the mock issuer vs verifier; cheaper to hand off`;

const RESUME_NOTE_SHARED = `Halfway through moving the session store in src/auth/session.js from memoryMap to oauthSessionStore (migrateSession is written, revokeSession and cleanupExpired still call memoryMap)`;

const ISSUE_BODY = `${TASK_TEXT}

The token-refresh test in test/token-refresh.test.js flakes when several
refresh calls race. The repository's own code is on the bounty branch.

<!-- box-bounty:${B1} -->
<!-- box-bounty-format
{"schemaVersion":2,"kind":"box-bounty","id":"${B1}","repository":"alice/oauth-migration-demo","workCommit":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2","branch":"box-bounty/${B1}","withChanges":true,"createdAt":"2026-10-10T09:12:00.000Z","state":{"kind":"open"},"reward":{"amount":0,"currency":"USD"},"terms":"merged-solution-earns-whole"}
-->`;

const GITHUB_SHARED = {
  repository: 'alice/oauth-migration-demo',
  account: 'alice',
  branch: `box-bounty/${B1}`,
  commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  title: TASK_TEXT,
  body: ISSUE_BODY,
  state: 'posted',
  issue: { number: 1, url: 'https://github.com/alice/oauth-migration-demo/issues/1' },
  kind: 'history',
  base: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5',
  pushed: [{ sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', subject: 'wip: session store mid-migration' }]
};

// ---------- records ----------

function fullRecordA() {
  return {
    schemaVersion: 1, kind: 'box-bounty-record', id: B1, title: TASK_TEXT,
    stage: 'posted', createdAt: '2026-10-10T09:12:00.000Z',
    why: WHY_TEXT, partOf: 'OAuth migration', noteSource: 'authored',
    folder: 'C:\\Users\\alice\\work\\bounties\\bt-1',
    resume: {
      kind: 'recorded', branch: 'oauth-wip', commit: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5',
      changed: ['src/auth/session.js', 'scratch/debug.log'],
      note: `${RESUME_NOTE_SHARED}; uncommitted edits in src/auth/session.js`
    },
    content: {
      task: { file: 'task.md', text: TASK_TEXT },
      note: { file: 'note.md', text: 'Tried a retry loop in refreshToken, a 5000ms expiry and freezing Date.now — all still flake. Suspect clock skew between the mock issuer and verifier.' },
      tool: 'box-bounty'
    },
    manifestSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    reward: { amount: 0 },
    allowedBy: { decision: 'allowed', level: 'project', decisionAt: '2026-10-09T08:00:00.000Z', usedAt: '2026-10-10T09:30:00.000Z' },
    scanFindings: [{
      at: '2026-10-10T09:12:05.000Z', where: 'create',
      hits: [{ path: 'src/auth/session.js', line: 12, rule: 'generic-api-key' }],
      settled: 'the flagged path is on safe to publish — the bounty went out'
    }],
    attempts: [
      {
        n: 1, pullRequest: 2, at: '2026-10-12T14:00:00.000Z', seenAt: '2026-10-12T15:00:00.000Z',
        author: 'solver-one', commit: '1111111111111111111111111111111111111111',
        changed: ['src/auth/session.js'], added: [], deleted: [], outcome: 'answered',
        conflicts: null, report: ['solution #1 changes src/auth/session.js (12 lines)', 'next: box bounty apply ' + B1 + ' 1'],
        description: 'Adds another retry loop around refreshToken — same idea as the failed fix #1.'
      },
      {
        n: 2, pullRequest: 3, at: '2026-10-13T10:00:00.000Z', seenAt: '2026-10-13T11:00:00.000Z',
        author: 'solver-two', commit: '2222222222222222222222222222222222222222',
        changed: ['test/token-refresh.test.js'], added: [], deleted: [], outcome: 'answered',
        conflicts: ['test/token-refresh.test.js'], report: ['solution #2 changes test/token-refresh.test.js (4 lines)'],
        description: 'Raises the expiry timeout to 5000ms — same idea as the failed fix #2.'
      }
    ],
    events: [
      { stage: 'drafted', at: '2026-10-10T09:12:00.000Z', command: 'create' },
      { stage: 'confirmed', at: '2026-10-10T09:20:00.000Z', command: 'confirm' },
      { stage: 'posted', at: '2026-10-10T09:30:00.000Z', destination: 'github', command: 'post' }
    ],
    github: {
      ...GITHUB_SHARED,
      questions: { count: 0, latestAt: null },
      seenPullRequests: [
        { n: 2, commit: '1111111111111111111111111111111111111111', at: '2026-10-12T14:00:00.000Z', author: 'solver-one' },
        { n: 3, commit: '2222222222222222222222222222222222222222', at: '2026-10-13T10:00:00.000Z', author: 'solver-two' }
      ],
      availablePullRequests: [],
      outside: { at: '2026-10-13T11:00:00.000Z', issueState: 'open', answers: `GitHub answers for ${B1}: pull request #2 collected as solution 1; pull request #3 collected as solution 2` },
      pending: null,
      formatRead: 'matches-record', formatReadAt: '2026-10-13T11:00:00.000Z'
    }
  };
}

function fullRecordB() {
  return {
    schemaVersion: 1, kind: 'box-bounty-record', id: B2, title: 'Parse OAuth PKCE code_challenge headers',
    stage: 'applied', createdAt: '2026-09-28T10:00:00.000Z',
    why: 'header parsing edge cases were eating the migration time', partOf: 'OAuth migration',
    resume: { kind: 'recorded', branch: 'oauth-wip', commit: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5', changed: [], note: null },
    content: { task: { file: 'task.md', text: 'Parse OAuth PKCE code_challenge headers' }, note: null, tool: 'box-bounty' },
    reward: { amount: 0 },
    allowedBy: { decision: 'allowed', level: 'project', decisionAt: '2026-09-28T10:05:00.000Z', usedAt: '2026-09-28T10:20:00.000Z' },
    attempts: [{
      n: 1, pullRequest: 1, at: '2026-10-02T12:00:00.000Z', seenAt: '2026-10-02T12:30:00.000Z',
      author: 'solver-three', commit: '3333333333333333333333333333333333333333',
      changed: ['src/auth/pkce.js'], added: [], deleted: [], outcome: 'answered',
      conflicts: null, report: ['solution #1 adds src/auth/pkce.js (38 lines)'], payTo: { state: 'none' }
    }],
    events: [
      { stage: 'drafted', at: '2026-09-28T10:00:00.000Z', command: 'create' },
      { stage: 'posted', at: '2026-09-28T10:20:00.000Z', destination: 'github', command: 'post' },
      { stage: 'answered', at: '2026-10-02T12:00:00.000Z', attempt: 1 },
      { stage: 'applied', at: '2026-10-03T09:00:00.000Z', attempt: 1, command: 'apply', merge: '4444444444444444444444444444444444444444' }
    ],
    github: {
      repository: 'alice/oauth-migration-demo', account: 'alice',
      branch: `box-bounty/${B2}`, commit: '5555555555555555555555555555555555555555',
      title: 'Parse OAuth PKCE code_challenge headers', body: 'Parse OAuth PKCE code_challenge headers\n\n<!-- box-bounty:' + B2 + ' -->\n<!-- /box-bounty -->',
      state: 'closed', issue: { number: 2, url: 'https://github.com/alice/oauth-migration-demo/issues/2' }, kind: 'history',
      pending: null
    }
  };
}

function sharedRecordB1() {
  // World (b): ONLY the shared tiers — no folder, no local branch/commit/
  // changed list, no scanFindings, no waiting, no rejected attempts, no
  // github refresh cache. `resume` keeps only the job-handover note.
  return {
    schemaVersion: 1, kind: 'box-bounty-record', id: B1, title: TASK_TEXT,
    stage: 'posted', createdAt: '2026-10-10T09:12:00.000Z',
    why: WHY_TEXT, partOf: 'OAuth migration', noteSource: 'authored',
    resume: { kind: 'recorded', branch: '(shared)', commit: '(shared)', changed: [], note: RESUME_NOTE_SHARED },
    content: { task: { file: 'task.md', text: TASK_TEXT }, note: { file: 'note.md', text: 'Tried a retry loop in refreshToken, a 5000ms expiry and freezing Date.now — all still flake. Suspect clock skew between the mock issuer and verifier.' }, tool: 'box-bounty' },
    reward: { amount: 0 },
    allowedBy: { decision: 'allowed', level: 'project', decisionAt: '2026-10-09T08:00:00.000Z', usedAt: '2026-10-10T09:30:00.000Z' },
    // Shared events[] carries only posted-and-later milestones. The local
    // pre-post `drafted`/`confirmed` transitions are omitted entirely — a
    // draft is local until the owner allows posting (owner decision 4).
    events: [
      { stage: 'posted', at: '2026-10-10T09:30:00.000Z', destination: 'github' }
    ],
    github: { ...GITHUB_SHARED }
  };
}

function sharedRecordB2() {
  const full = fullRecordB();
  return {
    schemaVersion: 1, kind: 'box-bounty-record', id: B2, title: full.title,
    stage: 'applied', createdAt: full.createdAt, why: full.why, partOf: full.partOf,
    resume: { kind: 'recorded', branch: '(shared)', commit: '(shared)', changed: [], note: null },
    content: full.content, reward: full.reward, allowedBy: full.allowedBy,
    attempts: full.attempts.map(({ n, pullRequest, at, author, commit, changed, added, deleted, payTo }) => ({ n, pullRequest, at, author, commit, changed, added, deleted, outcome: 'answered', conflicts: null, report: [], payTo })),
    // Shared events[] = posted-and-later milestones only (`posted`,
    // `answered`, `applied`, `rejected`, `withdrawn` on a posted bounty);
    // local pre-post `drafted`/`confirmed` events are dropped (decision 4).
    events: full.events
      .filter(({ stage }) => !['drafted', 'confirmed'].includes(stage))
      .map(({ stage, at, destination, merge, attempt }) => ({ stage, at, ...(destination !== undefined ? { destination } : {}), ...(merge !== undefined ? { merge } : {}), ...(attempt !== undefined ? { attempt } : {}) })),
    github: full.github
  };
}

// ---------- world assembly ----------

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Alice', GIT_AUTHOR_EMAIL: 'alice@example.com',
  GIT_COMMITTER_NAME: 'Alice', GIT_COMMITTER_EMAIL: 'alice@example.com',
  GIT_AUTHOR_DATE: '2026-10-10T09:00:00Z', GIT_COMMITTER_DATE: '2026-10-10T09:00:00Z'
};

function git(dir, gitArgs) {
  execFileSync('git', ['-C', dir, ...gitArgs], { env: { ...process.env, ...GIT_ENV }, stdio: 'pipe' });
}

function write(dir, rel, text) {
  const path = join(dir, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

function projectFiles2(bag, agents) {
  bag['package.json'] = PACKAGE_JSON;
  bag['src/auth/login.js'] = LOGIN_JS;
  bag['src/auth/session.js'] = SESSION_JS;
  bag['test/token-refresh.test.js'] = TEST_JS;
  bag['AGENTS.md'] = agents;
}

function boxWrappers(dir, settingsDir, ghDir) {
  const cli = CLI.replaceAll('\\', '/');
  const settings = settingsDir.replaceAll('\\', '/');
  const gh = ghDir.replaceAll('\\', '/');
  write(dir, 'box', `#!/bin/sh\nBOX_BOUNTY_SETTINGS_DIR="${settings}" PATH="${gh}:$PATH" node "${cli}" bounty "$@"\n`);
  write(dir, 'box.cmd', `@echo off\r\nset "BOX_BOUNTY_SETTINGS_DIR=${settingsDir}"\r\nset "PATH=${ghDir};%PATH%"\r\nnode "${CLI}" bounty %*\r\n`);
}

function buildWorld(name, files) {
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text);
  git(dir, ['init', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-m', 'oauth migration demo world']);
  return dir;
}

// ---------- stand-in gh ----------

function buildGhStandin() {
  const dir = join(OUT, 'gh-standin');
  const script = `// Stand-in gh for the K26 worlds: answers the read commands a fresh
// agent runs against the public issue store. Writes nothing.
const issues = [{
  number: 1, title: ${JSON.stringify(TASK_TEXT)}, state: 'open',
  url: 'https://github.com/alice/oauth-migration-demo/issues/1',
  body: ${JSON.stringify(ISSUE_BODY)}
}, {
  number: 2, title: 'Parse OAuth PKCE code_challenge headers', state: 'closed',
  url: 'https://github.com/alice/oauth-migration-demo/issues/2',
  body: 'Parse OAuth PKCE code_challenge headers\\n\\n<!-- box-bounty:${B2} -->\\n<!-- /box-bounty -->'
}];
const argv = process.argv.slice(2).join(' ');
if (argv === '--version' || argv.startsWith('version')) { console.log('gh version 2.40.0 (2024-01-01)'); process.exit(0); }
if (argv.startsWith('auth status')) { console.log('github.com\\n  ✓ Logged in to github.com account alice'); process.exit(0); }
if (argv.startsWith('api ')) {
  // box-bounty calls: gh api --hostname github.com <endpoint>[?query]
  const endpoint = argv.split(' ').at(-1).split('?')[0];
  const found = issues.find(i => endpoint === 'repos/alice/oauth-migration-demo/issues/' + i.number);
  if (found !== undefined) {
    console.log(JSON.stringify({ number: found.number, state: found.state, title: found.title, html_url: found.url, body: found.body, user: { login: 'alice' } }));
    process.exit(0);
  }
  if (endpoint.includes('/comments') || endpoint.startsWith('repos/alice/oauth-migration-demo/pulls')) { console.log('[]'); process.exit(0); }
  console.error('gh stand-in: unhandled api endpoint: ' + endpoint); process.exit(1);
}
if (argv.startsWith('issue list')) {
  for (const i of issues) console.log(i.number + '\\t' + i.state.toUpperCase() + '\\t' + i.title);
  process.exit(0);
}
const view = /^issue view (\\d+)/.exec(argv);
if (view !== null) {
  const found = issues.find(i => i.number === Number(view[1]));
  if (found === undefined) { console.error('issue not found'); process.exit(1); }
  console.log('title:\\t' + found.title + '\\nstate:\\t' + found.state + '\\nurl:\\t' + found.url + '\\n--\\n' + found.body);
  process.exit(0);
}
console.error('gh stand-in: unhandled: ' + argv); process.exit(1);
`;
  write(dir, 'gh.js', script);
  // On Windows an extensionless `gh` resolves ahead of gh.cmd on PATH and the
  // tool probes it as an executable (spawn fails), so the stand-in ships only
  // the launch form the host can run.
  if (process.platform === 'win32') write(dir, 'gh.cmd', `@echo off\r\nnode "%~dp0gh.js" %*\r\n`);
  else write(dir, 'gh', `#!/bin/sh\nexec node "$(dirname "$0")/gh.js" "$@"\n`);
  return dir;
}

// ---------- main ----------

// --out may name a directory this script did not create; refuse to delete a
// non-empty directory that lacks the marker we write on first build.
const OWNED = '.k26-worlds-owned';
if (existsSync(OUT)) {
  if (readdirSync(OUT).length > 0 && !existsSync(join(OUT, OWNED))) {
    throw new Error(`refusing to overwrite non-empty directory not created by setup-worlds.mjs: ${OUT}`);
  }
  rmSync(OUT, { recursive: true, force: true });
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, OWNED), 'created by kitchen/memory/second-machine/setup-worlds.mjs\n');
const ghDir = buildGhStandin();

const openLine = 'open bounties — run box bounty status before starting overlapping work: ' + B1 + ' "' + TASK_TEXT + '" (posted)\n';

// world-a: the full records as today
const settingsA = join(OUT, 'settings-a'); mkdirSync(settingsA, { recursive: true });
const wa = {};
projectFiles2(wa, agentsShared(openLine));
wa['.box/bounties/OPEN'] = `open bounties: ${B1} "${TASK_TEXT}" (posted) https://github.com/alice/oauth-migration-demo/issues/1 box-bounty/${B1}\n`;
wa[`.box/bounties/${B1}.json`] = JSON.stringify(fullRecordA(), null, 2) + '\n';
wa[`.box/bounties/${B2}.json`] = JSON.stringify(fullRecordB(), null, 2) + '\n';
buildWorld('world-a', wa);
boxWrappers(join(OUT, 'world-a'), settingsA, ghDir);

// world-b: only the shared tiers — a shared.json plus asRecord-shaped files
// carrying only shared fields
const settingsB = join(OUT, 'settings-b'); mkdirSync(settingsB, { recursive: true });
const wb = {};
projectFiles2(wb, agentsShared(openLine));
wb['.box/bounties/OPEN'] = `open bounties: ${B1} "${TASK_TEXT}" (posted) https://github.com/alice/oauth-migration-demo/issues/1 box-bounty/${B1}\n`;
const sharedB1 = sharedRecordB1(), sharedB2 = sharedRecordB2();
wb[`.box/bounties/${B1}.json`] = JSON.stringify(sharedB1, null, 2) + '\n';
wb[`.box/bounties/${B2}.json`] = JSON.stringify(sharedB2, null, 2) + '\n';
wb['.box/shared-bounties.json'] = JSON.stringify({
  schema: 'box-bounty-shared@1',
  note: 'the shared tiers of every bounty record — committed with the code; local machine state lives outside Git',
  bounties: [sharedB1, sharedB2]
}, null, 2) + '\n';
buildWorld('world-b', wb);
boxWrappers(join(OUT, 'world-b'), settingsB, ghDir);

// world-c: a clone today when .box/bounties/ is not committed — only the
// public issue text survives, in GITHUB-ISSUES.md and `gh issue list`
mkdirSync(join(OUT, 'settings-c'), { recursive: true });
const wc = {};
projectFiles2(wc, AGENTS_C);
wc['GITHUB-ISSUES.md'] = `# Issues (mirror of gh issue list)\n\n## #1 open — ${TASK_TEXT}\n\n${ISSUE_BODY}\n\n## #2 closed — Parse OAuth PKCE code_challenge headers\n`;
buildWorld('world-c', wc);
boxWrappers(join(OUT, 'world-c'), join(OUT, 'settings-c'), ghDir);

// Commit the wrappers/settings notes into the worlds (wrappers were written
// after the first commit — amend so each world is one clean commit).
for (const name of ['world-a', 'world-b', 'world-c']) {
  const dir = join(OUT, name);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--amend', '--no-edit']);
}

// ---------- agent prompts ----------

const promptFor = (world, settings) => `You are a coding agent continuing work on this project.
Work only inside ${join(OUT, world)}.

Task: continue the OAuth migration in this project; use whatever tools are here.

Environment to run the bounty tool (if you choose to): the project carries a
"box" wrapper (box.cmd on Windows, ./box elsewhere) that already wires
BOX_BOUNTY_SETTINGS_DIR=${settings} and the project's stand-in gh.
There is no real GitHub — gh is a read-only stand-in.

Report at the end, in plain text, everything you read and did.`;

write(OUT, 'AGENT-PROMPTS.md', `# K26 step 4 — the three fresh agents

Run each in a fresh session, one per world. Each gets ONLY its world's prompt.
Score each transcript on the four fixed questions in waves/K26.md.

## Agent A — world (a): full records as today

${promptFor('world-a', join(OUT, 'settings-a'))}

## Agent B — world (b): shared tiers only

${promptFor('world-b', join(OUT, 'settings-b'))}

## Agent C — world (c): public issue only

${promptFor('world-c', join(OUT, 'settings-c'))}

Save each transcript to kitchen/memory/second-machine/transcript-{a,b,c}.md.
`);

// ---------- smoke check: the tool must run in every world ----------
// `./box status` and `./box find` are what the fresh agents run first; a
// record the reader rejects or a GitHub refresh that fails here means the
// world is broken before the experiment starts.
const settingsFor = { 'world-a': settingsA, 'world-b': settingsB, 'world-c': join(OUT, 'settings-c') };
for (const name of ['world-a', 'world-b', 'world-c']) {
  const dir = join(OUT, name);
  const env = { ...process.env, BOX_BOUNTY_SETTINGS_DIR: settingsFor[name] };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = ghDir + delimiter + (env[pathKey] ?? '');
  for (const boxArgs of [['status'], ['find', 'OAuth']]) {
    let output = '';
    try {
      output = String(execFileSync('node', [CLI, 'bounty', ...boxArgs], { cwd: dir, env, encoding: 'utf8' }));
    } catch (error) {
      throw new Error(`${name}: box bounty ${boxArgs.join(' ')} exited non-zero\n${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`);
    }
    if (/not a readable record|could not be refreshed/.test(output)) {
      throw new Error(`${name}: box bounty ${boxArgs.join(' ')} printed a broken line:\n${output}`);
    }
  }
  console.log(`  ${name}: box status / box find OAuth OK`);
}

console.log(`built ${OUT}`);
console.log(`  world-a ${join(OUT, 'world-a')}  (full records)`);
console.log(`  world-b ${join(OUT, 'world-b')}  (shared tiers only)`);
console.log(`  world-c ${join(OUT, 'world-c')}  (public issue only)`);
console.log(`  gh stand-in ${ghDir}; prompts: ${join(OUT, 'AGENT-PROMPTS.md')}`);
