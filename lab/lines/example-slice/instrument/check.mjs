import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {select,disclosure,score,safePath,validateManifest} from './core.mjs';
import {typescriptGraph} from './typescript-graph.mjs';
import {authorize} from './collect-development.mjs';
const repo='sindresorhus/ky',root='source/';
const contents={
  'test/example.ts':"import {run} from '../source/main.js'; import './helper.js'; run();",
  'test/helper.ts':"if (false) { import('../source/cold.js'); }",
  'source/main.ts':"import type {Shape} from './types.js'; import {run as imported} from './warm.js'; export const run = imported;",
  'source/warm.ts':"export function run(){return 0;}",
  'source/types.ts':"export interface Shape {x:number}",
  'source/cold.ts':"export const cold = 9;",
  'source/generated.ts':"// generated\nexport const unused=0;",
  'source/runtime.json':'{"value":0}',
  'sibling/reuse.ts':"export const helper=1;",
  'README.md':'reference',
};
const manifest=Object.entries(contents).map(([path,text])=>({path,bytes:Buffer.byteLength(text),kind:'file'}));
const {version,graph}=typescriptGraph(contents);
const input={repo,root,manifest,graph,entries:['test/example.ts'],executedRuns:Array.from({length:3},()=>['source/main.ts','source/warm.ts','test/example.ts'])};
const rules=select(input);
assert.deepEqual(rules.E.files,['source/main.ts','source/warm.ts']);
assert.deepEqual(rules.EI.files,['source/main.ts','source/types.ts','source/warm.ts']);
assert.deepEqual(rules.R.files,['source/cold.ts','source/main.ts','source/types.ts','source/warm.ts']);
assert.deepEqual(rules.G.files,['source/cold.ts','source/generated.ts','source/main.ts','source/runtime.json','source/types.ts','source/warm.ts']);
const dynamic=typescriptGraph({'source/main.ts':"const name = 'dynamic'; import(name); import('./absent.js'); import('external');"}).graph;
assert.deepEqual(dynamic['source/main.ts'].map(e=>e.kind),['dynamic','missing','external']);
assert.throws(()=>typescriptGraph({'source/main.ts':'export const x = ;'}),/parse failure/);
for (const expression of ['eval("x")','globalThis.eval("x")','(0, eval)("x")','new Function("return 1")()','globalThis["eval"]("x")']) {
  assert.ok(typescriptGraph({'source/a.ts':expression}).graph['source/a.ts'].some(e=>e.kind==='dynamic'));
}
const uncertain=select({...input,graph:{...graph,'source/main.ts':dynamic['source/main.ts']}});
assert.equal(uncertain.EI.unresolved.length,3);
const unparsed=select({...input,graph:{}});
assert.equal(unparsed.R.unresolved[0].kind,'unparsed');
const size=disclosure({repo,root,manifest,shipped:['source/generated.ts','sibling/reuse.ts','test/example.ts']});
assert.equal(size.repositorySource.fileTotal,6);
assert.equal(size.repositorySource.fileCount,2);
assert.equal(size.rootSource.fileTotal,5);
assert.equal(size.rootSource.fileCount,1);
assert.equal(size.totalRepository.fileCount,3);
assert.equal(size.small,false);
const zero=disclosure({repo,root,manifest:[{path:'README.md',bytes:1,kind:'file'}],shipped:[]});
assert.equal(zero.repositorySource.fileFraction,null); assert.equal(zero.sizeUnknown,true); assert.equal(zero.small,false);
const base={repo,root,editable:['source/main.ts'],patch:[{path:'source/main.ts',action:'modify'}],
  observations:Array(3).fill('same-observed-failure'),referenceReplay:'passed',context:[],variant:'primary',size:{small:true,sizeUnknown:false}};
assert.equal(score(base).primaryRowPass,true);
const attacks=[
  {observations:Array(3).fill('different')},
  {observations:['same-observed-failure','unknown','same-observed-failure']},
  {referenceReplay:'unknown'},
  {variant:'expanded'},
  {variant:'optional-context'},
  {size:{small:false,sizeUnknown:false}},
  {size:{small:true,sizeUnknown:true}},
  {patch:[{path:'pnpm-lock.yaml',action:'modify'}]},
  {patch:[{path:'sibling/new.ts',action:'add',newAllowed:true}]},
  {patch:[{path:'source/new.ts',action:'add',newAllowed:false}]},
  {context:[{path:'sibling/reuse.ts',label:'unknown',evidence:'not established',scepticAgreed:false}]},
  {context:[{path:'sibling/reuse.ts',label:'essential-for-reference',evidence:'reference import',scepticAgreed:true}]},
  {context:[{path:'sibling/reuse.ts',label:'replaceable',evidence:'local implementation possible',scepticAgreed:false}]},
];
for (const attack of attacks) assert.equal(score({...base,...attack}).primaryRowPass,false,JSON.stringify(attack));
assert.equal(score({...base,context:[{path:'sibling/reuse.ts',label:'replaceable',evidence:'recorded alternative',scepticAgreed:true}]}).primaryRowPass,true);
assert.equal(score({...base,patch:[{path:'source/new.ts',action:'add',newAllowed:true}]}).primaryRowPass,true);
assert.equal(score({...base,repo:'colinhacks/zod',root:'packages/zod/src/',patch:[{path:'packages/zod/src/__tests__/hidden.ts',action:'add',newAllowed:true}]}).newPermitted,false);
for (const invalid of ['../escape','/absolute','C:/absolute','a\\b','a//b','a/./b','a\0b','source/a.ts:stream','source/AUX.ts','source/a.ts.','source/a.ts ','source/a?.ts','source/a\nb.ts']) assert.throws(()=>safePath(invalid));
for (const badRoot of ['','source','source/../','source//']) assert.throws(()=>disclosure({repo,root:badRoot,manifest,shipped:['source/main.ts']}));
assert.throws(()=>validateManifest([{path:'a.ts',kind:'file',bytes:1},{path:'A.ts',kind:'file',bytes:1}]));
assert.throws(()=>validateManifest([{path:'a.ts',kind:'symlink',bytes:1}]));
assert.throws(()=>validateManifest([{path:'a.ts',kind:'file',bytes:NaN}]));
assert.throws(()=>disclosure({repo,root,manifest,shipped:['source/absent.ts']}));
assert.throws(()=>select({...input,executedRuns:[[]]}));
assert.throws(()=>select({...input,graph:{'source/main.ts':[{kind:'local',to:'source/absent.ts'}]}}));
assert.equal(authorize(repo,823).partition,'development');
assert.throws(()=>authorize(repo,830),/Development ID required/); // Any nondevelopment ID fails.
const pool=JSON.parse(readFileSync(new URL('../replay-1/candidate-metadata.json',import.meta.url),'utf8'));
for (const r of pool.repositories) for (const c of r.candidates.filter(c=>c.partition==='confirmation')) assert.throws(()=>authorize(r.repository,c.number));
const sha256=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
console.log(JSON.stringify({status:'passed',kind:'known-answer mechanical checks; no real project execution',
  versions:{node:process.version,typescript:version},rules,disclosure:size,primaryCounterexamples:attacks.length,
  confirmationIDsRejected:45,sourceHashes:Object.fromEntries(['core.mjs','typescript-graph.mjs','collect-development.mjs','check.mjs'].map(p=>[p,sha256(p)]))},null,2));
