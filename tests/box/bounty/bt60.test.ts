// BT60: every bounty pays: none is posted at $0. The tool refuses a post whose repository's reward is under the minimum,
// by name, before anything reaches GitHub; a draft can still be made. The one exception is the testing allowance
// (BOX_BOUNTY_ALLOW_ZERO_FOR_TESTING=1), read in one function. tests/box/bounty/support.ts sets it for the whole suite so
// every other test that posts at $0 runs as before; these tests remove it in beforeEach.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allowRepository, boundAmount, changeConfig, loadRecord, postBounty, previewGitHub, renderConfig, renderDescribe, renderHelp, renderOverview, renderStatus } from '../../../packages/box-bounty/index.js';
import { MINIMUM_REWARD_USD, readFormat } from '../../../packages/box-bounty/format.js';
import { fixture, refused, type GithubFixture } from './github-fixture.js';
import { git, makeRepo, readRecordRaw } from './support.js';

const ALLOW = 'BOX_BOUNTY_ALLOW_ZERO_FOR_TESTING';
let before: string | undefined;
beforeEach(() => { before = process.env[ALLOW]; delete process.env[ALLOW]; });
afterEach(() => { if (before === undefined) delete process.env[ALLOW]; else process.env[ALLOW] = before; });

const settingsPath = (world: GithubFixture): string => join(world.scratch, 'settings', 'settings.json');
// The owner's settings with one repository entry carrying the given reward, by hand (a hand-edited file).
const writeReward = (world: GithubFixture, reward: number): void => {
  const at = '2026-11-01T00:00:00.000Z';
  mkdirSync(join(world.scratch, 'settings'), { recursive: true });
  writeFileSync(settingsPath(world), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': { bounty: 'allowed', at, changes: [], reward: { amount: reward, at }, ...(reward > 0 ? { rewardLimit: { amount: reward, at } } : {}) } } }, null, 2) + '\n');
};
const nothingReached = (world: GithubFixture): void => {
  expect(world.state().issues, 'an issue reached GitHub').toEqual([]);
  expect(git(world.bare, ['for-each-ref', '--format=%(refname)']).split('\n').filter(line => line !== '').filter(ref => ref.includes(world.id)), 'a ref reached the remote').toEqual([]);
};

describe('BT60: no bounty is posted without a reward', () => {
  it('1. a repository allowed with no reward: post is refused by name, nothing reaches GitHub, the record is unchanged', () => fixture(world => {
    const before = JSON.stringify(readRecordRaw(world.repo, world.id));
    refused(() => postBounty(world.repo, world.id, 'github'), 'reward-required');
    nothingReached(world);
    expect(loadRecord(world.repo, world.id).stage).toBe('drafted');
    expect(JSON.stringify(readRecordRaw(world.repo, world.id))).toBe(before);
  }));

  it('2. the same for post --preview: refused before GitHub is asked anything', () => fixture(world => {
    const calls = world.state().calls.length;
    refused(() => previewGitHub(world.repo, world.id), 'reward-required');
    expect(world.state().calls.length, 'a gh call was made').toBe(calls);
  }));

  it('3. a reward of the minimum with a limit posts, and the issue states it', () => fixture(world => {
    allowRepository(world.repo, undefined, false, { reward: String(MINIMUM_REWARD_USD), rewardLimit: String(MINIMUM_REWARD_USD) });
    postBounty(world.repo, world.id, 'github');
    const record = loadRecord(world.repo, world.id);
    expect(record.stage).toBe('posted');
    expect(boundAmount(record)).toBe(MINIMUM_REWARD_USD);
    expect(world.state().issues).toHaveLength(1);
    const block = readFormat(world.state().issues[0]!.body);
    expect(block.kind === 'present' ? block.value.reward.amount : null).toBe(MINIMUM_REWARD_USD);
  }));

  it('4. a hand-edited settings file: -1 and 0.5 are refused as a malformed file, 0 refuses reward-required at post', () => fixture(world => {
    for (const amount of [-1, 0.5]) {
      writeReward(world, amount);
      refused(() => postBounty(world.repo, world.id, 'github'), 'settings-malformed');
      nothingReached(world);
    }
    writeReward(world, 0);
    refused(() => postBounty(world.repo, world.id, 'github'), 'reward-required');
    nothingReached(world);
  }));

  it('5. a reward set, a draft already made, then the reward set to 0: post is refused', () => fixture(world => {
    allowRepository(world.repo, undefined, false, { reward: '5', rewardLimit: '5' });
    changeConfig(world.repo, 'set', 'reward', '0');
    refused(() => postBounty(world.repo, world.id, 'github'), 'reward-required');
    nothingReached(world);
  }));

  it('6. create with no reward still makes a draft', () => fixture(world => {
    expect(loadRecord(world.repo, world.id).stage).toBe('drafted');
  }));

  it('7. with the testing allowance a $0 post goes through', () => fixture(world => {
    process.env[ALLOW] = '1';
    postBounty(world.repo, world.id, 'github');
    expect(loadRecord(world.repo, world.id).stage).toBe('posted');
    expect(world.state().issues).toHaveLength(1);
    expect(boundAmount(loadRecord(world.repo, world.id))).toBe(0);
  }));

  it('7b. the allowance is exactly the value 1, and nothing else lets a $0 post through', () => fixture(world => {
    for (const value of ['0', 'true', 'yes', '']) {
      process.env[ALLOW] = value;
      refused(() => postBounty(world.repo, world.id, 'github'), 'reward-required');
    }
    nothingReached(world);
  }));

  it('8. help, describe, config, the overview and allow\'s lines never say a bounty states $0 and say a reward is needed', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/shop.git']);
    const allowed = JSON.stringify(allowRepository(repo));
    const texts: Record<string, string> = { help: renderHelp(), describe: renderDescribe(repo), config: renderConfig(repo, { full: true }), overview: renderOverview(repo), allow: allowed, status: renderStatus(repo) };
    for (const [name, text] of Object.entries(texts)) expect(text, `${name} says a bounty states $0`).not.toMatch(/states? (a reward of )?\$0/);
    // each place that talks about a repository with no reward says one is needed, and names no amount to pick
    for (const name of ['describe', 'allow']) expect(texts[name]!.toLowerCase(), name).toContain('not posted without');
    for (const [name, text] of Object.entries(texts)) expect(text, `${name} suggests an amount`).not.toMatch(/for example \$\d|e\.g\. \$\d|such as \$\d/i);
    // the testing allowance is stated once, in help
    expect(texts['help']).toContain('for testing the tool; such a bounty is never listed');
  });
});
