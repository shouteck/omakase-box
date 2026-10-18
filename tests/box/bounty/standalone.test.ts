import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './support.js';

// The bounty tool stands alone (BT34): nothing it is made of — the package,
// its tests or the CLI's bounty entry — may name an older-platform package in
// an import specifier, so the seam this wave cut cannot regrow silently.
// Each hit names file and line.

// Older-platform package names, matched as whole specifier segments: a bare
// specifier and a ../packages/<name>/… path are caught the same way.
const FORBIDDEN = new Set([['box', 'package'].join('-'), 'box-trace', 'box-contracts', 'analyzer', 'evaluation', 'planner', 'compiler', 'contracts', 'runner-protocol']);

// One specifier per match: `… from 'x'`, `import 'x'`, `import('x')` and
// `require('x')`. Quoted text in comments or string data loads no module and
// is not an import.
const SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(|\bimport\s+|\brequire\s*\()\s*['"]([^'"\n]+)['"]/g;

function forbiddenImports(rel: string, text: string): string[] {
  const hits: string[] = [];
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(SPECIFIER)) {
      const specifier = match[1]!;
      if (specifier.split(/[\/]/).some(segment => FORBIDDEN.has(segment))) hits.push(`${rel}:${index + 1} ${specifier}`);
    }
  });
  return hits;
}

describe('the bounty tool stands alone', () => {
  it('no file the tool or its tests are made of imports an older-platform package', () => {
    const files: string[] = [];
    for (const root of ['packages/box-bounty', 'tests/box/bounty']) {
      for (const name of readdirSync(join(ROOT, root), { recursive: true }) as string[]) {
        const rel = `${root}/${name.split(sep).join('/')}`;
        // node_modules under the test dir is the runner's cache, not source.
        if (!rel.includes('/node_modules/') && (rel.endsWith('.ts') || rel.endsWith('.mjs'))) files.push(rel);
      }
    }
    // The CLI's bounty path: its own module since BT13; an older tree kept
    // the dispatch inside cli.ts, and there the whole file is the entry.
    const cliBounty = 'packages/box-cli/src/bounty.ts';
    files.push(existsSync(join(ROOT, ...cliBounty.split('/'))) ? cliBounty : 'packages/box-cli/src/cli.ts');
    const hits = files.flatMap(rel => forbiddenImports(rel, readFileSync(join(ROOT, ...rel.split('/')), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the scan itself fails on a planted older-platform import', () => {
    // The planted specifier is assembled so this file's own bytes carry no
    // line the scan reads as such an import.
    const retired = [...FORBIDDEN][0]!;
    const planted = `../${retired}/index.js`;
    expect(forbiddenImports('probe.ts', [
      `import { probe } from '${planted}';`,
      `const probe = require('${retired}');`,
      `await import('${planted}');`,
      `export { probe } from '${planted}';`
    ].join('\n'))).toEqual([
      `probe.ts:1 ${planted}`,
      `probe.ts:2 ${retired}`,
      `probe.ts:3 ${planted}`,
      `probe.ts:4 ${planted}`
    ]);
    expect(forbiddenImports('clean.ts', [
      `import { probe } from './support.js';`,
      `import { probe } from '../../box-bounty/index.js';`,
      `const note = 'the older platform is named in prose, never loaded';`
    ].join('\n'))).toEqual([]);
  });
});
