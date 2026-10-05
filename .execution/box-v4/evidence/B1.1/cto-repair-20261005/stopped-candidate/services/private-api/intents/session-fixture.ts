import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { SessionStore } from '../../../packages/contracts/auth/store.js';
import { hashPassword } from '../../../packages/contracts/auth/crypto.js';
import { PrivateIntentStore } from '../db/intent-store.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';

if (process.env.SYNTHETIC_INTENT_FIXTURE !== 'private-task-mvp-synthetic') process.exit(2);
const pool = new Pool({ host: process.env.PRIVATE_DATABASE_HOST, database: process.env.PRIVATE_DATABASE_NAME, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 2 });
try {
  const sessions = new SessionStore(pool,'private',readFileSync(process.env.PRIVATE_SESSION_KEY_FILE!));
  const password = 'synthetic-intent-password-only', hash = await hashPassword(password), actors = [];
  for (const role of ['requester','owner','operator'] as const) {
    const id = randomUUID(), username = `synthetic.intent.${role}.${id.slice(0,8)}`;
    await pool.query('INSERT INTO private_accounts (id,username,password_hash,role) VALUES ($1,$2,$3,$4)',[id,username,hash,role]);
    const token = await sessions.login(username,password), actor = await sessions.authenticateMutation(token.cookie,token.csrfToken);
    assert.equal(actor.id,id); actors.push(actor);
  }
  const requester=actors[0]!,owner=actors[1]!,operator=actors[2]!,store=new PrivateIntentStore(pool);
  const intent={schemaVersion:1 as const,intentId:randomUUID(),version:1,goal:'Synthetic intent session boundary',snapshotHash:'a'.repeat(64),state:'draft' as const,facts:[],evidence:[],decisions:[{id:'synthetic_choice',question:'Confirm a synthetic outcome.',required:true,answer:null as string|null}],assumptions:[],unknowns:[],acceptanceExamples:[],scope:{included:['Synthetic only'],excluded:['Real customer approvals']}};
  const denied=(code:string)=>(error:unknown)=>error instanceof WorkflowError&&error.code===code;
  await assert.rejects(store.create(operator,intent),denied('forbidden_role'));
  await store.create(requester,intent);
  await assert.rejects(store.transition(requester,intent.intentId,1,'ready_for_approval'),denied('missing_evidence'));
  const current=await store.read(requester,intent.intentId);assert.equal(current.intent.goal,intent.goal);
  const revised={...intent,version:2,decisions:[{...intent.decisions[0]!,answer:'Explicit synthetic user choice.'}]};
  await store.revise(requester,revised,1);
  const ready=await store.transition(requester,intent.intentId,2,'ready_for_approval');
  await assert.rejects(store.transition(requester,intent.intentId,2,'approved',ready.contentHash),denied('forbidden_role'));
  await assert.rejects(store.transition(owner,intent.intentId,2,'approved','f'.repeat(64)),denied('missing_evidence'));
  const before=await store.read(owner,intent.intentId);await store.transition(owner,intent.intentId,2,'approved',ready.contentHash);
  const after=await store.read(owner,intent.intentId);assert.equal(after.state,'approved');assert.equal(after.intent.state,'ready_for_approval');assert.equal(after.contentHash,before.contentHash);assert.deepEqual(after.intent,before.intent);
  await store.revise(requester,{...revised,version:3,goal:'Changed synthetic intent outcome'},2);
  await assert.rejects(store.transition(owner,intent.intentId,2,'approved',ready.contentHash),denied('stale_version'));
  await sessions.revokeSession(requester);
  await assert.rejects(store.create(requester,{...intent,intentId:randomUUID()}),denied('forbidden_role'));
  await assert.rejects(store.read(requester,intent.intentId),denied('forbidden_role'));
  console.log(JSON.stringify({assurance:'tested',scope:'synthetic DB session-bound intent operations',sessionRevocation:'denied',operatorRequesterApproval:'denied',unresolvedDecision:'blocked',exactHash:'required',approvedPayload:'immutable',editAfterApproval:'new_revision_stale_old_approval',publicProductFlow:'not_implemented',realCustomerData:false}));
} catch { console.error('Synthetic intent session fixture failed.');process.exitCode=1; }
finally {await pool.end();}
