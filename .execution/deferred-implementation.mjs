import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const statePath = resolve(root, '.execution/state.json');
const before = await readFile(statePath);
const state = JSON.parse(before);
const graphBytes = await readFile(resolve(root, 'tasks/task-graph.json'));
const graph = JSON.parse(graphBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const taskId = 'M6.1';
const task = state.tasks[taskId];
const [action] = process.argv.slice(2);
assert.ok(['begin', 'checkpoint'].includes(action));
assert.equal(graph.target, 'M9');
assert.equal(task.status, 'blocked');
assert.equal(state.tasks['M5.2'].status, 'blocked');
assert.ok(Object.entries(state.tasks).every(([id, item]) => !item.lease || id === taskId && item.lease.mode === 'component_only'));
const stamp = new Date().toISOString();
state.deferredRunner = { assurance: 'bounded', decision: 'physical_host_decision_deferred_by_user', recordedAt: stamp, implementationOnly: true, realValidation: 'unverified', hostExecutionAllowed: false, target: 'M9' };
state.localDevelopmentQueue = [
  { taskId: 'M6.1', unit: 'Signed transport verification and public board projections; then durable replay/publication persistence and gated routes.' },
  { taskId: 'M6.2', unit: 'Assignments, transactional reservations, defect reports and contributor UI.' },
  { taskId: 'M6.3', unit: 'Strict patch intake, atomic attempt budgets and signed permit recovery.' },
  { taskId: 'M5.2', unit: 'Trusted supervisor observations and guest bootstrap software; no candidate execution on host.' },
  { taskId: 'M5.4', unit: 'Fixed composition proxy and aggregate verdict validation.' },
  { taskId: 'M4.3', unit: 'Readiness evidence classification; execution remains dedicated-runner only.' },
  { taskId: 'M7.1', unit: 'Evaluation orchestration that fails closed when real runner is unavailable.' },
  { taskId: 'M7.2', unit: 'Owner acceptance, candidate diff and payment-obligation transaction.' },
  { taskId: 'M7.3', unit: 'Allowlisted feedback and obligation projections.' },
  { taskId: 'M8.1', unit: 'Local disclosure/adversarial checks; real runtime checks remain deferred.' },
  { taskId: 'M8.2', unit: 'Package readiness review components, without fabricated solve evidence.' },
  { taskId: 'M8.3', unit: 'Research instruments and reporting, without participant results.' },
  { taskId: 'M9.1', unit: 'Trusted synthetic workflow integration; genuine VM e2e stays unverified.' },
  { taskId: 'M9.2', unit: 'Fresh-operator setup and capability reporting.' },
  { taskId: 'M9.3', unit: 'Final handoff preparation; delivery cannot pass before all real gates.' }
];
if (action === 'begin') {
  assert.ok(!task.lease);
  task.owner = 'devin-coordinator-sequential';
  task.lease = { owner: task.owner, startedAt: stamp, mode: 'component_only' };
  task.attempt += 1;
  task.localImplementation = { assurance: 'unverified', status: 'running', phase: 'signed_release_transport', integratedIntoRuntime: false, publicationEnabled: false };
} else {
  const checks = [];
  for (const label of ['publication', 'bridge', 'types', 'compiler-regression', 'boundaries']) {
    const path = `.execution/evidence/${taskId}/deferred-20261004-${label}.json`;
    const bytes = await readFile(resolve(root, path));
    const evidence = JSON.parse(bytes);
    assert.equal(evidence.exitCode, 0, label);
    assert.equal(evidence.truncated, false, label);
    checks.push({ path, sha256: sha(bytes), command: evidence.command, exitCode: evidence.exitCode });
  }
  const paths = ['services/private-api/bridge/release.ts', 'services/external-api/bridge/release.ts', 'services/external-api/tasks/projections.ts', 'tests/portal/publication/fixture.ts', 'tests/portal/publication/release.test.ts', 'tests/security/bridge/release.test.ts', 'docs/DECISIONS.md'];
  const files = [];
  for (const path of paths) { const bytes = await readFile(resolve(root, path)); files.push({ path, bytes: bytes.length, sha256: sha(bytes) }); }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { taskId, assurance: 'unverified', taskDefinitionSha256: sha(graphBytes), files };
  const digest = sha(JSON.stringify(manifest));
  const manifestPath = `.execution/evidence/${taskId}/revision-${digest}.json`;
  await writeFile(resolve(root, manifestPath), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  task.revision = { algorithm: 'sha256', digest, manifest: manifestPath };
  task.handoff = '.execution/drafts/M6.1.md';
  await readFile(resolve(root, task.handoff));
  task.localImplementation = { assurance: 'tested', status: 'tested', phase: 'signed_release_transport', checks, integratedIntoRuntime: false, publicationEnabled: false, durableReplayStore: 'not_implemented', realValidation: 'unverified', independentReview: 'not_available' };
  task.evidence = (await readdir(resolve(root, '.execution/evidence/M6.1'))).filter(path => path.endsWith('.json')).map(path => `.execution/evidence/M6.1/${path}`);
  task.lease = null;
  task.blockers = ['Local transport/projection component tested; durable replay/publication DB, service-authenticated routes, M4.3 readiness and independent review remain open. Physical runner decision deferred by user.'];
  task.independentReviewStatus = 'not_available';
  task.integrationStatus = 'needs_revalidation';
  state.localDevelopmentQueue[0].unit = 'Resume M6.1 durable replay/publication persistence and readiness-gated service-authenticated routes; transport/projections are locally tested.';
}
for (const [id, item] of Object.entries(state.tasks)) {
  if (!item.revision || id === taskId) continue;
  const old = JSON.parse(await readFile(resolve(root, item.revision.manifest), 'utf8'));
  assert.equal(sha(JSON.stringify(old)), item.revision.digest);
  const files = [];
  let changed = false;
  for (const file of old.files) {
    const bytes = await readFile(resolve(root, file.path));
    const digest = sha(bytes);
    if (digest !== file.sha256) { assert.equal(file.path, 'docs/DECISIONS.md', `Unexpected drift: ${id}`); changed = true; }
    files.push({ path: file.path, bytes: bytes.length, sha256: digest });
  }
  if (!changed) continue;
  const manifest = { ...old, assurance: 'unverified', files };
  const digest = sha(JSON.stringify(manifest));
  const path = `.execution/evidence/${id}/revision-${digest}.json`;
  await writeFile(resolve(root, path), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  const previous = { revision: item.revision, handoff: item.handoff, reviewer: item.reviewer, independentReviewStatus: item.independentReviewStatus };
  item.reviewHistory = [...(item.reviewHistory ?? []), previous];
  const handoff = `.execution/drafts/${id}-deferred-20261004-rebind.md`;
  await writeFile(resolve(root, handoff), `# ${id}: deferred-runner decision metadata rebind\n\nAssurance: unverified\nCoordinator: devin-coordinator-sequential\nReviewer: unavailable\nRevision: ${digest}\nManifest: ${path}\nPrior handoff: ${previous.handoff}\nPrior revision: ${previous.revision.digest}\n\nOnly docs/DECISIONS.md changed. Existing product bytes and historical evidence are preserved. No new task-specific check, independent approval or milestone completion is claimed. The user authorized local component development while deferring the physical runner decision; real-runner, readiness, publication and acceptance gates remain unchanged.\n`, { flag: 'wx' });
  item.revision = { algorithm: 'sha256', digest, manifest: path };
  item.handoff = handoff;
  item.evidence = [...new Set([...item.evidence, path])];
  item.reviewer = null;
  item.independentReviewStatus = 'not_available';
  item.reconciliation = { assurance: 'unverified', previousRevision: previous.revision.digest, changedExistingPaths: ['docs/DECISIONS.md'], limitation: 'Metadata-only rebind, no independent approval.' };
}
state.coordinator = 'devin-coordinator-sequential';
state.reviewMode = 'sequential_fallback';
state.currentTask = taskId;
state.currentTasks = action === 'begin' ? [taskId] : [];
state.lastUpdatedAt = stamp;
state.projectStatus = 'implementation_checked_review_pending';
state.nextWork = { implementationOnly: true, resumeLocalUnit: taskId, queue: 'localDevelopmentQueue', normalPrerequisitesUnchanged: true, reason: 'User deferred physical host decision; continue local components without clearing mandatory gates.' };
assert.equal(state.delivery.software, 'incomplete');
assert.equal(state.delivery.realIsolatedRunner, 'not_verified');
assert.equal(sha(await readFile(statePath)), sha(before));
await mkdir(resolve(root, '.execution/evidence/M6.1'), { recursive: true });
await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(statePath + '.tmp', statePath);
console.log(JSON.stringify({ assurance: 'bounded', taskId, action, status: task.status, localImplementation: task.localImplementation.status, realValidation: 'unverified', publicationEnabled: false }));
