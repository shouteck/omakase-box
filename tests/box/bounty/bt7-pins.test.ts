import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { gitOutcome, readGitPinsOncePerProcess } from '../../../packages/box-bounty/git.js';
import { git, makeRepo, runRoot, write } from './support.js';

// The CLI reads the configuration that names executables once per repository
// path, because one command is one short process. This file turns that on for
// its own process — it is alone in its file so no other test inherits it.

function trapped(label: string): { repo: string; sentinel: string } {
  const repo = makeRepo({ 'app.txt': 'owner\n', '.gitattributes': '*.txt filter=trip\n' });
  const sentinel = join(runRoot(label), 'filter-ran');
  write(repo, 'trip.cjs', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'EXECUTED');\n`);
  return { repo, sentinel };
}

it('a filter configured before the command stays silenced on every call when pins are read once', () => {
  const { repo, sentinel } = trapped('bt7-pins-once');
  git(repo, ['config', 'filter.trip.clean', 'node trip.cjs']);
  git(repo, ['config', 'filter.trip.required', 'true']);
  write(repo, 'app.txt', 'owner changed\n');
  readGitPinsOncePerProcess();
  for (let call = 0; call < 3; call += 1) {
    const diff = gitOutcome(repo, ['diff']);
    expect(diff.status).toBe(0);
    expect(diff.stdout).toContain('+owner changed');
    expect(existsSync(sentinel)).toBe(false);
  }
  // The trap is live: the same read by plain Git, without the tool's pins, runs it.
  spawnSync('git', ['-C', repo, 'diff'], { encoding: 'utf8' });
  expect(existsSync(sentinel)).toBe(true);
  rmSync(sentinel);
  // A second repository is its own path and is read for itself.
  const other = trapped('bt7-pins-other');
  git(other.repo, ['config', 'filter.trip.clean', 'node trip.cjs']);
  write(other.repo, 'app.txt', 'other changed\n');
  expect(gitOutcome(other.repo, ['diff']).stdout).toContain('+other changed');
  expect(existsSync(other.sentinel)).toBe(false);
  expect(existsSync(sentinel)).toBe(false);
});
