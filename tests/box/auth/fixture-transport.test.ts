import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const clientPath = '../../../scripts/box-verification/fixture-exec-client.mjs';
const hostPath = '../../../scripts/box-verification/fixture-exec-host.mjs';
const runtimePath = '../../../scripts/synthetic-runtime.mjs';
const dockerPath = '../../../scripts/docker.mjs';
type Entry = { id: string; service: string; workdir: string; env?: string[]; argv: string[]; sourceSha256?: string; input: string; timeoutMs?: number };
type Manifest = { schemaVersion: number; containers: Record<string, string>; entries: Entry[] };
let matchEntry: (manifest: Manifest, args: string[]) => Entry;
let execViaMailbox: (args: string[], options: { input?: string; timeout?: number; mailbox: string }) => Promise<{ code: number; stdout: string; stderr: string }>;
let validateRequest: (raw: string) => { schemaVersion: number; requestId: string; commandId: string; source: string | null; input: string | null };
let buildExecArgv: (manifest: Manifest, request: { commandId: string; source?: string | null }) => { argv: string[]; entry: Entry };
let assertSafeEntry: (entry: unknown) => void;
let executeRequest: (manifest: Manifest, mailbox: string, fileName: string, seen: Set<string>) => Promise<void>;
let composeArguments: string[];

const source = 'console.log("synthetic-source");';
const sourceHash = createHash('sha256').update(source).digest('hex');
const manifest: Manifest = {
  schemaVersion: 1,
  containers: { 'private-api': 'w002-b11-svc-private-api', 'external-api': 'w002-b11-svc-external-api' },
  entries: [
    { id: 'auth-fixture.private-api', service: 'private-api', workdir: '/workspace/services/private-api', env: ['SYNTHETIC_AUTH_FIXTURE=private-task-mvp-synthetic'], argv: ['node', 'dist/fixture.js'], input: 'json' },
    { id: 'probe.private-api', service: 'private-api', workdir: '/workspace/services/private-api', env: [], argv: ['node', '--input-type=module', '-e', '@SOURCE@'], sourceSha256: sourceHash, input: 'none' }
  ]
};
const argv = (entry: 'fixture' | 'probe', extraEnv: string[] = []) => {
  if (entry === 'fixture') return [...composeArguments, 'exec', '-T', '--env', 'SYNTHETIC_AUTH_FIXTURE=private-task-mvp-synthetic', ...extraEnv.flatMap(v => ['--env', v]), '--workdir', '/workspace/services/private-api', 'private-api', 'node', 'dist/fixture.js'];
  return [...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/private-api', 'private-api', 'node', '--input-type=module', '-e', source];
};
let mailbox: string;
beforeAll(async () => {
  const client = await import(clientPath);
  const host = await import(hostPath);
  const runtime = await import(runtimePath);
  matchEntry = client.matchEntry;
  execViaMailbox = client.execViaMailbox;
  validateRequest = host.validateRequest;
  buildExecArgv = host.buildExecArgv;
  assertSafeEntry = host.assertSafeEntry;
  executeRequest = host.executeRequest;
  composeArguments = runtime.composeArguments;
  mailbox = await mkdtemp(join(tmpdir(), 'w002-mailbox-'));
  for (const dir of ['requests', 'responses', 'state']) await mkdir(join(mailbox, dir));
  await writeFile(join(mailbox, 'fixture-command-manifest.json'), JSON.stringify(manifest));
});
afterAll(async () => { await rm(mailbox, { recursive: true, force: true }); });

describe('fixture transport allowlist', () => {
  it('maps an exact allowed fixture command and rejects unlisted argv, env, service and container escapes', () => {
    const entry = matchEntry(manifest, argv('fixture'));
    expect(entry.id).toBe('auth-fixture.private-api');
    expect(() => matchEntry(manifest, [...argv('fixture').slice(0, -1), 'dist/other.js'])).toThrow(/unlisted_command/);
    expect(() => matchEntry(manifest, argv('fixture', ['EXTRA_ENV=yes']))).toThrow(/unlisted_command/);
    expect(() => matchEntry(manifest, [...composeArguments, 'exec', '-T', '--env', 'SYNTHETIC_AUTH_FIXTURE=private-task-mvp-synthetic', '--workdir', '/workspace/services/private-api', 'external-api', 'node', 'dist/fixture.js'])).toThrow(/unlisted_command/);
    expect(() => matchEntry(manifest, [...composeArguments, 'exec', '-T', '--workdir', '/etc', 'private-api', 'node', 'dist/fixture.js'])).toThrow(/denied/);
    expect(() => matchEntry(manifest, [...composeArguments, 'run', '-T', 'private-api', 'node', 'dist/fixture.js'])).toThrow(/operation/);
    expect(() => matchEntry(manifest, ['version'])).toThrow(/argv_shape|compose_prefix/);
  });
  it('binds -e sources to their exact sha256 digest', () => {
    const entry = matchEntry(manifest, argv('probe'));
    expect(entry.id).toBe('probe.private-api');
    const forged = [...argv('probe')];
    forged[forged.length - 1] = 'console.log("forged");';
    expect(() => matchEntry(manifest, forged)).toThrow(/unlisted_command/);
  });
  it('host-side argv contains only manifest-derived docker exec fields', () => {
    const request = { schemaVersion: 1, requestId: '11111111-1111-4111-8111-111111111111', commandId: 'auth-fixture.private-api', source: null, input: '{}' };
    const { argv: exec } = buildExecArgv(manifest, request);
    expect(exec.slice(0, 3)).toEqual(['--context', expect.any(String), 'exec']);
    expect(exec).toContain('w002-b11-svc-private-api');
    expect(exec).not.toContain('-v');
    expect(exec).not.toContain('--privileged');
    expect(() => buildExecArgv(manifest, { ...request, commandId: 'nonexistent' })).toThrow(/unlisted_command/);
    expect(() => buildExecArgv({ ...manifest, containers: { 'private-api': 'host-container', 'external-api': 'w002-b11-svc-external-api' } }, request)).toThrow(/container_map/);
    const sourceRequest = { schemaVersion: 1, requestId: '22222222-2222-4222-8222-222222222222', commandId: 'probe.private-api', source, input: null };
    expect(buildExecArgv(manifest, sourceRequest).argv).toContain(source);
    expect(() => buildExecArgv(manifest, { ...sourceRequest, source: 'forged' })).toThrow(/source_digest/);
    expect(() => buildExecArgv(manifest, { ...request, source: 'unexpected' })).toThrow(/source_unexpected/);
  });
  it('rejects malformed, oversized and non-v4 request envelopes', () => {
    expect(() => validateRequest('')).toThrow(/request_size/);
    expect(() => validateRequest('x'.repeat(20000))).toThrow(/request_size/);
    expect(() => validateRequest('not json')).toThrow(/request_malformed/);
    expect(() => validateRequest(JSON.stringify({ schemaVersion: 2, requestId: '11111111-1111-4111-8111-111111111111', commandId: 'a', input: null }))).toThrow(/request_schema/);
    expect(() => validateRequest(JSON.stringify({ schemaVersion: 1, requestId: 'not-a-uuid', commandId: 'a', input: null }))).toThrow(/request_id/);
    expect(() => validateRequest(JSON.stringify({ schemaVersion: 1, requestId: '11111111-1111-4111-8111-111111111111', commandId: '../escape', input: null }))).toThrow(/command_id/);
    expect(() => validateRequest(JSON.stringify({ schemaVersion: 1, requestId: '11111111-1111-4111-8111-111111111111', commandId: 'a', input: 42 }))).toThrow(/input_type/);
    expect(() => validateRequest(JSON.stringify({ schemaVersion: 1, requestId: '11111111-1111-4111-8111-111111111111', commandId: 'a', input: null, source: 42 }))).toThrow(/source_type/);
    expect(validateRequest(JSON.stringify({ schemaVersion: 1, requestId: '11111111-1111-4111-8111-111111111111', commandId: 'a', input: 'x'.repeat(15000), source: null })).input).toHaveLength(15000);
    expect(validateRequest(JSON.stringify({ schemaVersion: 1, requestId: '11111111-1111-4111-8111-111111111111', commandId: 'ok', input: 'x' })).commandId).toBe('ok');
    expect(() => assertSafeEntry({ id: 'x', service: 'db', workdir: '/workspace/services/db', argv: ['node'], input: 'json' })).toThrow(/entry_service/);
    expect(() => assertSafeEntry({ id: 'x', service: 'private-api', workdir: '/workspace/services/private-api', argv: ['sh', '-c', 'x'], input: 'json' })).toThrow(/entry_argv/);
  });
  it('denies replayed request ids at the relay and records unavailable transport honestly', async () => {
    const request = { schemaVersion: 1, requestId: '33333333-3333-4333-8333-333333333333', commandId: 'nonexistent', source: null, input: null };
    const seen = new Set<string>();
    await writeFile(join(mailbox, 'requests', request.requestId + '.json'), JSON.stringify(request));
    await executeRequest(manifest, mailbox, request.requestId + '.json', seen);
    const denied = JSON.parse(await readFile(join(mailbox, 'responses', request.requestId + '.json'), 'utf8'));
    expect(denied.error).toMatch(/denied:unlisted_command/);
    const replayed = { schemaVersion: 1, requestId: '44444444-4444-4444-8444-444444444444', commandId: 'auth-fixture.private-api', source: null, input: '{}' };
    const replaySeen = new Set([replayed.requestId]);
    await writeFile(join(mailbox, 'requests', replayed.requestId + '.json'), JSON.stringify(replayed));
    await executeRequest(manifest, mailbox, replayed.requestId + '.json', replaySeen);
    const replayResponse = JSON.parse(await readFile(join(mailbox, 'responses', replayed.requestId + '.json'), 'utf8'));
    expect(replayResponse.error).toBe('denied:replay');
  });
  it('exchanges a bounded request/response through the mailbox and enforces timeout', async () => {
    const responderSource = "import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'; import { join } from 'node:path'; const dir = " + JSON.stringify(mailbox) + "; mkdirSync(join(dir, 'responses'), { recursive: true }); setInterval(() => { for (const name of readdirSync(join(dir, 'requests'))) { if (!name.endsWith('.json')) continue; const request = JSON.parse(readFileSync(join(dir, 'requests', name), 'utf8')); writeFileSync(join(dir, 'responses', request.requestId + '.json'), JSON.stringify({ schemaVersion: 1, requestId: request.requestId, code: 0, stdout: JSON.stringify({ echoed: request.input }), stderr: '' })); } }, 20); setTimeout(() => process.exit(0), 8000);";
    const responder = execFile(process.execPath, ['--input-type=module', '-e', responderSource], () => {});
    const result = await execViaMailbox(argv('fixture'), { input: JSON.stringify({ action: 'seed' }), timeout: 5000, mailbox });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).echoed).toBe(JSON.stringify({ action: 'seed' }));
    await expect(execViaMailbox(argv('fixture'), { input: 'x'.repeat(70000), timeout: 500, mailbox })).rejects.toThrow(/request_size/);
    await expect(execViaMailbox(argv('probe'), { input: 'unexpected-stdin', timeout: 500, mailbox })).rejects.toThrow(/stdin/);
    await expect(execViaMailbox(argv('fixture'), { input: '{}', timeout: 300, mailbox: join(mailbox, 'empty') })).rejects.toThrow();
    responder.kill();
  });
  it('fails closed on unknown or unconfigured transport mode', async () => {
    const { docker } = await import(dockerPath);
    process.env.BOX_VERIFICATION_TRANSPORT = 'bogus';
    await expect(docker(['version'])).rejects.toThrow(/Unknown verification transport/);
    process.env.BOX_VERIFICATION_TRANSPORT = 'mailbox';
    delete process.env.BOX_VERIFICATION_MAILBOX;
    await expect(docker(['version'])).rejects.toThrow(/Unconfigured verification mailbox/);
    process.env.BOX_VERIFICATION_MAILBOX = '../../outside';
    await expect(docker(['version'])).rejects.toThrow(/Unconfigured verification mailbox/);
    process.env.BOX_VERIFICATION_MAILBOX = mailbox;
    await expect(docker(['version'])).rejects.toThrow(/denied|shape|prefix/);
    delete process.env.BOX_VERIFICATION_TRANSPORT;
    delete process.env.BOX_VERIFICATION_MAILBOX;
  });
});
