// In-memory parser/resolver: no project module or tsconfig plugin executes.
import ts from 'typescript';
import path from 'node:path';
import {safePath} from './core.mjs';
export function typescriptGraph(contents, options={}) {
  if (ts.version!=='6.0.3') throw new Error('TypeScript 6.0.3 required');
  const files=new Map(Object.entries(contents).map(([p,text])=>['/repo/'+safePath(p),text]));
  const host={fileExists:p=>files.has(path.posix.normalize(p)),readFile:p=>files.get(path.posix.normalize(p)),
    directoryExists:p=>[...files.keys()].some(f=>f.startsWith(p.replace(/\/$/,'')+'/')),
    getCurrentDirectory:()=>'/repo',realpath:p=>p};
  const compilerOptions={moduleResolution:ts.ModuleResolutionKind.Bundler,module:ts.ModuleKind.ESNext,...options};
  const graph={};
  for (const [absolute,text] of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(absolute)) continue;
    const relative=absolute.slice(6), edges=[];
    const tree=ts.createSourceFile(absolute,text,ts.ScriptTarget.Latest,true);
    if (tree.parseDiagnostics.length) throw new Error('Source parse failure: '+relative);
    function add(expression) {
      if (!expression || !ts.isStringLiteralLike(expression)) { edges.push({kind:'dynamic'}); return; }
      const specifier=expression.text;
      const resolved=ts.resolveModuleName(specifier,absolute,compilerOptions,host).resolvedModule;
      if (resolved) {
        const target=path.posix.normalize(resolved.resolvedFileName);
        if (files.has(target)&&target.startsWith('/repo/')) edges.push({kind:'local',to:target.slice(6),specifier});
        else edges.push({kind:'external',specifier});
      } else edges.push({kind:specifier.startsWith('.')?'missing':'external',specifier});
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) { if (node.moduleSpecifier) add(node.moduleSpecifier); }
      if (ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
      if (ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
      if (ts.isCallExpression(node)) {
        if (node.expression.kind===ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression)&&node.expression.text==='require')) add(node.arguments[0]);
      }
      // Recognize direct/indirect/property eval and Function constructor syntax;
      // do not execute or parse the generated string as if it were a static import.
      if (ts.isIdentifier(node)&&['eval','Function'].includes(node.text)) edges.push({kind:'dynamic',specifier:node.text});
      if (ts.isElementAccessExpression(node)&&node.argumentExpression&&ts.isStringLiteralLike(node.argumentExpression)&&
          ['eval','Function'].includes(node.argumentExpression.text)) edges.push({kind:'dynamic',specifier:node.argumentExpression.text});
      ts.forEachChild(node,visit);
    }
    visit(tree);
    graph[relative]=[...new Map(edges.map(e=>[JSON.stringify(e),e])).values()];
  }
  return {version:ts.version,graph};
}
