import { describe, expect, it } from 'vitest';
import { BountyRefused } from '../../../packages/box-bounty/errors.js';
import { matchingSkeleton, parseOwnerList } from '../../../packages/box-bounty/never-ship-paths.js';

function legacyPattern(raw: string): RegExp {
  const pattern = matchingSkeleton(raw.trim());
  const directory = pattern.endsWith('/');
  const glob = directory ? pattern.slice(0, -1) : pattern;
  let body = '';
  const text = glob.startsWith('/') ? glob.slice(1) : glob;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '*') {
      if (text[i + 1] === '*') { body += '.*'; i += 1; }
      else body += '[^/]*';
    } else if (ch === '?') body += '[^/]';
    else body += ch.replace(/[\\^$+.()|[\]{}]/g, char => `\\${char}`);
  }
  const anchored = glob.startsWith('/') || glob.includes('/');
  return new RegExp(`${anchored ? '^' : '(?:^|/)'}${body}${directory ? '/' : anchored ? '$' : '(?:/|$)'}`);
}

describe('bounded .boxignore glob matching', () => {
  it('preserves the previous matcher across short globs, separators, literals and UTF-16 paths', () => {
    const patterns = ['/', '//', '***', '****', 'a/**/b', '**/a', '/a*', 'a/', '/a/', 'a/*/', '**/', '[a].ts', 'a+b', 'a\\b', '😀?', '?😀', 'A*', '.еnv', 'x\ny', 'x**y', 'x*y'];
    let generated = [''];
    for (let n = 0; n < 3; n += 1) {
      generated = generated.flatMap(prefix => ['a', '/', '*', '?', '.'].map(char => prefix + char));
      patterns.push(...generated);
    }
    const characters = ['a', '/', 'b', '\n', '\r', '\u2028', '\u2029', '😀', '['];
    const paths = ['', ...characters, ...characters.flatMap(a => characters.map(b => a + b)),
      'a/b/c', 'x/a/b', 'a//b', 'a/b/', 'x/a', 'a/b\n', 'x\ny', 'x/y', 'a/b/a', '[a].ts', 'a+b', 'a\\b', '😀😀', 'ab😀', 'A/B', '.еnv'];
    for (const pattern of patterns) {
      const current = parseOwnerList(pattern);
      if (current === null) continue;
      const legacy = pattern.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '' && !line.startsWith('#')).map(legacyPattern);
      for (const path of paths) expect(current.rule.match(path), JSON.stringify({ pattern, path })).toBe(legacy.some(regex => regex.test(matchingSkeleton(path))));
    }
  });

  it('keeps empty/comment-only lists empty and refuses negation', () => {
    expect(parseOwnerList('')).toBeNull();
    expect(parseOwnerList('# comment\n \r\n')).toBeNull();
    expect(() => parseOwnerList('!allowed')).toThrow(BountyRefused);
  });
});
