import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { Pool } from 'pg';
import { contentHash } from '../packages/contracts/hash.js';
import { singleUnitContract } from '../tests/contracts/fixtures.js';
import { projectPublicListing } from '../packages/contracts/public/task.js';
import { preparePublicWorkspace } from '../packages/compiler/workspace.js';
import { PUBLIC_IMAGE_PROFILE } from '../templates/workspaces/public-image-profile.js';

const input = JSON.parse(process.env.PROBE_INPUT!) as { ownerUsername: string; ownerPassword: string; requesterUsername: string; requesterPassword: string; intentId: string; contributorId: string };
const report: Record<string, unknown> = { assurance: 'tested', scope: 'Mounted private route over real container HTTP; synthetic seeded release only.' };
const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 2 });
const HEADERS = { Host: 'private.localhost:4000', Origin: 'http://private.localhost:3000', 'Content-Type': 'application/json' };
function http(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: any; headers: Record<string, string | string[] | undefined>; bytes: Buffer }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: 4000, path, method, headers: { ...HEADERS, ...headers }, timeout: 15000 }, response => {
      const chunks: Buffer[] = []; response.on('data', chunk => { chunks.push(chunk); });
      response.on('end', () => {
        const bytes = Buffer.concat(chunks); let body: unknown = null;
        try { body = bytes.length ? JSON.parse(bytes.toString('utf8')) : null; } catch { body = '<non-json>'; }
        resolve({ status: response.statusCode!, body, headers: response.headers, bytes });
      });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function login(username: string, password: string) {
  const response = await http('POST', '/v1/auth/login', { username, password });
  if (response.status !== 200) throw new Error(`login_failed:${response.status}`);
  const setCookie = response.headers['set-cookie'];
  return { cookie: (Array.isArray(setCookie) ? setCookie[0] : setCookie ?? '').split(';')[0], 'x-csrf-token': response.body.csrfToken };
}
try {
  const ownerId = (await pool.query('SELECT id FROM private_accounts WHERE username=$1', [input.ownerUsername])).rows[0].id;
  const draft = (await pool.query('SELECT payload FROM private_intent_revisions WHERE id=$1 AND version=1', [input.intentId])).rows[0];
  const readyPayload = { ...draft.payload, state: 'ready_for_approval' };
  await pool.query("UPDATE private_intent_revisions SET state='ready_for_approval', payload=$2, content_hash=$3 WHERE id=$1 AND version=1", [input.intentId, readyPayload, contentHash(readyPayload)]);
  const approved = await pool.query("UPDATE private_intent_revisions SET state='approved', approved_by=$2, approved_hash=content_hash WHERE id=$1 AND version=1 RETURNING content_hash", [input.intentId, ownerId]);
  const approvedIntentHash = approved.rows[0].content_hash;
  const owner = await login(input.ownerUsername, input.ownerPassword);
  const requester = await login(input.requesterUsername, input.requesterPassword);
  report.anonymousChooseDenied = (await http('POST', '/v1/assignments', {})).status === 401;
  const contract = singleUnitContract(); contract.taskId = randomUUID(); contract.lineageId = randomUUID();
  const feedbackPolicy = { schemaVersion: 1, id: contract.feedbackPolicyId, categories: ['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired'], messageCodes: ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'], privateDiagnostics: 'none', publicDetails: 'approved_public_checks_only' };
  const workspace = preparePublicWorkspace(contract, { imageDigest: PUBLIC_IMAGE_PROFILE.imageDigest });
  const candidate = { contract: workspace.contract, listing: projectPublicListing(workspace.contract, 30), feedbackPolicy, assets: workspace.assets.map(asset => ({ ...asset, sourceAssetId: randomUUID() })) };
  Object.assign(contract, { taskId: workspace.contract.taskId, version: workspace.contract.version });
  const staged = await http('POST', '/v1/release-candidates', { intentId: input.intentId, intentVersion: 1, approvedIntentHash, privateRevision: 'b'.repeat(64), candidate }, owner);
  report.staged = staged.status === 201;
  const manifestHash = staged.body.manifestHash;
  report.requesterChooseDenied = (await http('POST', '/v1/assignments', { taskId: contract.taskId, taskVersion: contract.version, packageDigest: 'c'.repeat(64), idempotencyKey: randomUUID(), executor: { kind: 'ai', label: 'Synthetic AI executor' } }, requester)).status === 403;
  const approval = await http('POST', `/v1/release-candidates/${staged.body.id}/approval`, { expectedVersion: 1, manifestHash, combinedDisclosureReviewed: true, semanticDisclosureRationale: 'Entirely synthetic disclosure reviewed for the M6.2 mounted-route smoke.' }, owner);
  report.approved = approval.status === 200;
  const packaged = await http('POST', `/v1/release-candidates/${staged.body.id}/package`, { expectedVersion: 2, manifestHash }, owner);
  report.packageStatus = packaged.status;
  const packageDigest = String(packaged.headers['x-package-sha256']);
  const executor = { kind: 'human', label: 'Synthetic human executor', contributorId: input.contributorId };
  report.wrongCsrfStatus = (await http('POST', '/v1/assignments', { taskId: contract.taskId, taskVersion: contract.version, packageDigest, idempotencyKey: randomUUID(), executor }, { cookie: owner.cookie, 'x-csrf-token': 'f'.repeat(64) })).status;
  report.wrongCsrfDenied = report.wrongCsrfStatus === 401;
  report.staleDigestStatus = (await http('POST', '/v1/assignments', { taskId: contract.taskId, taskVersion: contract.version, packageDigest: 'c'.repeat(64), idempotencyKey: randomUUID(), executor }, owner)).status;
  report.staleDigestDenied = report.staleDigestStatus === 409;
  const idempotencyKey = randomUUID();
  const choose = await http('POST', '/v1/assignments', { taskId: contract.taskId, taskVersion: contract.version, packageDigest, idempotencyKey, executor }, owner);
  report.chooseStatus = choose.status;
  const assignment = choose.body;
  report.idempotentChoose = (await http('POST', '/v1/assignments', { taskId: contract.taskId, taskVersion: contract.version, packageDigest, idempotencyKey, executor }, owner)).status === 201;
  report.conflictingChooseDenied = (await http('POST', '/v1/assignments', { taskId: contract.taskId, taskVersion: contract.version, packageDigest, idempotencyKey, executor: { kind: 'ai', label: 'Synthetic AI executor' } }, owner)).status === 409;
  const approvalRow = (await pool.query('SELECT manifest FROM private_release_approvals WHERE id=$1', [staged.body.id])).rows[0];
  const outbox = (await pool.query('SELECT count(*)::int AS rows FROM private_assignment_outbox WHERE assignment_id=$1', [assignment.id])).rows[0];
  Object.assign(report, { outboxRows: outbox.rows, assignmentId: assignment.id, taskId: contract.taskId, taskVersion: contract.version, packageDigest, packageBytesBase64: packaged.bytes.toString('base64'), contract, listing: candidate.listing, manifest: approvalRow.manifest, manifestHash, lineageId: contract.lineageId, invitationToken: assignment.invitation?.token, invitationExpiresAt: assignment.invitation?.expiresAt, executorKind: assignment.executor?.kind });
  console.log(JSON.stringify(report));
} catch (error) {
  console.log(JSON.stringify({ ...report, failure: error instanceof Error ? error.message : 'probe_failure' }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
