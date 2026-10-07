import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {runCase} from './runner.mjs';
const [packages,scratch,records]=process.argv.slice(2).map(p=>path.resolve(p));
if(!path.basename(packages).startsWith('lab-a-replay-1-')||fs.existsSync(records))throw new Error('New lab records required');
fs.mkdirSync(records,{recursive:true});const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const full=JSON.parse(fs.readFileSync('lab/lines/example-slice/instrument/runtime/records/ky823-full/summary.json'));
const results=[];
for(const rule of ['E','EI','R','G'])for(const variant of rule==='E'?['primary','expanded']:['primary']) {
 const authority=JSON.parse(fs.readFileSync(path.join(packages,rule,'authority.json')));
 const editable=new Set(authority.variants[variant].filter(r=>!r.immutable).map(r=>r.path));
 const runtimePatch=['source/core/Ky.ts','source/errors/HTTPError.ts','source/types/hooks.ts'];
 const misses=['readme.md',...runtimePatch].filter(p=>!editable.has(p));
 const runtimeFits=runtimePatch.every(p=>editable.has(p));
 for(const state of runtimeFits?['base','fixedDiagnostic']:['base'])for(const role of ['example','guard'])for(let repeat=1;repeat<=3;repeat++) {
  const label=`ky823-${rule}-${variant}-${state}-${role}-${repeat}`;
  const caseDirectory=fs.mkdtempSync(path.join(os.tmpdir(),`lab-a-replay-1-ky823-${rule}-sealed-`));
  fs.cpSync(path.join(packages,rule,variant,'tree'),path.join(caseDirectory,'tree'),{recursive:true});
  fs.mkdirSync(path.join(caseDirectory,'tree/node_modules'));
  if(state==='fixedDiagnostic')for(const p of runtimePatch)fs.copyFileSync(path.join(scratch,'ky823-fixed',p),path.join(caseDirectory,'tree',p));
  const argv=['node','/opt/ky/node_modules/ava/entrypoints/cli.mjs','--tap','--timeout=30s','--match='+full.targets[role],'test/http-error.ts'];
  const run=await runCase({caseDirectory,outputDirectory:path.join(records,label),argv,label,image:full.results[0].imageId,treeOnlyMount:true,nodeCacheMount:true});
  const identity={exit:run.status,stdout:hash(Buffer.from(run.stdout)),stderr:hash(Buffer.from(run.stderr))};
  const expected=full.results.find(r=>r.state===(state==='base'?'base':'fixed')&&r.role===role).phases[0];
  const same=identity.exit===expected.exit&&identity.stdout===expected.stdout&&identity.stderr===expected.stderr;
  const safe=!run.captureError&&!run.timedOut&&!run.oomKilled&&!run.outputLimited;
  results.push({rule,variant,state,role,repeat,safe,same,identity,fullHistoricalPatch:'refused',historicalMisses:misses,runtimePatch:runtimeFits?'diagnostic':'refused'});
  fs.writeFileSync(path.join(records,'progress.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({label,exit:run.status,same,safe}));
 }
}
fs.writeFileSync(path.join(records,'summary.json'),JSON.stringify({developmentId:823,fullHistoricalPatch:'readme.md omitted in every package; E also omits source/types/hooks.ts',expandedNote:'EI/R/G have identical primary and expanded bytes; replayed primary only',results},null,2));
