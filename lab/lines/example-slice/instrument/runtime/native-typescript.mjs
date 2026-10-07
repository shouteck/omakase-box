// Preload captures native-loader output. Extraction never recompiles project code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import inspector from 'node:inspector';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const root='/case/tree/';

function local(url) {
  let parsed;try {parsed=new URL(url);}catch{return null;}
  if(parsed.protocol!=='file:'||parsed.host!=='')return null;
  const absolute=fileURLToPath(parsed,{windows:false});
  if(!absolute.startsWith(root))return null;
  return absolute;
}

export function captureNative(directory='/record/native') {
  const session=new inspector.Session(), scripts=[];
  session.connect();
  session.on('Debugger.scriptParsed',({params})=>{
    if(!local(params.url))return;
    session.post('Debugger.getScriptSource',{scriptId:params.scriptId},(error,result)=>{
      if(error) {scripts.push({scriptId:params.scriptId,url:params.url,error:String(error)});return;}
      scripts.push({scriptId:params.scriptId,url:params.url,sourceMapURL:params.sourceMapURL??null,
        generated:result.scriptSource,generatedHash:hash(result.scriptSource)});
    });
  });
  session.post('Debugger.enable');
  process.on('exit',()=>{
    fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,`scripts-${process.pid}.json`),JSON.stringify({pid:process.pid,node:process.version,scripts}));
  });
  return session;
}

function actualMap(script,readMap=p=>fs.readFileSync(p,'utf8')) {
  if(!script.sourceMapURL)throw new Error('Native script has no source map');
  const url=script.sourceMapURL;
  if(url.startsWith('data:')) {
    const match=url.match(/^data:application\/json(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=]+)$/);
    if(!match)throw new Error('Unsupported inline source map encoding');
    return {map:JSON.parse(Buffer.from(match[1],'base64').toString('utf8')),mapURL:script.url};
  }
  const absolute=local(new URL(url,script.url).href);
  if(!absolute)throw new Error('External map refused');
  if(fs.existsSync(absolute)&&fs.lstatSync(absolute).isSymbolicLink())throw new Error('Map symlink refused');
  return {map:JSON.parse(readMap(absolute)),mapURL:new URL(url,script.url).href};
}

export function validateMap(script,cached,readSource=p=>fs.readFileSync(p),readMap) {
  if(hash(script.generated)!==script.generatedHash)throw new Error('Generated-body hash mismatch');
  if(!cached||cached.error||!cached.data)throw new Error('Missing source-map-cache data');
  const {map,mapURL}=actualMap(script,readMap);
  // Node 24.11 source_map_cache.sourcesToAbsolute resolves sources and clears
  // sourceRoot before persisting. Compare the complete canonical structures;
  // this permits only that documented implementation transformation.
  const canonical=value=>({...value,sources:value.sources?.map(source=>{
    const joined=(value.sourceRoot||'')+source;
    return path.posix.isAbsolute(joined)?pathToFileURL(joined,{windows:false}).href:new URL(joined,mapURL).href;
  }),sourceRoot:''});
  const normalized=canonical(map);
  if(!isDeepStrictEqual(normalized,canonical(cached.data)))throw new Error('Actual/cached map mismatch');
  if(map.version!==3||!Array.isArray(map.sources)||map.sources.length!==map.sourcesContent?.length||map.sections)throw new Error('Unsupported map shape');
  const sourceRecords=map.sources.map((name,index)=>{
    if(typeof name!=='string'||typeof map.sourcesContent[index]!=='string')throw new Error('Source content missing');
    const sourceUrl=normalized.sources[index];
    const absolute=local(sourceUrl);
    if(!absolute)throw new Error('Out-of-tree map source');
    const bytes=readSource(absolute);
    if(hash(bytes)!==hash(map.sourcesContent[index]))throw new Error('Original source-content hash mismatch');
    return {name,absolute,relative:absolute.slice(root.length),text:map.sourcesContent[index],sha256:hash(bytes)};
  });
  return {map:normalized,mapURL,sourceRecords,rawMapHash:hash(JSON.stringify(map))};
}

export function executableAt(ts,tree,offset) {
  let valid=false;
  function visit(node) {
    if(offset<node.getStart(tree)||offset>=node.getEnd())return;
    const valueImport=ts.isImportDeclaration(node)&&!node.importClause?.isTypeOnly&&
      (!node.importClause||node.importClause.name||ts.isNamespaceImport(node.importClause.namedBindings)||
       node.importClause.namedBindings?.elements.some(e=>!e.isTypeOnly));
    const valueExport=ts.isExportDeclaration(node)&&node.moduleSpecifier&&!node.isTypeOnly&&
      (!node.exportClause||!ts.isNamedExports(node.exportClause)||node.exportClause.elements.some(e=>!e.isTypeOnly));
    if(ts.isStatement(node)&&!ts.isBlock(node)&&!ts.isEmptyStatement(node)&&!ts.isFunctionDeclaration(node)&&
       !ts.isInterfaceDeclaration(node)&&!ts.isTypeAliasDeclaration(node)&&
       (!ts.isImportDeclaration(node)||valueImport)&&(!ts.isExportDeclaration(node)||valueExport)&&
       !(ts.getCombinedModifierFlags(node)&ts.ModifierFlags.Ambient))valid=true;
    ts.forEachChild(node,visit);
  }
  visit(tree);return valid;
}

export async function extractNative({coverageDirectory,captureDirectory,readSource}) {
  const require=createRequire('/opt/labdeps/node/package.json');
  const ts=require('typescript'),{SourceMapConsumer}=require('source-map');
  if(ts.version!=='6.0.3')throw new Error('TypeScript 6.0.3 required');
  const captures=new Map();
  for(const name of fs.readdirSync(captureDirectory).filter(n=>/^scripts-\d+\.json$/.test(n))) {
    const row=JSON.parse(fs.readFileSync(path.join(captureDirectory,name),'utf8'));
    captures.set(String(row.pid),row.scripts);
  }
  const statements={},unknown=[],receipts=[],generatedOnly=[];
  for(const name of fs.readdirSync(coverageDirectory).filter(n=>n.endsWith('.json'))) {
    const pid=name.match(/^coverage-(\d+)-/)?.[1], data=JSON.parse(fs.readFileSync(path.join(coverageDirectory,name),'utf8'));
    for(const scriptCoverage of data.result) {
      if(!local(scriptCoverage.url))continue;
      const matches=(captures.get(pid)??[]).filter(s=>s.scriptId===scriptCoverage.scriptId&&s.url===scriptCoverage.url);
      if(matches.length!==1||matches[0].error) {unknown.push({file:scriptCoverage.url,reason:'Missing or ambiguous native script capture'});continue;}
      const script=matches[0];
      let validated;
      try {validated=validateMap(script,data['source-map-cache']?.[scriptCoverage.url],readSource);}
      catch(error) {unknown.push({file:scriptCoverage.url,reason:String(error)});continue;}
      const {map,mapURL,sourceRecords}=validated;
      const ranges=scriptCoverage.functions.flatMap(f=>f.ranges);
      if(ranges.some(r=>!Number.isSafeInteger(r.startOffset)||!Number.isSafeInteger(r.endOffset)||r.startOffset<0||r.endOffset>script.generated.length||r.endOffset<r.startOffset||!Number.isSafeInteger(r.count)||r.count<0))throw new Error('Malformed V8 ranges');
      const generated=ts.createSourceFile(script.url,script.generated,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
      if(generated.parseDiagnostics.length) {unknown.push({file:script.url,reason:'Generated JS parse failure'});continue;}
      const originalTrees=new Map(sourceRecords.map(s=>[s.absolute,ts.createSourceFile(s.absolute,s.text,ts.ScriptTarget.Latest,true)]));
      await SourceMapConsumer.with(map,null,consumer=>{
        let unmapped=0;
        function visit(node) {
          if(ts.isStatement(node)&&!ts.isBlock(node)&&!ts.isEmptyStatement(node)) {
            const offset=node.getStart(generated), containing=ranges.filter(r=>r.startOffset<=offset&&offset<r.endOffset).sort((a,b)=>(a.endOffset-a.startOffset)-(b.endOffset-b.startOffset));
            if(containing.length&&containing[0].count>0) {
              const position=generated.getLineAndCharacterOfPosition(offset);
              const mapped=consumer.originalPositionFor({line:position.line+1,column:position.character});
              let mappedAbsolute=null;
              if(mapped.source) mappedAbsolute=local(new URL(mapped.source,mapURL).href);
              const source=sourceRecords.find(s=>s.absolute===mappedAbsolute),tree=originalTrees.get(mappedAbsolute);
              if(source&&tree&&mapped.line!=null) {
                const originalOffset=tree.getPositionOfLineAndCharacter(mapped.line-1,mapped.column);
                if(executableAt(ts,tree,originalOffset))(statements[source.relative]??=new Set()).add(mapped.line);
              } else {
                const text=node.getText(generated);
                // Two exact tsx/esbuild name-preservation helpers observed in
                // development calibration. Broader helper transforms remain
                // unknown. Only truly unmapped generated statements qualify.
                const helpers=new Set(['var __defProp=Object.defineProperty;','var __name=(target,value2)=>__defProp(target,"name",{value:value2,configurable:true});','var __name=(target,value)=>__defProp(target,"name",{value,configurable:true});']);
                if(mapped.source===null&&helpers.has(text))generatedOnly.push({file:script.url,offset,sha256:hash(text),reason:'exact development-frozen compiler helper'});
                else unmapped++;
              }
            }
          }
          ts.forEachChild(node,visit);
        }
        visit(generated);
        if(unmapped)unknown.push({file:script.url,reason:'Unmapped executed generated statement candidates',count:unmapped});
      });
      receipts.push({pid,scriptId:script.scriptId,url:script.url,generatedHash:script.generatedHash,mapHash:hash(JSON.stringify(map)),sources:sourceRecords.map(({relative,sha256})=>({path:relative,sha256}))});
    }
  }
  return {version:ts.version,executed:Object.keys(statements).sort(),statements:Object.fromEntries(Object.entries(statements).map(([p,lines])=>[p,[...lines].sort((a,b)=>a-b)])),unknown,generatedOnly,receipts};
}

export function hostileMapChecks() {
  const script={url:'file:///case/tree/src/fixture.ts',generated:'const x=1;',generatedHash:hash('const x=1;')};
  function attach(map){return {...script,sourceMapURL:'data:application/json;base64,'+Buffer.from(JSON.stringify(map)).toString('base64')};}
  const map={version:3,sources:['fixture.ts'],sourcesContent:['const x:number=1;'],names:[],mappings:'AAAA'};
  const cached={data:map};
  validateMap(attach(map),cached,()=>Buffer.from(map.sourcesContent[0]));
  const reject=(fn,label)=>{let failed=false;try{fn()}catch{failed=true}if(!failed)throw new Error('Hostile check failed: '+label);};
  reject(()=>validateMap(attach(map),cached,()=>Buffer.from('tampered')),'embedded content');
  reject(()=>validateMap({...attach(map),generated:'tampered'},cached,()=>Buffer.from(map.sourcesContent[0])),'generated body');
  reject(()=>validateMap(attach(map),{data:{...map,mappings:'AACA'}},()=>Buffer.from(map.sourcesContent[0])),'actual/cache mismatch');
  const escaping={...map,sources:['file:///hostrepo/secret.ts']};
  reject(()=>validateMap(attach(escaping),{data:escaping},()=>Buffer.from(map.sourcesContent[0])),'outside source');
  for(const sourceRoot of ['../src','../src/']) {
    const relative={...map,sourceRoot};
    const external={...script,url:'file:///case/tree/build/generated.js',sourceMapURL:'maps/generated.js.map'};
    const expected=sourceRoot.endsWith('/')?'/case/tree/build/src/fixture.ts':'/case/tree/build/srcfixture.ts';
    const checked=validateMap(external,{data:relative},absolute=>{
      if(absolute!==expected)throw new Error('Incorrect external map source base');
      return Buffer.from(map.sourcesContent[0]);
    },()=>JSON.stringify(relative));
    if(checked.sourceRecords[0].absolute!==expected||checked.map.sources[0]!==pathToFileURL(expected,{windows:false}).href)throw new Error('Incorrect relative sourceRoot');
  }
  return {status:'passed',checks:['original content hash','generated hash','actual/cached map equality','out-of-tree source rejection','external map relative base','sourceRoot separators']};
}

export function syntaxChecks(ts) {
  const cases=[['function cold(){ return 9; }',0,false],['function cold(){ return 9; }',17,true],
    ['import { value } from "./hot";',0,true],['import type { Value } from "./types";',0,false],
    ['import { type Value } from "./types";',0,false],['import "./hot";',0,true],
    ['export { value } from "./hot";',0,true],['export type { Value } from "./types";',0,false],
    ['export { type Value } from "./types";',0,false],['interface Empty {}',0,false],
    ['declare const x: number;',0,false],['// no statement\n',0,false]];
  for(const [source,offset,expected] of cases) {
    const tree=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);
    if(executableAt(ts,tree,offset)!==expected)throw new Error('Executable syntax check failed: '+source+' at '+offset);
  }
  return {status:'passed',checks:cases.length};
}
if(process.env.LAB_NATIVE_CAPTURE==='1')captureNative(process.env.LAB_NATIVE_CAPTURE_DIR??'/record/native');
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='--hostile-check')console.log(JSON.stringify(hostileMapChecks()));
  if(process.argv[2]==='--syntax-check')console.log(JSON.stringify(syntaxChecks(createRequire(import.meta.url)('typescript'))));
  if(process.argv[2]==='extract')console.log(JSON.stringify(await extractNative({coverageDirectory:process.argv[3],captureDirectory:process.argv[4]})));
}
