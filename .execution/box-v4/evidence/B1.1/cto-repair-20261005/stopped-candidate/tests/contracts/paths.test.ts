import { describe, expect, it } from 'vitest';
import { assertDistinctPaths, PortablePathSchema } from '../../packages/contracts/paths.js';
import { canonicalize, contentHash } from '../../packages/contracts/hash.js';

describe('portable paths', () => {
  it.each(['../secret', 'src/../../secret', '/root/source', 'C:/source.ts', 'C:source.ts', '\\\\server\\share', '//server/share', 'src\\x.ts', 'src//x.ts', './x.ts', 'src/x.ts:stream', 'src/x.ts.', 'src/x.ts ', 'src/NUL.ts', 'src/COM1', 'src/LPT9.json', 'src/a\u0000.ts', 'src/CONOUT$', 'src/..', 'src/é.ts'])('rejects unsafe path %s', path => {
    expect(PortablePathSchema.safeParse(path).success).toBe(false);
  });
  it('accepts a portable path without silently rewriting it', () => {
    expect(PortablePathSchema.parse('src/PlanSelector.tsx')).toBe('src/PlanSelector.tsx');
  });
  it('rejects exact, case-folded and file/directory collisions', () => {
    for (const paths of [['src/a.ts', 'src/a.ts'], ['src/a.ts', 'SRC/A.ts'], ['src/a', 'src/a/b.ts']]) expect(() => assertDistinctPaths(paths)).toThrow();
  });
});

describe('canonical hashes v1', () => {
  it('sorts object keys recursively but preserves array order', () => {
    expect(canonicalize({ z: [{ b: 2, a: 1 }], a: true })).toBe('{"a":true,"z":[{"a":1,"b":2}]}');
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]));
  });
  it('matches a independently known SHA-256 test vector and changes on a byte change', () => {
    expect(contentHash('abc')).toBe('6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25');
    expect(contentHash({ value: 'a' })).not.toBe(contentHash({ value: 'b' }));
  });
  it.each([undefined, NaN, Infinity, 1n, () => 1, new Date(), { a: undefined }, new Map(), Object.create({ inherited: 'private' })])('rejects non-JSON values', input => {
    expect(() => canonicalize(input)).toThrow();
  });
  it('rejects cycles and sparse arrays instead of silently dropping data', () => {
    const cyclic: Record<string, unknown> = {}; cyclic['self'] = cyclic;
    expect(() => canonicalize(cyclic)).toThrow();
    expect(() => canonicalize(new Array(2))).toThrow();
  });
});
