import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative, matchesGlob } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const statePath = resolve(root, '.execution/state.json');
const state = JSON.parse(await readFile(statePath, 'utf8'));
const graphBytes = await readFile(resolve(root, 'tasks/task-graph.json'));
const graph = JSON.parse(graphBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const [action, id, reviewer] = process.argv.slice(2);
const task = state.tasks[id];
assert.ok(task);
if (action === 'metadata_rebind') {
  assert.equal(id, 'M6.2');
  assert.equal(state.tasks[id].localImplementation?.lease?.owner, 'devin-coordinator-sequential');
  const rebound = [];
  for (const [taskId, item] of Object.entries(state.tasks)) {
    if (!item.revision || taskId === id) continue;
    const old = JSON.parse(await readFile(resolve(root, item.revision.manifest), 'utf8'));
    assert.equal(sha(JSON.stringify(old)), item.revision.digest);
    assert.equal(old.taskDefinitionSha256, sha(graphBytes));
    const files = [];
    let changed = false;
    for (const file of old.files) {
      const path = resolve(root, file.path), local = relative(root, path);
      assert.ok(local && !local.startsWith('..') && !/^[A-Za-z]:/.test(local));
      const bytes = await readFile(path), digest = sha(bytes);
      if (digest !== file.sha256 || bytes.length !== file.bytes) {
        assert.equal(file.path, 'docs/DECISIONS.md', `Non-metadata drift in ${taskId}: ${file.path}`);
        changed = true;
      }
      files.push({ path: file.path, bytes: bytes.length, sha256: digest });
    }
    if (!changed) continue;
    const previous = { revision: item.revision, handoff: item.handoff, reviewer: item.reviewer, independentReviewStatus: item.independentReviewStatus, status: item.status, reviewReports: item.reviewReports ?? [] };
    const manifest = { ...old, assurance: 'unverified', files }, digest = sha(JSON.stringify(manifest));
    const manifestPath = `.execution/evidence/${taskId}/revision-${digest}.json`;
    await writeFile(resolve(root, manifestPath), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    const handoff = `.execution/drafts/${taskId}-legacy-20261004-rebind.md`;
    await writeFile(resolve(root, handoff), `# ${taskId}: user-authorized test decision metadata rebind\n\nAssurance: bounded (content identity only)\nCoordinator: devin-coordinator-sequential\nIndependent reviewer: unavailable\nRevision: ${digest}\nManifest: ${manifestPath}\nPrior revision: ${previous.revision.digest}\nPrior handoff: ${previous.handoff}\nPrior reviewer: ${previous.reviewer ?? 'unavailable'}\n\nOnly docs/DECISIONS.md changed. Every previously bound product file was recomputed byte-for-byte against its old digest; no product byte or task prerequisite was changed by this action. The user authorized the two specific M6.2 browser test-flow/fixture corrections. Historical independent reviews are retained, not reassigned to new digests. Required checks remain recorded in the prior handoff and evidence; this metadata operation reruns no product tests. Current metadata review and all mandatory real-runner/readiness/delivery gates remain open.\n`, { flag: 'wx' });
    item.reviewHistory = [...(item.reviewHistory ?? []), previous];
    item.revision = { algorithm: 'sha256', digest, manifest: manifestPath };
    item.handoff = handoff;
    item.evidence = [...new Set([...item.evidence, manifestPath])];
    if (item.status === 'done') item.status = 'review';
    item.reviewer = null; item.independentReviewStatus = 'not_available'; item.reviewDecision = null; item.reviewReports = []; item.reviewNotes = [];
    item.reconciliation = { assurance: 'bounded', previousRevision: previous.revision.digest, changedExistingPaths: ['docs/DECISIONS.md'], limitation: 'Product bytes unchanged; current metadata digest has no independent approval.' };
    rebound.push({ taskId, previousRevision: previous.revision.digest, revision: digest, status: item.status });
  }
  await writeFile(resolve(root, '.execution/evidence/M6.2/owner-20261004-metadata-rebind.json'), JSON.stringify({ assurance: 'bounded', action, changedPath: 'docs/DECISIONS.md', reviewer: null, rebound }, null, 2) + '\n', { flag: 'wx' });
} else if (action === 'snapshot') {
  const previous = task.revision ? JSON.parse(await readFile(resolve(root, task.revision.manifest), 'utf8')) : { files: [] };
  const paths = new Set(previous.files.map(file => file.path));
  const extraScopes = id === 'M1.3' ? ['packages/contracts/auth/**', 'services/*/src/bootstrap/server.ts', 'services/*/src/bootstrap/main.ts', 'services/*/bootstrap/build.mjs', 'scripts/verify-auth.mjs', 'tests/security/authorization/**'] : id === 'M5.1' ? ['tests/runner/protocol/**', 'pnpm-lock.yaml', 'scripts/doctor.mjs', '.gitignore'] : [];
  const patterns = [...graph.tasks.find(item => item.id === id).writePaths, ...extraScopes];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['.git', '.runtime', 'node_modules', 'dist', '.execution', 'data', 'secrets', 'coverage', 'test-results', 'playwright-report', '__pycache__'].includes(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile()) {
        const local = relative(root, path).replaceAll('\\', '/');
        if (patterns.some(pattern => matchesGlob(local, pattern))) paths.add(local);
      }
    }
  }
  await collect(root);
  const files = [];
  for (const path of [...paths].sort((a, b) => a.localeCompare(b, 'en'))) {
    const bytes = await readFile(resolve(root, path));
    files.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  const manifest = { taskId: id, assurance: 'unverified', taskDefinitionSha256: sha(graphBytes), files };
  const digest = sha(JSON.stringify(manifest));
  const path = resolve(root, `.execution/evidence/${id}/revision-${digest}.json`);
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  task.revision = { algorithm: 'sha256', digest, manifest: relative(root, path).replaceAll('\\', '/') };
  task.status = 'review'; task.implementationStatus = 'in_progress'; task.independentReviewStatus = 'pending'; task.reviewer = null;
  task.blockers = ['Current content snapshot reconciled; independent review of this exact revision pending.'];
  task.evidence.push(task.revision.manifest);
  task.handoff ??= `.execution/drafts/${id}.md`;
  task.lease = null;
} else if (action === 'start') {
  assert.ok(reviewer, 'Implementation worker identity required.');
  assert.ok(graph.tasks.find(item => item.id === id).dependencies.every(dep => state.tasks[dep].status === 'done' && state.tasks[dep].integrationStatus !== 'needs_revalidation'));
  assert.ok(!task.lease && task.status !== 'done');
  task.owner = reviewer; task.status = 'running'; task.implementationStatus = 'running';
  task.lease = { owner: reviewer, startedAt: new Date().toISOString(), mode: 'multi_agent' };
  task.attempt += 1; task.blockers = []; task.independentReviewStatus = 'pending';
  state.currentTask = id;
} else if (action === 'accept') {
  assert.ok(reviewer && reviewer !== task.owner);
  assert.ok(graph.tasks.find(item => item.id === id).dependencies.every(dep => state.tasks[dep].status === 'done' && state.tasks[dep].integrationStatus !== 'needs_revalidation'));
  const reportPath = `.execution/drafts/${id}-independent-review.md`;
  const report = await readFile(resolve(root, reportPath), 'utf8');
  assert.ok(report.includes(task.revision.digest), 'Reviewer must bind the exact current revision.');
  assert.ok(/^Decision: APPROVED\s*$/m.test(report), 'Report must explicitly approve on its decision line.');
  const manifest = JSON.parse(await readFile(resolve(root, task.revision.manifest), 'utf8'));
  assert.equal(sha(JSON.stringify(manifest)), task.revision.digest);
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(root, file.path));
    assert.equal(sha(bytes), file.sha256, file.path);
  }
  const draft = await readFile(resolve(root, task.handoff), 'utf8');
  await mkdir(resolve(root, '.execution/handoffs'), { recursive: true });
  const handoffPath = `.execution/handoffs/${id}-${task.revision.digest}.md`;
  await writeFile(resolve(root, handoffPath), `# Accepted current handoff: ${id}\n\nAssurance: tested\nRevision: ${task.revision.digest}\nManifest: ${task.revision.manifest}\nReviewer: ${reviewer}\n\n${report}\n\n## Prior implementation context (historical revisions preserved)\n\n${draft}`, { flag: 'wx' });
  task.handoff = handoffPath; task.status = 'done'; task.implementationStatus = 'checked';
  task.integrationStatus = 'verified';
  task.independentReviewStatus = 'verified'; task.reviewer = reviewer; task.lease = null; task.blockers = [];
  task.evidence.push(reportPath);
} else if (action === 'reconcile') {
  assert.equal(id, 'M1.3');
  task.owner = 'auth_resume';
  task.lease = { owner: 'auth_resume', startedAt: new Date().toISOString(), mode: 'multi_agent', phase: 'inspection_pending_prerequisite_review' };
} else if (action === 'verification_pending') {
  task.implementationStatus = 'in_progress';
  if (id === 'M1.1') task.owner = 'root';
} else if (action === 'inspection_checkpoint') {
  assert.equal(id, 'M1.3');
  task.lease = null; task.implementationStatus = 'in_progress';
  task.handoff = '.execution/drafts/M1.3.md';
  task.blockers = ['Interrupted implementation inspected; implementation design saved. Required independent prerequisite reviews are in progress before normal implementation resumes.'];
} else if (action === 'revalidation_pending') {
  assert.equal(task.status, 'done');
  task.integrationStatus = 'needs_revalidation';
} else throw new Error('Unknown coordinator operation.');
state.coordinator = action === 'metadata_rebind' ? 'devin-coordinator-sequential' : 'root'; state.reviewMode = action === 'metadata_rebind' ? 'sequential_fallback' : 'multi_agent';
state.lastUpdatedAt = new Date().toISOString();
state.nextEligibleTasks = graph.tasks.filter(item => ['pending', 'changes_requested'].includes(state.tasks[item.id].status) && item.dependencies.every(dep => state.tasks[dep].status === 'done' && state.tasks[dep].integrationStatus !== 'needs_revalidation')).map(item => item.id);
state.blockedTasks = Object.keys(state.tasks).filter(key => state.tasks[key].status === 'blocked');
for (const milestone of Object.keys(state.milestones)) {
  const entries = graph.tasks.filter(item => item.milestone === milestone).map(item => state.tasks[item.id]);
  state.milestones[milestone] = entries.every(item => item.status === 'done') ? 'done' : entries.some(item => item.status === 'blocked') ? 'blocked' : entries.every(item => item.status === 'pending') ? 'pending' : 'running';
}
state.delivery.independentReview = action === 'metadata_rebind' ? 'not_available' : 'in_progress';
state.currentTasks = Object.keys(state.tasks).filter(key => state.tasks[key].lease);
state.integrationRevalidation = Object.keys(state.tasks).filter(key => state.tasks[key].integrationStatus === 'needs_revalidation');
if (action !== 'metadata_rebind') state.nextWork = { resumeCurrentTask: state.currentTask, inProgressTasks: state.currentTasks, integrationRevalidation: state.integrationRevalidation, eligibleAfterIndependentReview: state.nextEligibleTasks, reason: 'Reconciled interrupted implementation and current content; distinct reviewers are active.' };
else { state.independentReviewVerified = false; state.projectStatus = 'implementation_checked_review_pending'; }
await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(statePath + '.tmp', statePath);
console.log(JSON.stringify({ action, id, revision: task.revision, status: task.status }));
