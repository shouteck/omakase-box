// Writes records/results.json (compact, tracked) and records/raw-manifest.json (sha256 of every raw file, tracked).
// Raw files stay on disk and out of Git; see records/README.md. Rerun: node lab/lines/example-slice/instrument/runtime/records-manifest.mjs
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const records=path.resolve('lab/lines/example-slice/instrument/runtime/records');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const generated=new Set(['results.json','raw-manifest.json','README.md','.gitignore']);
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const manifest=walk(records).map(f=>path.relative(records,f).replaceAll('\\','/')).filter(p=>!generated.has(p)).sort()
 .map(p=>{const b=fs.readFileSync(path.join(records,p));return {path:p,bytes:b.length,sha256:hash(b)};});
fs.writeFileSync(path.join(records,'raw-manifest.json'),JSON.stringify(manifest,null,1)+'\n');
const size=d=>d&&{files:d.fileCount,fileTotal:d.fileTotal,bytes:d.bytes,byteTotal:d.byteTotal,fileFraction:d.fileFraction,byteFraction:d.byteFraction};
const results={};
for(const [name,full,sealed] of [['click3208','click3208-full-corrected','click3208-sealed'],['ky823','ky823-full','ky823-sealed']]) {
 const a=JSON.parse(fs.readFileSync(path.join(records,full,'selector-analysis.json')));
 const cells=JSON.parse(fs.readFileSync(path.join(records,full,'summary.json'))).results;
 const obs=JSON.parse(fs.readFileSync(path.join(records,sealed,'progress.json')));
 results[name]={
  fullRepositoryCells:cells.map(r=>({label:r.label,exit:r.phases[0].exit,parity:r.parity,stdout:r.phases[0].stdout,imageId:r.imageId})),
  rules:Object.fromEntries(Object.entries(a.rules).map(([rule,row])=>[rule,{files:row.files,unresolved:row.unresolved.length,
   requiredProductionExpansion:a.exports[rule].receipt?.requiredProductionExpansion??null,export:a.exports[rule].status,
   disclosure:Object.fromEntries(Object.entries(a.disclosure[rule]??{}).map(([variant,d])=>[variant,{repositorySource:size(d.repositorySource),rootSource:size(d.rootSource),totalRepository:size(d.totalRepository),small:d.small,nearlyEverything:d.nearlyEverything}]))}])),
  sealedObservations:obs.map(r=>({rule:r.rule,variant:r.variant??'primary',state:r.state,role:r.role,repeat:r.repeat,exit:r.identity.exit,same:r.same,safe:r.safe,historicalMisses:r.historicalMisses,fullHistoricalPatch:r.fullHistoricalPatch})),
 };
}
fs.writeFileSync(path.join(records,'results.json'),JSON.stringify(results,null,1)+'\n');
console.log(JSON.stringify({rawFiles:manifest.length,rawBytes:manifest.reduce((n,r)=>n+r.bytes,0)}));
