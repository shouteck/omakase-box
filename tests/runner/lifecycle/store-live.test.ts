import { build } from 'vite';
import { expect, it } from 'vitest';
import { acquireHostRuntime } from '../../../scripts/host-test-runtime.mjs';

const fixtureRelative = 'services/private-api/jobs/live-fixture.ts';

interface ScenarioReport { [name: string]: unknown }

function runViteBundle(entry: string) {
  return build({
    configFile: false,
    logLevel: 'silent',
    build: { ssr: entry, write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } }
  });
}

async function runScenario(runtime: Awaited<ReturnType<typeof acquireHostRuntime>>, sourceChunk: string, name: string): Promise<ScenarioReport> {
  const source = `${sourceChunk}\ntry { console.log(JSON.stringify(await runScenario(${JSON.stringify(name)}))); } catch (error) { console.error(error instanceof Error ? error.message : 'fixture_scenario_failed'); process.exitCode = 1; }\n`;
  const result = await runtime.exec('private-api', ['--input-type=module'], { input: source, timeout: 60000, env: { SYNTHETIC_JOB_FIXTURE: 'private-task-mvp-synthetic' } });
  if (result.code !== 0) throw new Error(`Synthetic job lifecycle scenario ${name} failed: ${result.stderr.slice(-4000)}`);
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as ScenarioReport;
  return report;
}

let liveBundle: string | null = null;
async function bundleFor(): Promise<string> {
  if (liveBundle !== null) return liveBundle;
  const bundle = await runViteBundle(fixtureRelative);
  const chunks = Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : [];
  const candidates = chunks as unknown as Array<{ type?: string; code?: string }>;
  const chunk = candidates.find(item => item.type === 'chunk' && typeof item.code === 'string');
  if (!chunk || chunk.code === undefined) throw new Error('jobs fixture bundle did not produce a chunk');
  liveBundle = chunk.code;
  return liveBundle;
}

it('job activation, cancellation and evidence behaviours run against a real isolated synthetic private database', async () => {
  const code = await bundleFor();
  expect(typeof code).toBe('string');
  const runtime = await acquireHostRuntime();
  try {
    expect(await runScenario(runtime, code, 'authorization')).toMatchObject({ assurance: 'tested', requester: 'forbidden_role', owner: 'forbidden_role', operatorEnqueue: 'allowed' });
    expect(await runScenario(runtime, code, 'authority')).toMatchObject({ assurance: 'tested', releaseContext: 'required', imageBinding: 'enforced', harnessBinding: 'enforced', publishedChecksExact: 'enforced', deadlineWindow: 'enforced', supersededAttempt: 'missing_evidence', zeroJobsFromAssertions: 'tested' });
  } finally { await runtime.cleanup(); }
}, 120000);

it('enqueue is idempotent per attempt permit kind and never re-discloses', async () => {
  const code = await bundleFor();
  const runtime = await acquireHostRuntime();
  try {
    expect(await runScenario(runtime, code, 'idempotent')).toMatchObject({ assurance: 'tested', duplicateIdempotent: 'tested', noExtraEvaluationVersion: 'tested', conflictingDigest: 'job_binding_conflict', concurrentRaces: 'one_created_gated' });
  } finally { await runtime.cleanup(); }
}, 120000);

it('verified results chain public-then-private and bind exact artifact bytes in owner-review evidence', async () => {
  const code = await bundleFor();
  const runtime = await acquireHostRuntime();
  try {
    expect(await runScenario(runtime, code, 'verified-flow')).toMatchObject({ assurance: 'tested', verifiedChain: 'public_then_private', exactArtifactLinkage: 'tested', ownerReview: 'built_with_both_kinds', });
  } finally { await runtime.cleanup(); }
}, 120000);

it('replayed, corrupt, forged, expired and malformed results never become passed or accepted', async () => {
  const code = await bundleFor();
  const runtime = await acquireHostRuntime();
  try {
    expect(await runScenario(runtime, code, 'anomalies-never-pass')).toMatchObject({
      assurance: 'tested',
      replayed: 'unverified_recorded',
      corruptSignature: 'unverified_completed_infra_failure',
      forgedBinding: 'unverified_completed_infra_failure',
      logMismatch: 'unverified_completed_infra_failure',
      runnerUnverified: 'never_passing',
      malformed: 'never_passing',
      pastDeadline: 'never_passing',
      resultAfterCancel: 'unverified_recorded',
      noAcceptedAnything: 'tested'
    });
  } finally { await runtime.cleanup(); }
}, 120000);

it('interrupted and timed-out jobs land in infrastructure states and stay terminal', async () => {
  const code = await bundleFor();
  const runtime = await acquireHostRuntime();
  try {
    expect(await runScenario(runtime, code, 'interruptions')).toMatchObject({ assurance: 'tested', queuedTimeout: 'denied', runnerUnavailable: 'infrastructure_failure', runningTimeout: 'infrastructure_failure', terminalStayTerminal: 'tested' });
  } finally { await runtime.cleanup(); }
}, 120000);

it('job cleanup is scoped to its own workspace and cannot affect another workspace or active job', async () => {
  const code = await bundleFor();
  const runtime = await acquireHostRuntime();
  try {
    expect(await runScenario(runtime, code, 'cleanup-isolation')).toMatchObject({ assurance: 'tested', scopedLogCleanup: 'tested', secondWorkspaceUnaffected: 'tested', completedCleanup: 'refused', replayAfterTerminal: 'unverified_recorded', staleVersion: 'denied' });
  } finally { await runtime.cleanup(); }
}, 120000);

it('SQL guards reject binding mutation, stale versions, result tampering and oversized log bytes', async () => {
  const code = await bundleFor();
  const runtime = await acquireHostRuntime();
  try {
    expect(await runScenario(runtime, code, 'sql-guards')).toMatchObject({ assurance: 'tested', immutableJobBinding: 'tested', immutableResults: 'tested', immutableLogs: 'tested', boundedLogBytes: 'tested', staleVersions: 'denied' });
  } finally { await runtime.cleanup(); }
}, 120000);

it('public and private kinds keep separate artifact bundles with exact digest linkage', async () => {
  const code = await bundleFor();
  const runtime = await acquireHostRuntime();
  try {
    expect(await runScenario(runtime, code, 'separate-bundles')).toMatchObject({ assurance: 'tested', separateBundles: 'tested', exactDigestLinkage: 'tested', forgedPrivate: 'replayed_unverified' });
  } finally { await runtime.cleanup(); }
}, 120000);

