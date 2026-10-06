// Owner-side outcome checks, registered per evaluator generator id. A check is a vitest
// file materialized into the scratch owner checkout under tests/box-owner-checks/; it
// runs against the owner tree AFTER the submitted patch is applied, so it can assert
// the outcome the agreement promised actually happened in the real modules — the layer
// the package evaluator cannot see (SUPPORTED-CASE "owner validation/integration").
// Keyed on the evaluator generator so the agreement needs no schema change: the same
// named spec that produced the recipient's checks names the owner-side counterpart.
// An agreement whose evaluator names no registered check is a preparation defect —
// verify refuses to pass a submission it cannot prove.

export interface OwnerCheck {
  // Path inside the owner checkout the check file is written to, and its source.
  readonly file: string;
  readonly source: string;
}

const root = (sourceRoot: string): string => sourceRoot === '.' ? '../..' : `../../${sourceRoot}`;

function requestA(sourceRoot: string): OwnerCheck {
  const base = root(sourceRoot);
  return {
    file: 'tests/box-owner-checks/private-shop-request-a.test.ts',
    source: `// Generated owner-side check for box private-shop-request-a. It reads the
// applied config/response-security.json from this checkout and drives it through the
// real owner loader/policy helpers: a no-op or a schema-valid-but-wrong patch fails
// here even though the package evaluator is green.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyResponsePolicy, loadResponsePolicy } from '${base}/src/policy/loader.js';
import { createPrivateShopApi } from '${base}/src/server.js';

const applied = readFileSync(new URL('${base}/config/response-security.json', import.meta.url), 'utf8');
const policy = loadResponsePolicy(applied);
const HARDENED = { schemaVersion: 1, frameAncestors: 'none', noSniff: true, referrerPolicy: 'no-referrer', hsts: { enabled: true, maxAgeSeconds: 31536000, includeSubDomains: false } };

describe('owner check: applied response security policy', () => {
  it('the applied config carries the hardened values', () => {
    expect(policy).toEqual(HARDENED);
  });
  it('emits all four hardened headers on a remote https route', () => {
    const headers = applyResponsePolicy({}, policy, { https: true, localhost: false, route: '/selection' });
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000');
  });
  it('withholds HSTS on localhost but keeps the other headers', () => {
    const headers = applyResponsePolicy({}, policy, { https: true, localhost: true, route: '/selection' });
    expect(headers['Strict-Transport-Security']).toBeUndefined();
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
  });
  it('leaves /health exempt from every policy header', () => {
    const headers = applyResponsePolicy({ 'Content-Security-Policy': "default-src 'self'" }, policy, { https: true, localhost: false, route: '/health' });
    expect(headers['Content-Security-Policy']).toBe("default-src 'self'");
    expect(headers['X-Content-Type-Options']).toBeUndefined();
    expect(headers['Referrer-Policy']).toBeUndefined();
    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });
  // The live-server level of SUPPORTED-CASE owner validation: through the real
  // server.ts (an interface the package never contained) a localhost /selection
  // shows the non-HSTS headers, and /health stays exempt from all four.
  it('applies the hardened headers through the real server, /health exempt', async () => {
    const app = createPrivateShopApi();
    const host = { host: 'private-shop.localhost:4100' };
    const selection = await app.inject({ method: 'POST', url: '/selection', headers: host, payload: { selectedId: 'basic' } });
    expect(selection.headers['content-security-policy']).toBe("frame-ancestors 'none'");
    expect(selection.headers['x-content-type-options']).toBe('nosniff');
    expect(selection.headers['referrer-policy']).toBe('no-referrer');
    expect(selection.headers['strict-transport-security']).toBeUndefined();
    const health = await app.inject({ url: '/health', headers: host });
    expect(health.headers['content-security-policy']).toBeUndefined();
    expect(health.headers['x-content-type-options']).toBeUndefined();
    expect(health.headers['referrer-policy']).toBeUndefined();
    expect(health.headers['strict-transport-security']).toBeUndefined();
    await app.close();
  });
});
`
  };
}

function requestB(sourceRoot: string): OwnerCheck {
  const base = root(sourceRoot);
  return {
    file: 'tests/box-owner-checks/private-shop-request-b.test.ts',
    source: `// Generated owner-side check for box private-shop-request-b. The editable is a
// new owner file, so a no-op patch fails at compile and a wrong implementation fails
// this contract on the applied bytes.
import { describe, expect, it } from 'vitest';
import { InvalidInput, rankItems } from '${base}/src/ranking/rankItems.js';
import type { PublicItem } from '${base}/src/ranking/rankItems.js';

describe('owner check: applied public ranking', () => {
  it('ranks deterministically without mutating the input', () => {
    const input: PublicItem[] = [{ id: 'z1', score: 2 }, { id: 'a2', score: 2 }, { id: 'm', score: 5 }];
    rankItems(input);
    expect(input.map(item => item.id)).toEqual(['z1', 'a2', 'm']);
    expect(rankItems(input).map(item => item.id)).toEqual(['m', 'a2', 'z1']);
    expect(rankItems([{ id: 'b', score: 1 }, { id: 'a', score: 1 }]).map(item => item.id)).toEqual(['a', 'b']);
  });
  it('rejects malformed input through InvalidInput', () => {
    expect(() => rankItems([{ id: 'a', score: Number.NaN }])).toThrow(InvalidInput);
    expect(() => rankItems([{ id: 'a', score: 1 }, { id: 'a', score: 2 }])).toThrow(InvalidInput);
  });
});
`
  };
}

function kitchenStatsNoUsage(sourceRoot: string): OwnerCheck {
  const base = root(sourceRoot);
  return {
    file: 'tests/box-owner-checks/kitchen-stats-no-usage.test.ts',
    source: `// Generated owner-side check for box r1-kitchen-stats. It drives the APPLIED
// scripts/kitchen-stats.mjs in this checkout as a real process: a no-op patch
// still prints the obsolete "Usage per wave" section, a blank or no-output
// script produces none of the required sections, and a patch that broke the
// exported helpers verify.mjs reuses fails the import probe.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('${base}/scripts/kitchen-stats.mjs', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'r1-owner-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const NOW = Date.parse('2026-02-01T12:00:00.000Z');
const dirName = (ms: number, sha: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + sha.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();

function kitchenRoot(usageLine: boolean): string {
  const dir = temp();
  mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
  mkdirSync(join(dir, 'kitchen'), { recursive: true });
  mkdirSync(join(dir, 'waves'), { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), 'agents\\n');
  writeFileSync(join(dir, 'docs', 'box-v4', 'KITCHEN.md'), 'kitchen\\n');
  writeFileSync(join(dir, 'kitchen', 'INBOX.md'), '- one\\n');
  writeFileSync(join(dir, 'STATUS.md'), 'status\\n');
  const sha = 'a'.repeat(40);
  const run = join(dir, '.kitchen', 'runs', dirName(NOW, sha));
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha, dirty: false, verdict: 'PASS', startedAt: iso(NOW), seconds: 61, steps: [{ name: 'check', exit: 0, seconds: 61 }], notRun: [], failure: null }));
  mkdirSync(join(dir, '.kitchen', 'runs', dirName(NOW + 60000, 'b'.repeat(40))), { recursive: true });
  writeFileSync(join(dir, 'waves', 'w1.md'), ['# w1', '', '- Commit: \`' + 'a'.repeat(40) + '\`', '- Branch: \`wave/w1\`', ...(usageLine ? ['- Usage: 12k tokens'] : []), ''].join('\\n'));
  return dir;
}

const runStats = (rootDir: string) => spawnSync(process.execPath, [script, '--root=' + rootDir], { encoding: 'utf8', timeout: 60000 });

describe('owner check: applied kitchen-stats has no Usage output', () => {
  it('prints every verification section and no usage output, populated or absent', () => {
    for (const usageLine of [true, false]) {
      const run = runStats(kitchenRoot(usageLine));
      expect(run.status, run.stderr).toBe(0);
      for (const section of ['Verify runs', 'Verify minutes per step', 'Runs per wave branch', 'Largest costs', 'Kitchen limits'])
        expect(run.stdout).toContain(section);
      expect(run.stdout).not.toMatch(/usage/i);
      expect(run.stdout).toContain('1 runs with summary.json');
    }
  });

  it('labels missing data instead of printing zeros or crashing', () => {
    const run = runStats(temp());
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('missing');
    expect(run.stdout).not.toMatch(/usage/i);
  });

  it('still exits nonzero and names the broken limit', () => {
    const dir = kitchenRoot(true);
    writeFileSync(join(dir, 'STATUS.md'), Array(61).fill('x').join('\\n') + '\\n');
    const run = runStats(dir);
    expect(run.status).toBe(1);
    expect(run.stderr + run.stdout).toContain('LIMIT FAIL');
    expect(run.stderr + run.stdout).toContain('STATUS.md');
  });

  it('keeps the exported helpers verify.mjs reuses', () => {
    const href = pathToFileURL(script).href;
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', 'import * as k from ' + JSON.stringify(href) + '; console.log(JSON.stringify([typeof k.readRuns, typeof k.stallCheck, typeof k.checkLimits]));'], { encoding: 'utf8', timeout: 30000 });
    expect(probe.status, probe.stderr).toBe(0);
    expect(JSON.parse(probe.stdout.trim())).toEqual(['function', 'function', 'function']);
  });
});
`
  };
}

const REGISTRY: Readonly<Record<string, (sourceRoot: string) => OwnerCheck>> = {
  'private-shop-request-a': requestA,
  'private-shop-request-b': requestB,
  'kitchen-stats-no-usage': kitchenStatsNoUsage
};

export function ownerCheck(generator: string, sourceRoot: string): OwnerCheck | undefined {
  return REGISTRY[generator]?.(sourceRoot);
}
