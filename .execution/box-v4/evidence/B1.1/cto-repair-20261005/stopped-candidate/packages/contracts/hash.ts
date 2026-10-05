import { createHash } from 'node:crypto';

export const CANONICALIZATION_VERSION = 'json-sorted-utf8/v1' as const;
export function canonicalize(input: unknown): string {
  const ancestors = new Set<object>();
  function encode(value: unknown, depth: number): string {
    if (depth > 64) throw new Error('Canonical JSON nesting limit exceeded.');
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (typeof value !== 'object' || ancestors.has(value)) throw new Error('Non-JSON value or cycle.');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Non-plain JSON object.');
    if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol keys are not canonical JSON.');
    ancestors.add(value);
    let result: string;
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value as object);
      const length = descriptors.length?.value as number;
      if (Object.getOwnPropertyNames(value).length !== length + 1) throw new Error('Sparse or extended array.');
      const items: string[] = [];
      for (let index = 0; index < length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Sparse arrays or accessors are not canonical JSON.');
        items.push(encode(descriptor.value, depth + 1));
      }
      result = '[' + items.join(',') + ']';
    } else {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Object.keys(descriptors).sort();
      if (keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key] ?? {}, 'value'))) throw new Error('Accessors or non-enumerable data are not canonical JSON.');
      result = '{' + keys.map(key => JSON.stringify(key) + ':' + encode(descriptors[key]?.value, depth + 1)).join(',') + '}';
    }
    ancestors.delete(value);
    return result;
  }
  return encode(input, 0);
}
export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}
export function byteHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
