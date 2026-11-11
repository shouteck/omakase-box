// BT58: the shared record's refs cannot be taken for the bounty branch. A bounty has a branch (`refs/heads/box-bounty/<id>`,
// where solutions go) and a shared record (the event chain). Git resolves a short name to `refs/<name>` before
// `refs/heads/<name>` (gitrevisions, "<refname>"), so a record at `refs/box-bounty/<id>` answered `git fetch origin
// box-bounty/<id>`, and the record's tracking ref sat where a clone keeps the branch's. New bounties keep the record at
// `refs/box-bounty-records/<id>` and its tracking ref at `refs/box-bounty-records-origin/<id>`; a chain written before
// stays at the old name and is continued there. Real Git on a bare remote and real second clones, as BT32 and BT52.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerGitHub, closeBounty, loadRecord, metaSet, renderStatus, statusDocument, syncChains } from '../../../packages/box-bounty/index.js';
import { postedFixture, type GithubFixture } from './github-fixture.js';
import { git, runRoot } from './support.js';

const NEW = 'refs/box-bounty-records';
const OLD = 'refs/box-bounty';

const settingsDir = (): string => {
  const dir = join(runRoot('bt58-settings'), 'settings');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': { bounty: 'allowed', at: '2026-10-01T00:00:00.000Z', changes: [] } } }));
  return dir;
};

// A second machine: its own clone of the bare remote and its own owner settings.
function machineB(world: GithubFixture) {
  git(world.bare, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  const repo = join(runRoot('bt58-machine-b'), 'repo');
  execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, repo], { encoding: 'utf8', stdio: 'pipe' });
  git(repo, ['remote', 'set-url', 'origin', 'git@github.com:owner/project.git']);
  const settings = settingsDir();
  const on = <T>(action: () => T): T => {
    const before = process.env.BOX_BOUNTY_SETTINGS_DIR;
    process.env.BOX_BOUNTY_SETTINGS_DIR = settings;
    try { return action(); } finally { process.env.BOX_BOUNTY_SETTINGS_DIR = before; }
  };
  return { repo, on };
}

const tryGit = (cwd: string, args: string[]): string | null => { try { return git(cwd, args) || null; } catch { return null; } };
const branchTip = (world: GithubFixture): string => git(world.bare, ['rev-parse', `refs/heads/box-bounty/${world.id}`]);
const refsOn = (bare: string): string[] => git(bare, ['for-each-ref', '--format=%(refname)']).split('\n').filter(line => line !== '');
const eventTypes = (repo: string, ref: string): string[] =>
  git(repo, ['rev-list', '--topo-order', '--reverse', ref]).split('\n').filter(line => line !== '').map(commit => String(JSON.parse(git(repo, ['cat-file', 'blob', `${commit}:event.json`]))['type']));
// A commit holding only event.json is the record, never code.
const isRecordCommit = (repo: string, sha: string): boolean => git(repo, ['ls-tree', '--name-only', sha]) === 'event.json';

// What master's code left behind for a bounty it posted: the record at the old name on the remote and here, and the store
// keys that say this machine wrote and pushed it (`chain_authored:` and the rest), with no `chain_ns:` choice (it does not
// exist yet). Written from whatever name the post used, so the same helper builds the old world on any version.
function asOldWorld(world: GithubFixture): void {
  const tip = tryGit(world.repo, ['rev-parse', '-q', '--verify', `${NEW}/${world.id}`]) ?? git(world.repo, ['rev-parse', `${OLD}/${world.id}`]);
  git(world.bare, ['update-ref', `${OLD}/${world.id}`, tip]);
  git(world.repo, ['update-ref', `${OLD}/${world.id}`, tip]);
  for (const ref of [`${NEW}/${world.id}`]) {
    if (tryGit(world.bare, ['rev-parse', '-q', '--verify', ref]) !== null) git(world.bare, ['update-ref', '-d', ref]);
    if (tryGit(world.repo, ['rev-parse', '-q', '--verify', ref]) !== null) git(world.repo, ['update-ref', '-d', ref]);
  }
  for (const ref of git(world.repo, ['for-each-ref', '--format=%(refname)', 'refs/box-bounty-records-origin']).split('\n').filter(line => line !== '')) git(world.repo, ['update-ref', '-d', ref]);
  metaSet(world.repo, `chain_ns:${world.id}`, null);
}

describe('BT58: the shared record cannot be taken for the bounty branch', { timeout: 180000 }, () => {
  it('1. a fresh clone that fetches the short name gets the branch, not the record', () => postedFixture(world => {
    const clone = join(runRoot('bt58-fetch'), 'repo');
    execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, clone], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['-c', `safe.directory=${world.bare}`, '-C', clone, 'fetch', world.bare, `box-bounty/${world.id}`], { encoding: 'utf8', stdio: 'pipe' });
    const fetched = git(clone, ['rev-parse', 'FETCH_HEAD']);
    expect(isRecordCommit(clone, fetched), 'the short name returned the record').toBe(false);
    expect(fetched).toBe(branchTip(world));
  }));

  it('2. after the tool syncs on a clone, origin/box-bounty/<id> is the branch or nothing, never the record', () => postedFixture(world => {
    const b = machineB(world);
    b.on(() => { renderStatus(b.repo); syncChains(b.repo, true); });
    const shown = tryGit(b.repo, ['rev-parse', '-q', '--verify', `origin/box-bounty/${world.id}`]);
    if (shown !== null) {
      expect(isRecordCommit(b.repo, shown), 'origin/box-bounty/<id> holds the record').toBe(false);
      expect(shown).toBe(branchTip(world));
    }
    // and the record itself arrived, under its own name
    expect(tryGit(b.repo, ['rev-parse', '-q', '--verify', `refs/box-bounty-records-origin/${world.id}`])).not.toBeNull();
  }));

  it('3. a chain written under the old name is read, continued and closed there, on the posting machine and on a second one', () => postedFixture(world => {
    asOldWorld(world);
    const before = refsOn(world.bare);
    expect(before).toContain(`${OLD}/${world.id}`);
    expect(before).not.toContain(`${NEW}/${world.id}`);
    const oldTip = git(world.bare, ['rev-parse', `${OLD}/${world.id}`]);

    // the posting machine continues it: a solution collected is an event on the old chain
    expect(renderStatus(world.repo)).toContain(world.id);
    answerGitHub(world.repo, world.id, 1);
    const afterAnswer = git(world.bare, ['rev-parse', `${OLD}/${world.id}`]);
    expect(afterAnswer).not.toBe(oldTip);
    expect(git(world.bare, ['merge-base', '--is-ancestor', oldTip, afterAnswer])).toBe('');

    // a second machine adopts it and closes the bounty
    const b = machineB(world);
    b.on(() => {
      expect(renderStatus(b.repo)).toContain(world.id);
      closeBounty(b.repo, world.id);
      expect(['withdrawn', 'rejected']).toContain(loadRecord(b.repo, world.id).stage);
    });
    expect(eventTypes(world.bare, `${OLD}/${world.id}`)).toEqual(['posted', 'solution', 'closed']);
    const after = refsOn(world.bare);
    // (closing a bounty deletes its branch on purpose; the record refs are what the tool must never delete)
    expect(after, 'no record ref was deleted').toEqual(expect.arrayContaining(before.filter(ref => ref.startsWith(`${OLD}/`))));
    expect(after.filter(ref => ref.startsWith(`${NEW}/`)), 'nothing was written under the new name for an old chain').toEqual([]);
    // the second machine's own branch tracking ref was left alone by the sync
    const shown = tryGit(b.repo, ['rev-parse', '-q', '--verify', `origin/box-bounty/${world.id}`]);
    if (shown !== null) expect(isRecordCommit(b.repo, shown)).toBe(false);
  }, { prAuthor: 'solver1' }));

  it('4. a new post writes the record at the new name and nowhere near the branch\'s', () => postedFixture(world => {
    const refs = refsOn(world.bare);
    expect(refs).toContain(`${NEW}/${world.id}`);
    expect(refs).not.toContain(`${OLD}/${world.id}`);
    expect(refs).toContain(`refs/heads/box-bounty/${world.id}`);
    expect(tryGit(world.repo, ['rev-parse', '-q', '--verify', `${OLD}/${world.id}`])).toBeNull();
    expect(tryGit(world.repo, ['rev-parse', '-q', '--verify', `${NEW}/${world.id}`])).not.toBeNull();
    // Git holds both names in one repository
    const sha = branchTip(world);
    git(world.repo, ['update-ref', 'refs/box-bounty-records/bt-aaaaaaaaaaaa', sha]);
    git(world.repo, ['update-ref', 'refs/heads/box-bounty/bt-aaaaaaaaaaaa', sha]);
    expect(git(world.repo, ['rev-parse', 'box-bounty/bt-aaaaaaaaaaaa'])).toBe(sha);
  }));

  it('5. a ref planted under the new name is ignored or refused exactly as under the old one', () => postedFixture(world => {
    const b = machineB(world);
    const record = git(world.bare, ['rev-parse', `${NEW}/${world.id}`]);
    // (a) on the remote: a name that is not a bounty id, and a valid id the tool never wrote, holding a record whose id is another's
    git(world.bare, ['update-ref', `${NEW}/not-a-bounty-id`, record]);
    git(world.bare, ['update-ref', `${NEW}/bt-ffffffffffff`, record]);
    // (b) on a machine: a local ref for a valid id the tool never wrote, and the real id's local ref replaced with a planted commit
    const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // Git's own empty tree
    const empty = git(b.repo, ['-c', 'user.name=x', '-c', 'user.email=x@x.invalid', 'commit-tree', emptyTree, '-m', 'planted']);
    git(b.repo, ['update-ref', `${NEW}/bt-eeeeeeeeeeee`, empty]);
    b.on(() => {
      const ids = (statusDocument(b.repo, {}, () => {})['bounties'] as Record<string, unknown>[]).map(row => row['id']);
      expect(ids).toContain(world.id);
      expect(ids).not.toContain('bt-ffffffffffff');
      expect(ids).not.toContain('not-a-bounty-id');
      syncChains(b.repo, true);
    });
    // nothing planted on the machine reached the remote
    expect(refsOn(world.bare)).not.toContain(`${NEW}/bt-eeeeeeeeeeee`);
  }));

  it('6. a remote that advertises both names for one id: a machine that has not chosen uses the old, and writes nothing to the new', () => postedFixture(world => {
    const newTip = git(world.bare, ['rev-parse', `${NEW}/${world.id}`]);
    git(world.bare, ['update-ref', `${OLD}/${world.id}`, newTip]);
    const b = machineB(world);
    b.on(() => {
      expect(renderStatus(b.repo)).toContain(world.id);
      closeBounty(b.repo, world.id);
    });
    expect(eventTypes(world.bare, `${OLD}/${world.id}`).at(-1)).toBe('closed');
    expect(git(world.bare, ['rev-parse', `${NEW}/${world.id}`]), 'the new-name record was written to').toBe(newTip);
  }));
});
