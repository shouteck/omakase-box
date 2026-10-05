import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { z } from 'zod';
import { SessionStore, AuthDenied } from '../../../packages/contracts/auth/store.js';
import { PrivateIntakeStore } from './store.js';

if (process.env.SYNTHETIC_INTAKE_FIXTURE !== 'private-task-mvp-synthetic') process.exit(2);
const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 2 });
try {
  let raw = ''; for await (const chunk of process.stdin) { raw += chunk.toString(); if (raw.length > 4096) throw new Error('fixture_bounds'); }
  const input = z.strictObject({ cookie: z.string().max(256), requestId: z.uuid(), snapshotId: z.uuid(), evidenceId: z.uuid() }).parse(JSON.parse(raw));
  const sessions = new SessionStore(pool, 'private', readFileSync(process.env.PRIVATE_SESSION_KEY_FILE!));
  const actor = await sessions.authenticate(input.cookie);
  const requester = (await pool.query("SELECT id FROM private_accounts WHERE id=$1 AND username LIKE 'synthetic.auth.%'", [actor.id])).rows[0];
  assert.ok(requester);
  const owned = (await pool.query('SELECT id FROM private_requests WHERE id=$1 AND requester_id=$2 AND snapshot_id=$3', [input.requestId, actor.id, input.snapshotId])).rows[0];
  assert.ok(owned);
  const evidence = (await pool.query('SELECT sha256 FROM private_request_evidence WHERE id=$1 AND request_id=$2', [input.evidenceId,input.requestId])).rows[0];
  assert.ok(evidence);
  const client = await pool.connect();
  async function rejected(sql: string, args: unknown[]) {
    await client.query('BEGIN');
    try { await assert.rejects(client.query(sql,args), error => (error as {code:string}).code === '23514'); }
    finally { await client.query('ROLLBACK'); }
  }
  try {
    await rejected('UPDATE private_intake_objects SET payload=payload WHERE sha256=$1',[evidence.sha256]);
    await rejected('UPDATE private_snapshots SET manifest=manifest WHERE id=$1',[input.snapshotId]);
    await rejected('UPDATE private_requests SET payload=payload WHERE id=$1',[input.requestId]);
    await rejected('UPDATE private_request_evidence SET request_id=request_id WHERE id=$1',[input.evidenceId]);
    await rejected("UPDATE private_snapshot_provenance SET source_root='synthetic-canary' WHERE snapshot_id=$1",[input.snapshotId]);
  } finally { client.release(); }
  const store = new PrivateIntakeStore(pool);
  const existing = await store.request(actor,input.requestId);
  assert.equal(existing.goal,'Synthetic evidence journey');
  await sessions.revokeSession(actor);
  await assert.rejects(store.createRequest(actor,{snapshotId:input.snapshotId,goal:'Synthetic stale-session attack'}),error=>error instanceof AuthDenied);
  await assert.rejects(store.request(actor,input.requestId),error=>error instanceof AuthDenied);
  console.log(JSON.stringify({assurance:'tested',immutableObjectsSnapshotsRequestsEvidenceProvenance:true,revokedSessionAfterAuthenticationDenied:true,privateDataPrinted:false}));
} catch { console.error('Synthetic intake fixture failed.'); process.exitCode=1; }
finally { await pool.end(); }
