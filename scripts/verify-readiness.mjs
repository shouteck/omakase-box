import assert from 'node:assert/strict';
import { acquireHostRuntime } from './host-test-runtime.mjs';

const runtime = await acquireHostRuntime();
let result;
try {
  result = await runtime.exec('private-api', ['--input-type=module', '-e', `
  import assert from 'node:assert/strict'; import fs from 'node:fs'; import { randomUUID } from 'node:crypto'; import { Pool } from 'pg';
  const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: fs.readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE, 'utf8').trim(), max: 2 });
  const deny = (sql, args, match) => assert.rejects(pool.query(sql, args), error => match.test(error.message), sql);
  const digest = 'a'.repeat(64); const task = randomUUID(); const version = 7;
  const owner = randomUUID(); const operator = randomUUID();
  try {
    await pool.query("INSERT INTO private_accounts (id, username, password_hash, role) VALUES ($1,$2,'synthetic','owner'),($3,$4,'synthetic','operator')", [owner, 'ro-' + owner.slice(0, 8), operator, 'ro-' + operator.slice(0, 8)]);
    const insert = 'INSERT INTO private_readiness_records (id,task_id,task_version,package_digest,kind,status,reason_code,classified_outcome,assurance,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';
    const recordId = randomUUID();
    await pool.query(insert, [recordId, task, version, digest, 'fresh_build', 'passed', null, null, 'tested', operator]);
    await deny('UPDATE private_readiness_records SET status=$2 WHERE id=$1', [recordId, 'failed'], /immutable_readiness_record/);
    await deny('DELETE FROM private_readiness_records WHERE id=$1', [recordId], /immutable_readiness_record/);
    await deny(insert, [randomUUID(), task, version, digest, 'human_review', 'passed', null, null, 'tested', operator], /owner_review_required/);
    await pool.query(insert, [randomUUID(), task, version, digest, 'human_review', 'passed', null, null, 'tested', owner]);
    await deny(insert, [randomUUID(), task, version, digest, 'external_solve', 'failed', 'solve_failed', null, 'tested', operator], /solve_unclassified|violates check constraint/);
    await deny(insert, [randomUUID(), task, version, digest, 'external_solve', 'failed', 'solve_failed', 'ambiguity', 'tested', operator], /violates check constraint/);
    await deny(insert, [randomUUID(), task, version, digest, 'traceability', 'passed', 'should_not_be_here', null, 'tested', operator], /violates check constraint/);
    await deny(insert, [randomUUID(), task, version, digest, 'integration_check', 'failed', null, null, 'tested', operator], /violates check constraint/);
    await deny(insert, [randomUUID(), task, version, 'not-a-digest', 'fresh_build', 'passed', null, null, 'tested', operator], /violates check constraint/);
    const decisionId = randomUUID();
    await pool.query("INSERT INTO private_readiness_decisions (id,task_id,task_version,package_digest,decision,reasons,evaluated_record_ids,decided_by) VALUES ($1,$2,$3,$4,'blocked','[]'::jsonb,'[]'::jsonb,$5)", [decisionId, task, version, digest, owner]);
    await deny('UPDATE private_readiness_decisions SET decision=$2 WHERE id=$1', [decisionId, 'publishable'], /immutable_readiness_record/);
    await deny('DELETE FROM private_readiness_decisions WHERE id=$1', [decisionId], /immutable_readiness_record/);
    console.log(JSON.stringify({ lifecycle: 'tested', immutableRecords: 'tested', immutableDecisions: 'tested', ownerReviewAuthority: 'tested', solveClassification: 'tested', statusReasonShape: 'tested', bindingFormat: 'tested', authority: 'synthetic_schema_test_not_runner_verdict' }));
  } finally { await pool.end(); }
`], { timeout: 120000 });
} finally { await runtime.cleanup(); }
assert.equal(result.code, 0, `readiness guard verification failed: ${result.stderr.slice(-3000)}`);
console.log(JSON.stringify({ assurance: 'tested', private: JSON.parse(result.stdout) }));
