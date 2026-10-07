import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {runCase} from './runner.mjs';import {select,disclosure,testPath} from '../core.mjs';
import {typescriptGraph} from '../typescript-graph.mjs';import {parseTrace} from './trace.mjs';import {exportCase} from './package.mjs';
const [scratch,records,destination]=process.argv.slice(2).map(p=>path.resolve(p));
if(!path.basename(destination).startsWith('lab-a-replay-1-')||fs.existsSync(destination))throw new Error('New lab package destination required');
const summary=JSON.parse(fs.readFileSync(path.join(records,'summary.json')));
if(summary.developmentId!==823||summary.results.length!==12||summary.results.some(r=>!r.safe||!r.parity||!r.validOutcome||!r.mapped))throw new Error('Unverified development observation');
const manifest=JSON.parse(fs.readFileSync(path.join(scratch,'ky823-base.manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const contents=Object.fromEntries(manifest.map(row=>{const bytes=fs.readFileSync(path.join(scratch,'ky823-base',row.path));if(hash(bytes)!==row.sha256)throw new Error('Snapshot mismatch');return [row.path,bytes];}));
const overlay=Object.fromEntries(JSON.parse(fs.readFileSync('lab/lines/example-slice/replay-1/development/sindresorhus--ky-823/test-overlay.json')).overlay.map(r=>[r.path,Buffer.from(r.contentBase64,'base64')]));
const configCode='import fs from "node:fs"; import crypto from "node:crypto"; import {createRequire} from "node:module"; const ts=createRequire("/opt/labdeps/node/package.json")("typescript"); const reads=[]; const read=p=>{const b=fs.readFileSync(p);reads.push({path:p,sha256:crypto.createHash("sha256").update(b).digest("hex")});return b.toString()};const config=ts.readConfigFile("/case/tree/tsconfig.json",read); if(config.error)throw Error("Config read failed"); const result=ts.parseJsonConfigFileContent(config.config,{...ts.sys,readFile:read},"/case/tree"); console.log(JSON.stringify({options:result.options,diagnostics:result.errors.map(e=>({code:e.code,message:ts.flattenDiagnosticMessageText(e.messageText," ")})),reads}));';
const configRecords=path.join(records,'compiler-config');
const configRun=fs.existsSync(path.join(configRecords,'run.json'))?JSON.parse(fs.readFileSync(path.join(configRecords,'run.json'))):await runCase({caseDirectory:summary.cases.base,outputDirectory:configRecords,argv:['node','--input-type=module','-e',configCode],image:summary.results[0].imageId,treeOnlyMount:true,label:'ky823-base-compiler-config'});
if(JSON.stringify(configRun.argv)!==JSON.stringify(['node','--input-type=module','-e',configCode]))throw new Error('Cached config differs');
if(configRun.status!==0||configRun.captureError)throw new Error('Base compiler configuration unavailable');
const config=JSON.parse(configRun.stdout);if(config.diagnostics.length)throw new Error('Base configuration diagnostics; refuse defaults');
const options=JSON.parse(JSON.stringify(config.options).replaceAll('/case/tree','/repo'));
const graph=typescriptGraph(Object.fromEntries(Object.entries({...contents,...overlay}).map(([p,b])=>[p,b.toString()])),options).graph;
const executedRuns=[1,2,3].map(n=>JSON.parse(fs.readFileSync(path.join(records,`ky823-example-base-${n}/measurement.json`))).execution.executed);
const rules=select({repo:'sindresorhus/ky',root:'source/',manifest,graph,entries:['test/http-error.ts'],executedRuns});
const analysis={developmentId:823,config,rules,exports:{},disclosure:{}};
for(const [rule,selection] of Object.entries(rules)) {
 const traces=[1,2,3].map(n=>parseTrace(fs.readFileSync(path.join(records,`ky823-example-base-${n}/files.strace`),'utf8'),manifest,selection.files,'/case/tree',p=>/\.(ts|tsx|js|jsx|mjs|cjs|py|pyi)$/.test(p)&&!testPath('sindresorhus/ky',p)));
 const trace={events:traces.flatMap(t=>t.events),unknown:traces.flatMap(t=>t.unknown),nonProduction:[...new Set(traces.flatMap(t=>t.nonProduction))],requiredProductionExpansion:[...new Set(traces.flatMap(t=>t.requiredProductionExpansion))],directories:traces.flatMap(t=>t.directories),absent:traces.flatMap(t=>t.absent)};
 try{
  const receipt=exportCase({destination:path.join(destination,rule),contents,manifest,core:selection.files,common:['package.json','tsconfig.json'],overlay,trace,repo:'sindresorhus/ky',testPath});
  analysis.exports[rule]={status:'exported',receipt};
  analysis.disclosure[rule]=Object.fromEntries(Object.entries(receipt.variants).map(([variant,rows])=>[variant,disclosure({repo:'sindresorhus/ky',root:'source/',manifest,shipped:[...new Set(rows.filter(r=>r.origin==='base').map(r=>r.path))]})]));
 }catch(error){analysis.exports[rule]={status:'refused',reason:String(error),unknown:trace.unknown};}
}
fs.writeFileSync(path.join(records,'selector-analysis.json'),JSON.stringify(analysis,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(rules).map(([rule,row])=>[rule,{files:row.files.length,unresolved:row.unresolved.length,export:analysis.exports[rule].status,small:analysis.disclosure[rule]?.primary.small}]))));
