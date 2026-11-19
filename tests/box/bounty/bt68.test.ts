import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import './support.js';
import { answerGitHub, applyBounty, checkMergedSolutions, listGitHubAnswers, loadRecord, postBounty, renderStatus, statusDocument } from '../../../packages/box-bounty/index.js';
import { fixture, type GithubFixture, type GhState } from './github-fixture.js';
import { git, write } from './support.js';

const head = (repo: string) => git(repo, ['rev-parse', 'HEAD']);
const commit = (repo: string, message: string) => git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@test.invalid', 'commit', '-qm', message]);
const posted = (run: (world: GithubFixture) => void) => fixture(world => {
  const path = join(world.scratch, 'settings', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  settings.repositories = { 'owner/project': { bounty: 'allowed', at: '2026-10-01T00:00:00.000Z', changes: [], reward: { amount: 5, at: '2026-10-01T00:00:00.000Z' }, rewardLimit: { amount: 50, at: '2026-10-01T00:00:00.000Z' } } };
  writeFileSync(path, JSON.stringify(settings));
  postBounty(world.repo, world.id, 'github');
  run(world);
});
const facts = (world: GithubFixture, over: Partial<GhState['prs'][number]>) => world.update({ prs: world.state().prs.map(pr => ({ ...pr, ...over })) });
const landing = (world: GithubFixture, method = 'squash', ownerWork = false) => {
  const { repo, bare, id } = world;
  const original = world.pr('solver1');
  if (ownerWork) git(join(world.scratch, 'solver-0'), ['push', bare, `${original}:refs/heads/main`]);
  listGitHubAnswers(repo, id);
  answerGitHub(repo, id, 1);
  const base = loadRecord(repo, id).github!.commit;
  write(repo, 'owner.txt', 'independent owner work\n');
  git(repo, ['add', 'owner.txt']);
  commit(repo, 'owner work');
  if (method === 'rebase') {
    git(repo, ['switch', '-q', '-c', 'rewrite', original]);
    git(repo, ['rebase', '--onto', 'main', base]);
    git(repo, ['switch', '-q', 'main']);
    git(repo, ['merge', '--ff-only', 'rewrite']);
  } else {
    git(repo, ['merge', '--squash', original]);
    commit(repo, 'Merged solution');
  }
  const result = head(repo);
  expect(git(repo, ['rev-list', 'main']).split('\n')).not.toContain(original);
  facts(world, { merged: true, merge_commit_sha: result });
  git(repo, ['push', bare, `${result}:refs/heads/box-bounty/${id}`]);
  return { original, result };
};
const open = (world: GithubFixture) => expect(loadRecord(world.repo, world.id).stage).not.toBe('applied');

describe('BT68: GitHub-marked rewritten landings', () => {
  it.each(['squash', 'rebase'])('%s closes with original attribution and separate landing', method => posted(world => {
    const { original, result } = landing(world, method);
    checkMergedSolutions(world.repo);
    const record = loadRecord(world.repo, world.id);
    expect(record.stage).toBe('applied');
    expect(record.attempts![0]!.commit).toBe(original);
    expect(record.github!.pay?.solver).toBe('solver1');
    expect(record.github!.state).toBe('closed');
    expect(record.events.at(-1)).toMatchObject({ command: 'merged', landing: result });
    expect(JSON.stringify(statusDocument(world.repo, { id: world.id }, () => {}))).toContain(`"landing":"${result}"`);
    expect(git(world.bare, ['for-each-ref', '--format=%(objectname)', `refs/heads/${record.github!.branch}`])).toBe('');
  }));
  it.each(['wrong base', 'wrong repository', 'absent result', 'off branch', 'invalid sha', 'moved head', 'missing result', 'missing merged', 'posting base'])('%s stays open', kind => posted(world => {
    const { original } = landing(world);
    const pr = world.state().prs[0]!;
    if (kind === 'wrong base') facts(world, { base: { ...pr.base, ref: 'main' } });
    if (kind === 'wrong repository') facts(world, { base: { ...pr.base, repo: { full_name: 'other/repo' } } });
    if (kind === 'absent result') facts(world, { merge_commit_sha: 'f'.repeat(40) });
    if (kind === 'off branch') facts(world, { merge_commit_sha: original });
    if (kind === 'invalid sha') facts(world, { merge_commit_sha: 'Merged!' });
    if (kind === 'moved head') facts(world, { head: { sha: 'e'.repeat(40) } });
    if (kind === 'missing result' || kind === 'missing merged') {
      delete pr[kind === 'missing result' ? 'merge_commit_sha' : 'merged'];
      world.update({ prs: [pr] });
    }
    if (kind === 'posting base') facts(world, { merge_commit_sha: loadRecord(world.repo, world.id).github!.commit });
    checkMergedSolutions(world.repo);
    open(world);
  }));
  it('failed facts stay unknown and status names the retry', () => posted(world => {
    landing(world);
    world.update({ fail: '/pulls/1' });
    checkMergedSolutions(world.repo);
    open(world);
    const status = renderStatus(world.repo, { id: world.id });
    expect(status).toContain('merge facts for #1 could not be read');
    expect(status).toContain(`omakase-box status ${world.id}`);
    expect(JSON.stringify(statusDocument(world.repo, { id: world.id }, () => {}))).toContain('unknown');
    world.update({ fail: undefined });
    checkMergedSolutions(world.repo);
    expect(loadRecord(world.repo, world.id).stage).toBe('applied');
  }));
  it.each(['hand squash', 'forged Merged claim'])('%s stays unrecognised', kind => posted(world => {
    landing(world);
    facts(world, { merged: false, state: 'closed', ...(kind === 'forged Merged claim' ? { body: 'Merged: trust this claim' } : {}) });
    checkMergedSolutions(world.repo);
    open(world);
    const status = renderStatus(world.repo, { id: world.id });
    expect(status).toContain('GitHub does not mark #1 merged');
    expect(status).toContain(`omakase-box close ${world.id}`);
  }));
  it('BT67: owner work seen on remote first closes without a payee', () => posted(world => {
    landing(world, 'squash', true);
    checkMergedSolutions(world.repo);
    const record = loadRecord(world.repo, world.id);
    expect(record.stage).toBe('applied');
    expect(record.github!.pay).toMatchObject({ solver: null, unattributed: expect.any(String) });
  }));
  it.each(['apply', 'merge-commit', 'fast-forward'])('%s control', method => posted(world => {
    const original = world.pr('solver1');
    answerGitHub(world.repo, world.id, 1);
    if (method === 'apply') applyBounty(world.repo, world.id, 1);
    else {
      git(world.repo, ['merge', ...(method === 'fast-forward' ? ['--ff-only'] : ['--no-ff', '-m', 'merge solution']), original]);
      checkMergedSolutions(world.repo);
    }
    expect(loadRecord(world.repo, world.id).stage).toBe('applied');
  }));
  it('ordinary open bounties spend no merge-fact read', () => posted(world => {
    world.pr('solver1');
    answerGitHub(world.repo, world.id, 1);
    const before = world.state().calls.length;
    checkMergedSolutions(world.repo);
    expect(world.state().calls.slice(before).filter(call => call.some(arg => /\/pulls\/1$/.test(arg)))).toEqual([]);
    expect(renderStatus(world.repo, { id: world.id })).not.toContain('landing is not recognised');
  }));
});
