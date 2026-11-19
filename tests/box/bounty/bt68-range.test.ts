import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import './support.js';
import { answerGitHub, checkMergedSolutions, loadRecord, postBounty } from '../../../packages/box-bounty/index.js';
import { endedNextStep } from '../../../packages/box-bounty/render.js';
import { fixture } from './github-fixture.js';
import { git, write } from './support.js';

describe('BT68: a rewritten landing does not identify the whole rebased range', () => {
  it.each(['partial', 'rollback'])('%s stays unknown for a two-commit rebase', kind => fixture(world => {
    const { repo, id, bare } = world;
    postBounty(repo, id, 'github');
    world.pr('solver', { 'early.txt': 'early\n' });
    const solver = join(world.scratch, 'solver-0');
    write(solver, 'later.txt', 'later\n');
    git(solver, ['add', 'later.txt']);
    git(solver, ['commit', '-qm', 'second solver commit']);
    const original = git(solver, ['rev-parse', 'HEAD']);
    git(solver, ['push', bare, 'HEAD:refs/pull/1/head']);
    world.update({ prs: world.state().prs.map(pr => ({ ...pr, head: { sha: original }, files: [...pr.files, { filename: 'later.txt' }] })) });
    answerGitHub(repo, id, 1);
    const base = loadRecord(repo, id).github!.commit;
    write(repo, 'owner.txt', 'unrelated owner work\n');
    git(repo, ['add', 'owner.txt']);
    git(repo, ['commit', '-qm', 'owner work']);
    git(repo, ['switch', '-q', '-c', 'rebased', original]);
    git(repo, ['rebase', '--onto', 'main', base]);
    git(repo, ['switch', '-q', 'main']);
    git(repo, ['merge', '--ff-only', 'rebased']);
    const landing = git(repo, ['rev-parse', 'HEAD']);
    world.update({ prs: world.state().prs.map(pr => ({ ...pr, merged: true, merge_commit_sha: landing })) });
    git(repo, ['push', bare, `HEAD:refs/heads/box-bounty/${id}`]);
    checkMergedSolutions(repo);
    const record = loadRecord(repo, id);
    expect(record.stage).toBe('applied');
    if (kind === 'partial') expect(record.events.at(-1)?.partial ?? []).toEqual([]);
    else {
      const next = endedNextStep(record);
      expect(next).toContain('rollback range unknown');
      expect(next).not.toContain('git revert');
      expect(existsSync(join(repo, 'owner.txt'))).toBe(true);
    }
  }));
});
