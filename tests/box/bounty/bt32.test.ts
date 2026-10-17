// BT32 — the shared bounty memory: one Git ref per bounty carrying one JSON
// event per commit. These tests run the real sync against the fixture's bare
// "GitHub" remote and a genuine second clone — never a mocked chain.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closeBounty, loadRecord, renderStatus, findBounties, postBounty, BountyRefused, syncChains, sharedRead, appendEvent, pushChain } from '../../../packages/box-bounty/index.js';
import { sharedFixture, sharedPostedFixture, refused } from './github-fixture.js';
import type { GithubFixture } from './github-fixture.js';
import { git, readRecordRaw, runRoot, writeRecordRaw } from './support.js';

// A real second machine: a clone of the bare remote with the same repository
// identity, so its sync fetches/pushes the same URLs the first machine's did.
function secondMachine(world: GithubFixture): string {
  const clone = join(runRoot('bt32-machine-b'), 'repo');
  execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, clone], { encoding: 'utf8' });
  git(clone, ['remote', 'set-url', 'origin', 'git@github.com:owner/project.git']);
  return clone;
}

const chainTip = (repo: string, id: string): string | null => {
  try { return git(repo, ['rev-parse', '-q', '--verify', `refs/box-bounty/${id}`]) || null; } catch { return null; }
};
const remoteTip = (repo: string, id: string): string | null => {
  try { return git(repo, ['rev-parse', '-q', '--verify', `refs/remotes/origin/box-bounty/${id}`]) || null; } catch { return null; }
};
const bareTip = (world: { bare: string }, id: string): string | null => {
  const out = execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'ls-remote', world.bare, `refs/box-bounty/${id}`], { encoding: 'utf8' }).trim();
  return out === '' ? null : out.split('\t')[0]!;
};
const eventsOf = (repo: string, tip: string): Record<string, unknown>[] =>
  git(repo, ['rev-list', '--topo-order', '--reverse', tip]).split('\n').filter(line => line !== '').map(commit =>
    JSON.parse(git(repo, ['cat-file', 'blob', `${commit}:event.json`])) as Record<string, unknown>);

describe('BT32 shared bounty memory', () => {
  it('a post writes one chain commit and pushes the ref — clone does not see it by default', () => {
    { const world = sharedFixture(); world.run(() => {
      postBounty(world.repo, world.id, 'github');
      const tip = chainTip(world.repo, world.id);
      expect(tip).not.toBeNull();
      expect(eventsOf(world.repo, tip!)).toMatchObject([{ v: 1, type: 'posted', id: world.id }]);
      expect(bareTip(world, world.id)).toBe(tip);
      // An ordinary clone downloads no chain refs (step-0 fact, kept honest).
      const plain = join(runRoot('bt32-plain'), 'repo');
      // A bare remote with no HEAD makes clone fetch every advertised ref —
      // give this remote the ordinary main HEAD real remotes always carry.
      execFileSync('git', ['-c', `safe.directory=${world.bare}`, '-C', world.bare, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { encoding: 'utf8' });
      execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, plain], { encoding: 'utf8' });
      // No local chain ref, and nothing of the bounty in the checkout — the
      // GitHub-side fact (a fresh clone downloads no chain ref at all) is
      // Step 0's evidence; the file transport this fixture uses maps remote
      // refs more eagerly than github.com does.
      expect(git(plain, ['for-each-ref', 'refs/box-bounty'])).toBe('');
      expect(git(plain, ['ls-files'])).not.toContain('box-bounty');
    }); }
  });

  it('a second machine imports the chain and status shows the shared bounty; acting on it is refused', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const other = secondMachine(world);
      const status = renderStatus(other);
      expect(status).toContain(world.id);
      expect(status).toContain('posted from another machine');
      expect(sharedRead(other, world.id)?.title).toBe('Repair app');
      // The shared row never becomes a writable local record.
      const failure = () => closeBounty(other, world.id);
      expect(failure).toThrowError(BountyRefused);
      try { loadRecord(other, world.id); expect.unreachable(); }
      catch (error) { expect(error).toMatchObject({ reason: 'shared-only' }); }
      // find sees it too — recall by purpose crosses machines.
      expect(findBounties(other, 'repair').total).toBeGreaterThan(0);
    }); }
  });

  it('a forged local ref is never trusted as remote cache', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const other = secondMachine(world);
      // Plant a local chain ref that never came from the remote: a commit
      // carrying a fake posted event for a bounty that does not exist.
      const fake = `bt-${'9'.repeat(12)}`;
      const gitIn = (args: string[], input: string) =>
        execFileSync('git', ['-c', `safe.directory=${other}`, '-c', 'user.name=x', '-c', 'user.email=x@x', '-C', other, ...args], { input, encoding: 'utf8' }).trim();
      // A local chain ref pointing at a commit with no event.json is not
      // chain history: it is never adopted, imported or retried.
      const empty = gitIn(['commit-tree', '4b825dc642cb6eb9a060e54bf8d69288fbee4904', '-m', 'plain'], '');
      git(other, ['update-ref', `refs/box-bounty/${fake}`, empty]);
      // And a remote-tracking ref pointing at a corrupt event imports nothing.
      const blob = gitIn(['hash-object', '-w', '--stdin'], 'not an event at all\n');
      const tree = gitIn(['mktree'], `100644 blob ${blob}\tevent.json\n`);
      const commit = gitIn(['commit-tree', tree, '-m', 'forged'], '');
      git(other, ['update-ref', `refs/remotes/origin/box-bounty/${fake}`, commit]);
      syncChains(other, true);
      expect(sharedRead(other, fake)).toBeNull();
      expect(renderStatus(other)).not.toContain('forged');
    }); }
  });

  it('an invalid event on the remote is skipped and the rest of its chain imports', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const other = secondMachine(world);
      syncChains(other);
      // Another writer appends a valid event, then a corrupt one, straight
      // onto the remote chain — the remote is not authority, only transport.
      const tip = bareTip(world, world.id)!;
      const writer = join(runRoot('bt32-writer'), 'w');
      execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-checkout', world.bare, writer], { encoding: 'utf8' });
      execFileSync('git', ['-c', `safe.directory=${writer}`, 'fetch', 'origin', `refs/box-bounty/${world.id}:refs/box-bounty/${world.id}`], { cwd: writer, encoding: 'utf8' });
      const commitEvent = (event: string, parents: string[]) => {
        const blob = execFileSync('git', ['-c', `safe.directory=${writer}`, 'hash-object', '-w', '--stdin'], { cwd: writer, input: event, encoding: 'utf8' }).trim();
        const tree = execFileSync('git', ['-c', `safe.directory=${writer}`, 'mktree'], { cwd: writer, input: `100644 blob ${blob}\tevent.json\n`, encoding: 'utf8' }).trim();
        const args = ['-c', `safe.directory=${writer}`, '-c', 'user.name=x', '-c', 'user.email=x@x', 'commit-tree', tree, '-m', 'x', ...parents.flatMap(p => ['-p', p])];
        return execFileSync('git', args, { cwd: writer, encoding: 'utf8' }).trim();
      };
      const good = commitEvent(JSON.stringify({ v: 1, type: 'closed', at: new Date().toISOString(), kind: 'withdrawn' }) + '\n', [tip]);
      const bad = commitEvent('{"v":1,"type":"posted","extra-field":"surprise"}\n', [good]);
      execFileSync('git', ['-c', `safe.directory=${writer}`, 'update-ref', `refs/box-bounty/${world.id}`, bad], { cwd: writer, encoding: 'utf8' });
      execFileSync('git', ['-c', `safe.directory=${writer}`, 'push', 'origin', `refs/box-bounty/${world.id}:refs/box-bounty/${world.id}`], { cwd: writer, encoding: 'utf8' });
      syncChains(other, true);
      const shared = sharedRead(other, world.id);
      // The corrupt event is dropped; the valid closed event still landed.
      expect(shared?.stage).toBe('withdrawn');
    }); }
  });

  it('a secret-shaped field holds the event before any object is written', () => {
    { const world = sharedFixture(); world.run(() => {
      // A why carrying a GitHub-token-shaped string — a publish-hit refusal,
      // and no chain ref may exist afterwards.
      const secret = 'ghp_' + 'A'.repeat(36);
      const record = JSON.parse(readRecordRaw(world.repo, world.id));
      record.why = `token is ${secret}`;
      writeRecordRaw(world.repo, world.id, JSON.stringify(record));
      refused(() => postBounty(world.repo, world.id, 'github'), 'publish-held');
      expect(chainTip(world.repo, world.id)).toBeNull();
      expect(bareTip(world, world.id)).toBeNull();
    }); }
  });

  it('diverged chains merge without losing events and deletion recovers from the local copy', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const other = secondMachine(world);
      syncChains(other);
      // Machine B appends an event and pushes first.
      appendEvent(other, world.id, { v: 1, type: 'solution', at: new Date().toISOString(), n: 7, commit: 'a'.repeat(40), changed: ['x.txt'], added: [], deleted: [] });
      expect(pushChain(other, world.id).pushed).toBe(true);
      // Machine A appends its own event from a stale tip — its push merges.
      appendEvent(world.repo, world.id, { v: 1, type: 'closed', at: new Date().toISOString(), kind: 'rejected', reason: 'no longer needed' });
      expect(pushChain(world.repo, world.id).pushed).toBe(true);
      const events = eventsOf(world.repo, bareTip(world, world.id)!);
      expect(events.map(e => e['type'])).toContain('merge');
      expect(events.map(e => e['type'])).toContain('solution');
      expect(events.map(e => e['type'])).toContain('closed');
      // Remote deletion: the next read restores the ref from this machine.
      execFileSync('git', ['-c', `safe.directory=${other}`, 'push', world.bare, `:refs/box-bounty/${world.id}`], { cwd: other, encoding: 'utf8' });
      expect(bareTip(world, world.id)).toBeNull();
      syncChains(world.repo, true);
      expect(bareTip(world, world.id)).not.toBeNull();
      expect(eventsOf(world.repo, bareTip(world, world.id)!).length).toBe(events.length);
    }); }
  });

  it('the worktree, index and branches never move when the chain is written', () => {
    { const world = sharedFixture(); world.run(() => {
      const statusBefore = git(world.repo, ['status', '--porcelain']);
      postBounty(world.repo, world.id, 'github');
      expect(git(world.repo, ['status', '--porcelain'])).toBe(statusBefore);
      expect(git(world.repo, ['branch', '--list'])).not.toContain('box-bounty/');
    }); }
  });
});
