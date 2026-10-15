import { postToGitHub, collectPullRequest, applyGitHub, closeGitHub, statusGitHub } from './github-solver.js';
// BT11a — the owner's reward and the limit on what open bounties promise —
// and BT11c, which moved both onto each repository's own entry: one reward
// and one limit per repository on the owner's list, $0 unless the owner named
// otherwise for that repository, and never the shared setting again. The
// agent is asked nothing about money: create/post take no amount flag, a
// project file claiming a reward is refused by name, and the amount bound at
// posting lives on the record — never taken from anything an agent wrote.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { allowRepository, BountyRefused, changeConfig, closeBounty, denyRepository, finalizeBounty, loadRecord, loadSettings, planBounty, postBounty, readReward, repoReward, renderConfig, renderDescribe, renderStatus, settingsFile } from '../../../packages/box-bounty/index.js';
import { readFormat } from '../../../packages/box-bounty/format.js';
import { fixture, refused } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, ownerSays, runRoot, write } from './support.js';

const cli = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8', timeout: 60000 });
const draft = (repo: string, title?: string): { id: string } =>
  finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'stuck', ...(title === undefined ? {} : { title }), }));

describe('BT11c — each repository carries its own reward and limit', () => {
  it('refuses every amount that is not a whole number of dollars at or above 0', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    for (const value of ['2.5', '-1', '$5', 'five', '1e3', '0x10', '5 ']) {
      refused(() => changeConfig(repo, 'set', 'reward', value), 'reward-amount-invalid');
      refused(() => changeConfig(repo, 'set', 'reward-limit', value), 'reward-amount-invalid');
    }
    // `allow` amounts answer to the same rule, as CLI options in the same
    // breath as the yes.
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/thing.git']);
    for (const value of ['2.5', '-1', '$5', 'five', '1e3']) {
      const run = cli(repo, ['bounty', 'allow', '--reward', value]);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('reward-amount-invalid');
      expect(run.stderr).toContain('nothing changed');
    }
    expect(repoReward(repo)).toEqual({ amount: 0, limit: null });
    expect(loadSettings().repositories['owner/thing']).toBeUndefined(); // a refused allow wrote nothing
  });

  it('a reward above $0 needs that repository\'s limit first; the limit cannot sit below the reward', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    refused(() => changeConfig(repo, 'set', 'reward', '5'), 'reward-needs-limit');
    expect(repoReward(repo)).toEqual({ amount: 0, limit: null });
    expect(changeConfig(repo, 'set', 'reward-limit', '30')).toContain('reward limit: $30');
    // The first amount above $0 gets the plain-words statement — once ever.
    const first = changeConfig(repo, 'set', 'reward', '5');
    expect(first).toContain('a promise, made in your name, that you pay by hand');
    expect(changeConfig(repo, 'set', 'reward', '6')).not.toContain('promise, made in your name');
    refused(() => changeConfig(repo, 'set', 'reward-limit', '4'), 'limit-below-reward');
    refused(() => changeConfig(repo, 'set', 'reward', '50'), 'reward-needs-limit');
    expect(repoReward(repo)).toEqual({ amount: 6, limit: 30 });
    expect(changeConfig(repo, 'set', 'reward', '0')).toContain('reward: $0'); // back to no payment, no limit needed
  });

  it('allow takes the reward and the limit in the same breath; with neither the repository states $0', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/shop.git']);
    const paid = cli(repo, ['bounty', 'allow', '--reward', '10', '--reward-limit', '30']);
    expect(paid.status).toBe(0);
    expect(paid.stdout).toContain('owner/shop');
    expect(paid.stdout).toContain('promises $10, which you pay by hand');
    expect(repoReward(repo)).toEqual({ amount: 10, limit: 30 });
    // A limit below the reward is a named refusal — and, after deny cleared
    // the money, a reward above $0 with no limit to hold it is one too.
    const before = readFileSync(settingsFile(), 'utf8');
    const under = cli(repo, ['bounty', 'allow', '--reward-limit', '4']);
    expect(under.status).toBe(3);
    expect(under.stderr).toContain('limit-below-reward');
    expect(readFileSync(settingsFile(), 'utf8')).toBe(before);
    // A bare re-allow keeps what the entry says; deny removes the entry and
    // its money with it, so the next allow states $0 again.
    allowRepository(repo);
    expect(repoReward(repo)).toEqual({ amount: 10, limit: 30 });
    const denied = denyRepository(repo);
    expect(denied).toContain('reward ($10) and limit ($30) went with the entry');
    const needsLimit = cli(repo, ['bounty', 'allow', '--reward', '10']);
    expect(needsLimit.status).toBe(3);
    expect(needsLimit.stderr).toContain('reward-needs-limit');
    allowRepository(repo);
    expect(repoReward(repo)).toEqual({ amount: 0, limit: null });
    const free = cli(repo, ['bounty', 'allow']);
    expect(free.stdout).toContain('states $0 — no payment is promised');
  });

  it('one repository\'s reward and limit never reach another', () => {
    const repoA = makeRepo({ 'TASK.md': 'task\n' });
    const repoB = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repoA, 'allowed');
    ownerSays(repoB, 'allowed');
    changeConfig(repoA, 'set', 'reward-limit', '30');
    changeConfig(repoA, 'set', 'reward', '10');
    expect(repoReward(repoA)).toEqual({ amount: 10, limit: 30 });
    expect(repoReward(repoB)).toEqual({ amount: 0, limit: null });
    // A bounty posted on B states $0 while A promises $10 — and B's open
    // bounties owe nothing to A's limit.
    const { id } = draft(repoB);
    const { destination } = postToGitHub(repoB, id);
    expect(loadRecord(repoB, id).reward).toEqual({ amount: 0 });
    expect(loadRecord(repoB, id).github!.body).toContain('reward: $0');
    // Compact status stays silent on a bare $0 (BT17); the full view states
    // it, and neither surface ever names A's $10 on B.
    expect(statusGitHub(repoB)).not.toContain('$10');
    expect(statusGitHub(repoB, { full: true })).toContain('each new bounty states $0');
    expect(statusGitHub(repoA)).toContain('each new bounty states $10');
  });

  it('a repository reached only through all-projects states $0 and cannot be paid on', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/wide.git']);
    changeConfig(repo, 'set', 'all-projects', 'true');
    expect(repoReward(repo)).toEqual({ amount: 0, limit: null });
    refused(() => changeConfig(repo, 'set', 'reward', '5'), 'reward-repository-unlisted');
    refused(() => changeConfig(repo, 'set', 'reward-limit', '5'), 'reward-repository-unlisted');
    // The all-projects extra itself can never carry a reward.
    refused(() => changeConfig(repo, 'set', 'reward', '5', undefined, 'all-projects'), 'reward-all-projects');
    expect(loadSettings().default?.reward).toBeUndefined();
    // The same named refusals land for a repository nobody listed.
    refused(() => changeConfig(repo, 'set', 'reward', '5', undefined, 'owner/nolist'), 'reward-repository-unlisted');
    expect(loadSettings().repositories['owner/nolist']).toBeUndefined();
  });

  it('config set writes a named repository without entering its checkout', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed'); // lists tests/<dir>, the checkout's own address
    allowRepository(null, 'owner/shop');
    expect(changeConfig(repo, 'set', 'reward-limit', '30', undefined, 'owner/shop')).toContain('owner/shop reward limit: $30');
    expect(changeConfig(repo, 'set', 'reward', '10', undefined, 'owner/shop')).toContain('owner/shop reward: $10');
    expect(readReward('owner/shop')).toEqual({ amount: 10, limit: 30 });
    // This checkout's own repository is untouched — the named change reached
    // no other entry.
    expect(repoReward(repo)).toEqual({ amount: 0, limit: null });
    const run = cli(repo, ['bounty', 'config', 'set', 'reward', '3', 'owner/shop']);
    expect(run.status).toBe(0);
    expect(readReward('owner/shop')).toEqual({ amount: 3, limit: 30 });
  });

  it('bare config shows one line per repository: its decision, its reward, its limit and what its open bounties promise', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const bare = renderConfig(repo);
    const address = Object.keys(loadSettings().repositories)[0]!;
    expect(bare).toContain(`${address}: allowed`);
    expect(bare).toContain('reward $0, no limit set');
    expect(bare).toContain('open bounties here promise $0; no limit set');
    // The money explanations are the long form's (BT14).
    const bareFull = renderConfig(repo, { full: true });
    expect(bareFull).toContain('a repository with no reward written states $0');
    expect(bareFull).toContain('box bounty config set reward <whole dollars>');
    expect(bareFull).toContain('box bounty config set reward-limit <whole dollars>');
    changeConfig(repo, 'set', 'reward-limit', '20');
    changeConfig(repo, 'set', 'reward', '5');
    const full = renderConfig(repo);
    expect(full).toContain(`${address}: allowed`);
    expect(full).toContain('reward $5, limit $20');
    expect(full).toContain('open bounties here promise $0 of a $20 limit — $20 left');
    // Another listed repository's line carries its own numbers — and its
    // open-promise count stays in its own records, not read here.
    allowRepository(null, 'owner/elsewhere');
    changeConfig(null, 'set', 'reward-limit', '9', undefined, 'owner/elsewhere');
    changeConfig(null, 'set', 'reward', '9', undefined, 'owner/elsewhere');
    const table = renderConfig(repo);
    expect(table).toContain('owner/elsewhere: allowed');
    expect(table).toContain('reward $9, limit $9');
    expect(table).toContain("open-promise count lives in that repository's own records");
  });
});

describe('BT11c — the setting written before this wave applies to nothing', () => {
  it('a shared reward and limit retire on load, are told once, and reach no repository', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const address = Object.keys(loadSettings().repositories)[0]!;
    // The pre-BT11c file: one shared reward and limit above the list.
    const legacy = JSON.parse(readFileSync(settingsFile(), 'utf8'));
    legacy['reward'] = { amount: 5, at: '2026-10-14T00:00:00.000Z' };
    legacy['rewardLimit'] = { amount: 50, at: '2026-10-14T00:00:00.000Z' };
    writeFileSync(settingsFile(), JSON.stringify(legacy, null, 2) + '\n');
    expect(repoReward(repo)).toEqual({ amount: 0, limit: null }); // applied to nothing
    const first = renderConfig(repo);
    expect(first).toContain('a shared reward of $5 and a $50 limit');
    expect(first).toContain('states $0 until you set its own');
    expect(first).toContain('box bounty config set reward <whole dollars>');
    expect(renderConfig(repo)).not.toContain('a shared reward of $5'); // told once ever
    const migrated = JSON.parse(readFileSync(settingsFile(), 'utf8'));
    expect(migrated['reward']).toBeUndefined();
    expect(migrated['rewardLimit']).toBeUndefined();
    expect(migrated['retiredReward']).toBeDefined();
    // The repository's own entry still states $0 until the owner names one.
    expect(readReward(address)).toEqual({ amount: 0, limit: null });
  });

  it('open bounties keep the amount they were posted with', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    changeConfig(repo, 'set', 'reward-limit', '50');
    changeConfig(repo, 'set', 'reward', '12');
    const { id } = draft(repo);
    postToGitHub(repo, id);
    expect(loadRecord(repo, id).reward).toEqual({ amount: 12 });
    // Retire this repository's money as a pre-wave shared setting — the
    // bounty out there still promises $12 even though new ones now state $0.
    const settings = JSON.parse(readFileSync(settingsFile(), 'utf8'));
    const address = Object.keys(settings['repositories'])[0]!;
    delete settings['repositories'][address]['reward'];
    delete settings['repositories'][address]['rewardLimit'];
    settings['reward'] = { amount: 12, at: '2026-10-14T00:00:00.000Z' };
    settings['rewardLimit'] = { amount: 50, at: '2026-10-14T00:00:00.000Z' };
    writeFileSync(settingsFile(), JSON.stringify(settings, null, 2) + '\n');
    expect(repoReward(repo)).toEqual({ amount: 0, limit: null });
    expect(statusGitHub(repo)).toContain('open bounties here promise $12');
    const second = draft(repo, 'next');
    postToGitHub(repo, second.id);
    expect(loadRecord(repo, second.id).reward).toEqual({ amount: 0 });
  });
});

describe('BT11a — posting binds the amount in force', () => {

  it('a post that would pass the limit is refused by name, states both numbers and changes nothing', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const first = draft(repo, 'one');
    const second = draft(repo, 'two');
    changeConfig(repo, 'set', 'reward-limit', '15');
    changeConfig(repo, 'set', 'reward', '10');
    postToGitHub(repo, first.id);
    expect(loadRecord(repo, first.id).reward?.amount).toBe(10);
    const before = readFileSync(join(repo, '.box', 'bounties', `${second.id}.json`), 'utf8');
    try {
      postToGitHub(repo, second.id);
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      expect(error).toMatchObject({ reason: 'promise-limit-exceeded' });
      expect((error as Error).message).toContain('20'); // promised 10 + this 10
      expect((error as Error).message).toContain('15'); // the owner's limit
    }
    expect(readFileSync(join(repo, '.box', 'bounties', `${second.id}.json`), 'utf8')).toBe(before);
    expect(loadRecord(repo, second.id).stage).toBe('drafted');
    // A closed bounty stops counting — merged or not.
    closeGitHub(repo, first.id);
    postToGitHub(repo, second.id);
    expect(loadRecord(repo, second.id).reward?.amount).toBe(10);
  });

  it('records written before this wave read as $0 and still post', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id } = draft(repo);
    const path = join(repo, '.box', 'bounties', `${id}.json`);
    const record = JSON.parse(readFileSync(path, 'utf8'));
    expect(record.reward).toBeUndefined(); // create binds nothing
    const { destination } = postToGitHub(repo, id);
    expect(loadRecord(repo, id).reward).toEqual({ amount: 0 });
    expect(loadRecord(repo, id).github!.body).toContain('reward: $0');
  });

  it('status states the reward, the limit, what is promised and what is left', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id } = draft(repo);
    // A bare $0 with nothing promised is silent in the compact view (BT17);
    // the full view always states it.
    expect(statusGitHub(repo)).not.toContain('reward:');
    expect(statusGitHub(repo, { full: true })).toContain('each new bounty states $0');
    changeConfig(repo, 'set', 'reward-limit', '30');
    changeConfig(repo, 'set', 'reward', '10');
    postToGitHub(repo, id);
    const status = statusGitHub(repo);
    expect(status).toContain('each new bounty states $10');
    expect(status).toContain('promise $10 of a $30 limit — $20 left');
  });
});

describe('BT11a — the agent is asked nothing about money', () => {
  it('create and post take no amount flag — each spelling is a named refusal', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    for (const flag of ['--reward', '--amount', '--price', '--pay', '--payment', '--limit', '--budget', '--dollars']) {
      const run = cli(repo, ['bounty', 'create', '--task', 'TASK.md', '--why', 'stuck', flag, '5']);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('reward-agent-set');
    }
    const { id } = draft(repo);
    for (const flag of ['--reward', '--amount', '--limit']) {
      const run = cli(repo, ['bounty', 'post', id, flag, '50']);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('reward-agent-set');
    }
    expect(loadRecord(repo, id).stage).toBe('drafted'); // nothing was posted
  });

  it('a project file claiming a reward or a limit is refused by name and grants nothing', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n', '.box/settings.json': '{"reward": 50}\n' });
    refused(() => planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'stuck', }), 'project-claims-reward');
    const repo2 = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo2, 'allowed');
    const { id } = draft(repo2);
    write(repo2, 'settings.json', '{"rewardLimit": 500}\n');
    refused(() => postToGitHub(repo2, id), 'project-claims-reward');
    expect(repoReward(repo2)).toEqual({ amount: 0, limit: null }); // the claim granted nothing
  });

  it('a record carrying a malformed reward reads as corrupt, not as an amount', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id } = draft(repo);
    postToGitHub(repo, id);
    const path = join(repo, '.box', 'bounties', `${id}.json`);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), reward: { amount: 0.5 } }, null, 2) + '\n');
    refused(() => loadRecord(repo, id), 'record-corrupt');
  });
});

describe('BT11a — the public side and the words around it', () => {
  it('posts the owner\'s amount in the listing and the v2 block', () => fixture(({ repo, id, state }) => {
    allowRepository(repo); // the fixture world allows all-projects; money needs this repository named (BT11c)
    changeConfig(repo, 'set', 'reward-limit', '100');
    changeConfig(repo, 'set', 'reward', '25');
    postBounty(repo, id, 'github');
    const body = state().issues[0]!.body;
    expect(body).toContain('reward: $25');
    expect(body).toContain('payment is the poster\'s to make by hand — posting an answer does not guarantee it.');
    const read = readFormat(body);
    if (read.kind !== 'present') throw new Error('format missing');
    // v3 since BT11b: a rewarded post's block carries the payment member.
    expect(read.value.schemaVersion).toBe(3);
    expect(read.value.reward).toEqual({ amount: 25, currency: 'USD' });
    expect(loadRecord(repo, id).reward).toEqual({ amount: 25 });
  }));

  it('a GitHub post that would pass the limit refuses by name and sends nothing', () => fixture(({ repo, id, state }) => {
    allowRepository(repo);
    changeConfig(repo, 'set', 'reward-limit', '15');
    changeConfig(repo, 'set', 'reward', '10');
    // A folder post already promises $10 of the $15 — this issue would take it to $20.
    const second = draft(repo, 'other');
    postToGitHub(repo, second.id);
    refused(() => postBounty(repo, id, 'github'), 'promise-limit-exceeded');
    expect(state().issues).toEqual([]);
    expect(loadRecord(repo, id).github).toBeUndefined();
    expect(loadRecord(repo, id).reward).toBeUndefined();
    expect(loadRecord(repo, id).stage).toBe('drafted');
  }));

  it('describe generates its money sentence from the setting', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    expect(renderDescribe(repo)).toContain('a reward of $0 — no payment exists');
    changeConfig(repo, 'set', 'reward-limit', '40');
    changeConfig(repo, 'set', 'reward', '7');
    const text = renderDescribe(repo);
    expect(text).toContain('a reward of $7 — a promise in the owner\'s name, paid by hand');
    expect(text).toContain('posting an answer does not guarantee it');
    expect(text).toContain('every bounty states a reward of $7 — the owner pays it by hand');
  });

  it('the first-use message carries the reward fact as a fourth fact', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    const { id } = draft(repo);
    const run = cli(repo, ['bounty', 'post', id]);
    expect(run.status).toBe(0); // a held post prints the owner lines and exits 0
    expect(run.stdout).toContain('waiting for the owner');
    expect(run.stdout).toContain('Each bounty states what it pays — $0 unless you set an amount, so nothing is promised now.');
    expect(run.stdout).toContain('allow this repository: box bounty allow');
  });

  it('an owner whose settings predate the wave is told once that each repository can state its own reward', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const first = statusGitHub(repo);
    expect(first).toContain('each repository can state its own reward');
    expect(first).toContain('box bounty config set reward <whole dollars>');
    expect(statusGitHub(repo)).not.toContain('each repository can state its own reward'); // once ever
    // Fresh settings are not told at all — first use already carries the fact.
    const fresh = runRoot('fresh-owner');
    const saved = process.env['BOX_BOUNTY_SETTINGS_DIR'];
    process.env['BOX_BOUNTY_SETTINGS_DIR'] = fresh;
    try { expect(renderConfig(null)).not.toContain('each repository can state its own reward'); }
    finally { process.env['BOX_BOUNTY_SETTINGS_DIR'] = saved!; }
  });

  it('allow states the reward each bounty will carry and how to set it', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/thing.git']);
    const run = cli(repo, ['bounty', 'allow']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('states $0 — no payment is promised');
    expect(run.stdout).toContain('config set reward');
    const paid = cli(repo, ['bounty', 'allow', '--reward', '5', '--reward-limit', '20']);
    expect(paid.status).toBe(0);
    expect(paid.stdout).toContain('promises $5, which you pay by hand');
    expect(paid.stdout).toContain('at most $20 promised across its open bounties at once');
  });
});

describe('BT11a fix round — the record file is never a render source', () => {
  it('post → the record\'s reward rewritten → close keeps the bound amount in the listing and the block', () => fixture(({ repo, id, state }) => {
    allowRepository(repo);
    changeConfig(repo, 'set', 'reward-limit', '200');
    changeConfig(repo, 'set', 'reward', '50');
    postBounty(repo, id, 'github');
    // The pass's attack, replayed: `.box/bounties/<id>.json` is agent-editable
    // — the bound summary is rewritten between post and close.
    const path = join(repo, '.box', 'bounties', `${id}.json`);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), reward: { amount: 99999 } }, null, 2) + '\n');
    closeGitHub(repo, id);
    const body = state().issues[0]!.body;
    // Listing text and block state the one bound amount — the forged field
    // reached neither.
    expect(body).toContain('reward: $50');
    expect(body).not.toContain('99999');
    const read = readFormat(body);
    if (read.kind !== 'present') throw new Error('format missing');
    // v3 since BT11b: a rewarded post's block carries the payment member.
    expect(read.value.schemaVersion).toBe(3);
    expect(read.value.reward).toEqual({ amount: 50, currency: 'USD' });
    expect(read.value.state).toEqual({ kind: 'closed-none' });
  }));

  it('a forged-down summary cannot shrink what an open bounty promises', () => fixture(({ repo, id }) => {
    allowRepository(repo);
    changeConfig(repo, 'set', 'reward-limit', '60');
    changeConfig(repo, 'set', 'reward', '50');
    postBounty(repo, id, 'github'); // $50 promised of the $60 limit — $10 left
    const path = join(repo, '.box', 'bounties', `${id}.json`);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), reward: { amount: 0 } }, null, 2) + '\n');
    // The count reads the posted body's block — the bound $50 still fills the limit.
    const second = draft(repo, 'another');
    refused(() => postBounty(repo, second.id, 'github'), 'promise-limit-exceeded');
  }));

  it('a reward written onto a record that never posted reads corrupt, not as an amount', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id } = draft(repo);
    const path = join(repo, '.box', 'bounties', `${id}.json`);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), reward: { amount: 50 } }, null, 2) + '\n');
    refused(() => loadRecord(repo, id), 'record-corrupt');
  });

  it('the promise lock makes the limit check and the bind one span', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id } = draft(repo);
    changeConfig(repo, 'set', 'reward-limit', '50');
    changeConfig(repo, 'set', 'reward', '12');
    const before = readFileSync(join(repo, '.box/bounties', `${id}.json`), 'utf8');
    // A lock already held is the other post's bind in flight — this one
    // waits it out, then refuses by name rather than guessing.
    mkdirSync(join(repo, '.box', 'promise.lock'));
    refused(() => postToGitHub(repo, id), 'promise-limit-busy');
    expect(readFileSync(join(repo, '.box/bounties', `${id}.json`), 'utf8')).toBe(before); // a refused post changed nothing
    expect(loadRecord(repo, id).stage).toBe('drafted');
    rmSync(join(repo, '.box', 'promise.lock'), { recursive: true });
    const { destination } = postToGitHub(repo, id);
    expect(loadRecord(repo, id).github!.body).toContain('reward: $12');
  }, 15000);
});
