// Validate provisional snapshots against the accepted first-parent change, without exposing production.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {authorize,acceptedTests} from './collect-development.mjs';
const [repo,id]=process.argv.slice(2),number=Number(id);
authorize(repo,number);
const directory=new URL(`../replay-1/development/${repo.replace('/','--')}-${number}/`,import.meta.url);
const snapshot=JSON.parse(readFileSync(new URL('test-overlay.json',directory),'utf8'));
const receipt=new URL('accepted-validation.json',directory);
const readOnly=process.argv.includes('--check');
if (existsSync(receipt)&&!readOnly) throw new Error('Validation receipt exists; use --check, never overwrite');
const actual=acceptedTests(repo,snapshot.baseCommit,snapshot.acceptedCommit);
const expected=actual.flatMap(f=>f.status==='removed'?[{path:f.filename,action:'delete'}]:
  [...(f.status==='renamed'?[{path:f.previous_filename,action:'delete'}]:[]),{path:f.filename,action:f.status==='added'||f.status==='renamed'?'add':'modify',gitBlob:f.sha}]);
const saved=snapshot.overlay.map(f=>({path:f.path,action:f.action,...(f.gitBlob?{gitBlob:f.gitBlob}:{})}));
const sort=rs=>JSON.stringify(rs.sort((a,b)=>a.path.localeCompare(b.path)));
if (sort(expected)!==sort(saved)) throw new Error('Accepted overlay mismatch; provisional snapshot is quarantined');
for (const row of snapshot.overlay.filter(r=>r.action!=='delete')) {
  const bytes=Buffer.from(row.contentBase64,'base64');
  const sha=createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  if (sha!==row.gitBlob||bytes.length!==row.bytes) throw new Error('Snapshot blob corrupt');
}
const result={kind:'accepted-overlay validation only, not admission',repository:repo,number,
  acceptedCommit:snapshot.acceptedCommit,baseCommit:snapshot.baseCommit,validated_at:new Date().toISOString(),
  snapshotSHA256:createHash('sha256').update(readFileSync(new URL('test-overlay.json',directory))).digest('hex'),status:'matched',tests:saved.length};
if (readOnly) {
  const savedReceipt=JSON.parse(readFileSync(receipt,'utf8'));
  for (const key of ['repository','number','acceptedCommit','baseCommit','snapshotSHA256','status','tests']) {
    if (savedReceipt[key]!==result[key]) throw new Error('Saved receipt mismatch: '+key);
  }
} else writeFileSync(receipt,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,readOnly}));
