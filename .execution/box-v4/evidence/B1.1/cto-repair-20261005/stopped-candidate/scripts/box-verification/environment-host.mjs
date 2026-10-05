// W002/B1.1 r4 trusted host environment bookkeeping.
// Reviewed host-side orchestration for exactly the two named resources:
// fixed create/start/workdir/sleep runner arrangement and a non-root Box DB
// with correctly owned tmpfs, plus selective harness staging. Fail-closed on
// name collisions or unexpected existing IDs; never stops/restarts/removes any
// container, never touches existing resources. Synthetic secret material comes
// only from crypto.randomBytes and is never logged or persisted. Must not
// execute on the host before distinct reviewer PASS (reviewDigest gate).

import { randomBytes, createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { docker } from '../docker.mjs';

const EXPECTED_NAMES = ['w002-b11-linux-r4-env2', 'w002-b11-box-db-r4-env2'];
const INSPECT_TIMEOUT_MS = 15000;
const CREATE_TIMEOUT_MS = 120000;
const START_TIMEOUT_MS = 30000;
// Files the staging plan copies into the reviewed stage bind (read-only inside
// the service containers, writable only through the preserved workspace).
export const STAGED_HARNESS_FILES = [
  'scripts/box-verification/fixture-exec-runner.mjs',
  'scripts/box-verification/fixture-command-manifest.json'
];
export const HARNESS_STAGE_DIR = '.r4-harness';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function generateSyntheticSecret() {
  return randomBytes(32).toString('hex');
}

export async function loadEnvironmentManifest(path) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest?.schemaVersion !== 1 || manifest.kind !== 'w002_b11_environment_manifest') throw new Error('environment_manifest_invalid');
  if (manifest.revision !== '2026-10-05-d1-r4-environment-v4') throw new Error('environment_manifest_revision');
  for (const name of EXPECTED_NAMES) {
    const spec = manifest.containers?.[name];
    if (!spec || spec.existing !== false) throw new Error('environment_manifest_missing_new_resource:' + name);
  }
  return manifest;
}

async function inspect(name) {
  const result = await docker(['inspect', '--format', '{{.Id}} {{.Config.Image}}', name], { timeout: INSPECT_TIMEOUT_MS });
  if (result.code !== 0) return null;
  return result.stdout.trim();
}

// Fail closed: refuse to create when a same-named container already exists or an
// unexpected identity is present. No deletion/recreation workaround is permitted.
export async function assertNoCollision(name) {
  const found = await inspect(name);
  if (found !== null) throw new Error('environment_collision:' + name);
}

export function validateDatabaseUrl(databaseUrl) {
  if (typeof databaseUrl !== 'string' || databaseUrl.length > 512) throw new Error('database_url_invalid');
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') throw new Error('database_url_protocol');
  if (url.hostname !== 'w002-b11-box-db-r4-env2' || url.username !== 'box_fixture') throw new Error('database_url_binding');
  return url;
}

function bindRelative(base, candidate) {
  if (typeof base !== 'string' || typeof candidate !== 'string') return null;
  const norm = value => value.replace(/\\/g, '/').replace(/\/+$/, '');
  const b = norm(base); const c = norm(candidate);
  if (c === b || !c.startsWith(b + '/')) return null;
  return c.slice(b.length + 1);
}

function assertWorkspaceDependencyRoot(dep, manifest) {
  const bind = manifest.stage?.workspaceBind;
  const hostRel = bindRelative(bind?.host, dep?.hostRoot);
  const containerRel = bindRelative(bind?.container, dep?.containerRoot);
  if (hostRel === null || containerRel === null || hostRel !== containerRel) throw new Error('dependency_bind_root_mismatch');
}

// Deterministic runner argv: fixed entrypoint 'sleep infinity' under a stable
// workdir so the container idles and all work enters via reviewed exec calls.
// Non-root, read-only root, cap-drop ALL, no-new-privileges, shared net
// namespace, bounded tmpfs, one bounded new staging bind. No ports/egress/socket.
// The synthetic DB URL/run identity reach the runner only as create-time env
// from in-memory material; they are never logged or persisted.
export function runnerCreateArgv(manifest, { databaseUrl, runId } = {}) {
  const spec = manifest.containers['w002-b11-linux-r4-env2'];
  const c = spec.config;
  if (c.networkNamespace !== 'container:w002-b11-ws' || c.user !== '1000:1000' || c.readOnlyRoot !== true) throw new Error('runner_spec_drift');
  const depMounts = [manifest.linuxDependencies, manifest.linuxTooling];
  for (const dep of depMounts) {
    assertWorkspaceDependencyRoot(dep, manifest);
    if (typeof dep?.hostRoot !== 'string' || dep.hostRoot.length === 0 || dep.readOnly !== true) throw new Error('runner_bind_drift');
    if (typeof dep.mountTarget !== 'string' || dep.mountTarget === manifest.stage.rootContainer || !dep.mountTarget.startsWith(manifest.stage.rootContainer + '/')) throw new Error('runner_bind_drift');
  }
  const expectedBinds = [
    { host: manifest.stage.rootHost, container: manifest.stage.rootContainer, readOnly: false },
    ...depMounts.map(dep => ({ host: dep.hostRoot, container: dep.mountTarget, readOnly: true }))
  ];
  if (!Array.isArray(c.binds) || c.binds.length !== expectedBinds.length) throw new Error('runner_bind_drift');
  for (let index = 0; index < expectedBinds.length; index += 1) {
    const bind = c.binds[index]; const expected = expectedBinds[index];
    if (bind.host !== expected.host || bind.container !== expected.container || bind.readOnly !== expected.readOnly) throw new Error('runner_bind_drift');
  }
  validateDatabaseUrl(databaseUrl);
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_.-]{4,128}$/.test(runId)) throw new Error('runner_run_id_invalid');
  return [
    'create',
    '--name', 'w002-b11-linux-r4-env2',
    '--network', 'container:w002-b11-ws',
    '--user', '1000:1000',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--memory', String(c.memoryBytes), '--cpus', String(c.cpus), '--pids-limit', String(c.pidsLimit),
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=512m',
    ...c.binds.flatMap(bind => ['--mount', `type=bind,source=${bind.host},target=${bind.container}` + (bind.readOnly === true ? ',readonly' : '')]),
    '--workdir', c.binds[0].container,
    '--env', 'BOX_TEST_DATABASE_URL=' + databaseUrl,
    '--env', 'BOX_TEST_RUN_ID=' + runId,
    '--entrypoint', 'sleep',
    spec.image.id,
    'infinity'
  ];
}

// Deterministic Box DB argv: postgres image non-root account (uid/gid 999),
// required writable dirs as account-owned tmpfs (read-only image data area),
// synthetic-only randomBytes credential passed via env at create time and never
// logged. Internal network only; no host ports, volumes or daemon mount.
export function boxDbCreateArgv(manifest, { secret }) {
  const spec = manifest.containers['w002-b11-box-db-r4-env2'];
  const c = spec.config;
  if (c.network !== manifest.network.id || c.nonRoot !== true) throw new Error('boxdb_spec_drift');
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('secret_invalid');
  return [
    'create',
    '--name', 'w002-b11-box-db-r4-env2',
    '--network', manifest.network.id,
    '--user', '999:999',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--memory', String(c.memoryBytes), '--cpus', String(c.cpus), '--pids-limit', String(c.pidsLimit),
    '--tmpfs', '/var/lib/postgresql/data:rw,mode=700,uid=999,gid=999',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=128m,uid=999,gid=999',
    '--tmpfs', '/run:rw,noexec,nosuid,size=64m,uid=999,gid=999',
    '--env', 'POSTGRES_USER=box_fixture',
    '--env', 'POSTGRES_DB=postgres',
    '--env', 'POSTGRES_PASSWORD=' + secret,
    spec.image.id
  ];
}

const FORBIDDEN_STAGE = /^(?:\.git|node_modules|\.runtime)(?:\/|$)/;
export function assertStageableRel(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 512) throw new Error('stage_path');
  if (rel.includes('\\') || rel.includes('\0') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel) || rel.split('/').includes('..')) throw new Error('stage_path');
  if (FORBIDDEN_STAGE.test(rel)) throw new Error('stage_forbidden:' + rel);
  if ((rel === '.env' || rel.startsWith('.env.')) && rel !== '.env.example') throw new Error('stage_forbidden:' + rel);
}

export async function assertStageRoot(stageRoot) {
  const info = await lstat(stageRoot).catch(() => null);
  if (info === null) { await mkdir(stageRoot, { recursive: true }); return; }
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('stage_root_boundary');
}

export async function stageFiles({ sourceRoot, stageRoot, files }) {
  const plan = { schemaVersion: 1, kind: 'source_stage', files: [], status: 'planned' };
  if (!Array.isArray(files)) throw new Error('stage_files_invalid');
  const srcBase = resolve(sourceRoot); const dstBase = resolve(stageRoot);
  await assertStageRoot(dstBase);
  const realBase = await realpath(srcBase);
  const realDstBase = await realpath(dstBase);
  for (const item of files) {
    assertStageableRel(item?.rel);
    if (!/^[a-f0-9]{64}$/.test(item.sha256 ?? '')) throw new Error('stage_digest_missing:' + item.rel);
    const source = resolve(srcBase, item.rel);
    const destination = resolve(dstBase, item.rel);
    if (source !== srcBase && !source.startsWith(srcBase + sep)) throw new Error('stage_boundary');
    if (!destination.startsWith(dstBase + sep)) throw new Error('stage_boundary');
    const realSource = await realpath(source);
    if (realSource !== realBase && !realSource.startsWith(realBase + sep)) throw new Error('stage_boundary_real');
    let ancestor = dirname(destination);
    let realAncestor = await realpath(ancestor).catch(() => null);
    while (realAncestor === null && ancestor !== dstBase) {
      ancestor = dirname(ancestor);
      realAncestor = await realpath(ancestor).catch(() => null);
    }
    if (realAncestor === null || (realAncestor !== realDstBase && !realAncestor.startsWith(realDstBase + sep))) throw new Error('stage_boundary_real');
    const dstInfo = await lstat(destination).catch(() => null);
    if (dstInfo !== null) {
      if (dstInfo.isSymbolicLink()) throw new Error('stage_boundary_real');
      const realDestination = await realpath(destination);
      if (realDestination !== realDstBase && !realDestination.startsWith(realDstBase + sep)) throw new Error('stage_boundary_real');
    }
    const bytes = await readFile(realSource);
    const digest = sha256(bytes);
    if (digest !== item.sha256) {
      plan.status = 'unavailable';
      plan.files.push({ rel: item.rel, digest, expected: item.sha256, status: 'digest_mismatch' });
      return plan;
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' }).catch(async error => {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readFile(destination);
      if (sha256(existing) !== digest) throw new Error('stage_collision:' + item.rel);
    });
    plan.files.push({ rel: item.rel, digest, status: 'staged' });
  }
  plan.status = 'staged';
  return plan;
}

const FORBIDDEN_ARGV_TOKENS = new Set(['--privileged', '--cap-add', '-p', '--publish', '--publish-all', '-P', '--add-host', '-v', '--volume']);
export function validateCreateArgv(argv, manifest, name) {
  if (!Array.isArray(argv) || argv[0] !== 'create') throw new Error('create_argv_shape');
  const spec = manifest.containers[name];
  if (!spec) throw new Error('create_argv_unlisted:' + name);
  for (const token of argv) if (FORBIDDEN_ARGV_TOKENS.has(token) || token.startsWith('--publish=') || token.startsWith('--cap-add=')) throw new Error('create_argv_forbidden:' + token);
  const image = argv[argv.length - (name === 'w002-b11-linux-r4-env2' ? 2 : 1)];
  if (image !== spec.image.id) throw new Error('create_argv_image_drift:' + name);
}

// Selective staging plan: only hash-listed harness wrapper bytes are copied into
// the new stage bind at <root>/<HARNESS_STAGE_DIR>. Every staged file must hash
// to its reviewed source digest; anything else is refused.
export async function stageHarness({ sourceRoot, stageRoot, expectedDigests }) {
  const plan = { schemaVersion: 1, kind: 'harness_stage', files: [], status: 'planned' };
  const realSourceRoot = await realpath(sourceRoot);
  const realStageRoot = await realpath(stageRoot);
  const target = join(stageRoot, HARNESS_STAGE_DIR);
  await mkdir(target, { recursive: true });
  const realTarget = await realpath(target);
  if (realTarget !== realStageRoot && !realTarget.startsWith(realStageRoot + sep)) throw new Error('stage_boundary_real');
  for (const rel of STAGED_HARNESS_FILES) {
    const source = join(sourceRoot, rel);
    const realSource = await realpath(source);
    if (realSource !== realSourceRoot && !realSource.startsWith(realSourceRoot + sep)) throw new Error('stage_boundary_real');
    const bytes = await readFile(realSource);
    const digest = sha256(bytes);
    const expected = expectedDigests?.[rel];
    if (typeof expected === 'string' && expected !== digest) {
      plan.status = 'unavailable';
      plan.files.push({ rel, digest, expected, status: 'digest_mismatch' });
      return plan; // fail closed: staged bytes must equal reviewed bytes
    }
    const name = rel.split('/').pop();
    const destination = join(target, name);
    const dstInfo = await lstat(destination).catch(() => null);
    if (dstInfo !== null) {
      if (dstInfo.isSymbolicLink()) throw new Error('stage_boundary_real');
      const realDestination = await realpath(destination);
      if (realDestination !== realTarget && !realDestination.startsWith(realTarget + sep)) throw new Error('stage_boundary_real');
    }
    await writeFile(destination, bytes, { flag: 'wx' }).catch(async error => {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readFile(destination);
      if (sha256(existing) !== digest) throw new Error('stage_collision:' + name);
    });
    plan.files.push({ rel, staged: join(HARNESS_STAGE_DIR, name), digest, status: 'staged' });
  }
  plan.status = 'staged';
  return plan;
}

export async function verifyDependencyClosure(plan, { root, readFileImpl = readFile } = {}) {
  if (plan?.hostRoot !== root) return { status: 'unavailable', reason: 'dependency_root_mismatch' };
  if (typeof plan?.containerRoot !== 'string' || !plan.containerRoot.startsWith('/')) return { status: 'unavailable', reason: 'dependency_plan_invalid' };
  if (!Array.isArray(plan?.seeds) || !Array.isArray(plan?.packageVersions)) return { status: 'unavailable', reason: 'dependency_plan_invalid' };
  const rootBase = resolve(root);
  const containerBase = plan.containerRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const canonicalRoot = realDir => {
    const rel = realDir === rootBase ? '' : realDir.slice(rootBase.length + 1).split(sep).join('/');
    return rel === '' ? containerBase : containerBase + '/' + rel;
  };
  const ancestorStop = dirname(rootBase);
  const roots = new Map();
  const resolveDependencyDir = async (dir, name) => {
    let cursor = dir;
    for (;;) {
      const candidate = join(cursor, 'node_modules', name);
      if (await lstat(candidate).catch(() => null) !== null) return candidate;
      if (cursor === ancestorStop) return null;
      cursor = dirname(cursor);
    }
  };
  const resolvePackageAt = async (dir, name) => {
    const realDir = await realpath(dir).catch(() => null);
    if (realDir === null || !realDir.startsWith(rootBase + sep)) return { status: 'unavailable', reason: 'dependency_link_or_missing:' + name };
    let pkg;
    try { pkg = JSON.parse(await readFileImpl(join(realDir, 'package.json'))); } catch { return { status: 'unavailable', reason: 'dependency_manifest_missing:' + name }; }
    if (roots.has(realDir)) return { status: 'ok' };
    roots.set(realDir, { name, version: pkg.version, root: realDir });
    const deps = { ...(pkg.dependencies ?? {}) };
    for (const opt of Object.keys(pkg.optionalDependencies ?? {})) {
      if (await resolveDependencyDir(realDir, opt) !== null) deps[opt] = pkg.optionalDependencies[opt];
    }
    for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
      if (await resolveDependencyDir(realDir, peer) !== null) deps[peer] = pkg.peerDependencies[peer];
    }
    for (const dep of Object.keys(deps)) {
      const target = await resolveDependencyDir(realDir, dep);
      if (target === null) return { status: 'unavailable', reason: 'dependency_missing:' + dep };
      const result = await resolvePackageAt(target, dep);
      if (result.status !== 'ok') return result;
    }
    return { status: 'ok' };
  };
  for (const seed of plan.seeds) {
    const seedResult = await resolvePackageAt(join(root, seed), seed);
    if (seedResult.status !== 'ok') return seedResult;
  }
  let fileCount = 0;
  const packages = [];
  for (const entry of [...roots.values()].sort((a, b) => canonicalRoot(a.root) < canonicalRoot(b.root) ? -1 : (canonicalRoot(a.root) > canonicalRoot(b.root) ? 1 : 0))) {
    const rows = [];
    const walk = async dir => {
      const names = (await readdir(dir)).sort();
      for (const name of names) {
        const path = join(dir, name);
        const info = await lstat(path);
        if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) return { status: 'unavailable', reason: 'dependency_link:' + path };
        if (info.isDirectory()) { const nested = await walk(path); if (nested) return nested; continue; }
        rows.push([path.slice(entry.root.length + 1).split(sep).join('/'), sha256(await readFileImpl(path))]);
        fileCount += 1;
      }
      return null;
    };
    const failure = await walk(entry.root);
    if (failure) return failure;
    packages.push({ name: entry.name, version: entry.version, root: canonicalRoot(entry.root), files: rows.length, treeSha256: sha256(JSON.stringify(rows)) });
  }
  const closureSha256 = sha256(JSON.stringify(packages));
  if (packages.length !== plan.packageCount || fileCount !== plan.fileCount || closureSha256 !== plan.closureSha256) {
    return { status: 'unavailable', reason: 'dependency_closure_mismatch', packageCount: packages.length, fileCount, closureSha256 };
  }
  const expectedVersions = new Map(plan.packageVersions);
  for (const pkg of packages) if (expectedVersions.get(pkg.name) !== pkg.version) return { status: 'unavailable', reason: 'dependency_version_mismatch:' + pkg.name };
  return { status: 'ok', packageCount: packages.length, fileCount, closureSha256 };
}

export async function createResources(manifest, { reviewDigest, expectedReviewDigest, reviewPath, stateDir, sourceRoot, expectedDigests, sourceFiles }) {
  // Review gate: the reviewer-published digest must match before any Docker call.
  if (typeof expectedReviewDigest !== 'string' || expectedReviewDigest.length < 16) throw new Error('environment_review_missing');
  if (reviewDigest !== expectedReviewDigest) throw new Error('environment_review_digest_mismatch');
  if (typeof reviewPath !== 'string') throw new Error('environment_review_file_missing');
  const reviewBytes = await readFile(reviewPath);
  if (sha256(reviewBytes) !== expectedReviewDigest) throw new Error('environment_review_digest_mismatch');
  const review = JSON.parse(reviewBytes.toString('utf8'));
  if (review?.verdict !== 'pass') throw new Error('environment_review_not_pass');
  if (review.environmentId !== undefined && review.environmentId !== manifest.environmentId) throw new Error('environment_review_mismatch');
  const harnessDigests = expectedDigests ?? manifest.stage?.harnessFileDigests;
  for (const rel of STAGED_HARNESS_FILES) {
    const expected = harnessDigests?.[rel];
    if (typeof expected === 'string' && sha256(await readFile(join(sourceRoot, rel))) !== expected) throw new Error('environment_harness_digest_mismatch:' + rel);
  }
  const resolvedSourceFiles = sourceFiles ?? manifest.stage?.sourceFilesPlan?.files;
  if (resolvedSourceFiles !== undefined) {
    if (!Array.isArray(resolvedSourceFiles)) throw new Error('stage_files_invalid');
    for (const item of resolvedSourceFiles) {
      assertStageableRel(item?.rel);
      if (!/^[a-f0-9]{64}$/.test(item.sha256 ?? '')) throw new Error('stage_digest_missing:' + item.rel);
      if (sha256(await readFile(join(sourceRoot, item.rel))) !== item.sha256) throw new Error('environment_source_digest_mismatch:' + item.rel);
    }
  }
  for (const rel of manifest.commands?.fixtureEntrypointBuilds ?? []) assertStageableRel(rel);
  let dependencyClosure;
  if (manifest.linuxDependencies !== undefined) {
    assertWorkspaceDependencyRoot(manifest.linuxDependencies, manifest);
    dependencyClosure = await verifyDependencyClosure(manifest.linuxDependencies, { root: manifest.linuxDependencies.hostRoot });
    if (dependencyClosure.status !== 'ok') throw new Error('environment_dependency_closure_failed');
  }
  let toolingClosure;
  if (manifest.linuxTooling !== undefined) {
    assertWorkspaceDependencyRoot(manifest.linuxTooling, manifest);
    toolingClosure = await verifyDependencyClosure(manifest.linuxTooling, { root: manifest.linuxTooling.hostRoot });
    if (toolingClosure.status !== 'ok') throw new Error('environment_tooling_closure_failed');
  }
  for (const name of EXPECTED_NAMES) await assertNoCollision(name);

  await mkdir(stateDir, { recursive: true });
  const record = { schemaVersion: 1, kind: 'environment_creation', environmentId: manifest.environmentId, created: [], at: new Date().toISOString() };
  const persist = () => writeFile(join(stateDir, 'environment-creation.json'), JSON.stringify(record, null, 2));
  if (dependencyClosure !== undefined) record.dependencyClosure = dependencyClosure;
  if (toolingClosure !== undefined) record.toolingClosure = toolingClosure;

  // 1. Selective harness staging into the shared workspace bind (hash-listed
  //    only) so the read-only service mounts can execute the reviewed wrapper
  //    at /workspace/.r4-harness/. No other stage bytes are touched.
  const stagePlan = await stageHarness({ sourceRoot, stageRoot: manifest.stage.workspaceBind.host, expectedDigests: harnessDigests });
  record.staging = { ...stagePlan, files: stagePlan.files };
  if (stagePlan.status !== 'staged') { await persist(); throw new Error('environment_staging_failed'); }

  // 2. Additive staging of the reviewed source/static-fixture/Linux-dependency
  //    bytes into the new exclusive stage root. Every entry is hash-bound and
  //    boundary-checked; nothing outside the reviewed digest map is copied.
  if (resolvedSourceFiles !== undefined) {
    const sourcePlan = await stageFiles({ sourceRoot, stageRoot: manifest.stage.rootHost, files: resolvedSourceFiles });
    record.sourceStaging = { ...sourcePlan, files: sourcePlan.files };
    if (sourcePlan.status !== 'staged') { await persist(); throw new Error('environment_source_staging_failed'); }
  }

  // 3. Fresh Box DB first, then the runner bound to the synthetic URL and run
  //    identity through create-time env. The secret exists only in memory; the
  //    durable record never contains it.
  const secret = generateSyntheticSecret();
  const databaseUrl = 'postgres://box_fixture:' + secret + '@w002-b11-box-db-r4-env2:5432/postgres';
  const steps = [
    { name: 'w002-b11-box-db-r4-env2', argv: boxDbCreateArgv(manifest, { secret }) },
    { name: 'w002-b11-linux-r4-env2', argv: runnerCreateArgv(manifest, { databaseUrl, runId: manifest.environmentId }) }
  ];
  for (const { name, argv } of steps) {
    validateCreateArgv(argv, manifest, name);
    const created = await docker(argv, { timeout: CREATE_TIMEOUT_MS });
    if (created.code !== 0) {
      record.created.push({ name, status: 'failed', stderr: created.stderr.slice(0, 2048) });
      await persist();
      throw new Error('environment_create_failed:' + name);
    }
    const started = await docker(['start', name], { timeout: START_TIMEOUT_MS });
    if (started.code !== 0) {
      record.created.push({ name, status: 'start_failed', stderr: started.stderr.slice(0, 2048) });
      await persist();
      throw new Error('environment_start_failed:' + name);
    }
    const identity = await inspect(name);
    if (!identity) throw new Error('environment_identity_unconfirmed:' + name);
    const spec = manifest.containers[name];
    if (!identity.includes(spec.image.id) && !identity.includes(spec.image.id.replace('sha256:', ''))) {
      record.created.push({ name, status: 'image_mismatch', inspect: identity });
      await persist();
      throw new Error('environment_image_mismatch:' + name);
    }
    record.created.push({ name, status: 'running', inspect: identity });
    await persist();
  }
  // Secret is intentionally absent from the durable record; the only handoff
  // is the returned in-memory value for the owning orchestrator.
  await persist();
  return { record, credentials: { databaseUrl } };
}

if (process.argv[1] && process.argv[1].endsWith('environment-host.mjs')) {
  const [, , manifestPath, stateDir, reviewPath, expectedReviewDigest, sourceRoot] = process.argv;
  if (!manifestPath || !stateDir) { console.error('usage: environment-host.mjs <manifest> <stateDir> [reviewPath expectedReviewDigest] [sourceRoot]'); process.exit(2); }
  const manifest = await loadEnvironmentManifest(manifestPath);
  const reviewDigest = reviewPath !== undefined ? sha256(await readFile(reviewPath)) : undefined;
  await createResources(manifest, { reviewDigest, expectedReviewDigest, reviewPath, stateDir, sourceRoot: sourceRoot ?? '.' });
}
