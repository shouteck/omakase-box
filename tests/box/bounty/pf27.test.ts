// PF27: the tool describes both halves. `describe` gives the solving half one line; `describe --solving` prints it
// whole; the instruction block carries one solving line only while the owner allows solving.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { changeConfig, renderDescribe, renderDescribeSolving, renderRules } from '../../../packages/box-bounty/index.js';
import { instructionBlock } from '../../../packages/box-bounty/instructions.js';
import { SOLVING_BLOCK_LINE } from '../../../packages/box-bounty/wording.js';
import { applyBounty, lookBounty } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';
import { git, makeRepo, write } from './support.js';

const AGENTS_PAGE = fileURLToPath(new URL('../../../packages/box-platform/app/agents/page.jsx', import.meta.url));

describe('the solving half, described', () => {
  it('describe --solving says what, when it is worth it and not, how to schedule, and where to work; its next step follows the owner\'s word', () => {
    changeConfig(null, 'set', 'solving', 'off');
    const off = renderDescribeSolving();
    expect(off).toContain('worth taking when: it pays on merge');
    expect(off).toContain('not worth taking when: others are already on it');
    expect(off).toContain('no more often than every\n15 minutes');
    expect(off).toContain('Work only in the folder take gives you');
    expect(off).toContain('solving: off');
    expect(off.split('\n').at(-1)).toBe('next: ask the owner to run box bounty config set solving allowed (or ask, to be asked before each bounty)');
    changeConfig(null, 'set', 'solving', 'allowed');
    const allowed = renderDescribeSolving();
    expect(allowed).toContain('solving: allowed');
    expect(allowed.split('\n').at(-1)).toBe('next: box bounty discover --language <a language you work in>, then box bounty take <id>');
  });

  it('describe gives the solving half one line, worded by the owner\'s word', () => {
    changeConfig(null, 'set', 'solving', 'off');
    const off = renderDescribe(null).split('\n');
    // PF29 folded this line into the modes line.
    expect(off.filter(line => line.includes('describe --solving'))).toEqual(['modes: posting and merging: needs a repository to say; taking others\' bounties: off (box bounty describe --solving).']);
    expect(off.some(line => line.startsWith('worth taking when'))).toBe(false);
    changeConfig(null, 'set', 'solving', 'ask');
    expect(renderDescribe(null)).toContain('taking others\' bounties: the owner is asked each time (box bounty describe --solving).');
  });

  it('the instruction block carries the solving line only while the owner allows solving', () => {
    const repo = makeRepo({ 'README.md': 'pf27\n' });
    changeConfig(null, 'set', 'solving', 'off');
    expect(instructionBlock(repo)).not.toContain(SOLVING_BLOCK_LINE);
    expect(renderRules(null)).not.toContain(SOLVING_BLOCK_LINE);
    for (const mode of ['ask', 'allowed']) {
      changeConfig(null, 'set', 'solving', mode);
      const block = instructionBlock(repo).split('\n');
      // One line, inside the markers, before the closing one.
      expect(block.filter(line => line === SOLVING_BLOCK_LINE)).toHaveLength(1);
      expect(block.indexOf(SOLVING_BLOCK_LINE)).toBeLessThan(block.length - 1);
      expect(renderRules(null)).toContain(SOLVING_BLOCK_LINE);
    }
    changeConfig(null, 'set', 'solving', 'off');
    expect(instructionBlock(repo)).not.toContain(SOLVING_BLOCK_LINE);
  });

  it('the board\'s For agents page shows the solving path, with the board\'s own floor', () => {
    const page = readFileSync(AGENTS_PAGE, 'utf8');
    for (const command of ['box bounty discover --language TypeScript', 'box bounty take <id>', 'box bounty submit <id>', 'box bounty status <id>']) expect(page).toContain(`'${command}'`);
    expect(page).toContain('box bounty config set solving allowed');
    expect(page).toContain('every 15 minutes at most');
    expect(page).not.toContain('more than every 5');
    expect(page).toContain('cursor, since, limit');
  });
});

// Found by PF27's proof: the poster looked at pull request #64, asked for a change, the solver pushed it, and
// `apply <id> 64` merged the first version, collected before the review.
describe('a pull request that moved after it was collected', { timeout: 120000 }, () => {
  it('apply merges nothing and collects the current version; look shows it, offline; apply then takes that version', () => postedFixture(({ repo, bare, scratch, id, state, update }) => {
    const first = lookBounty(repo, id, 1);
    expect(first.attempt.n).toBe(1);
    // The solver answers the review: a new commit on the same pull request.
    const solver = join(scratch, 'answer-review');
    git(repo, ['clone', '--quiet', bare, solver]);
    git(solver, ['fetch', '--quiet', 'origin', 'refs/pull/1/head']);
    git(solver, ['checkout', '--quiet', 'FETCH_HEAD']);
    write(solver, 'app.txt', 'fixed after review\n');
    git(solver, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit', '-qam', 'answer the review']);
    const second = git(solver, ['rev-parse', 'HEAD']);
    git(solver, ['push', '--quiet', 'origin', 'HEAD:refs/pull/1/head']);
    update({ prs: state().prs.map(pr => pr.number === 1 ? { ...pr, head: { sha: second } } : pr) });
    const before = git(repo, ['rev-parse', 'HEAD']);
    expect(() => applyBounty(repo, id, 1)).toThrow(expect.objectContaining({ reason: 'pull-request-moved', message: expect.stringContaining(`nothing was merged; next: box bounty look ${id} 1 shows it`) }));
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(before);
    // The pull request's number now shows its latest version, with no GitHub read.
    const ghBefore = state().calls.length;
    const current = lookBounty(repo, id, 1);
    expect(state().calls.length).toBe(ghBefore);
    expect(current).toMatchObject({ collected: false, attempt: { pullRequest: 1, commit: second } });
    expect(current.attempt.n).not.toBe(1);
    const applied = applyBounty(repo, id, 1);
    expect(applied.outcome).toBe('applied');
    expect(applied.attempt).toBe(current.attempt.n);
    expect(readFileSync(join(repo, 'app.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('fixed after review\n');
  }));
});
