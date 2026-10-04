import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const statePath = resolve(root, '.execution/state.json');
const state = JSON.parse(await readFile(statePath, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checked = ['release-approval-final', 'release-duplicate-fixed', 'release-check', 'release-build', 'release-security-all', 'release-analysis-all', 'release-contract-fit', 'release-runner-protocol', 'release-e2e-intent', 'release-doctor', 'release-runtime-build-final', 'release-runtime-up-final', 'release-runtime-migrate-final', 'release-runtime-separation'];
for (const label of checked) {
  const evidence = JSON.parse(await readFile(resolve(root, `.execution/evidence/M4.1/${label}.json`), 'utf8'));
  assert.equal(evidence.exitCode, 0, label); assert.equal(evidence.truncated, false, label);
}
const changed = new Set(['docs/DECISIONS.md', 'infra/trusted.Dockerfile', 'infra/trusted.Dockerfile.dockerignore', 'services/private-api/src/bootstrap/main.ts', 'services/private-api/src/bootstrap/server.ts', 'services/private-api/db/migrations/meta/_journal.json', 'apps/private-console/src/bootstrap/main.tsx']);
const extras = {
  'M1.2': ['services/private-api/db/migrations/0006_immutable_release_content.sql'],
  'M4.1': ['services/private-api/db/migrations/0006_immutable_release_content.sql', 'services/private-api/db/migrations/meta/_journal.json', 'services/private-api/src/bootstrap/server.ts', 'apps/private-console/src/bootstrap/main.tsx', '.execution/evidence/M4.1/verify-release-live.mjs']
};
assert.equal(state.tasks['M4.1'].implementationStatus, 'checked');
for (const [id, task] of Object.entries(state.tasks)) {
  if (!task.revision) continue;
  const prior = task.revision;
  const manifest = JSON.parse(await readFile(resolve(root, prior.manifest), 'utf8'));
  assert.equal(sha(JSON.stringify(manifest)), prior.digest);
  const files = new Map(), changedExistingPaths = [];
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(root, file.path));
    const digest = sha(bytes);
    if (digest !== file.sha256) { assert.ok(changed.has(file.path), `Unreconciled drift: ${id} ${file.path}`); changedExistingPaths.push(file.path); }
    files.set(file.path, { path: file.path, bytes: bytes.length, sha256: digest });
  }
  for (const path of extras[id] ?? []) {
    const bytes = await readFile(resolve(root, path));
    files.set(path, { path, bytes: bytes.length, sha256: sha(bytes) });
  }
  manifest.files = [...files.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const digest = sha(JSON.stringify(manifest));
  task.evidence = (await readdir(resolve(root, `.execution/evidence/${id}`))).filter(name => name.endsWith('.json')).map(name => `.execution/evidence/${id}/${name}`);
  if (digest === prior.digest) continue;
  const manifestPath = `.execution/evidence/${id}/revision-${digest}.json`;
  const encoded = JSON.stringify(manifest, null, 2) + '\n';
  try { await writeFile(resolve(root, manifestPath), encoded, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST' || await readFile(resolve(root, manifestPath), 'utf8') !== encoded) throw error; }
  if (task.independentReviewStatus === 'verified') {
    task.previousReviewed = { revision: prior, reviewer: task.reviewer, handoff: task.handoff, reviewReports: task.reviewReports ?? [] };
    task.independentReviewStatus = 'not_available'; task.reviewer = null; task.reviewDecision = 'rebind_pending';
  }
  task.revision = { algorithm: 'sha256', digest, manifest: manifestPath };
  task.evidence.push(manifestPath);
  task.reconciliation = { assurance: 'tested', previousRevision: prior.digest, changedExistingPaths, addedPaths: extras[id] ?? [], verification: '.execution/evidence/M4.1/', limitation: 'Shared release integration and forward migration regression-tested; no independent review of this revision or real runner validation.' };
  console.log(JSON.stringify({ taskId: id, revision: digest, changedExistingPaths }));
}
state.lastUpdatedAt = new Date().toISOString(); state.independentReviewVerified = false; state.delivery.independentReview = 'not_available';
await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(statePath + '.tmp', statePath);
