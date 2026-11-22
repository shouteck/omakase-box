// 0.4.1, poster friction 8: a poster is told how to choose a reward — a basis, never an amount — where the amount is asked
// for (bare omakase-box before setup), in help, and beside --reward.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHelp, renderOverview } from '../../../packages/box-bounty/index.js';
import { PRICING_BASIS, PRICING_LINE } from '../../../packages/box-bounty/wording.js';
import { fixture } from './github-fixture.js';
import { CLI_DIST } from './support.js';

describe('pricing guidance for posters', { timeout: 120000 }, () => {
  it('help gives the basis, what a change applies to and how the limit follows, and names no amount of its own', () => {
    const help = renderHelp();
    expect(help).toContain(PRICING_LINE);
    for (const words of ['the time a capable solver needs to understand, change and test the work', 'Only the solution you merge is paid', 'open bounties keep theirs', 'the reward times how many bounties may be open at once']) expect(PRICING_LINE).toContain(words);
    expect(PRICING_LINE).not.toMatch(/\$\d/);
  });

  it('the setup question the agent puts to the owner carries the basis beside the reward', () => fixture(({ repo, scratch }) => {
    const path = join(scratch, 'settings', 'settings.json');
    const settings = JSON.parse(readFileSync(path, 'utf8'));
    delete settings.default;
    writeFileSync(path, JSON.stringify({ ...settings, repositories: {} }));
    expect(renderOverview(repo)).toContain(`in whole dollars (a reward is ${PRICING_BASIS}; the limit is that reward times how many bounties may be open at once)?`);
  }));

  it('allow --help points from --reward to how to choose it', () => {
    const ran = spawnSync(process.execPath, [CLI_DIST, 'allow', '--help'], { encoding: 'utf8' });
    expect(ran.stdout).toContain('--reward <whole dollars> — the reward for one bounty, in whole dollars: about what the work is worth to you — omakase-box help says how to choose it');
  });
});
