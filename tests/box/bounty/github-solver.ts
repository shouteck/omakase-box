import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { allowBounty, applyBounty, closeBounty, gitOutcome, loadRecord, lookBounty, postBounty, renderStatus } from '../../../packages/box-bounty/index.js';
import { gitBlob, gitIndexWrite, gitWriteBlob } from '../../../packages/box-bounty/git.js';
import type { IndexChange } from '../../../packages/box-bounty/git.js';
import { githubRepository } from './github-fixture.js';
import { CLI_DIST, git, ownerSays, runRoot } from './support.js';

type World = ReturnType<typeof githubRepository>;
const worlds = new Map<string, World>();
const worldFor = (repo: string, id: string): World => {
  let world = worlds.get(repo);
  if (world === undefined) { world = githubRepository(repo, id); worlds.set(repo, world); }
  return world;
};

// These fixtures represent a contributor's plain working tree. Posting and
// collecting always exercise the GitHub adapter, its publication and a PR.
export function postToGitHub(repo: string, id: string) {
  const world = worldFor(repo, id);
  const result = world.run(() => postBounty(repo, id));
  const tip = result.record.github!.commit;
  const destination = join(runRoot('BT15-solver'), 'working');
  mkdirSync(join(destination, 'repo'), { recursive: true });
  const listing = git(repo, ['ls-tree', '-r', '-z', tip]);
  for (const entry of listing.split('\0')) {
    const match = /^\d+ blob [a-f\d]+\t(.+)$/s.exec(entry);
    if (match?.[1] === undefined) continue;
    const file = match[1];
    const bytes = gitBlob(repo, tip, file);
    if (bytes === null) throw new Error('solver fixture blob missing');
    const target = join(destination, 'repo', ...file.split('/'));
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
  }
  return { ...result, destination };
}

export function pullRequestFor(repo: string, id: string, working: string): number {
  const world = worldFor(repo, id);
  const changes: IndexChange[] = [];
  const walk = (dir: string, parent = ''): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = parent === '' ? entry.name : `${parent}/${entry.name}`;
      const absolute = join(dir, entry.name);
      if (entry.isSymbolicLink()) changes.push({ path, mode: '120000', sha: gitWriteBlob(repo, Buffer.from(readlinkSync(absolute))) });
      else if (entry.isDirectory()) walk(absolute, path);
      else changes.push({ path, mode: '100644', sha: gitWriteBlob(repo, readFileSync(absolute)) });
    }
  };
  walk(join(working, 'repo'));
  const index = join(runRoot('BT15-solver-index'), 'index');
  const env = { GIT_INDEX_FILE: index };
  const base = world.run(() => loadRecord(repo, id).github!.commit);
  gitOutcome(repo, ['read-tree', '--empty'], env);
  gitIndexWrite(repo, index, changes);
  const tree = gitOutcome(repo, ['write-tree'], env).stdout.trim();
  const n = world.state().prs.length + 1;
  const commit = git(repo, ['commit-tree', tree, '-p', base, '-m', `BT15 solver PR ${n}`]);
  world.run(() => world.prCommit(commit, 'solver', changes.map(change => change.path), `box-bounty/${id}`));
  return n;
}

export function collectPullRequest(repo: string, id: string, working: string) {
  const n = pullRequestFor(repo, id, working);
  return worldFor(repo, id).run(() => lookBounty(repo, id, n));
}
export function applyPullRequest(repo: string, id: string, working: string) {
  const n = pullRequestFor(repo, id, working);
  return worldFor(repo, id).run(() => applyBounty(repo, id, n));
}
export const applyGitHub = (repo: string, id: string, n?: number) => {
  const world = worlds.get(repo);
  return world === undefined ? applyBounty(repo, id, n) : world.run(() => applyBounty(repo, id, n));
};
export const closeGitHub = (repo: string, id: string, reason?: string) => {
  const world = worlds.get(repo);
  return world === undefined ? closeBounty(repo, id, reason) : world.run(() => closeBounty(repo, id, reason));
};
export const allowGitHub = (repo: string, id: string) => {
  const world = worlds.get(repo);
  return world === undefined ? allowBounty(repo, id) : world.run(() => allowBounty(repo, id));
};
export const statusGitHub = (repo: string, options?: Parameters<typeof renderStatus>[1]) => {
  const world = worlds.get(repo);
  return world === undefined ? renderStatus(repo, options) : world.run(() => renderStatus(repo, options));
};
export function solverCli(repo: string, ...args: string[]) {
  const world = worlds.get(repo);
  const run = () => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8', env: process.env });
  return world === undefined ? run() : world.run(run);
}
