import { postToGitHub, allowGitHub, statusGitHub } from './github-solver.js';
import { readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changeConfig, changePublishList, closeBounty, finalizeBounty, loadRecord, allowBounty, planBounty, postBounty, previewGitHub, renderConfig, renderPreview, renderStatus, renderSummary, scanText } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { git, makeRepo, ownerSays, runRoot, write } from './support.js';
import { fixture, refused } from './github-fixture.js';

// BT8c: the owner tightens the secret scan. A hit always waits for the owner
// and can never be answered away — the owner settles it in config on two
// lists kept in the owner's own settings: never publish (kept out of every
// bounty) and safe to publish (the scan's only exception). The agent's moves
// are remove-and-repost or stop. Every secret-shaped value below is built at
// run time so this file's own bytes never hold a contiguous secret shape.

const joined = (...parts: string[]) => parts.join('');

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md'), ...extra };
}

describe('the owner\'s two lists live in the owner\'s settings, never in the project', () => {
  it('bare config shows both lists and the commands that change them', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    let config = renderConfig(repo);
    expect(config).toContain('never publish');
    expect(config).toContain('safe to publish');
    changeConfig(repo, 'add', 'safe-to-publish', 'src/app.py');
    changeConfig(repo, 'add', 'never-publish', 'src');
    config = renderConfig(repo);
    expect(config).toContain('safe to publish: "src/app.py"');
    expect(config).toContain('never publish: "src"');
    changeConfig(repo, 'remove', 'safe-to-publish', 'src/app.py');
    expect(renderConfig(repo)).toContain('safe to publish: none listed');
    // Removing an entry that is not listed is a named refusal, nothing changes.
    refused(() => changeConfig(repo, 'remove', 'never-publish', 'nope.txt'), 'publish-list-not-listed');
  });

  it('a project file that claims either list is refused by name and grants nothing', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    write(repo, 'settings.json', JSON.stringify({ 'safe-to-publish': ['src/app.py'] }));
    refused(() => planBounty(options(repo)), 'project-claims-list');
    refused(() => renderConfig(repo), 'project-claims-list');
  });
});

describe('list entries are validated — outside paths, links and never-ship-as-safe refuse', () => {
  it('a path resolving outside the repository is refused for either list', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    refused(() => changePublishList(repo, 'never-publish', 'add', '../outside.txt'), 'publish-list-outside');
    refused(() => changePublishList(repo, 'safe-to-publish', 'add', '../outside.txt'), 'publish-list-outside');
  });

  it('a path that resolves through a link is refused', () => {
    const repo = makeRepo({ 'real/target.txt': 'x\n' });
    symlinkSync(join(repo, 'real'), join(repo, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    refused(() => changePublishList(repo, 'never-publish', 'add', 'linked/target.txt'), 'publish-list-link');
    refused(() => changePublishList(repo, 'safe-to-publish', 'add', 'linked/target.txt'), 'publish-list-link');
  });

  it('a never-ship path cannot be safe-listed', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    refused(() => changePublishList(repo, 'safe-to-publish', 'add', '.env'), 'publish-list-never-ship');
  });
});

describe('never publish keeps a listed path out of every bounty', () => {
  it('a first-published commit on a listed path is refused by the never-ship rule', () => fixture(({ repo, id }) => {
    write(repo, 'mine/data.txt', 'key = "AKIA' + 'IOSFODNN7EXAMPLE' + '"\n');
    git(repo, ['add', 'mine/data.txt']);
    git(repo, ['commit', '-qm', 'mine']);
    changePublishList(repo, 'never-publish', 'add', 'mine');
    let thrown: unknown;
    try { postBounty(repo, id, 'github'); } catch (error) { thrown = error; }
    expect((thrown as { reason: string }).reason).toBe('github-never-ship');
    expect((thrown as Error).message).toContain('owner-never-publish');
  }));

  it('the snapshot keeps a listed path out of the shipped set at create', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'private/notes.txt': 'owner only\n' });
    changePublishList(repo, 'never-publish', 'add', 'private');
    const plan = planBounty(options(repo));
    expect(plan.files.some(file => file.path.startsWith('private/'))).toBe(false);
    expect(plan.ruleRemovals.some(entry => entry.rule === 'owner-never-publish')).toBe(true);
  });
});

describe('the scan hold — the owner decides in config, the agent cannot answer it away', () => {
  it('allow <bounty> on a scan hold is a named refusal that changes nothing; safe-listing sends it', () => fixture(({ repo, id, state }) => {
    write(repo, 'keys.txt', 'token=' + 'Xk9Qm2Zv8Lp4Nr' + '7Ty1Wb6Jd0Fg\n'); // the bare NAME=value form
    git(repo, ['add', 'keys.txt']);
    git(repo, ['commit', '-qm', 'keys']);
    refused(() => postBounty(repo, id, 'github'), 'publish-held');
    refused(() => allowGitHub(repo, id), 'allow-scan-held');
    // The hold still stands and nothing was published.
    expect(loadRecord(repo, id).waiting?.reason).toBe('secrets');
    expect(state().issues).toHaveLength(0);
    changeConfig(repo, 'add', 'safe-to-publish', 'keys.txt');
    postBounty(repo, id, 'github');
    expect(state().issues).toHaveLength(1);
    // The record keeps what was flagged and what happened.
    const finding = loadRecord(repo, id).scanFindings?.at(-1);
    expect(finding?.hits[0]).toMatchObject({ path: 'keys.txt', rule: 'assigned-secret' });
    expect(finding?.settled).toContain('safe');
  }));

  it('removing the flagged content and posting again sends the bounty', () => fixture(({ repo, id, state }) => {
    write(repo, 'app.txt', 'fixed\nkey = "AKIA' + 'IOSFODNN7EXAMPLE' + '"\n');
    refused(() => postBounty(repo, id, 'github', { choice: { withChanges: true, include: [] } }), 'publish-held');
    write(repo, 'app.txt', 'fixed\n'); // the flagged content is removed — the plan is rebuilt live
    postBounty(repo, id, 'github', { choice: { withChanges: true, include: [] } });
    expect(state().issues).toHaveLength(1);
    expect(loadRecord(repo, id).scanFindings?.at(-1)?.settled).toContain('content changed');
  }));

  it('a held bounty that ends settles its finding — nothing was published', () => fixture(({ repo, id }) => {
    write(repo, 'keys.txt', 'key = "AKIA' + 'IOSFODNN7EXAMPLE' + '"\n');
    git(repo, ['add', 'keys.txt']);
    git(repo, ['commit', '-qm', 'keys']);
    refused(() => postBounty(repo, id, 'github'), 'publish-held');
    // Status names the finding while it is live and offers the owner no
    // `allow <id>` line — a scan hold is decided in config, never answered.
    const status = statusGitHub(repo);
    expect(status).toContain('scan finding');
    expect(status).toContain('keys.txt');
    expect(status).not.toContain(`allow ${id}`);
    closeBounty(repo, id);
    expect(loadRecord(repo, id).scanFindings?.at(-1)?.settled).toContain('ended');
  }));

  it('status names the wait and the owner\'s config decision — never the value', () => fixture(({ repo, id }) => {
    write(repo, 'keys.txt', 'key = "AKIA' + 'IOSFODNN7EXAMPLE' + '"\n');
    git(repo, ['add', 'keys.txt']);
    git(repo, ['commit', '-qm', 'keys']);
    refused(() => postBounty(repo, id, 'github'), 'publish-held');
    const status = statusGitHub(repo);
    expect(status).toContain('keys.txt');
    expect(status).toContain('box bounty config');
    expect(status).not.toContain('IOSFODNN');
  }));
});

describe('an owner answer is bound to what the owner was shown would be published', () => {
  it('under ask-me-each-time an unchanged state posts; a change afterwards refuses the answer', () => fixture(({ repo, id, scratch, state }) => {
    writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': { bounty: 'ask', at: '2026-10-13T00:00:00.000Z', changes: [] } }, projects: {} }));
    refused(() => postBounty(repo, id, 'github'), 'owner-answer-needed');
    expect(loadRecord(repo, id).waiting?.reason).toBe('owner-ask');
    expect(loadRecord(repo, id).waiting?.shown).toBeDefined();
    // The state moved after the owner was shown: the answer does not carry.
    write(repo, 'app.txt', 'changed\n');
    git(repo, ['add', 'app.txt']);
    git(repo, ['commit', '-qm', 'moved']);
    refused(() => allowGitHub(repo, id), 'github-preview-stale');
    expect(loadRecord(repo, id).stage).toBe('waiting');
    // Posting again re-records the wait under the new state; the owner's
    // answer on that goes out.
    refused(() => postBounty(repo, id, 'github'), 'owner-answer-needed');
    allowGitHub(repo, id);
    expect(loadRecord(repo, id).stage).toBe('posted');
    expect(state().issues).toHaveLength(1);
  }));

  it('an untracked-file hold answers fine while nothing moved', () => fixture(({ repo, id, state }) => {
    write(repo, 'notes/hint.txt', 'a hint\n');
    refused(() => postBounty(repo, id, 'github', { choice: { withChanges: false, include: ['notes/hint.txt'] } }), 'publish-held');
    expect(loadRecord(repo, id).waiting?.shown).toBeDefined();
    allowGitHub(repo, id);
    expect(loadRecord(repo, id).stage).toBe('posted');
    expect(state().issues).toHaveLength(1);
  }));
});

describe('binary files are named as not scanned — a fact, never a hold', () => {
  it('a binary first-published file is named on the post and preview, and does not hold', () => fixture(({ repo, id, state }) => {
    // Bytes Git calls binary even carrying a secret-shaped tail: the scan has
    // nothing to read. Named as not scanned — the post still goes out.
    const bytes = Buffer.concat([Buffer.from('head-bytes'), Buffer.from([0]), Buffer.from(joined('\nkey = "AKIA', 'IOSFODNN7EXAMPLE', '"\n'))]);
    writeFileSync(join(repo, 'blob.bin'), bytes);
    git(repo, ['add', 'blob.bin']);
    git(repo, ['commit', '-qm', 'blob']);
    const preview = previewGitHub(repo, id);
    expect(preview).toContain('not scanned');
    expect(preview).toContain('blob.bin');
    const { record } = postBounty(repo, id, 'github');
    expect(state().issues).toHaveLength(1);
    expect(record.github?.scanBinary).toEqual(['blob.bin']);
  }));
});

describe('the unquoted NAME=value shape joins the stated list', () => {
  it('env-style assignments hit; ordinary code and placeholders still pass', () => {
    const hits = scanText('config.env', 'API_TOKEN=' + 'Xk9Qm2Zv8Lp4' + 'Nr7Ty1Wb6Jd0Fg' + '\n');
    expect(hits).toMatchObject([{ rule: 'assigned-secret' }]);
    const ordinary = [
      'token = getTokenFromEnvironment();',   // a call, not a value
      'key = "abc"',                          // short
      'password = "hunter2"',                 // short
      'secret: the-vault-entry-name',         // plain words
      'api_key = a-fairly-long-placeholder'   // one character class
    ].join('\n');
    expect(scanText('auth.js', ordinary)).toEqual([]);
  });

  it('the stated limits hold: a token split across lines and a key block wrapped differently are not caught', () => {
    // The scan reads one line at a time — these stay undetected on purpose
    // and the docs say so; pinning the limit keeps it a documented fact.
    const split = 'const first = "AKIA' + 'IOSFODN";\nconst second = "N7EX' + 'AMPLE";';
    const wrapped = 'LS0tLS1CRUdJTi' + 'BQUklWQVRFIEtFWS0tLS0t' + '\n' + 'a2V5LWJsb2NrLWluLW' + 'Jhc2U2NA==';
    expect(scanText('split.js', split)).toEqual([]);
    expect(scanText('wrapped.txt', wrapped)).toEqual([]);
  });
});

describe('create previews the scan — a hit holds nothing and is recorded the same way', () => {
  it('a secret-shaped file in the shipped set is named at create and recorded', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    write(repo, 'keys.txt', 'key = "AKIA' + 'IOSFODNN7EXAMPLE' + '"\n');
    const plan = planBounty(options(repo));
    expect(plan.scan.hits[0]).toMatchObject({ path: 'keys.txt', rule: 'aws-access-key-id' });
    expect(renderPreview(plan)).toContain('secret-shaped hit');
    const { id } = finalizeBounty(plan);
    const record = loadRecord(repo, id);
    expect(record.stage).toBe('drafted'); // nothing held
    expect(record.scanFindings?.[0]).toMatchObject({ where: 'create', settled: null });
    closeBounty(repo, id);
    expect(loadRecord(repo, id).scanFindings?.[0]?.settled).toContain('ended');
  });
});

describe('a settled finding claims only what was verified, and stays visible', () => {

  it('a safe-listed path settles by the list\'s state — the record does not claim who acted', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    write(repo, 'keys.txt', 'key = "AKIA' + 'IOSFODNN7EXAMPLE' + '"\n');
    const { id } = finalizeBounty(planBounty(options(repo)));
    changeConfig(repo, 'add', 'safe-to-publish', 'keys.txt');
    ownerSays(repo, 'allowed');
    postToGitHub(repo, id);
    const settled = loadRecord(repo, id).scanFindings?.[0]?.settled;
    expect(settled).toContain('on safe to publish');
    expect(settled).not.toContain('owner marked');
  });

  it('an ended bounty still shows the finding — bare status, status <id>, --full and --since', () => fixture(({ repo, id }) => {
    write(repo, 'keys.txt', 'key = "AKIA' + 'IOSFODNN7EXAMPLE' + '"\n');
    git(repo, ['add', 'keys.txt']);
    git(repo, ['commit', '-qm', 'keys']);
    refused(() => postBounty(repo, id, 'github'), 'publish-held');
    closeBounty(repo, id);
    for (const status of [statusGitHub(repo), statusGitHub(repo, { id }), statusGitHub(repo, { id, full: true })]) {
      expect(status).toContain('scan finding');
      expect(status).toContain('"keys.txt":1');
      expect(status).toContain('ended — nothing was published');
    }
    // The compact ended line marks the fact so the owner knows to look.
    expect(statusGitHub(repo)).toContain('scan finding recorded');
    // The summary the owner reads carries it whatever --since says — a
    // settled finding is a standing fact, not an event.
    expect(renderSummary(repo)).toContain('"keys.txt":1');
    expect(renderSummary(repo, '2099-01-01T00:00:00.000Z')).toContain('"keys.txt":1');
  }));
});

