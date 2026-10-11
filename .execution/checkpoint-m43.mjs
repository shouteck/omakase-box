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
const task = state.tasks['M4.3'];
assert.equal(state.deferredRunner.implementationOnly, true);
assert.equal(state.deferredRunner.hostExecutionAllowed, false);
assert.equal(task.status, 'blocked');
assert.equal(task.lease, null);
const timestamp = new Date().toISOString();
if (action === 'start') {
  assert.ok(!task.localImplementation?.lease);
  if (task.revision) (task.checkpointHistory ??= []).push({ revision: task.revision, handoff: task.handoff, localImplementation: task.localImplementation, resumedAt: timestamp });
  state.nextWork = { ...state.nextWork, resumeLocalUnit: 'M4.3' };
  task.localImplementation = { assurance: 'unverified', status: 'running', phase: 'readiness_publication_gate', integratedIntoRuntime: false, candidateExecution: false, independentReview: 'not_available', lease: { owner: 'devin-coordinator-sequential', startedAt: timestamp } };
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
  for (const scope of ['services/private-api/readiness', 'apps/private-console/readiness', 'tests/compiler/readiness', 'tests/contracts/publication']) await collect(join(root, scope));
  for (const file of ['docs/DECISIONS.md', 'services/private-api/db/migrations/0010_readiness.sql', 'services/private-api/db/migrations/meta/_journal.json', 'services/private-api/src/bootstrap/server.ts', 'services/private-api/src/bootstrap/main.ts', 'apps/private-console/src/bootstrap/main.tsx', 'infra/trusted.Dockerfile', 'infra/trusted.Dockerfile.dockerignore', 'scripts/verify-readiness.mjs', 'scripts/execution.mjs']) {
    const bytes = await readFile(join(root, file));
    files.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const label of ['compiler-readiness-pass', 'contracts-publication', 'readiness-live', 'check-verified']) {
    const check = JSON.parse(await readFile(join(root, `.execution/evidence/M4.3/${label}.json`), 'utf8'));
    assert.equal(check.exitCode, 0, label); assert.equal(check.truncated, false, label);
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { taskId: 'M4.3', assurance: 'unverified', taskDefinitionSha256: createHash('sha256').update(graphBytes).digest('hex'), files };
  const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const evidence = join(root, '.execution/evidence/M4.3');
  await mkdir(evidence, { recursive: true });
  const manifestPath = `.execution/evidence/M4.3/revision-${digest}.json`;
  const encoded = JSON.stringify(manifest, null, 2) + '\n';
  try { await writeFile(join(root, manifestPath), encoded, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || await readFile(join(root, manifestPath), 'utf8') !== encoded) throw error;
  }
  task.revision = { algorithm: 'sha256', digest, manifest: manifestPath };
  task.handoff = '.execution/drafts/M4.3.md';
  task.evidence = (await readdir(evidence)).filter(name => name.endsWith('.json')).map(name => `.execution/evidence/M4.3/${name}`);
  task.localImplementation = { ...task.localImplementation, status: 'checkpointed', assurance: 'tested', lease: null, revision: digest, phase: 'readiness_publication_gate', integratedIntoRuntime: true, candidateExecution: false, requiredCompilerSuite: 'passed', requiredContractsSuite: 'passed', realRunnerGate: 'unverified', nextStep: 'M7.1 evaluation orchestration failing closed without a real runner is the next local unit; real-runner and independent-review gates stay open.', limitations: ['No VM ever ran: fresh_build/integration/preservation/external_solve records can only be unverified on real data, so the gate can only persist blocked decisions today — correct fail-closed behaviour.', 'Approval verification composes with the existing M6.2 releaseReadinessGate; the gate checks private_release_approvals for the exact task/version.', 'Independent review remains unavailable and unclaimed; implementer-only checkpoint.', 'No private evidence or reference-patch content leaves the private store; detailsDigest is the only off-row pointer.'] };
}
state.lastUpdatedAt = timestamp;
state.projectStatus = 'implementation_checked_review_pending';
state.lastResume = { assurance: 'bounded', timestamp, coordinator: 'devin-coordinator-sequential', taskId: 'M4.3', action, normalPrerequisitesUnchanged: true };
const temporary = path + '.tmp';
await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(temporary, path);
console.log(JSON.stringify({ taskId: 'M4.3', action, status: task.status, localImplementation: task.localImplementation, revision: task.revision }));
