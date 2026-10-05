import assert from 'node:assert/strict';
import { docker } from './docker.mjs';
import { composeArguments } from './synthetic-runtime.mjs';

let input = ''; for await (const chunk of process.stdin) { input += chunk.toString(); if (input.length > 65536) throw new Error('Fixture input too large.'); }
const contract = JSON.parse(input);
async function run(service, source) {
  const result = await docker([...composeArguments, 'exec', '-T', '--workdir', `/workspace/services/${service}`, service, 'node', '--input-type=module', '-e', source]);
  assert.equal(result.code, 0, `${service} persistence verification failed.`);
  return JSON.parse(result.stdout);
}
const privateResult = await run('private-api', `
  import assert from 'node:assert/strict'; import fs from 'node:fs'; import { randomUUID } from 'node:crypto'; import { Pool } from 'pg'; import { PrivateIntentStore } from './dist/intent-store.js';
  const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: fs.readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 3 });
  try {
    const owner = (await pool.query("SELECT id FROM private_accounts WHERE username = 'synthetic.bootstrap.owner' AND role = 'owner'")).rows[0].id;
    const requester = randomUUID(); const other = randomUUID();
    for (const id of [requester, other]) await pool.query("INSERT INTO private_accounts (id, username, password_hash, role) VALUES ($1, $2, 'synthetic-test-only-hash', 'requester')", [id, 'synthetic.requester.' + id.slice(0, 8)]);
    const id = randomUUID(); const store = new PrivateIntentStore(pool);
    const draft = { schemaVersion: 1, intentId: id, version: 1, state: 'draft', goal: 'Synthetic workflow guard probe', snapshotHash: 'a'.repeat(64), facts: [], evidence: [], decisions: [{ id: 'choice', question: 'Synthetic required decision?', required: true, answer: null }], assumptions: [], unknowns: [], acceptanceExamples: [], scope: { included: ['Synthetic test only'], excluded: ['Real customer approval'] } };
    await store.create(requester, draft);
    await assert.rejects(store.transition(requester, id, 1, 'ready_for_approval'));
    await assert.rejects(store.revise(other, { ...draft, version: 2 }, 1));
    await store.revise(requester, { ...draft, version: 2, decisions: [{ ...draft.decisions[0], answer: 'resolved' }] }, 1);
    const ready = await store.transition(requester, id, 2, 'ready_for_approval');
    await assert.rejects(store.transition(requester, id, 2, 'approved', ready.contentHash));
    await assert.rejects(store.transition(owner, id, 2, 'approved', 'b'.repeat(64)));
    await store.transition(owner, id, 2, 'approved', ready.contentHash);
    await assert.rejects(pool.query('UPDATE private_intent_revisions SET payload = $2 WHERE id = $1 AND version = 2', [id, { ...draft, goal: 'changed' }]), error => error.message === 'approved_revision_immutable');
    await assert.rejects(pool.query('UPDATE private_intent_revisions SET content_hash = $2 WHERE id = $1 AND version = 2', [id, 'b'.repeat(64)]));
    await store.revise(requester, { ...draft, version: 3, goal: 'New synthetic revision' }, 2);
    const results = await Promise.allSettled([store.revise(requester, { ...draft, version: 4, goal: 'Synthetic edit A' }, 3), store.revise(requester, { ...draft, version: 4, goal: 'Synthetic edit B' }, 3)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    await assert.rejects(pool.query('UPDATE private_intent_heads SET current_version=2 WHERE id=$1', [id]), error => error.message === 'stale_intent_head');
    const approved = (await pool.query('SELECT content_hash, approved_hash, state FROM private_intent_revisions WHERE id = $1 AND version = 2', [id])).rows[0]; assert.equal(approved.state, 'approved'); assert.equal(approved.approved_hash, ready.contentHash); assert.equal(approved.content_hash, ready.contentHash);
    const evaluationId = randomUUID(); const eventId = randomUUID(); const acceptanceId = randomUUID();
    const seedEvaluation = async evalId => {
      await pool.query('INSERT INTO private_evaluations (id, permit_id, task_id, task_version, submission_id, submission_hash, package_hash, private_base_revision) VALUES ($1,$2,$3,1,$4,$5,$5,$5)', [evalId, randomUUID(), randomUUID(), randomUUID(), 'a'.repeat(64)]);
      for (const state of ['public_evaluating', 'private_evaluating']) await pool.query('UPDATE private_evaluations SET state=$2,version=version+1 WHERE id=$1', [evalId, state]);
      await pool.query("UPDATE private_evaluations SET state='owner_review',result=$2,version=version+1 WHERE id=$1", [evalId, { outcome: 'passed', syntheticConstraintFixture: true }]);
    };
    await seedEvaluation(evaluationId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO private_acceptances (id, event_id, evaluation_id, owner_id, submission_hash, package_hash, private_base_revision, candidate_diff_hash) VALUES ($1, $2, $3, $4, $5, $5, $5, $5)', [acceptanceId, eventId, evaluationId, owner, 'a'.repeat(64)]);
      await assert.rejects(client.query('COMMIT'), error => error.code === '23503');
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query('INSERT INTO private_acceptances (id, event_id, evaluation_id, owner_id, submission_hash, package_hash, private_base_revision, candidate_diff_hash) VALUES ($1, $2, $3, $4, $5, $5, $5, $5)', [acceptanceId, eventId, evaluationId, owner, 'a'.repeat(64)]);
      await client.query("INSERT INTO private_payment_obligations (event_id, acceptance_id, payee_id, reason, currency, amount_minor) VALUES ($1, $2, $3, 'synthetic constraint test, not a real obligation', 'USD', 0)", [eventId, acceptanceId, randomUUID()]);
      await client.query('COMMIT');
    } finally { client.release(); }
    const mismatchedEvaluation = randomUUID();
    await seedEvaluation(mismatchedEvaluation);
    await assert.rejects(pool.query('INSERT INTO private_acceptances (id, event_id, evaluation_id, owner_id, submission_hash, package_hash, private_base_revision, candidate_diff_hash) VALUES ($1, $2, $3, $4, $5, $6, $5, $5)', [randomUUID(), randomUUID(), mismatchedEvaluation, owner, 'a'.repeat(64), 'b'.repeat(64)]), error => error.code === '23503' && error.constraint.startsWith('private_acceptances_evaluation_id_submission_hash'));
    console.log(JSON.stringify({ roleAndResourceGuards: 'tested', unresolvedApproval: 'denied', exactApprovalHash: 'tested', approvedRevisionImmutable: 'tested', concurrentRevision: 'one_winner', priorApprovalPreserved: true, acceptanceRequiresAtomicPayable: 'tested', exactEvaluationBinding: 'tested', evaluationAuthority: 'unverified_synthetic_constraint_fixture_only' }));
  } finally { await pool.end(); }
`);
const externalResult = await run('external-api', `
  import assert from 'node:assert/strict'; import fs from 'node:fs'; import { randomUUID } from 'node:crypto'; import { Pool } from 'pg'; import { ExternalReservationStore } from './dist/reservation-store.js';
  const contract = ${JSON.stringify(contract)}; contract.taskId = randomUUID(); contract.lineageId = randomUUID();
  const pool = new Pool({ host: process.env.EXTERNAL_DATABASE_HOST, database: process.env.EXTERNAL_DATABASE_NAME, user: process.env.EXTERNAL_DATABASE_USER, password: fs.readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 3 });
  try {
    const actors = [randomUUID(), randomUUID()]; for (const id of actors) await pool.query("INSERT INTO external_accounts (id, username, password_hash) VALUES ($1, $2, 'synthetic-test-only-hash')", [id, 'synthetic.contributor.' + id.slice(0, 8)]);
    await pool.query('INSERT INTO external_task_lineages (id) VALUES ($1)', [contract.lineageId]);
    await pool.query('INSERT INTO external_task_versions (id, version, lineage_id, package_hash, contract, listing, envelope) VALUES ($1, 1, $2, $3, $4, $5, $6)', [contract.taskId, contract.lineageId, 'a'.repeat(64), contract, { syntheticOnly: true }, { syntheticOnly: true }]);
    const store = new ExternalReservationStore(pool);
    const outcomes = await Promise.allSettled(actors.map(actor => store.reserve(actor, contract.taskId, 1))); assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    const winnerIndex = outcomes.findIndex(result => result.status === 'fulfilled'); const winner = outcomes[winnerIndex].value;
    await assert.rejects(store.cancelOwn(actors[1 - winnerIndex], winner.reservationId, 1));
    await assert.rejects(store.cancelOwn(actors[winnerIndex], winner.reservationId, 99));
    await assert.rejects(pool.query("UPDATE external_reservations SET expires_at = expires_at + interval '1 day', version = version + 1 WHERE id = $1", [winner.reservationId]));
    await assert.rejects(pool.query("UPDATE external_task_versions SET package_hash = $2 WHERE id = $1 AND version = 1", [contract.taskId, 'b'.repeat(64)]));
    await store.cancelOwn(actors[winnerIndex], winner.reservationId, 1);
    const row = (await pool.query('SELECT state, expires_at FROM external_reservations WHERE id = $1', [winner.reservationId])).rows[0]; assert.equal(row.state, 'cancelled'); assert.equal(row.expires_at.toISOString(), winner.expiresAt.toISOString());
    console.log(JSON.stringify({ concurrentReservation: 'one_winner', crossContributor: 'denied', staleVersion: 'denied', immutableExpiryAndPackage: 'tested', cancellationPreservesExpiry: true }));
  } finally { await pool.end(); }
`);
console.log(JSON.stringify({ assurance: 'tested', scope: 'synthetic SQL/store workflow guards, not full auth/publication or runner acceptance', private: privateResult, external: externalResult }, null, 2));
