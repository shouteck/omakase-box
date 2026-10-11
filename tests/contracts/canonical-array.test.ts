import { describe, expect, it } from 'vitest';
import { canonicalize, contentHash } from '../../packages/contracts/hash.js';

describe('canonical array data boundary', () => {
  it('rejects indexed accessors without evaluating them', () => {
    let reads = 0;
    const values: unknown[] = [];
    Object.defineProperty(values, '0', { enumerable: true, get: () => ++reads });
    expect(() => canonicalize(values)).toThrow();
    expect(() => contentHash(values)).toThrow();
    expect(reads).toBe(0);
  });
  it('rejects hidden extra properties and hidden indexed values', () => {
    const extended = [1];
    Object.defineProperty(extended, 'secret', { value: 'hidden' });
    expect(() => canonicalize(extended)).toThrow();
    const hidden = [1];
    Object.defineProperty(hidden, '0', { enumerable: false });
    expect(() => canonicalize(hidden)).toThrow();
  });
  it('preserves ordinary dense array order and nested canonical keys', () => {
    expect(canonicalize([3, { z: 2, a: 1 }, null])).toBe('[3,{"a":1,"z":2},null]');
    expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]));
  });
});
