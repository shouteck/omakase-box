// W002/B1.1 r4 environment readiness harness tests (synthetic, non-destructive).
// Exercises honest pass/fail/unavailable states of the readiness probes without
// touching real containers, browsers, services or databases.
import { mkdtemp, mkdir, writeFile, chmod, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
interface ReadinessPage { goto(url: string): Promise<unknown>; content(): Promise<string>; }
interface ReadinessContext { newPage(): Promise<ReadinessPage>; close(): Promise<unknown>; }
interface ReadinessBrowser { newContext(): Promise<ReadinessContext>; close(): Promise<unknown>; }
interface ChromiumLauncher { launch(options?: { executablePath?: string; headless?: boolean }): Promise<ReadinessBrowser>; }
interface HealthProbeResult { status: string; url?: string; consecutive: number; probes: unknown[] }
interface BrowserProbeResult { status: string; reason?: string; revision?: number }
interface BrowserExecutable { executablePath: string; revision: number }
interface EntrypointCheckResult { status: string; missing?: string[] }
interface MetadataMismatch { rel: string; missing?: boolean; digest?: string; expected?: string }
interface MetadataCheckResult { status: string; compared?: number; mismatches?: MetadataMismatch[] }
interface NamedCheckResult { status: string; reason?: string }
interface DependencyPlan { hostRoot: string; containerRoot: string; mountTarget?: string; seeds: string[]; seedPaths?: Array<{ name: string; rel: string }>; packageVersions: ReadonlyArray<readonly string[]>; packageCount: number; fileCount: number; closureSha256: string }
interface DependencyClosureResult { status: string; reason?: string; packageCount?: number; fileCount?: number; closureSha256?: string }
interface WorkspaceAliasResult { status: string; count: number; closureSha256?: string }
interface ReadinessModule {
  probeServiceHealth(url: string, options?: { windowMs?: number; maxProbes?: number; requestTimeoutMs?: number; successes?: number; gapMs?: number; fetchImpl?: (url: string, init?: { signal: AbortSignal }) => Promise<{ status: number }>; sleep?: (ms: number) => Promise<void> }): Promise<HealthProbeResult>;
  probeBrowser(options?: { browserPath?: string; expectedRevision?: number; deadlineMs?: number; loadChromium?: () => ChromiumLauncher | Promise<ChromiumLauncher>; pageUrl?: string }): Promise<BrowserProbeResult>;
  findBrowserExecutable(browserPath: string, expectedRevision?: number): Promise<BrowserExecutable | null>;
  checkFixtureEntrypoints(root: string, required?: Record<string, string[]>): Promise<EntrypointCheckResult>;
  checkStagedMetadata(stageRoot: string, expected?: Record<string, string>): Promise<MetadataCheckResult>;
  checkResourceRecord(recordPath: string, manifest: unknown): Promise<NamedCheckResult>;
  compareSourceStage(pairs: Array<{ source: string; staged: string }>): Promise<NamedCheckResult>;
  checkDbReadiness(connect: () => Promise<{ query(sql: string): Promise<{ rows: unknown[] }>; release?(): Promise<unknown>; end?(): Promise<unknown> }>, options?: { attempts?: number }): Promise<NamedCheckResult>;
  checkRelayRunContract(mailbox: string, options: { runId: string; environmentId: string; leaseTtlMs?: number }): Promise<NamedCheckResult>;
  ENV_EXAMPLE_EXPECTED_SHA256: string;
}
interface EnvironmentHostModule {
  verifyDependencyClosure(plan: DependencyPlan, options?: { root: string; readFileImpl?: (path: string) => Promise<Uint8Array> }): Promise<DependencyClosureResult>;
  stageFiles(options: { sourceRoot: string; stageRoot: string; files: Array<{ rel: string; sha256: string }> }): Promise<unknown>;
  runnerCreateArgv(manifest: unknown, options: { databaseUrl: string; runId: string }): string[];
  stageWorkspaceAliases(manifest: unknown, options?: { stageRoot?: string }): Promise<WorkspaceAliasResult>;
}
const readiness: ReadinessModule = await import(new URL('../../../scripts/box-verification/readiness.mjs', import.meta.url).href);
const environmentHost: EnvironmentHostModule = await import(new URL('../../../scripts/box-verification/environment-host.mjs', import.meta.url).href);
const {
  probeServiceHealth,
  probeBrowser,
  findBrowserExecutable,
  checkFixtureEntrypoints,
  checkStagedMetadata,
  checkResourceRecord,
  compareSourceStage,
  checkDbReadiness,
  checkRelayRunContract,
  ENV_EXAMPLE_EXPECTED_SHA256
} = readiness;
const { verifyDependencyClosure, stageFiles, runnerCreateArgv, stageWorkspaceAliases } = environmentHost;

const tmp = () => mkdtemp(join(tmpdir(), 'w002-b11-r4-readiness-'));
const noSleep = () => Promise.resolve();

async function fakeBrowserRoot(revision = 1243) {
  const root = await tmp();
  const dir = join(root, `chromium-${revision}`, 'chrome-linux');
  await mkdir(dir, { recursive: true });
  const exe = join(dir, 'chrome');
  await writeFile(exe, '#!/bin/fake\n');
  await chmod(exe, 0o755);
  return { root, exe };
}

const fakeChromium = () => ({
  launch: async () => ({
    newContext: async () => ({
      newPage: async () => ({
        goto: async () => undefined,
        content: async () => '<html><body>local</body></html>'
      }),
      close: async () => undefined
    }),
    close: async () => undefined
  })
});

describe('readiness: service health probes', () => {
  it('passes after two consecutive successes at least 5s apart', async () => {
    let clock = 0;
    const fetchImpl = async () => ({ status: 200 });
    const orig = Date.now;
    Date.now = () => (clock += 5000);
    try {
      const result = await probeServiceHealth('http://127.0.0.1:4000/healthz', { fetchImpl, sleep: noSleep });
      expect(result.status).toBe('pass');
      expect(result.consecutive).toBe(2);
    } finally { Date.now = orig; }
  });

  it('fails honestly when the service never responds', async () => {
    const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
    const result = await probeServiceHealth('http://127.0.0.1:4999/healthz', {
      windowMs: 30000, maxProbes: 4, fetchImpl, sleep: noSleep
    });
    expect(['failed', 'unavailable']).toContain(result.status);
    expect(result.consecutive).toBe(0);
    expect(result.probes.length).toBeLessThanOrEqual(24);
  });

  it('reports unavailable when the window expires before two consecutive successes', async () => {
    const fetchImpl = async () => ({ status: 503 });
    const result = await probeServiceHealth('http://127.0.0.1:4000/healthz', {
      windowMs: 0, maxProbes: 24, fetchImpl, sleep: noSleep
    });
    expect(result.status).toBe('unavailable');
  });
});

describe('readiness: browser', () => {
  it('reports unavailable when the browser path is missing', async () => {
    const result = await probeBrowser({ browserPath: join(await tmp(), 'no-such-dir'), loadChromium: fakeChromium });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('browser_path_missing');
  });

  it('fails when no executable for the pinned revision exists', async () => {
    const { root } = await fakeBrowserRoot(9999);
    const found = await findBrowserExecutable(root, 1243);
    expect(found).toBeNull();
    const result = await probeBrowser({ browserPath: root, expectedRevision: 1243, loadChromium: fakeChromium });
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('browser_executable_missing');
  });

  it('fails on launch error and passes on a real-shape browser round-trip with clean close', async () => {
    const { root, exe } = await fakeBrowserRoot(1243);
    const bad = await probeBrowser({ browserPath: root, loadChromium: async () => ({ launch: async () => { throw new Error('missing lib'); } }) });
    expect(bad.status).toBe('failed');

    let closed = false; let gotoUrl = null;
    const fakeBrowser = {
      newContext: async () => ({
        newPage: async () => ({ goto: async (url: string) => { gotoUrl = url; }, content: async () => '<html>local</html>' }),
        close: async () => undefined
      }),
      close: async () => { closed = true; }
    };
    const loadChromium = async () => ({
      launch: async (opts: { executablePath?: string; headless?: boolean }) => {
        expect(opts.executablePath).toBe(exe);
        return fakeBrowser;
      }
    });
    const good = await probeBrowser({ browserPath: root, loadChromium });
    expect(good.status).toBe('pass');
    expect(good.revision).toBe(1243);
    expect(gotoUrl).toContain('data:');
    expect(closed).toBe(true);
  });

  it('reports unavailable rather than pass when the deadline is already exhausted', async () => {
    const { root } = await fakeBrowserRoot(1243);
    const result = await probeBrowser({ browserPath: root, deadlineMs: 0, loadChromium: fakeChromium });
    expect(['failed', 'unavailable']).toContain(result.status);
    expect(result.status).not.toBe('pass');
  });

  it('recognizes the revision-1243 headless-shell and chrome-linux64 installed layouts', async () => {
    const shellRoot = await tmp();
    const shellDir = join(shellRoot, 'chromium_headless_shell-1243', 'chrome-headless-shell-linux64');
    await mkdir(shellDir, { recursive: true });
    const shellExe = join(shellDir, 'chrome-headless-shell');
    await writeFile(shellExe, '#!/bin/fake\n');
    await chmod(shellExe, 0o755);
    const foundShell = await findBrowserExecutable(shellRoot, 1243);
    expect(foundShell).not.toBeNull();
    expect(foundShell?.executablePath).toBe(shellExe);

    const fullRoot = await tmp();
    const fullDir = join(fullRoot, 'chromium-1243', 'chrome-linux64');
    await mkdir(fullDir, { recursive: true });
    const fullExe = join(fullDir, 'chrome');
    await writeFile(fullExe, '#!/bin/fake\n');
    await chmod(fullExe, 0o755);
    const foundFull = await findBrowserExecutable(fullRoot, 1243);
    expect(foundFull).not.toBeNull();
    expect(foundFull?.executablePath).toBe(fullExe);

    const good = await probeBrowser({ browserPath: shellRoot, loadChromium: async () => ({ launch: async () => ({
      newContext: async () => ({ newPage: async () => ({ goto: async () => undefined, content: async () => '<html>ok</html>' }), close: async () => undefined }),
      close: async () => undefined }) }) });
    expect(good.status).toBe('pass');
  });
});

describe('readiness: fixture entrypoints (service-specific)', () => {
  it('fails when static fixture entrypoints are missing, service-specifically', async () => {
    const root = await tmp();
    const result = await checkFixtureEntrypoints(root);
    expect(result.status).toBe('failed');
    // private: 3 entrypoints, external: 1 -> not the old indiscriminate 6.
    expect(result.missing?.length).toBe(4);
    expect(result.missing).toContain('external-api/dist/fixture.js');
    expect(result.missing).toContain('private-api/dist/session-fixture.js');
  });

  it('passes with private-only intake/session fixtures and external fixture only', async () => {
    const root = await tmp();
    const priv = join(root, 'services', 'private-api', 'dist');
    const ext = join(root, 'services', 'external-api', 'dist');
    await mkdir(priv, { recursive: true });
    await mkdir(ext, { recursive: true });
    for (const f of ['fixture.js', 'intake-fixture.js', 'session-fixture.js']) await writeFile(join(priv, f), '// f\n');
    await writeFile(join(ext, 'fixture.js'), '// f\n');
    const result = await checkFixtureEntrypoints(root);
    expect(result.status).toBe('pass');
  });
});

describe('readiness: staged metadata and resource identity', () => {
  it('verifies hash-bound metadata including public .env.example digest', async () => {
    const root = await tmp();
    await mkdir(join(root, 'infra'), { recursive: true });
    await mkdir(join(root, 'research', 'fixtures'), { recursive: true });
    const compose = 'version: synthetic\n'; const dockerfile = 'FROM scratch\n'; const cand = '[]\n'; const env = 'PUBLIC=true\n';
    await writeFile(join(root, 'infra', 'compose.yaml'), compose);
    await writeFile(join(root, 'infra', 'trusted.Dockerfile'), dockerfile);
    await writeFile(join(root, 'research', 'fixtures', 'candidates.json'), cand);
    await writeFile(join(root, '.env.example'), env);
    const digests = {
      'infra/compose.yaml': createHash('sha256').update(compose).digest('hex'),
      'infra/trusted.Dockerfile': createHash('sha256').update(dockerfile).digest('hex'),
      'research/fixtures/candidates.json': createHash('sha256').update(cand).digest('hex'),
      '.env.example': createHash('sha256').update(env).digest('hex')
    };
    const pass = await checkStagedMetadata(root, digests);
    expect(pass.status).toBe('pass');

    const drifted = await checkStagedMetadata(root, { ...digests, 'infra/compose.yaml': 'f'.repeat(64) });
    expect(drifted.status).toBe('failed');

    const missing = await checkStagedMetadata(root, {});
    expect(missing.status).toBe('failed');
    // With no expected digests supplied the bound default digest still compares:
    // the synthetic .env.example fails as a digest mismatch, and absent files
    // fail as missing entries.
    expect(missing.mismatches?.some(item => item.rel === '.env.example')).toBe(true);
    // Absent required metadata always fails as missing.
    const absent = await checkStagedMetadata(join(root, 'empty'), digests);
    expect(absent.status).toBe('failed');
    expect(absent.mismatches?.every(item => item.missing)).toBe(true);
    expect(ENV_EXAMPLE_EXPECTED_SHA256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds recorded resource identities to exact manifest image ids', async () => {
    const root = await tmp();
    const recordPath = join(root, 'environment-creation.json');
    const manifest = { containers: {
      'w002-b11-linux-r4-env2': { image: { id: 'sha256:eb4a84ec' } },
      'w002-b11-box-db-r4-env2': { image: { id: 'sha256:639ab7ce' } }
    } };
    await writeFile(recordPath, JSON.stringify({ created: [
      { name: 'w002-b11-linux-r4-env2', status: 'running', inspect: 'cid sha256:eb4a84ec' },
      { name: 'w002-b11-box-db-r4-env2', status: 'running', inspect: 'cid sha256:639ab7ce' }
    ] }));
    const pass = await checkResourceRecord(recordPath, manifest);
    expect(pass.status).toBe('pass');
    await writeFile(recordPath, JSON.stringify({ created: [
      { name: 'w002-b11-linux-r4-env2', status: 'running', inspect: 'cid sha256:other' },
      { name: 'w002-b11-box-db-r4-env2', status: 'running', inspect: 'cid sha256:639ab7ce' }
    ] }));
    const drift = await checkResourceRecord(recordPath, manifest);
    expect(drift.status).toBe('failed');
    const absent = await checkResourceRecord(join(root, 'absent.json'), manifest);
    expect(absent.status).toBe('unavailable');
  });
});

describe('readiness: database, drift and relay run contract', () => {
  it('bounds DB readiness to at most two attempts and reports unavailable', async () => {
    let calls = 0;
    const connect = async () => { calls += 1; throw new Error('connection refused'); };
    const result = await checkDbReadiness(connect);
    expect(result.status).toBe('unavailable');
    expect(calls).toBe(2);
  });

  it('passes DB readiness on a synthetic successful connect', async () => {
    const connect = async () => ({ query: async () => ({ rows: [] }), release: async () => undefined });
    const result = await checkDbReadiness(connect);
    expect(result.status).toBe('pass');
  });

  it('detects source/stage drift', async () => {
    const root = await tmp();
    const a = join(root, 'a.ts'); const b = join(root, 'b.ts'); const c = join(root, 'c.ts');
    await writeFile(a, 'same'); await writeFile(b, 'same'); await writeFile(c, 'different');
    expect((await compareSourceStage([{ source: a, staged: c }])).status).toBe('failed');
    expect((await compareSourceStage([{ source: a, staged: b }])).status).toBe('pass');
    expect((await compareSourceStage([{ source: a, staged: join(root, 'absent.ts') }])).status).toBe('failed');
  });

  it('rejects a missing, expired and mismatched relay lease; accepts a valid empty mailbox', async () => {
    const mailbox = await tmp();
    await mkdir(join(mailbox, 'state'), { recursive: true });
    await mkdir(join(mailbox, 'requests'), { recursive: true });
    const missing = await checkRelayRunContract(mailbox, { runId: 'run-1', environmentId: 'env-1' });
    expect(missing.status).toBe('unavailable');

    const lease = { runId: 'run-1', environmentId: 'env-1', issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString() };
    await writeFile(join(mailbox, 'state', 'lease.json'), JSON.stringify(lease));
    const expired = await checkRelayRunContract(mailbox, { runId: 'run-1', environmentId: 'env-1' });
    expect(expired.status).toBe('failed');
    expect(expired.reason).toBe('lease_expired');

    lease.expiresAt = new Date(Date.now() + 3600000).toISOString();
    await writeFile(join(mailbox, 'state', 'lease.json'), JSON.stringify(lease));
    const mismatched = await checkRelayRunContract(mailbox, { runId: 'other-run', environmentId: 'env-1' });
    expect(mismatched.status).toBe('failed');
    const valid = await checkRelayRunContract(mailbox, { runId: 'run-1', environmentId: 'env-1' });
    expect(valid.status).toBe('pass');

    await writeFile(join(mailbox, 'requests', 'leftover.json'), '{}');
    const dirty = await checkRelayRunContract(mailbox, { runId: 'run-1', environmentId: 'env-1' });
    expect(dirty.status).toBe('failed');
    expect(dirty.reason).toBe('mailbox_not_empty');
  });
});

describe('environment: linux dependency closure', () => {
  const pnpmTree = async () => {
    const root = await tmp();
    const nm = join(root, 'node_modules');
    const pnpmDir = join(nm, '.pnpm', 'seed@1.0.0', 'node_modules');
    const seedReal = join(pnpmDir, 'seed');
    const depReal = join(pnpmDir, 'dep');
    await mkdir(seedReal, { recursive: true });
    await mkdir(depReal, { recursive: true });
    await writeFile(join(seedReal, 'package.json'), JSON.stringify({ name: 'seed', version: '1.0.0', dependencies: { dep: '^1.0.0' } }));
    await writeFile(join(depReal, 'package.json'), JSON.stringify({ name: 'dep', version: '1.0.0' }));
    await symlink(seedReal, join(nm, 'seed'));
    return { nm, seedReal, depReal };
  };

  it('accepts pnpm-linked seeds resolving inside the root and ancestor node_modules sibling deps', async () => {
    const { nm } = await pnpmTree();
    const plan = { hostRoot: nm, containerRoot: '/logical/node_modules', seeds: ['seed'], packageVersions: [['seed', '1.0.0'], ['dep', '1.0.0']], packageCount: 0, fileCount: 0, closureSha256: '0'.repeat(64) };
    const probe = await verifyDependencyClosure(plan, { root: nm });
    expect(probe.status).toBe('unavailable');
    expect(probe.reason).toBe('dependency_closure_mismatch');
    expect(probe.packageCount).toBe(2);
    expect(probe.fileCount).toBe(2);
    const good = await verifyDependencyClosure({ ...plan, packageCount: probe.packageCount ?? plan.packageCount, fileCount: probe.fileCount ?? plan.fileCount, closureSha256: probe.closureSha256 ?? plan.closureSha256 }, { root: nm });
    expect(good.status).toBe('ok');
    expect(good.packageCount).toBe(2);
    expect(good.fileCount).toBe(2);
  });

  it('fails when a required dependency is absent from every ancestor node_modules', async () => {
    const { nm, depReal } = await pnpmTree();
    await writeFile(join(depReal, 'package.json'), JSON.stringify({ name: 'dep', version: '1.0.0', dependencies: { ghost: '9.9.9' } }));
    const result = await verifyDependencyClosure({ hostRoot: nm, containerRoot: '/logical/node_modules', seeds: ['seed'], packageVersions: [], packageCount: 0, fileCount: 0, closureSha256: '0'.repeat(64) }, { root: nm });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('dependency_missing:ghost');
  });

  it('rejects a seed link whose real package root escapes the declared node_modules root', async () => {
    const root = await tmp();
    const nm = join(root, 'node_modules');
    await mkdir(nm, { recursive: true });
    const outside = await tmp();
    const escapeDir = join(outside, 'seed');
    await mkdir(escapeDir, { recursive: true });
    await writeFile(join(escapeDir, 'package.json'), JSON.stringify({ name: 'seed', version: '1.0.0' }));
    await symlink(escapeDir, join(nm, 'seed'));
    const result = await verifyDependencyClosure({ hostRoot: nm, containerRoot: '/logical/node_modules', seeds: ['seed'], packageVersions: [], packageCount: 0, fileCount: 0, closureSha256: '0'.repeat(64) }, { root: nm });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('dependency_link_or_missing:seed');
  });
});

describe('environment: staging realpath boundaries', () => {
  it('rejects a staged destination whose ancestor symlink escapes the stage root', async () => {
    const source = await tmp();
    const stage = await tmp();
    const outside = await tmp();
    await mkdir(join(source, 'safe'), { recursive: true });
    const payload = 'payload-bytes';
    await writeFile(join(source, 'safe', 'a.txt'), payload);
    await symlink(outside, join(stage, 'safe'));
    const digest = createHash('sha256').update(payload).digest('hex');
    await expect(stageFiles({ sourceRoot: source, stageRoot: stage, files: [{ rel: 'safe/a.txt', sha256: digest }] })).rejects.toThrow('stage_boundary_real');
  });

  it('rejects a staged destination file that is itself a symlink', async () => {
    const source = await tmp();
    const stage = await tmp();
    const outside = await tmp();
    const payload = 'payload-bytes';
    await writeFile(join(source, 'b.txt'), payload);
    const escape = join(outside, 'b.txt');
    await writeFile(escape, payload);
    await symlink(escape, join(stage, 'b.txt'));
    const digest = createHash('sha256').update(payload).digest('hex');
    await expect(stageFiles({ sourceRoot: source, stageRoot: stage, files: [{ rel: 'b.txt', sha256: digest }] })).rejects.toThrow('stage_boundary_real');
  });
});

describe('environment: runner dependency mount contract', () => {
  const manifestFor = (binds: Array<{ host: string; container: string; readOnly: boolean }>) => ({
    stage: { rootHost: '/host/stage', rootContainer: '/stage', workspaceBind: { host: '/host/ws', container: '/workspace' } },
    linuxDependencies: { hostRoot: '/host/ws/node_modules', containerRoot: '/workspace/node_modules', mountTarget: '/stage/node_modules', readOnly: true },
    linuxTooling: { hostRoot: '/host/ws/scripts/tooling/node_modules', containerRoot: '/workspace/scripts/tooling/node_modules', mountTarget: '/stage/scripts/tooling/node_modules', readOnly: true },
    containers: { 'w002-b11-linux-r4-env2': { image: { id: 'sha256:image' }, config: { networkNamespace: 'container:w002-b11-ws', user: '1000:1000', readOnlyRoot: true, memoryBytes: 1, cpus: 1, pidsLimit: 1, binds } } }
  });
  const validBinds = () => ([
    { host: '/host/stage', container: '/stage', readOnly: false },
    { host: '/host/ws/node_modules', container: '/stage/node_modules', readOnly: true },
    { host: '/host/ws/scripts/tooling/node_modules', container: '/stage/scripts/tooling/node_modules', readOnly: true }
  ]);

  it('emits exact read-only bind mounts for dependencies and tooling under the stage root', () => {
    const argv = runnerCreateArgv(manifestFor(validBinds()), { databaseUrl: 'postgres://box_fixture:x@w002-b11-box-db-r4-env2:5432/postgres', runId: 'w002-b11-env-r4-env2' });
    expect(argv).toContain('type=bind,source=/host/ws/node_modules,target=/stage/node_modules,readonly');
    expect(argv).toContain('type=bind,source=/host/ws/scripts/tooling/node_modules,target=/stage/scripts/tooling/node_modules,readonly');
    expect(argv).toContain('type=bind,source=/host/stage,target=/stage');
    expect(argv.filter(token => token === '--mount')).toHaveLength(3);
    expect(argv).not.toContain('type=bind,source=/host/ws,target=/workspace');
  });

  it('rejects drift that drops the dependency mount or makes it writable', () => {
    expect(() => runnerCreateArgv(manifestFor(validBinds().slice(0, 1)), { databaseUrl: 'postgres://box_fixture:x@w002-b11-box-db-r4-env2:5432/postgres', runId: 'w002-b11-env-r4-env2' })).toThrow('runner_bind_drift');
    const writable = validBinds();
    const dependencyBind = writable[1];
    if (dependencyBind !== undefined) dependencyBind.readOnly = false;
    expect(() => runnerCreateArgv(manifestFor(writable), { databaseUrl: 'postgres://box_fixture:x@w002-b11-box-db-r4-env2:5432/postgres', runId: 'w002-b11-env-r4-env2' })).toThrow('runner_bind_drift');
  });

  it('rejects host and container bind roots whose relative paths differ', () => {
    const manifest = manifestFor(validBinds());
    manifest.linuxDependencies.containerRoot = '/workspace/other/node_modules';
    expect(() => runnerCreateArgv(manifest, { databaseUrl: 'postgres://box_fixture:x@w002-b11-box-db-r4-env2:5432/postgres', runId: 'w002-b11-env-r4-env2' })).toThrow('dependency_bind_root_mismatch');
  });
});


describe('environment: source map completeness contract', () => {
  const manifestPath = new URL('../../../scripts/box-verification/environment-manifest.json', import.meta.url);
  it('binds immediate tooling scripts, sorted duplicate-free entries and mandatory exclusions', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const files: Array<{ rel: string; sha256: string }> = manifest.stage.sourceFilesPlan.files;
    const byRel = new Map(files.map(item => [item.rel, item.sha256]));
    expect(byRel.get('scripts/pnpm.mjs')).toBe('1992e940c548105fe64be3f6fcdbcd40cc7737f7182593b9a474da612ab33758');
    expect(byRel.get('scripts/workspace.mjs')).toBe('43e37233f31fa92349e490d1f69a9275e2af98dc4c06b778ccb98d227e3c973f');
    for (const rel of ['.env.example', '.node-version', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'scripts/tooling/package.json', 'scripts/tooling/package-lock.json', 'scripts/vite-safety.ts']) expect(byRel.has(rel)).toBe(true);
    const rels = files.map(item => item.rel);
    expect([...rels].sort()).toEqual(rels);
    expect(new Set(rels).size).toBe(rels.length);
    for (const rel of rels) {
      const parts = rel.split('/');
      expect(parts.includes('node_modules')).toBe(false);
      expect(parts.includes('.runtime')).toBe(false);
      expect(parts.includes('dist')).toBe(false);
      expect(parts.includes('.git')).toBe(false);
      expect(rel === '.env' || (rel.split('/').pop()?.startsWith('.env.') && rel !== '.env.example')).toBe(false);
      expect(rel.startsWith('scripts/tooling/node_modules/')).toBe(false);
      expect(rel === 'scripts/box-verification/environment-manifest.json').toBe(false);
      expect(/\.(pem|key|p12|pfx)$/.test(rel)).toBe(false);
    }
  });
});


describe('environment: canonical closure serialization and bind symmetry', () => {
  it('serializes package root and file rows through canonical containerRoot paths', async () => {
    const root = await tmp();
    const nm = join(root, 'node_modules');
    const seed = join(nm, 'seed');
    await mkdir(join(seed, 'lib'), { recursive: true });
    const pkg = JSON.stringify({ name: 'seed', version: '1.0.0' });
    const deep = 'deep-bytes';
    await writeFile(join(seed, 'package.json'), pkg);
    await writeFile(join(seed, 'lib', 'deep.txt'), deep);
    const rows = [['lib/deep.txt', createHash('sha256').update(deep).digest('hex')], ['package.json', createHash('sha256').update(pkg).digest('hex')]];
    const canonical = [{ name: 'seed', version: '1.0.0', root: '/logical/node_modules/seed', files: 2, treeSha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') }];
    const expected = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    const result = await verifyDependencyClosure({ hostRoot: nm, containerRoot: '/logical/node_modules', seeds: ['seed'], packageVersions: [['seed', '1.0.0']], packageCount: 1, fileCount: 2, closureSha256: expected }, { root: nm });
    expect(result.status).toBe('ok');
    expect(result.closureSha256).toBe(expected);
  });

});


describe('environment: reviewed workspace dependency aliases', () => {
  async function fixture() {
    const base = await tmp();
    const nm = join(base, 'node_modules');
    const aliases = []; const files = []; const seedPaths = [];
    const workspaces: Array<[string, string]> = [['services/test-api', '1.0.0'], ['apps/test-ui', '2.0.0']];
    for (const [workspace, version] of workspaces) {
      const targetRel = `.pnpm/foo@${version}/node_modules/foo`;
      await mkdir(join(nm, targetRel), { recursive: true });
      await writeFile(join(nm, targetRel, 'package.json'), JSON.stringify({ name: 'foo', version }));
      const bytes = JSON.stringify({ name: workspace, dependencies: { foo: version } });
      await mkdir(join(base, workspace), { recursive: true });
      await writeFile(join(base, workspace, 'package.json'), bytes);
      const digest = createHash('sha256').update(bytes).digest('hex');
      files.push({ rel: workspace + '/package.json', sha256: digest });
      aliases.push({ packageJson: workspace + '/package.json', packageJsonSha256: digest, name: 'foo', version, targetRel });
      seedPaths.push({ name: 'foo', rel: targetRel });
    }
    const plan = { hostRoot: nm, containerRoot: '/logical/node_modules', mountTarget: '/stage/node_modules', seeds: [], seedPaths, packageVersions: [['foo', '1.0.0'], ['foo', '2.0.0']], packageCount: 0, fileCount: 0, closureSha256: '0'.repeat(64) };
    const probe = await verifyDependencyClosure(plan, { root: nm });
    const frozen = { ...plan, packageCount: probe.packageCount ?? plan.packageCount, fileCount: probe.fileCount ?? plan.fileCount, closureSha256: probe.closureSha256 ?? plan.closureSha256 };
    return { base, manifest: { linuxDependencies: frozen, stage: { rootContainer: base, workspaceAliases: aliases, sourceFilesPlan: { files } } } };
  }

  it('preserves coexistence versions and makes only declared relative workspace aliases', async () => {
    const { base, manifest } = await fixture();
    expect((await verifyDependencyClosure(manifest.linuxDependencies, { root: manifest.linuxDependencies.hostRoot })).status).toBe('ok');
    expect(await stageWorkspaceAliases(manifest)).toMatchObject({ status: 'staged', count: 2 });
    for (const alias of manifest.stage.workspaceAliases) {
      const bytes = await readFile(join(base, alias.packageJson.replace(/package.json$/, ''), 'node_modules/foo/package.json'), 'utf8');
      expect(JSON.parse(bytes).version).toBe(alias.version);
    }
    await expect(stageWorkspaceAliases(manifest)).rejects.toThrow('workspace_alias_collision');
  });

  it('rejects an ancestor symlink before writing any alias', async () => {
    const { base, manifest } = await fixture();
    const outside = await tmp();
    await symlink(outside, join(base, 'apps/test-ui/node_modules'));
    await expect(stageWorkspaceAliases(manifest)).rejects.toThrow('workspace_alias_ancestor');
    await expect(readFile(join(base, 'services/test-api/node_modules/foo/package.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects source drift, missing declarations and unhashed targets', async () => {
    const { base, manifest } = await fixture();
    await expect(stageWorkspaceAliases({ ...manifest, stage: { ...manifest.stage, workspaceAliases: manifest.stage.workspaceAliases.slice(0, 1) } })).rejects.toThrow('workspace_alias_incomplete');
    const aliases = manifest.stage.workspaceAliases.map(alias => ({ ...alias }));
    const firstAlias = aliases[0];
    if (firstAlias !== undefined) firstAlias.targetRel = '.pnpm/unreviewed/node_modules/foo';
    await expect(stageWorkspaceAliases({ ...manifest, stage: { ...manifest.stage, workspaceAliases: aliases } })).rejects.toThrow('workspace_alias_unhashed_target');
    await writeFile(join(base, 'services/test-api/package.json'), '{}');
    await expect(stageWorkspaceAliases(manifest)).rejects.toThrow('workspace_alias_source_drift');
  });
});


describe('environment: bounded dependency hashing', () => {
  it('keeps sequential canonical bytes with at most 32 reads and fails on missing evidence', async () => {
    const base = await tmp(); const nm = join(base, 'node_modules'); const pkg = join(nm, 'seed');
    await mkdir(pkg, { recursive: true });
    const paths = [];
    for (let index = 0; index < 65; index += 1) {
      const name = `file-${String(index).padStart(3, '0')}`;
      await writeFile(join(pkg, name), String(index)); paths.push(name);
    }
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'seed', version: '1.0.0' })); paths.push('package.json'); paths.sort();
    const rows = [];
    for (const name of paths) rows.push([name, createHash('sha256').update(await readFile(join(pkg, name))).digest('hex')]);
    const canonical = [{ name: 'seed', version: '1.0.0', root: '/logical/node_modules/seed', files: rows.length, treeSha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') }];
    const plan = { hostRoot: nm, containerRoot: '/logical/node_modules', seeds: ['seed'], packageVersions: [['seed', '1.0.0']], packageCount: 1, fileCount: rows.length, closureSha256: createHash('sha256').update(JSON.stringify(canonical)).digest('hex') };
    let active = 0; let maximum = 0;
    const read = async (path: string) => {
      active += 1; maximum = Math.max(maximum, active);
      try { await new Promise(resolve => setTimeout(resolve, 2)); return await readFile(path); }
      finally { active -= 1; }
    };
    expect((await verifyDependencyClosure(plan, { root: nm, readFileImpl: read })).status).toBe('ok');
    expect(maximum).toBeGreaterThan(1); expect(maximum).toBeLessThanOrEqual(32);
    await expect(verifyDependencyClosure(plan, { root: nm, readFileImpl: async (path: string) => { if (path.endsWith('file-032')) throw new Error('evidence_read_failed'); return readFile(path); } })).rejects.toThrow('evidence_read_failed');
  });
});
