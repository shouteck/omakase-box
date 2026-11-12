// K67: the owner's authority (hard stop 3) tested at two levels, as never-ship was in K65.
//   Level 1, the decision as data: what the owner has said (a project level, an all-projects default, a denial) against what the
//   tool reads as the standing decision. The owner's rules, written as a table: a project's own word stands over the default, a
//   denial blocks the default, nothing written is never allowed, and one repository's word never reaches another.
//   Level 2, the gate once: one drafted bounty in one repository, walked up the ladder of what the owner could have said, with the
//   refusal and the recorded wait checked at each step (nothing reaches GitHub on any of them).
// The old tests (bt8.test.ts) built a posting world to check precedence; this holds those cases as rows.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finalizeBounty, loadRecord, planBounty, readDecision, settingsFile, writeDecision } from '../../../packages/box-bounty/index.js';
import { writeRepository } from '../../../packages/box-bounty/settings.js';
import { refused } from './github-fixture.js';
import { postToGitHub } from './github-solver.js';
import { git, makeRepo, write } from './support.js';

type Say = 'none' | 'allowed' | 'ask' | 'off' | 'denied' | 'another-repository';
type Read = { decision: 'allowed' | 'ask' | 'off' | null; level: 'project' | 'default' | null; denied?: true };
const DEFAULTS = ['none', 'allowed', 'ask', 'off'] as const;

// The owner's rules, one row per project state; the four answers are for an all-projects default of none, allowed, ask, off.
const RULES: readonly (readonly [Say, string, readonly [Read, Read, Read, Read]])[] = [
  ['none', 'nothing about this repository: the default decides, and nothing at all is never allowed',
    [{ decision: null, level: null }, { decision: 'allowed', level: 'default' }, { decision: 'ask', level: 'default' }, { decision: 'off', level: 'default' }]],
  ['allowed', 'the repository allowed: its own word, whatever the default says',
    [{ decision: 'allowed', level: 'project' }, { decision: 'allowed', level: 'project' }, { decision: 'allowed', level: 'project' }, { decision: 'allowed', level: 'project' }]],
  ['ask', 'the repository asks: a project ask stands over a default allowed, and over every other default',
    [{ decision: 'ask', level: 'project' }, { decision: 'ask', level: 'project' }, { decision: 'ask', level: 'project' }, { decision: 'ask', level: 'project' }]],
  ['off', 'the repository off: a project off stands over a default allowed',
    [{ decision: 'off', level: 'project' }, { decision: 'off', level: 'project' }, { decision: 'off', level: 'project' }, { decision: 'off', level: 'project' }]],
  ['denied', 'the repository denied after being allowed: no decision, marked denied, and no default can allow it',
    [{ decision: null, level: 'project', denied: true }, { decision: null, level: 'project', denied: true }, { decision: null, level: 'project', denied: true }, { decision: null, level: 'project', denied: true }]],
  ['another-repository', 'only another repository is allowed: its word never reaches this one; the default still applies',
    [{ decision: null, level: null }, { decision: 'allowed', level: 'default' }, { decision: 'ask', level: 'default' }, { decision: 'off', level: 'default' }]]
];

function remoteRepo(): string {
  const repo = makeRepo({ 'src/app.py': 'x\n' });
  git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/project.git']);
  return repo;
}
function setUp(repo: string, project: Say, def: (typeof DEFAULTS)[number]): void {
  rmSync(settingsFile(), { force: true });
  if (def !== 'none') writeDecision(repo, 'default', def);
  if (project === 'allowed' || project === 'ask' || project === 'off') writeRepository('owner/project', project);
  if (project === 'denied') { writeRepository('owner/project', 'allowed'); writeRepository('owner/project', null); }
  if (project === 'another-repository') writeRepository('someone/else', 'allowed');
}
const view = (read: ReturnType<typeof readDecision>): Read => ({ decision: read.decision, level: read.level, ...(read.denied === true ? { denied: true as const } : {}) });

describe('K67 level 1: what the owner said, and the decision the tool reads', () => {
  const repo = remoteRepo();
  for (const [project, why, answers] of RULES) {
    for (const [index, def] of DEFAULTS.entries()) {
      // @guards P4 O1
      it(`${why} [project: ${project}, default: ${def}]`, () => {
        setUp(repo, project, def);
        expect(view(readDecision(repo))).toEqual(answers[index]);
      });
    }
  }

  // BT16 rule 6: an all-projects default never chooses between remotes. A checkout with several GitHub remotes, none of them on
  // the owner's list, stays undecided; the owner's own listing of one of them decides, and another repository's listing does not.
  describe('a checkout with two GitHub remotes', () => {
    const two = (): string => {
      const repo = remoteRepo();
      git(repo, ['remote', 'add', 'upstream', 'https://github.com/other/project.git']);
      return repo;
    };

    // @guards O1
    it('the all-projects default alone leaves it undecided', () => {
      const repo = two();
      rmSync(settingsFile(), { force: true });
      writeDecision(repo, 'default', 'allowed');
      expect(readDecision(repo)).toMatchObject({ decision: null, level: null });
    });

    // @guards O1
    it('another repository being listed does not decide it either, default allowed or not', () => {
      const repo = two();
      rmSync(settingsFile(), { force: true });
      writeDecision(repo, 'default', 'allowed');
      writeRepository('someone/else', 'allowed');
      expect(readDecision(repo)).toMatchObject({ decision: null, level: null });
    });

    // @guards O1
    it('listing one of its remotes decides it, at the project level', () => {
      const repo = two();
      rmSync(settingsFile(), { force: true });
      writeDecision(repo, 'default', 'off');
      writeRepository('other/project', 'ask');
      expect(readDecision(repo)).toMatchObject({ decision: 'ask', level: 'project' });
    });
  });

  // @guards O1
  it('nothing written is never read as allowed, with no settings file at all', () => {
    rmSync(settingsFile(), { force: true });
    expect(readDecision(repo)).toMatchObject({ decision: null, level: null });
  });
});

describe('K67 level 2: the gate, once, up the ladder of what the owner could have said', () => {
  // @guards P4 O1
  it('nothing, then ask, then off: each is refused by name, records its own wait, and nothing is posted', () => {
    const repo = remoteRepo();
    write(repo, 'TASK.md', 'the task\n');
    const { id } = finalizeBounty(planBounty({ repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md') }));

    rmSync(settingsFile(), { force: true });
    refused(() => postToGitHub(repo, id), 'owner-allow-needed');
    expect(loadRecord(repo, id)).toMatchObject({ stage: 'waiting', waiting: { reason: 'owner-allow' } });

    writeDecision(repo, 'project', 'ask');
    refused(() => postToGitHub(repo, id), 'owner-answer-needed');
    expect(loadRecord(repo, id)).toMatchObject({ stage: 'waiting', waiting: { reason: 'owner-ask' } });

    writeDecision(repo, 'project', 'off');
    refused(() => postToGitHub(repo, id), 'owner-answer-needed');
    expect(loadRecord(repo, id)).toMatchObject({ stage: 'waiting', waiting: { reason: 'owner-off' } });

    // a denied repository is not asked either: the default cannot speak for it (a repository is denied from allowed or ask, not from off)
    writeDecision(repo, 'project', 'allowed');
    writeRepository('owner/project', null);
    writeDecision(repo, 'default', 'allowed');
    refused(() => postToGitHub(repo, id), 'owner-allow-needed');
  });
});
