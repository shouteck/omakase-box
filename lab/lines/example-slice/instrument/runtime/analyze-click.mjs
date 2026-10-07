// Only the already-observed development task; no confirmation inputs accepted.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runCase} from './runner.mjs';
import {select,disclosure,testPath} from '../core.mjs';
import {parseTrace} from './trace.mjs';
import {exportCase} from './package.mjs';
const [scratch,records,destination]=process.argv.slice(2).map(p=>path.resolve(p));
const summary=JSON.parse(fs.readFileSync(path.join(records,'summary.json')));
for(const role of ['example','guard'])for(const state of ['base','fixed']) {
 const group=summary.results.filter(r=>r.role===role&&r.state===state);
 const first=group[0]?.phases[0];
 if(group.length!==3||group.some(r=>!r.runOkay||!r.parity||r.phases[0].stdout!==first.stdout||r.phases[0].stderr!==first.stderr||r.phases[0].exit!==first.exit))throw new Error('Unstable development observation');
 if((role==='example'&&state==='base')?first.exit===0:first.exit!==0)throw new Error('Wrong base/fixed/guard outcome');
}
if(!path.basename(scratch).startsWith('lab-a-replay-1-')||!path.basename(destination).startsWith('lab-a-replay-1-'))throw new Error('Lab scratch required');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(scratch,'click3208-base.manifest.json')));
const contents=Object.fromEntries(manifest.map(row=>{
 const bytes=fs.readFileSync(path.join(scratch,'click3208-base',row.path));
 if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw new Error('Snapshot hash mismatch');
 return [row.path,bytes];
}));
const example=JSON.parse(fs.readFileSync(path.join(records,'click3208-example-base-1/run.json')));
const mounted=example.args.find(a=>a.startsWith('type=bind,src='));
const caseDirectory=mounted.slice('type=bind,src='.length).split(',dst=')[0];
const graphCode='import json,pathlib,sys; sys.path.insert(0,"/opt/instrument"); from python_adapter import graph; root=pathlib.Path("/case/tree"); print(json.dumps(graph({str(p.relative_to(root)):p.read_text() for p in root.rglob("*.py")},["src","tests"])))';
const graphRecords=path.join(records,'graph-corrected');
const graphRun=fs.existsSync(path.join(graphRecords,'run.json'))?JSON.parse(fs.readFileSync(path.join(graphRecords,'run.json'))):await runCase({caseDirectory,outputDirectory:graphRecords,label:'click3208-base-graph',argv:['python','-c',graphCode]});
if(JSON.stringify(graphRun.argv)!==JSON.stringify(['python','-c',graphCode]))throw new Error('Cached graph command differs');
if(graphRun.status!==0||graphRun.captureError||graphRun.timedOut)throw new Error('Graph unknown');
const graph=JSON.parse(graphRun.stdout).graph;
const execution=[1,2,3].map(n=>JSON.parse(fs.readFileSync(path.join(records,`click3208-example-base-${n}/measurement.json`))).execution.executed);
const rules=select({repo:'pallets/click',root:'src/click/',manifest,graph,entries:['tests/test_formatting.py','tests/conftest.py'],executedRuns:execution});
const overlay={'tests/test_formatting.py':fs.readFileSync(path.join(scratch,'click3208-fixed/tests/test_formatting.py'))};
const analysis={developmentId:3208,disclosure:{},exports:{},rules};
for(const [rule,selection] of Object.entries(rules)) {
 const traces=[1,2,3].map(n=>parseTrace(fs.readFileSync(path.join(records,`click3208-example-base-${n}/files.strace`),'utf8'),manifest,selection.files,'/case/tree',p=>/\.(py|pyi)$/.test(p)&&!testPath('pallets/click',p)));
 const trace={events:traces.flatMap(t=>t.events),unknown:traces.flatMap(t=>t.unknown),nonProduction:[...new Set(traces.flatMap(t=>t.nonProduction))],requiredProductionExpansion:[...new Set(traces.flatMap(t=>t.requiredProductionExpansion))],directories:traces.flatMap(t=>t.directories),absent:traces.flatMap(t=>t.absent)};
 try {
  const receipt=exportCase({destination:path.join(destination,rule),contents,manifest,core:selection.files,common:['pyproject.toml'],overlay,trace,repo:'pallets/click',testPath,immutablePaths:[]});
  analysis.exports[rule]={status:'exported',receipt};
  analysis.disclosure[rule]=Object.fromEntries(Object.entries(receipt.variants).map(([variant,rows])=>[variant,disclosure({repo:'pallets/click',root:'src/click/',manifest,shipped:[...new Set(rows.filter(r=>r.origin==='base').map(r=>r.path))]})]));
 } catch(error) {analysis.exports[rule]={status:'refused',reason:String(error),unknown:trace.unknown};}
}
fs.writeFileSync(path.join(records,'selector-analysis.json'),JSON.stringify(analysis,null,2));
console.log(JSON.stringify({developmentId:3208,rules:Object.fromEntries(Object.entries(rules).map(([name,row])=>[name,{files:row.files.length,unresolved:row.unresolved.length,export:analysis.exports[name].status,small:analysis.disclosure[name]?.primary.small}]))}));
