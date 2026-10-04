import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
// @ts-expect-error guest-side ESM module without type declarations
import { stageArtifact } from '../../../infra/runner/jobs/tooling/build.mjs';
import { adversarialArtifact, adversarialCatalog } from '../../../services/runner-controller/isolation/adversarial.js';

const contract = { checks: [{ checkId: 'rank.order', exportName: 'rank', arguments: [[3, 1, 2]], expected: [1, 2, 3] }] };
let work: string;

beforeEach(async () => { work = await mkdtemp(join(tmpdir(), 'private-task-stage-')); });
afterEach(async () => { await rm(work, { recursive: true, force: true }); });

let stageCounter = 0;
async function stage(bundle: unknown, opts: Record<string, unknown> = {}) {
  const bytes = Buffer.from(JSON.stringify(bundle));
  const suffix = `s${stageCounter++}`;
  return stageArtifact({
    artifactBytes: bytes,
    artifactHash: createHash('sha256').update(bytes).digest('hex'),
    stagingDir: join(work, `staging-${suffix}`),
    candidateDir: join(work, `candidate-${suffix}`),
    ...opts,
  });
}

describe('stageArtifact — real local execution of the guest build step', () => {
  it('stages every catalog case into a read-only candidate tree plus a supervisor-side contract', async () => {
    for (const entry of adversarialCatalog()) {
      const artifact = adversarialArtifact(entry.caseId, contract);
      const candidateDir = join(work, `candidate-${entry.caseId}`);
      const stagingDir = join(work, `staging-${entry.caseId}`);
      const receipt = await stageArtifact({ artifactBytes: artifact.artifactBytes, artifactHash: artifact.artifactHash, candidateDir, stagingDir });
      expect(receipt.files.map((file: { path: string }) => file.path)).toContain('index.mjs');
      const staged = await readFile(join(candidateDir, 'index.mjs'), 'utf8');
      expect(staged).toBe(entry.source);
      const contractText = await readFile(join(stagingDir, 'contract.json'), 'utf8');
      expect(JSON.parse(contractText)).toEqual(contract);
      // The contract must never appear inside the candidate tree.
      await expect(stat(join(candidateDir, 'contract.json'))).rejects.toThrow();
    }
  });
  it('rejects artifact hash mismatch, malformed bundles and empty file sets', async () => {
    const bytes = Buffer.from(JSON.stringify({ files: { 'index.mjs': 'eA==' } }));
    await expect(stageArtifact({ artifactBytes: bytes, artifactHash: 'f'.repeat(64), stagingDir: join(work, 's1'), candidateDir: join(work, 'c1') })).rejects.toThrow('artifact_mismatch');
    await expect(stage({ files: {} })).rejects.toThrow('invalid_artifact');
    await expect(stage({ files: [] })).rejects.toThrow('invalid_artifact');
    await expect(stage({ nope: {} })).rejects.toThrow('invalid_artifact');
    await expect(stage('not a bundle')).rejects.toThrow('invalid_artifact');
  });
  it.each([
    ['../escape.mjs', 'unsafe_path'],
    ['a/../../escape.mjs', 'unsafe_path'],
    ['/abs.mjs', 'unsafe_path'],
    ['.hidden.mjs', 'unsafe_path'],
    ['dir/../../escape.mjs', 'unsafe_path'],
    ['dir name/x.mjs', 'unsafe_path'],
    ['a//b.mjs', 'unsafe_path'],
  ])('rejects hostile path %s', async (path, code) => {
    await expect(stage({ files: { [path]: Buffer.from('x').toString('base64') } })).rejects.toThrow(code);
  });
  it('rejects oversized files, oversized bundles and invalid base64', async () => {
    const big = Buffer.alloc(16777217).toString('base64');
    await expect(stage({ files: { 'index.mjs': big } })).rejects.toThrow('file_too_large');
    await expect(stage({ files: { 'index.mjs': '%%%' } })).rejects.toThrow('invalid_artifact');
    const many = Object.fromEntries(Array.from({ length: 4097 }, (_, index) => [`f${index}.mjs`, 'eA==']));
    await expect(stage({ files: many })).rejects.toThrow('invalid_artifact');
  });
  it('writable budget enforcement covers the sum of staged bytes', async () => {
    const files = { 'a.mjs': Buffer.alloc(1024).toString('base64'), 'b.mjs': Buffer.alloc(1024).toString('base64') };
    await expect(stage({ files }, { writableBudget: 1025 })).rejects.toThrow('writable_budget_exceeded');
    await expect(stage({ files }, { writableBudget: 2048 })).resolves.toBeTruthy();
  });
});
