export function parsePolicyJson(source: string): unknown {
  if (typeof source !== 'string' || source.length > 65536 || Buffer.byteLength(source, 'utf8') > 65536) throw new Error('invalid_policy');
  let position = 0;
  const space = () => { while (/[ \t\r\n]/.test(source[position] ?? '\u0000')) position++; };
  function string(): string {
    const start = position;
    if (source[position++] !== '"') throw new Error('invalid_policy');
    while (position < source.length) {
      const char = source[position++];
      if (char === '\\') { position++; continue; }
      if (char === '"') return JSON.parse(source.slice(start, position)) as string;
    }
    throw new Error('invalid_policy');
  }
  function value(depth: number): unknown {
    if (depth > 16) throw new Error('invalid_policy');
    space();
    const char = source[position];
    if (char === '"') return string();
    if (char === '{') {
      position++; space();
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      if (source[position] === '}') { position++; return result; }
      while (position < source.length) {
        const key = string();
        if (Object.hasOwn(result, key)) throw new Error('invalid_policy');
        space();
        if (source[position++] !== ':') throw new Error('invalid_policy');
        result[key] = value(depth + 1); space();
        const delimiter = source[position++];
        if (delimiter === '}') return result;
        if (delimiter !== ',') throw new Error('invalid_policy');
        space();
      }
      throw new Error('invalid_policy');
    }
    if (char === '[') {
      position++; space(); const result: unknown[] = [];
      if (source[position] === ']') { position++; return result; }
      while (position < source.length) {
        result.push(value(depth + 1)); space();
        const delimiter = source[position++];
        if (delimiter === ']') return result;
        if (delimiter !== ',') throw new Error('invalid_policy');
      }
      throw new Error('invalid_policy');
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(literal, position)) { position += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(position));
    if (!number) throw new Error('invalid_policy');
    position += number[0].length;
    const result = Number(number[0]);
    if (!Number.isFinite(result)) throw new Error('invalid_policy');
    return result;
  }
  try {
    const result = value(0); space();
    if (position !== source.length) throw new Error('invalid_policy');
    return result;
  } catch { throw new Error('invalid_policy'); }
}
