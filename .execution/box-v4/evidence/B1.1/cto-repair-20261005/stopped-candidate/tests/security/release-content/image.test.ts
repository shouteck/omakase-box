import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { basename, dirname } from 'node:path';
import { PUBLIC_IMAGE_PROFILE } from '../../../templates/workspaces/public-image-profile.js';

it('independently authored OCI fixtures detect private payloads in historical layers, paths and chunk boundaries', () => {
  const output = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '.execution/evidence/M4.2/scan-public-image-cases.py'], { encoding: 'utf8', timeout: 30000 });
  expect(JSON.parse(output)).toMatchObject({ assurance: 'tested', cleanCompressedAndRawLayers: true, historicalCanaryDetected: true, chunkBoundaryCanaryDetected: true, privatePathsDetected: 5, forgedImageRejected: true, extractionPerformed: false });
});
it('real public image verification rechecks every layer and history plus pinned trusted tooling, never candidate execution', { timeout: 360000 }, () => {
  const evidence = JSON.parse(readFileSync('.execution/evidence/M4.2/resume-public-image-fixed.json', 'utf8')) as { exitCode: number; output: string };
  expect(evidence.exitCode).toBe(0);
  const summary = JSON.parse(evidence.output.trim()) as { imageDigest: string; evidence: string };
  const report = JSON.parse(readFileSync(summary.evidence, 'utf8')) as { imageDigest: string; sourceContextHash: string; layers: { layerDigests: string[]; violations: unknown[]; filesScanned: number }; tooling: { candidateExecuted: boolean; node: string; playwright: string }; history: unknown[] };
  const archived = JSON.parse(readFileSync(summary.evidence, 'utf8')) as { archive: string };
  const fresh = JSON.parse(execFileSync(process.execPath, ['.execution/evidence/M4.2/public-image.mjs', '--existing', basename(dirname(archived.archive))], { encoding: 'utf8', timeout: 330000 }));
  expect(fresh.imageDigest).toBe(PUBLIC_IMAGE_PROFILE.imageDigest);
  expect(fresh.sourceContextHash).toBe(PUBLIC_IMAGE_PROFILE.sourceContextHash);
  expect(fresh.violations).toEqual([]);
  expect(report.imageDigest).toBe(summary.imageDigest);
  expect(report.layers.violations).toEqual([]);
  expect(report.layers.filesScanned).toBeGreaterThan(100);
  expect(report.layers.layerDigests.length).toBeGreaterThan(1);
  expect(report.history.length).toBeGreaterThan(1);
  expect(report.tooling).toMatchObject({ candidateExecuted: false, node: '24.11.0', playwright: '1.63.0' });
});
