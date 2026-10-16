// The helpers every BT6b pass file shares: the logging filter, the armed
// repository fixtures and the create/post journey a solver folder comes
// from. One module so the K24 split keeps a single implementation — moved
// unchanged out of bt6b.test.ts, which had grown past a quarter of the
// bounty suite's wall time.
import { postToGitHub, solverCli } from './github-solver.js';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { git, makeRepo, ownerSays, runRoot, write } from './support.js';

export const cli = solverCli;

// A clean/smudge filter that passes bytes through unchanged and logs every
// run — the tag says whose program ran (the owner's or the solver's). The log
// path rides an environment variable so the same script works from the bounty
// folder copy a solver edits.
export const loggingFilter = (tag: string): string => [
  "const fs = require('node:fs');",
  `try { fs.appendFileSync(process.env.BT6B_FILTER_LOG, ${JSON.stringify(tag)} + ' ' + process.argv[2] + '\\n'); } catch {}`,
  'process.stdout.write(fs.readFileSync(0));'
].join('\n');

const LOG_ENV = 'BT6B_FILTER_LOG';

// A repository with a committed .gitattributes, a tracked filter program and
// two .dat files — the tool's filter configuration is set separately so the
// armed variant can point it outside or inside the tree.
export function filteredRepo(): string {
  return armFilter(makeRepo({ 'app.txt': 'broken\n' }));
}

// The same fixture, built at a path the caller picks instead of the run
// root — a `~/`-spelled include reaches the tree only while the repository
// itself lives under the home directory.
export function filteredRepoUnder(parent: string): string {
  const repo = join(parent, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  write(repo, 'app.txt', 'broken\n');
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'base']);
  return armFilter(repo);
}

function armFilter(repo: string): string {
  write(repo, '.gitattributes', '*.dat filter=own\n');
  write(repo, 'tools/filter.cjs', loggingFilter('OWNER'));
  write(repo, 'data.dat', 'first\n');
  write(repo, 'zz.dat', 'second\n');
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'filtered files']);
  return repo;
}

export const inTreeFilter = (repo: string): void => {
  git(repo, ['config', 'filter.own.clean', 'node tools/filter.cjs clean']);
  git(repo, ['config', 'filter.own.smudge', 'node tools/filter.cjs smudge']);
  git(repo, ['config', 'filter.own.required', 'true']);
};

export const readLog = (logFile: string): string[] =>
  existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(line => line !== '') : [];

// The outbound journey through the CLI: create, post to a folder — the
// owner already allowed the tool (BT8). The returned value is the delivered
// bounty folder a solver edits.
export function delivered(repo: string): { id: string; folder: string } {
  write(repo, 'TASK.md', 'the task\n');
  const out = join(runRoot('bt6b-out'), 'bounty');
  const created = cli(repo, 'create', '--task', join(repo, 'TASK.md'), '--why', 'a reason');
  expect(created.status).toBe(0);
  const id = /bt-[a-f0-9]{12}/.exec(created.stdout)![0];
  ownerSays(repo, 'allowed');
  const { destination } = postToGitHub(repo, id);
  return { id, folder: destination };
}

export function withLog<T>(run: (logFile: string) => T): T {
  const logFile = join(runRoot('bt6b-log'), 'runs.log');
  const before = process.env[LOG_ENV];
  process.env[LOG_ENV] = logFile;
  try { return run(logFile); }
  finally { if (before === undefined) delete process.env[LOG_ENV]; else process.env[LOG_ENV] = before; }
}
