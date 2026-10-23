// BT14 — agent-facing clarity: what an agent needs leads every surface,
// every command it is told to run exists, and nothing it is told cannot
// work.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowRepository, changeConfig, deriveTitle, denyRepository, planBounty, postBounty, renderConfig, renderPreview, renderStatus, TITLE_LIMIT } from '../../../packages/box-bounty/index.js';
import { fixture, postedFixture, refused } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, runRoot, write } from './support.js';

const cli = (root: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, ...args], { cwd: root, encoding: 'utf8', env: process.env, timeout: 60000 });

describe('an instruction-file edit names the file and says it is not committed', () => {
  it('the sync line names the file and the uncommitted fact', () => {
    const repo = makeRepo({ 'TASK.md': 'Fix the sum.\n', 'AGENTS.md': 'owner words\n' });
    const out = changeConfig(repo, 'set', 'instructions', 'true');
    expect(out).toContain('"AGENTS.md": block updated');
    expect(out).toContain('not committed');
  });
});

describe('create explains placement, the title rule and the owner gate', () => {
  it('the preview states where the inputs live, the shortened-title rule and the permission that gates a post', () => {
    const repo = makeRepo({ 'TASK.md': 'Fix the sum.\n' });
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/notallowed.git']);
    const plan = planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'stuck', });
    const preview = renderPreview(plan);
    expect(preview).toContain('the task file stays where it is');
    expect(preview).toContain('never commits or removes it');
    expect(preview).toContain('posting permission: none — a GitHub post waits for the owner\'s permission; box bounty allow owner/notallowed is their answer');
    // An allowed repository states the post goes out instead.
    allowRepository(repo, 'owner/notallowed');
    expect(renderPreview(plan)).toContain('posting permission: allowed — a GitHub post goes out');
  });
});

describe('the title rule — a leading #, the first sentence, a stated length', () => {
  it.each([
    ['# Make the check pass', 'Make the check pass'],
    ['Make the check pass. With more detail following.', 'Make the check pass.'],
    [`${'a'.repeat(TITLE_LIMIT + 20)} and more`, `${'a'.repeat(TITLE_LIMIT)}…`]
  ])('derives %s → %s', (raw, expected) => {
    expect(deriveTitle(raw).title).toBe(expected);
    expect(deriveTitle(raw).shortened).toBe(expected !== raw);
  });
  it('the preview states the rule when the title was shortened, and stays quiet otherwise', () => {
    const repo = makeRepo({ 'TASK.md': '# Repair the app\n' });
    const shortened = planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'w', });
    expect(shortened.title).toBe('Repair the app');
    expect(renderPreview(shortened)).toContain(`past the first sentence or ${TITLE_LIMIT} characters are dropped`);
    const clean = planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'w', title: 'Repair the app', });
    expect(renderPreview(clean)).not.toContain('are dropped');
  });
});

describe('a held post says it waits for the owner and names their command', () => {
  it('an unallowed post names the wait and the answer the owner gives', () => fixture(({ repo, id, scratch }) => {
    writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
    try { postBounty(repo, id, 'github'); expect.unreachable('expected a refusal'); }
    catch (error) {
      expect((error as { reason: string }).reason).toBe('owner-allow-needed');
      const message = String((error as Error).message);
      expect(message).toContain('waiting for the owner');
      expect(message).toContain('waits for');
      expect(message).toContain('box bounty allow');
    }
  }));
});

describe('compact status leads with what waits', () => {
  it('waiting solutions and pay facts come first; the collected count is dropped; format lives under --full', () => postedFixture(({ repo, id }) => {
    const status = renderStatus(repo);
    const waiting = status.indexOf(`#1 by owner:`);
    const context = status.indexOf('Saved job context');
    expect(waiting).toBeGreaterThan(-1);
    expect(context).toBeGreaterThan(-1);
    expect(waiting).toBeLessThan(context);
    expect(status).not.toContain('0 collected');
    // BT17: one `next:` line carries the collect command; the listing above
    // it names the pull request's number.
    expect(status).toContain(`next: box bounty look ${id} <number>`);
    expect(status).not.toContain('GitHub format block:');
    const full = renderStatus(repo, { full: true });
    expect(full).toContain('GitHub format block:');
  }));
});

describe('a failed refresh names the reason — and a hopeless one offers no retry', () => {
  it('an issue that is not this bounty\'s names github-issue-mismatch and no retry', () => postedFixture(({ repo, id, state, update }) => {
    update({ issues: [{ ...state().issues[0]!, body: 'edited outside — the bounty marker is gone' }] });
    const stale = renderStatus(repo);
    expect(stale).toContain('github-issue-mismatch');
    expect(stale).toContain('reads the same answer');
    expect(stale).not.toContain('retry box bounty status');
  }));
});

describe('the secret scan never tells an agent to rewrite history', () => {
  it('a hit inside an unpushed commit says a new commit does not help and history is the owner\'s call', () => fixture(({ repo, id }) => {
    write(repo, 'config/creds.txt', `api_key = "${'aB3' + 'q'.repeat(30)}"\n`);
    git(repo, ['add', 'config/creds.txt']);
    git(repo, ['commit', '-qm', 'add config']);
    try { postBounty(repo, id, 'github', { choice: { withChanges: false, include: [] } }); expect.unreachable('expected a refusal'); }
    catch (error) {
      const message = String((error as Error).message);
      expect((error as { reason: string }).reason).toBe('publish-held');
      expect(message).toContain('in unpushed commit');
      expect(message).toContain('a new commit removing the content does not help');
      expect(message).toContain('the owner\'s call');
      expect(message).not.toContain('rewrite history');
    }
  }));
});

describe('config: never-set settings omitted, retired verbs refused, removals named', () => {
  it('bare config omits a never-set all-projects row; --full shows everything', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/plain.git']);
    const bare = renderConfig(repo);
    expect(bare).not.toContain('all-projects:');
    expect(bare).toContain('box bounty config --full');
    expect(renderConfig(repo, { full: true })).toContain('all-projects: false (off by default), nothing written');
  });
  it('config add/remove repositories are named refusals that point at allow and deny', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    refused(() => changeConfig(repo, 'add', 'repositories', 'owner/shop'), 'config-command-removed');
    try { changeConfig(repo, 'add', 'repositories', 'owner/shop'); expect.unreachable(); }
    catch (error) { expect(String((error as Error).message)).toContain('box bounty allow owner/shop'); }
    try { changeConfig(repo, 'remove', 'repositories', 'owner/shop'); expect.unreachable(); }
    catch (error) { expect(String((error as Error).message)).toContain('box bounty deny owner/shop'); }
  });
  it('deny names the reward and the limit that went with the entry, and the table offers re-allow not a second remove', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/shop.git']);
    allowRepository(repo, 'owner/shop', false, { reward: '10', rewardLimit: '30' });
    const denied = denyRepository(repo);
    expect(denied).toContain('reward ($10) and limit ($30) went with the entry');
    const row = renderConfig(repo).split('\n').find(line => line.includes('owner/shop: not allowed'));
    expect(row).toBeDefined();
    expect(row).toContain('re-allow: box bounty allow owner/shop');
    expect(row).not.toContain('remove:');
  });
});

describe('the first merge and the payment are one block', () => {
  it('a paid apply carries the first-merge fact inside the owner block — never a second message', () => fixture(({ repo, id, scratch, pr }) => {
    writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [], reward: { amount: 5, at: '2026-10-13T00:00:00.000Z' }, rewardLimit: { amount: 20, at: '2026-10-13T00:00:00.000Z' } } } }));
    postBounty(repo, id, 'github');
    pr('solver');
    const applied = cli(repo, ['bounty', 'apply', id, '1']);
    expect(applied.status).toBe(0);
    const owner = applied.stdout.slice(applied.stdout.indexOf('for the owner — pass'), applied.stdout.indexOf('for you —'));
    expect(owner).toContain('first solution written by someone outside');
    expect(applied.stdout).not.toContain('Tell the owner');
    expect((applied.stdout.match(/for the owner — pass this on in these words:/g) ?? []).length).toBe(1);
  }));
});

describe('box --help exits 0 and lists box bounty first', () => {
  it('--help on stdout, bounty commands only, exit 0', () => {
    const run = cli('.', ['--help']);
    expect(run.status).toBe(0);
    expect(run.stdout.indexOf('box bounty create')).toBeGreaterThan(-1);
    // K29: the older-platform commands' help lines are gone with the commands
    // themselves — the ordering assertion they anchored is replaced by their
    // absence, which is the same "bounty is the product" pin post-removal.
    for (const removed of ['box export', 'box submit', 'box verify', 'box trace'])
      expect(run.stdout.includes(removed), removed).toBe(false);
  });
});
