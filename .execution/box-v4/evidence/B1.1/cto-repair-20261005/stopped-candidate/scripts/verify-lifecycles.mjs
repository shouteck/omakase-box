import assert from 'node:assert/strict';
import { docker } from './docker.mjs';
import { composeArguments } from './synthetic-runtime.mjs';

let input = ''; for await (const chunk of process.stdin) { input += chunk.toString(); if (input.length > 65536) throw new Error('Fixture input too large.'); }
const contract = JSON.parse(input);
async function run(service, source) {
  const result = await docker([...composeArguments, 'exec', '-T', '--workdir', `/workspace/services/${service}`, service, 'node', '--input-type=module', '-e', source]);
  assert.equal(result.code, 0, `${service} lifecycle guard failed: ${result.stderr.slice(-3000)}`);
  return JSON.parse(result.stdout);
}
const privateResult = await run('private-api', `
  import assert from 'node:assert/strict'; import fs from 'node:fs'; import { randomUUID } from 'node:crypto'; import { Pool } from 'pg';
  const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: fs.readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 2 });
  const deny = (sql, args, message) => assert.rejects(pool.query(sql, args), error => error.message === message);
  try {
    const id = randomUUID(); const hash = 'a'.repeat(64);
    await pool.query('INSERT INTO private_evaluations (id, permit_id, task_id, task_version, submission_id, submission_hash, package_hash, private_base_revision) VALUES ($1,$2,$3,1,$4,$5,$5,$5)', [id, randomUUID(), randomUUID(), randomUUID(), hash]);
    await deny("UPDATE private_evaluations SET state='accepted', version=version+1 WHERE id=$1", [id], 'invalid_evaluation_transition');
    await deny("UPDATE private_evaluations SET state='public_evaluating' WHERE id=$1", [id], 'stale_evaluation_version');
    await deny("UPDATE private_evaluations SET package_hash=$2, version=version+1 WHERE id=$1", [id, 'b'.repeat(64)], 'evaluation_binding_immutable');
    await pool.query("UPDATE private_evaluations SET state='public_evaluating', version=version+1 WHERE id=$1", [id]);
    await pool.query("UPDATE private_evaluations SET state='private_evaluating', version=version+1 WHERE id=$1", [id]);
    await deny("UPDATE private_evaluations SET state='owner_review', version=version+1 WHERE id=$1", [id], 'completed_evaluation_required');
    await pool.query("UPDATE private_evaluations SET state='owner_review', result=$2, version=version+1 WHERE id=$1", [id, { outcome: 'passed', syntheticConstraintFixture: true }]);
    await pool.query('UPDATE private_evaluations SET superseded=true, version=version+1 WHERE id=$1', [id]);
    await deny('UPDATE private_evaluations SET superseded=false, version=version+1 WHERE id=$1', [id], 'supersession_irreversible');
    const event = randomUUID();
    await pool.query("INSERT INTO private_payment_obligations (event_id,payee_id,reason,currency,amount_minor) VALUES ($1,$2,'synthetic compensation constraint fixture','USD',0)", [event, randomUUID()]);
    await deny('UPDATE private_payment_obligations SET amount_minor=1 WHERE event_id=$1', [event], 'obligation_terms_immutable');
    await deny("UPDATE private_payment_obligations SET state='settlement_recorded' WHERE event_id=$1", [event], 'settlement_reference_required');
    await pool.query("UPDATE private_payment_obligations SET state='settlement_recorded',settlement_reference='synthetic-no-money-moved' WHERE event_id=$1", [event]);
    await deny("UPDATE private_payment_obligations SET state='due' WHERE event_id=$1", [event], 'settlement_immutable');
    const feedbackId = randomUUID(); const feedback = { schemaVersion: 1, publicId: feedbackId, category: 'received', releasePolicyVersion: 1, publicCheckDetails: [] };
    await pool.query('INSERT INTO private_feedback_outbox (event_id,submission_id,payload) VALUES ($1,$2,$3)', [feedbackId, randomUUID(), feedback]);
    await pool.query('INSERT INTO private_feedback_outbox (event_id,submission_id,payload) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [feedbackId, randomUUID(), feedback]);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM private_feedback_outbox WHERE event_id=$1', [feedbackId])).rows[0].count, 1);
    await deny('UPDATE private_feedback_outbox SET payload=$2 WHERE event_id=$1', [feedbackId, { ...feedback, category: 'accepted' }], 'outbox_event_immutable');
    await pool.query('UPDATE private_feedback_outbox SET delivered_at=now() WHERE event_id=$1', [feedbackId]);
    await deny('UPDATE private_feedback_outbox SET delivered_at=NULL WHERE event_id=$1', [feedbackId], 'outbox_delivery_immutable');
    console.log(JSON.stringify({ lifecycle: 'tested', immutableEvaluationBinding: 'tested', supersession: 'tested', immutableObligationAndSettlement: 'tested', outboxReplay: 'one_event', authority: 'synthetic_schema_test_not_runner_verdict' }));
  } finally { await pool.end(); }
`);
const externalResult = await run('external-api', `
  import assert from 'node:assert/strict'; import fs from 'node:fs'; import { randomUUID } from 'node:crypto'; import { Pool } from 'pg';
  const contract = ${JSON.stringify(contract)}; contract.taskId=randomUUID(); contract.lineageId=randomUUID();
  const pool = new Pool({ host: process.env.EXTERNAL_DATABASE_HOST, database: process.env.EXTERNAL_DATABASE_NAME, user: process.env.EXTERNAL_DATABASE_USER, password: fs.readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 2 });
  const deny = (sql,args,message) => assert.rejects(pool.query(sql,args), error => error.message === message);
  try {
    const actor=randomUUID(); const other=randomUUID(); const reservation=randomUUID(); const sub=randomUUID(); const permit=randomUUID(); const idem=randomUUID(); const hash='a'.repeat(64);
    for(const id of [actor,other]) await pool.query("INSERT INTO external_accounts (id,username,password_hash) VALUES ($1,$2,'synthetic-test-only')", [id,'synthetic.lifecycle.'+id.slice(0,8)]);
    await pool.query('INSERT INTO external_task_lineages (id) VALUES ($1)', [contract.lineageId]);
    await pool.query('INSERT INTO external_task_versions (id,version,lineage_id,package_hash,contract,listing,envelope) VALUES ($1,1,$2,$3,$4,$5,$5)', [contract.taskId,contract.lineageId,hash,contract,{syntheticOnly:true}]);
    await pool.query("INSERT INTO external_reservations (id,task_id,task_version,package_hash,contributor_id,terms_hash,expires_at) VALUES ($1,$2,1,$3,$4,$3,now()+interval '1 hour')", [reservation,contract.taskId,hash,actor]);
    await deny("UPDATE external_reservations SET state='accepted',version=version+1 WHERE id=$1", [reservation], 'invalid_reservation_transition');
    const envelope={schemaVersion:1,permitId:permit,taskId:contract.taskId,lineageId:contract.lineageId,taskVersion:1,reservationId:reservation,submissionId:sub,packageDigest:hash,submissionHash:hash,sequence:1,issuedAt:new Date().toISOString(),signature:'A'.repeat(86)+'=='};
    const insert='INSERT INTO external_submissions (id,reservation_id,contributor_id,task_id,task_version,package_hash,submission_hash,patch,idempotency_key,permit_id,permit) VALUES ($1,$2,$3,$4,1,$5,$5,$6,$7,$8,$9)';
    await deny(insert,[randomUUID(),reservation,other,contract.taskId,hash,'synthetic patch',randomUUID(),randomUUID(),envelope],'valid_owned_reservation_required');
    await deny(insert,[sub,reservation,actor,contract.taskId,hash,'synthetic patch',idem,permit,{...envelope,packageDigest:'b'.repeat(64)}],'permit_binding_mismatch');
    const client=await pool.connect();
    try {
      await client.query('BEGIN'); await client.query(insert,[sub,reservation,actor,contract.taskId,hash,'synthetic patch',idem,permit,envelope]); await client.query('INSERT INTO external_attempt_outbox (permit_id,payload) VALUES ($1,$2)',[permit,envelope]); await assert.rejects(client.query('COMMIT'), error => error.message === 'attempt_reservation_commit_required'); await client.query('ROLLBACK');
      await client.query('BEGIN'); await client.query(insert,[sub,reservation,actor,contract.taskId,hash,'synthetic patch',idem,permit,envelope]); await client.query('INSERT INTO external_attempt_outbox (permit_id,payload) VALUES ($1,$2)',[permit,envelope]); await client.query("UPDATE external_reservations SET state='in_review',version=version+1 WHERE id=$1",[reservation]); await client.query('COMMIT'); } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await deny("UPDATE external_submissions SET state='accepted',version=version+1 WHERE id=$1",[sub],'invalid_submission_transition');
    await deny('UPDATE external_submissions SET reservation_id=$2,version=version+1 WHERE id=$1',[sub,randomUUID()],'submission_binding_immutable');
    await deny("UPDATE external_submissions SET state='public_evaluating' WHERE id=$1",[sub],'stale_submission_version');
    for(const state of ['public_evaluating','private_evaluating','owner_review','changes_required']) await pool.query('UPDATE external_submissions SET state=$2,version=version+1 WHERE id=$1',[sub,state]);
    await deny("UPDATE external_submissions SET state='accepted',version=version+1 WHERE id=$1",[sub],'invalid_submission_transition');
    await pool.query("UPDATE external_reservations SET state='active',version=version+1 WHERE id=$1",[reservation]);
    await pool.query("UPDATE external_reservations SET state='cancelled',version=version+1 WHERE id=$1",[reservation]);
    await deny("UPDATE external_reservations SET state='active',version=version+1 WHERE id=$1",[reservation],'invalid_reservation_transition');
    await deny('UPDATE external_attempt_outbox SET payload=$2 WHERE permit_id=$1',[permit,{...envelope,sequence:2}],'outbox_event_immutable');
    console.log(JSON.stringify({ reservationTerminalStates:'tested', submissionBindingAndLifecycle:'tested', staleVersions:'denied', forgedPermitBinding:'denied', outboxImmutable:'tested', signatures:'unverified_structural_fixture_only' }));
  } finally { await pool.end(); }
`);
console.log(JSON.stringify({ assurance:'tested', private:privateResult, external:externalResult, scope:'synthetic SQL lifecycle/immutability checks only' },null,2));
