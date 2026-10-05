import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import type { BoxAgreement } from './agreement.js';

// Compiler-derived closure: walk the TypeScript compiler's module resolution from the
// agreement's entrypoints (and module-valued editable files). Every owner source file the
// walk reaches is package source; an edge that lands on an excluded path, an undeclared
// dependency, or outside the source root is a named preparation gap. The same walk is the
// closure verifier: the selected set is closed exactly when no gap remains.

export interface SelectionGap {
  readonly kind: 'reachable-excluded' | 'undeclared-dependency' | 'unresolved-import' | 'escapes-root' | 'missing-editable' | 'excluded-input' | 'dynamic-import';
  readonly detail: string;
  readonly chain: readonly string[];
}

export interface SelectedFile {
  readonly owner: string;
  readonly box: string;
  readonly origin: 'runnable' | 'editable' | 'generated';
  readonly generated?: string;
}

export interface Selection {
  readonly files: readonly SelectedFile[];
  readonly gaps: readonly SelectionGap[];
}

const MODULE_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  resolveJsonModule: true,
  strict: true,
  allowJs: false
};

const MODULE_FILE = /\.(?:ts|tsx|mts|cts|json)$/;

function specifiersOf(source: ts.SourceFile): { specifiers: string[]; dynamic: ts.Node[] } {
  const specifiers: string[] = [];
  const dynamic: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) specifiers.push(node.moduleReference.expression.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteral(argument)) specifiers.push(argument.text);
      else dynamic.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { specifiers, dynamic };
}

function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

export function toPosix(path: string): string {
  return path.split(sep).join('/');
}

export function deriveSelection(agreement: BoxAgreement, sourceRootAbs: string): Selection {
  const root = resolve(sourceRootAbs);
  const toOwner = (absolute: string): string => toPosix(relative(root, normalize(absolute)));
  const isExcluded = (ownerPath: string): boolean => agreement.excludedPrefixes.some(prefix => ownerPath.startsWith(prefix));
  const insideRoot = (absolute: string): boolean => {
    const rel = toOwner(absolute);
    return rel !== '' && !rel.startsWith('../') && rel !== '..' && !isAbsolute(rel);
  };

  const gaps: SelectionGap[] = [];
  const reached = new Map<string, string[]>(); // owner path -> chain that first reached it
  const queue: Array<{ owner: string; chain: string[] }> = [];

  const enqueue = (owner: string, chain: string[]): void => {
    if (reached.has(owner)) return;
    reached.set(owner, chain);
    queue.push({ owner, chain });
  };

  for (const entrypoint of agreement.entrypoints) {
    if (isExcluded(entrypoint)) { gaps.push({ kind: 'excluded-input', detail: entrypoint, chain: [entrypoint] }); continue; }
    const absolute = join(root, entrypoint);
    if (!existsSync(absolute) || !insideRoot(realpathSync(absolute))) {
      gaps.push({ kind: 'unresolved-import', detail: entrypoint, chain: [entrypoint] });
      continue;
    }
    enqueue(entrypoint, [entrypoint]);
  }

  for (const entry of agreement.editable) {
    if (isExcluded(entry.owner) || isExcluded(entry.box)) {
      gaps.push({ kind: 'excluded-input', detail: entry.owner, chain: [entry.owner] });
      continue;
    }
    if (entry.kind === 'copy') {
      const absolute = join(root, entry.owner);
      if (!existsSync(absolute)) { gaps.push({ kind: 'missing-editable', detail: entry.owner, chain: [entry.owner] }); continue; }
      if (!insideRoot(realpathSync(absolute))) { gaps.push({ kind: 'escapes-root', detail: entry.owner, chain: [entry.owner] }); continue; }
      if (MODULE_FILE.test(entry.owner)) enqueue(entry.owner, [entry.owner]);
    }
  }
  for (const context of agreement.readContext) {
    if (isExcluded(context)) gaps.push({ kind: 'excluded-input', detail: `read-context ${context}`, chain: [context] });
  }

  while (queue.length > 0) {
    const { owner, chain } = queue.shift() as { owner: string; chain: string[] };
    const absolute = join(root, owner);
    const text = readFileSync(absolute, 'utf8');
    const source = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, owner.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const { specifiers, dynamic } = specifiersOf(source);
    for (const node of dynamic) gaps.push({ kind: 'dynamic-import', detail: owner, chain: [...chain] });
    for (const specifier of specifiers) {
      if (specifier.startsWith('node:')) continue; // runtime builtin, no source disclosure
      if (!specifier.startsWith('.')) {
        const name = packageName(specifier);
        if (!Object.hasOwn(agreement.declaredDependencies, name)) gaps.push({ kind: 'undeclared-dependency', detail: specifier, chain: [...chain, specifier] });
        continue;
      }
      const resolved = ts.resolveModuleName(specifier, absolute, MODULE_OPTIONS, ts.sys).resolvedModule;
      if (resolved === undefined) { gaps.push({ kind: 'unresolved-import', detail: specifier, chain: [...chain, specifier] }); continue; }
      const target = normalize(resolved.resolvedFileName);
      if (!insideRoot(target)) { gaps.push({ kind: 'escapes-root', detail: specifier, chain: [...chain, specifier] }); continue; }
      const targetOwner = toOwner(target);
      // A resolved path may itself sit behind a symlink: prove the real file stays in the root.
      if (!insideRoot(realpathSync(target))) { gaps.push({ kind: 'escapes-root', detail: specifier, chain: [...chain, specifier, targetOwner] }); continue; }
      if (isExcluded(targetOwner)) {
        if (!gaps.some(gap => gap.kind === 'reachable-excluded' && gap.detail === targetOwner)) gaps.push({ kind: 'reachable-excluded', detail: targetOwner, chain: [...chain, targetOwner] });
        continue;
      }
      enqueue(targetOwner, [...chain, targetOwner]);
    }
  }

  const files: SelectedFile[] = [];
  for (const entry of agreement.editable) {
    if (entry.kind === 'generated-scaffold') files.push({ owner: entry.owner, box: entry.box, origin: 'generated', generated: entry.generator });
    else files.push({ owner: entry.owner, box: entry.box, origin: 'editable' });
  }
  const editableOwners = new Set(agreement.editable.map(entry => entry.owner));
  for (const owner of [...reached.keys()].sort()) {
    if (editableOwners.has(owner)) continue; // already recorded with its editable origin
    files.push({ owner, box: `src/${owner.startsWith('src/') ? owner.slice(4) : owner}`, origin: 'runnable' });
  }
  return { files, gaps };
}
