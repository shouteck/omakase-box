/**
 * Guest build step: verifies the staged artifact bytes against the job's
 * declared artifactHash and unpacks a fixed tar-like layout into
 * /work/candidate/. Runs OUTSIDE the candidate container, under the
 * supervisor — no candidate script ever executes here: no postinstall, no
 * entrypoint, no interpreter beyond this file's own deterministic logic.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_FILES = 4096;
const MAX_FILE_BYTES = 16777216;
const SAFE_NAME = /^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/;

export async function stageArtifact({ artifactBytes, artifactHash, stagingDir = '/var/private-task/staging', candidateDir = '/work/candidate', writableBudget = 268435456 }) {
  const digest = createHash('sha256').update(artifactBytes).digest('hex');
  if (digest !== artifactHash) throw new Error('artifact_mismatch');

  // The artifact is a strict JSON bundle:
  //   { files: { "relpath": base64 }, contract?: {...} }
  // `files` is staged into the candidate tree; `contract` — evaluator check
  // material — is staged supervisor-side only (mode 0400, outside the
  // candidate mount) so expected outputs never reach candidate code.
  let bundle;
  try { bundle = JSON.parse(Buffer.from(artifactBytes).toString('utf8')); }
  catch { throw new Error('invalid_artifact'); }
  if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle) || typeof bundle.files !== 'object' || bundle.files === null || Array.isArray(bundle.files)) throw new Error('invalid_artifact');
  const entries = Object.entries(bundle.files);
  if (entries.length === 0 || entries.length > MAX_FILES) throw new Error('invalid_artifact');

  const receipt = { files: [], totalBytes: 0 };
  await mkdir(candidateDir, { recursive: true });
  for (const [name, encoded] of entries) {
    if (!SAFE_NAME.test(name) || name.startsWith('.') || name.includes('..') || name.length > 256) throw new Error('unsafe_path');
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('invalid_artifact');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) throw new Error('file_too_large');
    receipt.totalBytes += bytes.length;
    if (receipt.totalBytes > writableBudget) throw new Error('writable_budget_exceeded');
    const target = join(candidateDir, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes, { mode: 0o444 });
    receipt.files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  // Candidate tree becomes read-only to pwuser; the sealed contract is
  // staged supervisor-side and its write MUST succeed — silently skipping
  // it would strip evaluator authority from the job.
  await mkdir(stagingDir, { recursive: true });
  if (bundle.contract !== undefined) {
    const contractBytes = Buffer.from(JSON.stringify(bundle.contract));
    if (contractBytes.length > MAX_FILE_BYTES) throw new Error('contract_too_large');
    await writeFile(join(stagingDir, 'contract.json'), contractBytes, { mode: 0o400 });
  }
  const staged = join(stagingDir, 'artifact.bin');
  try { await writeFile(staged + '.verified', Buffer.from(digest), { mode: 0o400 }); } catch { /* receipt marker is best-effort */ }
  return Object.freeze(receipt);
}

// Entrypoint: node build.mjs <artifactPath> <artifactHash> [candidateDir] [stagingDir]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [artifactPath, artifactHash, candidateDir, stagingDir] = process.argv.slice(2);
  if (!artifactPath || !/^[a-f0-9]{64}$/.test(artifactHash ?? '')) {
    console.error('usage: build.mjs <artifactPath> <artifactHash> [candidateDir] [stagingDir]');
    process.exit(2);
  }
  try {
    const receipt = await stageArtifact({ artifactBytes: await readFile(artifactPath), artifactHash, candidateDir, stagingDir });
    console.log(JSON.stringify({ status: 'staged', ...receipt }));
  } catch (error) {
    console.log(JSON.stringify({ status: 'rejected', error: error instanceof Error ? error.message : 'unknown' }));
    process.exit(1);
  }
}
