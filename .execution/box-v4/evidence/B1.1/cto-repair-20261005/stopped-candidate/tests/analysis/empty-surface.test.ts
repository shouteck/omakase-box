import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildBoundarySurface, MAX_MANIFEST_FILES } from '../../packages/analyzer/core/boundary-surface.js';

it('reports an inert overview for an empty surface without leaking filesystem paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-analysis-empty-'));
  try {
    const surface = await buildBoundarySurface({ kind: 'private-analysis-surface', root, manifest: [] });
    expect(surface).toMatchObject({ canaryReads: false, evidence: [], privateTargets: [], verdicts: [] });
    expect(Object.keys(surface).sort()).toEqual(['assurance', 'canaryReads', 'editSurface', 'evidence', 'findings', 'importClosures', 'limits', 'privateTargets', 'verdicts']);
    expect(surface.assurance).toBe('bounded');
    expect(surface.limits.some(line => line.includes('never a semantic confidentiality proof'))).toBe(true);
    await writeFile(join(root, 'ghost.ts'), 'export const ghost = "SYNTHETIC_GHOST_FILE";');
    const drifted = await buildBoundarySurface({ kind: 'private-analysis-surface', root, manifest: [{ path: 'ghost.ts', sha256: createHash('sha256').update('drifted').digest('hex') }] }).catch((error: unknown) => error as Error);
    expect(String((drifted as Error).message ?? drifted)).toContain('drift');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects oversized manifests, traversal paths and wrong request kinds before reading anything', async () => {
  const oversized = Array.from({ length: MAX_MANIFEST_FILES + 1 }, (_, index) => ({ path: `m${index}.ts`, sha256: 'x' }));
  await expect(buildBoundarySurface({ kind: 'private-analysis-surface', root: '.', manifest: oversized })).rejects.toThrow('private_analysis_bounds');
  await expect(buildBoundarySurface({ kind: 'private-analysis-surface', root: '.', manifest: [{ path: '../escape.ts', sha256: 'x' }] })).rejects.toThrow('private_analysis_bounds');
  await expect(buildBoundarySurface({ kind: 'private-analysis-surface', root: '.', manifest: [{ path: 'a//b.ts', sha256: 'x' }] })).rejects.toThrow('private_analysis_bounds');
  const wrongKind = { kind: 'wrong-kind', root: '.', manifest: [] } as unknown as Parameters<typeof buildBoundarySurface>[0];
  await expect(buildBoundarySurface(wrongKind)).rejects.toThrow('private_analysis_bounds');
});
