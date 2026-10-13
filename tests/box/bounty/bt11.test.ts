// BT11a — the owner's reward and the limit on what open bounties promise.
// The agent is asked nothing about money: create/post take no amount flag, a
// project file claiming a reward is refused by name, and the amount bound at
// posting lives on the record — never taken from anything an agent wrote.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { BountyRefused, changeConfig, closeBounty, finalizeBounty, loadRecord, planBounty, postBounty, readReward, renderConfig, renderDescribe, renderStatus } from '../../../packages/box-bounty/index.js';
import { readFormat } from '../../../packages/box-bounty/format.js';
import { fixture, refused } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, ownerSays, runRoot, write } from './support.js';

const cli = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8', timeout: 60000 });
const draft = (repo: string, title?: string): { id: string; outDir: string } =>
  finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'stuck', ...(title === undefined ? {} : { title }), outDir: join(runRoot('out'), 'bounty') }));

describe('BT11a — the owner\'s two reward settings', () => {
  it('refuses every amount that is not a whole number of dollars at or above 0', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    for (const value of ['2.5', '-1', '$5', 'five', '1e3', '0x10', '5 ']) {
      refused(() => changeConfig(repo, 'set', 'reward', value), 'reward-amount-invalid');
      refused(() => changeConfig(repo, 'set', 'reward-limit', value), 'reward-amount-invalid');
    }
    expect(readReward()).toEqual({ amount: 0, limit: null });
  });

  it('a reward above $0 needs the limit first; the limit cannot sit below the reward', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    refused(() => changeConfig(repo, 'set', 'reward', '5'), 'reward-needs-limit');
    expect(readReward()).toEqual({ amount: 0, limit: null });
    expect(changeConfig(repo, 'set', 'reward-limit', '30')).toContain('reward limit: $30');
    // The first amount above $0 gets the plain-words statement — once ever.
    const first = changeConfig(repo, 'set', 'reward', '5');
    expect(first).toContain('a promise, made in your name, that you pay by hand');
    expect(changeConfig(repo, 'set', 'reward', '6')).not.toContain('promise, made in your name');
    refused(() => changeConfig(repo, 'set', 'reward-limit', '4'), 'limit-below-reward');
    refused(() => changeConfig(repo, 'set', 'reward', '50'), 'reward-needs-limit');
    expect(readReward()).toEqual({ amount: 6, limit: 30 });
    expect(changeConfig(repo, 'set', 'reward', '0')).toContain('reward: $0'); // back to no payment, no limit needed
  });

  it('bare config shows the reward, the limit, the promised total and what is left', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    const bare = renderConfig(repo);
    expect(bare).toContain('reward: $0');
    expect(bare).toContain('reward limit: not set');
    expect(bare).toContain('box bounty config set reward <whole dollars>');
    expect(bare).toContain('box bounty config set reward-limit <whole dollars>');
    expect(bare).toContain('promised across this repository\'s open bounties: $0');
    changeConfig(repo, 'set', 'reward-limit', '20');
    changeConfig(repo, 'set', 'reward', '5');
    const full = renderConfig(repo);
    expect(full).toContain('reward: $5');
    expect(full).toContain('reward limit: $20');
    expect(full).toContain('promised across this repository\'s open bounties: $0 of a $20 limit — $20 left');
  });
});

describe('BT11a — posting binds the amount in force', () => {
  it('a folder post binds the post-time amount and rewrites the delivered listing', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id, outDir } = draft(repo);
    expect(readFileSync(join(outDir, 'README.md'), 'utf8')).toContain('reward: $0');
    changeConfig(repo, 'set', 'reward-limit', '50');
    changeConfig(repo, 'set', 'reward', '12');
    const { destination } = postBounty(repo, id, runRoot('inbox'));
    const shipped = readFileSync(join(destination, 'README.md'), 'utf8');
    expect(shipped).toContain('reward: $12');
    expect(shipped).toContain('payment is the poster\'s to make by hand — posting an answer does not guarantee it.');
    expect(shipped).not.toContain('reward: $0');
    // The record's copy of the listing says the same — the two never disagree.
    expect(readFileSync(join(outDir, 'README.md'), 'utf8')).toContain('reward: $12');
    const record = loadRecord(repo, id);
    expect(record.reward).toEqual({ amount: 12 });
    // bounty.json is untouched: the sha256 binding the answer still holds.
    expect(createHash('sha256').update(readFileSync(join(destination, 'bounty.json'))).digest('hex')).toBe(record.manifestSha256);
  });

  it('a post that would pass the limit is refused by name, states both numbers and changes nothing', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const first = draft(repo, 'one');
    const second = draft(repo, 'two');
    changeConfig(repo, 'set', 'reward-limit', '15');
    changeConfig(repo, 'set', 'reward', '10');
    postBounty(repo, first.id, runRoot('inbox-a'));
    expect(loadRecord(repo, first.id).reward?.amount).toBe(10);
    const before = readFileSync(join(repo, '.box', 'bounties', `${second.id}.json`), 'utf8');
    try {
      postBounty(repo, second.id, runRoot('inbox-b'));
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
    closeBounty(repo, first.id);
    postBounty(repo, second.id, runRoot('inbox-c'));
    expect(loadRecord(repo, second.id).reward?.amount).toBe(10);
  });

  it('records written before this wave read as $0 and still post', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id } = draft(repo);
    const path = join(repo, '.box', 'bounties', `${id}.json`);
    const record = JSON.parse(readFileSync(path, 'utf8'));
    expect(record.reward).toBeUndefined(); // create binds nothing
    const { destination } = postBounty(repo, id, runRoot('inbox'));
    expect(loadRecord(repo, id).reward).toEqual({ amount: 0 });
    expect(readFileSync(join(destination, 'README.md'), 'utf8')).toContain('reward: $0');
  });

  it('status states the reward, the limit, what is promised and what is left', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id } = draft(repo);
    expect(renderStatus(repo)).toContain('each new bounty states $0 — no payment is promised');
    changeConfig(repo, 'set', 'reward-limit', '30');
    changeConfig(repo, 'set', 'reward', '10');
    postBounty(repo, id, runRoot('inbox'));
    const status = renderStatus(repo);
    expect(status).toContain('each new bounty states $10');
    expect(status).toContain('promise $10 of a $30 limit — $20 left');
  });
});

describe('BT11a — the agent is asked nothing about money', () => {
  it('create and post take no amount flag — each spelling is a named refusal', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    for (const flag of ['--reward', '--amount', '--price', '--pay', '--payment', '--limit', '--budget', '--dollars']) {
      const run = cli(repo, ['bounty', 'create', '--task', 'TASK.md', '--why', 'stuck', '--out', join(runRoot('o'), 'b'), flag, '5']);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('reward-agent-set');
    }
    const { id } = draft(repo);
    for (const flag of ['--reward', '--amount', '--limit']) {
      const run = cli(repo, ['bounty', 'post', id, '--to', join(runRoot('p'), 'x'), flag, '50']);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('reward-agent-set');
    }
    expect(loadRecord(repo, id).stage).toBe('drafted'); // nothing was posted
  });

  it('a project file claiming a reward or a limit is refused by name and grants nothing', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n', '.box/settings.json': '{"reward": 50}\n' });
    refused(() => planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'stuck', outDir: join(runRoot('o'), 'b') }), 'project-claims-reward');
    const repo2 = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo2, 'allowed');
    const { id } = draft(repo2);
    write(repo2, 'settings.json', '{"rewardLimit": 500}\n');
    refused(() => postBounty(repo2, id, runRoot('inbox')), 'project-claims-reward');
    expect(readReward()).toEqual({ amount: 0, limit: null }); // the claim granted nothing
  });

  it('a record carrying a malformed reward reads as corrupt, not as an amount', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id } = draft(repo);
    postBounty(repo, id, runRoot('inbox'));
    const path = join(repo, '.box', 'bounties', `${id}.json`);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), reward: { amount: 0.5 } }, null, 2) + '\n');
    refused(() => loadRecord(repo, id), 'record-corrupt');
  });
});

describe('BT11a — the public side and the words around it', () => {
  it('posts the owner\'s amount in the listing and the v2 block', () => fixture(({ repo, id, state }) => {
    changeConfig(repo, 'set', 'reward-limit', '100');
    changeConfig(repo, 'set', 'reward', '25');
    postBounty(repo, id, 'github');
    const body = state().issues[0]!.body;
    expect(body).toContain('reward: $25');
    expect(body).toContain('payment is the poster\'s to make by hand — posting an answer does not guarantee it.');
    const read = readFormat(body);
    if (read.kind !== 'present') throw new Error('format missing');
    expect(read.value.schemaVersion).toBe(2);
    expect(read.value.reward).toEqual({ amount: 25, currency: 'USD' });
    expect(loadRecord(repo, id).reward).toEqual({ amount: 25 });
  }));

  it('a GitHub post that would pass the limit refuses by name and sends nothing', () => fixture(({ repo, id, state }) => {
    changeConfig(repo, 'set', 'reward-limit', '15');
    changeConfig(repo, 'set', 'reward', '10');
    // A folder post already promises $10 of the $15 — this issue would take it to $20.
    const second = draft(repo, 'other');
    postBounty(repo, second.id, runRoot('inbox'));
    refused(() => postBounty(repo, id, 'github'), 'promise-limit-exceeded');
    expect(state().issues).toEqual([]);
    expect(loadRecord(repo, id).github).toBeUndefined();
    expect(loadRecord(repo, id).reward).toBeUndefined();
    expect(loadRecord(repo, id).stage).toBe('drafted');
  }));

  it('describe generates its money sentence from the setting', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
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
    const run = cli(repo, ['bounty', 'post', id, '--to', join(runRoot('x'), 'y')]);
    expect(run.status).toBe(0); // a held post prints the owner lines and exits 0
    expect(run.stdout).toContain('waiting for the owner');
    expect(run.stdout).toContain('reward the owner has set — $0');
    expect(run.stdout).toContain('box bounty config set reward <whole dollars>');
  });

  it('an owner whose settings predate the wave is told once that a reward can now be set', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const first = renderStatus(repo);
    expect(first).toContain('bounties can now state a reward');
    expect(first).toContain('box bounty config set reward <whole dollars>');
    expect(renderStatus(repo)).not.toContain('bounties can now state a reward'); // once ever
    // Fresh settings are not told at all — first use already carries the fact.
    const fresh = runRoot('fresh-owner');
    const saved = process.env['BOX_BOUNTY_SETTINGS_DIR'];
    process.env['BOX_BOUNTY_SETTINGS_DIR'] = fresh;
    try { expect(renderConfig(null)).not.toContain('bounties can now state a reward'); }
    finally { process.env['BOX_BOUNTY_SETTINGS_DIR'] = saved!; }
  });

  it('allow states the reward each bounty will carry and how to set it', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/thing.git']);
    const run = cli(repo, ['bounty', 'allow']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('reward you have set — $0');
    expect(run.stdout).toContain('config set reward');
  });
});

describe('BT11a fix round — the record file is never a render source', () => {
  it('post → the record\'s reward rewritten → close keeps the bound amount in the listing and the block', () => fixture(({ repo, id, state }) => {
    changeConfig(repo, 'set', 'reward-limit', '200');
    changeConfig(repo, 'set', 'reward', '50');
    postBounty(repo, id, 'github');
    // The pass's attack, replayed: `.box/bounties/<id>.json` is agent-editable
    // — the bound summary is rewritten between post and close.
    const path = join(repo, '.box', 'bounties', `${id}.json`);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), reward: { amount: 99999 } }, null, 2) + '\n');
    closeBounty(repo, id);
    const body = state().issues[0]!.body;
    // Listing text and block state the one bound amount — the forged field
    // reached neither.
    expect(body).toContain('reward: $50');
    expect(body).not.toContain('99999');
    const read = readFormat(body);
    if (read.kind !== 'present') throw new Error('format missing');
    expect(read.value.schemaVersion).toBe(2);
    expect(read.value.reward).toEqual({ amount: 50, currency: 'USD' });
    expect(read.value.state).toEqual({ kind: 'closed-none' });
  }));

  it('a forged-down summary cannot shrink what an open bounty promises', () => fixture(({ repo, id }) => {
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
    const { id, outDir } = draft(repo);
    changeConfig(repo, 'set', 'reward-limit', '50');
    changeConfig(repo, 'set', 'reward', '12');
    const before = readFileSync(join(outDir, 'README.md'), 'utf8');
    // A lock already held is the other post's bind in flight — this one
    // waits it out, then refuses by name rather than guessing.
    mkdirSync(join(repo, '.box', 'promise.lock'));
    refused(() => postBounty(repo, id, runRoot('inbox')), 'promise-limit-busy');
    expect(readFileSync(join(outDir, 'README.md'), 'utf8')).toBe(before); // a refused post changed nothing
    expect(loadRecord(repo, id).stage).toBe('drafted');
    rmSync(join(repo, '.box', 'promise.lock'), { recursive: true });
    const { destination } = postBounty(repo, id, runRoot('inbox'));
    expect(readFileSync(join(destination, 'README.md'), 'utf8')).toContain('reward: $12');
  }, 15000);

  it('a refused folder post leaves the draft README untouched', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    ownerSays(repo, 'allowed');
    const { id, outDir } = draft(repo);
    const before = readFileSync(join(outDir, 'README.md'), 'utf8');
    changeConfig(repo, 'set', 'reward-limit', '50');
    changeConfig(repo, 'set', 'reward', '12');
    const blocked = join(runRoot('blocked'), 'file');
    writeFileSync(blocked, 'in the way\n');
    refused(() => postBounty(repo, id, blocked), 'destination-exists');
    // Before the fix the draft's stated amount was rewritten to $12 anyway.
    expect(readFileSync(join(outDir, 'README.md'), 'utf8')).toBe(before);
    expect(loadRecord(repo, id).reward).toBeUndefined();
    expect(loadRecord(repo, id).stage).toBe('drafted');
  });
});
