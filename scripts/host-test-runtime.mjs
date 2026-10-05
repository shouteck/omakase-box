// Host runtime for the legacy *-live tests (wave K2a): provisions private_task and external_task
// on the disposable BOX_TEST_DATABASE_URL server, applies each service's migrations, seeds the
// synthetic bootstrap owner, mints per-run secret files under the OS temp dir, and spawns
// service-directory children with the PRIVATE_/EXTERNAL_* environment the fixtures expect.
// K2b adds startServices/runFixture: the real service bootstraps run as host children under
// SYNTHETIC_HOST_TEST (the container schema is untouched) on a dedicated loopback bind, and the
// fixture entries run through exec exactly like the K2a tests drive them.
// pg never sees the URL: its parser lets query parameters such as host override the validated
// hostname, so the URL may carry none and every pool is built from the explicit fields here.
import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createConnection, createServer as createTcpServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './process.mjs';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const CONNECTION_DEADLINE_MS = 10000;
const MARKER = 'k2a-host-test-runtime';
const TEMP_PREFIX = 'k2a-host-runtime-';
const SERVICES = { 'private-api': 'PRIVATE', 'external-api': 'EXTERNAL' };

function quoteIdentifier(name) {
  return '"' + String(name).replaceAll('"', '""') + '"';
}

// The URL is the only untrusted input; it is validated once here and only explicit fields are
// handed to pg pools, exactly as tests/box/auth/support.ts does.
function disposableServer() {
  const adminUrl = process.env.BOX_TEST_DATABASE_URL;
  if (typeof adminUrl !== 'string' || !adminUrl.startsWith('postgres://')) throw new Error('BOX_TEST_DATABASE_URL is not configured.');
  if (/[?#]/.test(adminUrl)) throw new Error('BOX_TEST_DATABASE_URL must not carry a query or fragment.');
  const url = new URL(adminUrl);
  if (!LOOPBACK_HOSTS.includes(url.hostname)) throw new Error('BOX_TEST_DATABASE_URL is not a loopback database.');
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port: url.port === '' ? 5432 : Number(url.port), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)) || 'postgres' };
}

function serviceRequire(service) {
  return createRequire(new URL(`../services/${service}/package.json`, import.meta.url));
}

async function readyPool(server, config) {
  const { Pool } = serviceRequire('private-api')('pg');
  const pool = new Pool({ ...server, ...config, connectionTimeoutMillis: CONNECTION_DEADLINE_MS });
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { await pool.query('SELECT 1'); return pool; } catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  await pool.end().catch(() => undefined);
  throw lastError;
}

// A leftover private_task/external_task from a killed run carries this marker and is rebuilt;
// a database or role that lacks it is not ours and the run refuses rather than destroying it.
async function provisionDatabases(admin, roles) {
  for (const [name, password] of Object.entries(roles)) {
    const found = (await admin.query("SELECT shobj_description(oid, 'pg_authid') AS mark FROM pg_roles WHERE rolname = $1", [name])).rows[0];
    if (found && found.mark !== MARKER) throw new Error(`Refusing to adopt pre-existing role ${name}.`);
    if (found) await admin.query(`ALTER ROLE ${quoteIdentifier(name)} WITH LOGIN CREATEDB PASSWORD '${password}'`);
    else {
      await admin.query(`CREATE ROLE ${quoteIdentifier(name)} LOGIN CREATEDB PASSWORD '${password}'`);
      await admin.query(`COMMENT ON ROLE ${quoteIdentifier(name)} IS '${MARKER}'`);
    }
  }
  const stray = (await admin.query("SELECT datname FROM pg_database WHERE datname ~ '^synthetic_'")).rows;
  for (const { datname } of stray) await admin.query(`DROP DATABASE ${quoteIdentifier(datname)} WITH (FORCE)`);
  for (const [database, owner] of [['private_task', 'private_service'], ['external_task', 'external_service']]) {
    const found = (await admin.query("SELECT shobj_description(oid, 'pg_database') AS mark FROM pg_database WHERE datname = $1", [database])).rows[0];
    if (found && found.mark !== MARKER) throw new Error(`Refusing to adopt pre-existing database ${database}.`);
    if (found) await admin.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(database)} OWNER ${quoteIdentifier(owner)}`);
    await admin.query(`COMMENT ON DATABASE ${quoteIdentifier(database)} IS '${MARKER}'`);
  }
}

async function migrateService(server, service, roles) {
  const scope = SERVICES[service];
  const database = scope === 'PRIVATE' ? 'private_task' : 'external_task';
  const user = scope === 'PRIVATE' ? 'private_service' : 'external_service';
  const requireService = serviceRequire(service);
  const { Pool } = requireService('pg');
  const { drizzle } = requireService('drizzle-orm/node-postgres');
  const { migrate } = requireService('drizzle-orm/node-postgres/migrator');
  const pool = new Pool({ host: server.host, port: server.port, user, password: roles[user], database, max: 2, connectionTimeoutMillis: CONNECTION_DEADLINE_MS });
  try {
    await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL(`../services/${service}/db/migrations/`, import.meta.url)) });
    if (scope === 'PRIVATE') {
      const salt = randomBytes(16);
      const passwordHash = `$scrypt$32768$8$1$${salt.toString('base64')}$${scryptSync(randomBytes(24).toString('hex'), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64')}`;
      await pool.query("INSERT INTO private_accounts (id, username, password_hash, role, disabled) VALUES ($1, 'synthetic.bootstrap.owner', $2, 'owner', false)", [randomUUID(), passwordHash]);
    }
  } finally { await pool.end(); }
}

// Secret files live one level under per-scope directories, mirroring infra/compose.yaml; nothing
// writes their contents anywhere but this per-run temp directory, removed by cleanup().
function materializeSecrets(directory, roles) {
  const release = generateKeyPairSync('ed25519'), assignment = generateKeyPairSync('ed25519'), receipt = generateKeyPairSync('ed25519'), permit = generateKeyPairSync('ed25519'), importer = generateKeyPairSync('ed25519');
  const hex = () => randomBytes(32).toString('hex');
  const files = {
    private: {
      PRIVATE_DATABASE_PASSWORD_FILE: ['db-password', roles.private_service],
      PRIVATE_SESSION_KEY_FILE: ['session-key', hex()],
      PRIVATE_OWNER_BOOTSTRAP_FILE: ['owner-bootstrap', hex()],
      PRIVATE_RELEASE_KEY_FILE: ['release-key', release.privateKey.export({ format: 'pem', type: 'pkcs8' })],
      PRIVATE_BRIDGE_KEY_FILE: ['bridge-key', hex()],
      PRIVATE_ASSIGNMENT_KEY_FILE: ['assignment-key', assignment.privateKey.export({ format: 'pem', type: 'pkcs8' })],
      PRIVATE_RECEIPT_PUBLIC_KEY_FILE: ['receipt-public-key', receipt.publicKey.export({ format: 'pem', type: 'spki' })],
      PRIVATE_IMPORT_KEY_FILE: ['import-key', importer.privateKey.export({ format: 'pem', type: 'pkcs8' })],
      PRIVATE_PERMIT_PUBLIC_KEY_FILE: ['permit-public-key', permit.publicKey.export({ format: 'pem', type: 'spki' })]
    },
    external: {
      EXTERNAL_DATABASE_PASSWORD_FILE: ['db-password', roles.external_service],
      EXTERNAL_SESSION_KEY_FILE: ['session-key', hex()],
      EXTERNAL_RELEASE_PUBLIC_KEY_FILE: ['release-public-key', release.publicKey.export({ format: 'pem', type: 'spki' })],
      EXTERNAL_BRIDGE_KEY_FILE: ['bridge-key', hex()],
      EXTERNAL_ASSIGNMENT_PUBLIC_KEY_FILE: ['assignment-public-key', assignment.publicKey.export({ format: 'pem', type: 'spki' })],
      EXTERNAL_RECEIPT_KEY_FILE: ['receipt-key', receipt.privateKey.export({ format: 'pem', type: 'pkcs8' })],
      EXTERNAL_PERMIT_KEY_FILE: ['permit-key', permit.privateKey.export({ format: 'pem', type: 'pkcs8' })],
      EXTERNAL_IMPORT_PUBLIC_KEY_FILE: ['import-public-key', importer.publicKey.export({ format: 'pem', type: 'spki' })]
    }
  };
  const env = {};
  for (const [scope, entries] of Object.entries(files)) {
    const scopeDirectory = join(directory, scope);
    mkdirSync(scopeDirectory, { recursive: true });
    for (const [name, [filename, contents]] of Object.entries(entries)) {
      const path = join(scopeDirectory, filename);
      writeFileSync(path, contents, { flag: 'wx', mode: 0o600 });
      env[name] = path;
    }
  }
  return env;
}

// Runs are serial (vitest maxWorkers: 1), so any prior per-run directory is stale by definition.
function sweepStaleDirectories() {
  try {
    for (const entry of readdirSync(tmpdir())) {
      if (!entry.startsWith(TEMP_PREFIX)) continue;
      rmSync(join(tmpdir(), entry), { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  } catch { /* stale temp dirs are best-effort cleanup only */ }
}

// Service bundles are written under each service's dist/ so bare imports resolve from the
// service's own node_modules (a file under the temp dir would find none). A killed run can
// leave one behind; like the temp dirs above it is stale by definition on the next run.
function sweepStaleServiceFiles() {
  for (const service of Object.keys(SERVICES)) {
    const dist = join(root, 'services', service, 'dist');
    try {
      for (const entry of readdirSync(dist)) if (/^host-(main|fixture)-[0-9a-f]+\.mjs$/.test(entry)) rmSync(join(dist, entry), { force: true });
    } catch { /* a missing dist directory is fine */ }
  }
}

// Fixtures never set a port; pg falls back to the PGPORT environment variable for any config
// field it is not given, so the disposable server's port reaches every child through it.
export async function acquireHostRuntime() {
  const server = disposableServer();
  sweepStaleDirectories();
  sweepStaleServiceFiles();
  const directory = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  const roles = { private_service: randomBytes(32).toString('hex'), external_service: randomBytes(32).toString('hex') };
  const secretEnv = materializeSecrets(directory, roles);
  const environments = {};
  for (const [service, scope] of Object.entries(SERVICES)) {
    const storage = join(directory, scope === 'PRIVATE' ? 'private' : 'external', 'storage');
    mkdirSync(storage, { recursive: true });
    environments[service] = {
      [`${scope}_DATABASE_HOST`]: server.host,
      [`${scope}_DATABASE_NAME`]: scope === 'PRIVATE' ? 'private_task' : 'external_task',
      [`${scope}_DATABASE_USER`]: scope === 'PRIVATE' ? 'private_service' : 'external_service',
      [`${scope}_DATABASE_PASSWORD_FILE`]: secretEnv[`${scope}_DATABASE_PASSWORD_FILE`],
      [`${scope}_STORAGE_ROOT`]: storage,
      PGPORT: String(server.port)
    };
  }
  for (const [name, path] of Object.entries(secretEnv)) environments[name.startsWith('PRIVATE_') ? 'private-api' : 'external-api'][name] = path;
  const admin = await readyPool(server, { max: 2 });
  try {
    await provisionDatabases(admin, roles);
    await migrateService(server, 'private-api', roles);
    await migrateService(server, 'external-api', roles);
  } catch (error) {
    await admin.end().catch(() => undefined);
    rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    throw error;
  }
  await admin.end().catch(() => undefined);

  function childEnv(service, extra = {}) {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) if (!/^(PRIVATE_|EXTERNAL_|SYNTHETIC_|PG|BOX_)/.test(key)) env[key] = value;
    return Object.assign(env, environments[service], extra);
  }

  function exec(service, args, { input, timeout = 120000, env: extra = {} } = {}) {
    if (!SERVICES[service]) throw new Error(`Unknown service ${service}.`);
    const env = childEnv(service, extra);
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: join(root, 'services', service), env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let stdout = ''; let stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Host service operation timed out.')); }, timeout);
      child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(0, 262144); });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(0, 262144); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });
  }

  // Bundles are built once per entry per runtime, exactly like the K2a tests build fixtures.
  const bundles = new Map();
  function bundle(service, entry) {
    const key = `${service}/${entry}`;
    if (!bundles.has(key)) {
      const pending = import('vite').then(({ build }) => build({
        configFile: false,
        logLevel: 'silent',
        build: { ssr: join(root, 'services', service, `${entry}.ts`), write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } }
      })).then(result => {
        const chunks = Array.isArray(result) ? result : result.output ?? [];
        const chunk = chunks.find(item => item.type === 'chunk' && typeof item.code === 'string');
        if (!chunk || chunk.code === undefined) throw new Error(`Bundle ${key} produced no chunk.`);
        return chunk.code;
      });
      pending.catch(() => bundles.delete(key));
      bundles.set(key, pending);
    }
    return bundles.get(key);
  }

  // The real bootstraps and fixture entries run from bundle files in each service's gitignored
  // dist/, so 'pg'/'fastify' resolve from its node_modules and fixtures keep their real stdin
  // (stdin-delivered code would starve the fixture's command JSON of its input).
  const serviceFiles = new Set();
  function writeBundle(service, prefix, code) {
    const file = join(root, 'services', service, 'dist', `${prefix}-${randomBytes(4).toString('hex')}.mjs`);
    mkdirSync(join(root, 'services', service, 'dist'), { recursive: true });
    writeFileSync(file, code, { mode: 0o600 });
    serviceFiles.add(file);
    return file;
  }

  // Runs the checked-in fixture entries (auth/fixture, requests/intake-fixture, ...) against
  // this runtime's databases — the host replacement for the docker-exec fixture calls.
  async function runFixture(service, entry, command, flag = 'SYNTHETIC_AUTH_FIXTURE') {
    const file = writeBundle(service, 'host-fixture', await bundle(service, entry));
    const result = await exec(service, [file], { input: JSON.stringify(command), env: { [flag]: 'private-task-mvp-synthetic' } });
    if (result.code !== 0) throw new Error(`Host fixture ${service}:${entry} failed: ${result.stderr.slice(-2048)}`);
    return JSON.parse(result.stdout.trim().split('\n').at(-1));
  }

  // The real bootstraps run as long-lived children. The prepended watchdog makes the service
  // exit when this process's stdin pipe dies, so even a killed run leaks no process.
  // cleanup() still stops children first and deletes every bundle file.
  const WATCHDOG = "process.stdin.resume();process.stdin.on('end',()=>process.exit(0));process.stdin.on('close',()=>process.exit(0));\n";
  const serviceChildren = new Map();
  function spawnService(service, code, extra) {
    const file = writeBundle(service, 'host-main', WATCHDOG + code);
    const child = spawn(process.execPath, [file], { cwd: join(root, 'services', service), env: childEnv(service, extra), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const record = { stderr: '' };
    serviceChildren.set(child, record);
    child.stderr.on('data', chunk => { record.stderr = (record.stderr + chunk.toString()).slice(-8192); });
    child.stdout.resume();
    child.on('exit', () => serviceChildren.delete(child));
    child.on('error', () => serviceChildren.delete(child));
    return { child, record };
  }

  async function waitForHealth(service, host, port, hostHeader, record, child) {
    const deadline = Date.now() + 30000;
    const probe = () => new Promise(resolve => {
      const req = httpRequest({ host, port, path: '/health', headers: { Host: hostHeader }, timeout: 2000 }, response => {
        let body = ''; response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve(response.statusCode === 200 && body.includes(`"${service}"`)));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`${service} exited before health: ${record.stderr.slice(-2048)}`);
      if (await probe()) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`${service} did not become healthy: ${record.stderr.slice(-2048)}`);
  }

  // Driver-side callers (Playwright route.fetch, plain http) never see --host-resolver-rules:
  // the OS resolves *.localhost to ::1 or 127.0.0.1, and 127.0.0.1 may already be held. TCP
  // mirrors forward the default loopback answers to the real bind wherever they are free, so
  // driver-side calls still reach these services with the contract headers untouched.
  const mirrors = [];
  const mirrorSockets = new Set();
  async function mirrorLoopback(port, target) {
    for (const candidate of ['::1', '127.0.0.1']) {
      if (candidate === target) continue;
      const server = createTcpServer(socket => {
        mirrorSockets.add(socket);
        const upstream = createConnection({ host: target, port });
        socket.on('close', () => { mirrorSockets.delete(socket); upstream.destroy(); });
        socket.pipe(upstream);
        upstream.pipe(socket);
        const drop = () => { socket.destroy(); upstream.destroy(); };
        socket.on('error', drop);
        upstream.on('error', drop);
      });
      await new Promise(resolve => {
        server.once('error', () => resolve());
        server.listen(port, candidate, () => { mirrors.push(server); resolve(); });
      });
    }
  }

  // Starts both APIs on one loopback bind (127.0.0.2 by default: Docker Desktop can hold
  // 127.0.0.1:4000, and the whole 127/8 block is loopback — the Host/Origin contract headers
  // are unchanged). Callers get the bound host so their HTTP and browser mappings agree.
  let servicesStarted;
  async function startServices({ host = '127.0.0.2' } = {}) {
    servicesStarted ??= (async () => {
      for (const [service, port, hostHeader] of [['private-api', 4000, 'private.localhost:4000'], ['external-api', 4001, 'contributor.localhost:4001']]) {
        const code = await bundle(service, 'src/bootstrap/main');
        const extra = { SYNTHETIC_HOST_TEST: 'true', SYNTHETIC_HOST_TEST_BIND: host, AUTH_MODE: 'localhost_demo' };
        if (service === 'private-api') Object.assign(extra, { SYNTHETIC_SNAPSHOT_SOURCE: 'private-task-mvp-synthetic', SYNTHETIC_SNAPSHOT_ROOT: join(root, 'examples', 'private-shop') });
        const { child, record } = spawnService(service, code, extra);
        await waitForHealth(service, host, port, hostHeader, record, child);
      }
      await mirrorLoopback(4000, host);
      await mirrorLoopback(4001, host);
      return { host };
    })();
    try { return await servicesStarted; } catch (error) { servicesStarted = undefined; throw error; }
  }

  let cleaned;
  async function cleanup() {
    if (cleaned) return cleaned;
    cleaned = (async () => {
      for (const child of [...serviceChildren.keys()]) { try { child.kill(); } catch { /* already gone */ } }
      const killDeadline = Date.now() + 5000;
      while (serviceChildren.size && Date.now() < killDeadline) await new Promise(resolve => setTimeout(resolve, 100));
      for (const child of [...serviceChildren.keys()]) { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
      for (const socket of mirrorSockets) socket.destroy();
      for (const server of mirrors) server.close();
      for (const file of serviceFiles) rmSync(file, { force: true });
      let failure;
      try {
        const adminPool = await readyPool(server, { max: 1 });
        try {
          const dropped = (await adminPool.query("SELECT datname FROM pg_database WHERE datname ~ '^synthetic_' OR datname IN ('private_task', 'external_task')")).rows;
          for (const { datname } of dropped) await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(datname)} WITH (FORCE)`);
          for (const role of Object.keys(roles)) {
            const found = (await adminPool.query("SELECT shobj_description(oid, 'pg_authid') AS mark FROM pg_roles WHERE rolname = $1", [role])).rows[0];
            if (found && found.mark === MARKER) await adminPool.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`).catch(() => undefined);
          }
        } finally { await adminPool.end().catch(() => undefined); }
      } catch (error) { failure = error; }
      rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
      if (failure) throw failure;
    })();
    return cleaned;
  }
  return { exec, runFixture, startServices, cleanup };
}
