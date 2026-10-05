import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, matchesGlob, relative } from 'node:path';
import { root } from './process.mjs';

const [action, taskId, ...reasons] = process.argv.slice(2);
const statePath = join(root, '.execution', 'state.json');
const state = JSON.parse(await readFile(statePath, 'utf8'));
const graphBytes = await readFile(join(root, 'tasks', 'task-graph.json'));
const graph = JSON.parse(graphBytes);
const definition = graph.tasks.find(task => task.id === taskId);
if (!definition || !['start', 'checked', 'blocked', 'pause'].includes(action)) process.exit(2);
const task = state.tasks[taskId];
const identity = 'devin-coordinator-sequential';
const sharedPaths = ['.node-version', 'docs/DECISIONS.md', 'AGENTS.md', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'scripts/**', 'services/*/src/bootstrap/main.ts', 'infra/trusted.Dockerfile', 'infra/trusted.Dockerfile.dockerignore', 'apps/*/vite.config.ts'];
const integrationPaths = { 'M1.3': ['packages/contracts/auth/**', 'tests/security/authorization/**', 'services/*/src/bootstrap/server.ts', 'services/*/bootstrap/build.mjs'], 'M5.1': ['tests/runner/protocol/**'], 'M2.1': ['tests/security/evidence/**', 'services/private-api/db/schema.ts', 'services/private-api/db/migrations/0005_private_intake.sql', 'services/private-api/db/migrations/meta/_journal.json', 'packages/contracts/auth/policy.ts', 'services/private-api/src/bootstrap/server.ts', 'services/private-api/bootstrap/build.mjs', 'infra/compose.yaml', 'tests/bootstrap/commands.test.ts'], 'M2.2': ['packages/contracts/private/planning.ts', 'tests/security/prompt-injection/**'], 'M2.3': ['services/private-api/db/intent-store.ts', 'services/private-api/bootstrap/build.mjs'], 'M5.3': ['services/private-api/db/migrations/0007_evaluation_jobs.sql', 'services/private-api/db/migrations/meta/_journal.json'], 'M3.4': ['packages/contracts/public/response-policy.ts', 'tests/security/policy-scope/policy.test.ts'], 'M4.1': ['services/private-api/db/migrations/0006_immutable_release_content.sql', 'services/private-api/db/migrations/meta/_journal.json', 'apps/private-console/src/bootstrap/main.tsx', 'services/private-api/src/bootstrap/server.ts'], 'M4.3': ['services/private-api/db/migrations/0010_readiness.sql', 'services/private-api/db/migrations/meta/_journal.json', 'services/private-api/src/bootstrap/server.ts', 'services/private-api/src/bootstrap/main.ts'], 'M7.1': ['services/private-api/preparations/policy/index.ts', 'scripts/verify-evaluation-pipeline.mjs'] };
state.coordinator = identity;
state.reviewMode = 'sequential_fallback';
state.independentReviewVerified = false;
state.lastUpdatedAt = new Date().toISOString();
if (action === 'start') {
  if (!definition.dependencies.every(id => state.tasks[id].status === 'done' || state.tasks[id].implementationStatus === 'checked')) throw new Error('Implementation prerequisites are not checked.');
  if (task.lease || task.status === 'done') throw new Error('Task has an active lease or is complete.');
  task.status = 'running';
  task.owner = identity;
  task.lease = { owner: identity, startedAt: state.lastUpdatedAt, mode: 'sequential' };
  task.attempt += 1;
  task.implementationStatus = 'running';
  task.independentReviewStatus = 'not_available';
  state.currentTask = taskId;
  state.projectStatus = 'in_progress';
} else {
  const files = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['.git', '.runtime', 'node_modules', 'dist', '.execution', 'data', 'secrets', 'coverage', 'playwright-report', 'test-results'].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile()) {
        const local = relative(root, path).replaceAll('\\', '/');
        if ([...definition.writePaths, ...sharedPaths, ...(integrationPaths[taskId] ?? [])].some(pattern => matchesGlob(local, pattern))) {
          const bytes = await readFile(path);
          files.push({ path: local, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
        }
      }
    }
  }
  await collect(root);
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { taskId, assurance: action === 'checked' ? 'tested' : 'unverified', taskDefinitionSha256: createHash('sha256').update(graphBytes).digest('hex'), files };
  const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const directory = join(root, '.execution', 'evidence', taskId);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `revision-${digest}.json`);
  const encoded = JSON.stringify(manifest, null, 2) + '\n';
  try { await writeFile(path, encoded, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || await readFile(path, 'utf8') !== encoded) throw error;
  }
  if (task.status === 'done') task.previousAccepted = { revision: task.revision, reviewer: task.reviewer, handoff: task.handoff, independentReviewStatus: task.independentReviewStatus };
  task.owner = identity;
  task.revision = { algorithm: 'sha256', digest, manifest: relative(root, path).replaceAll('\\', '/') };
  if (task.integrationStatus === 'needs_revalidation' && action === 'checked') task.integrationStatus = 'checked_review_pending';
  task.evidence = (await readdir(directory)).filter(name => name.endsWith('.json')).map(name => `.execution/evidence/${taskId}/${name}`);
  task.handoff = `.execution/drafts/${taskId}.md`;
  task.status = action === 'checked' ? 'review' : action === 'blocked' ? 'blocked' : 'running';
  task.implementationStatus = action === 'checked' ? 'checked' : action === 'blocked' ? 'blocked' : 'in_progress';
  task.independentReviewStatus = 'not_available';
  task.reviewer = null;
  task.blockers = reasons;
  task.lease = null;
  state.currentTask = action === 'checked' ? null : taskId;
  state.projectStatus = action === 'checked' ? 'implementation_checked_review_pending' : 'in_progress';
}
state.nextEligibleTasks = graph.tasks.filter(item => ['pending', 'changes_requested'].includes(state.tasks[item.id].status) && item.dependencies.every(id => state.tasks[id].status === 'done' || state.tasks[id].implementationStatus === 'checked')).map(item => item.id);
state.blockedTasks = Object.entries(state.tasks).filter(([, task]) => task.status === 'blocked').map(([id]) => id);
for (const milestone of Object.keys(state.milestones)) {
  const entries = graph.tasks.filter(item => item.milestone === milestone).map(item => state.tasks[item.id]);
  state.milestones[milestone] = entries.every(item => item.status === 'done') ? 'done' : entries.some(item => item.status === 'blocked') ? 'blocked' : entries.every(item => item.status === 'pending') ? 'pending' : 'running';
}
state.currentTasks = Object.entries(state.tasks).filter(([, item]) => item.status === 'running').map(([id]) => id);
state.integrationRevalidation = Object.entries(state.tasks).filter(([, item]) => item.integrationStatus === 'needs_revalidation').map(([id]) => id);
state.nextWork = state.currentTask && state.tasks[state.currentTask].implementationStatus === 'in_progress' ? { resumeCurrentTask: state.currentTask, implementationEligible: state.nextEligibleTasks, reason: 'Current implementation is checkpointed, not complete; resume it before advancing dependent tasks.' } : state.nextEligibleTasks.length ? { implementationEligible: state.nextEligibleTasks } : { resumeBlockedTasks: state.blockedTasks, reason: 'All remaining implementation paths require blocked prerequisites; independent-review gates remain open.' };
if (action !== 'start' && Object.values(state.tasks).some(item => item.implementationStatus === 'checked')) state.projectStatus = 'implementation_checked_review_pending';
state.delivery.software = 'incomplete';
state.delivery.independentReview = 'not_available';
const temporary = statePath + '.tmp';
await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
await rename(temporary, statePath);
console.log(JSON.stringify({ taskId, action, revision: task.revision, nextEligibleTasks: state.nextEligibleTasks }));
