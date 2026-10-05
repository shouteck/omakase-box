import { spawnSync } from 'node:child_process';
import { GitFailed } from './errors.js';

// Single git entry point for the packaging library. The per-invocation safe.directory
// override (never a global config change) lets it read a checkout owned by a different
// account, matching how every kitchen git call is made.
function run(repo: string, args: readonly string[]): Buffer {
  const result = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-C', repo, ...args]);
  if (result.status !== 0 || result.error !== undefined) {
    const detail = ((result.stderr ?? result.stdout)?.toString('utf8') ?? result.error?.message ?? `exit ${result.status}`).trim();
    throw new GitFailed(`git ${args.join(' ')} failed in ${repo}: ${detail}`);
  }
  return result.stdout;
}

export function git(repo: string, args: readonly string[]): string {
  return run(repo, args).toString('utf8').trim();
}
export function gitBytes(repo: string, args: readonly string[]): Buffer {
  return run(repo, args);
}
