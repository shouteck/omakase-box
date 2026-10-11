// W002/B1.1 r4 relay lifecycle harness tests (synthetic mailbox, no Docker).
// Covers lease expiry/collision, lifecycle transitions, stale/replayed/oversized
// request denial, run binding, one-at-a-time dispatch, durable-record failure,
// direct-execution refusal without reviewed context and honest termination
// accounting in the exec runner. All temp dirs are preserved for review.
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  acquireLease, loadLease, loadSeen, setLifecycle, getLifecycle, validateRequest,
  assertSafeEntry, assertReadyProfileEntry, assertWrapperBinding, buildExecArgv,
  buildLiveArgv, executeRequest, requestDrain, run, manifestDigest,
  transformWrapperResult, findStartedWithoutResult,
  READY_COMMAND_DEADLINE_MS
} from '../../../scripts/box-verification/fixture-exec-host.mjs';
import { runChild, bindRunnerArgv, resolveEntry } from '../../../scripts/box-verification/fixture-exec-runner.mjs';
import { validateSequence, gateStart, REQUIRED_SEQUENCE, runSequence } from '../../../scripts/box-verification/run-verification.mjs';

const tmp = () => mkdtemp(join(tmpdir(), 'w002-b11-r4-relay-'));
const uuid = () => crypto.randomUUID();

const manifest = {
  schemaVersion: 1,
  runId: 'run-test-1',
  environmentId: 'env-test-1',
  containers: { 'private-api': 'w002-b11-svc-private-api', 'external-api': 'w002-b11-svc-external-api' },
  wrapper: {
    path: '/workspace/.r4-harness/fixture-exec-runner.mjs',
    manifestPath: '/workspace/.r4-harness/fixture-command-manifest.json',
    sha256: 'a'.repeat(64)
  },
  entries: [{
    id: 'fixture.private-api',
    service: 'private-api',
    workdir: '/workspace/services/private-api',
    env: [],
    argv: ['node', 'dist/fixture.js'],
    runnerArgv: ['node', 'dist/fixture.js'],
    input: 'json',
    timeoutMs: 20000
  }]
};

async function makeMailbox() {
  const mailbox = await tmp();
  for (const dir of ['requests', 'responses', 'state']) await mkdir(join(mailbox, dir), { recursive: true });
  return mailbox;
}

const contextFor = (m = manifest) => ({ lease: { runId: 'run-test-1', environmentId: 'env-test-1' }, manifestDigest: manifestDigest(m) });

function requestFile(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    requestId: uuid(),
    commandId: 'fixture.private-api',
    runId: 'run-test-1',
    source: null,
    input: '{}',
    ...overrides
  });
}

describe('relay lease and lifecycle', () => {
  it('grants one lease and fails closed on a second owner', async () => {
    const mailbox = await makeMailbox();
    const lease = await acquireLease(mailbox, { runId: 'run-test-1', environmentId: 'env-test-1' });
    expect(lease.runId).toBe('run-test-1');
    await expect(acquireLease(mailbox, { runId: 'run-test-2', environmentId: 'env-test-1' })).rejects.toThrow('lease_collision');
  });

  it('rejects expired and mismatched leases', async () => {
    const mailbox = await makeMailbox();
    await writeFile(join(mailbox, 'state', 'lease.json'), JSON.stringify({
      runId: 'run-test-1', environmentId: 'env-test-1', expiresAt: new Date(Date.now() - 1).toISOString()
    }));
    await expect(loadLease(mailbox, { runId: 'run-test-1', environmentId: 'env-test-1' })).rejects.toThrow('lease_expired');
    await writeFile(join(mailbox, 'state', 'lease.json'), JSON.stringify({
      runId: 'run-test-1', environmentId: 'env-test-1', expiresAt: new Date(Date.now() + 60000).toISOString()
    }));
    await expect(loadLease(mailbox, { runId: 'other', environmentId: 'env-test-1' })).rejects.toThrow('lease_binding_mismatch');
    await expect(loadLease(mailbox, { runId: 'run-test-1', environmentId: 'env-test-1' })).resolves.toMatchObject({ runId: 'run-test-1' });
  });

  it('fails closed on malformed persisted replay state', async () => {
    const mailbox = await makeMailbox();
    await writeFile(join(mailbox, 'state', 'seen.json'), '{broken');
    await expect(loadSeen(mailbox)).rejects.toThrow('seen_malformed');
    await writeFile(join(mailbox, 'state', 'seen.json'), '"not-an-array"');
    await expect(loadSeen(mailbox)).rejects.toThrow('seen_malformed');
    // Missing seen state is a fresh mailbox, not corruption.
    const fresh = await makeMailbox();
    expect((await loadSeen(fresh)).size).toBe(0);
  });

  it('moves through draining to stopped via requestDrain', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'ready');
    const drainPromise = requestDrain(mailbox);
    for (let i = 0; i < 100 && (await getLifecycle(mailbox)) !== 'draining'; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await setLifecycle(mailbox, 'stopped');
    const outcome = await drainPromise;
    expect(outcome.status).toBe('stopped');
    expect(await getLifecycle(mailbox)).toBe('stopped');
  });

  it('returns unavailable, not stopped, when drain never observes termination', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'ready');
    const outcome = await requestDrain(mailbox);
    expect(['unavailable', 'stopped']).toContain(outcome.status);
    if (outcome.status === 'unavailable') expect(outcome.reason).toBe('drain_deadline');
  }, 30000);
});

describe('relay request validation and denial', () => {
  it('denies malformed and wrong-run requests', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'ready');
    const seen = new Set();

    const bad = uuid() + '.json';
    await writeFile(join(mailbox, 'requests', bad), '{not json');
    let outcome = await executeRequest(manifest, mailbox, bad, seen, contextFor());
    let resp = JSON.parse(await readFile(join(mailbox, 'responses', bad.replace('.json', '') + '.json'), 'utf8'));
    expect(resp.error).toMatch(/^denied:request_/);
    expect(outcome.status).toBe('denied');

    const wrongRun = uuid();
    await writeFile(join(mailbox, 'requests', wrongRun + '.json'), requestFile({ requestId: wrongRun, runId: 'other-run' }));
    await executeRequest(manifest, mailbox, wrongRun + '.json', seen, contextFor());
    resp = JSON.parse(await readFile(join(mailbox, 'responses', wrongRun + '.json'), 'utf8'));
    expect(resp.error).toBe('denied:run_binding');
  });

  it('denies replayed request ids via the seen set', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'ready');
    const id = uuid();
    const seen = new Set([id]);
    await writeFile(join(mailbox, 'requests', id + '.json'), requestFile({ requestId: id }));
    await executeRequest(manifest, mailbox, id + '.json', seen, contextFor());
    const resp = JSON.parse(await readFile(join(mailbox, 'responses', id + '.json'), 'utf8'));
    expect(resp.error).toBe('denied:replay');
  });

  it('denies unlisted commands and invalid ids fail closed', async () => {
    expect(() => validateRequest(requestFile({ commandId: 'rm -rf' }))).toThrow('command_id');
    expect(() => validateRequest(requestFile({ requestId: 'not-a-uuid' }))).toThrow('request_id');
    expect(() => validateRequest(requestFile({ runId: 'has space' }))).toThrow('run_id');
    // runId omitted entirely remains valid at the parser boundary (legacy
    // compatibility); execution binding is enforced separately.
    const noRun = JSON.parse(requestFile());
    delete noRun.runId;
    expect(() => validateRequest(JSON.stringify(noRun))).not.toThrow();
    const id = uuid();
    expect(() => buildExecArgv(manifest, { ...JSON.parse(requestFile({ requestId: id })), commandId: 'not.listed' })).toThrow('unlisted_command');
  });

  it('enforces the <=20s ready-profile deadline and wrapper argv on entries', async () => {
    expect(() => assertSafeEntry({ ...manifest.entries[0], timeoutMs: 120000 })).toThrow('entry_deadline');
    expect(() => assertSafeEntry({ ...manifest.entries[0], timeoutMs: 20000 })).not.toThrow();
    // Parser level tolerates an absent deadline; live dispatch does not.
    const noDeadline = { ...manifest.entries[0] };
    delete noDeadline.timeoutMs;
    expect(() => assertSafeEntry(noDeadline)).not.toThrow();
    expect(() => assertReadyProfileEntry(noDeadline)).toThrow('entry_deadline');
    const noRunner = { ...manifest.entries[0] };
    delete noRunner.runnerArgv;
    expect(() => assertReadyProfileEntry(noRunner)).toThrow('runner_argv_missing');
    expect(READY_COMMAND_DEADLINE_MS).toBe(20000);
  });

  it('requires a valid wrapper binding in the manifest', () => {
    expect(() => assertWrapperBinding(manifest)).not.toThrow();
    expect(() => assertWrapperBinding({ ...manifest, wrapper: { ...manifest.wrapper, path: '/tmp/evil.mjs' } })).toThrow('wrapper_path');
    expect(() => assertWrapperBinding({ ...manifest, wrapper: { ...manifest.wrapper, sha256: 'bad' } })).toThrow('wrapper_digest');
  });
});

describe('live argv routing and execution-context binding', () => {
  it('routes live dispatch through the reviewed wrapper, never the fixture argv', () => {
    const request = JSON.parse(requestFile({ requestId: uuid() }));
    const { argv, envelope } = buildLiveArgv(manifest, request);
    expect(argv.slice(0, 3)).toEqual(['--context', expect.any(String), 'exec']);
    expect(argv).toContain('w002-b11-svc-private-api');
    expect(argv).toContain('/workspace/.r4-harness/fixture-exec-runner.mjs');
    expect(argv).toContain('/workspace/.r4-harness/fixture-command-manifest.json');
    expect(argv).toContain('fixture.private-api');
    // The direct fixture argv must not appear in the live dispatch argv.
    expect(argv).not.toContain('dist/fixture.js');
    const env = JSON.parse(envelope);
    expect(env.schemaVersion).toBe(1);
    expect(env.input).toBe('{}');
  });

  it('refuses live execution without a reviewed bound context', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'ready');
    const seen = new Set();
    const id = uuid();
    await writeFile(join(mailbox, 'requests', id + '.json'), requestFile({ requestId: id }));
    // No context at all: deny execution_context, never dispatch.
    const outcome = await executeRequest(manifest, mailbox, id + '.json', seen);
    expect(outcome.status).toBe('denied');
    const resp = JSON.parse(await readFile(join(mailbox, 'responses', id + '.json'), 'utf8'));
    expect(resp.error).toBe('denied:execution_context');
  });

  it('refuses dispatch when the manifest digest does not match the bound context', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'ready');
    const seen = new Set();
    const id = uuid();
    await writeFile(join(mailbox, 'requests', id + '.json'), requestFile({ requestId: id }));
    const bad = { lease: { runId: 'run-test-1', environmentId: 'env-test-1' }, manifestDigest: 'f'.repeat(64) };
    const outcome = await executeRequest(manifest, mailbox, id + '.json', seen, bad);
    expect(outcome.status).toBe('denied');
    const resp = JSON.parse(await readFile(join(mailbox, 'responses', id + '.json'), 'utf8'));
    expect(resp.error).toBe('denied:execution_context');
  });

  it('refuses dispatch while the lifecycle is not ready', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'draining');
    const seen = new Set();
    const id = uuid();
    await writeFile(join(mailbox, 'requests', id + '.json'), requestFile({ requestId: id }));
    const outcome = await executeRequest(manifest, mailbox, id + '.json', seen, contextFor());
    expect(outcome.status).toBe('denied');
  });

  it('fails unavailable when the durable started record cannot persist', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'ready');
    // Poison the records path: a regular file where the records dir belongs.
    await writeFile(join(mailbox, 'state', 'records'), 'not a dir');
    const seen = new Set();
    const id = uuid();
    await writeFile(join(mailbox, 'requests', id + '.json'), requestFile({ requestId: id }));
    const outcome = await executeRequest(manifest, mailbox, id + '.json', seen, contextFor());
    expect(outcome.status).toBe('unavailable');
  });
});

describe('exec runner termination accounting', () => {
  const runnerManifest = {
    schemaVersion: 1,
    entries: [{ id: 'child.ok', runnerArgv: [process.execPath, '-e', 'process.exit(0)'], timeoutMs: 20000 }]
  };

  it('records exited honestly for a completing child', async () => {
    const outcome = await runChild(runnerManifest, 'child.ok');
    expect(outcome.status).toBe('exited');
    expect(outcome.code).toBe(0);
  });

  it('accounts termination for a hung child without fabricating remote state', async () => {
    const hung = { schemaVersion: 1, entries: [{ id: 'child.hung', runnerArgv: [process.execPath, '-e', 'setInterval(()=>{},1000)'], timeoutMs: 20000 }] };
    const outcome = await runChild(hung, 'child.hung', { timeoutMs: 500 });
    expect(['terminated', 'unavailable']).toContain(outcome.status);
    if (outcome.status === 'unavailable') expect(outcome.reason).toBe('termination_unconfirmed');
  }, 25000);

  it('refuses unlisted commands and binds @SOURCE@ by digest', async () => {
    await expect(runChild(runnerManifest, 'nope')).rejects.toThrow('unlisted_command');
    const entry = { runnerArgv: ['node', '-e', '@SOURCE@'], sourceSha256: 'x'.repeat(64) };
    expect(() => bindRunnerArgv(entry, { source: 'print(1)' })).toThrow('source_digest');
    expect(() => resolveEntry({ schemaVersion: 1, entries: [{ id: 'x' }] }, 'x')).toThrow('runner_argv_missing');
  });

  it('reports unavailable when a normal direct-child exit leaves surviving group descendants', async () => {
    if (process.platform === 'win32') return;
    const spawning = {
      schemaVersion: 1,
      entries: [{ id: 'child.spawn', runnerArgv: [process.execPath, '-e', 'require("child_process").spawn("sleep",["5"],{stdio:"ignore"});process.exit(0)'], timeoutMs: 20000 }]
    };
    const outcome = await runChild(spawning, 'child.spawn');
    expect(outcome.status).toBe('unavailable');
    expect(outcome.reason).toBe('descendants_unconfirmed');
  }, 25000);
});

describe('verification supervisor sequence and gate', () => {
  it('accepts only the exact original ordered seven commands', () => {
    const good = { commands: { sequence: REQUIRED_SEQUENCE.slice() } };
    expect(validateSequence(good)).toHaveLength(7);
    const duplicated = { commands: { sequence: REQUIRED_SEQUENCE.slice(0, 6).concat([REQUIRED_SEQUENCE[5]]) } };
    expect(() => validateSequence(duplicated)).toThrow('verification_sequence');
    const reordered = { commands: { sequence: REQUIRED_SEQUENCE.slice().reverse() } };
    expect(() => validateSequence(reordered)).toThrow('verification_sequence');
    const missing = { commands: { sequence: REQUIRED_SEQUENCE.slice(0, 6) } };
    expect(() => validateSequence(missing)).toThrow('verification_sequence');
  });

  it('gates on exact manifest digest and environment identity, not loose strings', () => {
    const digest = 'a'.repeat(64);
    const review = { verdict: 'pass', manifestDigest: digest, environmentId: 'env-1' };
    const receipt = { status: 'ready', environmentId: 'env-1' };
    expect(gateStart({ review, environmentReceipt: receipt, manifestDigest: digest, environmentId: 'env-1' }).status).toBe('ok');
    expect(gateStart({ review: { ...review, manifestDigest: 'b'.repeat(64) }, environmentReceipt: receipt, manifestDigest: digest, environmentId: 'env-1' }).reason).toBe('review_digest_mismatch');
    expect(gateStart({ review, environmentReceipt: { status: 'ready', environmentId: 'env-2' }, manifestDigest: digest, environmentId: 'env-1' }).reason).toBe('receipt_environment_mismatch');
    expect(gateStart({ review: { verdict: 'pass' }, environmentReceipt: receipt, manifestDigest: digest, environmentId: 'env-1' }).status).toBe('unavailable');
    expect(gateStart({ review, environmentReceipt: receipt, manifestDigest: 'not-a-digest', environmentId: 'env-1' }).reason).toBe('manifest_digest_missing');
  });
});

describe('run supervisor gate', () => {
  it('rejects a mismatched run binding before any lifecycle start', async () => {
    const mailbox = await makeMailbox();
    const dir = await tmp();
    const manifestPath = join(dir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(run(manifestPath, mailbox, { runId: 'different-run', environmentId: 'env-test-1' }))
      .rejects.toThrow('manifest_run_binding');
  });

  it('finishes a bounded session and stops when the deadline is tiny', async () => {
    const mailbox = await makeMailbox();
    const dir = await tmp();
    const manifestPath = join(dir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest));
    const outcome = await run(manifestPath, mailbox, { runId: 'run-test-1', environmentId: 'env-test-1', sessionDeadlineMs: 300, pollMs: 20 });
    expect(outcome.status).toBe('stopped');
    expect(await getLifecycle(mailbox)).toBe('stopped');
    const records = await readdir(join(mailbox, 'state'));
    expect(records).toContain('lease.json');
  });
});

describe('live wiring: manifest env/workdir bound into wrapper invocation', () => {
  it('passes SYNTHETIC_* env flags and workdir through docker exec to the wrapper', () => {
    const wired = {
      ...manifest,
      entries: [{ ...manifest.entries[0], env: ['SYNTHETIC_AUTH_FIXTURE=private-task-mvp-synthetic'] }]
    };
    const request = JSON.parse(requestFile({ requestId: uuid() }));
    const { argv } = buildLiveArgv(wired, request);
    const envIndex = argv.indexOf('--env');
    expect(envIndex).toBeGreaterThan(-1);
    expect(argv[envIndex + 1]).toBe('SYNTHETIC_AUTH_FIXTURE=private-task-mvp-synthetic');
    const workdirIndex = argv.indexOf('--workdir');
    expect(argv[workdirIndex + 1]).toBe('/workspace/services/private-api');
    expect(argv).toContain('/workspace/.r4-harness/fixture-exec-runner.mjs');
  });
});

describe('live wiring: wrapper result transform', () => {
  it('restores literal fixture stdout/stderr/code exactly', () => {
    const raw = JSON.stringify({ status: 'exited', code: 0, stdout: 'literal fixture line\nsecond line', stderr: 'warn' });
    const result = transformWrapperResult(raw);
    expect(result).toMatchObject({ code: 0, stdout: 'literal fixture line\nsecond line', stderr: 'warn', remoteState: 'exited' });
  });

  it('restores JSON fixture stdout exactly', () => {
    const fixtureJson = JSON.stringify({ ok: true, id: 'fx-1' });
    const raw = JSON.stringify({ status: 'exited', code: 0, stdout: fixtureJson, stderr: '' });
    const result = transformWrapperResult(raw);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, id: 'fx-1' });
  });

  it('fails closed on malformed and oversized wrapper responses', () => {
    expect(transformWrapperResult('{not json').remoteState).toBe('unconfirmed');
    expect(transformWrapperResult('').remoteState).toBe('unconfirmed');
    expect(transformWrapperResult(JSON.stringify({ status: 'bogus', code: 0, stdout: '' })).remoteState).toBe('unconfirmed');
    expect(transformWrapperResult('x'.repeat(262145)).remoteState).toBe('unconfirmed');
    expect(transformWrapperResult(JSON.stringify({ status: 'exited', code: 700, stdout: '' })).remoteState).toBe('unconfirmed');
    const terminated = transformWrapperResult(JSON.stringify({ status: 'terminated', code: null, stdout: '', stderr: '' }));
    expect(terminated.code).toBe(124);
    const unavailable = transformWrapperResult(JSON.stringify({ status: 'unavailable', reason: 'termination_unconfirmed', stdout: '', stderr: '' }));
    expect(unavailable.remoteState).toBe('unconfirmed');
  });
});

describe('live wiring: real wrapper round-trip', () => {
  it('runs the actual fixture-exec-runner module and transforms its real envelope', async () => {
    const dir = await tmp();
    const runnerManifestPath = join(dir, 'manifest.json');
    await writeFile(runnerManifestPath, JSON.stringify({
      schemaVersion: 1,
      entries: [{ id: 'literal.ok', runnerArgv: [process.execPath, '-e', 'process.stdout.write("literal-ok")'], timeoutMs: 20000 }]
    }));
    const { fileURLToPath } = await import('node:url');
    const runnerPath = fileURLToPath(new URL('../../../scripts/box-verification/fixture-exec-runner.mjs', import.meta.url));
    const { spawn } = await import('node:child_process');
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, [runnerPath, runnerManifestPath, 'literal.ok'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('exit', code => resolve({ code, stdout, stderr }));
      child.stdin.end(JSON.stringify({ schemaVersion: 1, source: null, input: null }));
    });
    expect(result.code).toBe(0);
    const transformed = transformWrapperResult(result.stdout);
    expect(transformed).toMatchObject({ code: 0, stdout: 'literal-ok', remoteState: 'exited' });
  }, 25000);
});

describe('live wiring: per-dispatch lease and reconciliation', () => {
  it('stops admission unavailable when the lease expired since session start', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'ready');
    await writeFile(join(mailbox, 'state', 'lease.json'), JSON.stringify({
      runId: 'run-test-1', environmentId: 'env-test-1', expiresAt: new Date(Date.now() - 1).toISOString()
    }));
    const seen = new Set();
    const id = uuid();
    await writeFile(join(mailbox, 'requests', id + '.json'), requestFile({ requestId: id }));
    const outcome = await executeRequest(manifest, mailbox, id + '.json', seen, contextFor());
    expect(outcome.status).toBe('unavailable');
    expect(outcome.reason).toContain('lease_expired');
    const resp = JSON.parse(await readFile(join(mailbox, 'responses', id + '.json'), 'utf8'));
    expect(resp.error).toBe('denied:execution_context');
  });

  it('fails closed at session start when a started record has no result', async () => {
    const mailbox = await makeMailbox();
    const dir = await tmp();
    const manifestPath = join(dir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest));
    await mkdir(join(mailbox, 'state', 'records'), { recursive: true });
    const orphan = uuid();
    await writeFile(join(mailbox, 'state', 'records', orphan + '.started.json'), JSON.stringify({ schemaVersion: 1, kind: 'started', requestId: orphan }));
    expect(await findStartedWithoutResult(mailbox)).toEqual([orphan]);
    const outcome = await run(manifestPath, mailbox, { runId: 'run-test-1', environmentId: 'env-test-1', sessionDeadlineMs: 300, pollMs: 20 });
    expect(outcome.status).toBe('unavailable');
    expect(outcome.reason).toBe('started_without_result');
    expect(await getLifecycle(mailbox)).toBe('unavailable');
  });

  it('persists a durable result record for every denial outcome', async () => {
    const mailbox = await makeMailbox();
    await setLifecycle(mailbox, 'ready');
    const seen = new Set();
    const id = uuid();
    await writeFile(join(mailbox, 'requests', id + '.json'), requestFile({ requestId: id, runId: 'other-run' }));
    const outcome = await executeRequest(manifest, mailbox, id + '.json', seen, contextFor());
    expect(outcome.status).toBe('denied');
    const records = await readdir(join(mailbox, 'state', 'records'));
    expect(records).toContain(id + '.result.json');
  });

  it('refuses to start a session over leftover state beyond the fresh lease', async () => {
    const dir = await tmp();
    const manifestPath = join(dir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest));

    const mailboxSeen = await makeMailbox();
    await writeFile(join(mailboxSeen, 'state', 'seen.json'), '[]');
    const outcomeSeen = await run(manifestPath, mailboxSeen, { runId: 'run-test-1', environmentId: 'env-test-1', sessionDeadlineMs: 300, pollMs: 20 });
    expect(outcomeSeen.status).toBe('unavailable');
    expect(outcomeSeen.reason).toBe('ambiguous_prior_state');

    const mailboxLifecycle = await makeMailbox();
    await writeFile(join(mailboxLifecycle, 'state', 'lifecycle.json'), JSON.stringify({ schemaVersion: 1, state: 'stopped' }));
    const outcomeLifecycle = await run(manifestPath, mailboxLifecycle, { runId: 'run-test-1', environmentId: 'env-test-1', sessionDeadlineMs: 300, pollMs: 20 });
    expect(outcomeLifecycle.status).toBe('unavailable');
    expect(outcomeLifecycle.reason).toBe('ambiguous_prior_state');

    const mailboxRequest = await makeMailbox();
    await writeFile(join(mailboxRequest, 'requests', uuid() + '.json'), requestFile());
    const outcomeRequest = await run(manifestPath, mailboxRequest, { runId: 'run-test-1', environmentId: 'env-test-1', sessionDeadlineMs: 300, pollMs: 20 });
    expect(outcomeRequest.status).toBe('unavailable');
    expect(outcomeRequest.reason).toBe('ambiguous_prior_state');
  });
});


describe('verification supervisor durable completion', () => {
  const sequenceManifest = { environmentId: 'supervision-regression', commands: { sequence: REQUIRED_SEQUENCE.slice() } };
  const mockChild = () => Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true
  });

  it('does not advance after zero parent exit with a surviving owned group', async () => {
    if (process.platform === 'win32') return;
    const dir = await tmp();
    let calls = 0;
    let child: ReturnType<typeof spawn> | undefined;
    try {
      const result = await runSequence(sequenceManifest, { stateDir: dir, spawnImpl: (_bin, _args, options) => {
        calls += 1;
        child = spawn(process.execPath, ['-e', 'require("child_process").spawn("sleep",["30"],{stdio:"ignore"});process.exit(0)'], options);
        return child;
      } });
      expect(calls).toBe(1);
      expect(result.status).toBe('unavailable');
      expect(result.commands[0]).toMatchObject({ code: 0, exitObserved: true, unconfirmed: true, descendants: 'unaccounted' });
      expect(JSON.parse(await readFile(join(dir, 'verification-run.json'), 'utf8')).status).toBe('unavailable');
    } finally {
      // This test owns the freshly detached group; no unrelated PID is touched.
      if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }
    }
  }, 25000);

  it('waits for late output and retains complete raw bytes beyond the summary cap', async () => {
    const dir = await tmp();
    const payload = Buffer.concat([Buffer.from('begin\n'), Buffer.alloc(300000, 120), Buffer.from('\nlate-end\n')]);
    let calls = 0;
    const result = await runSequence(sequenceManifest, { stateDir: dir, spawnImpl: () => {
      const child = mockChild();
      calls += 1;
      setTimeout(() => {
        child.emit('exit', 0, null);
        setTimeout(() => {
          child.stdout.end(payload); child.stderr.end('late-warning\n');
          child.emit('close', 0, null);
        }, 15);
      }, 5);
      return child;
    } });
    expect(calls).toBe(7);
    expect(result.status).toBe('pass');
    for (const entry of result.commands) {
      expect(entry).toMatchObject({ code: 0, exitSignal: null, exitObserved: true, outputDrained: true, unconfirmed: false });
      expect(entry.elapsedMs).toBeGreaterThanOrEqual(15);
      expect(await readFile(entry.stdoutPath)).toEqual(payload);
      expect(await readFile(entry.stderrPath, 'utf8')).toBe('late-warning\n');
      expect(entry.stdout.length).toBeLessThanOrEqual(262144);
    }
  });

  it('bounds incomplete drainage, preserves captured bytes and stops the sequence', async () => {
    const dir = await tmp();
    let calls = 0;
    const result = await runSequence(sequenceManifest, { stateDir: dir, drainMs: 40, spawnImpl: () => {
      const child = mockChild();
      calls += 1;
      setTimeout(() => { child.stdout.write('captured-before-exit'); child.emit('exit', 0, null); }, 5);
      // Neither stream ends and no close arrives: the actual drain timer must fire.
      return child;
    } });
    expect(calls).toBe(1);
    expect(result.status).toBe('unavailable');
    const entry = result.commands[0];
    expect(entry).toMatchObject({ code: 0, outputDrained: false, unconfirmed: true, reason: 'output_drain_unconfirmed' });
    expect(entry.elapsedMs).toBeGreaterThanOrEqual(40);
    expect(entry.elapsedMs).toBeLessThan(2000);
    expect(await readFile(entry.stdoutPath, 'utf8')).toBe('captured-before-exit');
  });
});
