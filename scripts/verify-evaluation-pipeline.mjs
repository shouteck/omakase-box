import assert from 'node:assert/strict';
import { acquireHostRuntime } from './host-test-runtime.mjs';

const runtime = await acquireHostRuntime();
let result;
try {
  result = await runtime.exec('private-api', ['--input-type=module', '-e', `
  import assert from 'node:assert/strict'; import fs from 'node:fs'; import { randomUUID } from 'node:crypto'; import { Pool } from 'pg';
  const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: fs.readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 2 });
  const deny = (sql, args, match) => assert.rejects(pool.query(sql, args), error => match.test(error.message), sql);
  const h = 'a'.repeat(64); const evalId = randomUUID(); const permit = randomUUID(); const jobId = randomUUID();
  const client = { query: (sql, args) => pool.query(sql, args) };
  try {
    await client.query("INSERT INTO private_evaluations (id,permit_id,task_id,task_version,submission_id,submission_hash,package_hash,private_base_revision) VALUES ($1,$2,$3,1,$4,$5,$5,$5)", [evalId, permit, randomUUID(), randomUUID(), h]);
    await deny("UPDATE private_evaluations SET state='owner_review', version=version+1 WHERE id=$1", [evalId], /invalid_evaluation_transition/);
    await deny("UPDATE private_evaluations SET package_hash=$2, version=version+1 WHERE id=$1", [evalId, 'b'.repeat(64)], /evaluation_binding_immutable/);
    await client.query("UPDATE private_evaluations SET state='public_evaluating', version=version+1 WHERE id=$1", [evalId]);
    await deny("UPDATE private_evaluations SET version=version+2 WHERE id=$1", [evalId], /stale_evaluation_version/);
    const insertJob = "INSERT INTO private_evaluation_jobs (id,evaluation_id,evaluation_version,permit_id,attempt_id,submission_id,task_id,task_version,job_kind,profile,protocol_version,submission_hash,package_hash,private_base_revision,artifact_hash,image_digest,harness_id,harness_digest,required_check_ids,deadline_ms) VALUES ($1,$2,2,$3,$4,$5,$6,1,$7,'dedicated-linux-kvm-fresh-vm',1,$8,$8,$8,$8,'sha256:' || $9::text,'composed/v1',$8,$10,1)";
    await deny(insertJob, [randomUUID(), evalId, permit, randomUUID(), randomUUID(), randomUUID(), 'public', h, h, '[]'], /invalid_initial_job/);
    await client.query(insertJob, [jobId, evalId, permit, randomUUID(), randomUUID(), randomUUID(), 'public', h, h, JSON.stringify(['selection_ui_check'])]);
    await deny(insertJob, [randomUUID(), evalId, permit, randomUUID(), randomUUID(), randomUUID(), 'public', h, h, JSON.stringify(['x'])], /private_evaluation_jobs_evaluation_id_job_kind_key|duplicate key/);
    await client.query(insertJob, [randomUUID(), evalId, permit, randomUUID(), randomUUID(), randomUUID(), 'private', h, h, JSON.stringify(['selection_api_check'])]);
    await deny("UPDATE private_evaluation_jobs SET package_hash=$2, version=version+1 WHERE id=$1", [jobId, 'b'.repeat(64)], /job_binding_immutable/);
    await deny("UPDATE private_evaluation_jobs SET job_state='completed', version=version+1, authoritative_class='verified', authoritative_outcome='passed', authoritative_cause='result_verified', authoritative_result_sequence=1, authoritative_log_digest=$2, ended_at=now() WHERE id=$1", [jobId, h], /invalid_job_transition|authoritative_result_required/);
    await deny("UPDATE private_evaluation_jobs SET job_state='running', version=version+1 WHERE id=$1", [jobId], /job_lease_required/);
    const seq = (await client.query("SELECT count(*)::int + 1 AS n FROM private_evaluation_job_results WHERE job_id=$1", [jobId])).rows[0].n;
    await client.query("INSERT INTO private_evaluation_job_results (job_id,recorded_sequence,evidence_class,result_outcome,cause,outcome_checks,log_digest) VALUES ($1,$2,'infrastructure','infrastructure','runner_unavailable','[]'::jsonb,$3)", [jobId, seq, h]);
    await client.query("INSERT INTO private_evaluation_job_logs (job_id,bytes,byte_count,original_byte_count,complete,log_digest) VALUES ($1,''::bytea,0,0,true,$2)", [jobId, h]);
    await client.query("UPDATE private_evaluation_jobs SET job_state='completed', version=version+1, authoritative_class='infrastructure', authoritative_outcome='infrastructure', authoritative_cause='runner_unavailable', authoritative_result_sequence=$2, authoritative_log_digest=$3, ended_at=now() WHERE id=$1", [jobId, seq, h]);
    await deny("UPDATE private_evaluation_job_results SET result_outcome='passed' WHERE job_id=$1", [jobId], /job_result_immutable/);
    await deny("UPDATE private_evaluation_job_logs SET bytes='aa' WHERE job_id=$1", [jobId], /job_log_immutable/);
    await client.query("UPDATE private_evaluations SET state='infrastructure_failure', version=version+1 WHERE id=$1", [evalId]);
    console.log(JSON.stringify({ lifecycle: 'tested', jobGuards: 'tested', infraOnlyQueuedCompletion: 'tested', appendOnlyResults: 'tested', bindingImmutability: 'tested', staleVersion: 'tested', authority: 'synthetic_schema_test_not_runner_verdict' }));
  } finally { await pool.end(); }
`], { timeout: 120000 });
} finally { await runtime.cleanup(); }
assert.equal(result.code, 0, `evaluation pipeline guard verification failed: ${result.stderr.slice(-3000)}`);
console.log(JSON.stringify({ assurance: 'tested', private: JSON.parse(result.stdout) }));
