#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const quote = name => `"${name.replaceAll('"', '""')}"`;
const refuse = name => { throw new Error(name); };

export function manifest(sql, requiredTables = []) {
  if (typeof sql !== 'string' || !sql.trim()) refuse('backup-empty-dump');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(sql);
    const names = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
    if (!names.length || requiredTables.some(name => !names.includes(name))) refuse('backup-missing-tables');
    return { version: 1, tables: Object.fromEntries(names.map(name => [name, db.prepare(`SELECT COUNT(*) AS count FROM ${quote(name)}`).get().count])) };
  } catch (error) {
    if (['backup-missing-tables'].includes(error.message)) throw error;
    refuse('backup-invalid-dump');
  } finally { db.close(); }
}

function validate(value) {
  if (!value || value.version !== 1 || !value.tables || typeof value.tables !== 'object' || Array.isArray(value.tables)
    || !Object.keys(value.tables).length || Object.entries(value.tables).some(([name, count]) => !name || !Number.isSafeInteger(count) || count < 0)) refuse('backup-invalid-manifest');
}

export function compare(expected, actual) {
  validate(expected);
  validate(actual);
  const names = [...new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)])].sort();
  if (names.some(name => !Object.hasOwn(expected.tables, name) || !Object.hasOwn(actual.tables, name) || expected.tables[name] !== actual.tables[name])) refuse('backup-count-mismatch');
  return actual;
}

export function drill() {
  const scratch = mkdtempSync(join(tmpdir(), 'kitchen-PF47-'));
  const schema = readFileSync(join(here, 'schema.sql'), 'utf8');
  const required = Object.keys(manifest(schema).tables);
  const wrangler = join(here, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const run = (config, args) => {
    const result = spawnSync(process.execPath, [wrangler, '--config', config, ...args], {
      cwd: scratch, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: 'pipe'
    });
    if (result.status !== 0) refuse('backup-local-wrangler-failed');
  };
  try {
    const configs = ['source', 'restored'].map(name => {
      const folder = join(scratch, name);
      mkdirSync(folder);
      const config = join(folder, 'wrangler.toml');
      writeFileSync(config, 'name = "backup-drill"\ncompatibility_date = "2026-10-01"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "backup-drill"\ndatabase_id = "00000000-0000-0000-0000-000000000045"\n');
      return config;
    });
    const seeded = join(scratch, 'seed.sql');
    writeFileSync(seeded, schema + `
INSERT INTO repositories VALUES ('sample/repo', 'TypeScript', 'main', 1);
INSERT INTO bounties (id, repository, issue_number, title, task, poster, issue_state, amount, created_at, work_commit, seen_at)
VALUES ('sample-bounty', 'sample/repo', 1, 'Sample bounty', 'Sample task', 'sample-owner', 'open', 500, '2026-01-01', 'sample-commit', 1);
INSERT INTO pull_requests (bounty_id, number, author, state, opened_at) VALUES ('sample-bounty', 1, 'sample-solver', 'open', '2026-01-01');
INSERT INTO events (bounty_id, sha, type) VALUES ('sample-bounty', 'sample-event', 'paid');
INSERT INTO sessions VALUES ('sample-hash', 45, 'sample-owner', 1);
INSERT INTO methods VALUES (45, 'sample-solver', 0, 'sample', 'sample-address', NULL, 'public');
INSERT INTO paid_clicks VALUES ('sample-bounty', 'sample-owner', 'sample-solver', 500, 0, '2026-01-01');
INSERT INTO stripe_accounts VALUES (45, 'sample-stripe-account', 1);
INSERT INTO paypal_accounts VALUES (45, 'sample-paypal-account', 1);
INSERT INTO pay_settings VALUES (45, 'sample-customer', 'sample-method', 'sample card', 500);
INSERT INTO pay_repositories VALUES (45, 'sample/repo', '2026-01-01', 500);
INSERT INTO charges (bounty_id, state, amount, at, provider) VALUES ('sample-bounty', 'paid', 500, 1, 'paypal');
INSERT INTO receipts VALUES ('sample-bounty', 'sample-solver', 'received', '2026-01-01', '2026-01-01');
INSERT INTO meta VALUES ('drill', 'sample');
INSERT INTO hints VALUES ('sample-bounty', 1);
INSERT INTO log VALUES (1, 'sample', 'sample/repo#1');
`);
    run(configs[0], ['d1', 'execute', 'backup-drill', '--local', '--file', seeded]);
    const sourceSql = join(scratch, 'source.sql');
    run(configs[0], ['d1', 'export', 'backup-drill', '--local', '--output', sourceSql]);
    const source = manifest(readFileSync(sourceSql, 'utf8'), required);
    run(configs[1], ['d1', 'execute', 'backup-drill', '--local', '--file', sourceSql]);
    const restoredSql = join(scratch, 'restored.sql');
    run(configs[1], ['d1', 'export', 'backup-drill', '--local', '--output', restoredSql]);
    const restored = manifest(readFileSync(restoredSql, 'utf8'), required);
    console.log(JSON.stringify({ source, restored }));
    compare(source, restored);
    console.log('backup-drill-match');
    return { source, restored };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

function readManifest(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { refuse('backup-invalid-manifest'); }
}

function main(args) {
  if (args[0] === 'drill' && args.length === 1) return drill();
  if (args[0] === 'manifest' && args.length === 2) {
    const required = Object.keys(manifest(readFileSync(join(here, 'schema.sql'), 'utf8')).tables);
    let sql;
    try { sql = readFileSync(args[1], 'utf8'); } catch { refuse('backup-unreadable-dump'); }
    console.log(JSON.stringify(manifest(sql, required), null, 2));
    return;
  }
  if (args[0] === 'compare' && args.length === 3) {
    console.log(JSON.stringify(compare(readManifest(args[1]), readManifest(args[2])), null, 2));
    return;
  }
  refuse('backup-usage: node backup.mjs manifest <trusted.sql> | compare <expected.json> <actual.json> | drill');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(error.message.startsWith('backup-') ? error.message : 'backup-failed');
    process.exitCode = 1;
  }
}
