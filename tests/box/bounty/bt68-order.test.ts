import { describe, expect, it } from 'vitest';
import './support.js';
import { answerGitHub, checkMergedSolutions, listGitHubAnswers, loadRecord, postBounty } from '../../../packages/box-bounty/index.js';
import { fixture } from './github-fixture.js';
import { git } from './support.js';

describe('BT68: rewritten winner follows landing order', () => {
  it('two squashes before a scan credit the first landed, not the first seen', () => fixture(world => {
    const { repo, id, bare } = world;
    postBounty(repo, id, 'github');
    const one = world.pr('solver-first-seen', { 'one.txt': 'one\n' });
    const two = world.pr('solver-first-landed', { 'two.txt': 'two\n' });
    listGitHubAnswers(repo, id);
    answerGitHub(repo, id, 1);
    answerGitHub(repo, id, 2);
    const land = (sha: string) => {
      git(repo, ['merge', '--squash', sha]);
      git(repo, ['commit', '-qm', 'land solution']);
      return git(repo, ['rev-parse', 'HEAD']);
    };
    const earlier = land(two);
    const later = land(one);
    world.update({ prs: world.state().prs.map(pr => ({ ...pr, merged: true, merge_commit_sha: pr.number === 1 ? later : earlier })) });
    git(repo, ['push', bare, `HEAD:refs/heads/box-bounty/${id}`]);
    checkMergedSolutions(repo);
    const applied = loadRecord(repo, id).events.find(event => event.stage === 'applied');
    expect(applied).toMatchObject({ landing: earlier, reason: expect.stringContaining('pull request #2') });
  }));
});
