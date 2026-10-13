import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_DIST, makeRepo, ownerSays, runRoot, write } from './support.js';

// BT4 — telling the agent: describe, describe --rules, the limits file, and
// the open-bounties line the tool keeps current in .box/bounties/OPEN and in
// the marked block of the owner's rules file. (`remind` was removed in BT7c —
// the "reminders" switch stays a known limits field, nothing gates on it.)

const cli = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8' });
const built = existsSync(CLI_DIST);
const needBuilt = () => { if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first'); };

const limits = (repo: string, content: string | object): void =>
  write(repo, '.box/limits.json', typeof content === 'string' ? content : JSON.stringify(content));

const openFile = (repo: string): string => readFileSync(join(repo, '.box', 'bounties', 'OPEN'), 'utf8').trim();

const createDraft = (repo: string): string => {
  const out = join(runRoot('out'), 'bounty');
  const run = cli(repo, ['bounty', 'create', '--task', 'TASK.md', '--why', 'stuck', '--out', out]);
  expect(run.status).toBe(0);
  return /bt-[a-f0-9]{12}/.exec(run.stdout)![0];
};

describe('box bounty describe (built cli)', () => {
  it('prints the description outside a checkout and says the facts need a repository', () => {
    needBuilt();
    const run = cli(runRoot('plain'), ['bounty', 'describe']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('box bounty');
    expect(run.stdout).toContain('worth it when');
    expect(run.stdout).toContain('not worth it when');
    expect(run.stdout).toContain('need a repository');
  });

  it('prints the facts from the limits file and live records', () => {
    needBuilt();
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    limits(repo, { cost: 'each bounty costs real money', expectedAnswer: 'usually a day', reminders: 'on' });
    const id = createDraft(repo);
    const run = cli(repo, ['bounty', 'describe']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('each bounty costs real money');
    expect(run.stdout).toContain('usually a day');
    expect(run.stdout).toContain('numbered attempt');
    expect(run.stdout).toContain('facts about the change');
    expect(run.stdout).toContain(`open bounties: ${id} `);
    expect(run.stdout).toContain('(drafted)');
  });

  it('says plainly when the facts are not set', () => {
    needBuilt();
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    const run = cli(repo, ['bounty', 'describe']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('cost: not stated');
    expect(run.stdout).toContain('expected wait: not stated');
    expect(run.stdout).toContain('open bounties: none');
    expect(run.stdout).not.toBe('');
  });

  it('--rules prints the pasteable block with markers and the open-bounties line', () => {
    needBuilt();
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    const id = createDraft(repo);
    const run = cli(repo, ['bounty', 'describe', '--rules']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('<!-- box-bounty -->');
    expect(run.stdout).toContain('<!-- /box-bounty -->');
    expect(run.stdout).toContain(`open bounties: ${id} `);
  });

  it('--rules works outside a checkout as a template', () => {
    needBuilt();
    const run = cli(runRoot('plain'), ['bounty', 'describe', '--rules']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('<!-- box-bounty -->');
    expect(run.stdout).toContain('open bounties: none');
  });
});

describe('the limits file (built cli)', () => {
  it('refuses malformed JSON by name', () => {
    needBuilt();
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    limits(repo, '{ not json');
    for (const args of [['bounty', 'describe'], ['bounty', 'create', '--task', 'TASK.md', '--why', 'w', '--preview'], ['bounty', 'describe', '--rules']]) {
      const run = cli(repo, args);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('limits-malformed');
    }
    // and a mutation refuses before anything is written
    const created = cli(repo, ['bounty', 'create', '--task', 'TASK.md', '--why', 'w', '--out', join(runRoot('o'), 'b')]);
    expect(created.status).toBe(3);
    expect(created.stderr).toContain('limits-malformed');
  });

  it('refuses a known field of the wrong shape and ignores unknown fields', () => {
    needBuilt();
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    limits(repo, { reminders: 'yes please' });
    expect(cli(repo, ['bounty', 'describe']).status).toBe(3);
    limits(repo, { reminders: 'on', futureField: { anything: true } });
    const run = cli(repo, ['bounty', 'describe']);
    expect(run.status).toBe(0);
  });
});

describe('the open-bounties line the tool keeps current', () => {
  it('.box/bounties/OPEN mirrors the records on every mutation', () => {
    needBuilt();
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const id = createDraft(repo);
    expect(openFile(repo)).toBe(`open bounties: ${id} "task" (drafted)`);
    ownerSays(repo, 'allowed');
    expect(cli(repo, ['bounty', 'post', id, '--to', join(runRoot('dest'), 'inbox')]).status).toBe(0);
    expect(openFile(repo)).toBe(`open bounties: ${id} "task" (posted)`);
    expect(cli(repo, ['bounty', 'close', id]).status).toBe(0);
    expect(openFile(repo)).toBe('open bounties: none');
  });

  it('rewrites the marked block of the named rules file — inside the markers only', () => {
    needBuilt();
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    write(repo, 'RULES.md', 'header line\n<!-- box-bounty -->\nstale text\nopen bounties: stale\n<!-- /box-bounty -->\ntrailer line\n');
    limits(repo, { rulesFile: 'RULES.md' });
    const id = createDraft(repo);
    const text = readFileSync(join(repo, 'RULES.md'), 'utf8');
    expect(text.startsWith('header line\n<!-- box-bounty -->\n')).toBe(true);
    expect(text.endsWith('<!-- /box-bounty -->\ntrailer line\n')).toBe(true);
    expect(text).toContain(`open bounties: ${id} "task" (drafted)`);
    expect(text).not.toContain('stale text');
    // a second mutation keeps the line current and the outside byte-identical
    ownerSays(repo, 'allowed');
    cli(repo, ['bounty', 'post', id, '--to', join(runRoot('dest'), 'inbox')]);
    const again = readFileSync(join(repo, 'RULES.md'), 'utf8');
    expect(again).toContain('(posted)');
    expect(again.startsWith('header line\n')).toBe(true);
    expect(again.endsWith('trailer line\n')).toBe(true);
  });

  it('leaves a rules file without markers, or a missing one, exactly as it was', () => {
    needBuilt();
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    write(repo, 'RULES.md', 'no markers here\n');
    limits(repo, { rulesFile: 'RULES.md' });
    createDraft(repo);
    expect(readFileSync(join(repo, 'RULES.md'), 'utf8')).toBe('no markers here\n');
    // a named file that does not exist is never created
    limits(repo, { rulesFile: 'docs/MISSING.md' });
    const id2 = createDraft(repo);
    expect(id2).toMatch(/^bt-/);
    expect(existsSync(join(repo, 'docs', 'MISSING.md'))).toBe(false);
  });

  it('refuses a rulesFile that resolves outside the repository', () => {
    needBuilt();
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    limits(repo, { rulesFile: '../elsewhere.md' });
    const run = cli(repo, ['bounty', 'describe']);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('rules-file-outside-repo');
  });
});

describe('allowedDestinations (built cli)', () => {
  const draftPostable = (repo: string): string => {
    const id = createDraft(repo);
    ownerSays(repo, 'allowed');
    return id;
  };

  it('refuses post --to outside the listed directories by name', () => {
    needBuilt();
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const allowed = join(runRoot('allowed'), 'drop');
    limits(repo, { allowedDestinations: [allowed] });
    const id = draftPostable(repo);
    const refused = cli(repo, ['bounty', 'post', id, '--to', join(runRoot('elsewhere'), 'x')]);
    expect(refused.status).toBe(3);
    expect(refused.stderr).toContain('destination-not-allowed');
    // inside the allowed directory works
    const ok = cli(repo, ['bounty', 'post', id, '--to', allowed]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('posted');
  });

  it('a junction spelling cannot slip a --to past the allowed list', () => {
    needBuilt();
    if (process.platform !== 'win32') return; // junction semantics are Windows
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const allowed = join(runRoot('allowed'), 'drop');
    const elsewhere = join(runRoot('elsewhere'), 'real');
    write(elsewhere, 'marker.txt', 'x\n');
    write(allowed, '.keep', 'x\n'); // the allowed dir exists so the junction can sit inside it
    symlinkSync(elsewhere, join(allowed, 'sub'), 'junction'); // allowed/sub really is elsewhere
    limits(repo, { allowedDestinations: [allowed] });
    const id = draftPostable(repo);
    const run = cli(repo, ['bounty', 'post', id, '--to', join(allowed, 'sub', 'deeper')]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('destination-not-allowed');
    expect(existsSync(join(elsewhere, 'deeper'))).toBe(false);
  });
});
