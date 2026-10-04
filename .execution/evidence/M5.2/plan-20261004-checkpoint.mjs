import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const statePath = resolve(root, '.execution/state.json');
const before = await readFile(statePath);
const state = JSON.parse(before);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const graphBytes = await readFile(resolve(root, 'tasks/task-graph.json'));
assert.equal(JSON.parse(graphBytes).target, 'M9');
const task = state.tasks['M5.2'];
assert.equal(task.status, 'blocked');
assert.equal(task.implementationStatus, 'blocked');
assert.equal(task.revision.digest, '4b431fd6995dc7911fe211738e3ffda96477a2337d53e18bb888d05b59118361');
assert.ok(Object.values(state.tasks).every(item => !item.lease));
const checks = [];
for (const [label, exitCode] of [['static-complete', 0], ['protocol', 0], ['build-complete', 0], ['doctor', 0], ['real', 2], ['security-real', 2]]) {
  const path = `.execution/evidence/M5.2/plan-20261004-${label}.json`;
  const bytes = await readFile(resolve(root, path));
  const evidence = JSON.parse(bytes);
  assert.equal(evidence.exitCode, exitCode, label);
  assert.equal(evidence.truncated, false, label);
  checks.push({ path, sha256: sha(bytes), command: evidence.command, exitCode });
}
const rebound = [];
for (const [id, item] of Object.entries(state.tasks)) {
  if (!item.revision) continue;
  const previous = item.revision;
  const old = JSON.parse(await readFile(resolve(root, previous.manifest), 'utf8'));
  assert.equal(sha(JSON.stringify(old)), previous.digest);
  assert.equal(old.taskDefinitionSha256, sha(graphBytes));
  const files = [];
  let changed = false;
  for (const file of old.files) {
    const bytes = await readFile(resolve(root, file.path));
    const digest = sha(bytes);
    if (digest !== file.sha256) { assert.equal(file.path, 'docs/DECISIONS.md', `Unexpected source drift: ${id}`); assert.notEqual(id, 'M5.2'); changed = true; }
    files.push({ path: file.path, bytes: bytes.length, sha256: digest });
  }
  if (id === 'M5.2') for (const path of ['services/runner-controller/isolation/plan.ts', 'tests/security/runtime/plan.test.ts']) assert.ok(files.some(file => file.path === path));
  if (!changed) continue;
  const manifest = { ...old, assurance: 'unverified', files };
  const digest = sha(JSON.stringify(manifest));
  const path = `.execution/evidence/${id}/revision-${digest}.json`;
  await writeFile(resolve(root, path), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  const priorHandoff = item.handoff;
  item.reviewHistory = [...(item.reviewHistory ?? []), { revision: previous, handoff: priorHandoff, reviewer: item.reviewer, independentReviewStatus: item.independentReviewStatus }];
  const handoff = `.execution/drafts/${id}-plan-20261004-rebind.md`;
  const note = `# ${id}: documentation-only metadata checkpoint\n\nAssurance: unverified independent review\nStatus: review, implementation remains checked\nCoordinator: devin-coordinator-sequential\nReviewer: not available\nRevision: ${digest}\nManifest: ${path}\nPrior handoff: ${priorHandoff}\nPrior revision: ${previous.digest}\n\nOnly docs/DECISIONS.md changed to record the M5.2 pure isolation-plan unit. Every previously recorded product byte is identical. No new task-specific verification or approval is claimed; earlier source/interface/check context remains in the prior handoff and immutable accepted history. Existing independent-review gates remain open.\n\nCurrent shared checks: .execution/evidence/M5.2/plan-20261004-static-complete.json (60 static cases), plan-20261004-protocol.json (39 injected cases), plan-20261004-build-complete.json (types/boundaries/trusted builds). Real runner/security commands exited 2/unavailable, not passed. No candidate ran, no harness was installed and no host/configuration/dependency was changed.\n\nNext context: review the metadata binding separately from unchanged product code. M5.2 remains blocked and its local plan is neither an executor nor real-isolation evidence.\n`;
  await writeFile(resolve(root, handoff), note, { flag: 'wx' });
  item.revision = { algorithm: 'sha256', digest, manifest: path }; item.handoff = handoff;
  item.evidence = [...new Set([...item.evidence, path])];
  item.reconciliation = { assurance: 'unverified', previousRevision: previous.digest, changedExistingPaths: ['docs/DECISIONS.md'], verification: '.execution/evidence/M5.2/', limitation: 'Documentation-only rebind, not new implementation checks or independent approval.' };
  assert.equal(item.status, 'review'); assert.equal(item.implementationStatus, 'checked'); assert.equal(item.independentReviewStatus, 'not_available');
  rebound.push({ taskId: id, revision: digest, handoff, handoffSha256: sha(Buffer.from(note)) });
}
const dependencies = [];
for (const path of ['packages/runner-protocol/index.ts', 'templates/workspaces/public-image-profile.ts', 'templates/workspaces/image/Dockerfile', 'infra/runner/broker.py', 'scripts/suite.mjs']) dependencies.push({ path, sha256: sha(await readFile(resolve(root, path))) });
const handoff = '.execution/drafts/M5.2.md';
const recordPath = '.execution/evidence/M5.2/plan-20261004-checkpoint.json';
const record = { schemaVersion: 1, taskId: 'M5.2', assurance: 'tested', scope: 'Static local unit and coordinator content/reference reconciliation only.', revision: task.revision, handoff: { path: handoff, sha256: sha(await readFile(resolve(root, handoff))) }, dependencies, checks, rebound, previousStateSha256: sha(before), scriptSha256: sha(await readFile(new URL(import.meta.url))), candidateExecution: false, realValidation: 'unverified', independentReview: 'unverified' };
await writeFile(resolve(root, recordPath), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
task.localImplementation = { assurance: 'tested', phase: 'pure_isolation_plan', status: 'tested', evidence: recordPath, staticTests: 60, sourceInterface: 'services/runner-controller/isolation/plan.ts:buildIsolationPlan', integratedIntoRuntime: false, approvalVerifiedHere: false, executionAvailable: false, realValidation: 'unverified', independentReview: 'not_available' };
task.evidence = [...new Set([...task.evidence, recordPath])];
task.reconciliation = { assurance: 'unverified', previousRevision: 'beee5723a1d4213b4754c681729329b3a13d51b46827212f251914e130cf9c65', changedExistingPaths: ['docs/DECISIONS.md'], addedImplementationPaths: ['services/runner-controller/isolation/plan.ts', 'tests/security/runtime/plan.test.ts'], verification: '.execution/evidence/M5.2/', limitation: 'Local data-plan unit only; whole task remains blocked on actual sandbox/supervisor/VM verification and distinct review.' };
state.lastUpdatedAt = new Date().toISOString();
state.nextWork = { resumeBlockedTasks: ['M5.2'], nextLocalUnit: 'Trusted supervisor observation/result validation with independent synthetic expectations, no candidate execution.', independentReviewPending: Object.keys(state.tasks).filter(id => state.tasks[id].status === 'review'), reason: 'Partial local plan is tested but not integrated or real-validated; M5.2 and downstream gates remain blocked. Current code/metadata review gates remain open.' };
state.currentTask = 'M5.2'; state.currentTasks = [];
assert.equal(sha(await readFile(statePath)), sha(before));
await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(statePath + '.tmp', statePath);
console.log(JSON.stringify({ assurance: 'tested', taskId: 'M5.2', localUnit: 'tested', staticTests: 60, overallTask: 'blocked', metadataRebinds: rebound.length, realValidation: 'unverified', independentReview: 'not_available' }));
