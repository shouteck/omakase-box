import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildBoundarySurface } from '../../../packages/analyzer/core/boundary-surface.js';
import { detectExtractionCandidates } from '../../../packages/analyzer/adapters/extraction.js';
import { coupledFixtureFiles } from './fixtures.js';

async function writeSnapshot(): Promise<{ root: string; manifest: { path: string; sha256: string }[] }> {
  const root = await mkdtemp(join(tmpdir(), 'private-analysis-detect-'));
  const manifest = coupledFixtureFiles.map(file => ({ path: file.path, sha256: createHash('sha256').update(file.content, 'utf8').digest('hex') }));
  for (const file of coupledFixtureFiles) {
    await mkdir(join(root, ...file.path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...file.path.split('/')), file.content);
  }
  return { root, manifest };
}

it('advisory detection lists every non-private module importing the protected computation', async () => {
  const { root, manifest } = await writeSnapshot();
  try {
    const candidates = await detectExtractionCandidates({ kind: 'private-analysis-surface', root, manifest });
    const paths = candidates.map(entry => entry.path).sort();
    expect(paths).toEqual(['src/other/lazy.ts', 'src/selection/api.ts', 'src/selection/panel.tsx']);
    for (const candidate of candidates) expect(candidate.protectedImports).toEqual(['../private/rules.js']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('the analyzer surface marks the coupled modules rejected and protects the private module', async () => {
  const { root, manifest } = await writeSnapshot();
  try {
    const surface = await buildBoundarySurface({ kind: 'private-analysis-surface', root, manifest });
    const api = surface.verdicts.find(item => item.module === 'src/selection/api.ts');
    expect(api?.verdict).toBe('rejected');
    expect(api?.reasons.map(reason => reason.kind)).toContain('published_private_reach');
    expect(surface.privateTargets).toEqual(['src/private/rules.ts']);
    expect(surface.assurance).toBe('bounded');
  } finally { await rm(root, { recursive: true, force: true }); }
});
