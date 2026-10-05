import assert from 'node:assert/strict';
import { docker } from './docker.mjs';
import { composeArguments } from './synthetic-runtime.mjs';

const result = await docker([...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/private-api', 'private-api', 'node', '--input-type=module', '-e', `
  import assert from 'node:assert/strict'; import fs from 'node:fs'; import { randomUUID } from 'node:crypto'; import { Pool } from 'pg';
  const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: fs.readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 2 });
  const deny = (sql, args, match) => assert.rejects(pool.query(sql, args), error => match.test(error.message), sql);
  const h = 'a'.repeat(64);
  const owner = randomUUID(); const operator = randomUUID(); const task = randomUUID(); const submission = randomUUID();
  const evalId = randomUUID(); const permit = randomUUID();
  const eventId = randomUUID(); const acceptanceId = randomUUID();
  const passed = JSON.stringify({ outcome: 'passed' }); const failed = JSON.stringify({ outcome: 'failed' });
  const feedback = JSON.stringify({ schemaVersion: 1, publicId: randomUUID(), category: 'accepted', releasePolicyVersion: 1, publicCheckDetails: [] });
  try {
    const suffix = randomUUID().slice(0, 8);
    await pool.query("INSERT INTO private_accounts (id,username,password_hash,role) VALUES ($1,'verify-owner-' || $3,'x','owner'),($2,'verify-operator-' || $3,'x','operator')", [owner, operator, suffix]);
    await pool.query("INSERT INTO private_evaluations (id,permit_id,task_id,task_version,submission_id,submission_hash,package_hash,private_base_revision) VALUES ($1,$2,$3,1,$4,$5,$5,$5)", [evalId, permit, task, submission, h]);

    // Non-owner identity can never record an acceptance — even on a prepared row.
    await deny("INSERT INTO private_acceptances (id,event_id,evaluation_id,owner_id,submission_hash,package_hash,private_base_revision,candidate_diff_hash) VALUES ($1,$2,$3,$4,$5,$5,$5,$5)", [acceptanceId, eventId, evalId, operator, h], /owner_required|violates foreign key|completed_latest/);

    // accepted state requires the acceptance row; the evaluation cannot be set to accepted directly.
    await deny("UPDATE private_evaluations SET state='accepted', version=version+1, result=$2::jsonb WHERE id=$1", [evalId, passed], /invalid_evaluation_transition|owner_acceptance_required|completed_evaluation_required/);

    // Walk the lifecycle honestly to owner_review with a passed result.
    await pool.query("UPDATE private_evaluations SET state='public_evaluating', version=version+1 WHERE id=$1", [evalId]);
    await pool.query("UPDATE private_evaluations SET state='private_evaluating', version=version+1 WHERE id=$1", [evalId]);
    await pool.query("UPDATE private_evaluations SET state='owner_review', version=version+1, result=$2::jsonb WHERE id=$1", [evalId, passed]);
    const probe = (await pool.query("SELECT state, version, result->>'outcome' AS outcome, superseded FROM private_evaluations WHERE id=$1", [evalId])).rows[0];
    if (!probe || probe.state !== 'owner_review' || probe.outcome !== 'passed') { console.error('PROBE-FAIL ' + JSON.stringify(probe)); process.exit(3); }
    await deny("UPDATE private_evaluations SET result=$2::jsonb, version=version+1 WHERE id=$1", [evalId, failed], /evaluation_result_immutable/);

    // An acceptance row can never commit without its payable record (deferred FK).
    await deny("INSERT INTO private_acceptances (id,event_id,evaluation_id,owner_id,submission_hash,package_hash,private_base_revision,candidate_diff_hash) VALUES ($1,$2,$3,$4,$5,$5,$5,$5)", [acceptanceId, eventId, evalId, owner, h], /private_acceptance_payable|violates foreign key/);

    // Atomic acceptance: acceptance first (deferred payable FKs), then the
    // obligation (immediate acceptance FK), transition and outbox — one commit.
    await pool.query('BEGIN');
    await pool.query("INSERT INTO private_acceptances (id,event_id,evaluation_id,owner_id,submission_hash,package_hash,private_base_revision,candidate_diff_hash) VALUES ($1,$2,$3,$4,$5,$5,$5,$5)", [acceptanceId, eventId, evalId, owner, h]);
    await pool.query("INSERT INTO private_payment_obligations (event_id,acceptance_id,payee_id,reason,currency,amount_minor) VALUES ($1,$2,$3,'accepted_submission','USD',12500)", [eventId, acceptanceId, randomUUID()]);
    await pool.query("UPDATE private_evaluations SET state='accepted', version=version+1 WHERE id=$1", [evalId]);
    await pool.query("INSERT INTO private_feedback_outbox (event_id,submission_id,payload) VALUES ($1,$2,$3::jsonb)", [eventId, submission, feedback]);
    await pool.query('COMMIT');

    // Replay cannot duplicate the payable or acceptance record.
    await deny("INSERT INTO private_payment_obligations (event_id,acceptance_id,payee_id,reason,currency,amount_minor) VALUES ($1,$2,$3,'x','USD',1)", [eventId, acceptanceId, randomUUID()], /duplicate key/);
    await deny("INSERT INTO private_acceptances (id,event_id,evaluation_id,owner_id,submission_hash,package_hash,private_base_revision,candidate_diff_hash) VALUES ($1,$2,$3,$4,$5,$5,$5,$5)", [randomUUID(), randomUUID(), evalId, owner, h], /completed_latest_evaluation_required|duplicate key/);
    await deny("UPDATE private_acceptances SET candidate_diff_hash=$2 WHERE id=$1", [acceptanceId, 'b'.repeat(64)], /acceptance_immutable/);

    // Obligation terms are immutable; settlement is a one-way, reference-required transition.
    await deny("UPDATE private_payment_obligations SET amount_minor=1 WHERE event_id=$1", [eventId], /obligation_terms_immutable/);
    await deny("UPDATE private_payment_obligations SET state='settlement_recorded' WHERE event_id=$1", [eventId], /settlement_reference_required/);
    await pool.query("UPDATE private_payment_obligations SET state='settlement_recorded', settlement_reference='synthetic-ref-1' WHERE event_id=$1", [eventId]);
    await deny("UPDATE private_payment_obligations SET settlement_reference='other' WHERE event_id=$1", [eventId], /settlement_immutable/);
    await deny("INSERT INTO private_payment_obligations (event_id,acceptance_id,payee_id,reason,currency,amount_minor,state,settlement_reference) VALUES ($1,NULL,$2,'x','USD',1,'settlement_recorded','r')", [randomUUID(), randomUUID()], /invalid_initial_obligation/);

    // Outbox events are immutable; delivery is write-once; submission binding is required.
    await deny("UPDATE private_feedback_outbox SET payload=$2::jsonb WHERE event_id=$1", [eventId, JSON.stringify({})], /outbox_event_immutable/);
    await deny("INSERT INTO private_feedback_outbox (event_id,submission_id,payload) VALUES ($1,NULL,$2::jsonb)", [randomUUID(), feedback], /outbox_submission_required/);
    await pool.query("UPDATE private_feedback_outbox SET delivered_at=now() WHERE event_id=$1", [eventId]);
    await deny("UPDATE private_feedback_outbox SET delivered_at=now()+interval '1 second' WHERE event_id=$1", [eventId], /outbox_delivery_immutable/);

    // Compensation obligations without an acceptance are lawful (package-defect path).
    await pool.query("INSERT INTO private_payment_obligations (event_id,acceptance_id,payee_id,reason,currency,amount_minor) VALUES ($1,NULL,$2,'package_defect_compensation','USD',500)", [randomUUID(), randomUUID()]);

    console.log(JSON.stringify({ ownerGuard: 'tested', payableBinding: 'tested', atomicCommit: 'tested', replayDenied: 'tested', immutability: 'tested', settlementFlow: 'tested', outboxGuards: 'tested', compensationPath: 'tested', authority: 'synthetic_schema_test_not_runner_verdict' }));
  } finally { await pool.end(); }
`], { timeout: 120000 });
assert.equal(result.code, 0, `acceptance guard verification failed: ${result.stderr.slice(-3000)}`);
console.log(JSON.stringify({ assurance: 'tested', private: JSON.parse(result.stdout) }));
