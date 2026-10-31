// BT52 — a later agent on another machine can finish a bounty. A real second
// clone of the bare remote with its own owner-settings folder; the chain is
// forged on the remote itself, where anyone with push access could write it.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowBounty, applyBounty, BountyRefused, closeBounty, loadRecord, lookBounty, postBounty, renderStatus, statusDocument, syncChains } from '../../../packages/box-bounty/index.js';
import { boundAmount } from '../../../packages/box-bounty/format.js';
import { fixture, postedFixture, refused, type GithubFixture } from './github-fixture.js';
import { CLI_DIST, git, recordExists, rewriteRecordRaw, runRoot } from './support.js';

const allowed = (bounty: 'allowed' | 'ask' | null | 'nothing-written'): string => {
  const dir = join(runRoot('bt52-settings'), 'settings');
  mkdirSync(dir, { recursive: true });
  if (bounty !== 'nothing-written') writeFileSync(join(dir, 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': { bounty, at: '2026-10-01T00:00:00.000Z', changes: [] } } }));
  return dir;
};

// Run on the other machine: its own clone and its own owner settings.
function machineB(world: GithubFixture, bounty: 'allowed' | 'ask' | null | 'nothing-written' = 'allowed') {
  git(world.bare, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  const repo = join(runRoot('bt52-machine-b'), 'repo');
  execFileSync('git', ['-c', `safe.directory=${world.bare}`, 'clone', '--no-local', world.bare, repo], { encoding: 'utf8', stdio: 'pipe' });
  git(repo, ['remote', 'set-url', 'origin', 'git@github.com:owner/project.git']);
  const settings = allowed(bounty);
  const on = <T>(action: () => T): T => {
    const before = process.env.BOX_BOUNTY_SETTINGS_DIR;
    process.env.BOX_BOUNTY_SETTINGS_DIR = settings;
    try { return action(); } finally { process.env.BOX_BOUNTY_SETTINGS_DIR = before; }
  };
  return { repo, on };
}

const chainRefOf = (id: string) => `refs/box-bounty/${id}`;
const eventsOn = (bare: string, id: string): Record<string, unknown>[] =>
  git(bare, ['rev-list', '--topo-order', '--reverse', chainRefOf(id)]).split('\n').filter(line => line !== '').map(commit => JSON.parse(git(bare, ['cat-file', 'blob', `${commit}:event.json`])) as Record<string, unknown>);

// A commit written straight onto the remote's chain ref: what anyone with push
// access can do. `parents` empty replaces the chain's history.
function forge(bare: string, id: string, event: Record<string, unknown>, parents: readonly string[]): void {
  const stdin = (args: string[], input: string) => execFileSync('git', ['-c', `safe.directory=${bare}`, '-C', bare, ...args], { input, encoding: 'utf8' }).trim();
  const blob = stdin(['hash-object', '-w', '--stdin'], JSON.stringify(event) + '\n');
  const tree = stdin(['mktree'], `100644 blob ${blob}\tevent.json\n`);
  const commit = git(bare, ['-c', 'user.name=forger', '-c', 'user.email=forger@test.invalid', 'commit-tree', tree, '-m', 'forged', ...parents.flatMap(parent => ['-p', parent])]);
  git(bare, ['update-ref', chainRefOf(id), commit]);
}
const tip = (bare: string, id: string) => git(bare, ['rev-parse', chainRefOf(id)]);
const forgePosted = (world: GithubFixture, change: Record<string, unknown>) => {
  const posted = eventsOn(world.bare, world.id)[0]!;
  forge(world.bare, world.id, { ...posted, ...change }, []);
};
const appendForged = (world: GithubFixture, event: Record<string, unknown>) =>
  forge(world.bare, world.id, { v: 1, at: '2026-10-02T00:00:00.000Z', actor: 'owner', ...event }, [tip(world.bare, world.id)]);

const refusedReason = (action: () => unknown): string => {
  try { action(); } catch (error) { if (error instanceof BountyRefused) return error.reason; throw error; }
  throw new Error('expected a refusal');
};

describe('a later agent on another machine can finish a bounty', { timeout: 180000 }, () => {
  it('fresh clone: status shows the waiting pull request; look shows the change, framed as the solver\'s', () => postedFixture(world => {
    const b = machineB(world);
    b.on(() => {
      const status = renderStatus(b.repo);
      expect(status).toContain(`#1 by`);
      expect(status).not.toContain('posted from another machine (shared');
      expect(status).toContain('stayed on the machine that posted it');
      const look = lookBounty(b.repo, world.id, 1);
      expect(look.attempt.commit).toBe(world.waitingPr);
      expect(look.diff).toContain('fixed');
      const cli = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'look', world.id, '1'], { cwd: b.repo, encoding: 'utf8', env: process.env, timeout: 60000 });
      expect(cli.status, cli.stderr).toBe(0);
      expect(cli.stdout.toLowerCase()).toContain('solver');
      expect(cli.stdout).toContain('fixed');
    });
  }, { prAuthor: 'solver1' }));

  it('fresh clone, apply: merges, GitHub marks it merged, the chain records one merged event', () => postedFixture(world => {
    const b = machineB(world);
    b.on(() => {
      const result = applyBounty(b.repo, world.id, 1);
      expect(result.outcome).toBe('applied');
      expect(git(b.repo, ['merge-base', '--is-ancestor', world.waitingPr, 'HEAD'])).toBe('');
      expect(loadRecord(b.repo, world.id).github!.pending).toBeNull();
    });
    expect(world.state().prs[0]!.merged).toBe(true);
    expect(world.state().issues[0]!.state).toBe('closed');
    expect(eventsOn(world.bare, world.id).filter(event => event['type'] === 'merged')).toHaveLength(1);
  }, { prAuthor: 'solver1' }));

  it('a fresh clone goes straight to look with no status first', () => postedFixture(world => {
    const b = machineB(world);
    b.on(() => expect(lookBounty(b.repo, world.id, 1).attempt.commit).toBe(world.waitingPr));
  }, { prAuthor: 'solver1' }));

  it('no permission here: the merge waits, close is refused, GitHub and the chain are untouched; the owner\'s one answer releases it', () => postedFixture(world => {
    const before = tip(world.bare, world.id);
    const b = machineB(world, 'nothing-written');
    b.on(() => {
      expect(lookBounty(b.repo, world.id, 1).collected).toBe(true);
      expect(tip(world.bare, world.id)).toBe(before);
      refused(() => applyBounty(b.repo, world.id, 1), 'merge-held');
      expect(loadRecord(b.repo, world.id).stage).toBe('waiting');
      refused(() => closeBounty(b.repo, world.id), 'owner-permission-needed');
      expect(world.state().issues[0]!.state).toBe('open');
      expect(world.state().prs[0]!.merged).not.toBe(true);
      expect(git(b.repo, ['log', '--format=%H']).split('\n')).not.toContain(world.waitingPr);
      allowBounty(b.repo, world.id);
      expect(loadRecord(b.repo, world.id).stage).toBe('applied');
    });
    expect(world.state().prs[0]!.merged).toBe(true);
  }, { prAuthor: 'solver1' }));

  it('denied here: the merge waits and close is refused, whatever the shared record says', () => postedFixture(world => {
    const b = machineB(world, null);
    b.on(() => {
      refused(() => applyBounty(b.repo, world.id, 1), 'merge-held');
      refused(() => closeBounty(b.repo, world.id), 'owner-permission-needed');
    });
    expect(world.state().issues[0]!.state).toBe('open');
  }, { prAuthor: 'solver1' }));

  it('ask still holds on the second machine', () => postedFixture(world => {
    const b = machineB(world, 'ask');
    b.on(() => refused(() => applyBounty(b.repo, world.id, 1), 'merge-held'));
    expect(world.state().prs[0]!.merged).not.toBe(true);
  }, { prAuthor: 'solver1' }));

  for (const [label, change] of [
    ['another issue', { issue: { number: 99, url: 'https://github.com/owner/project/issues/99' } }],
    ['an issue in another repository', { issue: { number: 1, url: 'https://github.com/other/place/issues/1' } }],
    ['another commit', { base: 'a'.repeat(40) }],
    ['another author', { actor: 'forger' }],
    ['another branch', { branch: 'main' }]
  ] as const) {
    it(`a tampered posted event naming ${label} is refused by name; nothing is collected`, () => postedFixture(world => {
      forgePosted(world, change);
      const b = machineB(world);
      b.on(() => {
        expect(renderStatus(b.repo)).toContain('not picked up here (shared-record-mismatch)');
        expect(recordExists(b.repo, world.id)).toBe(false);
        refused(() => lookBounty(b.repo, world.id, 1), 'shared-record-mismatch');
        refused(() => applyBounty(b.repo, world.id, 1), 'shared-record-mismatch');
        expect(recordExists(b.repo, world.id)).toBe(false);
      });
      expect(world.state().prs[0]!.merged).not.toBe(true);
    }, { prAuthor: 'solver1' }));
  }

  it('a tampered posted event naming a real issue of the same author that is not this bounty\'s is refused', () => postedFixture(world => {
    const own = world.state().issues[0]!;
    world.update({ issues: [...world.state().issues, { ...own, number: 40, html_url: 'https://github.com/owner/project/issues/40', body: own.body.replaceAll(world.id, 'bt-000000000000') }] });
    forgePosted(world, { issue: { number: 40, url: 'https://github.com/owner/project/issues/40' } });
    const b = machineB(world);
    b.on(() => expect(refusedReason(() => lookBounty(b.repo, world.id, 1))).toBe('shared-record-mismatch'));
  }, { prAuthor: 'solver1' }));

  it('a forged solution event is never offered: only a pull request collects', () => postedFixture(world => {
    appendForged(world, { type: 'solution', n: 77, pullRequest: 77, author: 'forger', commit: 'b'.repeat(40), changed: ['app.txt'], added: [], deleted: [] });
    const b = machineB(world);
    b.on(() => {
      renderStatus(b.repo);
      expect(loadRecord(b.repo, world.id).attempts).toEqual([]);
      expect(() => applyBounty(b.repo, world.id, 77)).toThrow(BountyRefused);
      expect(git(b.repo, ['log', '--format=%H']).split('\n')).not.toContain('b'.repeat(40));
    });
  }, { prAuthor: 'solver1' }));

  it('a forged ending on an open issue ends nothing on the posting machine; the second machine is refused by name', () => postedFixture(world => {
    appendForged(world, { type: 'closed', kind: 'withdrawn' });
    syncChains(world.repo, true);
    renderStatus(world.repo);
    expect(loadRecord(world.repo, world.id).stage).not.toBe('withdrawn');
    const b = machineB(world);
    b.on(() => expect(refusedReason(() => lookBounty(b.repo, world.id, 1))).toBe('shared-record-disputed'));
    expect(world.state().issues[0]!.state).toBe('open');
  }, { prAuthor: 'solver1' }));

  it('reordered events: a forged merged before a second posted still binds to GitHub', () => postedFixture(world => {
    const posted = eventsOn(world.bare, world.id)[0]!;
    forge(world.bare, world.id, { v: 1, type: 'merged', at: '2020-01-01T00:00:00.000Z', actor: 'owner', mergeCommit: 'c'.repeat(40) }, []);
    forge(world.bare, world.id, { ...posted, base: 'd'.repeat(40) }, [tip(world.bare, world.id)]);
    const b = machineB(world);
    b.on(() => expect(['shared-record-mismatch', 'shared-record-disputed']).toContain(refusedReason(() => lookBounty(b.repo, world.id, 1))));
    expect(world.state().prs[0]!.merged).not.toBe(true);
  }, { prAuthor: 'solver1' }));

  it('the reward is read from the issue, not from the chain', () => postedFixture(world => {
    forgePosted(world, { reward: { amount: 999, currency: 'USD' } });
    const b = machineB(world);
    b.on(() => {
      renderStatus(b.repo);
      expect(boundAmount(loadRecord(b.repo, world.id))).toBe(0);
      expect(loadRecord(b.repo, world.id).reward).toEqual({ amount: 0 });
    });
  }, { prAuthor: 'solver1' }));

  it('the allowedBy on a shared record grants nothing and is not kept', () => postedFixture(world => {
    forgePosted(world, { allowedBy: { decision: 'allowed', level: 'project' } });
    const b = machineB(world, 'nothing-written');
    b.on(() => {
      renderStatus(b.repo);
      expect(loadRecord(b.repo, world.id).allowedBy).toBeUndefined();
      refused(() => applyBounty(b.repo, world.id, 1), 'merge-held');
    });
  }, { prAuthor: 'solver1' }));

  it('the posting machine runs afterwards: it sees the bounty ended, and nothing is done twice', () => postedFixture(world => {
    const b = machineB(world);
    b.on(() => applyBounty(b.repo, world.id, 1));
    const comments = world.state().comments.length;
    const head = git(world.repo, ['rev-parse', 'HEAD']);
    const status = renderStatus(world.repo);
    expect(status).toContain('no open bounties');
    expect(loadRecord(world.repo, world.id).stage).toBe('applied');
    expect(loadRecord(world.repo, world.id).events.at(-1)?.command).toBe('shared');
    expect(applyBounty(world.repo, world.id, 1).outcome).toBe('applied');
    closeBounty(world.repo, world.id);
    expect(world.state().comments.length).toBe(comments);
    expect(git(world.repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(eventsOn(world.bare, world.id).filter(event => event['type'] === 'merged')).toHaveLength(1);
  }, { prAuthor: 'solver1' }));

  it('two machines racing: the second has already collected, sees the first\'s merge, and merges nothing', () => postedFixture(world => {
    const b = machineB(world);
    b.on(() => lookBounty(b.repo, world.id, 1));
    const c = machineB(world);
    c.on(() => applyBounty(c.repo, world.id, 1));
    const head = git(b.repo, ['rev-parse', 'HEAD']);
    b.on(() => {
      expect(applyBounty(b.repo, world.id, 1).outcome).toBe('applied');
      expect(loadRecord(b.repo, world.id).events.at(-1)?.command).toBe('shared');
    });
    expect(git(b.repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(eventsOn(world.bare, world.id).filter(event => event['type'] === 'merged')).toHaveLength(1);
  }, { prAuthor: 'solver1' }));

  it('close on a second machine with permission ends it on GitHub', () => postedFixture(world => {
    const b = machineB(world);
    b.on(() => expect(closeBounty(b.repo, world.id, 'not wanted').outcome).toBe('rejected'));
    expect(world.state().issues[0]!.state).toBe('closed');
    expect(eventsOn(world.bare, world.id).at(-1)).toMatchObject({ type: 'closed', kind: 'rejected' });
  }, { prAuthor: 'solver1' }));

  it('a --resume note never enters the chain; the second machine says it stayed behind', () => fixture(world => {
    rewriteRecordRaw(world.repo, world.id, record => { record['resume'] = { kind: 'recorded', branch: 'main', commit: 'a'.repeat(40), changed: [], note: 'PRIVATE-NOTE-TEXT' }; });
    postBounty(world.repo, world.id, 'github');
    expect(JSON.stringify(eventsOn(world.bare, world.id))).not.toContain('PRIVATE-NOTE-TEXT');
    const b = machineB(world);
    b.on(() => {
      const status = renderStatus(b.repo);
      expect(status).toContain('Any --resume note stayed on the machine that posted it');
      expect(status).not.toContain('PRIVATE-NOTE-TEXT');
      const doc = statusDocument(b.repo, {}, () => {});
      expect(JSON.stringify(doc)).toContain('"noteStayedOnPostingMachine":true');
    });
  }));
});
