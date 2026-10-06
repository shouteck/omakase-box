import type { BoxAgreement } from './agreement.js';

// Everything the recipient sees that is not owner source is generated here, deterministically,
// from the agreement: package manifest, tsconfig, evaluator checks and contribution scaffolds.
// Generator output is recorded in box.json provenance as origin "generated", never as owner bytes.

export function packageManifest(agreement: BoxAgreement): string {
  return JSON.stringify({
    name: `box-${agreement.box.id}`,
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies: agreement.declaredDependencies,
    devDependencies: { typescript: agreement.toolchain.typescript, vitest: agreement.toolchain.vitest, '@types/node': agreement.toolchain.typesNode },
    engines: { node: agreement.toolchain.node },
    packageManager: `pnpm@${agreement.toolchain.pnpm}`
  }, null, 2) + '\n';
}

export function tsconfigJson(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      strict: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      lib: ['es2022', 'dom'],
      types: ['node'],
      noEmit: true
    },
    include: ['src', 'evaluator']
  }, null, 2) + '\n';
}

const EVALUATOR_REQUEST_A = `import { describe, expect, it } from 'vitest';
import policyJson from '../src/config/response-security.json';
import { applyResponsePolicy, loadResponsePolicy } from '../src/policy/loader.js';

const HARDENED = { schemaVersion: 1, frameAncestors: 'none', noSniff: true, referrerPolicy: 'no-referrer', hsts: { enabled: true, maxAgeSeconds: 31536000, includeSubDomains: false } } as const;

describe('request-a response policy helpers', () => {
  it('loadResponsePolicy parses the shipped config', () => {
    const policy = loadResponsePolicy(JSON.stringify(policyJson));
    expect(policy.schemaVersion).toBe(1);
  });
  it('applyResponsePolicy emits the hardened headers on a remote https route', () => {
    const policy = loadResponsePolicy(JSON.stringify(HARDENED));
    const headers = applyResponsePolicy({}, policy, { https: true, localhost: false, route: '/selection' });
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000');
  });
  it('applyResponsePolicy withholds HSTS on localhost but keeps the other headers', () => {
    const policy = loadResponsePolicy(JSON.stringify(HARDENED));
    const headers = applyResponsePolicy({}, policy, { https: true, localhost: true, route: '/selection' });
    expect(headers['Strict-Transport-Security']).toBeUndefined();
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
  });
  it('applyResponsePolicy leaves /health exempt from all policy headers', () => {
    const policy = loadResponsePolicy(JSON.stringify(HARDENED));
    const headers = applyResponsePolicy({ 'Content-Security-Policy': "default-src 'self'" }, policy, { https: true, localhost: false, route: '/health' });
    expect(headers['Content-Security-Policy']).toBe("default-src 'self'");
    expect(headers['X-Content-Type-Options']).toBeUndefined();
    expect(headers['Referrer-Policy']).toBeUndefined();
    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });
  it('loadResponsePolicy rejects malformed policy documents', () => {
    expect(() => loadResponsePolicy('{"schemaVersion":1,"schemaVersion":2}')).toThrow();
    expect(() => loadResponsePolicy('{"schemaVersion":1}')).toThrow();
  });
});
`;

const EVALUATOR_REQUEST_B = `import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidInput, rankItems } from '../src/ranking/rankItems.js';
import type { PublicItem } from '../src/ranking/rankItems.js';

describe('request-b public ranking contract', () => {
  it('does not mutate the input array', () => {
    const input: PublicItem[] = [{ id: 'z1', score: 2 }, { id: 'a2', score: 2 }, { id: 'm', score: 5 }];
    const snapshot = input.map(item => item.id);
    rankItems(input);
    expect(input.map(item => item.id)).toEqual(snapshot);
  });
  it('orders by score descending and breaks equal scores by ASCII id ascending', () => {
    expect(rankItems([{ id: 'b', score: 1 }, { id: 'a', score: 1 }]).map(item => item.id)).toEqual(['a', 'b']);
    expect(rankItems([{ id: 'z1', score: 2 }, { id: 'a2', score: 2 }, { id: 'm', score: 5 }]).map(item => item.id)).toEqual(['m', 'a2', 'z1']);
  });
  it('rejects non-ASCII ids', () => {
    expect(() => rankItems([{ id: '\u00e9', score: 1 }])).toThrow(InvalidInput);
    expect(() => rankItems([{ id: '', score: 1 }])).toThrow(InvalidInput);
  });
  it('rejects non-finite scores', () => {
    expect(() => rankItems([{ id: 'a', score: Number.NaN }])).toThrow(InvalidInput);
    expect(() => rankItems([{ id: 'a', score: Number.POSITIVE_INFINITY }])).toThrow(InvalidInput);
  });
  it('rejects duplicate ids', () => {
    expect(() => rankItems([{ id: 'a', score: 1 }, { id: 'a', score: 2 }])).toThrow(InvalidInput);
  });
  it('rejects more than 1000 items', () => {
    const many = Array.from({ length: 1001 }, (_, index) => ({ id: \`item-\${index}\`, score: index }));
    expect(() => rankItems(many)).toThrow(InvalidInput);
  });
  it('rejects malformed input instead of ranking it', () => {
    expect(() => rankItems('not-an-array' as unknown as PublicItem[])).toThrow(InvalidInput);
    expect(() => rankItems([null] as unknown as PublicItem[])).toThrow(InvalidInput);
    expect(() => rankItems([{ id: 'a' }] as unknown as PublicItem[])).toThrow(InvalidInput);
    expect(() => rankItems([{ score: 1 }] as unknown as PublicItem[])).toThrow(InvalidInput);
  });
  it('runnable contribution source carries no protected coupling', () => {
    const source = readFileSync(new URL('../src/ranking/rankItems.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/privateScore/);
    expect(source).not.toContain('private/scoring');
  });
});
`;

const SCAFFOLD_RANK_ITEMS = `// Generated contribution scaffold for this Box: implements the declared public ranking
// contract (non-mutating, deterministic, malformed input rejected) so the declared checks
// run green out of the folder. It is generated package source, not owner source.
export interface PublicItem { readonly id: string; readonly score: number }
export class InvalidInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInput';
  }
}

const ASCII_ID = /^[ -~]+$/; // printable ASCII
const MAX_ITEMS = 1000;

export function rankItems(items: readonly PublicItem[]): PublicItem[] {
  if (!Array.isArray(items)) throw new InvalidInput('items must be an array');
  if (items.length > MAX_ITEMS) throw new InvalidInput('items must contain at most 1000 entries');
  const seen = new Set<string>();
  for (const item of items) {
    if (item === null || typeof item !== 'object') throw new InvalidInput('items must contain only objects');
    const candidate = item as { id?: unknown; score?: unknown };
    if (typeof candidate.id !== 'string' || !ASCII_ID.test(candidate.id)) throw new InvalidInput('item id must be a non-empty ASCII string');
    if (seen.has(candidate.id)) throw new InvalidInput('item ids must be unique');
    seen.add(candidate.id);
    if (typeof candidate.score !== 'number' || !Number.isFinite(candidate.score)) throw new InvalidInput('item score must be a finite number');
  }
  return [...items].sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
`;

const EVALUATOR_KITCHEN_STATS_NO_USAGE = `// Generated evaluator for the R1 kitchen request. It runs the boxed
// scripts/kitchen-stats.mjs as a real process on fabricated kitchen roots: the
// obsolete "Usage per wave" section must be gone (populated Usage metadata or
// none) while every verification figure, wave attribution, missing-data label
// and limit exit survives, and the exported helpers verify.mjs reuses stay
// exported. A blank or no-output script fails every assertion below.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const script = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'scripts', 'kitchen-stats.mjs');
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'r1-eval-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const NOW = Date.parse('2026-02-01T12:00:00.000Z');
const dirName = (ms: number, sha: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + sha.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();

// A populated kitchen root: compliant limit files, one summarized run, one
// summary-less run, and a wave file whose Result may record Usage metadata —
// exactly the input the obsolete section used to print.
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

const runStats = (root: string) => spawnSync(process.execPath, [script, '--root=' + root], { encoding: 'utf8', timeout: 60000 });

describe('boxed kitchen-stats: Usage output removed, everything else intact', () => {
  it('prints every verification section and no usage output, populated or absent', () => {
    for (const usageLine of [true, false]) {
      const run = runStats(kitchenRoot(usageLine));
      expect(run.status, run.stderr).toBe(0);
      for (const section of ['Verify runs', 'Verify minutes per step', 'Runs per wave branch', 'Largest costs', 'Kitchen limits'])
        expect(run.stdout).toContain(section);
      expect(run.stdout).not.toMatch(/usage/i);
      expect(run.stdout).toContain('1 runs with summary.json');
      expect(run.stdout).toContain('61');
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
`;

const GENERATORS: Readonly<Record<string, () => string>> = {
  'private-shop-request-a': () => EVALUATOR_REQUEST_A,
  'private-shop-request-b': () => EVALUATOR_REQUEST_B,
  'rank-items-contract': () => SCAFFOLD_RANK_ITEMS,
  'kitchen-stats-no-usage': () => EVALUATOR_KITCHEN_STATS_NO_USAGE
};

export function generate(generator: string): string {
  const produce = GENERATORS[generator];
  if (produce === undefined) throw new Error(`unknown generator '${generator}'`);
  return produce();
}
