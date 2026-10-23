import { allowGitHub, postToGitHub, collectPullRequest, applyGitHub, closeGitHub, statusGitHub } from './github-solver.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, changePublishList, closeBounty, finalizeBounty, loadRecord, allowBounty, planBounty, postBounty, readDecision, renderStatus, scanText, settingsFile, writeDecision } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { git, makeRepo as makeBareRepo, ownerRead, runRoot, write } from './support.js';
import { fixture, refused } from './github-fixture.js';

// BT8: the owner says yes once. The decision lives in the owner's own
// settings folder outside every repository — the suite's support.ts points
// BOX_BOUNTY_SETTINGS_DIR at a temp folder and starts each test with
// nothing written (never read as allowed). Fixture worlds carry their own
// settings folder with an all-projects "allowed".

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md'), ...extra };
}

function makeRepo(files: Record<string, string>): string {
  const repo = makeBareRepo(files);
  git(repo, ['remote', 'add', 'origin', 'https://github.com/tests/' + repo.split(/[\\/]/).slice(-2, -1)[0] + '.git']);
  return repo;
}

const drafted = (repo: string, extra: Partial<CreateOptions> = {}) =>
  finalizeBounty(planBounty(options(repo, extra)));

const rawSettings = (text: string): void => {
  writeFileSync(settingsFile(), text);
};

const levelJson = (bounty: string): string =>
  JSON.stringify({ kind: 'box-owner-settings', default: { bounty, at: '2026-10-13T00:00:00.000Z', changes: [] }, projects: {} }, null, 2) + '\n';

describe('the owner\'s one decision — nothing written is never allowed', () => {
  it('nothing written: the post waits in a named state and prints the exact owner commands', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    expect(ownerRead(repo).decision).toBeNull();
    const { id } = drafted(repo);
    refused(() => postToGitHub(repo, id), 'owner-allow-needed');
    const record = loadRecord(repo, id);
    expect(record.stage).toBe('waiting');
    expect(record.waiting?.reason).toBe('owner-allow');
    expect(statusGitHub(repo)).toContain('waiting for the owner');
  });

  it('an owner answer on a bounty that is not waiting is a named refusal', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = drafted(repo);
    refused(() => allowGitHub(repo, id), 'owner-answer-not-waiting');
    refused(() => allowGitHub(repo, 'bt-000000000000'), 'unknown-bounty');
  });
});

describe('allowed — posting, answering and closing need nobody asked again', () => {
  it('project-level allowed posts without asking and records which answer allowed it', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = drafted(repo);
    writeDecision(repo, 'project', 'allowed');
    const { record } = postToGitHub(repo, id);
    expect(record.stage).toBe('posted');
    expect(record.allowedBy?.decision).toBe('allowed');
    expect(record.allowedBy?.level).toBe('project');
    expect(record.waiting).toBeUndefined();
  });

  it('the project level is read first — a project ask stands over a default allowed, and back', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    writeDecision(repo, 'default', 'allowed');
    writeDecision(repo, 'project', 'ask');
    expect(ownerRead(repo).decision).toBe('ask');
    expect(ownerRead(repo).level).toBe('project');
    const first = drafted(repo);
    refused(() => postToGitHub(repo, first.id), 'owner-answer-needed');
    // …and a project allowed stands over a default ask, same file, other order.
    const repo2 = makeRepo({ 'src/app.py': 'x\n' });
    writeDecision(repo2, 'project', 'allowed');
    writeDecision(repo2, 'default', 'ask');
    const second = drafted(repo2, { });
    expect(postToGitHub(repo2, second.id).record.stage).toBe('posted');
  });
});

describe('ask me each time — every post and every outside close waits', () => {
  it('each post waits on its own; the owner answers one bounty at a time', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    writeDecision(repo, 'project', 'ask');
    const first = drafted(repo);
    refused(() => postToGitHub(repo, first.id), 'owner-answer-needed');
    expect(loadRecord(repo, first.id).waiting?.reason).toBe('owner-ask');
    const output = allowGitHub(repo, first.id);
    expect(output).toContain('answered once');
    const record = loadRecord(repo, first.id);
    expect(record.stage).toBe('posted');
    expect(record.allowedBy?.decision).toBe('once');
    // ask me EACH time: the next bounty waits on its own answer.
    const second = drafted(repo, { });
    refused(() => postToGitHub(repo, second.id), 'owner-answer-needed');
    expect(loadRecord(repo, second.id).stage).toBe('waiting');
  });


});

describe('the settings file is a boundary — malformed and unknown names refuse, never ignore', () => {
  it('malformed JSON and a wrong shape are named refusals before anything mutates', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const { id } = drafted(repo);
    rawSettings('this is not json{');
    refused(() => postToGitHub(repo, id), 'settings-malformed');
    rawSettings('{"kind":"box-owner-settings","default":"allowed"}');
    refused(() => readDecision(repo), 'settings-malformed');
  });

  it('a name the tool does not know is refused, not ignored', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    rawSettings(JSON.stringify({ kind: 'box-owner-settings', default: { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [], grantAllRepos: true }, projects: {} }));
    refused(() => readDecision(repo), 'settings-unknown-name');
    rawSettings(JSON.stringify({ kind: 'box-owner-settings', approveEverything: true, projects: {} }));
    refused(() => readDecision(repo), 'settings-unknown-name');
  });

  it.each(['neverShip', 'private', 'secret', 'scan', 'hard-stop', 'credential'])(
    'a setting reaching for a hard stop (%s) cannot be written or read', name => {
      const repo = makeRepo({ 'src/app.py': 'x\n' });
      rawSettings(JSON.stringify({ kind: 'box-owner-settings', default: { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [], [name]: false }, projects: {} }));
      refused(() => readDecision(repo), 'settings-hard-stop');
      // …and it grants nothing even shaped like a decision value.
      rawSettings(JSON.stringify({ kind: 'box-owner-settings', projects: {}, [name]: { bounty: 'allowed', at: 'x', changes: [] } }));
      refused(() => readDecision(repo), 'settings-hard-stop');
    });
});

describe('the pre-publish scan — secret shapes hold the one bounty that carries them', () => {
  // The stated list, each kind planted as a unit: private key blocks,
  // well-known tokens, passworded connection strings, long random
  // assignments to key/secret/token/password-like names. Every planted
  // value is assembled at run time so this file's own bytes never hold a
  // contiguous secret-shaped string — a literal here is what secret
  // scanning on the push itself flags.
  const joined = (...parts: string[]) => parts.join('');
  it.each([
    ['private-key-block', joined('-----BEGIN ', 'RSA PRIVATE ', 'KEY-----', '\nMIIEowIBAAKCAQEA\n')],
    ['github-token', joined('token = "ghp_', 'A1b2C3d4E5f6', 'G7h8I9j0K1l2M3n4O5p6"\n')],
    ['gitlab-token', joined('t = "glpat-', 'Ab1Cd2Ef3', 'Gh4Ij5Kl6Mn"\n')],
    ['aws-access-key-id', joined('key = "AKIA', 'IOSFODNN', '7EXAMPLE"\n')],
    ['openai-key', joined('k = "sk-', 'Ab1Cd2Ef3Gh4Ij', '5Kl6Mn7Op8Qr9St0Uv"\n')],
    ['passworded-connection-string', joined('db = "postgres://user:', 's3cret-hun73r@', 'db.internal/main"\n')],
    ['assigned-secret', joined('const api_secret = "Xk9Qm2Zv8', 'Lp4Nr7Ty1Wb6Jd0', '"\n')]
  ])('scanText flags %s', (rule, text) => {
    const hits = scanText('config.txt', text);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ path: 'config.txt', line: 1, rule });
  });

  it('ordinary code using the words token and key is not flagged', () => {
    const ordinary = [
      'const token = getToken();',
      'key = "abc"',
      'tokenTimeout = 5000',
      'const apiKey = process.env.API_KEY;',
      'password = "hunter2"',
      'secretName: "the vault entry"',
      'export function tokenize(input) { return input.split(" "); }'
    ].join('\n');
    expect(scanText('auth.js', ordinary)).toEqual([]);
  });

  it('an unpushed commit carrying a secret holds the post — file and line named, never the value', () => fixture(({ repo, id, state }) => {
    write(repo, 'config.txt', 'db = "postgres://user:' + 's3cret-hun73r@' + 'db.internal/main"\n');
    git(repo, ['add', 'config.txt']);
    git(repo, ['commit', '-qm', 'add config']);
    let thrown: unknown;
    try { postBounty(repo, id, 'github'); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(BountyRefused);
    const refusal = thrown as BountyRefused;
    expect(refusal.reason).toBe('publish-held');
    expect(refusal.message).toContain('"config.txt":1');
    expect(refusal.message).toContain('passworded-connection-string');
    expect(refusal.message).not.toContain('s3cret-hun73r');
    // The hit message offers the agent only its own moves — no owner command.
    expect(refusal.message).not.toContain('allow');
    expect(refusal.message).not.toContain('close');
    expect(refusal.message).toContain('config');
    const record = loadRecord(repo, id);
    expect(record.stage).toBe('waiting');
    expect(record.waiting?.reason).toBe('secrets');
    expect(record.waiting?.hits?.[0]).toMatchObject({ path: 'config.txt', line: 1 });
    expect(state().issues).toHaveLength(0); // nothing was published
    // BT8c: an owner answer cannot release a scan hold — the owner marks the
    // path safe to publish in config, and the post goes out.
    refused(() => allowGitHub(repo, id), 'allow-scan-held');
    expect(loadRecord(repo, id).waiting?.reason).toBe('secrets');
    changePublishList(repo, 'safe-to-publish', 'add', 'config.txt');
    const { record: posted } = postBounty(repo, id, 'github');
    expect(posted.stage).toBe('posted');
    expect(JSON.stringify(posted)).not.toContain('s3cret-hun73r');
    expect(state().issues).toHaveLength(1);
  }));

  it('an owner answer clears only what the recorded wait named — a permission answer still runs the scan', () => fixture(({ repo, id, scratch, state }) => {
    // Nothing written: the post waits for the decision…
    writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', projects: {} }));
    write(repo, 'keys.txt', 'key = "AKIA' + 'IOSFODNN7EXAMPLE' + '"\n');
    git(repo, ['add', 'keys.txt']);
    git(repo, ['commit', '-qm', 'keys']);
    refused(() => postBounty(repo, id, 'github'), 'owner-allow-needed');
    expect(loadRecord(repo, id).waiting?.reason).toBe('owner-allow');
    // …the owner answers that one bounty — and the scan they never saw still
    // holds the post, now with its own named reason.
    refused(() => allowGitHub(repo, id), 'publish-held');
    expect(loadRecord(repo, id).waiting?.reason).toBe('secrets');
    expect(state().issues).toHaveLength(0);
    // A second answer cannot settle the scan's hold either (BT8c) — the
    // owner decides it in config; safe-listing the path sends the bounty.
    refused(() => allowGitHub(repo, id), 'allow-scan-held');
    changePublishList(repo, 'safe-to-publish', 'add', 'keys.txt');
    postBounty(repo, id, 'github');
    expect(state().issues).toHaveLength(1);
  }));

  it('uncommitted secret bytes the agent chose to include hold the post the same way', () => fixture(({ repo, id, state }) => {
    write(repo, 'app.txt', 'fixed\nkey = "AKIA' + 'IOSFODNN7EXAMPLE' + '"\n');
    refused(() => postBounty(repo, id, 'github', { choice: { withChanges: true, include: [] } }), 'publish-held');
    const waiting = loadRecord(repo, id).waiting;
    expect(waiting?.reason).toBe('secrets');
    expect(waiting?.hits?.some(hit => hit.path === 'app.txt')).toBe(true);
    expect(state().issues).toHaveLength(0);
  }));

  it('a named untracked file holds only the bounty that names it', () => fixture(({ repo, id, scratch, state }) => {
    write(repo, 'notes/hint.txt', 'a hint for the solver\n');
    refused(
      () => postBounty(repo, id, 'github', { choice: { withChanges: false, include: ['notes/hint.txt'] } }),
      'publish-held'
    );
    expect(loadRecord(repo, id).waiting?.reason).toBe('untracked-file');
    expect(state().issues).toHaveLength(0);
    // …and nothing else is held up: a second bounty on the same repository
    // that names nothing goes straight out.
    const other = finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), title: 'other', why: 'w', }));
    postBounty(repo, other.id, 'github');
    expect(state().issues).toHaveLength(1);
    // The held one goes out on its own answer.
    allowGitHub(repo, id);
    expect(loadRecord(repo, id).stage).toBe('posted');
    expect(state().issues).toHaveLength(2);
  }));

  it('ordinary code mentioning tokens and keys posts without asking', () => fixture(({ repo, id, state }) => {
    write(repo, 'tokens.js', 'const token = getToken();\nkey = "abc"\ntokenTimeout = 5000\n');
    git(repo, ['add', 'tokens.js']);
    git(repo, ['commit', '-qm', 'tokenize']);
    postBounty(repo, id, 'github');
    expect(state().issues).toHaveLength(1);
  }));
});

describe('the hard stops cannot be set or switched off', () => {
  it('posting a private repository is refused with the tool allowed', () => fixture(({ repo, id, update }) => {
    update({ private: true });
    refused(() => postBounty(repo, id, 'github'), 'github-private-repository');
  }));
});
