// BT56 — a bounty ends as merged only for a commit that came from a solution. The merge scan counted a seen pull
// request whose head was on the creating branch, descended from the posted commit and was new to it. A commit the
// OWNER pushed after posting passes all three, so a stranger's pull request whose head is that commit closed the
// bounty as solved by them, and with a reward the pay message could name them. The fix records, when the tool first
// sees a pull request's head, whether that commit was already on the creating branch; such a head is never a
// merge candidate. Every case that should still close is a control that passes before and after.
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import './support.js';
import { answerGitHub, applyBounty, checkMergedSolutions, closeBounty, listGitHubAnswers, loadRecord, postBounty, renderStatus, setMergeNoticeListener, statusDocument } from '../../../packages/box-bounty/index.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fixture, type GithubFixture } from './github-fixture.js';
import { git, rewriteRecordRaw, runRoot, write } from './support.js';

const STRIPE_LIVE = 'https://buy.stripe.com/9AQ00deadbeef0000';
const noticed: string[] = [];
setMergeNoticeListener(line => noticed.push(line));

// A reward bound at post time, so a wrongful close would truly name a payee (bt44's helper).
const reward5 = (scratch: string): void => {
  const path = join(scratch, 'settings', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  settings.repositories = { ...(settings.repositories ?? {}), 'owner/project': { bounty: 'allowed', at: '2026-10-01T00:00:00.000Z', changes: [], reward: { amount: 5, at: '2026-10-01T00:00:00.000Z' }, rewardLimit: { amount: 50, at: '2026-10-01T00:00:00.000Z' } } };
  writeFileSync(path, JSON.stringify(settings));
};
const posted = (run: (world: GithubFixture) => void) => fixture(world => { reward5(world.scratch); postBounty(world.repo, world.id, 'github'); run(world); });
const tipOf = (bare: string, id: string): string | null => {
  const line = git(bare, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads']).split('\n').find(entry => entry.startsWith(`refs/heads/box-bounty/${id} `));
  return line === undefined ? null : line.split(' ')[1]!;
};
const head = (repo: string): string => git(repo, ['rev-parse', 'HEAD']);
const ownerCommit = (repo: string, file: string): string => {
  write(repo, file, `the owner's own work after the post: ${file}\n`);
  git(repo, ['add', file]);
  git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@test.invalid', 'commit', '-qm', `owner: ${file}`]);
  return head(repo);
};
const seen = (world: GithubFixture) => loadRecord(world.repo, world.id).github!.seenPullRequests ?? [];
const FACT = (branch: string) => `already on ${branch} when first seen here`;

// Nothing closed, nothing said, no payee named, the issue still open.
const stayedOpen = (world: GithubFixture): void => {
  const { repo, id, state } = world;
  noticed.length = 0;
  checkMergedSolutions(repo);
  const record = loadRecord(repo, id);
  expect(record.stage).toBe('posted');
  expect(record.events.some(event => event.command === 'merged')).toBe(false);
  expect(record.github!.pay).toBeUndefined();
  expect(noticed).toEqual([]);
  expect(state().issues[0]!.state).toBe('open');
};

describe('1. a stranger\'s pull request on the owner\'s own commit closes nothing', () => {
  it('the bounty stays open, no payee is named, and status says the fact', () => posted(world => {
    const { repo, bare, id, prCommit, update, state } = world;
    const own = ownerCommit(repo, 'own.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    prCommit(own, 'stranger');
    update({ prs: state().prs.map(pr => ({ ...pr, body: `the fix\npay-to: ${STRIPE_LIVE}` })) });
    const listing = listGitHubAnswers(repo, id);
    stayedOpen(world); // first: on master's code the bounty closes here, which is the fault
    expect(seen(world).some(entry => entry.n === 1 && entry.commit === own && entry.onBranch === true)).toBe(true);
    expect(listing).toContain(FACT('main'));
    expect(listing).toContain('it adds nothing and is not counted as a merge');
    expect(listing).toContain(`omakase-box close ${id}`);
    expect(renderStatus(repo, { id })).toContain(FACT('main'));
  }));
});

describe('the cases that must still close, before and after', () => {
  it('2. a clean apply closes as merged', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    expect(applyBounty(repo, id, 1).outcome).toBe('applied');
    expect(loadRecord(repo, id).stage).toBe('applied');
    expect(tipOf(bare, id)).toBeNull();
  }));

  it('3. a hand merge with a merge commit, after the pull request was listed, closes', () => posted(world => {
    const { repo, id, pr } = world;
    const solution = pr('solver1');
    listGitHubAnswers(repo, id);
    git(repo, ['fetch', 'https://github.com/owner/project.git', solution]);
    git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'agent merged the solution', solution]);
    noticed.length = 0;
    checkMergedSolutions(repo);
    expect(loadRecord(repo, id).stage).toBe('applied');
    expect(noticed.some(line => line.includes('pull request #1') && line.includes('closed'))).toBe(true);
  }));

  it('4. a fast-forward of a solver\'s head, after it was listed, closes', () => posted(world => {
    const { repo, id, pr } = world;
    const solution = pr('solver1');
    listGitHubAnswers(repo, id);
    answerGitHub(repo, id, 1);
    git(repo, ['merge', '--ff-only', solution]);
    checkMergedSolutions(repo);
    expect(loadRecord(repo, id).stage).toBe('applied');
    expect(head(repo)).toBe(solution);
  }));

  it('5. a close interrupted half way finishes on the retry, once', () => posted(world => {
    const { repo, bare, id, pr } = world;
    pr('solver1');
    const hook = (script: string) => { write(bare, 'hooks/update', script); chmodSync(join(bare, 'hooks', 'update'), 0o755); };
    hook('#!/bin/sh\ncase "$3" in 0000000000000000000000000000000000000000) exit 0;; esac\necho refused >&2\nexit 1\n');
    expect(applyBounty(repo, id, 1).outcome).toBe('applied');
    expect(loadRecord(repo, id).github!.pending).toContain('bounty-branch-not-advanced: push-refused');
    hook('#!/bin/sh\nexit 0\n');
    closeBounty(repo, id);
    expect(loadRecord(repo, id).github!.pending).toBeNull();
    expect(loadRecord(repo, id).stage).toBe('applied');
  }));
});

describe('6. the case the rule gives up, and says so', () => {
  it('a solver\'s head the owner merged by hand before any command listed it is not recognised: the fact, and the way to close', () => posted(world => {
    const { repo, id, pr } = world;
    const solution = pr('solver1');
    git(repo, ['fetch', 'https://github.com/owner/project.git', solution]);
    git(repo, ['merge', '--ff-only', solution]);
    const listing = listGitHubAnswers(repo, id); // the first listing: the head is already on the branch
    stayedOpen(world);
    expect(listing).toContain(FACT('main'));
    expect(listing).toContain(`if this is the merged solution, close the bounty: omakase-box close ${id}`);
  }));
});

describe('7. the flag survives the copy from the listing into the seen list', () => {
  it('status --json (and the text status) carry onBranch, and the entry is not a candidate', () => posted(world => {
    const { repo, bare, id, prCommit } = world;
    const own = ownerCommit(repo, 'own7.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    prCommit(own, 'stranger');
    listGitHubAnswers(repo, id, loadRecord(repo, id), false); // listed, not yet shown: only the available list holds it
    const document = statusDocument(repo, { id }, () => {});
    stayedOpen(world);
    expect(loadRecord(repo, id).github!.availablePullRequests!.some(entry => entry.commit === own && entry.onBranch === true)).toBe(true);
    expect(JSON.stringify(document)).toContain('"onBranch":true');
    expect(seen(world).some(entry => entry.commit === own && entry.onBranch === true)).toBe(true);
  }));
});

describe('8. an old record, with no onBranch anywhere, behaves as today', () => {
  it('a seen head the branch reached by a solver\'s merge still closes', () => posted(world => {
    const { repo, id, pr } = world;
    const solution = pr('solver1');
    answerGitHub(repo, id, 1);
    // A record written by master's code: the seen entry has no onBranch.
    rewriteRecordRaw(repo, id, record => {
      (record['github'] as Record<string, unknown>)['seenPullRequests'] = [{ n: 1, commit: solution, at: '2026-10-01T00:00:00.000Z', author: 'solver1' }];
    });
    git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'agent merged the solution', solution]);
    checkMergedSolutions(repo);
    expect(loadRecord(repo, id).stage).toBe('applied');
  }));

  it('a record that plants the owner\'s own commit without the flag keeps today\'s answer (the rule is for heads first seen after this wave)', () => posted(world => {
    const { repo, bare, id, prCommit } = world;
    const own = ownerCommit(repo, 'own8.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    prCommit(own, 'stranger');
    rewriteRecordRaw(repo, id, record => {
      (record['github'] as Record<string, unknown>)['seenPullRequests'] = [{ n: 1, commit: own, at: '2026-10-01T00:00:00.000Z', author: 'stranger' }];
    });
    checkMergedSolutions(repo);
    // Today's behaviour, named here so that changing it is a deliberate edit: an old record is not rewritten behind the owner's back.
    expect(loadRecord(repo, id).stage).not.toBe('posted');
  }));
});

describe('9, 10. a head that moves, and two pull requests on one commit', () => {
  it('9. opened at an older head and moved to the owner\'s commit later: the new (n, commit) is flagged and closes nothing', () => posted(world => {
    const { repo, bare, id, prCommit, update, state } = world;
    const posted0 = tipOf(bare, id)!;
    prCommit(posted0, 'stranger'); // opened at the posted commit itself
    listGitHubAnswers(repo, id);
    const own = ownerCommit(repo, 'own9.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    git(bare, ['update-ref', 'refs/pull/1/head', own]);
    update({ prs: state().prs.map(pr => ({ ...pr, head: { sha: own } })) });
    listGitHubAnswers(repo, id);
    stayedOpen(world);
    expect(seen(world).some(entry => entry.n === 1 && entry.commit === own && entry.onBranch === true)).toBe(true);
  }));

  it('10. two strangers on the one owner commit: neither closes it', () => posted(world => {
    const { repo, bare, id, prCommit } = world;
    const own = ownerCommit(repo, 'own10.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    prCommit(own, 'stranger-a');
    prCommit(own, 'stranger-b');
    listGitHubAnswers(repo, id);
    stayedOpen(world);
    expect(seen(world).filter(entry => entry.commit === own && entry.onBranch === true)).toHaveLength(2);
  }));
});


describe('11, 12. what the rule does not do, pinned so a change is a deliberate edit', () => {
  it('11. a commit that reaches the branch only by a later pull is not on it at first sight, so it is still recognised when pulled (a stated limit)', () => posted(world => {
    const { repo, bare, id, prCommit } = world;
    // The owner's commit is made elsewhere and pushed to the remote's main; this machine's main does not have it yet.
    git(repo, ['switch', '-q', '-c', 'elsewhere']);
    const own = ownerCommit(repo, 'own11.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    git(repo, ['switch', '-q', 'main']);
    prCommit(own, 'stranger');
    listGitHubAnswers(repo, id);
    expect(seen(world).some(entry => entry.commit === own && entry.onBranch === true)).toBe(false); // not on this machine's branch at first sight
    git(repo, ['merge', '--ff-only', own]); // the owner pulls
    checkMergedSolutions(repo);
    // Only authorship could tell this from a solver's head landing by hand, and the rule compares no authors (CONTRACTS.md states the limit).
    expect(loadRecord(repo, id).stage).toBe('applied');
  }));

  it('12. a second machine carries the same branch and applies the rule with its own first sight', () => posted(world => {
    const { repo, bare, id, prCommit } = world;
    git(bare, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    const own = ownerCommit(repo, 'own12.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    prCommit(own, 'stranger');
    // The second machine clones after the owner's push, so the commit is on its main at first sight.
    const other = join(runRoot('bt56-machine-b'), 'repo');
    execFileSync('git', ['-c', `safe.directory=${bare}`, 'clone', '--no-local', bare, other], { encoding: 'utf8', stdio: 'pipe' });
    git(other, ['remote', 'set-url', 'origin', 'git@github.com:owner/project.git']);
    const settings = join(runRoot('bt56-settings-b'), 'settings');
    mkdirSync(settings, { recursive: true });
    writeFileSync(join(settings, 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': { bounty: 'allowed', at: '2026-10-01T00:00:00.000Z', changes: [] } } }));
    const before = process.env.BOX_BOUNTY_SETTINGS_DIR;
    process.env.BOX_BOUNTY_SETTINGS_DIR = settings;
    try {
      renderStatus(other); // adopts the shared record
      const adopted = loadRecord(other, id);
      expect(adopted.resume?.kind === 'recorded' ? adopted.resume.branch : null).toBe('main'); // the branch travels with the record
      listGitHubAnswers(other, id);
      expect((loadRecord(other, id).github!.seenPullRequests ?? []).some(entry => entry.commit === own && entry.onBranch === true)).toBe(true);
      checkMergedSolutions(other);
      expect(loadRecord(other, id).stage).toBe('posted');
    } finally { process.env.BOX_BOUNTY_SETTINGS_DIR = before; }
  }));
});
