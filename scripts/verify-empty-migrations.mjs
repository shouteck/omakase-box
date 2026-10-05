import assert from 'node:assert/strict';
import { acquireHostRuntime } from './host-test-runtime.mjs';

const foundation = {
  PRIVATE: ['private_accounts','private_sessions','private_invitations','private_intent_revisions','private_intent_heads','private_release_approvals','private_evaluations','private_acceptances','private_payment_obligations','private_feedback_outbox'],
  EXTERNAL: ['external_accounts','external_sessions','external_invitations','external_task_lineages','external_task_versions','external_reservations','external_submissions','external_attempt_outbox','external_feedback','external_workspace_attempts']
};
const intake = ['private_intake_objects','private_snapshots','private_snapshot_provenance','private_requests','private_request_evidence'];
const runtime = await acquireHostRuntime();
try {
for (const [service, scope] of [['private-api', 'PRIVATE'], ['external-api', 'EXTERNAL']]) {
  const source = `import assert from 'node:assert/strict'; import fs from 'node:fs'; import {randomUUID} from 'node:crypto'; import {Pool} from 'pg'; import {drizzle} from 'drizzle-orm/node-postgres'; import {migrate} from 'drizzle-orm/node-postgres/migrator';
    const prefix='${scope}'; const config={host:process.env[prefix+'_DATABASE_HOST'],database:process.env[prefix+'_DATABASE_NAME'],user:process.env[prefix+'_DATABASE_USER'],password:fs.readFileSync(process.env[prefix+'_DATABASE_PASSWORD_FILE'],'utf8').trim(),max:1};
    const database='synthetic_empty_'+randomUUID().replaceAll('-',''); assert.match(database,/^synthetic_empty_[a-f0-9]{32}$/);
    const admin=new Pool(config); try{await admin.query('CREATE DATABASE '+database);}finally{await admin.end();}
    const pool=new Pool({...config,database});try{
      const db=drizzle(pool);await migrate(db,{migrationsFolder:'db/migrations'});await migrate(db,{migrationsFolder:'db/migrations'});
      const tables=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
      const expectedFoundation=${JSON.stringify(foundation[scope])};const expectedIntake=${JSON.stringify(scope === 'PRIVATE' ? intake : [])};
      const foundationTables=tables.rows.filter(row=>expectedFoundation.includes(row.tablename));
      assert.equal(foundationTables.length,10);assert.deepEqual(foundationTables.map(row=>row.tablename).sort(),expectedFoundation.slice().sort());
      for(const name of expectedIntake)assert.ok(tables.rows.some(row=>row.tablename===name));
      if(prefix==='EXTERNAL')assert.ok(tables.rows.every(row=>!row.tablename.startsWith('private_')));
      console.log(JSON.stringify({assurance:'tested',service:'${service}',emptyDatabaseMigration:'tested',replay:'tested',tableCount:foundationTables.length,tableCountScope:'foundation',allTableCount:tables.rows.length,intakeTableCount:expectedIntake.length,fixtureDatabase:database,cleanup:'preserved_no_drop'}));
    }finally{await pool.end();}`;
  const result = await runtime.exec(service, ['--input-type=module', '-e', source]);
  assert.equal(result.code, 0, 'Empty synthetic database migration failed.');
  console.log(result.stdout.trim());
}
} finally { await runtime.cleanup(); }
