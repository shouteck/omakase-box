import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { build } from 'vite';
import { docker } from '../scripts/docker.mjs';
import { composeArguments } from '../scripts/synthetic-runtime.mjs';

async function fixture(service, command) {
  const result = await docker([...composeArguments, 'exec', '-T', '--env', 'SYNTHETIC_AUTH_FIXTURE=private-task-mvp-synthetic', '--workdir', `/workspace/services/${service}`, service, 'node', 'dist/fixture.js'], { input: JSON.stringify(command) });
  assert.equal(result.code, 0, `${service} fixture failed: ${result.stderr.slice(-2000)}`);
  return JSON.parse(result.stdout);
}
function http(scope, method, path, body, headers = {}) {
  const port = scope === 'private' ? 4000 : 4001, host = scope === 'private' ? 'private.localhost' : 'contributor.localhost', origin = scope === 'private' ? 'http://private.localhost:3000' : 'http://contributor.localhost:3001';
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { Host: `${host}:${port}`, Origin: origin, 'Content-Type': 'application/json', ...headers }, timeout: 10000 }, response => {
      let data = ''; response.on('data', chunk => { data += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: data ? JSON.parse(data) : null, headers: response.headers }));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function runBundled(service, entry, env) {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { ssr: entry, write: false, minify: false, sourcemap: false, rolldownOptions: { external: ['pg'], output: { inlineDynamicImports: true } }, rollupOptions: { external: ['pg'], output: { inlineDynamicImports: true } } } });
  const chunks = (Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : []);
  const source = chunks.find(chunk => chunk.type === 'chunk')?.code;
  assert.ok(source, 'bundle produced no chunk');
  const envArgs = Object.entries(env).flatMap(([name, value]) => ['--env', `${name}=${value}`]);
  const result = await docker([...composeArguments, 'exec', '-T', '--workdir', `/workspace/services/${service}`, ...envArgs, service, 'node', '--input-type=module'], { input: source, timeout: 120000 });
  assert.equal(result.code, 0, `${service} probe failed: ${result.stderr.slice(-4000)} stdout: ${result.stdout.slice(-2000)}`);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}
const queryExternal = `import { readFileSync } from 'node:fs';
import pg from 'pg';
const pool = new pg.Pool({ host: process.env.EXTERNAL_DATABASE_HOST, database: process.env.EXTERNAL_DATABASE_NAME, user: process.env.EXTERNAL_DATABASE_USER, password: readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 1 });
const input = JSON.parse(process.env.PROBE_INPUT);
try {
  const assignment = (await pool.query('SELECT task_id,task_version,executor_kind,contributor_id,status FROM external_task_assignments WHERE id=$1', [input.assignmentId])).rows[0];
  const invitation = (await pool.query('SELECT contributor_id,token_hash,expires_at,redeemed_at,revoked FROM external_task_invitations WHERE assignment_id=$1', [input.assignmentId])).rows[0];
  const claims = (await pool.query('SELECT package_digest,count(*)::int AS rows FROM external_assignment_command_claims WHERE assignment_id=$1 GROUP BY package_digest', [input.assignmentId])).rows[0];
  console.log(JSON.stringify({ assignment, invitation, claims }));
} finally { await pool.end(); }`;

const privateSeed = await fixture('private-api', { action: 'seed' });
const externalSeed = await fixture('external-api', { action: 'seed' });
const owner = privateSeed.accounts.find(account => account.role === 'owner');
const requester = privateSeed.accounts.find(account => account.role === 'requester');
const contributor = externalSeed.accounts[0];
const report = await runBundled('private-api', '.execution/m62-owner-choose.entry.ts', { PROBE_INPUT: JSON.stringify({ ownerUsername: owner.username, ownerPassword: 'synthetic-auth-password-only', requesterUsername: requester.username, requesterPassword: 'synthetic-auth-password-only', intentId: privateSeed.intentId, contributorId: contributor.id }) });
assert.ok(!report.failure, `private probe failed: ${JSON.stringify(report)}`);
for (const check of ['staged', 'approved', 'anonymousChooseDenied', 'requesterChooseDenied', 'wrongCsrfDenied', 'staleDigestDenied', 'idempotentChoose', 'conflictingChooseDenied']) assert.equal(report[check], true, `${check} failed: ${JSON.stringify(report)}`);
assert.equal(report.chooseStatus, 201);
assert.equal(report.executorKind, 'human');
assert.match(report.invitationToken, /^[a-f0-9]{64}$/);

// Publication is M4.3-gated and absent from the default runtime; seed the released binding rows directly (synthetic fixture role), matching what signed publication would persist.
const packageBytes = Buffer.from(report.packageBytesBase64, 'base64');
assert.equal(createHash('sha256').update(packageBytes).digest('hex'), report.packageDigest, 'package bytes do not match the compiled digest');

// Older smoke attempts left undelivered outbox events; claim() is FIFO, so every pending task needs a released binding.
const pendingQuery = `import { readFileSync } from 'node:fs';
import pg from 'pg';
const pool = new pg.Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 1 });
try { const rows = (await pool.query("SELECT assignment.task_id,assignment.task_version,assignment.package_digest,assignment.executor FROM private_assignment_outbox AS outbox JOIN private_assignments AS assignment ON assignment.id=outbox.assignment_id WHERE outbox.delivered_at IS NULL ORDER BY outbox.created_at")).rows; console.log(JSON.stringify(rows)); } finally { await pool.end(); }`;
const pendingResult = await docker([...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/private-api', 'private-api', 'node', '--input-type=module', '-e', pendingQuery], { timeout: 30000 });
assert.equal(pendingResult.code, 0, pendingResult.stderr.slice(-1000));
const pending = JSON.parse(pendingResult.stdout.trim().split('\n').at(-1));

const seedExternal = `import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const pool = new pg.Pool({ host: process.env.EXTERNAL_DATABASE_HOST, database: process.env.EXTERNAL_DATABASE_NAME, user: process.env.EXTERNAL_DATABASE_USER, password: readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 1 });
let raw = ''; for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw);
const packageBytes = Buffer.from(input.packageBytes, 'base64');
const seeded = [];
try {
  for (const task of input.tasks) {
    const lineageId = randomUUID(), eventId = randomUUID(), nonce = randomUUID();
    const contract = { ...input.contract, taskId: task.task_id, version: task.task_version, lineageId };
    const listing = { ...input.listing, taskId: task.task_id, version: task.task_version };
    const manifest = task.task_id === input.taskId ? input.manifest : { schemaVersion: 1, synthetic: true };
    await pool.query('INSERT INTO external_task_lineages (id) VALUES ($1) ON CONFLICT DO NOTHING', [lineageId]);
    await pool.query('INSERT INTO external_task_versions (id,version,lineage_id,package_hash,contract,listing,envelope,withdrawn) VALUES ($1,$2,$3,$4,$5,$6,$7,false) ON CONFLICT DO NOTHING', [task.task_id, task.task_version, lineageId, task.package_digest, contract, listing, {}]);
    await pool.query("INSERT INTO external_bridge_claims (event_id,nonce,payload_hash,task_id,task_version,manifest_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6,now()+interval '1 hour')", [eventId, nonce, task.package_digest, task.task_id, task.task_version, input.manifestHash]);
    await pool.query('INSERT INTO external_published_tasks (event_id,task_id,lineage_id,version,manifest_hash,payload_hash,package_sha256,package_byte_size,package_bytes,contract,listing,manifest) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (task_id,version) DO NOTHING', [eventId, task.task_id, lineageId, task.task_version, input.manifestHash, task.package_digest, task.package_digest, packageBytes.length, packageBytes, contract, listing, manifest]);
    seeded.push(task.task_id);
  }
  console.log(JSON.stringify({ seeded }));
} finally { await pool.end(); }`;
const seeded = await docker([...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/external-api', 'external-api', 'node', '--input-type=module', '-e', seedExternal], { timeout: 30000, input: JSON.stringify({ tasks: pending, taskId: report.taskId, manifestHash: report.manifestHash, contract: report.contract, listing: report.listing, manifest: report.manifest, packageBytes: packageBytes.toString('base64') }) });
assert.equal(seeded.code, 0, `external seed failed: ${seeded.stderr.slice(-2000)}`);

// The 5s delivery loop now has a satisfiable released binding; poll the outbox.
const deliveryCheck = `import { readFileSync } from 'node:fs';
import pg from 'pg';
const pool = new pg.Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 1 });
const input = JSON.parse(process.env.PROBE_INPUT);
try { const row = (await pool.query("SELECT delivered_at FROM private_assignment_outbox WHERE assignment_id=$1 AND kind='choice'", [input.assignmentId])).rows[0]; console.log(JSON.stringify({ delivered: row?.delivered_at != null })); } finally { await pool.end(); }`;
let delivered = false;
for (let attempt = 0; attempt < 24 && !delivered; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 5000));
  const probe = await docker([...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/private-api', '--env', `PROBE_INPUT=${JSON.stringify({ assignmentId: report.assignmentId })}`, 'private-api', 'node', '--input-type=module', '-e', deliveryCheck], { timeout: 30000 });
  delivered = JSON.parse(probe.stdout.trim().split('\n').at(-1)).delivered === true;
}
assert.equal(delivered, true, 'signed choice was not delivered to the external runtime');

const externalResult = await docker([...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/external-api', '--env', `PROBE_INPUT=${JSON.stringify({ assignmentId: report.assignmentId })}`, 'external-api', 'node', '--input-type=module', '-e', queryExternal], { timeout: 30000 });
assert.equal(externalResult.code, 0, `external query failed: ${externalResult.stderr.slice(-2000)}`);
const external = JSON.parse(externalResult.stdout.trim().split('\n').at(-1));
assert.equal(external.assignment.task_id, report.taskId);
assert.equal(external.assignment.task_version, report.taskVersion);
assert.equal(external.claims.package_digest, report.packageDigest);
assert.equal(external.assignment.executor_kind, 'human');
assert.equal(external.assignment.contributor_id, contributor.id);
assert.equal(external.invitation.contributor_id, contributor.id);
assert.equal(external.invitation.token_hash, createHash('sha256').update(report.invitationToken).digest('hex'));
assert.equal(external.invitation.redeemed_at, null);
assert.equal(external.claims.rows >= 1, true);

const login = await http('external', 'POST', '/v1/auth/login', { username: contributor.username, password: 'synthetic-auth-password-only' });
assert.equal(login.status, 200);
const session = { Cookie: login.headers['set-cookie'][0].split(';')[0], 'X-CSRF-Token': login.body.csrfToken };
const redeemed = await http('external', 'POST', '/v1/invitations/redeem', { token: report.invitationToken }, session);
assert.equal(redeemed.status, 201, `redemption failed: ${JSON.stringify(redeemed.body)}`);
assert.equal((await http('external', 'POST', '/v1/invitations/redeem', { token: report.invitationToken }, session)).status, 403, 'duplicate redemption was not rejected');

const after = await docker([...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/external-api', '--env', `PROBE_INPUT=${JSON.stringify({ assignmentId: report.assignmentId })}`, 'external-api', 'node', '--input-type=module', '-e', queryExternal], { timeout: 30000 });
const redeemedRow = JSON.parse(after.stdout.trim().split('\n').at(-1));
assert.ok(redeemedRow.invitation.redeemed_at, 'redeemed_at not persisted');

console.log(JSON.stringify({ assurance: 'tested', scope: 'Real mounted private/external HTTP routes across the synthetic compose runtime; seeded synthetic release only, no independent review.', ownerSessionChoose: 'tested', signedDelivery: 'tested', externalDurableRows: 'tested', contributorRedemption: 'tested', invitationBinding: 'tested', duplicateRedemptionDenied: 'tested', anonymousChooseDenied: 'tested', requesterChooseDenied: 'tested', wrongCsrfDenied: 'tested', staleDigestDenied: 'tested', idempotentChoose: 'tested', conflictingChooseDenied: 'tested', publicationEnabled: false, realCustomerData: false }, null, 2));
