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

const REGISTRY: Readonly<Record<string, (sourceRoot: string) => OwnerCheck>> = {
  'private-shop-request-a': requestA,
  'private-shop-request-b': requestB
};

export function ownerCheck(generator: string, sourceRoot: string): OwnerCheck | undefined {
  return REGISTRY[generator]?.(sourceRoot);
}
