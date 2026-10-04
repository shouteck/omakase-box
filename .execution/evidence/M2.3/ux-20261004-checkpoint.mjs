import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const statePath = resolve(root, '.execution/state.json');
const stateBytes = await readFile(statePath);
const state = JSON.parse(stateBytes);
const graphBytes = await readFile(resolve(root, 'tasks/task-graph.json'));
const graph = JSON.parse(graphBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(graph.target, 'M9');
assert.equal(state.tasks['M2.3'].status, 'running');
assert.equal(state.tasks['M2.3'].lease.owner, 'devin-coordinator-sequential');
const checks = [];
for (const label of ['ux-20261004-e2e', 'ux-20261004-contracts', 'ux-20261004-build-retry', 'ux-20261004-preview']) {
  const path = `.execution/evidence/M2.3/${label}.json`;
  const bytes = await readFile(resolve(root, path));
  const evidence = JSON.parse(bytes);
  assert.equal(evidence.exitCode, 0, label);
  assert.equal(evidence.truncated, false, label);
  checks.push({ path, command: evidence.command, exitCode: evidence.exitCode, sha256: sha(bytes) });
}
const allowed = new Set(['docs/DECISIONS.md', 'apps/private-console/intents/intents-screen.tsx', 'tests/e2e/intent/journey.test.ts']);
const rebound = [];
for (const [id, task] of Object.entries(state.tasks)) {
  if (!task.revision) continue;
  const prior = task.revision;
  const manifest = JSON.parse(await readFile(resolve(root, prior.manifest), 'utf8'));
  assert.equal(sha(JSON.stringify(manifest)), prior.digest);
  assert.equal(manifest.taskDefinitionSha256, sha(graphBytes));
  const files = [], changed = [];
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(root, file.path));
    const digest = sha(bytes);
    if (digest !== file.sha256) {
      assert.ok(file.path === 'docs/DECISIONS.md' || id === 'M2.3' && allowed.has(file.path), `Unexpected drift: ${id} ${file.path}`);
      changed.push(file.path);
    }
    files.push({ path: file.path, bytes: bytes.length, sha256: digest });
  }
  if (id === 'M2.3') for (const path of ['apps/private-console/intents/intents-screen.css', 'apps/private-console/intents/styles.d.ts']) {
    const bytes = await readFile(resolve(root, path));
    assert.ok(!files.some(file => file.path === path));
    files.push({ path, bytes: bytes.length, sha256: sha(bytes) });
    changed.push(path);
  }
  if (!changed.length) continue;
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const current = { taskId: id, assurance: id === 'M2.3' ? 'tested' : 'unverified', taskDefinitionSha256: sha(graphBytes), files };
  const digest = sha(JSON.stringify(current));
  const path = `.execution/evidence/${id}/revision-${digest}.json`;
  const encoded = JSON.stringify(current, null, 2) + '\n';
  try { await writeFile(resolve(root, path), encoded, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST' || await readFile(resolve(root, path), 'utf8') !== encoded) throw error; }
  const previous = id === 'M2.3' ? task.previousUiAccepted : { revision: prior, reviewer: task.reviewer, handoff: task.handoff, independentReviewStatus: task.independentReviewStatus, reviewReports: task.reviewReports };
  task.reviewHistory = [...(task.reviewHistory ?? []), { ...previous, reviewNotes: task.reviewNotes, reviewedAt: task.reviewedAt }];
  task.revision = { algorithm: 'sha256', digest, manifest: path };
  task.reviewer = null; task.independentReviewStatus = 'not_available'; task.lease = null;
  task.reviewReports = []; task.reviewNotes = []; task.reviewedAt = null;
  task.reconciliation = {
    assurance: 'unverified', previousRevision: prior.digest, changedExistingPaths: changed,
    scope: id === 'M2.3' ? 'User-approved UI simplification and regression tests; exact current product revision requires distinct review.' : 'Shared decision-log metadata only; recorded product bytes remain identical, historical reviews preserved, new metadata binding not independently approved.',
    verification: '.execution/evidence/M2.3/', limitation: 'No new independent review or real-runner validation.'
  };
  const draft = id === 'M2.3' ? '.execution/drafts/M2.3-ux-20261004.md' : `.execution/drafts/${id}-ux-20261004-rebind.md`;
  const context = id === 'M2.3'
    ? 'Delivered interface: unchanged private intent DTO/API; concise goal and first before/after example, required-first single-question form, state-appropriate next action, complete native expandable details and edit panel, scoped responsive styling. Backend role/CSRF/version/hash checks, owner-only approval and the mandatory release-content review are unchanged. All untrusted text stays React-escaped. New layout/keyboard/mobile and mocked multiple-question tests supplement real synthetic auth/hash/stale-revision/XSS checks; backend evaluator outcomes were not weakened.\n\nObserved: full intent suite passed 8 tests, intent contracts passed 22 tests, trusted workspace type/build/boundary checks passed, and real synthetic demo preview passed with a screenshot. Initial layout test failed before implementation (ux-20261004-before.json); first seven-test run passed before the additional mocked presentation case. The first build rejected the CSS side-effect import; added a scoped styles.d.ts declaration without changing TypeScript policy and retained the failed build evidence. Exact command evidence follows.\n\nLimitations: no customer data, live model, candidate execution, independent review or human study. The compact preview shows the first example only; complete examples/assumptions/unknowns remain in View details. Historical approved handoffs are not approval of this changed UI. Resume distinct review of this digest; keep real-runner and M9 gates open.'
    : 'Delivered interfaces/product bytes are unchanged from the historical accepted revision. Only docs/DECISIONS.md metadata changed while recording the user-approved M2.3 layout. No task-specific implementation checks were newly run for this task; earlier checks remain scoped to byte-identical product code, not a new independent approval. A distinct reviewer must rebind the current metadata revision. Keep the prior accepted handoff/reports immutable and consult them for interface and exact historical command evidence. This metadata checkpoint cannot satisfy real-runner, model or human-pilot gates.';
  const body = `# Handoff: ${id}, user-approved UX checkpoint\n\nAssurance: ${id === 'M2.3' ? 'tested implementation; unverified independent review' : 'unverified metadata rebind'}\nStatus: ${id === 'M5.2' ? 'blocked' : 'review'}\nCoordinator: devin-coordinator-sequential\nReviewer: not available; no self-approval\nRevision: ${digest}\nManifest: ${path}\nHistorical handoff: ${previous.handoff}\nHistorical reviewer: ${previous.reviewer ?? 'not available'}\nChanged files: ${changed.join(', ')}\n\n${context}\n\n## Current shared UI checks actually run\n\n${checks.map(check => `- ${check.command.join(' ')}: exit ${check.exitCode}; ${check.path}`).join('\n')}\n\nNext context: user-selected trusted synthetic demo only. Dedicated KVM host/supervisor remain unavailable. Preserve persistent synthetic data, exact approval boundaries and all unrelated edits.\n`;
  try { await writeFile(resolve(root, draft), body, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST' || await readFile(resolve(root, draft), 'utf8') !== body) throw error; }
  task.handoff = draft;
  task.evidence = [...new Set([...task.evidence, path, ...checks.map(check => check.path)])];
  if (id !== 'M5.2') {
    task.status = 'review'; task.implementationStatus = 'checked'; task.integrationStatus = 'checked_review_pending';
    task.blockers = [id === 'M2.3' ? 'UI implementation checks passed; distinct review of the changed product revision is unavailable.' : 'Documentation-only metadata rebind requires a distinct reviewer; unchanged product checks and historical approvals are preserved.'];
  }
  rebound.push({ taskId: id, changed, revision: digest, handoff: draft, handoffSha256: sha(Buffer.from(body)) });
}
assert.equal(rebound.filter(item => item.taskId === 'M2.3').length, 1);
const checkpointPath = '.execution/evidence/M2.3/ux-20261004-checkpoint.json';
const checkpoint = { schemaVersion: 1, assurance: 'tested', scope: 'Coordinator content reconciliation; not independent review or delivery.', previousStateSha256: sha(stateBytes), scriptSha256: sha(await readFile(new URL(import.meta.url))), checks, rebound };
await writeFile(resolve(root, checkpointPath), JSON.stringify(checkpoint, null, 2) + '\n', { flag: 'wx' });
state.tasks['M2.3'].evidence = [...new Set([...state.tasks['M2.3'].evidence, checkpointPath, '.execution/evidence/M2.3/ux-20261004-before.json', '.execution/evidence/M2.3/ux-20261004-e2e-first.json', '.execution/evidence/M2.3/ux-20261004-build.json'])];
state.coordinator = 'devin-coordinator-sequential'; state.reviewMode = 'sequential_fallback'; state.independentReviewVerified = false;
state.projectStatus = 'implementation_checked_review_pending'; state.lastUpdatedAt = new Date().toISOString();
state.currentTask = null; state.currentTasks = [];
state.nextEligibleTasks = graph.tasks.filter(item => ['pending', 'changes_requested'].includes(state.tasks[item.id].status) && item.dependencies.every(id => state.tasks[id].status === 'done' || state.tasks[id].implementationStatus === 'checked')).map(item => item.id);
state.blockedTasks = Object.keys(state.tasks).filter(id => state.tasks[id].status === 'blocked');
state.integrationRevalidation = Object.keys(state.tasks).filter(id => state.tasks[id].integrationStatus === 'needs_revalidation');
for (const id of Object.keys(state.milestones)) {
  const tasks = graph.tasks.filter(task => task.milestone === id).map(task => state.tasks[task.id]);
  state.milestones[id] = tasks.every(task => task.status === 'done') ? 'done' : tasks.some(task => task.status === 'blocked') ? 'blocked' : 'running';
}
state.delivery.software = 'incomplete'; state.delivery.independentReview = 'not_available';
state.nextWork = { independentReviewPending: Object.keys(state.tasks).filter(id => state.tasks[id].status === 'review'), resumeBlockedTasks: ['M5.2'], reason: 'User-approved UI changes and metadata snapshots require distinct review; all remaining implementation paths still require the dedicated KVM host. Trusted demo remains synthetic only.' };
state.demoSelection.layout = { assurance: 'tested', evidence: checkpointPath, independentReview: 'not_available' };
assert.equal(sha(await readFile(statePath)), sha(stateBytes));
await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(statePath + '.tmp', statePath);
console.log(JSON.stringify({ assurance: 'tested', taskId: 'M2.3', implementationStatus: 'checked', independentReviewStatus: 'not_available', metadataSnapshots: rebound.length, realRunnerGate: 'blocked' }));
