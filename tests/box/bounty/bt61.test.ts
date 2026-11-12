// BT61: a program gets every answer as data, refusals included. Under --json a refusal or a usage error is one document
// (`box-bounty/refusal@1`) on standard output with standard error empty, the exit code is today's, and a command that
// could not take --json before takes it now. The text of every command is frozen by bt61-text.test.ts.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharedFixture } from './github-fixture.js';
import { CLI_DIST, makeRepo, runRoot } from './support.js';

type Doc = Record<string, unknown>;
const box = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });
/** Standard output is exactly one JSON line and nothing else. */
const one = (stdout: string): Doc => {
  expect(stdout.endsWith('\n'), 'the document ends with a newline').toBe(true);
  expect(stdout.trim().split('\n'), 'standard output holds one line').toHaveLength(1);
  return JSON.parse(stdout) as Doc;
};

describe('BT61: a refusal or a usage error under --json is one document', { timeout: 300000 }, () => {
  const repo = makeRepo({ 'TASK.md': 'task\n' });
  const outside = mkdtempSync(join(tmpdir(), 'box-bt61-outside-'));

  // One easy refusal per command, driven with --json. `exit` is what the same command exits with today without --json.
  const REFUSALS: { command: string; cwd: () => string; args: string[]; exit: number }[] = [
    { command: 'post', cwd: () => repo, args: ['post', '--json'], exit: 3 },
    { command: 'apply', cwd: () => repo, args: ['apply', '--json'], exit: 3 },
    { command: 'look', cwd: () => repo, args: ['look', '1', '--json'], exit: 3 },
    { command: 'close', cwd: () => repo, args: ['close', '--json'], exit: 3 },
    { command: 'status', cwd: () => repo, args: ['status', 'bt-000000000000', '--json'], exit: 3 },
    { command: 'find', cwd: () => outside, args: ['find', 'x', '--json'], exit: 3 },
    { command: 'create', cwd: () => repo, args: ['create', '--task', 'missing.md', '--why', 'x', '--json'], exit: 3 },
    { command: 'take', cwd: () => repo, args: ['take', 'bt-000000000000', '--json'], exit: 3 },
    { command: 'submit', cwd: () => repo, args: ['submit', 'bt-000000000000', '--json'], exit: 3 },
    { command: 'discover', cwd: () => repo, args: ['discover', '--from', 'sideways', '--json'], exit: 3 },
    { command: 'allow', cwd: () => repo, args: ['allow', '--reward', 'five', '--json'], exit: 3 },
    { command: 'config', cwd: () => repo, args: ['config', 'unexpected', '--json'], exit: 3 }
  ];

  it('2. one refusal per command: one document, standard error empty, the exit code unchanged', () => {
    for (const row of REFUSALS) {
      const withJson = box(row.cwd(), row.args);
      const withoutJson = box(row.cwd(), row.args.filter(arg => arg !== '--json'));
      expect(withJson.status, `${row.command} --json: ${withJson.stdout}${withJson.stderr}`).toBe(row.exit);
      expect(withoutJson.status, `${row.command} without --json`).toBe(row.exit);
      expect(withJson.stderr, `${row.command} wrote to standard error under --json`).toBe('');
      const doc = one(withJson.stdout);
      expect(doc['schema']).toBe('box-bounty/refusal@1');
      expect(doc['command']).toBe(row.command);
      expect(typeof doc['refused']).toBe('string');
      expect(doc['refused']).not.toBe('');
      expect(typeof doc['message']).toBe('string');
      expect(doc['exitCode']).toBe(row.exit);
      // the name is the one the text view prints, `<command> refused (<name>): ...`
      expect(withoutJson.stderr, `${row.command}`).toContain(`refused (${String(doc['refused'])})`);
    }
  });

  it('2b. the message and the next step are split from the "; next: " every refusal carries', () => {
    const doc = one(box(repo, ['post', '--json']).stdout);
    expect(String(doc['message'])).not.toContain('; next: ');
    expect(typeof doc['next']).toBe('string');
    expect(String(doc['next']).length).toBeGreaterThan(0);
    expect(Object.keys(doc)).toEqual(['schema', 'command', 'refused', 'message', 'next', 'exitCode', 'usage']);
  });

  it('3. a usage error under --json is the same document, refused "usage", exit 2, with the usage lines', () => {
    for (const args of [['status', '--nope', '--json'], ['describe', '--nope', '--json'], ['take', '--json'], ['submit', '--json']]) {
      const ran = box(repo, args);
      expect(ran.status, `${args.join(' ')}: ${ran.stdout}${ran.stderr}`).toBe(2);
      expect(ran.stderr).toBe('');
      const doc = one(ran.stdout);
      expect(doc['schema']).toBe('box-bounty/refusal@1');
      expect(doc['refused']).toBe('usage');
      expect(doc['exitCode']).toBe(2);
      expect(Array.isArray(doc['usage'])).toBe(true);
    }
  });

  it('3b. the three old json-not-supported uses are usage errors now, and the name is retired', () => {
    for (const args of [['status', '--since', '2026-01-01T00:00:00Z', '--json'], ['config', 'set', 'reward', '5', '--json']]) {
      const ran = box(repo, args);
      const doc = one(ran.stdout);
      expect(doc['refused'], args.join(' ')).not.toBe('json-not-supported');
    }
    const create = box(repo, ['create', '--task', 'TASK.md', '--why', 'x', '--json']);
    expect(create.stdout + create.stderr).not.toContain('json-not-supported');
  });

  it('7. a name holding a quote, a newline, a control character and a brace reaches the message intact', () => {
    const hostile = 'a"b\nc}\u0007d';
    const ran = box(repo, ['take', hostile, '--json']);
    expect(ran.status).toBe(3);
    expect(ran.stderr).toBe('');
    const doc = one(ran.stdout);
    expect(doc['refused']).toBe('bounty-id-invalid');
    expect(String(doc['message'])).toContain(hostile);
  });

  it('a refusal that exits 0 today (the owner has not allowed it) is the same document with exitCode 0', () => {
    const world = sharedFixture();
    world.run(() => {
      writeFileSync(join(world.scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
      const ran = box(world.repo, ['post', world.id, '--json']);
      expect(ran.status, ran.stdout + ran.stderr).toBe(0);
      expect(ran.stderr).toBe('');
      const doc = one(ran.stdout);
      expect(doc['schema']).toBe('box-bounty/refusal@1');
      expect(doc['exitCode']).toBe(0);
      expect(['owner-allow-needed', 'owner-answer-needed', 'publish-held', 'merge-held']).toContain(doc['refused']);
    });
  });

  it('every command table entry takes --json, except the bare overview', () => {
    const scratch = runRoot('bt61-help');
    for (const command of ['help', 'describe', 'create', 'post', 'apply', 'close', 'allow', 'deny', 'take', 'submit', 'hook', 'find', 'status', 'look', 'config', 'discover']) {
      const ran = spawnSync(process.execPath, [CLI_DIST, 'bounty', command, '--help'], { cwd: scratch, encoding: 'utf8', env: process.env });
      expect(ran.status, command).toBe(0);
      expect(ran.stdout.split('--json').length - 1, `${command} --help names --json once`).toBeGreaterThanOrEqual(1);
    }
  });
});
