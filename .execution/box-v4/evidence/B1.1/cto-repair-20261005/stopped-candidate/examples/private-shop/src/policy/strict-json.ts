export function parseStrictJson(source: string): unknown {
  if (new TextEncoder().encode(source).length > 65536) throw new Error('Policy input limit exceeded.');
  let position = 0;
  function space() { while (/[ \t\r\n]/.test(source[position] ?? '\u0000')) position++; }
  function string(): string {
    const start = position;
    if (source[position++] !== '"') throw new Error('Expected JSON string.');
    while (position < source.length) {
      const char = source[position++];
      if (char === '\\') { position++; continue; }
      if (char === '"') {
        try { return JSON.parse(source.slice(start, position)) as string; } catch { throw new Error('Invalid JSON string.'); }
      }
    }
    throw new Error('Unterminated JSON string.');
  }
  function value(depth: number): unknown {
    if (depth > 32) throw new Error('Policy nesting limit exceeded.');
    space();
    const char = source[position];
    if (char === '"') return string();
    if (char === '{') {
      position++; space();
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      const keys = new Set<string>();
      if (source[position] === '}') { position++; return result; }
      while (position < source.length) {
        const key = string();
        if (keys.has(key)) throw new Error('Duplicate JSON key.');
        keys.add(key); space();
        if (source[position++] !== ':') throw new Error('Expected colon.');
        result[key] = value(depth + 1); space();
        const delimiter = source[position++];
        if (delimiter === '}') return result;
        if (delimiter !== ',') throw new Error('Expected object delimiter.');
        space();
      }
      throw new Error('Unterminated JSON object.');
    }
    if (char === '[') {
      position++; space(); const result: unknown[] = [];
      if (source[position] === ']') { position++; return result; }
      while (position < source.length) {
        result.push(value(depth + 1)); space(); const delimiter = source[position++];
        if (delimiter === ']') return result;
        if (delimiter !== ',') throw new Error('Expected array delimiter.');
      }
      throw new Error('Unterminated JSON array.');
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(literal, position)) { position += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(position));
    if (!number) throw new Error('Invalid JSON value.');
    position += number[0].length;
    const result = Number(number[0]);
    if (!Number.isFinite(result)) throw new Error('Non-finite JSON number.');
    return result;
  }
  const result = value(0); space();
  if (position !== source.length) throw new Error('Trailing JSON data.');
  return result;
}
