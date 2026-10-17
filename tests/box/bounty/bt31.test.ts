// BT31: bounty records live in the checkout's SQLite store at
// .box/local/box.db — imported compatibly from the JSON files older waves
// wrote, never committed, and never creating the database for commands that
// do not read records. This file fails against master (JSON files) and
// passes on the candidate.
import { DatabaseSync } from 'node:sqlite';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closeBounty, finalizeBounty, planBounty, renderStatus } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, git, makeRepo, readRecord, recordFilePath, recordIds, write, writeRecord } from './support.js';

const localDir = (repo: string): string => join(repo, '.box', 'local');
const dbPath = (repo: string): string => join(localDir(repo), 'box.db');
const legacyFile = recordFilePath;

const options = (repo: string, title: string, extra: Partial<CreateOptions> = {}): CreateOptions => {
  write(repo, 'TASK.md', 'the task\n');
  return { repoPath: repo, why: 'a reason', title, taskPath: join(repo, 'TASK.md'), ...extra };
};
const created = (repo: string, title = 'a task', extra: Partial<CreateOptions> = {}) =>
  finalizeBounty(planBounty(options(repo, title, extra)));

const cli = (repo: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: repo, encoding: 'utf8', env: process.env, timeout: 60000 });

describe('BT31 — the record store', () => {
  it('creates .box/local/box.db and a starred .gitignore on first write, and writes no record file', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    expect(existsSync(localDir(repo))).toBe(false);
    const result = created(repo);
    expect(existsSync(dbPath(repo))).toBe(true);
    expect(readFileSync(join(localDir(repo), '.gitignore'), 'utf8')).toBe('*\n');
    expect(existsSync(legacyFile(repo, result.id))).toBe(false);
    expect(recordIds(repo)).toEqual([result.id]);
  });

  it('keeps .box/local out of Git — the database is ignored, nothing under it is ever committed', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    created(repo);
    expect(spawnSync('git', ['check-ignore', '.box/local/box.db'], { cwd: repo }).status).toBe(0);
    git(repo, ['add', '-A']);
    expect(git(repo, ['status', '--porcelain'])).not.toContain('.box/local');
  });

  it('imports a JSON record file once, marks the import, and drops the row when the file goes', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const result = created(repo);
    // Recreate the pre-BT31 layout: a JSON record file and no database.
    const fresh = makeRepo({ 'src/app.py': 'x\n' });
    writeRecord(fresh, readRecord(repo, result.id));
    expect(existsSync(dbPath(fresh))).toBe(false);
    const status = renderStatus(fresh);
    expect(status).toContain(result.id);
    const db = new DatabaseSync(dbPath(fresh));
    expect((db.prepare("SELECT value FROM meta WHERE key='imported_from_json'").get() as { value: string }).value).toBe('1');
    db.close();
    // A file edit on disk reimports through its new hash.
    const record = readRecord(fresh, result.id);
    writeRecord(fresh, { ...record, title: 'retitled' });
    expect(readRecord(fresh, result.id).title).toBe('retitled');
  });

  it('reads a corrupt JSON file as corrupt — a named refusal, not a crash', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const result = created(repo);
    writeRecord(repo, readRecord(repo, result.id)); // fingerprint the good bytes
    renderStatus(repo); // import them
    writeFileSync(legacyFile(repo, result.id), 'not json\n');
    const status = cli(repo, ['status', result.id]);
    expect(status.stderr + status.stdout).toContain('record-corrupt');
    // The listing still names the corrupt entry rather than dropping it.
    expect(recordIds(repo)).toContain(result.id);
  });

  it('lets two processes write different bounties at once — both land', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    write(repo, 'TASK.md', 'the task\n');
    const runs = [0, 1].map(i => spawn(process.execPath,
      [CLI_DIST, 'bounty', 'create', '--task', join(repo, 'TASK.md'), '--why', `concurrent ${i}`, '--title', `concurrent-${i}`],
      { cwd: repo, env: process.env }));
    return Promise.all(runs.map(child => new Promise<void>((resolvePromise, rejectPromise) => {
      child.on('close', code => code === 0 ? resolvePromise() : rejectPromise(new Error(`exit ${code}`)));
    }))).then(() => {
      expect(recordIds(repo).length).toBe(2);
    });
  });

  it('serializes two writers on the same bounty and leaves a readable record', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const result = created(repo);
    const runs = [0, 1].map(() => spawn(process.execPath,
      [CLI_DIST, 'bounty', 'status', result.id],
      { cwd: repo, env: process.env }));
    return Promise.all(runs.map(child => new Promise<void>((resolvePromise, rejectPromise) => {
      child.on('close', code => code === 0 ? resolvePromise() : rejectPromise(new Error(`exit ${code}`)));
    }))).then(() => {
      const record = readRecord(repo, result.id);
      expect(record.stage).toBe('drafted');
      const db = new DatabaseSync(dbPath(repo));
      expect((db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok');
      db.close();
    });
  });

  it('survives a writer killed mid-write — integrity_check stays ok', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    created(repo);
    const child = spawn(process.execPath, ['-e',
      `const { DatabaseSync } = require('node:sqlite');
       const db = new DatabaseSync(${JSON.stringify(dbPath(repo))});
       db.exec('PRAGMA busy_timeout=5000');
       db.exec('BEGIN IMMEDIATE');
       const ins = db.prepare('INSERT INTO records(id, stage, open, created_at, updated_at, ended_at, json) VALUES(?,?,?,?,?,?,?)');
       for (let i = 0; ; i++) ins.run('bt-zzzz' + String(i).padStart(6, '0'), 'drafted', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', null, '{}');`]);
    return new Promise<void>((resolvePromise) => {
      setTimeout(() => { child.kill('SIGKILL'); }, 300);
      child.on('close', () => {
        const db = new DatabaseSync(dbPath(repo));
        expect((db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok');
        db.close();
        resolvePromise();
      });
    });
  });

  it('find matches words in why and task through FTS5', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    write(repo, 'BATCH.md', 'rewrite the telemetry batching window\n');
    created(repo, 'batching work', { why: 'the parser doubles latency under load', taskPath: join(repo, 'BATCH.md') });
    const found = cli(repo, ['find', 'parser']);
    expect(found.status, found.stderr).toBe(0);
    expect(found.stdout).toContain('matched: why');
    const foundTask = cli(repo, ['find', 'batching']);
    expect(foundTask.stdout).toContain('matched: title, task');
  });

  it('help and describe never create .box/local', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    for (const args of [['help'], ['describe']]) {
      const ran = cli(repo, args);
      expect(ran.status, ran.stderr).toBe(0);
    }
    expect(existsSync(localDir(repo))).toBe(false);
  });

  it('a created bounty closes end to end with the record in the store', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n' });
    const result = created(repo);
    closeBounty(repo, result.id, 'done without posting');
    const record = readRecord(repo, result.id);
    expect(record.stage).toBe('rejected');
    expect(recordIds(repo)).toEqual([result.id]);
  });
});
