import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, open, rename, rm, readdir, readFile, realpath, readlink, stat, lstat, symlink, writeFile, appendFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep, dirname, relative } from 'node:path';

export const MANIFEST_PATH = fileURLToPath(new URL('./environment-manifest.json', import.meta.url));

export const ALLOWED_COMMANDS = Object.freeze([
  'node scripts/suite.mjs box --suite delegation',
  'node scripts/pnpm.mjs test:box-contracts',
  'node scripts/pnpm.mjs test:box-auth',
  'node scripts/pnpm.mjs check',
  'node scripts/pnpm.mjs build',
  'node scripts/pnpm.mjs test:auth',
  'node scripts/pnpm.mjs test:contracts',
  'node scripts/pnpm.mjs test:planner'
]);

const COMMAND_TIMEOUT_MS = 480000;
const SIGTERM_GRACE_MS = 5000;
const SIGKILL_DRAIN_MS = 10000;
const LEGACY_AUTH_IDLE_MS = 305000;
const LEGACY_AUTH_COMMAND_INDICES = Object.freeze([2, 5]);

export const NETWORK_NAME = 'w005-d12-delegation-net';
export const RUNNER_NAME = 'w005-d12-delegation-runner';
export const DB_NAME = 'w005-d12-delegation-db';
export const DB_ALIAS = 'w002-b11-box-db-r4-env2';
export const RUN_DB_PREFIX = 'w005_d12_run_';
export const LEGACY_RUN_DB_PREFIX = 'w002_b11_r4run_';
export const RUN_DB_LIMIT = 12;
export const STAGE_ROOT = 'C:/Users/shout/AppData/Local/Temp/w005-d12-delegation-stage';
export const DEPS_ROOT = 'C:/Users/shout/AppData/Local/Temp/w005-d12-delegation-deps';
export const WORKER_RECEIPT_DIR = '.execution/box-v4/evidence/D1.2/worker';
const RUNNER_SUPERVISOR_PATH = '/stage/tests/box/delegation/environment-host.mjs';
export const RUNNER_RECEIPT_DIR = '/stage/receipts';
const STAGE_RECEIPT_DIR = 'C:/Users/shout/AppData/Local/Temp/w005-d12-delegation-stage/receipts';

const RUNNER_IMAGE = 'sha256:eb4a84ec3e2948cd47e414fa66054730f10d0c20e5001b895fd58070c81c53f8';
const DB_IMAGE = 'sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652';
const RUNNER_LIMITS = { memoryBytes: 2147483648, cpus: 2, pids: 256 };
const DB_LIMITS = { memoryBytes: 1073741824, cpus: 1, pids: 128 };
const EXPECTED_RUNNER_RUNTIME_USER = '1000:1000';
const EXPECTED_IMAGE_USERS = { [RUNNER_IMAGE]: 'pwuser', [DB_IMAGE]: '' };
const EXPECTED_DB_USERNAME = 'box_fixture';
const EXPECTED_DB_URL = 'postgresql://box_fixture@w002-b11-box-db-r4-env2:5432/postgres';
const EXPECTED_DB_RUN_ID = 'w005-d12-delegation';

const RUNNER_TMPFS = [
  '/stage:rw,uid=1000,gid=1000,mode=755,size=2g',
  '/home/box:rw,uid=1000,gid=1000,mode=755,size=64m',
  '/tmp:rw,noexec,nosuid,size=512m'
];
const DB_TMPFS = [
  '/var/lib/postgresql/data:rw,mode=700,uid=999,gid=999',
  '/tmp:rw,noexec,nosuid,size=128m,uid=999,gid=999',
  '/run:rw,noexec,nosuid,size=64m,uid=999,gid=999'
];

const FORBIDDEN_STAGE_SEGMENTS = new Set([
  'node_modules', '.git', '.runtime', 'dist', '__pycache__', '.env'
]);
const FORBIDDEN_ARGV_TOKENS = new Set([
  '--privileged', '--network=host', '--pid=host', '--ipc=host', '--uts=host',
  '--cgroupns=host', '--device', '-v /', '--volume=/', '--cap-add', '--add-host',
  '--mount=type=bind,source=/', '--network host'
]);
const DEPENDENCY_MOUNTS = Object.freeze([
  { hostSubpath: 'node_modules', containerTarget: '/stage/node_modules' },
  { hostSubpath: 'tooling-node_modules', containerTarget: '/stage/scripts/tooling/node_modules' }
]);
const EXPECTED_DEPS_SOURCE_ROOTS = {
  'node_modules': 'C:/Users/shout/AppData/Local/Temp/w002-b11-stage/node_modules',
  'tooling-node_modules': 'C:/Users/shout/AppData/Local/Temp/w002-b11-stage/scripts/tooling/node_modules'
};
const EXPECTED_DEPS_PLAN_KEYS = Object.freeze(['linuxDependencies', 'linuxTooling']);
const DEPS_METADATA_RELS = Object.freeze(['.modules.yaml', '.pnpm/lock.yaml']);
const EXPECTED_DEPS_PLAN_VALUES = {
  'node_modules': { planKey: 'linuxDependencies', containerRoot: '/workspace/node_modules', packageCount: 131, fileCount: 7274, closureSha256: 'd6413531fdfb601a93738990c3e6f8c44e319b7acfc9a1540edecc30f21d66a9' },
  'tooling-node_modules': { planKey: 'linuxTooling', containerRoot: '/workspace/scripts/tooling/node_modules', packageCount: 1, fileCount: 1077, closureSha256: 'b5b8b1d27e37f103c97325659c83b8e89a2582fb7a95aa23e1317e224802f0b6' }
};
const EXPECTED_PLAN_KEY_FOR = { linuxDependencies: 'node_modules', linuxTooling: 'tooling-node_modules' };
const ALLOWED_MODES = Object.freeze(['plan', 'ledger', 'deps', 'create', 'start', 'verify', 'stage', 'supervise']);

function envError(code, message, details = {}) {
  const e = new Error(message);
  e.code = code;
  e.details = details;
  return e;
}

export function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function redactSecrets(obj) {
  const SECRET_KEYS = new Set(['POSTGRES_PASSWORD', 'PGPASSWORD', 'DATABASE_URL', 'BOX_DELEGATION_DATABASE_URL', 'BOX_TEST_DATABASE_URL', 'env', 'Env']);
  const clone = (v) => {
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, val]) => [
        k,
        SECRET_KEYS.has(k) ? `sha256:${sha256Json(val).slice(0, 16)}` : clone(val)
      ]));
    }
    return v;
  };
  return clone(obj);
}

export function allowedReceiptDirs() {
  const dirs = manifestAllowedReceiptDirs();
  return dirs;
}

function manifestAllowedReceiptDirs() {
  return [WORKER_RECEIPT_DIR, STAGE_RECEIPT_DIR, RUNNER_RECEIPT_DIR];
}

function canonicalUnder(root, target) {
  const rel = resolve(root, target);
  if (rel !== resolve(root) && !rel.startsWith(resolve(root) + sep)) {
    throw envError('environment_stage_forbidden', 'path escapes owned root', { root, target });
  }
  return rel;
}

async function ensureOwnedDir(dir) {
  await mkdir(dir, { recursive: true });
  const st = await lstat(dir).catch(() => null);
  if (!st || !st.isDirectory() || st.isSymbolicLink()) {
    throw envError('environment_stage_forbidden', 'owned dir missing or not a real directory', { dir });
  }
  return realpath(dir);
}

async function realRoot(root) {
  const s = await lstat(root).catch(() => null);
  if (!s || !s.isDirectory() || s.isSymbolicLink()) {
    throw envError('environment_root_forbidden', 'receipt root missing or not a real directory', { root });
  }
  return realpath(root);
}

async function assertReceiptTarget(root, rel) {
  const rootReal = await realRoot(root);
  const target = canonicalUnder(rootReal, rel);
  const dir = dirname(target);
  let cursor = dir;
  const chain = [dir];
  while (cursor !== rootReal && cursor.startsWith(rootReal + sep)) {
    cursor = dirname(cursor);
    if (cursor !== rootReal) chain.push(cursor);
  }
  for (const p of chain) {
    const st = await lstat(p).catch(() => null);
    if (st && st.isSymbolicLink()) throw envError('environment_stage_forbidden', 'symlink ancestor', { path: p });
  }
  const final = await lstat(target).catch(() => null);
  if (final && !final.isFile()) {
    throw envError('environment_stage_forbidden', 'receipt target exists and is not a regular file', { target });
  }
  return target;
}

export async function atomicWriteJson(root, rel, value) {
  const dirs = manifestAllowedReceiptDirs();
  const resolvedRoot = resolve(root);
  const allowed = dirs.map((d) => resolve(d));
  if (!allowed.includes(resolvedRoot)) {
    throw envError('environment_stage_forbidden', 'receipt dir not in manifest-bound set', { root: resolvedRoot, allowed });
  }
  const target = await assertReceiptTarget(root, rel);
  const tmp = target + '.' + randomBytes(6).toString('hex') + '.tmp';
  const fh = await open(tmp, 'wx');
  try {
    await fh.writeFile(JSON.stringify(value));
  } finally {
    await fh.close();
  }
  await rename(tmp, target);
  return { path: target, sha256: sha256Json(value) };
}

export function assertStageableRel(rel) {
  if (!rel || typeof rel !== 'string' || rel.length > 512) {
    throw envError('environment_stage_forbidden', 'bad relative path', { rel });
  }
  if (rel.includes('..') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel) || rel.includes('\\')) {
    throw envError('environment_stage_forbidden', 'non-relative or traversal path', { rel });
  }
  const segments = rel.split('/');
  for (const seg of segments) {
    if (!seg || FORBIDDEN_STAGE_SEGMENTS.has(seg) || /^\.env/.test(seg)) {
      throw envError('environment_stage_forbidden', 'forbidden path segment', { rel });
    }
  }
  return segments;
}

async function assertNoSymlinkAncestors(rootReal, absTarget) {
  let cursor = dirname(absTarget);
  while (cursor !== rootReal && cursor.startsWith(rootReal + sep)) {
    const st = await lstat(cursor);
    if (st.isSymbolicLink()) {
      throw envError('environment_stage_forbidden', 'symlink ancestor', { path: cursor });
    }
    cursor = dirname(cursor);
  }
}

async function ensureStageParentChain(rootReal, absDir) {
  const chain = [];
  let cursor = absDir;
  while (cursor !== rootReal && cursor.startsWith(rootReal + sep)) {
    chain.push(cursor);
    cursor = dirname(cursor);
  }
  chain.reverse();
  for (const p of chain) {
    const st = await lstat(p).catch(() => null);
    if (!st) {
      await mkdir(p);
      continue;
    }
    if (!st.isDirectory() || st.isSymbolicLink()) {
      throw envError('environment_stage_forbidden', 'destination ancestor exists and is not a real directory', { path: p });
    }
  }
}

export function assertStageRoot(root) {
  const resolved = resolve(root);
  if (resolved !== resolve(STAGE_ROOT)) {
    throw envError('environment_stage_forbidden', 'stage root is not the owned stage root', { root: resolved });
  }
  return resolved;
}

export async function stageFiles(root, files) {
  const resolvedRoot = assertStageRoot(root);
  await mkdir(resolvedRoot, { recursive: true });
  const rootStat = await lstat(resolvedRoot).catch(() => null);
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw envError('environment_stage_forbidden', 'stage root is not a real directory', { root: resolvedRoot });
  }
  const rootReal = await realpath(resolvedRoot);
  if (resolve(rootReal) !== resolvedRoot) {
    throw envError('environment_stage_forbidden', 'stage root canonical path mismatch', { root: resolvedRoot, real: rootReal });
  }
  const results = [];
  for (const { source, rel } of files) {
    const segments = assertStageableRel(rel);
    const target = join(resolvedRoot, ...segments);
    await ensureStageParentChain(rootReal, dirname(target));
    await assertNoSymlinkAncestors(rootReal, target);
    const existing = await lstat(target).catch(() => null);
    if (existing) {
      throw envError('environment_stage_forbidden', 'stage destination already exists; exclusive write refuses overwrite', { target });
    }
    const srcLstat = await lstat(source);
    if (!srcLstat.isFile() || srcLstat.isSymbolicLink()) {
      throw envError('environment_stage_forbidden', 'stage source must be a regular file', { source });
    }
    const srcReal = await realpath(source);
    const bytes = await readFile(srcReal);
    const digest = createHash('sha256').update(bytes).digest('hex');
    await writeFile(target, bytes, { flag: 'wx' });
    results.push({ rel, sha256: digest, bytes: bytes.length });
  }
  return results;
}

export function dependencyMountArgv(mount) {
  if (!mount || typeof mount !== 'object') throw envError('environment_host_arg', 'mount must be object');
  const approved = DEPENDENCY_MOUNTS.find(
    (m) => m.hostSubpath === mount.hostSubpath && m.containerTarget === mount.containerTarget
  );
  if (!approved) {
    throw envError('environment_host_arg', 'dependency mount is not an approved fixed pair', { mount });
  }
  const hostPath = canonicalUnder(DEPS_ROOT, approved.hostSubpath);
  return ['-v', `${hostPath}:${approved.containerTarget}:ro`];
}

function assertFixedArgv(argv) {
  for (const tok of argv) {
    if (FORBIDDEN_ARGV_TOKENS.has(tok) || FORBIDDEN_ARGV_TOKENS.has(String(tok).split('=')[0] + '=' + String(tok).split('=')[1])) {
      throw envError('environment_host_arg', 'forbidden argv token', { tok });
    }
    if (typeof tok === 'string' && tok.startsWith('--network=host')) throw envError('environment_host_arg', 'host network forbidden');
  }
  return argv;
}

export async function inspectResource(name) {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    throw envError('environment_host_arg', 'invalid resource name', { name });
  }
  try {
    const out = await runCapture('docker', ['inspect', '--format', '{{.Id}}|{{.State.Status}}|{{.Config.Image}}|{{.Config.User}}', name]);
    const [id, status, image, user] = out.stdout.trim().split('|');
    return { present: true, id, status, image, user: user ?? '' };
  } catch (err) {
    const daemonText = (err.stderr ?? '') + ' ' + (err.message ?? '');
    if (err.exit !== undefined && /no such (object|container|network|image)|not found/i.test(daemonText)) return { present: false };
    throw envError('environment_daemon_error', 'docker inspect failed (daemon/permission/transport)', { name, exit: err.exit, stderr: (err.stderr ?? '').slice(0, 200) });
  }
}

export function networkCreateArgv() {
  return assertFixedArgv([
    'network', 'create', '--driver', 'bridge', '--internal',
    '--subnet', '172.31.0.0/24', '--label', 'box-wave=W005', NETWORK_NAME
  ]);
}

export function dbCreateArgv(manifest, password) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 128 || /[\s]/.test(password)) {
    throw envError('environment_host_arg', 'db password must be a supplied secret value (16-128 chars, no whitespace); it is never read from state or persisted');
  }
  const argv = [
    'create', '--name', DB_NAME,
    '--network', NETWORK_NAME, '--network-alias', DB_ALIAS,
    '--memory', String(DB_LIMITS.memoryBytes), '--cpus', String(DB_LIMITS.cpus),
    '--pids-limit', String(DB_LIMITS.pids), '--user', '999:999',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--read-only',
    ...DB_TMPFS.flatMap((t) => ['--tmpfs', t]),
    '-e', 'POSTGRES_DB=postgres', '-e', `POSTGRES_USER=${manifest.database.username}`,
    '-e', 'POSTGRES_PASSWORD=' + password,
    DB_IMAGE
  ];
  return assertFixedArgv(argv);
}

export async function verifyDependencyMounts(manifest) {
  const deps = manifest?.dependencies;
  if (!deps || deps.depsRootHost !== DEPS_ROOT) {
    throw envError('environment_manifest_deps', 'manifest dependencies.depsRootHost does not match the owned deps root');
  }
  const mMounts = deps.mounts;
  if (!Array.isArray(mMounts) || mMounts.length !== DEPENDENCY_MOUNTS.length ||
      !mMounts.every((mm) => mm.readOnly === true &&
        DEPENDENCY_MOUNTS.some((a) => a.hostSubpath === mm.hostSubpath && a.containerTarget === mm.containerTarget))) {
    throw envError('environment_manifest_deps', 'manifest dependency mounts do not match the approved read-only fixed set');
  }
  const depsResolved = resolve(DEPS_ROOT);
  const depsStat = await lstat(depsResolved).catch(() => null);
  if (!depsStat || !depsStat.isDirectory() || depsStat.isSymbolicLink()) {
    throw envError('environment_deps_forbidden', 'deps root missing or not a real directory', { root: depsResolved });
  }
  const depsReal = await realpath(depsResolved);
  const plans = manifestDependencyPlans(deps);
  for (const approved of DEPENDENCY_MOUNTS) {
    const hostPath = canonicalUnder(depsReal, approved.hostSubpath);
    const st = await lstat(hostPath).catch(() => null);
    if (!st || !st.isDirectory() || st.isSymbolicLink()) {
      throw envError('environment_deps_forbidden', 'dependency mount host subpath missing or not a real directory', { hostPath });
    }
    const realSub = await realpath(hostPath);
    if (realSub !== hostPath) {
      throw envError('environment_deps_forbidden', 'dependency mount host subpath escapes canonical deps root', { hostPath, realSub });
    }
    const plan = plans[approved.hostSubpath];
    if (resolve(plan.destRoot) !== resolve(hostPath)) {
      throw envError('environment_deps_forbidden', 'manifest plan destRoot does not equal the fixed mount host subpath', { hostSubpath: approved.hostSubpath });
    }
    const closure = await verifyDependencyClosure(plan, { root: plan.destRoot });
    if (closure.status !== 'ok') {
      throw envError('environment_deps_closure', 'destination dependency closure does not equal the reviewed manifest closure', { hostSubpath: approved.hostSubpath, reason: closure.reason });
    }
    const receipt = JSON.parse(await readFile(resolve(WORKER_RECEIPT_DIR, 'dependency-preparation.json'), 'utf8').catch(() => 'null'));
    if (!receipt || receipt.kind !== 'dependency_preparation' || receipt.depsRoot !== depsResolved || receipt.manifestSha256 !== sha256Json(manifest.dependencies.plans)) {
      throw envError('environment_deps_receipt', 'dependency-preparation receipt missing, unbound to the owned deps root, or not bound to the current manifest plans');
    }
    const receiptSubpaths = (receipt.mounts ?? []).map((em) => em?.hostSubpath);
    if (!Array.isArray(receipt.mounts) || receiptSubpaths.length !== DEPENDENCY_MOUNTS.length ||
        !DEPENDENCY_MOUNTS.every((am) => receiptSubpaths.filter((s) => s === am.hostSubpath).length === 1)) {
      throw envError('environment_deps_receipt', 'dependency-preparation receipt mounts must contain exactly the two approved hostSubpath entries, no missing/extras/duplicates', { receiptSubpaths });
    }
    const entry = (receipt.mounts ?? []).find((em) => em.hostSubpath === approved.hostSubpath);
    if (!entry || resolve(entry.destRoot ?? '') !== hostPath || entry.closureSha256 !== plan.closureSha256 || !Array.isArray(entry.inventory)) {
      throw envError('environment_deps_receipt', 'dependency-preparation receipt does not record this exact destination closure/inventory', { hostSubpath: approved.hostSubpath });
    }
    const actual = await inventoryDependencyDestination(hostPath);
    if (!inventoriesEqual(entry.inventory, actual) || sha256Json(actual) !== entry.inventorySha256) {
      throw envError('environment_deps_inventory', 'current destination inventory does not equal the durable preparation inventory; extras or drift fail closed', { hostSubpath: approved.hostSubpath });
    }
  }
  return DEPENDENCY_MOUNTS;
}

function manifestDependencyPlans(deps) {
  const plans = deps?.plans;
  if (!plans || typeof plans !== 'object') {
    throw envError('environment_manifest_deps', 'manifest dependencies.plans missing');
  }
  const keys = Object.keys(plans).sort();
  if (keys.length !== EXPECTED_DEPS_PLAN_KEYS.length || !keys.every((k, i) => k === [...EXPECTED_DEPS_PLAN_KEYS].sort()[i])) {
    throw envError('environment_manifest_deps', 'manifest dependencies.plans must contain exactly the approved plan keys', { keys });
  }
  const found = {};
  for (const [key, plan] of Object.entries(plans)) {
    if (!plan || typeof plan !== 'object' || typeof plan.hostSubpath !== 'string') {
      throw envError('environment_manifest_deps', 'dependency plan missing hostSubpath', { key });
    }
    if (EXPECTED_PLAN_KEY_FOR[key] !== plan.hostSubpath) {
      throw envError('environment_manifest_deps', 'dependency plan key does not map to its approved hostSubpath', { key });
    }
    if (found[plan.hostSubpath]) throw envError('environment_manifest_deps', 'duplicate dependency plan hostSubpath', { hostSubpath: plan.hostSubpath });
    found[plan.hostSubpath] = plan;
  }
  for (const approved of DEPENDENCY_MOUNTS) {
    const plan = found[approved.hostSubpath];
    const expectedValues = EXPECTED_DEPS_PLAN_VALUES[approved.hostSubpath];
    if (!plan || plan.mountTarget !== approved.containerTarget || plan.readOnly !== true ||
        plan.sourceHostRoot !== EXPECTED_DEPS_SOURCE_ROOTS[approved.hostSubpath] ||
        typeof plan.destRoot !== 'string' || resolve(plan.destRoot) !== resolve(canonicalUnder(DEPS_ROOT, approved.hostSubpath)) ||
        plan.containerRoot !== expectedValues.containerRoot ||
        plan.packageCount !== expectedValues.packageCount || plan.fileCount !== expectedValues.fileCount ||
        plan.closureSha256 !== expectedValues.closureSha256 ||
        !Array.isArray(plan.seeds) || !Array.isArray(plan.seedPaths ?? []) ||
        !Array.isArray(plan.packageVersions)) {
      throw envError('environment_manifest_deps', 'dependency plan does not match the approved fixed values', { hostSubpath: approved.hostSubpath });
    }
  }
  return found;
}

async function buildExpectedDependencyInventory(plan, closure) {
  const srcBaseReal = closure.rootBase;
  const expected = new Map();
  const addDirChain = (rel) => {
    const segs = rel.split('/');
    for (let i = 1; i <= segs.length; i++) {
      const dir = segs.slice(0, i).join('/');
      if (!expected.has(dir)) expected.set(dir, { rel: dir, type: 'dir' });
    }
  };
  for (const pkgRel of closure.packageRels) addDirChain(pkgRel);
  for (const rel of Object.keys(closure.fileIndex)) {
    const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : null;
    if (parent) addDirChain(parent);
    expected.set(rel, { rel, type: 'file', sha256: closure.fileIndex[rel] });
  }
  for (const pkgRel of closure.packageRels) {
    const depLinks = closure.depLinksByPkg[pkgRel] ?? {};
    const nmIdx = pkgRel.lastIndexOf('/node_modules/');
    if (nmIdx < 0 && Object.keys(depLinks).length > 0) {
      throw envError('environment_deps_forbidden', 'closure package root is not under a node_modules dir', { pkgRel });
    }
    for (const depName of Object.keys(depLinks).sort()) {
      const rel = pkgRel.slice(0, nmIdx + '/node_modules'.length) + '/' + depName;
      if (depLinks[depName].startsWith(pkgRel + '/')) continue;
      addDirChain(rel.slice(0, rel.lastIndexOf('/')));
      expected.set(rel, { rel, type: 'link', target: depLinks[depName] });
    }
  }
  for (const meta of DEPS_METADATA_RELS) {
    const srcMeta = join(srcBaseReal, meta);
    const st = await lstat(srcMeta).catch(() => null);
    if (st && st.isFile() && !st.isSymbolicLink()) {
      const bytes = await readFile(srcMeta);
      const metaParent = meta.includes('/') ? meta.slice(0, meta.lastIndexOf('/')) : null;
      if (metaParent) addDirChain(metaParent);
      expected.set(meta, { rel: meta, type: 'file', sha256: sha256(bytes) });
    }
  }
  for (const seed of plan.seedPaths ?? []) {
    const rel = seed.name;
    const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : null;
    if (parent) addDirChain(parent);
    expected.set(rel, { rel, type: 'link', target: seed.rel });
  }
  return [...expected.values()].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

async function inventoryDependencyDestination(destRoot) {
  const destReal = await realpath(destRoot);
  const entries = new Map();
  const walk = async (dir) => {
    const names = (await readdir(dir)).sort();
    for (const name of names) {
      const p = join(dir, name);
      const info = await lstat(p);
      const rel = relative(destReal, p).split(sep).join('/');
      if (info.isDirectory() && !info.isSymbolicLink()) {
        entries.set(rel, { rel, type: 'dir' });
        await walk(p);
      } else if (info.isFile() && !info.isSymbolicLink()) {
        entries.set(rel, { rel, type: 'file', sha256: sha256(await readFile(p)) });
      } else if (info.isSymbolicLink()) {
        const resolvedTarget = await realpath(p).catch(() => null);
        if (resolvedTarget === null || (resolve(resolvedTarget) !== destReal && !resolve(resolvedTarget).startsWith(destReal + sep))) {
          throw envError('environment_deps_forbidden', 'destination link escapes the owned root', { rel });
        }
        const relTarget = relative(destReal, resolve(resolvedTarget)).split(sep).join('/');
        entries.set(rel, { rel, type: 'link', target: relTarget });
      } else {
        throw envError('environment_deps_forbidden', 'unsupported nonregular entry in destination', { rel });
      }
    }
  };
  await walk(destReal);
  return [...entries.values()].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

function inventoriesEqual(expected, actual) {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

export async function verifyDependencyClosure(plan, { root } = {}) {
  if (!plan || typeof plan !== 'object') throw envError('environment_manifest_deps', 'dependency plan missing');
  const rootResolved = resolve(root ?? plan.destRoot);
  const allowedRoots = [resolve(plan.sourceHostRoot ?? '\0'), resolve(plan.destRoot ?? '\0')];
  if (!allowedRoots.includes(rootResolved)) {
    throw envError('environment_deps_forbidden', 'closure root is not the fixed source or destination root', { root: rootResolved });
  }
  const rootStat = await lstat(rootResolved).catch(() => null);
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    return { status: 'unavailable', reason: 'dependency_root_missing' };
  }
  const rootBase = await realpath(rootResolved).catch(() => null);
  if (rootBase === null || rootBase !== rootResolved) {
    return { status: 'unavailable', reason: 'dependency_root_missing' };
  }
  if (typeof plan.containerRoot !== 'string' || !plan.containerRoot.startsWith('/')) {
    return { status: 'unavailable', reason: 'dependency_plan_invalid' };
  }
  if (!Array.isArray(plan.seeds) || !Array.isArray(plan.packageVersions)) {
    return { status: 'unavailable', reason: 'dependency_plan_invalid' };
  }
  const containerBase = plan.containerRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const canonicalRoot = (realDir) => {
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
    if (realDir === null || (realDir !== rootBase && !realDir.startsWith(rootBase + sep))) {
      return { status: 'unavailable', reason: 'dependency_link_or_missing:' + name };
    }
    let pkg;
    try { pkg = JSON.parse(await readFile(join(realDir, 'package.json'))); } catch { return { status: 'unavailable', reason: 'dependency_manifest_missing:' + name }; }
    if (roots.has(realDir)) return { status: 'ok' };
    roots.set(realDir, { name, version: pkg.version, root: realDir, depLinks: {} });
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
      const targetReal = await realpath(target);
      roots.get(realDir).depLinks[dep] = relative(rootBase, targetReal).split(sep).join('/');
    }
    return { status: 'ok' };
  };
  for (const seed of plan.seeds) {
    const seedResult = await resolvePackageAt(join(rootBase, seed), seed);
    if (seedResult.status !== 'ok') return seedResult;
  }
  for (const seed of plan.seedPaths ?? []) {
    if (typeof seed?.name !== 'string' || typeof seed?.rel !== 'string' || !seed.rel.startsWith('.pnpm/') || seed.rel.length > 512) {
      return { status: 'unavailable', reason: 'dependency_seed_path_invalid' };
    }
    const seedSegs = seed.rel.split('/');
    if (seedSegs.some((s) => !s || s === '..' || s === '.git' || s === '.runtime' || s === '.env' || /^\.env\./.test(s) || s === 'dist' || s === '__pycache__') ||
        seed.rel.includes('\\') || seed.rel.includes('\0') || seed.rel.startsWith('/') || /^[A-Za-z]:/.test(seed.rel)) {
      return { status: 'unavailable', reason: 'dependency_seed_path_invalid' };
    }
    const result = await resolvePackageAt(join(rootBase, seed.rel), seed.name);
    if (result.status !== 'ok') return result;
    let pkg;
    try { pkg = JSON.parse(await readFile(join(rootBase, seed.rel, 'package.json'))); } catch { return { status: 'unavailable', reason: 'dependency_manifest_missing:' + seed.name }; }
    if (pkg.name !== seed.name) return { status: 'unavailable', reason: 'dependency_seed_name_mismatch' };
  }
  let fileCount = 0;
  const packages = [];
  const realRoots = [];
  const fileIndex = {};
  const packageRels = [];
  const ordered = [...roots.values()].sort((a, b) => {
    const ca = canonicalRoot(a.root); const cb = canonicalRoot(b.root);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
  for (const entry of ordered) {
    const rows = [];
    const paths = [];
    const walk = async (dir) => {
      const names = (await readdir(dir)).sort();
      for (const name of names) {
        const path = join(dir, name);
        const info = await lstat(path);
        if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) {
          return { status: 'unavailable', reason: 'dependency_link:' + path };
        }
        if (info.isDirectory()) { const nested = await walk(path); if (nested) return nested; continue; }
        paths.push(path);
      }
      return null;
    };
    const failure = await walk(entry.root);
    if (failure) return failure;
    for (let offset = 0; offset < paths.length; offset += 32) {
      const batch = paths.slice(offset, offset + 32);
      rows.push(...await Promise.all(batch.map(async (path) => [path.slice(entry.root.length + 1).split(sep).join('/'), sha256(await readFile(path))])));
    }
    fileCount += rows.length;
    const pkgRel = relative(rootBase, entry.root).split(sep).join('/');
    for (const [fileRel, digest] of rows) {
      fileIndex[pkgRel === '' ? fileRel : pkgRel + '/' + fileRel] = digest;
    }
    realRoots.push(entry.root);
    packageRels.push(pkgRel);
    packages.push({ name: entry.name, version: entry.version, root: canonicalRoot(entry.root), files: rows.length, treeSha256: sha256(JSON.stringify(rows)) });
  }
  const closureSha256 = sha256(JSON.stringify(packages));
  if (packages.length !== plan.packageCount || fileCount !== plan.fileCount || closureSha256 !== plan.closureSha256) {
    return { status: 'unavailable', reason: 'dependency_closure_mismatch', packageCount: packages.length, fileCount, closureSha256, packages };
  }
  const versionRows = (rows) => rows.map((row) => JSON.stringify(row)).sort();
  if (JSON.stringify(versionRows(plan.packageVersions)) !== JSON.stringify(versionRows(packages.map((pkg) => [pkg.name, pkg.version])))) {
    return { status: 'unavailable', reason: 'dependency_version_mismatch' };
  }
  const depLinksByPkg = {};
  for (const entry of ordered) {
    depLinksByPkg[relative(rootBase, entry.root).split(sep).join('/')] = entry.depLinks;
  }
  return { status: 'ok', packageCount: packages.length, fileCount, closureSha256, packages, realRoots, packageRels, fileIndex, depLinksByPkg, rootBase };
}

export function runnerCreateArgv(manifest, { dbPassword } = {}) {
  if (typeof dbPassword !== 'string' || dbPassword.length < 16 || dbPassword.length > 128 || /[\s]/.test(dbPassword)) {
    throw envError('environment_host_arg', 'runner requires the same in-memory dbPassword as db create; it is never persisted');
  }
  const argv = [
    'create', '--name', RUNNER_NAME,
    '--network', NETWORK_NAME,
    '--memory', String(RUNNER_LIMITS.memoryBytes), '--cpus', String(RUNNER_LIMITS.cpus),
    '--pids-limit', String(RUNNER_LIMITS.pids), '--user', EXPECTED_RUNNER_RUNTIME_USER,
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--read-only',
    ...RUNNER_TMPFS.flatMap((t) => ['--tmpfs', t]),
    ...DEPENDENCY_MOUNTS.flatMap((mm) => dependencyMountArgv(mm)),
    '-e', `HOME=/home/box`,
    '-e', 'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
    '-e', `BOX_DELEGATION_DATABASE_URL=${manifest.database.url}`,
    '-e', `BOX_TEST_DATABASE_URL=${manifest.database.url}`,
    '-e', `BOX_TEST_RUN_ID=${manifest.database.runId ?? 'w005-d12-delegation'}`,
    '-e', `PGPASSWORD=${dbPassword}`,
    '-e', `BOX_DELEGATION_BASELINE_ROOT=${manifest.stage.fixtureBaseline.workdir}`,
    '-e', `BOX_DELEGATION_BASELINE_JSON=${manifest.stage.fixtureBaseline.out}`,
    RUNNER_IMAGE,
    'sleep', 'infinity'
  ];
  return assertFixedArgv(argv);
}

export function stagePipeArgv() {
  return assertFixedArgv(['exec', '-i', RUNNER_NAME, 'sh', '-c', 'tar -xf - -C /stage']);
}

export function runnerStartArgv() {
  return assertFixedArgv(['start', RUNNER_NAME]);
}

export function dbStartArgv() {
  return assertFixedArgv(['start', DB_NAME]);
}

export function runnerEntryArgv(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= ALLOWED_COMMANDS.length) {
    throw envError('environment_host_arg', 'command index out of range', { index });
  }
  return assertFixedArgv([
    'exec', '--workdir', '/stage', RUNNER_NAME,
    'node', RUNNER_SUPERVISOR_PATH, 'supervise', String(i)
  ]);
}

export function runnerBatchArgv() {
  return assertFixedArgv([
    'exec', '--workdir', '/stage', RUNNER_NAME,
    'node', RUNNER_SUPERVISOR_PATH, 'batch'
  ]);
}

export function runnerResultArgv(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= ALLOWED_COMMANDS.length) {
    throw envError('environment_host_arg', 'command index out of range', { index });
  }
  return assertFixedArgv([
    'exec', '--workdir', '/stage', RUNNER_NAME,
    'node', RUNNER_SUPERVISOR_PATH, 'result', String(i)
  ]);
}

export function commandRecordDescriptor(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= ALLOWED_COMMANDS.length) {
    throw envError('environment_host_arg', 'command index out of range', { index });
  }
  const command = ALLOWED_COMMANDS[i];
  const commandHash = sha256Json({ index: i, command }).slice(0, 24);
  return { index: i, command, commandHash, recordRel: `command-${i}-${commandHash}.json` };
}

export function dbAccountCheckArgv() {
  return assertFixedArgv(['exec', DB_NAME, 'getent', 'passwd', '999']);
}

export function runnerUserCheckArgv() {
  return assertFixedArgv(['exec', RUNNER_NAME, 'id', '-u']);
}

export function imageIdVerifyArgv(imageId) {
  if (imageId !== RUNNER_IMAGE && imageId !== DB_IMAGE) {
    throw envError('environment_host_arg', 'image id is not an approved pin', { imageId });
  }
  return assertFixedArgv(['image', 'inspect', imageId, '--format', '{{.Id}}']);
}

const INSPECT_FMT_LIMITS = '{{.State.Status}}|{{.Config.User}}|{{.HostConfig.Memory}}|{{.HostConfig.PidsLimit}}';
const INSPECT_FMT_FULL = '{{.Id}}|{{.Name}}|{{.State.Status}}|{{.Image}}|{{.Config.Image}}|{{.Config.User}}|{{.HostConfig.Memory}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NetworkMode}}';
const INSPECT_FMT_NETWORKS = '{{json .NetworkSettings.Networks}}';
const EXPECTED_INSPECT_FORMATS = Object.freeze(new Set([INSPECT_FMT_LIMITS, INSPECT_FMT_FULL, INSPECT_FMT_NETWORKS]));

export function containerInspectArgv(name, fmt) {
  const allowed = { [RUNNER_NAME]: true, [DB_NAME]: true, [NETWORK_NAME]: true };
  if (!allowed[name]) throw envError('environment_host_arg', 'unknown resource name', { name });
  if (!EXPECTED_INSPECT_FORMATS.has(fmt)) throw envError('environment_host_arg', 'bad inspect format');
  return assertFixedArgv(['inspect', '--format', fmt, name]);
}

export function networkIdArgv() {
  return assertFixedArgv(['network', 'inspect', NETWORK_NAME, '--format', '{{.Id}}|{{.Internal}}']);
}

export async function environmentPlan(manifest) {
  const m = manifest ?? await loadEnvironmentManifest();
  const runner = manifestContainerEntry(m, RUNNER_NAME);
  const db = manifestContainerEntry(m, DB_NAME);
  manifestDatabaseEntry(m);
  manifestStageBaseline(m);
  return {
    phases: [
      { name: 'plan', argv: [], note: 'manifest schema/pins validation only; no mutation' },
      { name: 'ledger', argv: [], note: 'redacted resource ledger created before any mutation' },
      { name: 'deps', argv: [], note: 'controller(deps) is the only host path that may create/populate the owned DEPS_ROOT, invoked only after explicit root release' },
      { name: 'create', argv: [imageIdVerifyArgv(runner.image.id), imageIdVerifyArgv(db.image.id), networkCreateArgv(), dbCreateArgv(m, 'REDACTED-SECRET-AT-CREATE'), runnerCreateArgv(m, { dbPassword: 'REDACTED-SECRET-AT-CREATE' })] },
      { name: 'start', argv: [dbStartArgv(), runnerStartArgv()] },
      { name: 'verify', argv: [dbAccountCheckArgv(), runnerUserCheckArgv(), networkIdArgv(), containerInspectArgv(RUNNER_NAME, INSPECT_FMT_LIMITS), containerInspectArgv(DB_NAME, INSPECT_FMT_LIMITS)], note: 'fail-closed: uid 999 account, runtime user, limits and internal network must all verify before readiness' },
      { name: 'stage', argv: [stagePipeArgv()], note: 'host tar of the hash-verified fixed STAGE_ROOT inventory is piped to this fixed docker exec argv (read-only rootfs blocks docker cp; /stage tmpfs is writable by uid 1000)' },
      { name: 'supervise', argv: [runnerBatchArgv()], note: 'host route is a single fixed docker exec of the inner batch mode; inner superviseBatch enforces order/idle/cap and writes durable per-command records; host then retrieves each record via the fixed result route (runnerResultArgv) and treats docker exec status as transport evidence only. runnerEntryArgv remains the fixed per-command route for reconciled single-index resume.' },
      { name: 'final_verify', argv: [containerInspectArgv(RUNNER_NAME, INSPECT_FMT_LIMITS), containerInspectArgv(DB_NAME, INSPECT_FMT_LIMITS), networkIdArgv()] }
    ]
  };
}

function manifestContainerEntry(manifest, name) {
  const entry = manifest?.containers?.[name];
  if (!entry || typeof entry !== 'object' ||
      !entry.image || typeof entry.image !== 'object' || typeof entry.image.id !== 'string' ||
      !entry.config || typeof entry.config !== 'object') {
    throw envError('environment_manifest_schema', 'manifest container entry missing or malformed', { name });
  }
  for (const key of ['memoryBytes', 'cpus', 'pidsLimit']) {
    if (typeof entry.config[key] !== 'number' || !Number.isFinite(entry.config[key])) {
      throw envError('environment_manifest_schema', 'manifest container limit missing or non-numeric', { name, key });
    }
  }
  if (typeof entry.config.user !== 'string') {
    throw envError('environment_manifest_schema', 'manifest container runtime user missing', { name });
  }
  return entry;
}

function manifestDatabaseEntry(manifest) {
  const dbMeta = manifest?.database;
  if (!dbMeta || typeof dbMeta !== 'object' ||
      typeof dbMeta.hostname !== 'string' || typeof dbMeta.username !== 'string' ||
      typeof dbMeta.url !== 'string' || typeof dbMeta.runId !== 'string') {
    throw envError('environment_manifest_schema', 'manifest database block missing hostname/username/url/runId');
  }
  if (dbMeta.username !== EXPECTED_DB_USERNAME || dbMeta.url !== EXPECTED_DB_URL || dbMeta.runId !== EXPECTED_DB_RUN_ID) {
    throw envError('environment_manifest_database', 'manifest database username/url/runId do not match approved pinned values');
  }
  if (!Array.isArray(dbMeta.runPrefixes) || dbMeta.runPrefixes.length !== 2 ||
      dbMeta.runPrefixes[0] !== RUN_DB_PREFIX || dbMeta.runPrefixes[1] !== LEGACY_RUN_DB_PREFIX ||
      dbMeta.maxRunPrefixedDatabases !== RUN_DB_LIMIT) {
    throw envError('environment_manifest_database', 'manifest database run prefixes or cap do not match approved constants');
  }
  return dbMeta;
}

function manifestStageBaseline(manifest) {
  const fb = manifest?.stage?.fixtureBaseline;
  if (!fb || typeof fb !== 'object' || typeof fb.workdir !== 'string' || typeof fb.out !== 'string') {
    throw envError('environment_manifest_schema', 'manifest stage.fixtureBaseline workdir/out missing');
  }
  return fb;
}

export async function loadEnvironmentManifest(path = MANIFEST_PATH) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const runner = manifestContainerEntry(manifest, RUNNER_NAME);
  const db = manifestContainerEntry(manifest, DB_NAME);
  const dbMeta = manifestDatabaseEntry(manifest);
  if (runner.image.id !== RUNNER_IMAGE || db.image.id !== DB_IMAGE) {
    throw envError('environment_manifest_image', 'manifest image id does not match approved local image ID');
  }
  if (runner.config.memoryBytes !== RUNNER_LIMITS.memoryBytes ||
      runner.config.cpus !== RUNNER_LIMITS.cpus ||
      runner.config.pidsLimit !== RUNNER_LIMITS.pids ||
      db.config.memoryBytes !== DB_LIMITS.memoryBytes ||
      db.config.cpus !== DB_LIMITS.cpus ||
      db.config.pidsLimit !== DB_LIMITS.pids) {
    throw envError('environment_manifest_limits', 'manifest resource limits do not match approved values');
  }
  if (runner.config.user !== EXPECTED_RUNNER_RUNTIME_USER || db.config.user !== '999:999') {
    throw envError('environment_manifest_limits', 'manifest container runtime user does not match approved uid requirement');
  }
  if (db.config.networkAlias !== DB_ALIAS || dbMeta.hostname !== DB_ALIAS) {
    throw envError('environment_manifest_alias', 'manifest alias mismatch');
  }
  return manifest;
}

async function runCapture(cmd, argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
      else reject(Object.assign(new Error(`${cmd} exit ${code}`), { exit: code, signal, stderr: Buffer.concat(err).toString('utf8'), stdout: Buffer.concat(out).toString('utf8') }));
    });
  });
}

async function runPiped(cmd, argv, inputBytes) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
      else reject(Object.assign(new Error(`${cmd} exit ${code}`), { exit: code, signal, stderr: Buffer.concat(err).toString('utf8'), stdout: Buffer.concat(out).toString('utf8') }));
    });
    child.stdin.end(inputBytes);
  });
}

function spawnToFiles(cmd, argv, { cwd, stdoutPath, stderrPath }) {
  const stdoutStream = createWriteStream(stdoutPath);
  const stderrStream = createWriteStream(stderrPath);
  const child = spawn(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.pipe(stdoutStream);
  child.stderr.pipe(stderrStream);
  const state = { exited: false, exitCode: null, signal: null, outClosed: false, errClosed: false, failed: null };
  const maybeDone = (resolve) => {
    if (state.exited && state.outClosed && state.errClosed) {
      resolve({ exitCode: state.exitCode, signal: state.signal, pid: child.pid, pgid: child.pid });
    }
  };
  const promise = new Promise((resolve, reject) => {
    const closeWait = setTimeout(() => {
      if (!(state.outClosed && state.errClosed)) {
        stdoutStream.destroy();
        stderrStream.destroy();
        state.outClosed = true;
        state.errClosed = true;
        state.signal = state.signal ?? 'CLOSE_TIMEOUT';
        maybeDone(resolve);
      }
    }, SIGKILL_DRAIN_MS + SIGTERM_GRACE_MS);
    const finish = () => { maybeDone(resolve); };
    child.on('error', (e) => { clearTimeout(closeWait); stdoutStream.destroy(); stderrStream.destroy(); reject(e); });
    child.on('exit', (code, signal) => {
      state.exited = true; state.exitCode = code; state.signal = signal;
      stdoutStream.end(); stderrStream.end();
      finish();
    });
    stdoutStream.on('close', () => { state.outClosed = true; finish(); });
    stderrStream.on('close', () => { state.errClosed = true; finish(); });
    promise.finally(() => clearTimeout(closeWait));
  });
  return { child, promise, stdoutStream, stderrStream };
}

export async function superviseInner(index, receiptRoot = RUNNER_RECEIPT_DIR) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= ALLOWED_COMMANDS.length) {
    throw envError('environment_host_arg', 'supervise index out of range', { index });
  }
  if (!manifestAllowedReceiptDirs().includes(resolve(receiptRoot)) && receiptRoot !== RUNNER_RECEIPT_DIR) {
    throw envError('environment_stage_forbidden', 'receipt root is not a manifest-bound owned path', { receiptRoot });
  }
  await ensureOwnedDir(resolve(receiptRoot));
  const command = ALLOWED_COMMANDS[i];
  const cmdHash = sha256Json({ index: i, command }).slice(0, 24);
  const receipt = resolve(receiptRoot, `command-${i}-${cmdHash}.json`);
  const outPath = resolve(receiptRoot, `command-${i}-${cmdHash}.stdout`);
  const errPath = resolve(receiptRoot, `command-${i}-${cmdHash}.stderr`);

  const started = { index: i, commandHash: cmdHash, state: 'started', startedAt: new Date().toISOString() };
  await appendFile(resolve(receiptRoot, 'ledger.ndjson'), JSON.stringify(redactSecrets(started)) + '\n', 'utf8');

  const spawnAt = Date.now();
  const { child, promise } = spawnToFiles('node', argvSplit(command), { cwd: '/stage', stdoutPath: outPath, stderrPath: errPath });
  const timeout = setTimeout(() => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, SIGTERM_GRACE_MS);
  }, COMMAND_TIMEOUT_MS);

  let exitInfo;
  try {
    exitInfo = await promise;
    const grace = new Promise((r) => setTimeout(r, SIGKILL_DRAIN_MS));
    await grace;
  } finally {
    clearTimeout(timeout);
  }
  exitInfo.durationMs = Date.now() - spawnAt;
  const remaining = await descendantsAlive(exitInfo.pgid).catch(() => null);
  const record = {
    index: i,
    commandHash: cmdHash,
    exitCode: exitInfo.exitCode,
    signal: exitInfo.signal ?? null,
    durationMs: exitInfo.durationMs,
    stdoutPath: outPath,
    stderrPath: errPath,
    stdoutSha256: await fileSha256(outPath),
    stderrSha256: await fileSha256(errPath),
    descendantsRemaining: remaining,
    state: remaining === null ? 'unknown' : remaining.length === 0 ? 'completed' : 'interrupted',
    finishedAt: new Date().toISOString()
  };
  const tmp = receipt + '.' + randomBytes(6).toString('hex') + '.tmp';
  await writeFile(tmp, JSON.stringify(redactSecrets(record)), { flag: 'wx' });
  await rename(tmp, receipt);
  return record;
}

async function fileSha256(path) {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

async function descendantsAlive(pgid) {
  const out = await runCapture('ps', ['-eo', 'pid=,pgid=']);
  return out.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((l) => Number(l.split(/\s+/)[1]) === pgid)
    .map((l) => Number(l.split(/\s+/)[0]));
}

function argvSplit(command) {
  const parts = command.split(' ');
  const [bin, ...args] = parts;
  if (bin !== 'node') throw envError('environment_host_arg', 'supervised command must start with node');
  return args;
}

export async function superviseBatch(indices, { leaseOwner, receiptRoot = RUNNER_RECEIPT_DIR, countRunDatabases }) {
  const results = [];
  for (const index of indices) {
    const i = Number(index);
    const ledger = await readFile(resolve(receiptRoot, 'ledger.ndjson'), 'utf8').catch(() => '');
    if (ledger.split('\n').some((l) => l.includes(`"index":${i}`) && l.includes('"state":"interrupted"'))) {
      throw envError('environment_supervisor_blocked', `command ${i} was interrupted; reconcile before replay`, { index: i });
    }
    if (LEGACY_AUTH_COMMAND_INDICES.includes(i)) {
      const prior = results.find((r) => LEGACY_AUTH_COMMAND_INDICES.includes(r.index));
      if (prior && Date.now() - new Date(prior.finishedAt).getTime() < LEGACY_AUTH_IDLE_MS) {
        await new Promise((r) => setTimeout(r, LEGACY_AUTH_IDLE_MS));
      }
    }
    if (typeof countRunDatabases === 'function') {
      const count = await countRunDatabases();
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count >= RUN_DB_LIMIT) {
        throw envError('environment_db_budget', 'run database budget exhausted or unknown', { index: i, count });
      }
    }
    const record = await superviseInner(i, receiptRoot);
    results.push(record);
    if (typeof countRunDatabases === 'function') {
      const after = await countRunDatabases();
      record.databasesAfter = after;
      if (typeof after !== 'number' || !Number.isInteger(after) || after < 0) record.state = 'unknown';
      const recPath = resolve(receiptRoot, `command-${i}-${record.commandHash}.json`);
      const tmp = recPath + '.' + randomBytes(6).toString('hex') + '.tmp';
      await writeFile(tmp, JSON.stringify(redactSecrets(record)), { flag: 'wx' });
      await rename(tmp, recPath);
    }
    if (record.state !== 'completed' || record.exitCode !== 0) {
      break;
    }
  }
  return results;
}

export async function controller(mode, manifestPath = MANIFEST_PATH, options = {}) {
  if (!ALLOWED_MODES.includes(mode)) {
    throw envError('environment_host_arg', 'unknown controller mode', { mode });
  }
  const m = await loadEnvironmentManifest(manifestPath);
  const ledgerPath = resolve(WORKER_RECEIPT_DIR, 'environment-ledger.json');
  if (mode === 'plan') return environmentPlan(m);
  if (mode === 'ledger') {
    const exists = await stat(ledgerPath).catch(() => null);
    if (!exists) {
      await atomicWriteJson(WORKER_RECEIPT_DIR, 'environment-ledger.json', { createdAt: new Date().toISOString(), resources: [], redacted: true });
    }
    return { path: ledgerPath };
  }
  if (mode === 'deps') {
    const ledgerExists = await stat(ledgerPath).catch(() => null);
    if (!ledgerExists || !ledgerExists.isFile()) {
      throw envError('environment_ledger_required', 'dependency preparation requires the resource ledger to exist first (plan -> ledger -> deps ordering)');
    }
    const plans = manifestDependencyPlans(m.dependencies);
    const receipt = { kind: 'dependency_preparation', manifestSha256: sha256Json(m.dependencies.plans), depsRoot: resolve(DEPS_ROOT), preparedAt: new Date().toISOString(), mounts: [] };
    for (const approved of DEPENDENCY_MOUNTS) {
      const plan = plans[approved.hostSubpath];
      const source = await verifyDependencyClosure(plan, { root: plan.sourceHostRoot });
      if (source.status !== 'ok') {
        throw envError('environment_deps_closure', 'source dependency closure does not equal the reviewed manifest closure', { hostSubpath: approved.hostSubpath, reason: source.reason });
      }
      const srcBase = resolve(plan.sourceHostRoot);
      const srcBaseReal = await realpath(srcBase);
      const expected = await buildExpectedDependencyInventory(plan, source);
      const expectedSha256 = sha256Json(expected);
      const dest = resolve(plan.destRoot);
      const existing = await lstat(dest).catch(() => null);
      if (existing) {
        if (!existing.isDirectory() || existing.isSymbolicLink()) {
          throw envError('environment_deps_collision', 'owned destination exists and is not a real directory; refusing to reconcile or delete', { hostSubpath: approved.hostSubpath });
        }
        const already = await verifyDependencyClosure(plan, { root: dest });
        const actual = await inventoryDependencyDestination(dest).catch(() => null);
        if (already.status !== 'ok' || actual === null || !inventoriesEqual(expected, actual)) {
          throw envError('environment_deps_collision', 'owned destination does not byte-for-byte equal the expected minimal inventory; refusing to reconcile or delete', { hostSubpath: approved.hostSubpath, reason: already.status !== 'ok' ? already.reason : 'inventory_mismatch' });
        }
        receipt.mounts.push({ hostSubpath: approved.hostSubpath, state: 'already-prepared', sourceRoot: srcBase, sourceRootReal: srcBaseReal, destRoot: dest, packageCount: already.packageCount, fileCount: already.fileCount, closureSha256: already.closureSha256, expectedInventorySha256: expectedSha256, inventorySha256: sha256Json(actual), inventory: actual });
        continue;
      }
      await ensureOwnedDir(DEPS_ROOT);
      await mkdir(dest);
      const destReal = await realpath(dest);
      for (const entry of expected) {
        if (entry.type !== 'dir') continue;
        const dstPath = join(dest, ...entry.rel.split('/'));
        const st = await lstat(dstPath).catch(() => null);
        if (st === null) await mkdir(dstPath);
        else if (!st.isDirectory() || st.isSymbolicLink()) throw envError('environment_deps_forbidden', 'destination ancestor is not a real directory', { rel: entry.rel });
      }
      for (const entry of expected) {
        if (entry.type !== 'file') continue;
        const dstPath = join(dest, ...entry.rel.split('/'));
        const bytes = await readFile(join(srcBaseReal, ...entry.rel.split('/')));
        await writeFile(dstPath, bytes, { flag: 'wx' });
      }
      for (const entry of expected) {
        if (entry.type !== 'link') continue;
        const dstPath = join(dest, ...entry.rel.split('/'));
        const dstRealTarget = resolve(dest, ...entry.target.split('/'));
        const targetStat = await lstat(dstRealTarget).catch(() => null);
        if (!targetStat || !targetStat.isDirectory() || targetStat.isSymbolicLink() || (dstRealTarget !== destReal && !dstRealTarget.startsWith(destReal + sep))) {
          throw envError('environment_deps_forbidden', 'dependency link target is not a real directory inside the owned destination', { rel: entry.rel });
        }
        await symlink(dstRealTarget, dstPath, 'junction');
      }
      const destCheck = await verifyDependencyClosure(plan, { root: dest });
      if (destCheck.status !== 'ok') {
        throw envError('environment_deps_closure', 'copied destination closure does not equal the reviewed closure', { hostSubpath: approved.hostSubpath, reason: destCheck.reason });
      }
      const actual = await inventoryDependencyDestination(dest);
      if (!inventoriesEqual(expected, actual)) {
        throw envError('environment_deps_closure', 'copied destination inventory does not equal the expected minimal inventory', { hostSubpath: approved.hostSubpath });
      }
      receipt.mounts.push({
        hostSubpath: approved.hostSubpath,
        state: 'prepared',
        sourceRoot: srcBase,
        sourceRootReal: srcBaseReal,
        destRoot: dest,
        packageCount: destCheck.packageCount,
        fileCount: destCheck.fileCount,
        closureSha256: destCheck.closureSha256,
        expectedInventorySha256: expectedSha256,
        inventorySha256: sha256Json(actual),
        inventory: actual
      });
    }
    await atomicWriteJson(WORKER_RECEIPT_DIR, 'dependency-preparation.json', redactSecrets(receipt));
    return receipt;
  }
  if (mode === 'create') {
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8').catch(() => 'null')) ?? { resources: [] };
    await verifyDependencyMounts(m);
    for (const pin of [RUNNER_IMAGE, DB_IMAGE]) {
      let returned;
      try {
        const r = await runCapture('docker', imageIdVerifyArgv(pin));
        returned = r.stdout.trim();
      } catch (err) {
        throw envError('environment_image_pin_unverified', 'inspect of an approved bare local image id failed; create aborted', { image: pin, exit: err.exit ?? null });
      }
      if (returned !== pin) {
        throw envError('environment_image_pin_unverified', 'inspect .Id does not literally equal the approved pinned image id; create aborted', { image: pin, returned });
      }
    }
    const steps = [
      { name: 'network', argv: networkCreateArgv() },
      { name: 'db', argv: dbCreateArgv(m, options.dbPassword) },
      { name: 'runner', argv: runnerCreateArgv(m, { dbPassword: options.dbPassword }) }
    ];
    for (const s of steps) {
      const state = await inspectResource(s.argv.find((t) => t.startsWith('w005')) ?? s.name);
      if (state.present) {
        throw envError('environment_resource_collision', 'a w005-* resource already exists; creation fails closed on name collision and never reuses or reconciles it without separately reviewed authority', { name: s.name, resource: state });
      }
      const out = await runCapture('docker', s.argv);
      const id = out.stdout.trim();
      const redactedArgv = s.argv.map((t) => /PASSWORD|PGPASSWORD|SECRET/.test(t) ? 'sha256:' + sha256Json(t).slice(0, 16) : t);
      ledger.resources.push({ name: s.name, id: id.slice(0, 16), argvHash: sha256Json(redactedArgv).slice(0, 16), state: 'created' });
    }
    await atomicWriteJson(WORKER_RECEIPT_DIR, 'environment-ledger.json', redactSecrets(ledger));
    return ledger;
  }
  if (mode === 'start') {
    await runCapture('docker', dbStartArgv());
    await runCapture('docker', runnerStartArgv());
    return { started: [DB_NAME, RUNNER_NAME] };
  }
  if (mode === 'verify') {
    const CONTAINER_FMT = INSPECT_FMT_FULL;
    const checks = {
      dbUser: await runCapture('docker', dbAccountCheckArgv()).then((r) => r.stdout.trim()).catch((e) => { throw envError('environment_db_account_unverified', 'uid 999 not resolvable in DB container', { exit: e.exit }); }),
      runnerUser: await runCapture('docker', runnerUserCheckArgv()).then((r) => r.stdout.trim()),
      network: await runCapture('docker', networkIdArgv()).then((r) => r.stdout.trim()),
      runner: await runCapture('docker', containerInspectArgv(RUNNER_NAME, CONTAINER_FMT)).then((r) => r.stdout.trim()),
      db: await runCapture('docker', containerInspectArgv(DB_NAME, CONTAINER_FMT)).then((r) => r.stdout.trim()),
      dbNetworks: await runCapture('docker', containerInspectArgv(DB_NAME, INSPECT_FMT_NETWORKS)).then((r) => r.stdout.trim())
    };
    const expectContainer = (raw, name, image, limits, user) => {
      const parts = raw.split('|');
      if (parts.length !== 10) throw envError('environment_verify_mismatch', 'container inspect output malformed or unknown', { name });
      const [id, cname, status, imgResolved, imgRef, cfgUser, mem, nanoCpus, pids, netMode] = parts;
      if (!/^[a-f0-9]{64}$/.test(id)) throw envError('environment_verify_mismatch', 'container id not inspectable', { name });
      if (cname !== '/' + name) throw envError('environment_verify_mismatch', 'container name mismatch', { name, returned: cname });
      if (status !== 'running') throw envError('environment_verify_mismatch', 'container state is not running', { name, status });
      if (imgResolved !== image || imgRef !== image) throw envError('environment_verify_mismatch', 'container image does not equal the approved pinned id', { name });
      if (cfgUser !== user) throw envError('environment_verify_mismatch', 'container runtime user mismatch', { name, user: cfgUser });
      if (mem !== String(limits.memoryBytes) || nanoCpus !== String(limits.cpus * 1000000000) || pids !== String(limits.pids)) {
        throw envError('environment_verify_mismatch', 'container memory/cpu/pid limits do not equal approved values', { name });
      }
      if (netMode !== NETWORK_NAME) throw envError('environment_verify_mismatch', 'container is not attached to the owned internal network', { name, netMode });
      return { id, name: cname };
    };
    const runnerInfo = expectContainer(checks.runner, RUNNER_NAME, RUNNER_IMAGE, RUNNER_LIMITS, EXPECTED_RUNNER_RUNTIME_USER);
    const dbInfo = expectContainer(checks.db, DB_NAME, DB_IMAGE, DB_LIMITS, '999:999');
    const [netId, netInternal] = checks.network.split('|');
    if (!/^[a-f0-9]{64}$/.test(netId ?? '') || netInternal !== 'true') {
      throw envError('environment_verify_mismatch', 'network id not inspectable or network is not internal', { network: checks.network });
    }
    let dbNets;
    try {
      dbNets = JSON.parse(checks.dbNetworks);
    } catch {
      throw envError('environment_verify_mismatch', 'db container network settings not inspectable');
    }
    const dbNetEntry = dbNets?.[NETWORK_NAME];
    if (!dbNetEntry || typeof dbNetEntry !== 'object' || !Array.isArray(dbNetEntry.Aliases) || !dbNetEntry.Aliases.includes(DB_ALIAS)) {
      throw envError('environment_verify_mismatch', 'db container is missing the approved alias on the owned internal network');
    }
    if (!/^[^\s:]+:[^:]*:999:/.test(checks.dbUser)) {
      throw envError('environment_db_account_unverified', 'getent passwd 999 output does not confirm a uid 999 account in the DB container');
    }
    if (checks.runnerUser !== '1000') throw envError('environment_runner_user', 'runner runtime user is not 1000');
    return redactSecrets({ ...checks, runnerId: runnerInfo.id, dbId: dbInfo.id, networkId: netId });
  }
  if (mode === 'stage') {
    const roots = m.stage?.sourceStaging?.roots;
    if (!Array.isArray(roots) || roots.length === 0 || roots.length > 64 || new Set(roots).size !== roots.length) {
      throw envError('environment_manifest_stage', 'manifest stage.sourceStaging.roots missing or invalid; refuse to stage');
    }
    const sourceRoot = resolve(dirname(SELF_PATH), '..', '..', '..');
    const sourceRootReal = await realpath(sourceRoot);
    const files = [];
    const walk = async (rel) => {
      const segments = assertStageableRel(rel);
      const abs = join(sourceRootReal, ...segments);
      const st = await lstat(abs);
      if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) {
        throw envError('environment_stage_forbidden', 'inventory entry is not a regular file or directory', { rel });
      }
      if (st.isFile()) {
        files.push({ source: abs, rel });
        return;
      }
      const entries = (await readdir(abs)).sort();
      for (const entry of entries) {
        const childRel = rel + '/' + entry;
        const last = entry;
        if (!last || FORBIDDEN_STAGE_SEGMENTS.has(last) || /^\.env/.test(last)) continue;
        await walk(childRel);
      }
    };
    for (const root of roots) await walk(root);
    const results = await stageFiles(STAGE_ROOT, files);
    const pipeArgv = stagePipeArgv();
    const tarPath = resolve(STAGE_ROOT, '..', 'w005-d12-stage-payload.tar');
    await runCapture('tar', ['-cf', tarPath, '-C', STAGE_ROOT, '.']);
    const tarBytes = await readFile(tarPath);
    const piped = await runPiped('docker', pipeArgv, tarBytes);
    const transport = {
      argvHash: sha256Json(pipeArgv).slice(0, 16),
      tarSha256: createHash('sha256').update(tarBytes).digest('hex'),
      tarBytes: tarBytes.length,
      stdoutSha256: createHash('sha256').update(piped.stdout).digest('hex'),
      stderrSha256: createHash('sha256').update(piped.stderr).digest('hex'),
      transportOnly: true
    };
    await ensureOwnedDir(STAGE_RECEIPT_DIR);
    await atomicWriteJson(STAGE_RECEIPT_DIR, 'stage-transport.json', redactSecrets({ stagedCount: results.length, staged: results, transport, finishedAt: new Date().toISOString() }));
    return { staged: results, count: results.length, root: STAGE_ROOT, copyTransport: transport };
  }
  if (mode === 'supervise') {
    let batchError = null;
    try {
      await runCapture('docker', runnerBatchArgv());
    } catch (err) {
      batchError = { exit: err.exit ?? null, signal: err.signal ?? null, stderr: String(err.stderr ?? '').slice(0, 400) };
    }
    const records = [];
    let firstFailure = null;
    for (let i = 0; i < ALLOWED_COMMANDS.length; i++) {
      const expected = commandRecordDescriptor(i);
      let record = null;
      try {
        const out = await runCapture('docker', runnerResultArgv(i));
        record = JSON.parse(out.stdout.trim().split('\n').pop());
      } catch (err) {
        firstFailure = firstFailure ?? { index: i, commandHash: expected.commandHash, error: 'environment_inner_record_unavailable', exit: err.exit ?? null };
        records.push({ index: i, commandHash: expected.commandHash, state: 'unknown', record: null });
        continue;
      }
      const ok = record && record.index === i && record.commandHash === expected.commandHash;
      if (!ok) {
        firstFailure = firstFailure ?? { index: i, commandHash: expected.commandHash, error: 'environment_inner_record_mismatch' };
        records.push({ index: i, commandHash: expected.commandHash, state: 'unknown', record: null });
        continue;
      }
      records.push(record);
      if (record.state !== 'completed' || record.exitCode !== 0) {
        firstFailure = firstFailure ?? { index: i, commandHash: expected.commandHash, error: 'environment_inner_record_incomplete', state: record.state, exitCode: record.exitCode ?? null };
      }
    }
    if (batchError || firstFailure) {
      throw envError('environment_supervision_failed', 'host-side batch transport or inner durable record validation failed', { batchError, firstFailure, completed: records.filter((r) => r && r.state === 'completed').length });
    }
    return { records };
  }
}

const SELF_PATH = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:\/)/, '$1');

async function innerCountRunDatabases() {
  const url = process.env.BOX_DELEGATION_DATABASE_URL;
  if (typeof url !== 'string' || !url.startsWith('postgresql://')) return 'unknown';
  const sql = "SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE 'w002\\_b11\\_r4run\\_%' ESCAPE '\\' OR datname LIKE 'w005\\_d12\\_run\\_%' ESCAPE '\\'";
  let pool;
  try {
    const require = createRequire('/stage/services/private-api/package.json');
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 5000 });
    const res = await pool.query(sql);
    const n = res?.rows?.[0]?.n;
    return Number.isInteger(n) && n >= 0 ? n : 'unknown';
  } catch {
    return 'unknown';
  } finally {
    try { await pool?.end(); } catch {}
  }
}

export async function main(argv) {
  const args = argv ?? process.argv.slice(2);
  if (args.length === 1 && args[0] === 'batch') {
    const records = await superviseBatch(ALLOWED_COMMANDS.map((_, i) => i), {
      leaseOwner: 'w005-d12-delegation-runner',
      receiptRoot: RUNNER_RECEIPT_DIR,
      countRunDatabases: innerCountRunDatabases
    });
    const ok = records.every((r) => r.state === 'completed' && r.exitCode === 0);
    process.stdout.write(JSON.stringify({ completed: ok, count: records.length }) + '\n');
    return { state: ok ? 'completed' : 'interrupted', records };
  }
  if (args.length === 2 && args[0] === 'result' && /^\d+$/.test(args[1])) {
    const d = commandRecordDescriptor(Number(args[1]));
    const target = await assertReceiptTarget(RUNNER_RECEIPT_DIR, d.recordRel);
    const record = JSON.parse(await readFile(target, 'utf8'));
    if (!record || record.index !== d.index || record.commandHash !== d.commandHash) {
      throw envError('environment_inner_record_mismatch', 'durable record does not match fixed index/hash', { index: d.index });
    }
    const redacted = redactSecrets(record);
    process.stdout.write(JSON.stringify(redacted) + '\n');
    return redacted;
  }
  if (args.length === 2 && args[0] === 'supervise' && /^\d+$/.test(args[1])) {
    const index = Number(args[1]);
    if (!Number.isInteger(index) || index < 0 || index >= ALLOWED_COMMANDS.length) {
      throw envError('environment_host_arg', 'supervise index out of range', { index: args[1] });
    }
    const record = await superviseInner(index, RUNNER_RECEIPT_DIR);
    process.stdout.write(JSON.stringify({ commandHash: record.commandHash, state: record.state, exitCode: record.exitCode }) + '\n');
    return record;
  }
  throw envError('environment_host_arg', 'unrecognized fixed entry argv; only "supervise <fixed-index>", "batch" and "result <fixed-index>" are accepted', { argv: args.map(() => '[arg]') });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === resolve(SELF_PATH)) {
  main().then((r) => {
    if (r && r.state !== 'completed') process.exitCode = 1;
  }).catch((e) => {
    process.stderr.write(JSON.stringify({ error: e.code ?? 'environment_host_error', message: String(e.message).slice(0, 200) }) + '\n');
    process.exitCode = 2;
  });
}

export default {
  ALLOWED_COMMANDS, MANIFEST_PATH, NETWORK_NAME, RUNNER_NAME, DB_NAME, DB_ALIAS,
  RUN_DB_PREFIX, LEGACY_RUN_DB_PREFIX, RUN_DB_LIMIT, STAGE_ROOT, DEPS_ROOT,
  atomicWriteJson, assertStageableRel, assertStageRoot, stageFiles, dependencyMountArgv, verifyDependencyMounts, verifyDependencyClosure,
  stagePipeArgv, inspectResource, networkCreateArgv, dbCreateArgv, runnerCreateArgv, runnerStartArgv,
  dbStartArgv, runnerEntryArgv, runnerBatchArgv, runnerResultArgv, commandRecordDescriptor, dbAccountCheckArgv, runnerUserCheckArgv,
  imageIdVerifyArgv, containerInspectArgv, networkIdArgv, environmentPlan,
  loadEnvironmentManifest, superviseInner, superviseBatch, controller
};
