// Native Ky development only. Declared command; not whole npm test/build.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {runCase} from './runner.mjs';
const [scratch,records]=process.argv.slice(2).map(p=>path.resolve(p));
if(!path.basename(scratch).startsWith('lab-a-replay-1-')||fs.existsSync(records))throw new Error('New lab-owned records required');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const snapshot=JSON.parse(fs.readFileSync('lab/lines/example-slice/replay-1/development/sindresorhus--ky-823/test-overlay.json'));
const cases={};fs.mkdirSync(records,{recursive:true});
for(const state of ['base','fixed']) {
 const manifest=JSON.parse(fs.readFileSync(path.join(scratch,`ky823-${state}.manifest.json`)));
 for(const row of manifest){const b=fs.readFileSync(path.join(scratch,`ky823-${state}`,row.path));if(hash(b)!==row.sha256||b.length!==row.bytes)throw new Error('Archive snapshot changed');}
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),`lab-a-replay-1-ky823-${state}-`));
 fs.cpSync(path.join(scratch,`ky823-${state}`),path.join(directory,'tree'),{recursive:true});
 for(const row of snapshot.overlay)fs.writeFileSync(path.join(directory,'tree',row.path),Buffer.from(row.contentBase64,'base64'));
 fs.mkdirSync(path.join(directory,'tree/node_modules'));cases[state]=directory;
}
const targets={example:'HTTPError#data is populated with parsed JSON',guard:'HTTPError handles undefined response.statusText'};
const results=[];
for(const role of ['example','guard'])for(const state of ['base','fixed'])for(let repeat=1;repeat<=3;repeat++){
 const label=`ky823-${role}-${state}-${repeat}`,directory=path.join(records,label);
 const argv=['python','/opt/instrument/native_measure.py','node','/opt/ky/node_modules/ava/entrypoints/cli.mjs','--tap','--timeout=30s','--match='+targets[role],'test/http-error.ts'];
 const run=await runCase({caseDirectory:cases[state],outputDirectory:directory,argv,label,image:'lab-a-replay-1-ky',treeOnlyMount:true,nodeCacheMount:true});
 const m=JSON.parse(fs.readFileSync(path.join(directory,'measurement.json')));
 const phases=['plain','traced','coverage'].map(phase=>({phase,exit:JSON.parse(fs.readFileSync(path.join(directory,phase+'.execution.json'))).exit,stdout:hash(fs.readFileSync(path.join(directory,phase+'.stdout'))),stderr:hash(fs.readFileSync(path.join(directory,phase+'.stderr')))}));
 const first=phases[0], parity=phases.every(p=>p.exit===first.exit&&p.stdout===first.stdout&&p.stderr===first.stderr);
 const safe=run.status===0&&!run.captureError&&!run.timedOut&&!run.oomKilled&&!run.outputLimited;
 const validOutcome=(role==='example'&&state==='base')?first.exit===1:first.exit===0;
 const mapped=m.extractExit===0&&m.execution.unknown.length===0;
 results.push({label,role,state,repeat,safe,parity,validOutcome,mapped,phases,imageId:run.imageId,execution:m.execution.executed});
 fs.writeFileSync(path.join(records,'progress.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({label,safe,parity,validOutcome,mapped}));
 if(!safe||!parity||!validOutcome||!mapped)throw new Error('Native development observation refused; retain records');
}
for(const role of ['example','guard'])for(const state of ['base','fixed']) {
 const group=results.filter(r=>r.role===role&&r.state===state),first=group[0].phases[0];
 if(group.some(r=>r.phases[0].stdout!==first.stdout||r.phases[0].stderr!==first.stderr))throw new Error('Unstable native observation');
}
fs.writeFileSync(path.join(records,'summary.json'),JSON.stringify({developmentId:823,repository:'sindresorhus/ky',base:snapshot.baseCommit,fixed:snapshot.acceptedCommit,targets,identitySchema:'AVA-5.3.1-TAP-exact-bytes-v1',cases,results},null,2));
