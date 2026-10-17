// BT13 — "ask me each time" covers merges, and every message meant for the
// owner opens with a pass-on block in plain words.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowBounty, applyBounty, changePublishList, closeBounty, loadRecord, lookBounty, postBounty } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, git, readRecordRaw, write, writeRecordRaw } from './support.js';
import { fixture, postedFixture, refused } from './github-fixture.js';

const cli = (root: string, ...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: root, encoding: 'utf8', env: process.env, timeout: 60000 });

// Write a fixture world's owner settings directly — the bytes a pre-wave
// tool or an owner's hand wrote, so once-markers the tool adds are absent.
const worldSettings = (scratch: string, settings: Record<string, unknown>): void =>
  writeFileSync(join(scratch, 'settings', 'settings.json'), `${JSON.stringify({ kind: 'box-owner-settings', ...settings }, null, 2)}\n`);
const ASK = { bounty: 'ask', at: '2026-10-13T00:00:00.000Z', changes: [] };
const askWorld = (scratch: string): void => worldSettings(scratch, { repositories: { 'owner/project': ASK } });
// A secret-shaped value, built at run time — this file's bytes never hold a
// token-shaped literal (the value needs two character classes to scan).
const secretValue = 'aB3' + 'q'.repeat(30);
const plantSecret = (repo: string): void => {
  write(repo, 'config/creds.txt', `api_key = "${secretValue}"\n`);
  git(repo, ['add', 'config/creds.txt']);
  git(repo, ['commit', '-qm', 'add config']);
};

describe('ask me each time covers merges', () => {
  it('apply holds the merge in a named waiting state; allow releases exactly the shown state', () => fixture(({ repo, id, scratch, pr }) => {
    askWorld(scratch);
    refused(() => postBounty(repo, id, 'github'), 'owner-answer-needed');
    expect(allowBounty(repo, id)).toContain('answered once'); // releases the held post
    const prSha = pr('solver');
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    const held = cli(repo, 'apply', id, '1');
    expect(held.status).toBe(0); // a wait is a successful outcome, like a held post
    expect(held.stdout).toContain('waiting for the owner');
    expect(held.stdout).toContain('for the owner — pass this on in these words:');
    expect(held.stdout).toContain('is ready to merge into your code');
    expect(held.stdout).toContain('from GitHub account solver');
    expect(held.stdout).toContain('Nothing has been merged yet');
    expect(held.stdout).toContain('May it be merged?');
    expect(held.stdout).toContain(`box bounty allow ${id}`);
    const waiting = loadRecord(repo, id).waiting;
    expect(waiting?.for).toBe('merge');
    expect(waiting?.merge).toMatchObject({ n: 1, commit: prSha, head: headBefore });
    // The hold changed nothing: HEAD and every tracked file are exactly as
    // before (untracked .box/ and TASK.md are the world's, not the merge's).
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(git(repo, ['status', '--porcelain']).split('\n').filter(line => !line.startsWith('??'))).toEqual([]);
    const released = cli(repo, 'allow', id);
    expect(released.status).toBe(0);
    expect(released.stdout).toContain('answered once');
    expect(released.stdout).toContain('merged as');
    expect(git(repo, ['merge-base', '--is-ancestor', prSha, 'HEAD'])).toBe('');
    const applied = loadRecord(repo, id);
    expect(applied.stage).toBe('applied');
    expect(applied.events.at(-1)).toMatchObject({ command: 'apply' });
    expect(applied.events.at(-1)?.unasked).toBeUndefined();
  }));

  it('the answer is bound — a moved branch asks again, and a stale allow changes nothing', () => fixture(({ repo, id, scratch, pr }) => {
    askWorld(scratch);
    refused(() => postBounty(repo, id, 'github'), 'owner-answer-needed');
    allowBounty(repo, id);
    pr('solver');
    refused(() => applyBounty(repo, id, 1), 'merge-held');
    write(repo, 'moved.txt', 'the owner moved on\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'moved']);
    refused(() => allowBounty(repo, id), 'merge-approval-stale');
    expect(loadRecord(repo, id).stage).toBe('waiting');
    // A fresh apply re-binds the new tip; the owner answers that instead.
    refused(() => applyBounty(repo, id, 1), 'merge-held');
    const merged = allowBounty(repo, id);
    expect(merged).toContain('merged as');
    expect(loadRecord(repo, id).stage).toBe('applied');
  }));

  it('a record naming a different bound commit is stale — the owner was never shown it', () => fixture(({ repo, id, scratch, pr }) => {
    askWorld(scratch);
    refused(() => postBounty(repo, id, 'github'), 'owner-answer-needed');
    allowBounty(repo, id);
    pr('solver');
    refused(() => applyBounty(repo, id, 1), 'merge-held');
    const record = JSON.parse(readRecordRaw(repo, id));
    record.waiting.merge.commit = 'f'.repeat(40);
    writeRecordRaw(repo, id, JSON.stringify(record));
    refused(() => allowBounty(repo, id), 'merge-approval-stale');
    expect(loadRecord(repo, id).stage).toBe('waiting');
  }));

  it('an edited record cannot mark a merge approved — the owner answer lives outside the repository', () => fixture(({ repo, id, scratch, pr }) => {
    askWorld(scratch);
    refused(() => postBounty(repo, id, 'github'), 'owner-answer-needed');
    allowBounty(repo, id);
    const prSha = pr('solver');
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    refused(() => applyBounty(repo, id, 1), 'merge-held');
    // Forge everything a record could carry: an answered marker on the
    // wait, an applied stage, whatever the file shape allows.
    const record = JSON.parse(readRecordRaw(repo, id));
    record.waiting.answered = { at: new Date().toISOString(), merge: { n: 1, commit: prSha, head: headBefore } };
    writeRecordRaw(repo, id, JSON.stringify(record));
    try { applyBounty(repo, id, 1); expect.unreachable('expected a refusal'); }
    catch (error) { expect(String((error as Error).message)).toContain('waiting for the owner'); }
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(headBefore);
    const after = loadRecord(repo, id);
    expect(after.stage).toBe('waiting');
    expect(after.waiting?.answered).toBeUndefined(); // the forge is scrubbed too
  }));

  it('nothing an agent passes marks a merge approved', () => fixture(({ repo, id, scratch, pr }) => {
    askWorld(scratch);
    refused(() => postBounty(repo, id, 'github'), 'owner-answer-needed');
    allowBounty(repo, id);
    pr('solver');
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    for (const flag of ['--approved', '--yes', '--allow', '--owner-asked', '--force', '--ok']) {
      const run = cli(repo, 'apply', id, '1', flag);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('merge-approval-agent');
    }
    const bare = cli(repo, 'apply', id, '--yes');
    expect(bare.status).toBe(3);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(loadRecord(repo, id).stage).toBe('posted');
    // An approval-shaped flag is refused before any wait is written too:
    // the record still shows the posted stage, untouched.
    expect(loadRecord(repo, id).waiting).toBeUndefined();
  }));

  it('a hand merge while a merge waits still closes the bounty — and says the owner was not asked', () => fixture(({ repo, id, scratch, pr }) => {
    askWorld(scratch);
    refused(() => postBounty(repo, id, 'github'), 'owner-answer-needed');
    allowBounty(repo, id);
    const prSha = pr('solver');
    refused(() => applyBounty(repo, id, 1), 'merge-held');
    // The agent merges with its own Git — closing never waits.
    git(repo, ['merge', '--no-ff', '-m', 'hand merge', prSha]);
    const status = cli(repo, 'status', id);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain('the owner was not asked before this merge');
    const record = loadRecord(repo, id);
    expect(record.stage).toBe('applied');
    expect(record.events.at(-1)).toMatchObject({ command: 'merged', unasked: true });
    const ended = cli(repo, 'status');
    expect(ended.stdout).toContain('the owner was not asked before the merge');
  }));

  it('a hand merge under ask without any wait is also stated as not asked', () => postedFixture(({ repo, id, scratch, waitingPr }) => {
    askWorld(scratch);
    lookBounty(repo, id, 1); // collecting brings the commit into this repo
    git(repo, ['merge', '--no-ff', '-m', 'hand merge', waitingPr]);
    const status = cli(repo, 'status');
    expect(status.stdout).toContain('the owner was not asked before this merge');
    expect(status.stdout).toContain('the owner was not asked before the merge');
    expect(loadRecord(repo, id).events.at(-1)).toMatchObject({ command: 'merged', unasked: true });
  }));

  it('closing a merge-held bounty never waits', () => fixture(({ repo, id, scratch, pr }) => {
    askWorld(scratch);
    refused(() => postBounty(repo, id, 'github'), 'owner-answer-needed');
    allowBounty(repo, id);
    pr('solver');
    refused(() => applyBounty(repo, id, 1), 'merge-held');
    const outcome = closeBounty(repo, id);
    expect(outcome.outcome).toBe('withdrawn');
    expect(loadRecord(repo, id).waiting).toBeUndefined();
  }));
});

describe('messages meant for the owner', () => {
  it('first use carries the whole choice — including what ask means for merges', () => fixture(({ repo, id, scratch }) => {
    worldSettings(scratch, {}); // nothing written — the first use
    const held = cli(repo, 'post', id, '--to', 'github');
    expect(held.status).toBe(0);
    expect(held.stdout).toContain('for the owner — pass this on in these words:');
    expect(held.stdout).toContain('posted publicly on GitHub');
    expect(held.stdout).toContain('under your GitHub account');
    expect(held.stdout).toContain('this repository only');
    expect(held.stdout).toContain('merged into your code');
    expect(held.stdout).toContain('you will not be asked before a post or a merge');
    expect(held.stdout).toContain('you will be asked before each post and before each merge');
    expect(held.stdout).toContain('Do you allow this?');
    // The agent's mapping stays outside the owner block.
    const block = held.stdout.slice(held.stdout.indexOf('for the owner — pass'), held.stdout.indexOf('for you —'));
    expect(block).not.toContain('box bounty');
    expect(block).not.toMatch(/[0-9a-f]{12,}/); // no hashes
    expect(block).not.toMatch(/\bgit\b|\bcommit\b|\bmerge --|\bpush\b/i);
    expect(loadRecord(repo, id).waiting?.for).toBe('post');
  }));

  it('a waiting post under ask asks the one question in plain words', () => fixture(({ repo, id, scratch }) => {
    askWorld(scratch);
    const held = cli(repo, 'post', id, '--to', 'github');
    expect(held.status).toBe(0);
    expect(held.stdout).toContain('for the owner — pass this on in these words:');
    expect(held.stdout).toContain('is ready to post publicly on GitHub under your account');
    expect(held.stdout).toContain('may this one be posted? A yes or no is enough');
    expect(held.stdout).toContain(`box bounty allow ${id}`);
  }));

  it('the secret-scan hold tells the owner what was found, where, that nothing was published, and their choices', () => fixture(({ repo, id, scratch }) => {
    plantSecret(repo);
    const held = cli(repo, 'post', id, '--to', 'github');
    if (held.status !== 0) console.log('STDERR:', held.stderr);
    expect(held.status).toBe(0); // publish-held prints on stdout with exit 0
    expect(held.stdout).toContain('for the owner — pass this on in these words:');
    expect(held.stdout).toContain('looks like a password or key: file config/creds.txt');
    expect(held.stdout).toContain('Nothing has been published');
    expect(held.stdout).toContain('which do you want?');
    expect(held.stdout).toContain('safe-to-publish');
    expect(loadRecord(repo, id).waiting?.reason).toBe('secrets');
    // The value itself is never echoed — file and line are named, never the secret.
    expect(held.stdout).not.toContain(secretValue);
  }));

  it('a safe-listed scan does not headline "clean"', () => fixture(({ repo, id, scratch }) => {
    plantSecret(repo);
    changePublishList(repo, 'safe-to-publish', 'add', 'config/creds.txt');
    const preview = cli(repo, 'post', id, '--to', 'github', '--preview');
    expect(preview.status).toBe(0);
    expect(preview.stdout).toContain('Pre-publish scan: 1 secret-shaped hit(s) sit on paths the owner listed safe to publish — not held');
    expect(preview.stdout).not.toContain('Pre-publish scan: clean');
  }));

  it('a partial merge names the files the merge left as they were in the pay message', () => fixture(({ repo, id, scratch, pr, update, state }) => {
    worldSettings(scratch, { repositories: { 'owner/project': { ...ASK, bounty: 'allowed', reward: { amount: 5, at: '2026-10-13T00:00:00.000Z' }, rewardLimit: { amount: 20, at: '2026-10-13T00:00:00.000Z' } } } });
    postBounty(repo, id, 'github');
    const prSha = pr('solver', { 'new-file.txt': 'the solver added this\n' });
    update({ prs: state().prs.map(one => ({ ...one, body: 'pay-to: https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00' })) });
    lookBounty(repo, id, 1);
    // The agent keeps none of the solver's files — a merge that lands the
    // solution's commit but not its content.
    git(repo, ['merge', '--no-ff', '-s', 'ours', '-m', 'hand merge, keeping none', prSha]);
    const status = cli(repo, 'status');
    expect(status.status).toBe(0);
    expect(status.stdout).toContain('for the owner — pass this on in these words:');
    expect(status.stdout).toContain('The bounty "Repair app" ended with a solution merged into your code');
    expect(status.stdout).toContain('Pay solver at https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00');
    expect(status.stdout).toContain('Of the files the solution changed, the merge left these as they were: app.txt, new-file.txt');
    const event = loadRecord(repo, id).events.at(-1);
    expect(event).toMatchObject({ command: 'merged', partial: ['app.txt', 'new-file.txt'] });
    expect(event?.unasked).toBeUndefined(); // allowed — the owner waived asking
  }));
});

describe('a pre-wave ask keeps its meaning, and is told once', () => {
  it('an ask written before ask covered merges gets the once-only notice', () => fixture(({ repo, scratch }) => {
    askWorld(scratch); // hand-written bytes — no askMergeNoticeAt marker
    const first = cli(repo, 'status');
    expect(first.stdout).toContain('ask me each time: it now covers merges too');
    const second = cli(repo, 'status');
    expect(second.stdout).not.toContain('it now covers merges');
  }));

  it('an ask the tool wrote is told already — no notice', () => fixture(({ repo, scratch }) => {
    worldSettings(scratch, {});
    const ask = cli(repo, 'allow', '--ask');
    expect(ask.status).toBe(0);
    const status = cli(repo, 'status');
    expect(status.stdout).not.toContain('it now covers merges');
  }));
});
