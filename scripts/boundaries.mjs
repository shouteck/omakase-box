import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { root } from './process.mjs';

export function importSpecifiers(text, filename = 'source.ts') {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const specifiers = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) specifiers.push(node.moduleReference.expression.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) throw new Error('Dynamic unresolved imports are forbidden in the external boundary.');
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specifiers;
}
export function allowedExternalSpecifier(value) {
  if (value.startsWith('@private-task/')) return ['@private-task/contracts/public', '@private-task/contracts/hash'].includes(value);
  return !/^(?:file:|https?:|[A-Za-z]:|\/|#|\\\\)/.test(value);
}
export function checkExternalBoundaries() {
  const visited = new Set();
  const forbidden = ['services/private-api/', 'apps/private-console/', 'packages/planner/', 'packages/analyzer/', 'packages/evaluation/', 'packages/contracts/private/', 'examples/', '.runtime/'];
  function inspect(path) {
    path = realpathSync(path);
    const local = relative(root, path).replaceAll('\\', '/').toLowerCase();
    if (local.startsWith('../') || forbidden.some(prefix => local.startsWith(prefix))) throw new Error('External dependency crosses a private source boundary.');
    if (visited.has(path)) return;
    visited.add(path);
    for (const specifier of importSpecifiers(readFileSync(path, 'utf8'), path)) {
      if (!allowedExternalSpecifier(specifier)) throw new Error('External dependency uses a disallowed package or URL.');
      if (specifier === '@private-task/contracts/public') inspect(join(root, 'packages/contracts/public/index.ts'));
      else if (specifier === '@private-task/contracts/hash') inspect(join(root, 'packages/contracts/hash.ts'));
      else if (specifier.startsWith('.')) {
        const target = resolve(dirname(path), specifier);
        const candidates = [target.replace(/\.js$/, '.ts'), target.replace(/\.js$/, '.tsx'), target, join(target, 'index.ts')];
        const found = candidates.find(value => existsSync(value) && !value.endsWith('/'));
        if (!found) throw new Error('External dependency cannot be statically resolved.');
        inspect(found);
      }
    }
  }
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (['node_modules', 'dist'].includes(entry.name)) continue;
      const target = join(path, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (/\.tsx?$/.test(entry.name)) inspect(target);
      else if (entry.name === 'package.json') {
        const manifest = JSON.parse(readFileSync(target, 'utf8'));
        for (const specifier of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) if (specifier !== '@private-task/contracts' && !allowedExternalSpecifier(specifier)) throw new Error('External manifest depends on a private workspace package.');
      }
    }
  }
  for (const path of ['services/external-api', 'apps/contributor-portal', 'packages/contracts/public']) walk(join(root, path));
  return { assurance: 'tested', status: 'passed', checkedSourceFiles: visited.size, limitation: 'Application workspace source-import policy; not a third-party supply-chain audit or runtime ACL proof.' };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(checkExternalBoundaries()));
