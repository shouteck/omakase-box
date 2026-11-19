import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const { compare, manifest } = await import(new URL('../../packages/box-platform/backup.mjs', import.meta.url).href);

const script = fileURLToPath(new URL('../../packages/box-platform/backup.mjs', import.meta.url));
const schema = readFileSync(new URL('../../packages/box-platform/schema.sql', import.meta.url), 'utf8');

describe('PF47 backup count manifests', () => {
  it('fact: counts every user table, including empty and quoted names, without row contents', () => {
    const result = manifest('CREATE TABLE "odd""name" (value TEXT); CREATE TABLE empty (id); INSERT INTO "odd""name" VALUES (\'private sample\'), (\'second\');');
    expect(result).toEqual({ version: 1, tables: { empty: 0, 'odd"name': 2 } });
    expect(JSON.stringify(result)).not.toContain('private sample');
    expect(manifest(schema).tables).toHaveProperty('charges', 0);
  });

  // @guards PL6
  it('fact: empty, invalid and incomplete dumps have named refusals, not SQL contents', () => {
    expect(() => manifest('  ')).toThrow('backup-empty-dump');
    expect(() => manifest('SELECT 1')).toThrow('backup-missing-tables');
    expect(() => manifest('CREATE TABLE one (id);', ['charges'])).toThrow('backup-missing-tables');
    expect(() => manifest('private sample invalid SQL')).toThrow(/^backup-invalid-dump$/);
  });

  it('fact: comparison accepts equal table counts independent of key order', () => {
    const a = { version: 1, tables: { empty: 0, charges: 2 } };
    const b = { version: 1, tables: { charges: 2, empty: 0 } };
    expect(compare(a, b)).toEqual(b);
  });

  // @guards PL6
  it('fact: deliberate lost payment row, missing table and extra table refuse loudly', () => {
    const expected = { version: 1, tables: { charges: 2, empty: 0 } };
    for (const tables of [{ charges: 1, empty: 0 }, { charges: 2 }, { charges: 2, empty: 0, extra: 0 }]) {
      expect(() => compare(expected, { version: 1, tables })).toThrow('backup-count-mismatch');
    }
  });

  // @guards PL6
  it('fact: malformed manifest values cannot become a successful comparison', () => {
    for (const bad of [null, {}, { version: 2, tables: { a: 0 } }, { version: 1, tables: {} }, { version: 1, tables: [] },
      { version: 1, tables: { a: -1 } }, { version: 1, tables: { a: '1' } }, { version: 1, tables: { a: 0.5 } }]) {
      expect(() => compare(bad, bad)).toThrow('backup-invalid-manifest');
    }
  });

  it('fact: the manifest CLI refuses invalid SQL with a nonzero exit', () => {
    const result = spawnSync(process.execPath, [script, 'manifest', script], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('backup-invalid-dump');
    expect(result.stderr).not.toContain('import {');
  });
});

describe('PF47 scheduled backup workflow', () => {
  it('fact: opt-in scheduled export suppresses links and uploads only encrypted SQL and counts', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/d1-backup.yml', import.meta.url), 'utf8');
    expect(workflow).toContain("if: vars.D1_BACKUP_ENABLED == 'true' || github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('backup-missing-configuration:');
    for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'D1_BACKUP_AGE_RECIPIENT']) expect(workflow).toContain(key);
    const remoteLines = workflow.split('\n').filter(line => line.includes('--remote'));
    expect(remoteLines).toHaveLength(1);
    expect(remoteLines[0]).toMatch(/d1 export open-bounty-board --remote .* >\/dev\/null 2>&1; then$/);
    expect(workflow).not.toMatch(/set -[^\n]*x|ACTIONS_STEP_DEBUG|tee /);
    const validate = workflow.indexOf('node backup.mjs manifest');
    const encrypt = workflow.indexOf('age --encrypt --recipient');
    const remove = workflow.indexOf('rm -f "$dump"', encrypt);
    const upload = workflow.indexOf('uses: actions/upload-artifact@v7');
    expect(validate).toBeGreaterThan(0);
    expect(encrypt).toBeGreaterThan(validate);
    expect(remove).toBeGreaterThan(encrypt);
    expect(upload).toBeGreaterThan(remove);
    expect(workflow).toContain("trap 'rm -f \"$dump\"' EXIT");
    const paths = workflow.slice(workflow.indexOf('          path:', upload), workflow.indexOf('          if-no-files-found:', upload));
    expect(paths.trim().split('\n').map(line => line.trim())).toEqual([
      'path: |', '${{ runner.temp }}/board.sql.age', '${{ runner.temp }}/board-manifest.json'
    ]);
    expect(workflow).not.toContain('actions/cache');
    expect(workflow).toContain('retention-days: 90');
  });
});

it('fact: real local D1 exports, restores into fresh state and matches every table including payment samples', () => {
  const result = spawnSync(process.execPath, [script, 'drill'], { encoding: 'utf8', timeout: 570000 });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('backup-drill-match');
  const counts = JSON.parse(result.stdout.split('\n')[0] ?? '');
  expect(counts.source).toEqual(counts.restored);
  expect(Object.keys(counts.source.tables).sort()).toEqual(Object.keys(manifest(schema).tables).sort());
  for (const table of ['charges', 'stripe_accounts', 'paypal_accounts', 'pay_settings', 'pay_repositories', 'receipts']) {
    expect(counts.source.tables[table]).toBe(1);
  }
}, 600000);
