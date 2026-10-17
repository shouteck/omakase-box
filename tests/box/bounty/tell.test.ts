import { postToGitHub, closeGitHub } from './github-solver.js';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { CLI_DIST, RECORDS_DIR_REL, makeRepo, openLine, ownerSays, runRoot } from './support.js';

const cli = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8' });
const openFile = (repo: string): string => openLine(repo).trim();
const createDraft = (repo: string): string => {
  const run = cli(repo, ['bounty', 'create', '--task', 'TASK.md', '--why', 'stuck']);
  expect(run.status).toBe(0);
  return /bt-[a-f0-9]{12}/.exec(run.stdout)![0];
};

it('describe retains the BT4 choice sentences and supplies facts with no history', () => {
  const repo = makeRepo({ 'TASK.md': 'task\n' });
  const result = cli(repo, ['bounty', 'describe']);
  expect(result.status).toBe(0);
  // Frozen from dispatch b5b4880's BT4 choice sentences, with LF separators —
  // re-pinned for BT11a, which adds the reward sentence where the text ended
  // its thought (the amount is generated from the owner's setting, not typed).
  const choice = result.stdout.split('\n\nthe facts for choosing')[0] ?? '';
  expect(choice).not.toContain('local folder');
  expect(choice).toContain('GitHub issue');
  expect(result.stdout).toContain('worth it when: attempts keep failing');
  expect(result.stdout).toContain('not worth it when: you can plainly do the work');
  expect(result.stdout).toContain('create a draft any time');
  expect(result.stdout).toContain('public and free');
  expect(result.stdout).toContain('reward of $0');
  expect(result.stdout).toContain('no bounty history yet');
});

it('describe and rules work outside a checkout', () => {
  const repo = runRoot('plain');
  expect(cli(repo, ['bounty', 'describe']).stdout).toContain('need a repository');
  const rules = cli(repo, ['bounty', 'describe', '--rules']);
  expect(rules.status).toBe(0);
  expect(rules.stdout).toContain('<!-- box-bounty -->');
  expect(rules.stdout).not.toContain('open bounties:');
});

it('bare bounty gives a cold overview, open work and the next command', () => {
  const repo = makeRepo({ 'TASK.md': 'task\n' });
  const id = createDraft(repo);
  const result = cli(repo, ['bounty']);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('outside solver');
  expect(result.stdout).toContain(id);
  expect(result.stdout).toContain('next:');
  expect(cli(runRoot('plain-overview'), ['bounty', '--repo', repo]).stdout).toContain(id);
  expect(cli(runRoot('plain-overview'), ['bounty']).stdout).toContain('need a repository');
});

describe('the detailed local open-bounties listing', () => {
  it(`${RECORDS_DIR_REL}/OPEN mirrors the records on every mutation`, () => {
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const id = createDraft(repo);
    expect(openFile(repo)).toBe(`open bounties: ${id} "task" (drafted)`);
    ownerSays(repo, 'allowed');
    const posted = postToGitHub(repo, id).record;
    expect(posted.stage).toBe('posted');
    if (posted.github?.issue == null) throw new Error('posted issue missing');
    expect(openFile(repo)).toBe(`open bounties: ${id} "task" (posted) ${posted.github.issue.url} ${posted.github.branch}`);
    expect(closeGitHub(repo, id).outcome).toBe('withdrawn');
    expect(openFile(repo)).toBe('open bounties: none');
  });

});
