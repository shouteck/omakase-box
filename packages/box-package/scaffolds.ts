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

const GENERATORS: Readonly<Record<string, () => string>> = {
  'private-shop-request-a': () => EVALUATOR_REQUEST_A,
  'private-shop-request-b': () => EVALUATOR_REQUEST_B,
  'rank-items-contract': () => SCAFFOLD_RANK_ITEMS
};

export function generate(generator: string): string {
  const produce = GENERATORS[generator];
  if (produce === undefined) throw new Error(`unknown generator '${generator}'`);
  return produce();
}
