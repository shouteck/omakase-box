// BT67 — a payee is named only on first-sight evidence that the head was new work. BT56 recorded, when the tool first
// saw a pull request's head, whether it was already on this machine's creating branch, and used that only to keep the
// head out of the merge scan. Owner work that reached GitHub's default branch first and this machine only later passed
// that check, and every record without the fact (from before BT56, or whose read failed) named the pull request's
// author as the payee. The fix records both facts at first sight — local and GitHub's default branch, with an explicit
// unknown on a failed read — and close.ts names a payee only when both say new. Anything else names nobody and says why.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import './support.js';
import { answerGitHub, applyBounty, checkMergedSolutions, closeBounty, listGitHubAnswers, loadRecord, postBounty, renderStatus, setMergeNoticeListener, statusDocument } from '../../../packages/box-bounty/index.js';
import { fixture, type GithubFixture } from './github-fixture.js';
import { git, rewriteRecordRaw, write } from './support.js';

const STRIPE_LIVE = 'https://buy.stripe.com/9AQ00deadbeef0067';
const noticed: string[] = [];
setMergeNoticeListener(line => noticed.push(line));

const reward5 = (scratch: string): void => {
  const path = join(scratch, 'settings', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  settings.repositories = { ...(settings.repositories ?? {}), 'owner/project': { bounty: 'allowed', at: '2026-10-01T00:00:00.000Z', changes: [], reward: { amount: 5, at: '2026-10-01T00:00:00.000Z' }, rewardLimit: { amount: 50, at: '2026-10-01T00:00:00.000Z' } } };
  writeFileSync(path, JSON.stringify(settings));
};
const posted = (run: (world: GithubFixture) => void) => fixture(world => { reward5(world.scratch); postBounty(world.repo, world.id, 'github'); run(world); });
const head = (repo: string): string => git(repo, ['rev-parse', 'HEAD']);
const ownerCommit = (repo: string, file: string): string => {
  write(repo, file, `the owner's own work after the post: ${file}\n`);
  git(repo, ['add', file]);
  git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@test.invalid', 'commit', '-qm', `owner: ${file}`]);
  return head(repo);
};
const withLink = (world: GithubFixture): void => world.update({ prs: world.state().prs.map(pr => ({ ...pr, body: `the fix\npay-to: ${STRIPE_LIVE}` })) });
const seenEntry = (world: GithubFixture, n: number, commit: string) => loadRecord(world.repo, world.id).github!.seenPullRequests?.find(entry => entry.n === n && entry.commit === commit);
const dropEvidence = (world: GithubFixture): void => rewriteRecordRaw(world.repo, world.id, raw => {
  const github = raw['github'] as Record<string, unknown>;
  for (const key of ['seenPullRequests', 'availablePullRequests']) for (const entry of (github[key] as Record<string, unknown>[] | undefined) ?? []) delete entry['firstSight'];
});

// Merged and recorded as merged, nobody named, nothing owed, and the reason stated wherever pay is read.
const namesNobody = (world: GithubFixture, because: string, out: string): void => {
  const { repo, id } = world;
  const record = loadRecord(repo, id);
  expect(record.stage).toBe('applied');
  expect(record.github!.pay).toMatchObject({ solver: null, link: null, unattributed: expect.any(String) });
  expect(out).toContain(because);
  expect(out).toContain('names no one to pay');
  expect(out).not.toContain('stranger');
  expect(out).not.toContain(STRIPE_LIVE);
  expect(out).not.toContain('which you pay by hand');
  const status = renderStatus(repo, { id });
  expect(status).not.toContain('payment owed');
  expect(status).not.toContain('pay $5');
  expect(status).toContain('no payee named');
  const document = statusDocument(repo, { id }, () => {}) as any;
  const bounty = JSON.stringify(document);
  expect(bounty).toContain('"unattributed"');
  expect(bounty).not.toContain('"owed"');
};
const REMOTE = 'already on the default branch on GitHub when first seen here';
const MISSING = 'keeps no first-sight fact for that head';
const UNKNOWN = 'could not be read when first seen here';

describe('first sight records both facts', () => {
  it('11 (BT56, now rewarded). owner work on GitHub\'s default branch before this machine: recorded at first sight, and the pull names no payee', () => posted(world => {
    const { repo, bare, id, prCommit } = world;
    git(repo, ['switch', '-q', '-c', 'elsewhere']);
    const own = ownerCommit(repo, 'own11.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    git(repo, ['switch', '-q', 'main']);
    prCommit(own, 'stranger');
    withLink(world);
    const listing = listGitHubAnswers(repo, id);
    expect(seenEntry(world, 1, own)?.firstSight).toEqual({ local: 'new', remote: 'contained' });
    expect(listing).toContain(REMOTE);
    git(repo, ['merge', '--ff-only', own]); // the owner pulls
    noticed.length = 0;
    checkMergedSolutions(repo);
    namesNobody(world, REMOTE, noticed.join('\n'));
  }));

  it('a head already on the local branch: both facts contained, and the bounty stays open (BT56)', () => posted(world => {
    const { repo, bare, id, prCommit } = world;
    const own = ownerCommit(repo, 'own-local.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    prCommit(own, 'stranger');
    listGitHubAnswers(repo, id);
    expect(seenEntry(world, 1, own)?.firstSight).toEqual({ local: 'contained', remote: 'contained' });
    checkMergedSolutions(repo);
    expect(loadRecord(repo, id).stage).toBe('posted');
    expect(loadRecord(repo, id).github!.pay).toBeUndefined();
  }));

  it('a moved head is asked again: the older head keeps its facts, the new one gets its own', () => posted(world => {
    const { repo, bare, id, pr } = world;
    const first = pr('stranger');
    listGitHubAnswers(repo, id);
    expect(seenEntry(world, 1, first)?.firstSight).toEqual({ local: 'new', remote: 'new' });
    git(repo, ['switch', '-q', '-c', 'elsewhere']);
    const own = ownerCommit(repo, 'own-moved.txt');
    git(repo, ['push', bare, 'HEAD:refs/heads/main']);
    git(repo, ['switch', '-q', 'main']);
    git(bare, ['update-ref', 'refs/pull/1/head', own]);
    world.update({ prs: world.state().prs.map(entry => ({ ...entry, head: { ...entry.head, sha: own } })) });
    listGitHubAnswers(repo, id);
    expect(seenEntry(world, 1, first)?.firstSight).toEqual({ local: 'new', remote: 'new' });
    expect(seenEntry(world, 1, own)?.firstSight).toEqual({ local: 'new', remote: 'contained' });
    git(repo, ['merge', '--ff-only', own]);
    noticed.length = 0;
    checkMergedSolutions(repo);
    namesNobody(world, REMOTE, noticed.join('\n'));
  }));

  it('a GitHub read that fails at first sight is an explicit unknown, kept as it was, and names nobody', () => posted(world => {
    const { repo, id, pr, update } = world;
    const solution = pr('stranger');
    withLink(world);
    update({ fail: '/compare/' });
    listGitHubAnswers(repo, id);
    update({ fail: undefined });
    listGitHubAnswers(repo, id); // the head is not new any more: the unknown is not asked again
    expect(seenEntry(world, 1, solution)?.firstSight).toEqual({ local: 'new', remote: 'unknown' });
    const result = applyBounty(repo, id, 1);
    expect(result.outcome).toBe('applied');
    namesNobody(world, UNKNOWN, (result.payMessage ?? []).join('\n'));
  }));
});

describe('records without the evidence', () => {
  it('a record from before this wave names nobody: no eligibility from absent evidence', () => posted(world => {
    const { repo, id, pr } = world;
    pr('stranger');
    withLink(world);
    listGitHubAnswers(repo, id);
    dropEvidence(world);
    const result = applyBounty(repo, id, 1);
    expect(result.outcome).toBe('applied');
    namesNobody(world, MISSING, (result.payMessage ?? []).join('\n'));
    // A close that stopped before the pay step leaves no pay outcome: the same rule decides, and nothing is owed.
    rewriteRecordRaw(repo, id, raw => { delete (raw['github'] as Record<string, unknown>)['pay']; });
    expect(renderStatus(repo, { id })).not.toContain('payment owed');
  }));

  it('a close left unfinished with an old payee: the retry replaces it, it is never kept', () => posted(world => {
    const { repo, id, pr } = world;
    pr('stranger');
    withLink(world);
    listGitHubAnswers(repo, id);
    expect(applyBounty(repo, id, 1).outcome).toBe('applied');
    // What an earlier tool left: the payee named, the evidence absent, the GitHub step not finished.
    dropEvidence(world);
    rewriteRecordRaw(repo, id, raw => {
      const github = raw['github'] as Record<string, unknown>;
      github['state'] = 'posted';
      github['pay'] = { pr: 1, solver: 'stranger', link: STRIPE_LIVE, testMode: false, editedBy: null };
    });
    const again = closeBounty(repo, id);
    namesNobody(world, MISSING, (again.payMessage ?? []).join('\n'));
  }));
});

describe('a genuine solver is still named, before and after', () => {
  const named = (world: GithubFixture, out: string): void => {
    const pay = loadRecord(world.repo, world.id).github!.pay!;
    expect(pay.solver).toBe('solver1');
    expect(pay.link).toBe(STRIPE_LIVE);
    expect((pay as { unattributed?: string }).unattributed).toBeUndefined();
    expect(out).toContain(`Pay solver1 at ${STRIPE_LIVE}`);
  };
  it('apply', () => posted(world => {
    const { repo, id, pr } = world;
    pr('solver1');
    withLink(world);
    const result = applyBounty(repo, id, 1);
    expect(result.outcome).toBe('applied');
    named(world, (result.payMessage ?? []).join('\n'));
  }));
  it('a hand merge after the pull request was listed', () => posted(world => {
    const { repo, id, pr } = world;
    const solution = pr('solver1');
    withLink(world);
    listGitHubAnswers(repo, id);
    git(repo, ['fetch', 'https://github.com/owner/project.git', solution]);
    git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'agent merged the solution', solution]);
    noticed.length = 0;
    checkMergedSolutions(repo);
    expect(loadRecord(repo, id).stage).toBe('applied');
    named(world, noticed.join('\n'));
  }));
  it('a fast-forward after it was listed', () => posted(world => {
    const { repo, id, pr } = world;
    const solution = pr('solver1');
    withLink(world);
    listGitHubAnswers(repo, id);
    answerGitHub(repo, id, 1);
    git(repo, ['merge', '--ff-only', solution]);
    noticed.length = 0;
    checkMergedSolutions(repo);
    expect(loadRecord(repo, id).stage).toBe('applied');
    named(world, noticed.join('\n'));
  }));
});
