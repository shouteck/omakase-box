import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_DIST, makeRepo, ownerSays, runRoot } from './support.js';

const cli = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8' });
const openFile = (repo: string): string => readFileSync(join(repo, '.box', 'bounties', 'OPEN'), 'utf8').trim();
const createDraft = (repo: string): string => {
  const run = cli(repo, ['bounty', 'create', '--task', 'TASK.md', '--why', 'stuck', '--out', join(runRoot('out'), 'bounty')]);
  expect(run.status).toBe(0);
  return /bt-[a-f0-9]{12}/.exec(run.stdout)![0];
};

it('describe retains the BT4 choice sentences and supplies facts with no history', () => {
  const repo = makeRepo({ 'TASK.md': 'task\n' });
  const result = cli(repo, ['bounty', 'describe']);
  expect(result.status).toBe(0);
  // Frozen from dispatch b5b4880's BT4 choice sentences, with LF separators.
  const choice = result.stdout.split('\n\nthe facts for choosing')[0] ?? '';
  expect(createHash('sha256').update(choice).digest('hex')).toBe('ec537cc3d1a4b704c61ef7dfa29de474de570e425b6b5fd31be09ea080eb931f');
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
  it('.box/bounties/OPEN mirrors the records on every mutation', () => {
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const id = createDraft(repo);
    expect(openFile(repo)).toBe(`open bounties: ${id} "task" (drafted)`);
    ownerSays(repo, 'allowed');
    expect(cli(repo, ['bounty', 'post', id, '--to', join(runRoot('dest'), 'inbox')]).status).toBe(0);
    expect(openFile(repo)).toBe(`open bounties: ${id} "task" (posted)`);
    expect(cli(repo, ['bounty', 'close', id]).status).toBe(0);
    expect(openFile(repo)).toBe('open bounties: none');
  });

});
