import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { root } from './process.mjs';

const state = JSON.parse(await readFile(join(root, '.execution/state.json'), 'utf8'));
const graphBytes = await readFile(join(root, 'tasks/task-graph.json'));
const graph = JSON.parse(graphBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function scoped(path) {
  const resolved = resolve(root, path);
  const local = relative(root, resolved);
  assert.ok(local && !local.startsWith('..') && !local.startsWith('/') && !/^[A-Za-z]:/.test(local), 'Execution reference escapes the workspace.');
  return resolved;
}
assert.equal(graph.target, 'M9');
assert.deepEqual(Object.keys(state.tasks).sort(), graph.tasks.map(task => task.id).sort());
const audited = [];
for (const [taskId, task] of Object.entries(state.tasks)) {
  if (!task.revision) continue;
  const manifest = JSON.parse(await readFile(scoped(task.revision.manifest), 'utf8'));
  assert.equal(manifest.taskId, taskId);
  assert.equal(sha(JSON.stringify(manifest)), task.revision.digest);
  assert.equal(manifest.taskDefinitionSha256, sha(graphBytes));
  for (const file of manifest.files) {
    const bytes = await readFile(scoped(file.path));
    assert.equal(bytes.length, file.bytes, `Changed byte size: ${file.path}`);
    assert.equal(sha(bytes), file.sha256, `Changed content: ${file.path}`);
  }
  await readFile(scoped(task.handoff));
  for (const evidence of task.evidence) await readFile(scoped(evidence));
  if (task.status === 'done') assert.ok(task.reviewer && task.reviewer !== task.owner && task.independentReviewStatus === 'verified', 'Missing independent accepted review.');
  if (task.implementationStatus === 'checked' && task.independentReviewStatus === 'not_available') assert.equal(task.status, 'review');
  audited.push({ taskId, status: task.status, files: manifest.files.length });
}
for (const definition of graph.tasks) if (state.tasks[definition.id].status === 'done') assert.ok(definition.dependencies.every(id => state.tasks[id].status === 'done'));
for (const [milestone, status] of Object.entries(state.milestones)) if (status === 'done') assert.ok(graph.tasks.filter(task => task.milestone === milestone).every(task => state.tasks[task.id].status === 'done'));
console.log(JSON.stringify({ assurance: 'tested', status: 'passed', scope: 'Execution packet content/reference consistency only; not delivery, runtime or independent review.', audited }));
