import { spawnSync } from 'node:child_process';
import { utimesSync } from 'node:fs';
import { git as safeGit } from '../../../packages/box-bounty/git.js';

// An ordinary linked working tree of the owner's repository at `commit` — what
// `git worktree add` gives, and what a look copy must not be: it
// reads the owner repository's configuration. It is checked out with nothing
// configured run, so that a test can then run plain Git in it and show that a
// trap is live outside the tool's copies before asserting it is silent inside.
export function ordinaryTree(repo: string, commit: string, path: string): { readonly path: string; readonly remove: () => void } {
  safeGit(repo, ['worktree', 'add', '--detach', path, commit]);
  return { path, remove: () => { safeGit(repo, ['worktree', 'remove', '--force', path]); } };
}

// Git as an agent types it: no pins, no overrides, the environment as it is.
export function plainGit(where: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('git', ['-C', where, ...args], { encoding: 'utf8', env: process.env });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// A file time ahead of the index's own makes Git compare content the next time
// it looks, on any machine: the comparison is what runs a clean filter.
export function ahead(path: string): void {
  const future = new Date(Date.now() + 86_400_000);
  utimesSync(path, future, future);
}
