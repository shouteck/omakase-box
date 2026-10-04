import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const statePath = resolve(root, '.execution/state.json');
const state = JSON.parse(await readFile(statePath, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(state.tasks['M3.4'].implementationStatus, 'checked');
for (const label of ['policy-analysis-final', 'policy-acceptance-final', 'policy-security-final', 'policy-contracts-final', 'policy-check-final', 'policy-build-final', 'policy-doctor-final', 'policy-analysis-all', 'policy-dependency-boundary', 'policy-partition-analysis', 'policy-partition-planner']) {
  const evidence = JSON.parse(await readFile(resolve(root, `.execution/evidence/M3.4/${label}.json`), 'utf8'));
  assert.equal(evidence.exitCode, 0, label);
  assert.equal(evidence.truncated, false, label);
}
const additions = {
  'M1.1': ['packages/contracts/public/response-policy.ts'],
  'M3.1': ['packages/analyzer/policy/index.ts', 'packages/analyzer/policy/strict-json.ts', 'tests/analysis/policy/adapter.test.ts'],
  'M3.2': ['packages/planner/partition/policy/index.ts', 'services/private-api/preparations/policy/index.ts'],
  'M3.4': ['packages/contracts/public/response-policy.ts', 'tests/security/policy-scope/policy.test.ts']
};
for (const [id, task] of Object.entries(state.tasks)) {
  if (!task.revision) continue;
  const prior = task.revision;
  const manifest = JSON.parse(await readFile(resolve(root, prior.manifest), 'utf8'));
  assert.equal(sha(JSON.stringify(manifest)), prior.digest);
  const files = new Map();
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(root, file.path));
    if (file.path !== 'docs/DECISIONS.md') assert.equal(sha(bytes), file.sha256, `Unreconciled implementation drift: ${id} ${file.path}`);
    files.set(file.path, { path: file.path, bytes: bytes.length, sha256: sha(bytes) });
  }
  for (const path of additions[id] ?? []) {
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
    task.independentReviewStatus = 'not_available';
    task.reviewer = null;
    task.reviewDecision = 'rebind_pending';
  }
  task.revision = { algorithm: 'sha256', digest, manifest: manifestPath };
  task.evidence.push(manifestPath);
  task.reconciliation = { assurance: 'tested', previousRevision: prior.digest, changedExistingPaths: ['docs/DECISIONS.md'], addedPaths: additions[id] ?? [], verification: '.execution/evidence/M3.4/', limitation: 'Documentation-only existing-file drift plus separately tested policy additions; not a new independent approval or real-runner result.' };
  console.log(JSON.stringify({ taskId: id, revision: digest, additions: additions[id] ?? [] }));
}
state.lastUpdatedAt = new Date().toISOString();
state.independentReviewVerified = false;
state.delivery.independentReview = 'not_available';
await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(statePath + '.tmp', statePath);
