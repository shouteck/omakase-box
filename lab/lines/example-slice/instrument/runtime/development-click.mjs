// Development-only replay. Never accepts arbitrary project or confirmation IDs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {runCase} from './runner.mjs';
import {pytestIdentity} from './identity.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const scratch=path.resolve(process.argv[2]??'');
const output=path.resolve(process.argv[3]??'');
if(!path.basename(scratch).startsWith('lab-a-replay-1-')||fs.existsSync(output))throw new Error('New records and lab-owned scratch required');
fs.mkdirSync(output,{recursive:true});
const revision={base:'8d3449517a97b6fd457a025bd9c3d2acfd301fa4',fixed:'0cd28d6548f92e46396e0ffdd19ec5ea75b4b5e4'};
const source=path.join(scratch,'lab-a-replay-1-click3208-base-overlay');
const fixed=path.join(scratch,'click3208-fixed');
const cases={};
for(const [state,from] of Object.entries({base:source,fixed})) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lab-a-replay-1-click3208-'+state+'-'));
 fs.cpSync(from,path.join(directory,'tree'),{recursive:true,dereference:false});cases[state]=directory;
}
// Chosen before these measurement runs; regression example and unchanged guard.
const targets={example:'tests/test_formatting.py::test_formatting_usage_error_help_hint',guard:'tests/test_formatting.py::test_basic_functionality'};
const results=[];
for(const [role,target] of Object.entries(targets))for(const state of ['base','fixed'])for(let repeat=1;repeat<=3;repeat++) {
 const label=`click3208-${role}-${state}-${repeat}`;
 const directory=path.join(output,label);
 const argv=['python','/opt/instrument/measure.py','module','pytest','-p','no:cacheprovider','--basetemp=/tmp/pytest','-o','addopts=','-q','--tb=short',target];
 const run=await runCase({caseDirectory:cases[state],outputDirectory:directory,argv,label});
 const phases=['plain','traced','coverage'].map(phase=>{
  const execution=JSON.parse(fs.readFileSync(path.join(directory,phase+'.execution.json')));
  return {phase,...pytestIdentity(execution.exit,fs.readFileSync(path.join(directory,phase+'.stdout')),fs.readFileSync(path.join(directory,phase+'.stderr')))};
 });
 const parity=phases.every(row=>row.exit===phases[0].exit&&row.stdout===phases[0].stdout&&row.stderr===phases[0].stderr);
 const okay=run.status===0&&!run.timedOut&&!run.oomKilled&&!run.captureError&&!run.outputLimited;
 results.push({label,role,state,repeat,runOkay:okay,parity,phases,imageId:run.imageId});
 fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({label,runOkay:okay,parity,exits:phases.map(p=>p.exit)}));
 if(!okay||!parity)throw new Error('Development observation mismatch; retain records, refuse readiness');
}
for(const role of Object.keys(targets))for(const state of ['base','fixed']) {
 const group=results.filter(r=>r.role===role&&r.state===state);
 const first=group[0].phases[0];
 if(group.length!==3||group.some(r=>r.phases[0].stdout!==first.stdout||r.phases[0].stderr!==first.stderr||r.phases[0].exit!==first.exit))throw new Error('Unstable development observation');
 if((role==='example'&&state==='base')?first.exit===0:first.exit!==0)throw new Error('Wrong base/fixed/guard outcome');
}
const summary={schema:1,project:'pallets/click',developmentId:3208,revision,targets,overlay:['tests/test_formatting.py'],identitySchema:'pytest-terminal-duration-v1',results};
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
// Archive proof without saving third-party production content in the lab.
const archives=Object.keys(revision).map(state=>{const p=path.join(scratch,`click3208-${state}.tar.gz`);return {state,sha256:hash(fs.readFileSync(p))};});
fs.writeFileSync(path.join(output,'archives.json'),JSON.stringify(archives,null,2));
