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
const task = state.tasks['M6.3'];
assert.equal(state.deferredRunner.implementationOnly, true);
assert.equal(state.deferredRunner.hostExecutionAllowed, false);
assert.equal(task.status, 'blocked');
assert.equal(task.lease, null);
const timestamp = new Date().toISOString();
if (action === 'start') {
  assert.ok(!task.localImplementation?.lease);
  if (task.revision) (task.checkpointHistory ??= []).push({ revision: task.revision, handoff: task.handoff, localImplementation: task.localImplementation, resumedAt: timestamp });
  state.nextWork = { ...state.nextWork, resumeLocalUnit: 'M6.3' };
  task.localImplementation = { assurance: 'unverified', status: 'running', phase: 'bounded_patch_intake', integratedIntoRuntime: false, candidateExecution: false, independentReview: 'not_available', lease: { owner: 'devin-coordinator-sequential', startedAt: timestamp } };
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
  for (const scope of ['services/external-api/submissions', 'services/private-api/submission-import', 'packages/evaluation', 'tests/security/submissions', 'tests/security/patch-and-budget', 'tests/portal/submissions', 'services/external-api/db', 'services/private-api/db', 'services/external-api/src', 'services/external-api/bootstrap', 'services/private-api/src', 'services/private-api/bootstrap', 'infra']) await collect(join(root, scope));
  for (const file of ['docs/DECISIONS.md', 'scripts/synthetic-runtime.mjs', 'scripts/migrate-runtime.mjs']) {
    const bytes = await readFile(join(root, file));
    files.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const label of ['intake-live-final', 'portal-submissions-final', 'patch-validation-final', 'check-final', 'migrate-final']) {
    const check = JSON.parse(await readFile(join(root, `.execution/evidence/M6.3/${label}.json`), 'utf8'));
    assert.equal(check.exitCode, 0, label); assert.equal(check.truncated, false, label);
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { taskId: 'M6.3', assurance: 'unverified', taskDefinitionSha256: createHash('sha256').update(graphBytes).digest('hex'), files };
  const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const evidence = join(root, '.execution/evidence/M6.3');
  await mkdir(evidence, { recursive: true });
  const manifestPath = `.execution/evidence/M6.3/revision-${digest}.json`;
  await writeFile(join(root, manifestPath), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  task.revision = { algorithm: 'sha256', digest, manifest: manifestPath };
  task.handoff = '.execution/drafts/M6.3-delivery-20261005.md';
  task.evidence = (await readdir(evidence)).filter(name => name.endsWith('.json')).map(name => `.execution/evidence/M6.3/${name}`);
  task.localImplementation = { ...task.localImplementation, status: 'checkpointed', assurance: 'tested', lease: null, revision: digest, phase: 'atomic_intake_signed_permit_import', integratedIntoRuntime: true, candidateExecution: false, requiredSecuritySuite: 'passed', requiredPortalSuite: 'passed', nextStep: 'Coordinator review of the bounded-intake slice; M5.2 supervisor/guest bootstrap is the next local unit; independent-review and real-runner gates stay open.', limitations: ['Local synthetic PostgreSQL checks only; no candidate execution anywhere and none claimed.', 'Live fixtures drive the store/importer in-container; the HTTP contributor submission path is covered by route unit tests and mounted ingest probes, not a browser journey.', 'Independent review remains unavailable and unclaimed.', 'External publication remains M4.3-gated; fixtures seed published rows directly as in M6.2.'] };
}
state.lastUpdatedAt = timestamp;
state.projectStatus = 'implementation_checked_review_pending';
state.lastResume = { assurance: 'bounded', timestamp, coordinator: 'devin-coordinator-sequential', taskId: 'M6.3', action, normalPrerequisitesUnchanged: true };
const temporary = path + '.tmp';
await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(temporary, path);
console.log(JSON.stringify({ taskId: 'M6.3', action, status: task.status, localImplementation: task.localImplementation, revision: task.revision }));
