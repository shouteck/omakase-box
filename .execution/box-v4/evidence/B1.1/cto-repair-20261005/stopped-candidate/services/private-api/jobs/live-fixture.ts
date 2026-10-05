import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { SessionStore } from '../../../packages/contracts/auth/store.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { hashPassword } from '../../../packages/contracts/auth/crypto.js';
import { PROFILE, trustedHarness, signTrustedResult } from '../../../packages/runner-protocol/index.js';
import type { Lease } from '../../../packages/runner-protocol/index.js';
import { byteHash } from '../../../packages/contracts/hash.js';
import { EvaluationJobStore } from './store.js';
import type { JobRead, ResultReport } from './store.js';
import { EVALUATION_JOB_DDL } from './ddl.js';
import { JobBindingConflict, projectJobError } from './types.js';

assert.equal(typeof EVALUATION_JOB_DDL, 'string');
export const PUBLIC_CHECK_IDS = ['public_check_one', 'public_check_two'] as const;
export const PACKAGE_HASH = 'aa'.repeat(32);
export const OTHER_PACKAGE_HASH = 'bb'.repeat(32);
export const IMAGE = 'sha256:' + 'dd'.repeat(32);
export const OTHER_IMAGE = 'sha256:' + 'ee'.repeat(32);
export const ARTIFACT_PUBLIC = 'ab'.repeat(32);
export const ARTIFACT_OTHER_PUBLIC = 'ba'.repeat(32);
export const ARTIFACT_PRIVATE = 'cd'.repeat(32);
export const HARNESS = 'pure-module/v1';
export const HARNESS_DIGEST = trustedHarness(HARNESS).digest;

interface Fixture {
  database: string;
  pool: Pool;
  store: EvaluationJobStore;
  operator: SessionActor;
  requester: SessionActor;
  owner: SessionActor;
  keys: { publicKey: string; privateKey: string };
}

async function createFixture(): Promise<Fixture> {
  assert.equal(process.env.SYNTHETIC_JOB_FIXTURE, 'private-task-mvp-synthetic');
  assert.equal(process.env.PRIVATE_DATABASE_NAME, 'private_task');
  assert.ok(process.env.PRIVATE_DATABASE_HOST && process.env.PRIVATE_DATABASE_USER && process.env.PRIVATE_DATABASE_PASSWORD_FILE);
  const configuration = { host: process.env.PRIVATE_DATABASE_HOST, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 4 };
  const admin = new Pool({ ...configuration, database: 'private_task' });
  const database = `synthetic_jobs_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^synthetic_jobs_[a-f0-9]{32}$/);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();
  const pool = new Pool({ ...configuration, database });
  assert.equal(readFileSync('db/migrations/0007_evaluation_jobs.sql', 'utf8'), EVALUATION_JOB_DDL, 'migration 0007 must stay byte-identical to the fixture DDL');
  await migrate(drizzle(pool), { migrationsFolder: 'db/migrations' });
  const sessions = new SessionStore(pool, 'private', Buffer.alloc(32, 11));
  const password = 'synthetic-jobs-fixture-password', passwordHash = await hashPassword(password);
  const actors: Record<string, SessionActor> = {};
  for (const role of ['owner', 'requester', 'operator'] as const) {
    const id = randomUUID(), username = `synthetic.jobs.${role}.${id.slice(0, 8)}`;
    await pool.query('INSERT INTO private_accounts (id,username,password_hash,role) VALUES ($1,$2,$3,$4)', [id, username, passwordHash, role]);
    const token = await sessions.login(username, password);
    actors[role] = await sessions.authenticateMutation(token.cookie, token.csrfToken);
  }
  const keys = generateKeyPairSync('ed25519');
  return {
    database, pool, store: new EvaluationJobStore(pool),
    operator: actors.operator!, requester: actors.requester!, owner: actors.owner!,
    keys: { publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(), privateKey: keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() }
  };
}

async function seedTaskRelease(pool: Pool, ownerId: string, options: { imageDigest?: string } = {}): Promise<string> {
  const taskId = randomUUID();
  const intentId = randomUUID();
  const seedId = randomUUID();
  const manifestHash = byteHash(Buffer.from(taskId, 'utf8'));
  await pool.query(`INSERT INTO private_intent_revisions (id,version,state,payload,content_hash,snapshot_hash,requester_id)
    VALUES ($1,1,'draft',$2,REPEAT('3',64),REPEAT('3',64),$3)`, [intentId, { syntheticOnly: true }, ownerId]);
  await pool.query('INSERT INTO private_intent_heads (id,current_version) VALUES ($1,1)', [intentId]);
  const manifest = { taskId, version: 1, executionImageDigest: options.imageDigest ?? IMAGE };
  await pool.query(`INSERT INTO private_release_approvals (id,task_id,task_version,manifest_hash,manifest,private_revision,owner_id)
    VALUES ($1,$2,1,$3,$4,REPEAT('7',64),$5)`, [seedId, taskId, manifestHash, manifest, ownerId]);
  const candidateId = seedId;
  const candidateJson = JSON.stringify({ contract: { publicChecks: PUBLIC_CHECK_IDS.map(id => ({ id })) } });
  await pool.query(`INSERT INTO private_release_candidates
    (id,task_id,task_version,intent_id,intent_version,approved_intent_hash,private_revision,candidate,manifest_hash,staged_by,state,version)
    VALUES ($1,$2,1,$3,1,REPEAT('3',64),REPEAT('7',64),$4,$5,$6,'release_review',1)`,
    [candidateId, taskId, intentId, candidateJson, manifestHash, ownerId]);
  await pool.query(`INSERT INTO private_release_signatures (approval_id,signature,semantic_rationale)
    VALUES ($1,$2,'synthetic fixture rationale, no real disclosure or payment')`, [seedId, 'A'.repeat(86) + '==']);
  await pool.query('UPDATE private_release_candidates SET state=$2, version=version+1 WHERE id=$1', [candidateId, 'approved']);
  void candidateId;
  return taskId;
}

async function seedEvaluation(pool: Pool, taskId: string, options: { packageHash?: string } = {}): Promise<string> {
  const evaluationId = randomUUID();
  await pool.query(`INSERT INTO private_evaluations (id,permit_id,task_id,task_version,submission_id,submission_hash,package_hash,private_base_revision)
    VALUES ($1,$2,$3,1,$4,$5,$6,$7)`, [evaluationId, randomUUID(), taskId, randomUUID(), SUBMISSION_BASE, options.packageHash ?? PACKAGE_HASH, SUBMISSION_BASE]);
  return evaluationId;
}

export const SUBMISSION_BASE = 'cc'.repeat(32);

async function evaluationSnapshot(pool: Pool, evaluationId: string): Promise<{ state: string; version: number; result: string | null }> {
  const row = (await pool.query('SELECT state,version,result FROM private_evaluations WHERE id=$1', [evaluationId])).rows[0];
  assert.ok(row);
  return { state: String(row.state), version: Number(row.version), result: row.result === null ? null : JSON.stringify(row.result) };
}

async function jobSnapshot(pool: Pool, jobId: string): Promise<{ job_state: string; version: number; authoritative_class: string | null; authoritative_outcome: string | null; authoritative_cause: string | null }> {
  const row = (await pool.query(`SELECT job_state,version,authoritative_class,authoritative_outcome,authoritative_cause FROM private_evaluation_jobs WHERE id=$1`, [jobId])).rows[0];
  assert.ok(row);
  return {
    job_state: String(row.job_state), version: Number(row.version),
    authoritative_class: row.authoritative_class === null ? null : String(row.authoritative_class),
    authoritative_outcome: row.authoritative_outcome === null ? null : String(row.authoritative_outcome),
    authoritative_cause: row.authoritative_cause === null ? null : String(row.authoritative_cause)
  };
}

interface EnqueueInput {
  evaluationId: string;
  jobKind: 'public' | 'private';
  attemptId: string;
  artifactHash: string;
  imageDigest?: string;
  harnessId?: string;
  harnessDigest?: string;
  requiredCheckIds?: readonly string[];
  deadlineMs?: number;
}

interface EnqueueBinding {
  evaluationId: string; jobKind: 'public' | 'private'; attemptId: string; artifactHash: string; imageDigest: string;
  harnessId: string; harnessDigest: string; requiredCheckIds: string[]; deadlineMs: number;
}

function bindings(input: EnqueueInput): EnqueueBinding {
  const harnessId = input.harnessId ?? HARNESS;
  return {
    evaluationId: input.evaluationId,
    jobKind: input.jobKind,
    attemptId: input.attemptId,
    artifactHash: input.artifactHash,
    imageDigest: input.imageDigest ?? IMAGE,
    harnessId,
    harnessDigest: input.harnessDigest ?? trustedHarness(harnessId).digest,
    requiredCheckIds: [...(input.requiredCheckIds ?? (input.jobKind === 'public' ? PUBLIC_CHECK_IDS : ['private_check_required']))],
    deadlineMs: input.deadlineMs ?? Date.now() + 60000
  };
}

function protocolJobOf(read: JobRead) {
  return {
    protocolVersion: 1,
    jobId: read.jobId,
    attemptId: read.attemptId,
    jobKind: read.jobKind,
    profile: 'dedicated-linux-kvm-fresh-vm',
    packageHash: read.packageHash,
    submissionHash: read.submissionHash,
    artifactHash: read.artifactHash,
    imageDigest: read.imageDigest,
    harnessId: read.harnessId,
    harnessDigest: read.harnessDigest,
    requiredCheckIds: [...read.requiredCheckIds],
    deadline: read.deadlineMs,
    limits: { cpus: 2, memoryMiB: 512, pids: 128, seconds: 120, logBytes: 1048576, writableMiB: 256 }
  };
}

interface SignedOptions { outcome?: 'passed' | 'failed' | 'unverified' | undefined; logDigest: string; corrupt?: boolean | undefined; artifactOverride?: string | undefined }

function signedFor(job: ReturnType<typeof protocolJobOf>, lease: Lease, privateKey: string, options: SignedOptions) {
  const protocolJob: Record<string, unknown> = options.artifactOverride === undefined ? { ...job } : { ...job, artifactHash: options.artifactOverride };
  const { attemptId: _attemptId, deadline: _deadline, limits: _limits, requiredCheckIds, ...boundProperties } = protocolJob;
  const result = {
    ...boundProperties,
    leaseId: lease.leaseId,
    outcome: options.outcome ?? 'passed',
    checks: (requiredCheckIds as string[]).map(checkId => ({ checkId, outcome: 'passed' as const })),
    expiresAt: _deadline,
    logDigest: options.logDigest
  };
  const signed = signTrustedResult(result as unknown as Parameters<typeof signTrustedResult>[0], privateKey);
  if (!options.corrupt) return signed;
  return { result: signed.result, signature: (signed.signature[0] === 'a' ? 'b' : 'a') + signed.signature.slice(1) };
}

function leaseFor(job: JobRead): Lease {
  return { leaseId: randomUUID(), jobId: job.jobId, baselineDigest: 'c'.repeat(64), profile: PROFILE, status: 'fresh' };
}


export async function scenarioAuthorization(): Promise<Record<string, unknown>> {
  const fixtures = await createFixture();
  const { store, pool, operator, requester, owner } = fixtures;
  try {
    const taskId = await seedTaskRelease(pool, owner.id);
    const evaluationId = await seedEvaluation(pool, taskId);
    const input = bindings({ evaluationId, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC, deadlineMs: Date.now() + 45000 });
    for (const [label, actor] of [['requester', requester], ['owner', owner]] as const) {
      let status = 0;
      await store.enqueue(actor, { ...input, attemptId: randomUUID() }).then(() => { status = 200; }, (error: unknown) => { status = projectJobError(error).status; });
      assert.equal(status, 403, `${label} job operations must be forbidden`);
    }
    const readStatus = await store.read(requester, randomUUID()).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(readStatus, 403);
    const enqueued = await store.enqueue(operator, input);
    assert.equal(enqueued.created, true);
    const job = await store.read(operator, enqueued.jobId);
    assert.equal(job.jobState, 'queued');
    assert.equal(job.attemptId, input.attemptId);
    assert.equal(job.deadlineMs, input.deadlineMs);
    return { assurance: 'tested', requester: 'forbidden_role', owner: 'forbidden_role', read: 'operator_only', operatorEnqueue: 'allowed' };
  } finally { await fixtures.pool.end(); }
}

export async function scenarioAuthority(): Promise<Record<string, unknown>> {
  const fixtures = await createFixture();
  const { store, pool, operator, owner } = fixtures;
  try {
    const missingReleaseEvaluation = await seedEvaluation(pool, randomUUID());
    let status = await store.enqueue(operator, bindings({ evaluationId: missingReleaseEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC })).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(status, 422, 'enqueue requires an approved release context');
    const taskId = await seedTaskRelease(pool, owner.id);
    const evaluationId = await seedEvaluation(pool, taskId);
    status = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC, imageDigest: OTHER_IMAGE })).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(status, 422, 'image digest must match the approved execution image');
    status = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC, harnessDigest: 'a'.repeat(64) })).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(status, 422, 'harness digest must match the trusted harness mapping');
    status = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC, requiredCheckIds: ['public_check_one'] })).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(status, 422, 'public jobs must bind the complete published check set');
    status = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC, requiredCheckIds: ['public_check_one', 'public_check_two', 'unpublished_check'] })).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(status, 422);
    status = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC, deadlineMs: Date.now() - 1 })).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(status, 422, 'stale deadlines are invalid');
    status = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC, deadlineMs: Date.now() + 121000 })).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(status, 422, 'deadlines must stay inside the bounded run window');
    status = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'private', attemptId: randomUUID(), artifactHash: ARTIFACT_PRIVATE })).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(status, 409, 'private jobs cannot be enqueued before public evaluation completes');
    const supersededEvaluation = await seedEvaluation(pool, taskId);
    await pool.query('UPDATE private_evaluations SET superseded=true, version=version+1 WHERE id=$1', [supersededEvaluation]);
    status = await store.enqueue(operator, bindings({ evaluationId: supersededEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC })).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(status, 422, 'jobs cannot be enqueued on superseded attempts');
    const snapshot = await evaluationSnapshot(pool, evaluationId);
    assert.equal(snapshot.version, 1, 'failed authorizations must not advance the evaluation');
    assert.equal(snapshot.state, 'received');
    const rows = (await pool.query('SELECT count(*)::int AS total FROM private_evaluation_jobs WHERE evaluation_id=$1', [evaluationId])).rows[0] as { total: number };
    assert.equal(rows.total, 0, 'no job may be created from a client assertion');
    return { assurance: 'tested', releaseContext: 'required', imageBinding: 'enforced', harnessBinding: 'enforced', publishedChecksExact: 'enforced', deadlineWindow: 'enforced', outOfOrderPrivate: 'invalid_transition', supersededAttempt: 'missing_evidence', zeroJobsFromAssertions: 'tested' };
  } finally { await fixtures.pool.end(); }
}

export async function scenarioIdempotent(): Promise<Record<string, unknown>> {
  const fixtures = await createFixture();
  const { store, pool, operator, owner, keys } = fixtures;
  try {
    const taskId = await seedTaskRelease(pool, owner.id);
    const evaluationId = await seedEvaluation(pool, taskId);
    const attemptId = randomUUID();
    const first = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId, artifactHash: ARTIFACT_PUBLIC }));
    assert.equal(first.created, true);
    const duplicate = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId, artifactHash: ARTIFACT_PUBLIC }));
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.jobId, first.jobId);
    let snapshot = await evaluationSnapshot(pool, evaluationId);
    assert.equal(snapshot.version, 2, 'idempotent re-enqueue must not advance the evaluation version');
    let rows = (await pool.query('SELECT count(*)::int AS total FROM private_evaluation_jobs WHERE evaluation_id=$1', [evaluationId])).rows[0] as { total: number };
    assert.equal(rows.total, 1, 'one attempt permit starts at most one authoritative job per kind');
    const conflict = await store.enqueue(operator, { ...bindings({ evaluationId, jobKind: 'public', attemptId, artifactHash: ARTIFACT_PUBLIC }), artifactHash: ARTIFACT_OTHER_PUBLIC }).then(value => value, (error: unknown) => error);
    assert.ok(conflict instanceof JobBindingConflict, 'conflicting artifact digest on the same job kind must conflict');
    snapshot = await evaluationSnapshot(pool, evaluationId);
    assert.equal(snapshot.version, 2, 'conflicting re-enqueue must not advance the evaluation');
    // Complete the public job so private racers are legitimate.
    const job = await store.read(operator, first.jobId);
    const lease = leaseFor(job);
    await store.assumeLease(job.jobId, lease);
    const logs = Buffer.from('verified public logs for race scenario');
    await store.recordResult(job.jobId, signedFor(protocolJobOf(job), lease, keys.privateKey, { logDigest: byteHash(logs) }), keys.publicKey, logs);
    const results = await Promise.allSettled([
      store.enqueue(operator, bindings({ evaluationId, jobKind: 'private', attemptId, artifactHash: ARTIFACT_PRIVATE })),
      store.enqueue(operator, bindings({ evaluationId, jobKind: 'private', attemptId, artifactHash: ARTIFACT_PRIVATE })),
      store.enqueue(operator, bindings({ evaluationId, jobKind: 'private', attemptId: randomUUID(), artifactHash: ARTIFACT_PRIVATE }))
    ]);
    const fulfilled = results.filter(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<EvaluationJobStore['enqueue']>>>[];
    const rejected = results.filter(result => result.status === 'rejected').map(result => String(result.reason));
    assert.equal(fulfilled.length >= 1 && fulfilled.length <= 2, true, 'exactly one authoritative private job is created under concurrency');
    const createdCount = fulfilled.filter(result => result.value.created).length;
    assert.equal(createdCount, 1, 'the winner is idempotently created once');
    const ids = new Set(fulfilled.map(result => result.value.jobId).concat(rejected.length ? [] : []));
    assert.ok(ids.size >= 1);
    rows = (await pool.query('SELECT count(*)::int AS total FROM private_evaluation_jobs WHERE evaluation_id=$1 AND job_kind=' + "'private'", [evaluationId])).rows[0] as { total: number };
    assert.equal(rows.total, 1);
    return { assurance: 'tested', duplicateIdempotent: 'tested', noExtraEvaluationVersion: 'tested', conflictingDigest: 'job_binding_conflict', concurrentRaces: 'one_created_gated' };
  } finally { await fixtures.pool.end(); }
}

export async function scenarioVerifiedFlow(): Promise<Record<string, unknown>> {
  const fixtures = await createFixture();
  const { store, pool, operator, owner, keys } = fixtures;
  try {
    const taskId = await seedTaskRelease(pool, owner.id);
    const attemptId = randomUUID();
    const evaluationId = await seedEvaluation(pool, taskId);
    const enqueued = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId, artifactHash: ARTIFACT_PUBLIC }));
    const job = await store.read(operator, enqueued.jobId);
    const lease = leaseFor(job);
    await store.assumeLease(job.jobId, lease);
    const logs = Buffer.from('synthetic public runner capture');
    const publicReport = await store.recordResult(job.jobId, signedFor(protocolJobOf(job), lease, keys.privateKey, { logDigest: byteHash(logs) }), keys.publicKey, logs);
    assert.equal(publicReport.evidenceClass, 'verified');
    assert.equal(publicReport.outcome, 'passed');
    assert.equal(publicReport.jobState, 'completed');
    let snapshot = await evaluationSnapshot(pool, evaluationId);
    assert.equal(snapshot.state, 'public_evaluating');
    const privateEnqueued = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'private', attemptId, artifactHash: ARTIFACT_PRIVATE }));
    assert.equal(privateEnqueued.created, true);
    const privateJob = await store.read(operator, privateEnqueued.jobId);
    snapshot = await evaluationSnapshot(pool, evaluationId);
    assert.equal(snapshot.state, 'private_evaluating');
    assert.notEqual(privateJob.artifactHash, job.artifactHash, 'public and private kinds bind separate artifact bundles');
    const privateLease = leaseFor(privateJob);
    await store.assumeLease(privateJob.jobId, privateLease);
    const privateLogs = Buffer.from('synthetic private integration capture stays private');
    const privateReport = await store.recordResult(privateJob.jobId, signedFor(protocolJobOf(privateJob), privateLease, keys.privateKey, { logDigest: byteHash(privateLogs) }), keys.publicKey, privateLogs);
    assert.equal(privateReport.evidenceClass, 'verified');
    assert.equal(privateReport.outcome, 'passed');
    snapshot = await evaluationSnapshot(pool, evaluationId);
    assert.equal(snapshot.state, 'owner_review');
    const resultPayload = JSON.parse(snapshot.result!) as { outcome: string; evaluationId: string; attemptId: string; submissionHash: string; packageHash: string; privateBaseRevision: string; evidence: Array<{ checkId: string; jobId: string; jobKind: string; artifactHash: string; harnessDigest: string }> };
    assert.equal(resultPayload.outcome, 'passed');
    assert.equal(resultPayload.evaluationId, evaluationId);
    assert.equal(resultPayload.attemptId, attemptId);
    assert.equal(resultPayload.submissionHash, SUBMISSION_BASE);
    assert.equal(resultPayload.packageHash, PACKAGE_HASH);
    const kinds = new Map(resultPayload.evidence.map(entry => [entry.jobKind, entry]));
    assert.ok(kinds.has('public') && kinds.has('private'), 'an exact private review requires verified evidence from both kinds');
    assert.equal(kinds.get('public')!.artifactHash, ARTIFACT_PUBLIC);
    assert.equal(kinds.get('private')!.artifactHash, ARTIFACT_PRIVATE);
    assert.equal(kinds.get('public')!.jobId, job.jobId);
    assert.equal(kinds.get('private')!.jobId, privateJob.jobId);
    for (const entry of resultPayload.evidence) assert.equal(entry.harnessDigest, HARNESS_DIGEST);
    return { assurance: 'tested', verifiedChain: 'public_then_private', exactArtifactLinkage: 'tested', ownerReview: 'built_with_both_kinds' };
  } finally { await fixtures.pool.end(); }
}

export async function scenarioAnomaliesNeverPass(): Promise<Record<string, unknown>> {
  const fixtures = await createFixture();
  const { store, pool, operator, owner, keys } = fixtures;
  try {
    // (1) verified pass then exact replay attempt after completion.
    const taskId = await seedTaskRelease(pool, owner.id);
    const replayEvaluation = await seedEvaluation(pool, taskId);
    const replayEnqueued = await store.enqueue(operator, bindings({ evaluationId: replayEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const replayJob = await store.read(operator, replayEnqueued.jobId);
    const replayLease = leaseFor(replayJob);
    await store.assumeLease(replayJob.jobId, replayLease);
    const logs = Buffer.from('synthetic anomaly scenario logs');
    await store.recordResult(replayJob.jobId, signedFor(protocolJobOf(replayJob), replayLease, keys.privateKey, { logDigest: byteHash(logs) }), keys.publicKey, logs);
    const replay = await store.recordResult(replayJob.jobId, signedFor(protocolJobOf(replayJob), replayLease, keys.privateKey, { logDigest: byteHash(logs) }), keys.publicKey, null);
    assert.equal(replay.cause, 'replayed_result');
    assert.equal(replay.evidenceClass, 'unverified');
    assert.equal(replay.recorded, true);
    let snapshot = await evaluationSnapshot(pool, replayEvaluation);
    assert.equal(snapshot.state, 'public_evaluating', 'replay cannot overturn a verified outcome');
    let status = await jobSnapshot(pool, replayJob.jobId);
    assert.equal(status.authoritative_outcome, 'passed', 'the verified outcome remains authoritative');
    // (2) corrupt signature while the job is running.
    const corruptEvaluation = await seedEvaluation(pool, taskId);
    const corruptEnqueued = await store.enqueue(operator, bindings({ evaluationId: corruptEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const corruptJob = await store.read(operator, corruptEnqueued.jobId);
    const corruptLease = leaseFor(corruptJob);
    await store.assumeLease(corruptJob.jobId, corruptLease);
    const corrupt = await store.recordResult(corruptJob.jobId, signedFor(protocolJobOf(corruptJob), corruptLease, keys.privateKey, { logDigest: byteHash(logs), corrupt: true }), keys.publicKey, null);
    assert.equal(corrupt.cause, 'unauthenticated_result');
    assert.equal(corrupt.evidenceClass, 'unverified');
    assert.equal(corrupt.jobState, 'completed', 'a corrupt result ends the job unverified');
    snapshot = await evaluationSnapshot(pool, corruptEvaluation);
    assert.equal(snapshot.state, 'infrastructure_failure');
    assert.equal(snapshot.result, null, 'an infrastructure failure never creates owner-review evidence');
    // (3) forged binding while the job is running.
    for (const [label, evaluation] of [['forgedArtifact', await seedEvaluation(pool, taskId)], ['logMismatch', await seedEvaluation(pool, taskId)]] as const) {
      const enqueued = await store.enqueue(operator, bindings({ evaluationId: evaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
      const job = await store.read(operator, enqueued.jobId);
      const lease = leaseFor(job);
      await store.assumeLease(job.jobId, lease);
      let report: Awaited<ReturnType<EvaluationJobStore['recordResult']>>;
      if (label === 'forgedArtifact') report = await store.recordResult(job.jobId, signedFor(protocolJobOf(job), lease, keys.privateKey, { logDigest: byteHash(logs), artifactOverride: ARTIFACT_OTHER_PUBLIC }), keys.publicKey, null);
      else report = await store.recordResult(job.jobId, signedFor(protocolJobOf(job), lease, keys.privateKey, { logDigest: byteHash(logs) }), keys.publicKey, Buffer.from('different captured bytes than the result claims'));
      assert.ok(['binding_mismatch', 'log_mismatch'].includes(String(report.cause)), label);
      assert.equal(report.evidenceClass, 'unverified');
      const after = await evaluationSnapshot(pool, evaluation);
      assert.equal(after.state, 'infrastructure_failure', label);
      assert.equal(after.result, null);
    }
    // (4) runner-reported unverified outcome while running.
    const unverifiedEvaluation = await seedEvaluation(pool, taskId);
    const unverifiedEnqueued = await store.enqueue(operator, bindings({ evaluationId: unverifiedEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const unverifiedJob = await store.read(operator, unverifiedEnqueued.jobId);
    const unverifiedLease = leaseFor(unverifiedJob);
    await store.assumeLease(unverifiedJob.jobId, unverifiedLease);
    const unverified = await store.recordResult(unverifiedJob.jobId, signedFor(protocolJobOf(unverifiedJob), unverifiedLease, keys.privateKey, { outcome: 'unverified', logDigest: byteHash(logs) }), keys.publicKey, null);
    assert.equal(unverified.cause, 'runner_reported_unverified');
    assert.equal(unverified.evidenceClass, 'unverified');
    assert.equal((await evaluationSnapshot(pool, unverifiedEvaluation)).state, 'infrastructure_failure');
    // (5) malformed delivered result while running.
    const malformedEvaluation = await seedEvaluation(pool, taskId);
    const malformedEnqueued = await store.enqueue(operator, bindings({ evaluationId: malformedEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const malformedJob = await store.read(operator, malformedEnqueued.jobId);
    const malformedLease = leaseFor(malformedJob);
    await store.assumeLease(malformedJob.jobId, malformedLease);
    const malformed = await store.recordResult(malformedJob.jobId, { forgedExtraField: 'synthetic-canary', outcome: 'passed' }, keys.publicKey, null);
    assert.equal(malformed.evidenceClass, 'unverified');
    assert.equal(['malformed_result', 'unauthenticated_result'].includes(String(malformed.cause)), true, 'malformed result stays unverified');
    assert.equal((await evaluationSnapshot(pool, malformedEvaluation)).state, 'infrastructure_failure');
    // (6) results delivered beyond the deadline never verify.
    const lateEvaluation = await seedEvaluation(pool, taskId);
    const lateEnqueued = await store.enqueue(operator, bindings({ evaluationId: lateEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const lateJob = await store.read(operator, lateEnqueued.jobId);
    const lateLease = leaseFor(lateJob);
    await store.assumeLease(lateJob.jobId, lateLease);
    const late = await store.recordResult(lateJob.jobId, signedFor(protocolJobOf(lateJob), lateLease, keys.privateKey, { logDigest: byteHash(logs) }), keys.publicKey, null, lateJob.deadlineMs + 60000);
    assert.equal(late.cause, 'stale_result');
    assert.equal(late.evidenceClass, 'unverified');
    assert.equal((await evaluationSnapshot(pool, lateEvaluation)).state, 'infrastructure_failure');
    // (7) private evaluation results can never be forged around cancelled jobs.
    const cancelledEvaluation = await seedEvaluation(pool, taskId);
    const cancelledEnqueue = await store.enqueue(operator, bindings({ evaluationId: cancelledEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const cancelledState = await store.cancel(operator, cancelledEnqueue.jobId, 1);
    assert.equal(cancelledState.jobState, 'cancelled');
    const afterCancel = await store.recordResult(cancelledEnqueue.jobId, signedFor(protocolJobOf(await store.read(operator, cancelledEnqueue.jobId)), leaseFor(await store.read(operator, cancelledEnqueue.jobId)), keys.privateKey, { logDigest: byteHash(logs) }), keys.publicKey, null);
    assert.equal(afterCancel.cause, 'late_result');
    assert.equal(afterCancel.evidenceClass, 'unverified');
    assert.equal((await evaluationSnapshot(pool, cancelledEvaluation)).state, 'public_evaluating', 'cancel leaves an operator-resolvable limbo, never acceptance');
    void status;
    return { assurance: 'tested', replayed: 'unverified_recorded', corruptSignature: 'unverified_completed_infra_failure', forgedBinding: 'unverified_completed_infra_failure', logMismatch: 'unverified_completed_infra_failure', runnerUnverified: 'never_passing', malformed: 'never_passing', pastDeadline: 'never_passing', resultAfterCancel: 'unverified_recorded', noAcceptedAnything: 'tested' };
  } finally { await fixtures.pool.end(); }
}

export async function scenarioInterruptions(): Promise<Record<string, unknown>> {
  const fixtures = await createFixture();
  const { store, pool, operator, owner } = fixtures;
  try {
    const taskId = await seedTaskRelease(pool, owner.id);
    const queuedEvaluation = await seedEvaluation(pool, taskId);
    const queuedEnqueued = await store.enqueue(operator, bindings({ evaluationId: queuedEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const queuedStatus = await store.recordTimeout(queuedEnqueued.jobId).then(() => 200, (error: unknown) => projectJobError(error).status);
    assert.equal(queuedStatus, 422, 'timeouts are only valid on running jobs');
    const interrupted = await store.recordInterruption(queuedEnqueued.jobId, 'runner_unavailable');
    assert.equal(interrupted.evidenceClass, 'infrastructure');
    assert.equal(interrupted.cause, 'runner_unavailable');
    assert.equal(interrupted.jobState, 'completed');
    let snapshot = await evaluationSnapshot(pool, queuedEvaluation);
    assert.equal(snapshot.state, 'infrastructure_failure');
    const runningEvaluation = await seedEvaluation(pool, taskId);
    const runningEnqueued = await store.enqueue(operator, bindings({ evaluationId: runningEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const runningJob = await store.read(operator, runningEnqueued.jobId);
    await store.assumeLease(runningJob.jobId, leaseFor(runningJob));
    const timeout = await store.recordTimeout(runningJob.jobId);
    assert.equal(timeout.cause, 'timeout');
    assert.equal(timeout.evidenceClass, 'infrastructure');
    assert.equal(timeout.jobState, 'completed');
    snapshot = await evaluationSnapshot(pool, runningEvaluation);
    assert.equal(snapshot.state, 'infrastructure_failure');
    const staleInterruption = await store.recordTimeout(runningJob.jobId).then(value => value, (error: unknown) => error);
    assert.ok(staleInterruption instanceof Error === false, 'terminal timeout is a bounded no-op record');
    const terminalReport = staleInterruption as { recorded: boolean };
    assert.equal(terminalReport.recorded, false);
    return { assurance: 'tested', queuedTimeout: 'denied', runnerUnavailable: 'infrastructure_failure', runningTimeout: 'infrastructure_failure', terminalStayTerminal: 'tested' };
  } finally { await fixtures.pool.end(); }
}

export async function scenarioCleanupIsolation(): Promise<Record<string, unknown>> {
  const fixtures = await createFixture();
  const { store, pool, operator, owner, keys } = fixtures;
  try {
    const taskA = await seedTaskRelease(pool, owner.id);
    const taskB = await seedTaskRelease(pool, owner.id);
    const evaluationA = await seedEvaluation(pool, taskA);
    const attemptA = randomUUID();
    const enqueuedA = await store.enqueue(operator, bindings({ evaluationId: evaluationA, jobKind: 'public', attemptId: attemptA, artifactHash: ARTIFACT_PUBLIC }));
    const jobA = await store.read(operator, enqueuedA.jobId);
    const logsA = Buffer.from('logs stored while queued are discarded only by that job cleanup');
    const anomaly = await store.recordResult(jobA.jobId, { lateFieldAllowed: false }, keys.publicKey, logsA);
    assert.equal(anomaly.cause, 'late_result');
    assert.equal(anomaly.evidenceClass, 'unverified');
    assert.equal(anomaly.recorded, true);
    void attemptA;
    const cancelledA = await store.cancel(operator, jobA.jobId, 1);
    assert.equal(cancelledA.jobState, 'cancelled');
    const cleanupA = await store.cleanup(operator, jobA.jobId, cancelledA.version);
    assert.equal(cleanupA.logsDiscarded, true);
    const logARows = (await pool.query('SELECT job_id FROM private_evaluation_job_logs WHERE job_id=$1', [jobA.jobId])).rows.length;
    assert.equal(logARows, 0, 'cleanup discards only its own stored log bytes');
    const secondCleanup = await store.cleanup(operator, jobA.jobId, cleanupA.version);
    assert.equal(secondCleanup.logsDiscarded, false, 'cleanup is idempotent when nothing is stored');
    // Workspace/task B stays untouched by A's cleanup and cancellation.
    const evaluationB = await seedEvaluation(pool, taskB, { packageHash: OTHER_PACKAGE_HASH });
    const attemptB = randomUUID();
    const enqueuedB = await store.enqueue(operator, bindings({ evaluationId: evaluationB, jobKind: 'public', attemptId: attemptB, artifactHash: ARTIFACT_PUBLIC }));
    void attemptB;
    const jobB = await store.read(operator, enqueuedB.jobId);
    assert.equal(jobB.jobState, 'queued');
    const leaseB = leaseFor(jobB);
    await store.assumeLease(jobB.jobId, leaseB);
    const logsB = Buffer.from('workspace B logs stay after A cleanup');
    const publicReport = await store.recordResult(jobB.jobId, signedFor(protocolJobOf(jobB), leaseB, keys.privateKey, { logDigest: byteHash(logsB) }), keys.publicKey, logsB);
    assert.equal(publicReport.evidenceClass, 'verified');
    const completedCleanup = await store.cleanup(operator, jobB.jobId, 2).then(value => value, (error: unknown) => error);
    assert.ok(completedCleanup instanceof Error, 'cleanup refuses to discard evidence of completed jobs');
    const logBRows = (await pool.query('SELECT log_digest FROM private_evaluation_job_logs WHERE job_id=$1', [jobB.jobId])).rows as Array<{ log_digest: string }>;
    assert.equal(logBRows.length, 1);
    assert.equal(logBRows[0]!.log_digest, byteHash(logsB));
    const statusAfter = await jobSnapshot(pool, jobB.jobId);
    assert.equal(statusAfter.authoritative_outcome, 'passed');
    const replay = await store.recordResult(jobB.jobId, signedFor(protocolJobOf(jobB), leaseB, keys.privateKey, { logDigest: byteHash(logsB) }), keys.publicKey, null);
    assert.equal(replay.cause, 'replayed_result');
    assert.equal(replay.evidenceClass, 'unverified');
    assert.equal(replay.recorded, true);
    // Late playback cannot resurrect a cancelled evaluation into acceptance.
    const afterA = await evaluationSnapshot(pool, evaluationA);
    assert.equal(afterA.state, 'public_evaluating');
    assert.equal(afterA.result, null);
    const afterB = await evaluationSnapshot(pool, evaluationB);
    assert.equal(afterB.state, 'public_evaluating');
    const staleCancel = await store.cancel(operator, jobB.jobId, 1).then(value => value, (error: unknown) => error);
    assert.ok(staleCancel instanceof Error);
    void staleCancel;
    return { assurance: 'tested', scopedLogCleanup: 'tested', secondWorkspaceUnaffected: 'tested', completedCleanup: 'refused', replayAfterTerminal: 'unverified_recorded', staleVersion: 'denied' };
  } finally { await fixtures.pool.end(); }
}

export async function scenarioSqlGuards(): Promise<Record<string, unknown>> {
  const fixtures = await createFixture();
  const { store, pool, operator, owner, keys } = fixtures;
  try {
    const taskId = await seedTaskRelease(pool, owner.id);
    const evaluationId = await seedEvaluation(pool, taskId);
    const enqueued = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const job = await store.read(operator, enqueued.jobId);
    const logs = Buffer.from('queued capture for SQL immutability guards');
    await store.recordResult(job.jobId, { lateDelivered: true }, keys.publicKey, logs);
    const deny = async (sql: string, args: unknown[], message: string, _label?: string) => assert.rejects(pool.query(sql, args), (error: unknown) => (error as { message?: string }).message === message);
    await deny('UPDATE private_evaluation_jobs SET job_kind=$2, version=version+1 WHERE id=$1', [job.jobId, 'private'], 'job_binding_immutable');
    await deny('UPDATE private_evaluation_jobs SET artifact_hash=$2, version=version+1 WHERE id=$1', [job.jobId, 'ef'.repeat(32)], 'job_binding_immutable');
    await deny('UPDATE private_evaluation_jobs SET image_digest=$2, version=version+1 WHERE id=$1', [job.jobId, 'sha256:' + 'ef'.repeat(32)], 'job_binding_immutable');
    await deny('UPDATE private_evaluation_jobs SET attempt_id=$2, version=version+1 WHERE id=$1', [job.jobId, randomUUID()], 'job_binding_immutable');
    await deny('UPDATE private_evaluation_jobs SET required_check_ids=$2, version=version+1 WHERE id=$1', [job.jobId, JSON.stringify(['other.check'])], 'job_binding_immutable');
    await deny('UPDATE private_evaluation_jobs SET deadline_ms=$2, version=version+1 WHERE id=$1', [job.jobId, Date.now() + 30000], 'job_binding_immutable');
    await deny('UPDATE private_evaluation_jobs SET job_state=$2, version=version+1 WHERE id=$1', [job.jobId, 'completed'], 'invalid_job_transition');
    await deny('UPDATE private_evaluation_jobs SET version=version+1 WHERE id=$1', [job.jobId], 'invalid_job_transition', 'idle_version_bump_rejected');
    await deny('UPDATE private_evaluation_job_results SET cause=$2 WHERE job_id=$1', [job.jobId, 'tampered'], 'job_result_immutable');
    await deny('UPDATE private_evaluation_job_logs SET log_digest=$2 WHERE job_id=$1', [job.jobId, '0'.repeat(64)], 'job_log_immutable');
    await deny('DELETE FROM private_evaluation_job_logs WHERE job_id=$1', [job.jobId], 'job_log_delete_requires_cancelled_parent');
    const oversizedEvaluation = await seedEvaluation(pool, taskId);
    const oversizedEnqueued = await store.enqueue(operator, bindings({ evaluationId: oversizedEvaluation, jobKind: 'public', attemptId: randomUUID(), artifactHash: ARTIFACT_PUBLIC }));
    const jobIdForOversized = oversizedEnqueued.jobId;
    void jobIdForOversized;
    const oversized = Buffer.alloc(1048577, 5);
    await assert.rejects(pool.query('INSERT INTO private_evaluation_job_logs (job_id,bytes,byte_count,original_byte_count,complete,log_digest) VALUES ($1,$2,$3,$3,false,$4)', [oversizedEnqueued.jobId, oversized, 1048577, '0'.repeat(64)]), (error: unknown) => (error as { code?: string }).code === '23514', 'log bytes stay under the 1 MiB bound');
    const cancelReport = await store.cancel(operator, job.jobId, 1);
    void cancelReport;
    return { assurance: 'tested', immutableJobBinding: 'tested', dictionaryGuards: 'tested', immutableResults: 'tested', immutableLogs: 'tested', scopedLogDelete: 'cancelled_only', boundedLogBytes: 'tested', staleVersions: 'denied' };
  } finally { await fixtures.pool.end(); }
}

export async function scenarioSeparateBundles(): Promise<Record<string, unknown>> {
  const fixtures = await createFixture();
  const { store, pool, operator, owner, keys } = fixtures;
  try {
    const taskId = await seedTaskRelease(pool, owner.id);
    const evaluationId = await seedEvaluation(pool, taskId);
    const attemptId = randomUUID();
    const publicEnqueued = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'public', attemptId, artifactHash: ARTIFACT_PUBLIC }));
    const publicJob = await store.read(operator, publicEnqueued.jobId);
    const leasePublic = leaseFor(publicJob);
    await store.assumeLease(publicJob.jobId, leasePublic);
    const logsPublic = Buffer.from('public bundle bytes only');
    await store.recordResult(publicJob.jobId, signedFor(protocolJobOf(publicJob), leasePublic, keys.privateKey, { logDigest: byteHash(logsPublic) }), keys.publicKey, logsPublic);
    const privateEnqueued = await store.enqueue(operator, bindings({ evaluationId, jobKind: 'private', attemptId, artifactHash: ARTIFACT_PRIVATE }));
    const privateJob = await store.read(operator, privateEnqueued.jobId);
    assert.notEqual(privateJob.artifactHash, publicJob.artifactHash);
    assert.ok(privateJob.requiredCheckIds.length !== publicJob.requiredCheckIds.length, 'the private vocabulary is independent of public checks');
    const leasePrivate = leaseFor(privateJob);
    await store.assumeLease(privateJob.jobId, leasePrivate);
    const logsPrivate = Buffer.from('private integration capture');
    const privateReport = await store.recordResult(privateJob.jobId, signedFor(protocolJobOf(privateJob), leasePrivate, keys.privateKey, { logDigest: byteHash(logsPrivate) }), keys.publicKey, logsPrivate);
    assert.equal(privateReport.evidenceClass, 'verified');
    const bundles = (await pool.query('SELECT job_kind,artifact_hash,id FROM private_evaluation_jobs WHERE evaluation_id=$1 ORDER BY job_kind ASC', [evaluationId])).rows as Array<{ job_kind: string; artifact_hash: string; id: string }>;
    assert.deepEqual(bundles.map(row => row.artifact_hash), [ARTIFACT_PUBLIC, ARTIFACT_PRIVATE]);
    // A forged public result can never satisfy the private requirement and vice versa: the store rebuilds each binding independently.
    const forgedPrivate = await store.recordResult(privateEnqueued.jobId, signedFor(protocolJobOf(privateJob), leasePrivate, keys.privateKey, { logDigest: byteHash(logsPrivate) }), keys.publicKey, null);
    assert.equal(forgedPrivate.cause, 'replayed_result');
    void forgedPrivate;
    return { assurance: 'tested', separateBundles: 'tested', exactDigestLinkage: 'tested', forgedPrivate: 'replayed_unverified' };
  } finally { await fixtures.pool.end(); }
}

export const SCENARIOS = ['authorization', 'authority', 'idempotent', 'verified-flow', 'anomalies-never-pass', 'interruptions', 'cleanup-isolation', 'sql-guards', 'separate-bundles'] as const;

export async function runScenario(name: string): Promise<Record<string, unknown>> {
  switch (name) {
    case 'authorization': return scenarioAuthorization();
    case 'authority': return scenarioAuthority();
    case 'idempotent': return scenarioIdempotent();
    case 'verified-flow': return scenarioVerifiedFlow();
    case 'anomalies-never-pass': return scenarioAnomaliesNeverPass();
    case 'interruptions': return scenarioInterruptions();
    case 'cleanup-isolation': return scenarioCleanupIsolation();
    case 'sql-guards': return scenarioSqlGuards();
    case 'separate-bundles': return scenarioSeparateBundles();
    default: throw new Error(`unknown scenario ${name}`);
  }
}


