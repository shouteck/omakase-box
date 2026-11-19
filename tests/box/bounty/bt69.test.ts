import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BountyRefused } from '../../../packages/box-bounty/errors.js';
import { loadRecord, postBounty } from '../../../packages/box-bounty/index.js';
import { git as objectGit, gitWriteBlob } from '../../../packages/box-bounty/git.js';
import { changePublishList } from '../../../packages/box-bounty/never-ship.js';
import { fixture, refused } from './github-fixture.js';
import { git, runRoot, write } from './support.js';

// BT69: the sink check is proved on its own. The seam below hands the planner
// an empty rule table — its `github-never-ship` is off, in this file only and
// with no production bypass — so whatever is refused here was refused by the
// check before the push. The same seam records every push and every check, and
// fails one Git read at a time inside the check.
const seam = vi.hoisted(() => ({ plannerRules: true, inSink: false, fail: '' as '' | 'ls-remote' | 'rev-list' | 'diff-tree', failPush: false, log: [] as string[] }));

vi.mock('../../../packages/box-bounty/publish-plan.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../packages/box-bounty/publish-plan.js')>();
  return { ...actual, planGitHub: (...[root, repository, record, rules, choice]: Parameters<typeof actual.planGitHub>) => actual.planGitHub(root, repository, record, seam.plannerRules ? rules : [], choice) };
});

vi.mock('../../../packages/box-bounty/git.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../packages/box-bounty/git.js')>();
  const failing = (args: readonly string[]) => seam.inSink && (
    (seam.fail === 'ls-remote' && args[0] === 'ls-remote')
    || (seam.fail === 'rev-list' && args[0] === 'rev-list')
    || (seam.fail === 'diff-tree' && args[0] === 'diff-tree'));
  return {
    ...actual,
    gitOutcome: (...call: Parameters<typeof actual.gitOutcome>) => failing(call[1]) ? { status: 128, stdout: '', stderr: 'fatal: injected read failure' } : actual.gitOutcome(...call),
    gitStdin: (...call: Parameters<typeof actual.gitStdin>) => { if (failing(call[1])) throw new actual.GitFailed('injected read failure'); return actual.gitStdin(...call); }
  };
});

vi.mock('../../../packages/box-bounty/gh.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../packages/box-bounty/gh.js')>();
  return {
    ...actual,
    remoteGit: (...call: Parameters<typeof actual.remoteGit>) => {
      if (call[2][0] === 'push') {
        seam.log.push(`push ${call[2].slice(1).join(' ')}`);
        if (seam.failPush) { seam.failPush = false; return actual.invalid('github-git-failed', 'injected push failure'); }
      }
      return actual.remoteGit(...call);
    }
  };
});

vi.mock('../../../packages/box-bounty/publish-sink.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../packages/box-bounty/publish-sink.js')>();
  return {
    checkOutbound: (...call: Parameters<typeof actual.checkOutbound>) => {
      seam.log.push(`check ${call[2]}`);
      seam.inSink = true;
      try { return actual.checkOutbound(...call); } finally { seam.inSink = false; }
    }
  };
});

const choice = (withChanges: boolean) => ({ withChanges, include: [] as string[] });
const commit = (repo: string, message: string) => git(repo, ['-c', 'user.name=poster', '-c', 'user.email=poster@test.invalid', 'commit', '-qm', message]);
const pushes = () => seam.log.filter(entry => entry.startsWith('push '));
// Every branch on the stand-in GitHub except the public base.
const published = (bare: string) => git(bare, ['for-each-ref', '--format=%(refname)', 'refs/heads/']).split('\n').filter(ref => ref !== '' && ref !== 'refs/heads/main');

function nothingReached(bare: string, issues: () => readonly unknown[]) {
  expect(pushes()).toEqual([]);
  expect(published(bare)).toEqual([]);
  expect(issues()).toHaveLength(0);
}

beforeEach(() => { seam.plannerRules = true; seam.inSink = false; seam.fail = ''; seam.failPush = false; seam.log = []; });

describe('BT69: the never-ship check at the publication sink', () => {
  // @guards P2
  it('with the planner off, work in progress touching a never-ship path is refused before the push and the issue', () => fixture(({ repo, bare, id, state }) => {
    seam.plannerRules = false;
    write(repo, 'key.pem', 'x\n'); git(repo, ['add', '-f', 'key.pem']);
    refused(() => postBounty(repo, id, 'github', { choice: choice(true) }), 'github-publish-never-ship');
    nothingReached(bare, () => state().issues);
    // The frozen publication's retry meets the same check.
    refused(() => postBounty(repo, id, 'github'), 'github-publish-never-ship');
    expect(seam.log.filter(entry => entry.startsWith('check '))).toHaveLength(2);
    nothingReached(bare, () => state().issues);
  }));

  // @guards P2
  it('a persisted retry meets the rules as they are now, not as they were when it was planned', () => fixture(({ repo, bare, id, state }) => {
    write(repo, 'notes/plan.txt', 'the plan\n'); git(repo, ['add', 'notes/plan.txt']); commit(repo, 'plan');
    seam.failPush = true;
    expect(() => postBounty(repo, id, 'github')).toThrow(BountyRefused);
    const frozen = loadRecord(repo, id).github!;
    expect(seam.log).toEqual([`check ${frozen.commit}`, `push ${frozen.commit}:refs/heads/${frozen.branch}`]);
    changePublishList(repo, 'never-publish', 'add', 'notes/plan.txt');
    seam.log = [];
    refused(() => postBounty(repo, id, 'github'), 'github-publish-never-ship');
    expect(seam.log).toEqual([`check ${frozen.commit}`]);
    nothingReached(bare, () => state().issues);
  }));

  // @guards P2
  it('with the planner off, a commit that plants a never-ship path and a later one that deletes it are both read', () => fixture(({ repo, bare, id, state }) => {
    seam.plannerRules = false;
    write(repo, 'app.txt', 'legit\n'); git(repo, ['add', 'app.txt']); commit(repo, 'legit');
    write(repo, '.env', 'CHANGED\n'); git(repo, ['add', '-f', '.env']); commit(repo, 'plant');
    git(repo, ['rm', '-q', '--cached', '.env']); commit(repo, 'drop');
    expect(git(repo, ['ls-tree', '-r', '--name-only', 'HEAD']).split('\n')).not.toContain('.env');
    refused(() => postBounty(repo, id, 'github'), 'github-publish-never-ship');
    nothingReached(bare, () => state().issues);
  }));

  // @guards P2
  it('with the planner off, a never-ship path in an orphan root or a merged side history is refused', () => {
    const plant = (repo: string, label: string, side: boolean) => {
      const env = { GIT_INDEX_FILE: join(runRoot(`bt69-${label}`), 'index') };
      const head = git(repo, ['rev-parse', 'HEAD']);
      const headTree = git(repo, ['rev-parse', 'HEAD^{tree}']);
      const by = ['-c', 'user.name=poster', '-c', 'user.email=poster@test.invalid'];
      objectGit(repo, side ? ['read-tree', head] : ['read-tree', '--empty'], env);
      const secret = gitWriteBlob(repo, Buffer.from('LEAKED_SECRET_BYTES\n'));
      objectGit(repo, ['update-index', '--add', '--cacheinfo', `100644,${secret},payload/.env`], env);
      const planted = objectGit(repo, [...by, 'commit-tree', objectGit(repo, ['write-tree'], env), ...(side ? ['-p', head] : []), '-m', 'plant'], env);
      // The side history drops the file again before the merge; the root is merged as is.
      const tip = side ? objectGit(repo, [...by, 'commit-tree', headTree, '-p', planted, '-m', 'drop'], env) : planted;
      const merge = objectGit(repo, [...by, 'commit-tree', headTree, '-p', head, '-p', tip, '-m', 'merge'], env);
      git(repo, ['update-ref', 'refs/heads/main', merge]);
    };
    for (const side of [false, true]) {
      fixture(({ repo, bare, id, state }) => {
        seam.plannerRules = false; seam.log = [];
        plant(repo, side ? 'side' : 'root', side);
        refused(() => postBounty(repo, id, 'github'), 'github-publish-never-ship');
        nothingReached(bare, () => state().issues);
      });
    }
  });

  // @guards P2
  it('with the planner off, an ordinary range posts and the pushed object is the checked one, before the issue', () => fixture(({ repo, bare, id, state }) => {
    seam.plannerRules = false;
    write(repo, 'app.txt', 'fixed\n'); git(repo, ['add', 'app.txt']); commit(repo, 'fix');
    postBounty(repo, id, 'github');
    const publication = loadRecord(repo, id).github!;
    expect(publication.commit).toBe(git(repo, ['rev-parse', 'HEAD']));
    expect(seam.log).toEqual([`check ${publication.commit}`, `push ${publication.commit}:refs/heads/${publication.branch}`]);
    expect(git(bare, ['rev-parse', `refs/heads/${publication.branch}`])).toBe(publication.commit);
    expect(state().issues).toHaveLength(1);
  }));

  // @guards P2
  it('an empty new range over a never-ship path that is already public posts — public history is a fact, not a refusal', () => fixture(({ repo, bare, id, state }) => {
    write(repo, '.env.local', 'already public\n'); git(repo, ['add', '-f', '.env.local']); commit(repo, 'public before the bounty');
    git(repo, ['push', '-q', bare, 'main']);
    postBounty(repo, id, 'github');
    const publication = loadRecord(repo, id).github!;
    expect(seam.log).toEqual([`check ${publication.commit}`, `push ${publication.commit}:refs/heads/${publication.branch}`]);
    expect(git(bare, ['rev-parse', `refs/heads/${publication.branch}`])).toBe(publication.commit);
    expect(state().issues).toHaveLength(1);
  }));

  // @guards P2
  it('a remote, range or diff read that fails inside the check refuses by name and sends nothing', () => {
    for (const fail of ['ls-remote', 'rev-list', 'diff-tree'] as const) {
      fixture(({ repo, bare, id, state }) => {
        seam.log = [];
        write(repo, 'app.txt', 'fixed\n'); git(repo, ['add', 'app.txt']); commit(repo, 'fix');
        seam.fail = fail;
        refused(() => postBounty(repo, id, 'github'), 'github-git-failed');
        expect(seam.log).toEqual([`check ${git(repo, ['rev-parse', 'HEAD'])}`]);
        nothingReached(bare, () => state().issues);
      });
    }
  });

  // @guards P2
  it('post.ts has one first-publication push, of the checked SHA, after the check and before the issue', () => {
    const source = readFileSync(fileURLToPath(new URL('../../../packages/box-bounty/post.ts', import.meta.url)), 'utf8');
    const pushesInSource = [...source.matchAll(/remoteGit\([^;]*'push'[^;]*\);/g)].map(match => match[0]);
    expect(pushesInSource).toEqual(['remoteGit(root, repository, [\'push\', `${checked}:refs/heads/${publication.branch}`]);']);
    const check = source.indexOf('const checked = checkOutbound(root, repository, publication.commit, shipRules(root), id);');
    const push = source.indexOf(pushesInSource[0]!);
    const issue = source.indexOf('`repos/${repository}/issues`');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(push);
    expect(push).toBeLessThan(issue);
  });
});
