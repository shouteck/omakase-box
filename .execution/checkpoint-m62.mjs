import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const action = process.argv[2];
assert.ok(['start', 'resume', 'pause', 'attach'].includes(action));
const path = join(root, '.execution/state.json');
const state = JSON.parse(await readFile(path, 'utf8'));
const task = state.tasks['M6.2'];
assert.equal(state.deferredRunner.implementationOnly, true);
assert.equal(state.deferredRunner.hostExecutionAllowed, false);
assert.equal(state.nextWork.resumeLocalUnit, 'M6.2');
assert.equal(task.status, 'blocked');
assert.equal(task.lease, null);
const timestamp = new Date().toISOString();
if (action === 'start') {
  assert.ok(!task.localImplementation?.lease);
  if (task.revision) (task.checkpointHistory ??= []).push({ revision: task.revision, handoff: task.handoff, localImplementation: task.localImplementation, resumedAt: timestamp });
  task.localImplementation = { assurance: 'unverified', status: 'running', phase: 'reservation_component', integratedIntoRuntime: false, publicationEnabled: false, independentReview: 'not_available', lease: { owner: 'devin-coordinator-sequential', startedAt: timestamp } };
} else if (action === 'resume') {
  assert.equal(task.localImplementation?.lease?.owner, 'devin-coordinator-sequential');
  task.localImplementation.lease.resumedAt = timestamp;
  task.localImplementation.phase = 'assignment_delivery_recovery';
  task.localImplementation.assurance = 'unverified';
} else if (action === 'attach') {
  assert.equal(task.localImplementation?.lease, null);
  task.evidence = (await readdir(join(root, '.execution/evidence/M6.2'))).filter(name => name.endsWith('.json')).map(name => `.execution/evidence/M6.2/${name}`);
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
  for (const scope of ['services/external-api/reservations', 'apps/contributor-portal', 'apps/private-console/assignments', 'services/private-api/assignments', 'tests/portal/reservations', 'tests/portal/reservation', 'tests/e2e/contributor', 'services/external-api/auth', 'services/external-api/bootstrap', 'services/external-api/src', 'services/external-api/db', 'services/private-api/src', 'services/private-api/bootstrap', 'services/private-api/db', 'infra', 'tests/auth/bootstrap', 'apps/private-console/src']) await collect(join(root, scope));
  for (const file of ['docs/DECISIONS.md', 'scripts/synthetic-runtime.mjs', 'scripts/migrate-runtime.mjs']) {
    const bytes = await readFile(join(root, file));
    files.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const label of ['resume-delivery-20261004-check-final', 'resume-delivery-20261004-portal-final', 'resume-delivery-20261004-e2e-final', 'resume-delivery-20261004-migrate', 'resume-delivery-20261004-container-smoke']) {
    const check = JSON.parse(await readFile(join(root, `.execution/evidence/M6.2/${label}.json`), 'utf8'));
    assert.equal(check.exitCode, 0, label); assert.equal(check.truncated, false, label);
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { taskId: 'M6.2', assurance: 'unverified', taskDefinitionSha256: createHash('sha256').update(graphBytes).digest('hex'), files };
  const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const evidence = join(root, '.execution/evidence/M6.2');
  await mkdir(evidence, { recursive: true });
  const manifestPath = `.execution/evidence/M6.2/revision-${digest}.json`;
  await writeFile(join(root, manifestPath), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  task.revision = { algorithm: 'sha256', digest, manifest: manifestPath };
  task.handoff = '.execution/drafts/M6.2-delivery-20261004.md';
  task.evidence = (await readdir(evidence)).filter(name => name.endsWith('.json')).map(name => `.execution/evidence/M6.2/${name}`);
  task.localImplementation = { ...task.localImplementation, status: 'checkpointed', assurance: 'tested', lease: null, revision: digest, requiredContributorSuite: 'passed', phase: 'runtime_integrated_assignment_delivery', integratedIntoRuntime: true, nextStep: 'Coordinator review of the delivery slice including mounted-route owner-choose evidence; M6.3 bounded patch intake is the next local unit; independent-review and real-runner gates stay open.', limitations: ['Local synthetic checks only; no publication/readiness/runner/acceptance/payment gate cleared.', 'External publication rows are seeded directly in the mounted-route smoke because signed publication is M4.3-gated and absent from the default runtime.', 'Board reservation through mounted contributor routes against a published task is unexercised in the default runtime.', 'AssignmentsScreen is covered by component/unit checks, not a full browser journey.', 'Independent review remains unavailable and unclaimed.'] };
}
state.lastUpdatedAt = timestamp;
state.projectStatus = 'implementation_checked_review_pending';
state.lastResume = { assurance: 'bounded', timestamp, coordinator: 'devin-coordinator-sequential', taskId: 'M6.2', action, normalPrerequisitesUnchanged: true };
const temporary = path + '.tmp';
await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(temporary, path);
console.log(JSON.stringify({ taskId: 'M6.2', action, status: task.status, localImplementation: task.localImplementation, revision: task.revision }));
