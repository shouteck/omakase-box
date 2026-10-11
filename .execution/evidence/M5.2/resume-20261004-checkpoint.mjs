import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const statePath = resolve(root, '.execution/state.json');
const stateBytes = await readFile(statePath);
const state = JSON.parse(stateBytes);
const graph = JSON.parse(await readFile(resolve(root, 'tasks/task-graph.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(graph.target, 'M9');
assert.equal(state.tasks['M5.2'].status, 'blocked');
assert.equal(state.tasks['M5.2'].revision.digest, '9de6f9ad0400118a8af91cfb664e2258740495be0a1f79f15be12b7bda34f87f');
assert.ok(Object.values(state.tasks).every(task => !task.lease));
const completedBefore = JSON.stringify(Object.entries(state.tasks).filter(([, task]) => task.status === 'done'));
const observations = [
  ['resume-20261004-packet-audit', 0],
  ['resume-20261004-doctor', 0],
  ['resume-20261004-real-runner', 2],
  ['resume-20261004-runtime-security', 2],
  ['resume-20261004-runner-protocol', 0],
  ['resume-20261004-mvp-gate', 2]
];
const evidence = [];
let capability;
for (const [label, exitCode] of observations) {
  const path = `.execution/evidence/M5.2/${label}.json`;
  const bytes = await readFile(resolve(root, path));
  const record = JSON.parse(bytes);
  assert.equal(record.taskId, 'M5.2');
  assert.equal(record.exitCode, exitCode);
  assert.equal(record.truncated, false);
  evidence.push({ path, sha256: sha(bytes), exitCode, command: record.command });
  if (label.endsWith('-doctor')) capability = JSON.parse(record.output);
}
assert.equal(capability.runner.status, 'needs_configuration');
assert.equal(capability.runner.realValidation, 'unverified');
assert.equal(capability.runner.hostExecutionAllowed, false);
function requiresRunner(id) {
  return id === 'M5.2' || graph.tasks.find(task => task.id === id).dependencies.some(requiresRunner);
}
const unfinished = graph.tasks.filter(task => state.tasks[task.id].status !== 'done');
assert.ok(unfinished.every(task => requiresRunner(task.id)));
assert.ok(graph.tasks.find(task => task.id === 'M5.2').dependencies.every(id => state.tasks[id].status === 'done'));
const handoff = '.execution/drafts/M5.2.md';
const checkpoint = '.execution/evidence/M5.2/resume-20261004-checkpoint.json';
const record = {
  schemaVersion: 1, taskId: 'M5.2', assurance: 'tested',
  scope: 'Coordinator resumption metadata only; no implementation, runtime validation or new independent review.',
  previousStateSha256: sha(stateBytes),
  checkpointScriptSha256: sha(await readFile(new URL(import.meta.url))),
  handoff: { path: handoff, sha256: sha(await readFile(resolve(root, handoff))) },
  observations: evidence,
  unavailableTasks: unfinished.map(task => task.id),
  realIsolatedRunner: 'unverified', software: 'incomplete', humanPilot: 'not_conducted'
};
await writeFile(resolve(root, checkpoint), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
const task = state.tasks['M5.2'];
task.handoff = handoff;
task.evidence = [...new Set([...task.evidence, ...evidence.map(item => item.path), checkpoint])];
task.blockers = ['Dedicated Linux KVM host and reviewed guest supervisor remain unconfigured. M5.1/M4.2 software prerequisites are independently accepted; required real runner/security commands returned unavailable (exit 2) on 2026-10-04. No development-host execution substitute.'];
state.lastUpdatedAt = new Date().toISOString();
state.nextEligibleTasks = [];
state.nextWork = {
  resumeBlockedTasks: ['M5.2'],
  externalPrerequisite: 'Operator supplies an authorized existing dedicated Linux KVM host and private configuration per docs/runner-setup.md; then implement and independently validate M5.2 before M5.4, M4.3 and M6-M9 in graph order.',
  reason: 'All 17 accepted implementations retain exact recorded content/reviews; every unfinished task requires the externally blocked M5.2. No mandatory gate advanced.'
};
state.lastResume = {
  assurance: 'tested', timestamp: state.lastUpdatedAt, coordinator: 'devin-coordinator-sequential',
  evidence: checkpoint, handoffSha256: record.handoff.sha256,
  limitations: ['Packet/protocol checks are not real-VM validation or independent review.', 'Git status refused repository ownership; command-scoped exception requested but not used.', 'Native contributor.localhost resolution remains unverified.']
};
assert.equal(JSON.stringify(Object.entries(state.tasks).filter(([, item]) => item.status === 'done')), completedBefore);
assert.equal(sha(await readFile(statePath)), sha(stateBytes), 'State changed during checkpoint.');
await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(statePath + '.tmp', statePath);
console.log(JSON.stringify({ assurance: 'tested', checkpoint, completedTasksPreserved: 17, blockedTask: 'M5.2', nextEligibleTasks: state.nextEligibleTasks, scope: record.scope }));
