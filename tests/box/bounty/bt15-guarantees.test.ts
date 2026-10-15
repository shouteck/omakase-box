import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { applyBounty, lookBounty, postBounty } from '../../../packages/box-bounty/index.js';
import { fixture, postedFixture, refused } from './github-fixture.js';
import { fingerprint, git, runRoot, write } from './support.js';

it('the GitHub publication refuses newly committed never-ship content without changing owner bytes', () => fixture(({ repo, id, state }) => {
  write(repo, '.env.local', 'private fixture content\n');
  write(repo, 'app.txt', 'owner progress\n');
  git(repo, ['add', '.env.local', 'app.txt']);
  git(repo, ['commit', '-qm', 'owner progress and local settings']);
  const before = fingerprint(repo);
  refused(() => postBounty(repo, id, 'github'), 'github-never-ship');
  expect(state().issues).toEqual([]);
  expect(fingerprint(repo)).toEqual(before);
}));

it('private GitHub publication refuses by name and preserves the draft', () => fixture(({ repo, id, update, state }) => {
  update({ visibility: 'private', private: true });
  const before = readFileSync(join(repo, '.box/bounties', `${id}.json`));
  refused(() => postBounty(repo, id, 'github'), 'github-private-repository');
  expect(readFileSync(join(repo, '.box/bounties', `${id}.json`))).toEqual(before);
  expect(state().issues).toEqual([]);
}));

it('a solver-added never-ship path is refused before recording or writing owner files', () => postedFixture(({ repo, id, pr }) => {
  pr('solver', { '.box/hostile.txt': 'outside content\n' });
  const before = fingerprint(repo);
  refused(() => lookBounty(repo, id, 2), 'answer-never-ship');
  expect(fingerprint(repo)).toEqual(before);
}));

it('foreign attributes and executable source run no sentinel during collection or merge', () => fixture(({ repo, id, pr }) => {
  const marker = join(runRoot('BT15-sentinel'), 'ran.txt');
  const program = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n`;
  postBounty(repo, id, 'github');
  pr('solver', { '.gitattributes': '*.txt diff=pwn\n', 'tools/pwn.cjs': program, 'package.json': JSON.stringify({ scripts: { test: 'node tools/pwn.cjs' } }) });
  const looked = lookBounty(repo, id, 1);
  expect(looked.diff).toContain('fixed');
  expect(looked.attempt.report.join('\n')).toContain('nothing in the solution was run');
  expect(applyBounty(repo, id, 1).outcome).toBe('applied');
  expect(existsSync(marker)).toBe(false);
  expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('fixed\n');
}));
