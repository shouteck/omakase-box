import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildBoundarySurface } from '../../packages/analyzer/core/boundary-surface.js';
import type { BoundarySurface } from '../../packages/analyzer/core/boundary-surface.js';

async function analyze(files: Record<string, string>): Promise<{ root: string; surface: BoundarySurface }> {
  const root = await mkdtemp(join(tmpdir(), 'private-analysis-detect-'));
  const paths = Object.keys(files).sort();
  for (const path of paths) {
    await mkdir(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...path.split('/')), files[path]!);
  }
  const manifest = paths.map(path => ({ path, sha256: createHash('sha256').update(files[path]!).digest('hex') }));
  const surface = await buildBoundarySurface({ kind: 'private-analysis-surface', root, manifest });
  return { root, surface };
}

it('classifies protected worker, cluster and child_process couplings as rejected, including nested workers', async () => {
  const { root, surface } = await analyze({
    'src/units/launch.ts': `import { Worker } from 'worker_threads';
import { isMainThread, parentPort } from 'node:worker_threads';
import * as cluster from 'cluster';

export function launch(): void {
  new Worker('synthetic-worker.js');
  if (isMainThread) cluster.fork();
  void parentPort;
}
`,
    'src/units/spawn.ts': `import { exec } from 'child_process';
import { spawnSync } from 'node:child_process';

export function run(): void {
  exec('SYNTHETIC_CMD');
  spawnSync('SYNTHETIC_CMD');
}
`
  });
  try {
    const launch = surface.verdicts.find(item => item.module === 'src/units/launch.ts');
    expect(launch?.verdict).toBe('rejected');
    expect(launch?.reasons.some(reason => reason.kind === 'protected_import')).toBe(true);
    const launchEvidence = surface.evidence.find(item => item.path === 'src/units/launch.ts');
    expect(launchEvidence?.boundary.nestedWorker).toEqual(['synthetic-worker.js']);
    const spawn = surface.verdicts.find(item => item.module === 'src/units/spawn.ts');
    expect(spawn?.verdict).toBe('rejected');
    expect(spawn?.reasons.filter(reason => reason.kind === 'protected_import').length).toBe(2);
    const launched = surface.verdicts.find(item => item.module === 'src/units/launch.ts');
    expect(launched?.reasons.some(reason => reason.kind === 'rejected_dependency')).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('reports process.env reachability as an unsupported environment dependency without reading values', async () => {
  const { root, surface } = await analyze({
    'src/units/envy.ts': `export function mode(): string {
  const raw = process.env.SYNTHETIC_ANALYSIS_MODE;
  return raw ?? 'synthetic-default';
}
`,
    'src/units/direct.ts': `export const flag = Boolean(process.platform);
`
  });
  try {
    const serialized = JSON.stringify(surface);
    expect(serialized).not.toContain('synthetic-default');
    expect(serialized).not.toContain('undefined');
    const envy = surface.evidence.find(item => item.path === 'src/units/envy.ts');
    expect(envy?.findings.filter(item => item.kind === 'env_reachable').map(item => item.detail)).toEqual(
      expect.arrayContaining(['process.env.SYNTHETIC_ANALYSIS_MODE', 'process.env'])
    );
    const verdict = surface.verdicts.find(item => item.module === 'src/units/envy.ts');
    expect(verdict?.verdict).toBe('unsupported');
    expect(verdict?.reasons.some(reason => reason.kind === 'environment_reach')).toBe(true);
    expect(surface.verdicts.find(item => item.module === 'src/units/direct.ts')?.reasons.some(reason => reason.kind === 'environment_reach')).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('detects unsafe global reach and constructor/eval patterns without executing them', async () => {
  const { root, surface } = await analyze({
    'src/units/globals.ts': `export function unstable(): string {
  const seen = globalThis.SYNTHETIC_STATE;
  const value = eval('SYNTHETIC_ANALYSIS_LITERAL_NEVER_EVALUATED');
  const maker = new Function('SYNTHETIC_ANALYSIS_BODY_NEVER_RUN');
  const legacy = global;
  return String(seen) + String(value) + String(maker) + String(legacy);
}
`
  });
  try {
    const globals = surface.evidence.find(item => item.path === 'src/units/globals.ts');
    expect(globals?.findings.filter(item => item.kind === 'unsafe_global').map(item => item.detail)).toEqual(
      expect.arrayContaining(['globalThis', 'eval(...)', 'new Function(...)', 'global'])
    );
    const verdict = surface.verdicts.find(item => item.module === 'src/units/globals.ts');
    expect(verdict?.verdict).toBe('unsupported');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('flags exported units that depend on mutable module state another unit does not carry', async () => {
  const { root, surface } = await analyze({
    'src/units/stateful.ts': `let syntheticCounter = 0;

export function bump(): number {
  syntheticCounter += 1;
  return syntheticCounter;
}

export function current(): number {
  return syntheticCounter;
}
`,
    'src/units/pure.ts': `export function pure(input: number): number {
  return input * 2;
}
`
  });
  try {
    const verdict = surface.verdicts.find(item => item.module === 'src/units/stateful.ts');
    expect(verdict?.verdict).toBe('unsupported');
    expect(verdict?.reasons.filter(reason => reason.kind === 'omitted_state_dependency')).toHaveLength(2);
    expect(verdict?.reasons.every(reason => reason.detail.includes('syntheticCounter'))).toBe(true);
    expect(surface.verdicts.find(item => item.module === 'src/units/pure.ts')?.verdict).toBe('clean');
  } finally { await rm(root, { recursive: true, force: true }); }
});
