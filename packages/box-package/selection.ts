import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import type { BoxAgreement } from './agreement.js';

// Compiler-derived closure: walk the TypeScript compiler's module resolution from the
// agreement's entrypoints (and module-valued editable files). Every owner source file the
// walk reaches is package source; an edge that lands on an excluded path, an undeclared
// dependency, or outside the source root is a named preparation gap. The same walk is the
// closure verifier: the selected set is closed exactly when no gap remains.

export interface SelectionGap {
  readonly kind: 'reachable-excluded' | 'undeclared-dependency' | 'unresolved-import' | 'escapes-root' | 'missing-editable' | 'missing-input' | 'excluded-input' | 'dynamic-import' | 'duplicate-destination';
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

export function proposeSelection(agreement: BoxAgreement, sourceRootAbs: string): Selection {
  const root = resolve(sourceRootAbs);
  // Containment and exclusion are decided on the canonical real path, never on the declared
  // spelling alone: on a case-insensitive filesystem, or behind a link inside the source
  // root, a declared path can name different bytes than its spelling suggests. Prefixes are
  // compared case-folded so an excluded directory stays excluded under any casing the
  // filesystem would accept.
  const realRoot = realpathSync(root);
  const toOwner = (absolute: string): string => toPosix(relative(root, normalize(absolute)));
  const canonicalOwner = (absolute: string): string | null => {
    try { return toPosix(relative(realRoot, realpathSync(absolute))); }
    catch { return null; }
  };
  const insideRoot = (owner: string): boolean => owner !== '' && owner !== '..' && !owner.startsWith('../') && !isAbsolute(owner);
  const excluded = agreement.excludedPrefixes.map(prefix => prefix.toLowerCase());
  const isExcluded = (ownerPath: string): boolean => excluded.some(prefix => ownerPath.toLowerCase().startsWith(prefix));

  const gaps: SelectionGap[] = [];
  const reached = new Map<string, string[]>(); // canonical owner path -> chain that first reached it
  const queue: Array<{ owner: string; chain: string[] }> = [];

  const enqueue = (owner: string, chain: string[]): void => {
    if (reached.has(owner)) return;
    reached.set(owner, chain);
    queue.push({ owner, chain });
  };

  for (const entrypoint of agreement.entrypoints) {
    if (isExcluded(entrypoint)) { gaps.push({ kind: 'excluded-input', detail: entrypoint, chain: [entrypoint] }); continue; }
    const absolute = join(root, entrypoint);
    const stat = statSync(absolute, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isFile()) { gaps.push({ kind: 'unresolved-import', detail: entrypoint, chain: [entrypoint] }); continue; }
    const owner = canonicalOwner(absolute);
    if (owner === null || !insideRoot(owner)) { gaps.push({ kind: 'escapes-root', detail: entrypoint, chain: [entrypoint] }); continue; }
    if (isExcluded(owner)) { gaps.push({ kind: 'excluded-input', detail: entrypoint, chain: [entrypoint, owner] }); continue; }
    enqueue(owner, [owner]);
  }

  for (const entry of agreement.editable) {
    if (isExcluded(entry.owner) || isExcluded(entry.box)) {
      gaps.push({ kind: 'excluded-input', detail: entry.owner, chain: [entry.owner] });
      continue;
    }
    if (entry.kind === 'copy') {
      const absolute = join(root, entry.owner);
      const stat = statSync(absolute, { throwIfNoEntry: false });
      if (stat === undefined || !stat.isFile()) { gaps.push({ kind: 'missing-editable', detail: entry.owner, chain: [entry.owner] }); continue; }
      const owner = canonicalOwner(absolute);
      if (owner === null || !insideRoot(owner)) { gaps.push({ kind: 'escapes-root', detail: entry.owner, chain: [entry.owner] }); continue; }
      if (isExcluded(owner)) { gaps.push({ kind: 'excluded-input', detail: entry.owner, chain: [entry.owner, owner] }); continue; }
      if (MODULE_FILE.test(owner)) enqueue(owner, [owner]);
    }
  }
  for (const context of agreement.readContext) {
    const owner = canonicalOwner(join(root, context));
    if (owner !== null && !insideRoot(owner)) { gaps.push({ kind: 'escapes-root', detail: `read-context ${context}`, chain: [context] }); continue; }
    if (isExcluded(context) || (owner !== null && isExcluded(owner))) gaps.push({ kind: 'excluded-input', detail: `read-context ${context}`, chain: [context] });
  }

  for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
    const { owner, chain } = item;
    const absolute = join(realRoot, owner);
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
      const targetOwner = toOwner(resolved.resolvedFileName);
      if (!insideRoot(targetOwner)) { gaps.push({ kind: 'escapes-root', detail: specifier, chain: [...chain, specifier] }); continue; }
      // The resolved path may sit behind a link or a case alias: the real file is what must
      // stay inside the root and outside every excluded prefix.
      const realOwner = canonicalOwner(resolved.resolvedFileName);
      if (realOwner === null) { gaps.push({ kind: 'unresolved-import', detail: specifier, chain: [...chain, specifier] }); continue; }
      if (!insideRoot(realOwner)) { gaps.push({ kind: 'escapes-root', detail: specifier, chain: [...chain, specifier, realOwner] }); continue; }
      const trail = targetOwner === realOwner ? [realOwner] : [targetOwner, realOwner];
      if (isExcluded(targetOwner) || isExcluded(realOwner)) {
        if (!gaps.some(gap => gap.kind === 'reachable-excluded' && gap.detail === realOwner)) gaps.push({ kind: 'reachable-excluded', detail: realOwner, chain: [...chain, ...trail] });
        continue;
      }
      enqueue(realOwner, [...chain, ...trail]);
    }
  }

  const files: SelectedFile[] = [];
  const editableOwners = new Set<string>();
  for (const entry of agreement.editable) {
    const canonical = canonicalOwner(join(root, entry.owner));
    editableOwners.add(canonical ?? entry.owner);
    if (entry.kind === 'generated-scaffold') files.push({ owner: entry.owner, box: entry.box, origin: 'generated', generated: entry.generator });
    else files.push({ owner: canonical ?? entry.owner, box: entry.box, origin: 'editable' });
  }
  for (const owner of [...reached.keys()].sort()) {
    if (editableOwners.has(owner)) continue; // already recorded with its editable origin
    files.push({ owner, box: `src/${owner.startsWith('src/') ? owner.slice(4) : owner}`, origin: 'runnable' });
  }
  return { files, gaps };
}

export function deriveSelection(agreement: BoxAgreement, sourceRootAbs: string): Selection {
  const root = resolve(sourceRootAbs);
  const realRoot = realpathSync(root);
  const canonicalOwner = (absolute: string): string | null => {
    try { return toPosix(relative(realRoot, realpathSync(absolute))); }
    catch { return null; }
  };
  const insideRoot = (owner: string): boolean => owner !== '' && owner !== '..' && !owner.startsWith('../') && !isAbsolute(owner);
  const excluded = agreement.excludedPrefixes.map(prefix => prefix.toLowerCase());
  const isExcluded = (ownerPath: string): boolean => excluded.some(prefix => ownerPath.toLowerCase().startsWith(prefix));

  const gaps: SelectionGap[] = [];
  const files: SelectedFile[] = [];
  const destinations = new Set<string>();
  const push = (owner: string, box: string, origin: SelectedFile['origin'], generated?: string): void => {
    const key = box.toLowerCase();
    if (destinations.has(key)) { gaps.push({ kind: 'duplicate-destination', detail: box, chain: [owner, box] }); return; }
    destinations.add(key);
    files.push(generated === undefined ? { owner, box, origin } : { owner, box, origin, generated });
  };

  for (const entry of agreement.files) {
    if (isExcluded(entry.owner) || (entry.box !== undefined && isExcluded(entry.box))) { gaps.push({ kind: 'excluded-input', detail: entry.owner, chain: [entry.owner] }); continue; }
    const absolute = join(root, entry.owner);
    const stat = statSync(absolute, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isFile()) { gaps.push({ kind: 'missing-input', detail: entry.owner, chain: [entry.owner] }); continue; }
    const owner = canonicalOwner(absolute);
    if (owner === null || !insideRoot(owner)) { gaps.push({ kind: 'escapes-root', detail: entry.owner, chain: [entry.owner] }); continue; }
    if (isExcluded(owner)) { gaps.push({ kind: 'excluded-input', detail: entry.owner, chain: [entry.owner, owner] }); continue; }
    push(owner, entry.box ?? owner, 'runnable');
  }

  for (const entry of agreement.editable) {
    if (isExcluded(entry.owner) || isExcluded(entry.box)) {
      gaps.push({ kind: 'excluded-input', detail: entry.owner, chain: [entry.owner] });
      continue;
    }
    if (entry.kind === 'generated-scaffold') { push(entry.owner, entry.box, 'generated', entry.generator); continue; }
    const absolute = join(root, entry.owner);
    const stat = statSync(absolute, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isFile()) { gaps.push({ kind: 'missing-editable', detail: entry.owner, chain: [entry.owner] }); continue; }
    const owner = canonicalOwner(absolute);
    if (owner === null || !insideRoot(owner)) { gaps.push({ kind: 'escapes-root', detail: entry.owner, chain: [entry.owner] }); continue; }
    if (isExcluded(owner)) { gaps.push({ kind: 'excluded-input', detail: entry.owner, chain: [entry.owner, owner] }); continue; }
    push(owner, entry.box, 'editable');
  }

  for (const context of agreement.readContext) {
    const owner = canonicalOwner(join(root, context));
    if (owner !== null && !insideRoot(owner)) { gaps.push({ kind: 'escapes-root', detail: `read-context ${context}`, chain: [context] }); continue; }
    if (isExcluded(context) || (owner !== null && isExcluded(owner))) gaps.push({ kind: 'excluded-input', detail: `read-context ${context}`, chain: [context] });
  }

  return { files, gaps };
}
