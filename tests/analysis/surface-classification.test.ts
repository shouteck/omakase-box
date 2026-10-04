import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildBoundarySurface } from '../../packages/analyzer/core/boundary-surface.js';
import type { BoundarySurface } from '../../packages/analyzer/core/boundary-surface.js';

async function analyze(files: Record<string, string>): Promise<{ root: string; surface: BoundarySurface }> {
  const root = await mkdtemp(join(tmpdir(), 'private-analysis-classify-'));
  const paths = Object.keys(files).sort();
  for (const path of paths) {
    await mkdir(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...path.split('/')), files[path]!);
  }
  const manifest = paths.map(path => ({ path, sha256: createHash('sha256').update(files[path]!).digest('hex') }));
  const surface = await buildBoundarySurface({ kind: 'private-analysis-surface', root, manifest });
  return { root, surface };
}

it('classifies every import shape separately and keeps JSON/type-only entries out of runtime classes', async () => {
  const { root, surface } = await analyze({
    'src/units/main.ts': `import { score } from '../lib/rule.js';
import type { Shape } from '../lib/rule.js';
import data from '../lib/synthetic-data.json' with { type: 'json' };
import { readFileSync } from 'node:fs';
import missing from './synthetic-missing.js';
import * as leftPad from 'left-pad';

export function publish(input: number): number {
  const loaded = require('../lib/rule.js');
  void data;
  void missing;
  void leftPad;
  void readFileSync;
  return loaded.score(input) + score(input);
}
`,
    'src/lib/rule.ts': 'export function score(v: number): number { return v + 1; }\n',
    'src/lib/synthetic-data.json': '{ "synthetic": true }\n'
  });
  try {
    const main = surface.evidence.find(item => item.path === 'src/units/main.ts')!;
    const entry = (specifier: string, via: string) => main.imports.find(item => item.specifier === specifier && item.via === via);
    expect(entry('../lib/rule.js', 'static-import')?.classification).toBe('safe');
    expect(entry('../lib/rule.js', 'require')?.classification).toBe('safe');
    expect(entry('../lib/rule.js', 'type-import')?.classification).toBe('type-only');
    expect(entry('../lib/rule.js', 'type-import')?.runtime).toBe(false);
    expect(entry('../lib/synthetic-data.json', 'static-import')?.classification).toBe('json');
    expect(main.boundary.jsonBinding).toEqual([{ path: '../lib/synthetic-data.json', attribute: 'json' }]);
    expect(main.boundary.typeOnly).toEqual(['../lib/rule.js']);
    expect(entry('node:fs', 'static-import')?.classification).toBe('builtin');
    expect(entry('./synthetic-missing.js', 'static-import')?.classification).toBe('unknown');
    expect(entry('left-pad', 'static-import')?.classification).toBe('unknown');
    expect(main.imports.every(item => item.classification !== 'computed')).toBe(true);
    const verdict = surface.verdicts.find(item => item.module === 'src/units/main.ts');
    expect(verdict?.verdict).toBe('unknown');
    expect(verdict?.reasons.filter(reason => reason.kind === 'unresolved_import').length).toBe(2);
    expect(JSON.stringify(surface)).not.toContain('SYNTHETIC_SECRET');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('never reports computed or unresolved dynamic behaviour as safe', async () => {
  const { root, surface } = await analyze({
    'src/units/loader.ts': `const target = process.env.SYNTHETIC_LOADER_MODULE ?? './synthetic-fallback.js';

export async function load(): Promise<unknown> {
  return import(target);
}
`,
    'src/units/expr.ts': `const table = { './synthetic-a.js': 1 };

export async function pick(): Promise<unknown> {
  return import(table['SYNTHETIC_KEY'] === undefined ? './synthetic-b.js' : String(1));
}
`
  });
  try {
    const loader = surface.evidence.find(item => item.path === 'src/units/loader.ts')!;
    expect(loader.boundary.computed).toEqual(['import(target)']);
    const expr = surface.evidence.find(item => item.path === 'src/units/expr.ts')!;
    expect(expr.boundary.computed).toEqual(['import(<expr>)']);
    const dynamic = surface.evidence.flatMap(item => item.imports).filter(item => item.classification === 'computed');
    expect(dynamic.length).toBe(2);
    expect(dynamic.every(item => item.resolved === null && item.runtime)).toBe(true);
    expect(dynamic.some(item => item.classification === 'safe')).toBe(false);
    const verdicts = surface.verdicts.filter(item => item.module === 'src/units/loader.ts' || item.module === 'src/units/expr.ts');
    expect(verdicts.map(item => item.verdict)).toEqual(['unknown', 'unsupported']);
    const loaderVerdict = surface.verdicts.find(item => item.module === 'src/units/loader.ts');
    expect(loaderVerdict?.reasons.some(reason => reason.kind === 'computed_loading')).toBe(true);
    expect(loaderVerdict?.reasons.some(reason => reason.kind === 'environment_reach')).toBe(true);
    expect(JSON.stringify(verdicts)).not.toContain('safe');
    expect(JSON.stringify(surface.verdicts).includes('"verdict":"safe"')).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('discloses analysis limits and the AST-linting disclaimer in every report', async () => {
  const { root, surface } = await analyze({
    'src/units/plain.ts': 'export function plain(): number { return 1; }\n'
  });
  try {
    expect(surface.assurance).toBe('bounded');
    expect(surface.limits.some(line => /never a semantic confidentiality proof/.test(line))).toBe(true);
    expect(surface.limits.some(line => /never reported safe/.test(line))).toBe(true);
    expect(surface.limits.some(line => /No evidence is executed/.test(line))).toBe(true);
    expect(surface.verdicts.map(item => item.verdict)).toEqual(['clean']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
