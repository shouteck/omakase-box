import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const statePath = resolve(root, '.execution/state.json');
const stateBytes = await readFile(statePath);
const state = JSON.parse(stateBytes);
const graphBytes = await readFile(resolve(root, 'tasks/task-graph.json'));
const graph = JSON.parse(graphBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const task = state.tasks['M5.2'];
assert.equal(graph.target, 'M9');
assert.equal(task.status, 'blocked');
assert.equal(task.revision.digest, 'beee5723a1d4213b4754c681729329b3a13d51b46827212f251914e130cf9c65');
assert.ok(Object.values(state.tasks).every(item => !item.lease));
assert.ok(graph.tasks.find(item => item.id === 'M5.2').dependencies.every(id => state.tasks[id].implementationStatus === 'checked'));
const commands = [];
let capability;
for (const [label, exitCode] of [['packet', 0], ['protocol', 0], ['doctor', 0], ['real', 2], ['security-real', 2]]) {
  const path = `.execution/evidence/M5.2/technical-assessment-20261004-${label}.json`;
  const bytes = await readFile(resolve(root, path));
  const evidence = JSON.parse(bytes);
  assert.equal(evidence.exitCode, exitCode, label);
  assert.equal(evidence.truncated, false, label);
  commands.push({ path, sha256: sha(bytes), command: evidence.command, exitCode });
  if (label === 'doctor') capability = JSON.parse(evidence.output);
}
assert.equal(capability.runner.status, 'needs_configuration');
assert.equal(capability.runner.hostExecutionAllowed, false);
const sourcePaths = ['packages/runner-protocol/index.ts', 'services/runner-controller/controller.ts', 'services/runner-controller/provider.ts', 'services/runner-controller/transport.ts', 'services/runner-controller/config.ts', 'services/runner-controller/src/bootstrap/index.ts', 'infra/runner/broker.py', 'tests/runner/protocol/protocol.test.ts', 'tests/runner/protocol/broker_cases.py', 'services/private-api/jobs/store.ts', 'packages/evaluation/runner-results/index.ts', 'templates/workspaces/catalogue.ts', 'scripts/suite.mjs', 'milestones/M5.md', 'docs/SECURITY.md', 'docs/ARCHITECTURE.md', 'docs/runner-setup.md'];
const sources = [];
for (const path of sourcePaths) {
  const bytes = await readFile(resolve(root, path));
  sources.push({ path, bytes: bytes.length, sha256: sha(bytes) });
}
const absentScopes = ['services/runner-controller/isolation', 'infra/runner/jobs', 'tests/security/runtime'];
for (const path of absentScopes) {
  try { await stat(resolve(root, path)); throw new Error(`Assessment scope unexpectedly exists: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const item of Object.values(state.tasks)) {
  if (!item.revision) continue;
  const manifest = JSON.parse(await readFile(resolve(root, item.revision.manifest), 'utf8'));
  assert.equal(sha(JSON.stringify(manifest)), item.revision.digest);
  assert.equal(manifest.taskDefinitionSha256, sha(graphBytes));
  for (const file of manifest.files) assert.equal(sha(await readFile(resolve(root, file.path))), file.sha256, file.path);
}
const handoff = '.execution/drafts/M5.2-technical-assessment-20261004.md';
const path = '.execution/evidence/M5.2/technical-assessment-20261004.json';
const assessment = {
  schemaVersion: 1, taskId: 'M5.2', assurance: 'bounded', kind: 'source_assessment',
  timestamp: new Date().toISOString(), revision: task.revision, sources, absentScopes,
  commands, protocolTestsPassed: 39,
  handoff: { path: handoff, sha256: sha(await readFile(resolve(root, handoff))) },
  checkpointScriptSha256: sha(await readFile(new URL(import.meta.url))), previousStateSha256: sha(stateBytes),
  existing: ['Closed job/result schemas and fixed harness descriptors.', 'Injected-tested replay/SSH/SFTP/VM lifecycle and result verification.', 'Checked private job persistence and bounded evidence classification; not a live dispatcher.'],
  missing: ['Trusted guest supervisor and actual harness provenance.', 'Guest bootstrap and authenticated fixed control channel.', 'Candidate container/resource/network enforcement and owned disposal.', 'Runtime dispatch/cancellation integration.', 'Real runner/security suite dispatch and actual adversarial observations.'],
  proposedLocalUnit: { taskId: 'M5.2', component: 'Pure isolation-plan/preflight builder', paths: ['services/runner-controller/isolation/**', 'tests/security/runtime/**'], firstProfile: 'network-none pure-module', startsProcesses: false, buildsContainers: false, editsRealRunGate: false, evidenceLimit: 'Static/injected tests of plan construction only; not runtime containment or M5.2 acceptance.' },
  hostRequired: ['Actual fresh guest bootstrap and candidate execution.', 'Resource/egress/signing/renderer isolation and adversarial cases.', 'Observed cancellation, cross-job separation and guest/disk disposal.'],
  productSourceChanged: false, candidateExecution: false, realIsolatedRunner: 'unverified', independentReview: 'unverified', humanPilot: 'not_conducted'
};
await writeFile(resolve(root, path), JSON.stringify(assessment, null, 2) + '\n', { flag: 'wx' });
task.assessmentHistory = [...(task.assessmentHistory ?? []), { previousHandoff: task.handoff, evidence: path, assurance: 'bounded' }];
task.handoff = handoff;
task.evidence = [...new Set([...task.evidence, ...commands.map(item => item.path), path])];
task.blockers = ['Dedicated Linux KVM host is not configured; M5.2 sandbox, guest supervisor/control channel and real verification are not implemented. Host configuration alone will not satisfy this gate.', 'M5.1/M4.2 software prerequisites are checked for sequential implementation only; exact current metadata independent-review gates remain open.'];
state.lastUpdatedAt = assessment.timestamp;
state.nextWork.runnerAssessment = { assurance: 'bounded', evidence: path, proposedLocalUnit: assessment.proposedLocalUnit, implementationStarted: false, requiresIndependentReview: true };
assert.equal(sha(await readFile(statePath)), sha(stateBytes));
await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(statePath + '.tmp', statePath);
console.log(JSON.stringify({ assurance: 'bounded', taskId: 'M5.2', assessment: path, proposedLocalUnit: assessment.proposedLocalUnit.component, productSourceChanged: false, realRunnerGate: 'blocked' }));
