// K73: the tool no longer reads a shared record kept under the name `refs/box-bounty/<id>` (the name before BT58). That name is the one
// Git resolves before a branch of the same short name, so the tool must not fetch, read, write or delete anything there.
import childProcess, { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closeBounty, renderStatus, statusDocument, syncChains } from '../../../packages/box-bounty/index.js';
import { postedFixture, type GithubFixture } from './github-fixture.js';
import { git, runRoot } from './support.js';

const NEW = 'refs/box-bounty-records';
const OLD = 'refs/box-bounty';

const refsOn = (repo: string): string[] => git(repo, ['for-each-ref', '--format=%(refname)']).split('\n').filter(line => line !== '');

// Every Git start made while the action runs, as argument lists.
function gitStarts(action: () => void): string[][] {
  const real = childProcess.spawnSync;
  const starts: string[][] = [];
  childProcess.spawnSync = ((command: string, args: readonly string[], options: never) => {
    if (basename(String(command)).toLowerCase().replace('.exe', '') === 'git') starts.push([...(args ?? [])]);
    return (real as unknown as (...a: unknown[]) => unknown)(command, args, options);
  }) as typeof childProcess.spawnSync;
  syncBuiltinESMExports();
  try { action(); } finally { childProcess.spawnSync = real; syncBuiltinESMExports(); }
  return starts;
}

// A second machine: its own clone of the bare remote and its own owner settings (as bt58).
function machineB(world: GithubFixture) {
  git(world.bare, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  const repo = join(runRoot('k73-machine-b'), 'repo');
  execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, repo], { encoding: 'utf8', stdio: 'pipe' });
  git(repo, ['remote', 'set-url', 'origin', 'git@github.com:owner/project.git']);
  const dir = join(runRoot('k73-settings'), 'settings');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': { bounty: 'allowed', at: '2026-10-01T00:00:00.000Z', changes: [] } } }));
  const on = <T>(action: () => T): T => {
    const before = process.env.BOX_BOUNTY_SETTINGS_DIR;
    process.env.BOX_BOUNTY_SETTINGS_DIR = dir;
    try { return action(); } finally { process.env.BOX_BOUNTY_SETTINGS_DIR = before; }
  };
  return { repo, on };
}

describe('K73: nothing reads, fetches, writes or deletes a shared record under refs/box-bounty/<id>', { timeout: 180000 }, () => {
  it('a remote that holds a bounty only under the old name is not adopted, and one refspec is fetched', () => postedFixture(world => {
    // the world as a pre-BT58 tool left it: the record under the old name on the remote, none under the new
    const tip = git(world.bare, ['rev-parse', `${NEW}/${world.id}`]);
    git(world.bare, ['update-ref', `${OLD}/${world.id}`, tip]);
    git(world.bare, ['update-ref', '-d', `${NEW}/${world.id}`]);
    const b = machineB(world);
    let starts: string[][] = [];
    b.on(() => { starts = gitStarts(() => { renderStatus(b.repo); syncChains(b.repo, true); }); });
    const refs = refsOn(b.repo);
    expect(refs.filter(ref => ref.startsWith(`${OLD}/`)), 'the old name was fetched or written here').toEqual([]);
    expect(refs.filter(ref => ref.startsWith('refs/box-bounty-records-origin-old')), 'the old name was fetched into a tracking name').toEqual([]);
    const ids = b.on(() => (statusDocument(b.repo, {}, () => {})['bounties'] as Record<string, unknown>[]).map(row => row['id']));
    expect(ids, 'a bounty known only by an old-name record was adopted').not.toContain(world.id);
    const fetches = starts.filter(args => args.includes('fetch') && args.some(arg => arg.startsWith(`+${NEW}/`)));
    expect(fetches.length, 'the shared-memory fetch ran').toBeGreaterThan(0);
    for (const fetch of fetches) expect(fetch.filter(arg => arg.startsWith('+refs/')), 'one refspec: the record name').toEqual([`+${NEW}/*:refs/box-bounty-records-origin/*`]);
  }));

  it('an end stage never reads or deletes refs/box-bounty/<id>', () => postedFixture(world => {
    // a commit planted at the old name: before K73 an end stage deleted it unless it held an event
    const head = git(world.repo, ['rev-parse', 'HEAD']);
    git(world.repo, ['update-ref', `${OLD}/${world.id}`, head]);
    const starts = gitStarts(() => { closeBounty(world.repo, world.id); });
    expect(refsOn(world.repo), 'the planted old-name ref was deleted').toContain(`${OLD}/${world.id}`);
    expect(starts.filter(args => args.includes(`${OLD}/${world.id}`)), 'a Git start named the old name').toEqual([]);
  }));
});
