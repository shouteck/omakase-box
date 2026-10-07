// Git-tree metadata + raw Git-blob hashes establish tracked disclosure universes.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
const [scratch,records]=process.argv.slice(2).map(p=>path.resolve(p));
const cases=[['click3208','pallets/click','8d3449517a97b6fd457a025bd9c3d2acfd301fa4','0cd28d6548f92e46396e0ffdd19ec5ea75b4b5e4'],['ky823','sindresorhus/ky','eb5c3eba37451b7a6d598efa23d33c97919ae9e6','1341f5ca56c96c9440e6e8d0d624c871bb1b7929']];
if(!path.basename(scratch).startsWith('lab-a-replay-1-')||fs.existsSync(records))throw new Error('New lab records required');
fs.mkdirSync(records,{recursive:true});
const receipts=[];
for(const [name,repository,...commits] of cases)for(let i=0;i<2;i++) {
 const state=i?'fixed':'base', commit=commits[i];
 const request=spawnSync('gh',['api',`repos/${repository}/git/trees/${commit}?recursive=1`],{encoding:'utf8',maxBuffer:16*1024*1024});
 if(request.status!==0)throw new Error('Tree metadata unavailable');
 const tree=JSON.parse(request.stdout);if(tree.truncated)throw new Error('Tree truncated');
 const tracked=tree.tree.filter(r=>r.type!=='tree');
 if(tracked.some(r=>r.type!=='blob'||!['100644','100755'].includes(r.mode)))throw new Error('Unsupported tracked object');
 const manifest=JSON.parse(fs.readFileSync(path.join(scratch,`${name}-${state}.manifest.json`)));
 if(manifest.length!==tracked.length)throw new Error('Archive/tracked denominator mismatch');
 const rows=tracked.map(r=>{
  if(!manifest.some(m=>m.path===r.path))throw new Error('Missing tracked path');
  const bytes=fs.readFileSync(path.join(scratch,`${name}-${state}`,r.path));
  const blob=crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  if(blob!==r.sha)throw new Error('Tracked blob mismatch');
  return {path:r.path,mode:r.mode,gitBlob:r.sha,bytes:bytes.length};
 });
 const receipt={name,repository,state,commit,truncated:false,status:'all tracked regular blobs matched',rows};
 fs.writeFileSync(path.join(records,`${name}-${state}.json`),JSON.stringify(receipt,null,2));receipts.push({name,state,count:rows.length});
}
console.log(JSON.stringify(receipts));
