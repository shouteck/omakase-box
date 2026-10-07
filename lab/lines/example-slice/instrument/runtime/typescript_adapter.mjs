import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire('/opt/labdeps/node/package.json');
const ts=require('typescript'), {SourceMapConsumer}=require('source-map');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');

export function transpile(tree, output) {
  if (ts.version!=='6.0.3') throw new Error('TypeScript version mismatch');
  const receipt={version:ts.version,files:[]};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const absolute=path.join(dir,entry.name), relative=path.relative(tree,absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink()) throw new Error('Symlink refused');
      if (entry.isDirectory()) {walk(absolute);continue;}
      if (!/\.(ts|tsx)$/.test(relative)||relative.endsWith('.d.ts')) continue;
      const source=fs.readFileSync(absolute,'utf8');
      const compiled=ts.transpileModule(source,{fileName:relative,reportDiagnostics:true,compilerOptions:{
        target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,sourceMap:true,inlineSources:true,
        jsx:ts.JsxEmit.React,esModuleInterop:true}});
      if (compiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error)) throw new Error('Transpile diagnostics: '+relative);
      const generated=relative.replace(/\.(ts|tsx)$/,'.js'), destination=path.join(output,generated);
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.writeFileSync(destination,compiled.outputText);
      fs.writeFileSync(destination+'.map',compiled.sourceMapText);
      const map=JSON.parse(compiled.sourceMapText);
      if (map.sources.length!==1 || map.sourcesContent[0]!==source) throw new Error('Unverified map source');
      receipt.files.push({source:relative,generated,sourceHash:hash(source),generatedHash:hash(compiled.outputText),mapHash:hash(compiled.sourceMapText)});
    }
  }
  walk(tree);
  fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));
  return receipt;
}

export async function extract(directory, output, tree) {
  const receipt=JSON.parse(fs.readFileSync(path.join(output,'receipt.json'),'utf8'));
  const scripts=[];
  for (const name of fs.readdirSync(directory).filter(p=>p.endsWith('.json'))) scripts.push(...JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')).result);
  const statements={};
  for (const row of receipt.files) {
    const generated=fs.readFileSync(path.join(output,row.generated),'utf8'), mapText=fs.readFileSync(path.join(output,row.generated+'.map'),'utf8');
    if (hash(generated)!==row.generatedHash || hash(mapText)!==row.mapHash || hash(fs.readFileSync(path.join(tree,row.source)))!==row.sourceHash) throw new Error('Map/source receipt mismatch');
    const map=JSON.parse(mapText), source=fs.readFileSync(path.join(tree,row.source),'utf8');
    if (map.sourcesContent[0]!==source) throw new Error('Map content mismatch');
    const matches=scripts.filter(s=>s.url===new URL('file://'+path.join(output,row.generated)).href);
    const js=ts.createSourceFile(row.generated,generated,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const starts=[];
    function visit(node) {
      // Blocks, empty exports and transpiler prologues are not original statements.
      if (ts.isStatement(node)&&!ts.isBlock(node)&&!ts.isEmptyStatement(node)&&!ts.isExportDeclaration(node)) starts.push(node.getStart(js));
      ts.forEachChild(node,visit);
    }
    visit(js);
    await SourceMapConsumer.with(map,null,consumer=>{
      const lines=new Set();
      for (const offset of starts) {
        const runs=matches.map(script=>script.functions.flatMap(f=>f.ranges).filter(r=>r.startOffset<=offset&&offset<r.endOffset).sort((a,b)=>(a.endOffset-a.startOffset)-(b.endOffset-b.startOffset)));
        if (!runs.some(r=>r.length&&r[0].count>0)) continue;
        const loc=js.getLineAndCharacterOfPosition(offset), original=consumer.originalPositionFor({line:loc.line+1,column:loc.character,bias:SourceMapConsumer.GREATEST_LOWER_BOUND});
        if (original.line==null || original.source!==map.sources[0]) continue;
        // Require the exact mapped column to fall in an original executable
        // statement. Line-only matching confuses an export prologue with an
        // uncalled function body sharing that line.
        const originalTree=ts.createSourceFile(row.source,source,ts.ScriptTarget.Latest,true);
        const originalOffset=originalTree.getPositionOfLineAndCharacter(original.line-1,original.column);
        let valid=false;
        function originalVisit(node) {
          const valueImport=ts.isImportDeclaration(node)&&!node.importClause?.isTypeOnly&&
            (!node.importClause||node.importClause.name||ts.isNamespaceImport(node.importClause.namedBindings)||
             node.importClause.namedBindings?.elements.some(e=>!e.isTypeOnly));
          const valueExport=ts.isExportDeclaration(node)&&node.moduleSpecifier&&!node.isTypeOnly;
          if (ts.isStatement(node)&&!ts.isBlock(node)&&!ts.isEmptyStatement(node)&&!ts.isFunctionDeclaration(node)&&!ts.isInterfaceDeclaration(node)&&!ts.isTypeAliasDeclaration(node)&&
              (!ts.isImportDeclaration(node)||valueImport)&&(!ts.isExportDeclaration(node)||valueExport)&&!(ts.getCombinedModifierFlags(node)&ts.ModifierFlags.Ambient)) {
            if(node.getStart(originalTree)<=originalOffset&&originalOffset<node.getEnd()) valid=true;
          }
          ts.forEachChild(node,originalVisit);
        }
        originalVisit(originalTree);
        if(valid) lines.add(original.line);
      }
      if(lines.size) statements[row.source]=[...lines].sort((a,b)=>a-b);
    });
  }
  return {version:ts.version,executed:Object.keys(statements).sort(),statements};
}

if (process.argv[2]==='transpile') transpile(process.argv[3],process.argv[4]);
if (process.argv[2]==='extract') console.log(JSON.stringify(await extract(process.argv[3],process.argv[4],process.argv[5])));
