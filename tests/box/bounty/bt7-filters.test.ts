import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { answerGitHub, applyBounty, confirmBounty, finalizeBounty, lookBounty, planBounty, postBounty, undoBounty, unlookBounty } from '../../../packages/box-bounty/index.js';
import { fixture } from './github-fixture.js';
import type { GithubFixture } from './github-fixture.js';
import { ahead, ordinaryTree, plainGit } from './ordinary-tree.js';
import { fingerprint, git, makeRepo, runRoot, write } from './support.js';

// BT7 Correction 1, item 1: filters follow whose content it is. A repository
// that needs a clean/smudge filter (git-crypt, git-lfs) keeps one form of a
// file in the working tree and another in Git. Where only the owner's content
// is in play the owner's filter runs as in plain Git: `create` ships what Git
// stores, and a landed merge leaves the working-tree form and a clean status.
// Where a solver's content is checked out — the look copy — nothing configured
// runs, so the copy holds the stored form.
//
// The stand-in filter is `required`, lives outside the repository, and writes
// down every run with the folder it ran in: clean stores `ENC:` + text, smudge
// gives the text back.

interface Armed { readonly log: () => string[]; readonly ranIn: (folder: string) => string[]; readonly clear: () => void }

const fold = (path: string): string => path.replaceAll('\\', '/').toLowerCase();

function arm(repo: string): Armed {
  const scratch = runRoot('bt7-filter');
  const logFile = join(scratch, 'runs.log');
  const script = join(scratch, 'crypt.cjs');
  writeFileSync(script, [
    "const fs = require('node:fs');",
    'const mode = process.argv[2];',
    `fs.appendFileSync(${JSON.stringify(logFile)}, mode + ' ' + process.cwd() + '\\n');`,
    'const input = fs.readFileSync(0);',
    "const stored = input.subarray(0, 4).toString() === 'ENC:';",
    "process.stdout.write(mode === 'clean' ? (stored ? input : Buffer.concat([Buffer.from('ENC:'), input])) : (stored ? input.subarray(4) : input));"
  ].join('\n'));
  const command = (mode: string): string => `"${process.execPath.replaceAll('\\', '/')}" "${script.replaceAll('\\', '/')}" ${mode}`;
  git(repo, ['config', 'filter.crypt.clean', command('clean')]);
  git(repo, ['config', 'filter.crypt.smudge', command('smudge')]);
  git(repo, ['config', 'filter.crypt.required', 'true']);
  const log = (): string[] => existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
  return { log, ranIn: folder => log().filter(line => fold(line).endsWith(fold(folder))), clear: () => writeFileSync(logFile, '') };
}

// Tracked changes as plain Git — the owner's own view, filter and all — sees them.
const trackedChanges = (repo: string): string[] =>
  git(repo, ['status', '--porcelain']).split('\n').filter(line => line !== '' && !line.startsWith('??'));

it('create ships the bytes the owner\'s clean filter stores — for a committed file and for an uncommitted edit — and leaves the working tree as it was', () => {
  const repo = makeRepo({ 'app.txt': 'owner\n' });
  const filter = arm(repo);
  write(repo, '.gitattributes', '*.dat filter=crypt\n');
  write(repo, 'secret.dat', 'committed plaintext\n');
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'a filtered file']);
  expect(git(repo, ['cat-file', 'blob', 'HEAD:secret.dat'])).toBe('ENC:committed plaintext');
  write(repo, 'TASK.md', 'the task\n');
  const before = fingerprint(repo);
  const committed = finalizeBounty(planBounty({ repoPath: repo, why: 'a reason', title: 'filtered', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('bt7-filter-out'), 'bounty') }));
  expect(readFileSync(join(committed.outDir, 'repo', 'secret.dat'), 'utf8')).toBe('ENC:committed plaintext\n');
  expect(fingerprint(repo)).toEqual(before);

  write(repo, 'secret.dat', 'edited plaintext\n');
  ahead(join(repo, 'secret.dat'));
  const edited = fingerprint(repo);
  filter.clear();
  const uncommitted = finalizeBounty(planBounty({ repoPath: repo, why: 'a reason', title: 'filtered again', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('bt7-filter-out'), 'bounty') }));
  expect(readFileSync(join(uncommitted.outDir, 'repo', 'secret.dat'), 'utf8')).toBe('ENC:edited plaintext\n');
  expect(filter.ranIn(repo).some(line => line.startsWith('clean '))).toBe(true);
  expect(readFileSync(join(repo, 'secret.dat'), 'utf8')).toBe('edited plaintext\n');
  expect(fingerprint(repo)).toEqual(edited);
});

// The owner commits a filtered file, the bounty is posted, and a solver — whose
// clone has no such filter — adds `new.dat` in the stored form and fixes app.txt.
function filteredBounty(context: GithubFixture): Armed {
  const filter = arm(context.repo);
  write(context.repo, '.gitattributes', '*.dat filter=crypt\n');
  write(context.repo, 'secret.dat', 'committed plaintext\n');
  git(context.repo, ['add', '.gitattributes', 'secret.dat']);
  git(context.repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'a filtered file']);
  git(context.repo, ['push', 'https://github.com/owner/project.git', 'main']);
  confirmBounty(context.repo, context.id, 'github');
  postBounty(context.repo, context.id, 'github');
  context.pr('solver', { 'new.dat': 'ENC:solver new\n' });
  answerGitHub(context.repo, context.id, 1);
  return filter;
}

const files = { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n' };

it('a clean apply leaves the working-tree form and a clean status; the look copy holds the stored form and the filter never runs there; undo is clean too', () => fixture(context => {
  const filter = filteredBounty(context);
  filter.clear();
  const looked = lookBounty(context.repo, context.id, 1);
  try {
    expect(readFileSync(join(looked.copy.path, 'new.dat'), 'utf8')).toBe('ENC:solver new\n');
    expect(readFileSync(join(looked.copy.path, 'secret.dat'), 'utf8')).toBe('ENC:committed plaintext\n');
    expect(filter.log()).toEqual([]);
    // The trap is live: plain Git, in an ordinary working tree of the same commit,
    // runs the filter the moment it reads a file again. In the copy it does not
    // (BT7 Correction 2: a copy takes nothing from the repository's configuration).
    const ordinary = ordinaryTree(context.repo, looked.record.attempts?.[0]?.commit ?? 'missing', join(context.scratch, 'ordinary'));
    try {
      ahead(join(ordinary.path, 'new.dat'));
      plainGit(ordinary.path, ['status']);
      expect(filter.ranIn(ordinary.path).length).toBeGreaterThan(0);
    } finally { ordinary.remove(); }
    filter.clear();
    ahead(join(looked.copy.path, 'new.dat'));
    plainGit(looked.copy.path, ['status']);
    expect(filter.log()).toEqual([]);
  } finally { unlookBounty(context.repo, context.id, 1); }

  filter.clear();
  expect(applyBounty(context.repo, context.id, 1).outcome).toBe('applied');
  expect(readFileSync(join(context.repo, 'new.dat'), 'utf8')).toBe('solver new\n');
  expect(readFileSync(join(context.repo, 'secret.dat'), 'utf8')).toBe('committed plaintext\n');
  expect(git(context.repo, ['cat-file', 'blob', 'HEAD:new.dat'])).toBe('ENC:solver new');
  expect(trackedChanges(context.repo)).toEqual([]);
  expect(filter.ranIn(context.repo).some(line => line.startsWith('smudge '))).toBe(true);

  expect(undoBounty(context.repo, context.id).outcome).toBe('undone');
  expect(existsSync(join(context.repo, 'new.dat'))).toBe(false);
  expect(readFileSync(join(context.repo, 'secret.dat'), 'utf8')).toBe('committed plaintext\n');
  expect(trackedChanges(context.repo)).toEqual([]);
}, 'Repair app', files));
