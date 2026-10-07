import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {runCase} from './runner.mjs';
import {pytestIdentity} from './identity.mjs';
const [packages,scratch,records]=process.argv.slice(2).map(p=>path.resolve(p));
if(!path.basename(packages).startsWith('lab-a-replay-1-')||fs.existsSync(records))throw new Error('New lab package records required');
fs.mkdirSync(records,{recursive:true});
const sourceRecords=path.resolve('lab/lines/example-slice/instrument/runtime/records/click3208-full-corrected');
const full=JSON.parse(fs.readFileSync(path.join(sourceRecords,'summary.json')));
const results=[];
for(const rule of ['E','EI','R','G']) {
 const directory=path.join(packages,rule,'primary');
 const authority=JSON.parse(fs.readFileSync(path.join(packages,rule,'authority.json')));
 const editable=new Set(authority.variants.primary.filter(r=>!r.immutable).map(r=>r.path));
 // The complete accepted non-test patch also edits CHANGES.rst. Missing authority
 // is recorded as refusal; the runtime source replacement is diagnostic only.
 const historicalMisses=['CHANGES.rst','src/click/exceptions.py'].filter(p=>!editable.has(p));
 const fixed=fs.mkdtempSync(path.join(os.tmpdir(),`lab-a-replay-1-click3208-${rule}-diagnostic-`));
 fs.cpSync(path.join(directory,'tree'),path.join(fixed,'tree'),{recursive:true});
 if(!editable.has('src/click/exceptions.py'))throw new Error('Runtime patch outside package');
 fs.copyFileSync(path.join(scratch,'click3208-fixed/src/click/exceptions.py'),path.join(fixed,'tree/src/click/exceptions.py'));
 for(const [state,caseDirectory] of Object.entries({base:directory,fixedDiagnostic:fixed}))for(const role of ['example','guard'])for(let repeat=1;repeat<=3;repeat++) {
  const label=`click3208-${rule}-${state}-${role}-${repeat}`;
  // Exported parent carries the required lab prefix; runner checks its basename.
  const mounted=fs.mkdtempSync(path.join(os.tmpdir(),`lab-a-replay-1-click3208-${rule}-sealed-`));
  fs.cpSync(path.join(caseDirectory,'tree'),path.join(mounted,'tree'),{recursive:true});
  const target=full.targets[role];
  const argv=['python','-m','pytest','-p','no:cacheprovider','--basetemp=/tmp/pytest','-o','addopts=','-q','--tb=short',target];
  const run=await runCase({caseDirectory:mounted,outputDirectory:path.join(records,label),label,argv});
  // Pytest emits UTF-8 here; measurement-phase lossless files establish this
  // developmental domain. Generic binary output is outside this adapter.
  const identity=pytestIdentity(run.status,Buffer.from(run.stdout),Buffer.from(run.stderr));
  const expected=full.results.find(r=>r.state===(state==='base'?'base':'fixed')&&r.role===role).phases[0];
  const same=identity.exit===expected.exit&&identity.stdout===expected.stdout&&identity.stderr===expected.stderr;
  const safe=!run.timedOut&&!run.oomKilled&&!run.outputLimited&&!run.captureError;
  results.push({rule,state,role,repeat,safe,same,identity,historicalMisses,fullHistoricalPatch:'refused',runtimeSourcePatch:'diagnostic'});
  fs.writeFileSync(path.join(records,'progress.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({label,exit:run.status,same,safe}));
 }
}
fs.writeFileSync(path.join(records,'summary.json'),JSON.stringify({schema:1,developmentId:3208,fullHistoricalPatch:'refused: CHANGES.rst absent in all packages',results},null,2));
