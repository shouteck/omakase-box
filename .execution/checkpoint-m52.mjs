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
const task = state.tasks['M5.2'];
assert.equal(state.deferredRunner.implementationOnly, true);
assert.equal(state.deferredRunner.hostExecutionAllowed, false);
assert.equal(task.status, 'blocked');
assert.equal(task.lease, null);
const timestamp = new Date().toISOString();
if (action === 'start') {
  assert.ok(!task.localImplementation?.lease);
  if (task.revision) (task.checkpointHistory ??= []).push({ revision: task.revision, handoff: task.handoff, localImplementation: task.localImplementation, resumedAt: timestamp });
  state.nextWork = { ...state.nextWork, resumeLocalUnit: 'M5.2' };
  task.localImplementation = { assurance: 'unverified', status: 'running', phase: 'guest_sandbox_supervisor_channel', integratedIntoRuntime: false, candidateExecution: false, independentReview: 'not_available', lease: { owner: 'devin-coordinator-sequential', startedAt: timestamp } };
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
  for (const scope of ['infra/runner', 'services/runner-controller/isolation', 'tests/security/runtime', 'tests/runner']) await collect(join(root, scope));
  for (const file of ['docs/DECISIONS.md', 'packages/runner-protocol/index.ts', 'services/runner-controller/provider.ts', 'services/runner-controller/controller.ts', 'services/runner-controller/transport.ts', 'services/runner-controller/isolation/plan.ts']) {
    const bytes = await readFile(join(root, file));
    files.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const label of ['runtime-suite', 'runner-protocol', 'broker-run-cases', 'real-runner-gate', 'real-runtime-gate', 'workspace-check-pass']) {
    const check = JSON.parse(await readFile(join(root, `.execution/evidence/M5.2/${label}.json`), 'utf8'));
    if (['real-runner-gate', 'real-runtime-gate'].includes(label)) assert.equal(check.assurance, 'unverified', label);
    else { assert.equal(check.exitCode, 0, label); assert.equal(check.truncated, false, label); }
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { taskId: 'M5.2', assurance: 'unverified', taskDefinitionSha256: createHash('sha256').update(graphBytes).digest('hex'), files };
  const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const evidence = join(root, '.execution/evidence/M5.2');
  await mkdir(evidence, { recursive: true });
  const manifestPath = `.execution/evidence/M5.2/revision-${digest}.json`;
  await writeFile(join(root, manifestPath), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  task.revision = { algorithm: 'sha256', digest, manifest: manifestPath };
  task.handoff = '.execution/drafts/M5.2-delivery-20261005.md';
  task.evidence = (await readdir(evidence)).filter(name => name.endsWith('.json')).map(name => `.execution/evidence/M5.2/${name}`);
  task.localImplementation = { ...task.localImplementation, status: 'checkpointed', assurance: 'tested', lease: null, revision: digest, phase: 'guest_sandbox_supervisor_channel', integratedIntoRuntime: true, candidateExecution: false, requiredSecuritySuite: 'passed', requiredRunnerSuite: 'passed', realRunnerGate: 'unverified', nextStep: 'M5.4 fixed composition proxy and aggregate verdict validation is the next local unit; real-runner and independent-review gates stay open.', limitations: ['No VM ever booted: supervisor, container-init, cgroup and virtio-serial behavior are statically reviewed, unit-tested at the pure-module level and exercised through the injected broker harness only.', 'Real hostile-code containment, egress denial, resource enforcement and guest disposal remain unverified without the dedicated Linux KVM host.', 'Independent review remains unavailable and unclaimed.', 'writableBytesUsed is honestly null: usage inside the candidate mount namespace is not observable from the supervisor; the bounded tmpfs is the enforcement.'] };
}
state.lastUpdatedAt = timestamp;
state.projectStatus = 'implementation_checked_review_pending';
state.lastResume = { assurance: 'bounded', timestamp, coordinator: 'devin-coordinator-sequential', taskId: 'M5.2', action, normalPrerequisitesUnchanged: true };
const temporary = path + '.tmp';
await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(temporary, path);
console.log(JSON.stringify({ taskId: 'M5.2', action, status: task.status, localImplementation: task.localImplementation, revision: task.revision }));
