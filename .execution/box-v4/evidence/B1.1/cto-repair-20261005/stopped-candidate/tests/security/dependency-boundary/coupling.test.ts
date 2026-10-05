import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { analyzeDependencyBoundary } from '../../../packages/analyzer/core/dependency-boundary.js';
import { buildBoundarySurface } from '../../../packages/analyzer/core/boundary-surface.js';
import type { BoundarySurface } from '../../../packages/analyzer/core/boundary-surface.js';

async function analyze(files: Record<string, string>): Promise<{ root: string; surface: BoundarySurface }> {
  const root = await mkdtemp(join(tmpdir(), 'private-security-boundary-'));
  const paths = Object.keys(files).sort();
  for (const path of paths) {
    await mkdir(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...path.split('/')), files[path]!);
  }
  const manifest = paths.map(path => ({ path, sha256: createHash('sha256').update(files[path]!).digest('hex') }));
  const surface = await buildBoundarySurface({ kind: 'private-analysis-surface', root, manifest });
  return { root, surface };
}

it('rejects a released artifact coupled to a protected execution module, including its dependents', async () => {
  const { root, surface } = await analyze({
    'public/artifact/scheduler.ts': `import { Worker } from 'worker_threads';

export function schedule(): void {
  new Worker('synthetic-internal-worker.js');
}
`,
    'public/artifact/index.ts': `export { schedule } from './scheduler.js';
`
  });
  try {
    const scheduler = surface.verdicts.find(item => item.module === 'public/artifact/scheduler.ts');
    expect(scheduler?.verdict).toBe('rejected');
    expect(scheduler?.reasons.some(reason => reason.kind === 'protected_import')).toBe(true);
    const index = surface.verdicts.find(item => item.module === 'public/artifact/index.ts');
    expect(index?.verdict).toBe('rejected');
    expect(index?.reasons.some(reason => reason.kind === 'rejected_dependency')).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects public code importing private-managed source, directly and through published exports', async () => {
  const { root, surface } = await analyze({
    'public/artifact/preview.ts': `import { eligibility } from '../../src/private/eligibility.js';

export function badge(score: number): string {
  return eligibility(score) ? 'SYNTHETIC_BADGE' : 'SYNTHETIC_FAIL';
}
`,
    'src/private/eligibility.ts': `export function eligibility(score: number): boolean { return score >= 42; }
`
  });
  try {
    const preview = surface.verdicts.find(item => item.module === 'public/artifact/preview.ts');
    expect(preview?.verdict).toBe('rejected');
    expect(preview?.reasons.some(reason => reason.kind === 'private_source_import')).toBe(true);
    expect(preview?.reasons.some(reason => reason.kind === 'published_private_reach')).toBe(true);
    const previewImports = surface.evidence.find(item => item.path === 'public/artifact/preview.ts')?.imports ?? [];
    expect(previewImports[0]?.classification).toBe('rejected');
    expect(previewImports[0]?.reason).toBe('private_source_import');
    expect(surface.privateTargets).toEqual(['src/private/eligibility.ts']);
    expect(surface.verdicts.find(item => item.module === 'src/private/eligibility.ts')?.verdict).toBe('clean');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('never reports unknown dynamic behaviour as safe and always discloses analysis limits', async () => {
  const { root, surface } = await analyze({
    'public/artifact/loader.ts': `const target = './synthetic-unknown-target.js';

export function load(): Promise<unknown> {
  return import(target);
}
`
  });
  try {
    const loader = surface.verdicts.find(item => item.module === 'public/artifact/loader.ts');
    expect(loader?.verdict).toBe('unknown');
    expect(loader?.reasons.some(reason => reason.kind === 'computed_loading')).toBe(true);
    const imports = surface.evidence.find(item => item.path === 'public/artifact/loader.ts')?.imports ?? [];
    expect(imports[0]?.classification).toBe('computed');
    expect(imports.some(item => item.classification === 'safe')).toBe(false);
    const serialized = JSON.stringify(surface);
    expect(serialized.includes('"verdict":"safe"')).toBe(false);
    expect(serialized.includes('"classification":"safe"')).toBe(false);
    expect(surface.limits.some(line => /never a semantic confidentiality proof/.test(line))).toBe(true);
    expect(surface.assurance).toBe('bounded');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('keeps findings advisory in the dependency-boundary report and rejects hostile requests', async () => {
  const plainSource = `import { score } from '../../shared/rule.js';

export function use(input: number): number { return score(input); }
`;
  const { root, surface } = await analyze({
    'public/artifact/plain.ts': plainSource,
    'shared/rule.ts': `export function score(v: number): number { return v + 1; }
`
  });
  try {
    const plain = surface.evidence.find(item => item.path === 'public/artifact/plain.ts')!;
    expect(plain.imports[0]?.classification).toBe('safe');
    expect(surface.verdicts.find(item => item.module === 'public/artifact/plain.ts')?.verdict).toBe('clean');
    const report = await analyzeDependencyBoundary({
      kind: 'private-analysis-surface', root,
      manifest: [{ path: 'public/artifact/plain.ts', sha256: createHash('sha256').update(plainSource).digest('hex') }]
    });
    expect(report.rejected).toEqual([]);
    expect(report.assurance).toBe('bounded');
    expect(report.disclaimer).toMatch(/never a semantic confidentiality proof/);
    expect(report.limits.length).toBeGreaterThanOrEqual(5);
    const drifted = await analyzeDependencyBoundary({
      kind: 'private-analysis-surface', root,
      manifest: [{ path: 'public/artifact/plain.ts', sha256: createHash('sha256').update('drifted').digest('hex') }]
    }).catch(() => null);
    expect(drifted).toBeNull();
  } finally { await rm(root, { recursive: true, force: true }); }
});
