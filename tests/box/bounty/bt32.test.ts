// BT32 — the shared bounty memory: one Git ref per bounty carrying one JSON
// event per commit. These tests run the real sync against the fixture's bare
// "GitHub" remote and a genuine second clone — never a mocked chain.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closeBounty, createBounty, loadRecord, renderStatus, statusDocument, findBounties, postBounty, answerGitHub, applyBounty, renderHelp, renderDescribe, configDocument, setMergeNoticeListener, BountyRefused, syncChains, sharedRead, appendEvent, pushChain } from '../../../packages/box-bounty/index.js';
import { sharedFixture, sharedPostedFixture, refused } from './github-fixture.js';
import type { GithubFixture } from './github-fixture.js';
import { git, readRecordRaw, runRoot, writeRecordRaw } from './support.js';

// Every git process the tool spawns lands in this trace file — the way a
// test counts fetches and pushes instead of trusting throttle state.
function traceGit(label: string, action: () => void): string {
  const file = join(runRoot(label), 'git-trace.log');
  const before = process.env.GIT_TRACE;
  process.env.GIT_TRACE = file;
  try { action(); } finally {
    if (before === undefined) delete process.env.GIT_TRACE; else process.env.GIT_TRACE = before;
  }
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}
const gitCalls = (trace: string, verb: string): number =>
  trace.split('\n').filter(line => new RegExp(`git ${verb}\\b`).test(line)).length;

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

describe('BT32 shared bounty memory', { timeout: 180000 }, () => {
  it('a post writes one chain commit and pushes the ref — clone does not see it by default', () => {
    { const world = sharedFixture(); world.run(() => {
      // Case 1: a created draft is local — no chain ref anywhere, no push.
      expect(chainTip(world.repo, world.id)).toBeNull();
      expect(bareTip(world, world.id)).toBeNull();

      postBounty(world.repo, world.id, 'github');
      const tip = chainTip(world.repo, world.id);
      expect(tip).not.toBeNull();
      const events = eventsOf(world.repo, tip!);
      expect(events).toHaveLength(1);
      const posted = events[0]!;
      expect(posted).toMatchObject({ v: 1, type: 'posted', id: world.id });
      // Case 2, field by field: exactly the allow-list — common fields plus
      // posted's own — and every "never in a chain" name absent.
      const allowed = new Set(['v', 'type', 'at', 'actor', 'id', 'title', 'task', 'why', 'partOf', 'followup', 'base', 'branch', 'issue', 'published', 'reward', 'allowedBy']);
      for (const key of Object.keys(posted)) expect(allowed.has(key), `field ${key} is not on the posted allow-list`).toBe(true);
      for (const never of ['folder', 'resume', 'seenAt', 'waiting', 'scanFindings', 'githubApproval', 'conflicts', 'snapshot', 'decisionMode', 'promised', 'questions', 'told']) {
        expect(posted[never], `never-field ${never} leaked into the chain`).toBeUndefined();
      }
      expect(bareTip(world, world.id)).toBe(tip);
      // An ordinary clone downloads no chain refs (step-0 fact, kept honest).
      const plain = join(runRoot('bt32-plain'), 'repo');
      // A bare remote with no HEAD makes clone fetch every advertised ref —
      // give this remote the ordinary main HEAD real remotes always carry.
      execFileSync('git', ['-c', `safe.directory=${world.bare}`, '-C', world.bare, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { encoding: 'utf8' });
      execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, plain], { encoding: 'utf8' });
      // No local chain ref, and no chain commit reachable from any ref the
      // clone created — the GitHub-side fact (a fresh clone downloads no
      // chain ref at all) is Step 0's evidence. Note: the remote also carries
      // the published solver branch refs/heads/box-bounty/<id>, which every
      // clone legitimately maps to refs/remotes/origin/box-bounty/<id> — it
      // holds the ordinary base commit, never a chain commit.
      expect(git(plain, ['for-each-ref', 'refs/box-bounty'])).toBe('');
      expect(git(plain, ['for-each-ref'])).not.toContain(tip!);
      expect(git(plain, ['ls-files'])).not.toContain('box-bounty');
      // Case 11: grep and log -p over the branch show nothing of the chains.
      let grepped = '';
      try { grepped = execFileSync('git', ['-c', `safe.directory=${plain}`, '-C', plain, 'grep', '-l', 'box-bounty', 'HEAD'], { encoding: 'utf8' }); } catch { /* exit 1 = no match */ }
      expect(grepped.trim()).toBe('');
      expect(execFileSync('git', ['-c', `safe.directory=${plain}`, '-C', plain, 'log', '-p', '--all', '--format=%H'], { encoding: 'utf8' })).not.toContain('event.json');
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
      // find sees it too — recall by purpose crosses machines, including a
      // word that only ever lived in the why (M3/M5).
      expect(findBounties(other, 'repair').total).toBeGreaterThan(0);
      expect(findBounties(other, 'eyes').total).toBeGreaterThan(0);
      // status --json carries the shared bounty with its facts.
      const doc = statusDocument(other, {}, () => {});
      const entry = (doc['bounties'] as Record<string, unknown>[]).find(row => row['id'] === world.id);
      expect(entry, 'status --json names the shared bounty').toBeDefined();
      expect(JSON.stringify(entry)).toContain('need another pair of eyes');
    }); }
  });

  it('collection and apply append solution and merged events; the merge commit carries the why', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      answerGitHub(world.repo, world.id, 1);
      const result = applyBounty(world.repo, world.id, 1);
      expect(result.outcome).toBe('applied');
      const events = eventsOf(world.repo, bareTip(world, world.id)!);
      const types = events.map(e => e['type']);
      expect(types).toEqual(['posted', 'solution', 'merged']);
      const merged = events.at(-1)!;
      expect(merged).toMatchObject({ v: 1, type: 'merged', mergeCommit: result.mergeCommit });
      // Decision 6: git log/blame answer why without the tool (M10).
      const message = git(world.repo, ['log', '-1', '--format=%B', result.mergeCommit!]);
      expect(message).toContain('why: need another pair of eyes');
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

  it('a tool-authored pending push retries on the next sync; a swapped-in tip on a trusted id is never published', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      // Positive: an event the tool committed but never pushed (a crash or
      // a dead remote would leave the same state) is persisted as a pending
      // tip bound to its exact sha — the next sync publishes it.
      appendEvent(world.repo, world.id, { v: 1, type: 'closed', at: new Date().toISOString(), kind: 'withdrawn', reason: 'retried after a crash' });
      expect(bareTip(world, world.id)).not.toBeNull();
      const postedTip = bareTip(world, world.id)!;
      syncChains(world.repo, true);
      const retried = bareTip(world, world.id)!;
      expect(retried).not.toBe(postedTip);
      expect(eventsOf(world.repo, retried).map(e => e['type'])).toContain('closed');

      // Negative: the SAME trusted id's local ref is replaced with a
      // well-formed DESCENDANT of the pushed tip carrying a planted posted
      // event — the exact "replace an existing ref" attack. It matches no
      // recorded authored/pending/pushed provenance, so it must never be
      // pushed, adopted into output or merged onto the remote graph.
      const gitIn = (args: string[], input: string) =>
        execFileSync('git', ['-c', `safe.directory=${world.repo}`, '-c', 'user.name=x', '-c', 'user.email=x@x', '-C', world.repo, ...args], { input, encoding: 'utf8' }).trim();
      const blob = gitIn(['hash-object', '-w', '--stdin'], JSON.stringify({ v: 1, type: 'posted', at: '2026-10-18T02:00:00.000Z', actor: 'x', id: world.id, title: 'PLANTED-NEVER-SHOWN', task: 't', base: 'a'.repeat(40), branch: 'main', issue: { number: 1, url: 'https://github.com/owner/project/issues/1' }, published: { pushed: [] } }) + '\n');
      const tree = gitIn(['mktree'], `100644 blob ${blob}\tevent.json\n`);
      const forged = gitIn(['commit-tree', tree, '-m', 'forged', '-p', retried]);
      git(world.repo, ['update-ref', `refs/box-bounty/${world.id}`, forged]);
      syncChains(world.repo, true);
      syncChains(world.repo, true);
      expect(bareTip(world, world.id), 'the swapped-in descendant was pushed over the trusted tip').toBe(retried);
      const other = secondMachine(world);
      syncChains(other, true);
      expect(sharedRead(other, world.id)?.stage).toBe('withdrawn');
      expect(renderStatus(other)).not.toContain('PLANTED-NEVER-SHOWN');
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

  it('five refreshes inside a minute fetch once', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const other = secondMachine(world);
      const trace = traceGit('bt32-throttle', () => {
        for (let n = 0; n < 5; n += 1) syncChains(other);
      });
      expect(gitCalls(trace, 'fetch')).toBe(1);
    }); }
  });

  it('a dead remote answers from the cache and says so once per spell', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const other = secondMachine(world);
      syncChains(other);
      expect(sharedRead(other, world.id)?.id).toBe(world.id);
      // Kill the remote: the URL still names the project, the path is gone —
      // the fixture maps the URL to this bare dir, so removing the dir is the
      // dead remote.
      rmSync(world.bare, { recursive: true, force: true });
      const notices: string[] = [];
      setMergeNoticeListener(line => notices.push(line));
      try {
        syncChains(other, true);
        syncChains(other, true);
      } finally {
        setMergeNoticeListener(null);
      }
      // The cache still answers — the bounty is there, stale but stated.
      expect(sharedRead(other, world.id)?.id).toBe(world.id);
      const stale = notices.filter(line => line.includes('shared bounty memory not refreshed'));
      expect(stale).toHaveLength(1);
      expect(stale[0]).toContain('showing what this machine last saw');
    }); }
  });

  it('create, help, describe and config never fetch and never push', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      const trace = traceGit('bt32-quiet', () => {
        createBounty({ repoPath: world.repo, taskPath: join(world.repo, 'TASK.md'), title: 'Another task', why: 'still need eyes' });
        renderHelp();
        renderDescribe(world.repo);
        configDocument(world.repo, () => {});
      });
      expect(gitCalls(trace, 'fetch')).toBe(0);
      expect(gitCalls(trace, 'push')).toBe(0);
    }); }
  });

  it('chain import costs a fixed handful of Git processes at any scale (scale-gate regression)', () => {
    { const world = sharedPostedFixture(); world.run(() => {
      // Seed chains straight onto the bare remote with one fast-import —
      // byte-identical commit shape to commitEvent (tree {event.json}).
      const seed = (n: number, events: number, offset = 0): string => {
        let mark = 0;
        const chunks: string[] = [];
        for (let c = 0; c < n; c += 1) {
          const id = `bt-${String(offset + c).padStart(12, '0')}`;
          let prev: number | null = null;
          for (let e = 0; e < events; e += 1) {
            const body = JSON.stringify(e === 0
              ? { v: 1, type: 'posted', at: '2026-10-18T00:00:00.000Z', actor: 'm', id, title: `seeded ${offset + c}`, task: 't', base: 'a'.repeat(40), branch: 'main', issue: { number: offset + c, url: `https://github.com/owner/project/issues/${offset + c}` }, published: { pushed: [] } }
              : { v: 1, type: 'solution', at: '2026-10-18T00:00:00.000Z', n: e, commit: 'b'.repeat(40), changed: [], added: [], deleted: [] }) + '\n';
            const msg = `box-bounty ${id} chain event\n`;
            mark += 1;
            chunks.push(`commit refs/box-bounty/${id}\nmark :${mark}\ncommitter box-bounty <box-bounty@localhost> 1770672000 +0000\ndata ${Buffer.byteLength(msg)}\n${msg}`);
            if (prev !== null) chunks.push(`from :${prev}\n`);
            chunks.push(`M 644 inline event.json\ndata ${Buffer.byteLength(body)}\n${body}\n`);
            prev = mark;
          }
        }
        execFileSync('git', ['-c', `safe.directory=${world.bare}`, '-C', world.bare, 'fast-import', '--quiet'], { input: chunks.join(''), encoding: 'utf8' });
        return `bt-${String(offset).padStart(12, '0')}`;
      };
      const gitStarts = (trace: string): number =>
        trace.split('\n').filter(line => /trace: (built-in|run_command):/.test(line)).length;

      // Small history first: the fixture's one posted chain only.
      const small = secondMachine(world);
      const smallTrace = traceGit('bt32-scale-small', () => syncChains(small, true));
      expect(sharedRead(small, world.id)?.id).toBe(world.id);
      const BOUND = 24;
      expect(gitStarts(smallTrace), 'small import started more Git processes than the fixed bound').toBeLessThanOrEqual(BOUND);

      // Large history: 40 more chains x 3 events, plus a malformed ref whose
      // tip carries no event.json — the negative leg must not break the rest.
      const firstSeeded = seed(40, 3, 100);
      execFileSync('git', ['-c', `safe.directory=${world.bare}`, '-C', world.bare, 'update-ref',
        'refs/box-bounty/bt-ffffffffffff',
        execFileSync('git', ['-c', `safe.directory=${world.bare}`, '-C', world.bare, 'commit-tree', '4b825dc642cb6eb9a060e54bf8d69288fbee4904', '-m', 'empty'], { encoding: 'utf8' }).trim()], { encoding: 'utf8' });
      const large = secondMachine(world);
      const largeTrace = traceGit('bt32-scale-large', () => syncChains(large, true));
      // Nonempty known data: a seeded chain really imported — a do-nothing
      // importer fails here.
      expect(sharedRead(large, firstSeeded)?.title).toBe('seeded 100');
      expect(sharedRead(large, world.id)?.id).toBe(world.id);
      // Malformed/missing-object chain imports nothing and breaks nothing.
      expect(sharedRead(large, 'bt-ffffffffffff')).toBeNull();
      expect(gitStarts(largeTrace), 'large import started more Git processes than the fixed bound — per-chain/per-event subprocesses are back').toBeLessThanOrEqual(BOUND);
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
