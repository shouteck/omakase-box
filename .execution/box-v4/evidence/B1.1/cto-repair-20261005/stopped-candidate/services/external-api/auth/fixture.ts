import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { hashPassword, newToken, tokenHash } from '../../../packages/contracts/auth/crypto.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import { ExternalTaskContractSchema, projectPublicListing } from '../../../packages/contracts/public/index.js';

if (process.env.SYNTHETIC_AUTH_FIXTURE !== 'private-task-mvp-synthetic') process.exit(2);
const pool = new Pool({ host: process.env.EXTERNAL_DATABASE_HOST, database: process.env.EXTERNAL_DATABASE_NAME, user: process.env.EXTERNAL_DATABASE_USER, password: readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 1 });
try {
  let input='';for await(const chunk of process.stdin){input+=chunk.toString();if(input.length>4096)throw new Error('Fixture input exceeded.');}
  const command=JSON.parse(input) as {action:string;id?:string;token?:string};
  if(command.action==='disable'||command.action==='expire') {
    if(command.action==='disable')await pool.query("UPDATE external_accounts SET disabled=true WHERE id=$1 AND username LIKE 'synthetic.auth.%'",[command.id]);
    else await pool.query("UPDATE external_sessions SET expires_at=now()-interval '1 second' WHERE account_id=$1 AND account_id IN(SELECT id FROM external_accounts WHERE username LIKE 'synthetic.auth.%')",[command.id]);
    console.log(JSON.stringify({status:command.action}));
  } else if(command.action==='invitation'||command.action==='expired_invitation') {
    const token=newToken();await pool.query("INSERT INTO external_invitations(token_hash,expires_at) VALUES($1,now()+$2 * interval '1 second')",[tokenHash(token),command.action==='invitation'?3600:-1]);console.log(JSON.stringify({token}));
  } else if(command.action==='revoke') {
    await pool.query('UPDATE external_invitations SET revoked=true WHERE token_hash=$1',[tokenHash(command.token??'')]);console.log(JSON.stringify({status:'revoked'}));
  } else if(command.action==='seed') {
  const hash=await hashPassword('synthetic-auth-password-only'); const accounts=[];
  for (let i=0;i<2;i++) { const id=randomUUID();const username=`synthetic.auth.contributor.${id.slice(0,8)}`;await pool.query('INSERT INTO external_accounts (id,username,password_hash) VALUES ($1,$2,$3)',[id,username,hash]);accounts.push({id,username}); }
  // Synthetic auth fixtures never represent an owner-approved private release or runnable job.
  const taskId=randomUUID(),lineageId=randomUUID(),reservationId=randomUUID(),submissionId=randomUUID(),permitId=randomUUID(),digest='a'.repeat(64);
  const terms={ reservationDurationSeconds:3600, maxEvaluatedAttempts:3, maxPatchBytes:1048576, maxChangedLines:10000, revisionPolicy:'preserve_original_expiry', cancellationPolicy:'Frozen synthetic terms apply.', packageDefectCompensation:{currency:'USD',amountMinor:1000}, budgetExhaustionPolicy:'No extra evaluation without owner-reviewed frozen terms.' } as const;
  const requirement={id:'auth_fixture_req',description:'Structural auth fixture requirement.',inputs:['Synthetic input.'],outputs:['Synthetic output.'],states:['available'],invalidCases:['Malformed input is rejected.'],exclusions:['Private eligibility is not editable.'],examples:[{given:'A synthetic input.',when:'It is submitted.',then:'A synthetic output is produced.'}]};
  const contract=ExternalTaskContractSchema.parse({
    schemaVersion:1,taskId,lineageId,version:1,title:'Synthetic auth fixture task',purpose:'Exercise contributor resource ownership only.',
    disciplines:['frontend'],workUnits:[{id:'fixture_unit',adapterKind:'frontend_component',adapterVersion:1,requirementIds:['auth_fixture_req'],editablePaths:['src/Fixture.tsx'],interfaceIds:[],trustedCheckIds:['fixture_check'],requiredCapabilities:['browser','static_assets'],startAfterUnitIds:[]}],
    interfaces:[],requirements:[requirement],endToEndRequirements:[],
    publicChecks:[{id:'fixture_check',kind:'unit',requirementIds:['auth_fixture_req'],workUnitIds:['fixture_unit'],interfaceIds:[]}],
    editablePaths:['src/Fixture.tsx'],dependencies:[],template:{id:'auth_fixture_template',version:1,sha256:digest},imageDigest:`sha256:${digest}`,executionProfile:'dedicated-linux-kvm-fresh-vm',
    acceptanceCategories:['contract_failure','integration_failure','package_defect','infrastructure_failure','passed','unverified'],
    terms,reward:{currency:'USD',amountMinor:10000},feedbackPolicyId:'bounded_v1'});
  const packageBytes=Buffer.from('synthetic-auth-fixture-package','utf8');
  const packageDigest=createHash('sha256').update(packageBytes).digest('hex');
  const listing=projectPublicListing(contract,null);
  const eventId=randomUUID(),nonce=randomUUID();
  await pool.query('BEGIN');
  try {
    await pool.query('INSERT INTO external_task_lineages(id) VALUES($1)',[lineageId]);
    await pool.query('INSERT INTO external_task_versions(id,version,lineage_id,package_hash,contract,listing,envelope) VALUES($1,1,$2,$3,$4,$4,$4)',[taskId,lineageId,packageDigest,{syntheticAuthStructuralFixture:true}]);
    await pool.query("INSERT INTO external_bridge_claims(event_id,nonce,payload_hash,task_id,task_version,manifest_hash,expires_at) VALUES($1,$2,$3,$4,1,$3,now()+interval '1 hour')",[eventId,nonce,digest,taskId]);
    await pool.query('INSERT INTO external_published_tasks(event_id,task_id,lineage_id,version,manifest_hash,payload_hash,package_sha256,package_byte_size,package_bytes,contract,listing,manifest) VALUES($1,$2,$3,1,$4,$4,$5,$6,$7,$8,$9,$10)',[eventId,taskId,lineageId,digest,packageDigest,packageBytes.length,packageBytes,contract,listing,{schemaVersion:1,syntheticAuthStructuralFixture:true}]);
    await pool.query("INSERT INTO external_task_assignments(id,task_id,task_version,executor_kind,executor_label,contributor_id,status,chosen_by) VALUES($1,$2,1,'human','synthetic auth contributor',$3,'active','synthetic-auth-fixture')",[randomUUID(),taskId,accounts[0]!.id]);
    await pool.query("INSERT INTO external_reservations(id,task_id,task_version,package_hash,contributor_id,terms_hash,expires_at) VALUES($1,$2,1,$3,$4,$5,now()+interval '1 hour')",[reservationId,taskId,packageDigest,accounts[0]!.id,contentHash(terms)]);
    const permit={permitId,submissionId,reservationId,taskId,taskVersion:1,packageDigest,submissionHash:digest,syntheticAuthStructuralFixture:true};
    await pool.query('INSERT INTO external_submissions(id,reservation_id,contributor_id,task_id,task_version,package_hash,submission_hash,patch,idempotency_key,permit_id,permit) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10)',[submissionId,reservationId,accounts[0]!.id,taskId,packageDigest,digest,'synthetic-auth-private-patch-canary',randomUUID(),permitId,permit]);
    await pool.query('INSERT INTO external_attempt_outbox(permit_id,payload) VALUES($1,$2)',[permitId,permit]);
    await pool.query("UPDATE external_reservations SET state='in_review',version=version+1 WHERE id=$1",[reservationId]);
    await pool.query('COMMIT');
  } catch(error){await pool.query('ROLLBACK');throw error;}
  console.log(JSON.stringify({accounts,reservationId,submissionId,taskId,syntheticAuthStructuralFixture:true}));
  } else throw new Error('Unknown fixture action.');
} catch (error) { console.error('Synthetic contributor fixture failed.',error instanceof Error?error.message:String(error));process.exitCode=1; }
finally {await pool.end();}
