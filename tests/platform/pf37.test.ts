// PF37: the board can be restored, rolled back and watched. What a test can hold here: the database records which migrations
// ran (and applying the record twice changes nothing), migrate.mjs names exactly the files still to run, and the watch
// tells a healthy board from a stale or unreachable one. The restore and rollback themselves were tried on throwaway
// Cloudflare resources (waves/PF37.md); a test cannot reach an account.
import { execFile, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { startLocal } from '../../packages/box-platform/src/local.js';
import { SCHEMA } from './support.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PACKAGE = join(ROOT, 'packages', 'box-platform');
const MIGRATIONS = join(PACKAGE, 'migrations');
const read = (file: string) => readFileSync(join(PACKAGE, file), 'utf8');
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-pf37-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const files = () => readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql')).sort();
const recorded = (db: DatabaseSync) => (db.prepare('SELECT name FROM migrations ORDER BY name').all() as { name: string }[]).map(row => row.name);
const shape = (db: DatabaseSync) => db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
// The schema as it was before PF37: the live board's, with every older migration applied.
const SCHEMA_BEFORE = (): string => {
  const shown = spawnSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/').replace(/\/$/, '')}`, '-C', ROOT, 'show', '4b86686e:packages/box-platform/schema.sql'], { encoding: 'utf8' });
  expect(shown.status, shown.stderr).toBe(0);
  return shown.stdout;
};

describe('PF37: the database records which migrations ran', () => {
  it('a new board starts with one row per migration file', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(read('schema.sql'));
    expect(recorded(db)).toEqual(files());
    expect(files()).toContain('pf37.sql');
    db.close();
  });

  it('the live board, given pf37.sql twice, has the same schema as a new board and eight rows, with no error', () => {
    const live = new DatabaseSync(':memory:');
    live.exec(SCHEMA_BEFORE());
    expect(() => live.prepare('SELECT 1 FROM migrations').get(), 'the board before PF37 has no record').toThrow();
    live.exec(read('migrations/pf37.sql'));
    live.exec(read('migrations/pf37.sql'));
    expect(recorded(live)).toEqual(files());
    const fresh = new DatabaseSync(':memory:');
    fresh.exec(read('schema.sql'));
    expect(shape(live)).toEqual(shape(fresh));
    // The dates the older files are given are this wave's, and the record says so.
    const older = live.prepare("SELECT note FROM migrations WHERE name <> 'pf37.sql'").all() as { note: string }[];
    expect(older.every(row => row.note.includes('real date unknown'))).toBe(true);
    live.close();
    fresh.close();
  });

  it('migrate.mjs, given what the board has recorded, names exactly the files still to run, in order, and changes nothing', () => {
    const dir = temp();
    const copy = join(dir, 'migrations');
    mkdirSync(copy);
    for (const name of files()) copyFileSync(join(MIGRATIONS, name), join(copy, name));
    writeFileSync(join(copy, 'zz-test.sql'), 'SELECT 1;\n');
    const applied = join(dir, 'applied.json');
    // The answer `wrangler d1 execute --json` gives: one result set whose rows name the recorded files.
    writeFileSync(applied, JSON.stringify([{ results: files().map(name => ({ name })), success: true }]));
    const run = (args: string[]) => spawnSync(process.execPath, [join(PACKAGE, 'migrate.mjs'), ...args], { encoding: 'utf8' });
    const ran = run(['--applied', applied, '--migrations', copy]);
    expect(ran.status, ran.stderr).toBe(0);
    const commands = ran.stdout.split('\n').filter(line => line.includes('d1 execute'));
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('migrations/zz-test.sql');
    expect(commands[0]).toContain('--remote');
    // With nothing recorded at all (a board from before PF37), it says to run pf37.sql first.
    // The shape wrangler really prints then (read on the throwaway database, PF37): an error object, no result sets.
    writeFileSync(applied, JSON.stringify({ error: { text: 'A request to the Cloudflare API failed.', notes: [{ text: 'no such table: migrations: SQLITE_ERROR [code: 7500]' }], kind: 'error' } }));
    const before = run(['--applied', applied, '--migrations', copy]);
    expect(before.status).toBe(0);
    expect(before.stdout).toContain('migrations/pf37.sql');
    // With no argument it prints the one read to run, and nothing else.
    const plain = run([]);
    expect(plain.status).toBe(0);
    expect(plain.stdout).toContain('SELECT name FROM migrations');
    expect(plain.stdout).not.toContain('--file');
  });
});

describe('PF37: the watch', { timeout: 120000 }, () => {
  // Asynchronous: the local board's server runs in this process, so a blocking call would leave it unable to answer.
  const watch = (address: string) => new Promise<{ status: number | null; stdout: string; stderr: string }>(done => {
    const child = execFile(process.execPath, [join(ROOT, 'scripts', 'watch.mjs'), address], { encoding: 'utf8', timeout: 60000 }, (error, stdout, stderr) => done({ status: error === null ? 0 : typeof error.code === 'number' ? error.code : null, stdout, stderr }));
    void child;
  });

  it('passes on a healthy board, fails naming staleness on one that stopped reading, and fails naming the address when nothing answers', async () => {
    const out = temp();
    writeFileSync(join(out, 'index.html'), '<!doctype html><title>board</title>');
    const board = await startLocal({ schema: SCHEMA, out, now: () => Date.now(), seed: () => undefined });
    try {
      await board.refresh();
      const healthy = await watch(board.url);
      expect(healthy.status, healthy.stdout + healthy.stderr).toBe(0);
      // The board last read GitHub two hours ago (the fact numbers.json reports, set as the refresh would have set it).
      await board.env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'read_at'").bind(String(Date.now() - 2 * 3600000)).run();
      // numbers.json keeps its answer for 15 minutes (numbers.ts NUMBERS_FRESH_MS); let that copy expire as time would.
      await board.env.DB.prepare("DELETE FROM meta WHERE key = 'numbers_at'").run();
      const stale = await watch(board.url);
      expect(stale.status).toBe(1);
      expect(stale.stdout + stale.stderr).toMatch(/has not read GitHub for \d+ minutes/);
    } finally { await board.stop(); }
    const gone = await watch('http://127.0.0.1:9');
    expect(gone.status).toBe(1);
    expect(gone.stdout + gone.stderr).toContain('http://127.0.0.1:9');
  });

  it('the workflow has no secret, no permission, a schedule, and runs on no pull request', () => {
    const text = readFileSync(join(ROOT, '.github', 'workflows', 'watch.yml'), 'utf8');
    expect(text).not.toContain('secrets.');
    expect(text).toMatch(/^permissions: \{\}$/m);
    expect(text).toMatch(/schedule:\s*\n\s*- cron:/);
    expect(text).not.toContain('pull_request');
    expect(text).toContain('scripts/watch.mjs');
  });
});

describe('PF37: an export never enters the repository', () => {
  it('no tracked file looks like an export, and the only .sql files are the schema and the migrations', () => {
    const tracked = spawnSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/').replace(/\/$/, '')}`, '-C', ROOT, 'ls-files'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    expect(tracked.filter(path => /(^|\/)(open-bounty-board|board)[-_].*\d{4}.*\.sql$|export.*\.sql$/i.test(path))).toEqual([]);
    expect(tracked.filter(path => path.endsWith('.sql') && !path.startsWith('packages/box-platform/migrations/') && path !== 'packages/box-platform/schema.sql')).toEqual([]);
  });
});
