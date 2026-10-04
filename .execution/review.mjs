import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [taskId, reviewerIdentity, decision, ...notes] = process.argv.slice(2);
assert.ok(taskId && reviewerIdentity && ['approved', 'changes_requested'].includes(decision), 'usage: node .execution/review.mjs <taskId> <reviewer> <approved|changes_requested> [notes...]');
const statePath = join(root, '.execution', 'state.json');
const state = JSON.parse(await readFile(statePath, 'utf8'));
const graphBytes = await readFile(join(root, 'tasks', 'task-graph.json'));
const graph = JSON.parse(graphBytes);
assert.ok(graph.tasks.some(task => task.id === taskId), 'Unknown task ID.');
const task = state.tasks[taskId];
assert.ok(task.revision && task.revision.digest, 'Task has no recorded revision to review.');
assert.equal(task.implementationStatus, 'checked', 'Only a checked implementation revision can be reviewed.');
assert.notEqual(reviewerIdentity, state.coordinator, 'Reviewer must be distinct from the coordinator.');
assert.notEqual(reviewerIdentity, task.owner, 'Reviewer must be distinct from the implementing owner.');
const evidenceDirectory = join(root, '.execution', 'evidence', taskId);
const names = (await readdir(evidenceDirectory)).filter(name => name.startsWith('review-') && name.endsWith('.json'));
const reports = await Promise.all(names.map(async name => ({ name, body: JSON.parse(await readFile(join(evidenceDirectory, name), 'utf8')) })));
const bound = reports.filter(({ body }) => body.taskId === taskId && body.reviewer === reviewerIdentity && body.revisionDigest === task.revision.digest && body.decision === decision);
assert.ok(bound.length > 0, 'No reviewer report binds this exact revision digest and decision.');
for (const { name, body } of bound) assert.ok(body.checksRerun !== undefined && body.criterionFindings !== undefined, `Review report ${name} lacks rerun checks or criterion findings.`);
const now = new Date().toISOString();
task.reviewer = reviewerIdentity;
task.reviewDecision = decision;
task.reviewedAt = now;
task.reviewReports = bound.map(({ name }) => `.execution/evidence/${taskId}/${name}`);
task.reviewNotes = notes;
task.independentReviewStatus = decision === 'approved' ? 'verified' : 'changes_requested';
const dependenciesDone = graph.tasks.find(item => item.id === taskId).dependencies.every(id => state.tasks[id].status === 'done');
task.status = decision === 'approved' ? (dependenciesDone ? 'done' : 'review') : 'changes_requested';
task.lease = null;
task.evidence = (await readdir(evidenceDirectory)).filter(name => name.endsWith('.json')).map(name => `.execution/evidence/${taskId}/${name}`);
if (decision === 'approved') {
  const accepted = `.execution/handoffs/${taskId}-${task.revision.digest}.md`;
  try {
    await writeFile(join(root, accepted), await readFile(join(root, task.handoff)), { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  task.handoff = accepted;
}
state.reviewMode = 'multi_agent';
state.coordinator = state.coordinator ?? 'opencode-coordinator';
state.lastUpdatedAt = now;
state.currentTask = Object.entries(state.tasks).find(([, item]) => item.status === 'running')?.[0] ?? null;
state.currentTasks = Object.entries(state.tasks).filter(([, item]) => item.status === 'running').map(([id]) => id);
state.nextEligibleTasks = graph.tasks
  .filter(item => ['pending', 'changes_requested'].includes(state.tasks[item.id].status) && item.dependencies.every(id => state.tasks[id].status === 'done' || state.tasks[id].implementationStatus === 'checked'))
  .map(item => item.id);
state.blockedTasks = Object.entries(state.tasks).filter(([, item]) => item.status === 'blocked').map(([id]) => id);
state.integrationRevalidation = Object.entries(state.tasks).filter(([, item]) => item.integrationStatus === 'needs_revalidation').map(([id]) => id);
for (const milestone of Object.keys(state.milestones)) {
  const entries = graph.tasks.filter(item => item.milestone === milestone).map(item => state.tasks[item.id]);
  state.milestones[milestone] = entries.every(item => item.status === 'done') ? 'done' : entries.some(item => item.status === 'blocked') ? 'blocked' : entries.every(item => item.status === 'pending') ? 'pending' : 'running';
}
state.nextWork = state.currentTask && state.tasks[state.currentTask].implementationStatus === 'in_progress'
  ? { resumeCurrentTask: state.currentTask, implementationEligible: state.nextEligibleTasks, reason: 'Current implementation is checkpointed, not complete; resume it before advancing dependent tasks.' }
  : state.nextEligibleTasks.length
    ? { implementationEligible: state.nextEligibleTasks }
    : { resumeBlockedTasks: state.blockedTasks, reason: 'All remaining implementation paths require blocked prerequisites; independent-review gates remain open.' };
const allVerified = Object.values(state.tasks).every(item => item.status === 'done' && item.independentReviewStatus === 'verified');
state.independentReviewVerified = allVerified;
state.delivery = state.delivery ?? {};
state.delivery.software = 'incomplete';
state.delivery.independentReview = allVerified ? 'verified' : Object.values(state.tasks).some(item => item.independentReviewStatus === 'verified') ? 'partial' : 'not_available';
if (allVerified) state.projectStatus = 'implementation_and_independent_review_complete';
else if (Object.values(state.tasks).some(item => item.implementationStatus === 'checked' && item.independentReviewStatus === 'not_available')) state.projectStatus = 'implementation_checked_review_pending';
const temporary = `${statePath}.tmp`;
await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(temporary, statePath);
console.log(JSON.stringify({ taskId, reviewer: reviewerIdentity, decision, revision: task.revision.digest, reviewReports: task.reviewReports, nextEligibleTasks: state.nextEligibleTasks, delivery: state.delivery }));
