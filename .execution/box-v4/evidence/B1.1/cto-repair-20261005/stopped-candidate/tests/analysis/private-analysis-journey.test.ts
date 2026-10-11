import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildBoundarySurface } from '../../packages/analyzer/core/boundary-surface.js';

const files: Record<string, string> = {
  'src/lib/rule.ts': 'export function rule(v: number): number { return v * 2; }\n',
  'src/private/eligibility.ts': 'export function eligibility(score: number): boolean { return score >= 42; }\n',
  'src/runner/job.ts': `import { rule } from '../lib/rule.js';
import { eligibility } from '../private/eligibility.js';
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import secretConfig from './secret-config.json' with { type: 'json' };
import type { PrivateSeed } from './private-seed.js';
import { createRequire } from 'node:module';
import { Worker } from 'worker_threads';
import { request } from 'node:http';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
export const CANARY = 'SYNTHETIC_PRIVATE_BOUNDARY_CANARY_42';
const target = process.env.SYNTHETIC_TARGET_MODULE ?? './missing.js';
const dynamic = () => import(target);
const required = require(join('src', 'unsafe-loader.js'));
const seeded: PrivateSeed = secretConfig as PrivateSeed;
export async function run(input: number): Promise<boolean> {
  await dynamic();
  const spawn = () => required();
  new Worker('worker.js');
  request({ host: 'metadata.internal' });
  console.log(randomUUID(), readFileSync(join('src', 'x') + sep + 'y', 'utf8'), eligibility(input), seeded, rule(input), spawn());
  return eligibility(input) || rule(input) >= 0;
}
`,
  'src/runner/secret-config.json': '{\n  "SYNTHETIC_SECRET_BINDING": "synthetic-binding"\n}\n',
  'src/runner/private-seed.ts': 'export interface PrivateSeed { id: string }\n'
};

const noHostPath = (serialized: string, root: string): void => {
  expect(serialized).not.toContain(root.split('\\').join('\\\\'));
  expect(serialized).not.toContain(root.split('\\').join('/'));
};

it('isolates source imports, published statements and private-runtime only evidence from unknown bindings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-analysis-'));
  try {
    const paths = Object.keys(files).sort();
    const manifest = paths.map(path => ({ path, sha256: createHash('sha256').update(files[path]!).digest('hex') }));
    for (const path of paths) {
      await mkdir(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
      await writeFile(join(root, ...path.split('/')), files[path]!);
    }
    const surface = await buildBoundarySurface({ kind: 'private-analysis-surface', root, manifest });
    const serialized = JSON.stringify(surface);
    expect(surface.canaryReads).toBe(false);
    expect(serialized).not.toContain('SYNTHETIC_PRIVATE_BOUNDARY_CANARY_42');
    noHostPath(serialized, root);
    expect(surface.evidence.filter(item => item.path === 'src/runner/job.ts')).toHaveLength(1);
    const job = surface.evidence.find(item => item.path === 'src/runner/job.ts')!;
    expect(job.findings.some(item => item.kind === 'private_source_import')).toBe(true);
    expect(job.findings.some(item => item.kind === 'published_reachable')).toBe(true);
    const boundary = job.boundary;
    expect(boundary.unknown).toEqual([]);
    expect(boundary.static).toEqual(['../lib/rule.js']);
    expect(boundary.private).toEqual(['../private/eligibility.js']);
    expect(boundary.builtin).toEqual(expect.arrayContaining(['node:crypto', 'node:fs', 'node:module', 'node:http', 'worker_threads']));
    expect(boundary.nestedWorker).toEqual(['worker.js']);
    expect(boundary.typeOnly).toEqual(['./private-seed.js']);
    expect(boundary.jsonBinding).toEqual([{ path: './secret-config.json', attribute: 'json' }]);
    expect(boundary.computed).toEqual(['import(target)', 'require(join(...))']);
    expect(job.imports.find(item => item.classification === 'computed')?.runtime).toBe(true);
    expect(surface.findings.map(item => item.kind)).toEqual(expect.arrayContaining(['private_source_import', 'published_reachable']));
    expect(surface.importClosures.reachable).toEqual(['src/lib/rule.ts', 'src/private/eligibility.ts', 'src/runner/job.ts']);
    expect(surface.importClosures.privateReachable).toEqual(['src/private/eligibility.ts']);
    expect(surface.privateTargets).toEqual(['src/private/eligibility.ts']);
    const jobVerdict = surface.verdicts.find(item => item.module === 'src/runner/job.ts');
    expect(jobVerdict?.verdict).toBe('rejected');
    expect(surface.verdicts.find(item => item.module === 'src/lib/rule.ts')?.verdict).toBe('clean');
    expect(surface.editSurface.dependentsOf['src/private/eligibility.ts']).toEqual(['src/runner/job.ts']);
    expect(surface.editSurface.dependentsOf['src/runner/private-seed.ts']).toEqual(['src/runner/job.ts']);
    expect(surface.editSurface.dependentsOf['src/runner/secret-config.json']).toEqual(['src/runner/job.ts']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('fails closed when evidence bytes drift from the captured manifest digest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-analysis-drift-'));
  try {
    const path = 'src/lib/rule.ts';
    await mkdir(join(root, 'src', 'lib'), { recursive: true });
    await writeFile(join(root, 'src', 'lib', 'rule.ts'), files[path]! + '\n// drifted');
    await expect(buildBoundarySurface({
      kind: 'private-analysis-surface', root,
      manifest: [{ path, sha256: createHash('sha256').update(files[path]!).digest('hex') }]
    })).rejects.toThrow('private_analysis_evidence_drift');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('does not execute captured code and never emits captured text or host paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-analysis-inert-'));
  try {
    const hostile = 'src/hostile.ts';
    const text = 'export const canary = "SYNTHETIC_HOSTILE_TEXT_CANARY";\nexport const report = process.env.SYNTHETIC_ENV_CANARY;\n';
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'hostile.ts'), text);
    const surface = await buildBoundarySurface({
      kind: 'private-analysis-surface', root,
      manifest: [{ path: hostile, sha256: createHash('sha256').update(text).digest('hex') }]
    });
    const serialized = JSON.stringify(surface);
    expect(serialized).not.toContain('SYNTHETIC_HOSTILE_TEXT_CANARY');
    expect(surface.findings.some(item => item.kind === 'env_reachable')).toBe(true);
    noHostPath(serialized, root);
  } finally { await rm(root, { recursive: true, force: true }); }
});
