import assert from 'node:assert/strict';
import { request } from 'node:http';
import { docker } from './docker.mjs';
import { composeArguments, initializeSyntheticRuntime } from './synthetic-runtime.mjs';

await initializeSyntheticRuntime();
async function compose(args, input) {
  const result = await docker([...composeArguments, ...args], { input });
  assert.equal(result.code, 0, 'Trusted synthetic runtime operation failed.');
  return result.stdout;
}
async function inspect(service) {
  const id = (await compose(['ps', '-q', service])).trim();
  assert.match(id, /^[a-f0-9]{12,64}$/);
  const result = await docker(['inspect', id]);
  assert.equal(result.code, 0);
  const [info] = JSON.parse(result.stdout);
  assert.equal(info.Config.Labels['com.docker.compose.project'], 'private-task-mvp-synthetic');
  assert.equal(info.State.Running, true);
  return info;
}
async function node(service, source) {
  return JSON.parse(await compose(['exec', '-T', '--workdir', `/workspace/services/${service}`, service, 'node', '--input-type=module', '-e', source]));
}
function health(port, host) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/health', headers: { Host: `${host}:${port}` }, timeout: 3000 }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ code: response.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Health timeout.'))); req.end();
  });
}
const privateDb = await inspect('db-private');
const externalDb = await inspect('db-external');
const privateApi = await inspect('private-api');
const externalApi = await inspect('external-api');
assert.notEqual(privateDb.Id, externalDb.Id);
assert.notEqual(privateApi.Mounts.find(mount => mount.Destination === '/data/private').Name, externalApi.Mounts.find(mount => mount.Destination === '/data/external').Name);
for (const [info, port] of [[privateApi, '4000/tcp'], [externalApi, '4001/tcp']]) {
  assert.equal(info.Config.User, 'node');
  assert.equal(info.HostConfig.ReadonlyRootfs, true);
  assert.equal(info.HostConfig.Privileged, false);
  assert.ok(info.HostConfig.CapDrop.includes('ALL'));
  assert.ok(info.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
  assert.ok(info.NetworkSettings.Ports[port].every(binding => binding.HostIp === '127.0.0.1'));
}
assert.ok(externalApi.Config.Env.every(value => !/^(PRIVATE_|MODEL_|OLLAMA_)/.test(value)));
assert.equal(privateDb.NetworkSettings.Ports['5432/tcp'], null);
assert.equal(externalDb.NetworkSettings.Ports['5432/tcp'], null);
const privateIps = Object.values(privateDb.NetworkSettings.Networks).map(network => network.IPAddress);
assert.ok(privateIps.every(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip)));
const external = await node('external-api', `
  import assert from 'node:assert/strict'; import fs from 'node:fs'; import net from 'node:net'; import { Pool } from 'pg';
  for (const path of ['/run/secrets/private_db_password', '/run/secrets/private_release_key', '/run/secrets/private_owner_bootstrap', '/data/private', '/var/run/docker.sock', '/workspace/services/private-api/dist/main.js']) assert.equal(fs.existsSync(path), false);
  const ownFile = '/data/external/synthetic-storage-probe';
  if (!fs.existsSync(ownFile)) fs.writeFileSync(ownFile, 'synthetic-external-storage', { flag: 'wx' });
  assert.equal(fs.readFileSync(ownFile, 'utf8'), 'synthetic-external-storage');
  const pool = new Pool({ host: process.env.EXTERNAL_DATABASE_HOST, database: process.env.EXTERNAL_DATABASE_NAME, user: process.env.EXTERNAL_DATABASE_USER, password: fs.readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE, 'utf8').trim(), connectionTimeoutMillis: 3000 });
  try { const row = (await pool.query('SELECT current_database() AS db, current_user AS actor')).rows[0]; assert.equal(row.db, 'external_task'); assert.equal(row.actor, 'external_service'); } finally { await pool.end(); }
  for (const host of ['db-private', ...${JSON.stringify(privateIps)}]) {
    const connected = await new Promise(resolve => { const socket = net.connect({ host, port: 5432 }); let finished = false; const finish = result => { if (finished) return; finished = true; socket.destroy(); resolve(result); }; socket.on('connect', () => finish(true)); socket.on('error', () => finish(false)); socket.setTimeout(1500, () => finish(false)); });
    assert.equal(connected, false);
  }
  console.log(JSON.stringify({ ownDatabase: 'tested', ownStorageWritable: true, privateDatabaseConnections: 'denied', privateSourceSecretsStorageSocket: 'absent' }));
`);
const privateResult = await node('private-api', `
  import assert from 'node:assert/strict'; import fs from 'node:fs'; import { createHash } from 'node:crypto'; import { spawn } from 'node:child_process'; import { Pool } from 'pg'; import { PostgresOwnerBootstrapStore } from './dist/owner-store.js';
  const file = '/data/private/synthetic-storage-probe'; if (!fs.existsSync(file)) fs.writeFileSync(file, 'synthetic-private-storage', { flag: 'wx' }); assert.equal(fs.readFileSync(file, 'utf8'), 'synthetic-private-storage');
  const config = { host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: fs.readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 2, connectionTimeoutMillis: 5000 };
  const pool = new Pool(config); const row = (await pool.query('SELECT current_database() AS db, current_user AS actor')).rows[0]; assert.equal(row.db, 'private_task'); assert.equal(row.actor, 'private_service');
  await pool.query('CREATE SCHEMA IF NOT EXISTS synthetic_bootstrap_rollback_fixture');
  const rollbackPool = new Pool({ ...config, options: '-c search_path=synthetic_bootstrap_rollback_fixture' }); const rollbackStore = new PostgresOwnerBootstrapStore(rollbackPool); await rollbackStore.initialize('a'.repeat(64));
  let rejected = false; try { await rollbackStore.transaction(async tx => { assert.equal(await tx.consumeUnusedBootstrap('a'.repeat(64)), true); await tx.insertOwner({ id: 'not-a-uuid', username: 'synthetic.rollback', passwordHash: 'synthetic-hash', role: 'owner' }); }); } catch { rejected = true; }
  assert.equal(rejected, true); assert.equal((await rollbackPool.query('SELECT consumed FROM bootstrap_owner_authority')).rows[0].consumed, false); await rollbackPool.end();
  const token = fs.readFileSync(process.env.PRIVATE_OWNER_BOOTSTRAP_FILE, 'utf8').trim(); const digest = createHash('sha256').update(token).digest('hex'); const store = new PostgresOwnerBootstrapStore(pool); await store.initialize(digest);
  const before = (await pool.query('SELECT count(*)::int AS total FROM bootstrap_owner_accounts')).rows[0].total;
  const input = JSON.stringify({ token, username: 'synthetic.bootstrap.owner', password: 'synthetic-bootstrap-password-only' });
  const run = () => new Promise((resolve, reject) => { const child = spawn(process.execPath, ['dist/owner-cli.js'], { stdio: ['pipe', 'pipe', 'pipe'] }); let output = ''; child.stdout.on('data', bytes => { output += bytes.toString(); }); child.stderr.on('data', () => {}); child.on('error', reject); child.on('exit', code => { try { resolve({ code, result: JSON.parse(output) }); } catch { reject(new Error('Bootstrap command did not return a safe result.')); } }); child.stdin.end(input); });
  const outcomes = await Promise.all([run(), run()]); assert.equal(outcomes.filter(outcome => outcome.result.status === 'created').length, before === 0 ? 1 : 0); assert.equal(outcomes.filter(outcome => outcome.result.status === 'denied').length, before === 0 ? 1 : 2);
  const accounts = (await pool.query('SELECT username, password_hash, role FROM bootstrap_owner_accounts')).rows; assert.equal(accounts.length, 1); assert.equal(accounts[0].username, 'synthetic.bootstrap.owner'); assert.equal(accounts[0].role, 'owner'); assert.match(accounts[0].password_hash, /^\\$scrypt\\$32768\\$8\\$1\\$/); assert.notEqual(accounts[0].password_hash, 'synthetic-bootstrap-password-only');
  assert.equal((await run()).result.status, 'denied'); await store.initialize('b'.repeat(64)); assert.equal((await pool.query('SELECT token_digest, consumed FROM bootstrap_owner_authority')).rows[0].token_digest, digest); assert.equal((await pool.query('SELECT consumed FROM bootstrap_owner_authority')).rows[0].consumed, true); await pool.end();
  console.log(JSON.stringify({ ownDatabase: 'tested', ownStorageWritable: true, rollback: 'tested', ownerCount: 1, oneTimeReplay: 'denied', concurrentBootstrap: before === 0 ? 'one_created_one_denied' : 'both_denied_existing_owner', tokenRotationCannotReset: true }));
`);
assert.deepEqual(await health(4000, 'private.localhost'), { code: 200, body: { service: 'private-api', status: 'bootstrap', assurance: 'tested', productReady: false } });
assert.deepEqual(await health(4001, 'contributor.localhost'), { code: 200, body: { service: 'external-api', status: 'bootstrap', assurance: 'tested', productReady: false } });
assert.equal((await health(4001, 'private.localhost')).code, 403);
console.log(JSON.stringify({ assurance: 'tested', profile: 'trusted_synthetic_compose_not_submission_runner', private: privateResult, external, loopbackAndSafeHealth: 'tested', limitations: ['Not real customer data, full sessions/CSRF or hostile-code VM validation.'] }, null, 2));
