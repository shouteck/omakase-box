// M6.2 bounded evidence: signed-assignment ingest over the internal delivery
// network. Captures durable applied rows, protocol normalization and host scoping.
import { docker } from '../scripts/docker.mjs';
import { composeArguments } from '../scripts/synthetic-runtime.mjs';

const TASK_ID = '1bf1d170-424b-48e5-a994-b0fd1e34fbc1';
const report = { assurance: 'tested', scope: 'container-to-container signed assignment delivery' };
const post = (host, path, body) =>
  `const http=require("http");const q=http.request({host:"${host}",port:4001,path:"${path}",method:"POST",headers:{"content-type":"application/json"}},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>console.log(r.statusCode,d))});q.on("error",e=>console.log("ERR",e.message));q.end(${JSON.stringify(JSON.stringify(body))})`;

const malformed = await docker([...composeArguments, 'exec', '-T', 'private-api', 'node', '-e', post('external-api', '/v1/assignment-commands', {})], { timeout: 30000 });
report.malformedCommand = malformed.stdout.trim();

const scoped = await docker([...composeArguments, 'exec', '-T', 'private-api', 'node', '-e',
  'const http=require("http");const q=http.request({host:"external-api",port:4001,path:"/v1/tasks",method:"GET"},r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>console.log(r.statusCode,d))});q.end()'], { timeout: 30000 });
report.contributorRouteFromDeliveryNetwork = scoped.stdout.trim();

const query = 'const {Pool}=await import("pg");const fs=await import("fs");const p=new Pool({host:process.env.EXTERNAL_DATABASE_HOST,database:process.env.EXTERNAL_DATABASE_NAME,user:process.env.EXTERNAL_DATABASE_USER,password:fs.readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE,"utf8").trim(),max:1});const a=(await p.query("SELECT executor_kind,contributor_id,status,chosen_by FROM external_task_assignments WHERE task_id=$1",[$2])).rows;const i=(await p.query("SELECT contributor_id,revoked,redeemed_at FROM external_task_invitations")).rows;const c=(await p.query("SELECT task_version,package_digest,payload_hash FROM external_assignment_command_claims WHERE task_id=$1",[$2])).rows;console.log(JSON.stringify({assignments:a,invitations:i,claims:c}));await p.end()'
  .replace(/\$2/g, `'${TASK_ID}'`);
const rows = await docker([...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/external-api', 'external-api', 'node', '--input-type=module', '-e', query], { timeout: 30000 });
try { report.durableRows = JSON.parse(rows.stdout.trim()); } catch { report.durableRowsRaw = rows.stdout.trim(); }
console.log(JSON.stringify(report, null, 2));
