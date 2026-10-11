import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const action = process.argv[2];
assert.ok(['start', 'pause'].includes(action));
const path = join(root, '.execution/state.json');
const state = JSON.parse(await readFile(path, 'utf8'));
const task = state.tasks['M7.1'];
assert.equal(state.deferredRunner.implementationOnly, true);
assert.equal(state.deferredRunner.hostExecutionAllowed, false);
assert.equal(task.status, 'blocked');
assert.equal(task.lease, null);
const timestamp = new Date().toISOString();
if (action === 'start') {
  assert.ok(!task.localImplementation?.lease);
  if (task.revision) (task.checkpointHistory ??= []).push({ revision: task.revision, handoff: task.handoff, localImplementation: task.localImplementation, resumedAt: timestamp });
  state.nextWork = { ...state.nextWork, resumeLocalUnit: 'M7.1' };
  task.localImplementation = { assurance: 'unverified', status: 'running', phase: 'evaluation_orchestration_pipeline', integratedIntoRuntime: false, candidateExecution: false, independentReview: 'not_available', lease: { owner: 'devin-coordinator-sequential', startedAt: timestamp } };
} else {
  assert.equal(task.localImplementation?.lease?.owner, 'devin-coordinator-sequential');
  const graphBytes = await readFile(join(root, 'tasks/task-graph.json'));
  const files = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'test-results'].includes(entry.name)) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile()) {
        const bytes = await readFile(file);
        files.push({ path: relative(root, file).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  for (const scope of ['packages/evaluation/pipeline', 'services/private-api/evaluations', 'tests/acceptance/integration']) await collect(join(root, scope));
  for (const file of ['docs/DECISIONS.md', 'services/private-api/preparations/policy/index.ts', 'scripts/verify-evaluation-pipeline.mjs', 'scripts/execution.mjs']) {
    const bytes = await readFile(join(root, file));
    files.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const label of ['integration-pipeline', 'live-guards', 'check-verified']) {
    const check = JSON.parse(await readFile(join(root, `.execution/evidence/M7.1/${label}.json`), 'utf8'));
    assert.equal(check.exitCode, 0, label); assert.equal(check.truncated, false, label);
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { taskId: 'M7.1', assurance: 'unverified', taskDefinitionSha256: createHash('sha256').update(graphBytes).digest('hex'), files };
  const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const evidence = join(root, '.execution/evidence/M7.1');
  await mkdir(evidence, { recursive: true });
  const manifestPath = `.execution/evidence/M7.1/revision-${digest}.json`;
  const encoded = JSON.stringify(manifest, null, 2) + '\n';
  try { await writeFile(join(root, manifestPath), encoded, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || await readFile(join(root, manifestPath), 'utf8') !== encoded) throw error;
  }
  task.revision = { algorithm: 'sha256', digest, manifest: manifestPath };
  task.handoff = '.execution/drafts/M7.1.md';
  task.evidence = (await readdir(evidence)).filter(name => name.endsWith('.json')).map(name => `.execution/evidence/M7.1/${name}`);
  task.localImplementation = { ...task.localImplementation, status: 'checkpointed', assurance: 'tested', lease: null, revision: digest, phase: 'evaluation_orchestration_pipeline', integratedIntoRuntime: true, candidateExecution: false, requiredAcceptanceSuite: 'passed', realRunnerGate: 'unverified', nextStep: 'M7.2 owner acceptance and payment-obligation transaction is the next local unit; real-runner and independent-review gates stay open.', limitations: ['No VM ever ran: jobs are planned/enqueued but complete only via runner_unavailable interruption or stay queued; --real exits 2 unverified by design.', 'EvaluationPipeline is a delivered library facade over EvaluationJobStore, not yet route-mounted; no evidence-writing path exists outside signature-verified job results.', 'The owner_review advance on aggregate pass is owned by M5.3 store without fit; applyFit may downgrade it afterwards. candidateDiffHash binds at M7.2 acceptance against the same stored binding.', 'Independent review remains unavailable and unclaimed; implementer-only checkpoint.'] };
}
state.lastUpdatedAt = timestamp;
state.projectStatus = 'implementation_checked_review_pending';
state.lastResume = { assurance: 'bounded', timestamp, coordinator: 'devin-coordinator-sequential', taskId: 'M7.1', action, normalPrerequisitesUnchanged: true };
const temporary = path + '.tmp';
await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(temporary, path);
console.log(JSON.stringify({ taskId: 'M7.1', action, status: task.status, localImplementation: task.localImplementation, revision: task.revision }));
