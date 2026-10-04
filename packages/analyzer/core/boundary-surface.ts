import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseModules, calleeChain, isIdentifierName, propertyChain, positionOf } from '../scanner/source-surface.js';
import type { AnalysisSourceFile, ParsedModule } from '../scanner/source-surface.js';

/** Boundary-surface analysis over captured private application source bytes.
 * Read-only and execution-free: no evidence is ever run on this host, no captured
 * statement bodies, string payload values or file bytes are emitted. Stored
 * projections contain only manifest paths, resolved relative paths, specifier
 * texts, syntactic kinds and short identifier chains (such as process.env reads).
 * Every finding is advisory helper data for later milestone gates; findings
 * cannot authorize execution, transfer, release, disclosure, deployment or any
 * privileged action, and this static AST linting is never a semantic
 * confidentiality proof. */

export const MAX_MANIFEST_FILES = 256;
export const MAX_FILE_BYTES = 1_048_576;
export const MAX_SURFACE_BYTES = 16 * 1_048_576;

export type ImportClassification =
  | 'safe'
  | 'computed'
  | 'unknown'
  | 'rejected'
  | 'protected'
  | 'builtin'
  | 'type-only'
  | 'json';

export type ImportVia = 'static-import' | 'type-import' | 'export-from' | 'import-equals' | 'dynamic-import' | 'require';

export interface ClassifiedImport {
  readonly module: string;
  readonly specifier: string;
  readonly resolved: string | null;
  readonly runtime: boolean;
  readonly via: ImportVia;
  readonly classification: ImportClassification;
  readonly reason: string;
}

export interface EvidenceTarget {
  readonly path: string;
  readonly sha256: string;
}

export interface SurfaceRequest {
  readonly kind: 'private-analysis-surface';
  readonly root: string;
  readonly manifest: readonly EvidenceTarget[];
}

export interface Finding {
  readonly kind: string;
  readonly detail: string;
}

export interface ImportBoundary {
  readonly remote: readonly string[];
  readonly unknown: readonly string[];
  readonly static: readonly string[];
  readonly private: readonly string[];
  readonly builtin: readonly string[];
  readonly nestedWorker: readonly string[];
  readonly typeOnly: readonly string[];
  readonly jsonBinding: readonly { readonly path: string; readonly attribute: string }[];
  readonly computed: readonly string[];
}

export interface BoundaryEvidence {
  readonly path: string;
  readonly kind: string;
  readonly line: number;
  readonly column: number;
  readonly statementKinds: readonly string[];
  readonly boundary: ImportBoundary;
  readonly imports: readonly ClassifiedImport[];
  readonly findings: readonly Finding[];
}

export interface SurfaceImportClosures {
  readonly reachable: readonly string[];
  readonly privateReachable: readonly string[];
}

/** Conservative edit-surface report: for every captured path, the sorted set of
 * captured modules that (transitively) import it, including through type-only
 * and JSON imports, because an edit to any of them can change those dependents. */
export interface SurfaceEditClosure {
  readonly dependentsOf: Readonly<Record<string, readonly string[]>>;
}

export type ModuleVerdictLabel = 'rejected' | 'unsupported' | 'unknown' | 'clean';

export interface VerdictReason {
  readonly kind: string;
  readonly detail: string;
}

export interface ModuleVerdict {
  readonly module: string;
  readonly verdict: ModuleVerdictLabel;
  readonly reasons: readonly VerdictReason[];
}

export interface BoundarySurface {
  readonly canaryReads: boolean;
  readonly limits: readonly string[];
  readonly assurance: 'bounded';
  readonly evidence: readonly BoundaryEvidence[];
  readonly findings: readonly Finding[];
  readonly importClosures: SurfaceImportClosures;
  readonly editSurface: SurfaceEditClosure;
  readonly privateTargets: readonly string[];
  readonly verdicts: readonly ModuleVerdict[];
}

const BUILTIN_PREFIX = 'node:';
const REMOTE_SPECIFIER = /^(?:https?:\/\/|\/\/)/;
const PROTECTED_SPECIFIERS = new Set([
  'worker_threads', 'node:worker_threads',
  'cluster', 'node:cluster',
  'child_process', 'node:child_process'
]);
const BARE_BUILTINS = new Set([
  'fs', 'path', 'crypto', 'http', 'https', 'http2', 'net', 'dns', 'tls', 'dgram',
  'os', 'url', 'util', 'module', 'stream', 'zlib', 'events', 'assert', 'buffer',
  'readline', 'querystring', 'string_decoder', 'tty', 'timers', 'vm', 'inspector',
  'perf_hooks', 'async_hooks', 'v8', 'worker_threads-placeholder'
]);
const UNSAFE_GLOBAL_NAMES = new Set(['globalThis', 'global', 'window']);

interface MutableBoundary {
  remote: string[];
  unknown: string[];
  static: string[];
  private: string[];
  builtin: string[];
  nestedWorker: string[];
  typeOnly: string[];
  jsonBinding: { path: string; attribute: string }[];
  computed: string[];
}

function freshBoundary(): MutableBoundary {
  return { remote: [], unknown: [], static: [], private: [], builtin: [], nestedWorker: [], typeOnly: [], jsonBinding: [], computed: [] };
}

function freezeBoundary(boundary: MutableBoundary): ImportBoundary {
  const freeze = <T,>(values: readonly T[]): readonly T[] => Object.freeze([...values]);
  return Object.freeze({
    remote: freeze(boundary.remote),
    unknown: freeze(boundary.unknown),
    static: freeze(boundary.static),
    private: freeze(boundary.private),
    builtin: freeze(boundary.builtin.sort()),
    nestedWorker: freeze(boundary.nestedWorker),
    typeOnly: freeze(boundary.typeOnly),
    jsonBinding: Object.freeze(boundary.jsonBinding.map(entry => Object.freeze({ ...entry }))),
    computed: freeze(boundary.computed)
  });
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/** Resolve against the captured manifest only: never touches host paths beyond
 * the already-captured bytes and never follows host paths. */
function resolveSpecifier(from: string, specifier: string, known: ReadonlySet<string>): string | null {
  if (!isRelative(specifier)) return null;
  const parts = from.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  const base = parts.join('/');
  if (base === '' || base.startsWith('../')) return null;
  const candidates = new Set<string>([base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]);
  if (base.endsWith('.js') || base.endsWith('.mjs') || base.endsWith('.cjs')) {
    const stem = base.slice(0, -3);
    candidates.add(`${stem}.ts`);
    candidates.add(`${stem}.tsx`);
  }
  for (const candidate of candidates) if (known.has(candidate)) return candidate;
  return null;
}

function isPrivateTarget(path: string | null): boolean {
  return path !== null && path.split('/').includes('private');
}

function classifyImport(modulePath: string, specifier: string, resolved: string | null, runtime: boolean, nonLiteral: boolean): { classification: ImportClassification; reason: string } {
  if (!runtime) return { classification: 'type-only', reason: 'type_only_binding' };
  if (nonLiteral) return { classification: 'computed', reason: 'computed_loading' };
  if (REMOTE_SPECIFIER.test(specifier)) return { classification: 'rejected', reason: 'remote_code_import' };
  if (specifier.endsWith('.json')) return { classification: 'json', reason: 'json_attribute_binding' };
  if (PROTECTED_SPECIFIERS.has(specifier)) return { classification: 'protected', reason: 'protected_import' };
  if (specifier.startsWith(BUILTIN_PREFIX) || BARE_BUILTINS.has(specifier)) return { classification: 'builtin', reason: 'builtin_module' };
  if (resolved === null) return { classification: 'unknown', reason: 'unresolved_import' };
  if (isPrivateTarget(resolved)) {
    return isPrivateTarget(modulePath)
      ? { classification: 'safe', reason: 'private_internal_binding' }
      : { classification: 'rejected', reason: 'private_source_import' };
  }
  return { classification: 'safe', reason: 'static_within_manifest' };
}

function renderArgLabel(expression: ts.Expression | undefined): string {
  if (expression === undefined) return '<missing>';
  if (ts.isStringLiteral(expression) || ts.isIdentifier(expression)) return expression.text;
  if (ts.isCallExpression(expression)) return `${calleeChain(expression.expression)}(...)`;
  return '<expr>';
}

function collectPrivateImportBindings(module: ParsedModule, known: ReadonlySet<string>): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const statement of module.source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    if (statement.importClause.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const resolved = resolveSpecifier(module.path, statement.moduleSpecifier.text, known);
    if (!isPrivateTarget(resolved)) continue;
    const clause = statement.importClause;
    if (clause.name !== undefined) bindings.set(clause.name.text, statement.moduleSpecifier.text);
    const named = clause.namedBindings;
    if (named !== undefined && ts.isNamedImports(named)) for (const element of named.elements) {
      bindings.set(element.name.text, statement.moduleSpecifier.text);
    }
    if (named !== undefined && ts.isNamespaceImport(named)) bindings.set(`*:${named.name.text}`, statement.moduleSpecifier.text);
  }
  return bindings;
}

function collectMutableTopLevelNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if ((statement.declarationList.flags & ts.NodeFlags.Const) !== 0) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
    }
  }
  return names;
}

interface ModuleAnalysis {
  readonly evidence: BoundaryEvidence;
}

function analyzeModule(module: ParsedModule, known: ReadonlySet<string>): ModuleAnalysis {
  const source = module.source;
  const moduleIsPrivate = isPrivateTarget(module.path);
  const boundary = freshBoundary();
  const findings: Finding[] = [];
  const imports: ClassifiedImport[] = [];
  const statementKinds: string[] = [];
  const push = (kind: string, detail: string): void => { findings.push({ kind, detail }); };
  const privateBindings = collectPrivateImportBindings(module, known);
  const mutableTopLevel = collectMutableTopLevelNames(source);

  const record = (via: ImportVia, specifier: string, resolved: string | null, runtime: boolean, attribute: string | null, nonLiteral: boolean): void => {
    const { classification, reason } = classifyImport(module.path, specifier, resolved, runtime, nonLiteral);
    imports.push({ module: module.path, specifier, resolved, runtime, via, classification, reason });
    if (classification === 'type-only') {
      boundary.typeOnly.push(specifier);
      if (resolved !== null && isPrivateTarget(resolved) && !moduleIsPrivate) push('private_type_only', specifier);
      return;
    }
    if (classification === 'json') { boundary.jsonBinding.push({ path: specifier, attribute: attribute ?? 'none' }); return; }
    if (classification === 'computed') { boundary.computed.push(specifier); push('computed_import', `${via}: ${specifier}`); return; }
    if (classification === 'unknown') { boundary.unknown.push(specifier); return; }
    if (classification === 'protected') { boundary.builtin.push(specifier); push('protected_import', specifier); return; }
    if (classification === 'rejected') {
      if (reason === 'private_source_import' && resolved !== null) boundary.private.push(specifier);
      else boundary.remote.push(specifier);
      push(reason, specifier);
      return;
    }
    if (classification === 'builtin') { boundary.builtin.push(specifier); return; }
    boundary.static.push(specifier);
  };

  const exportedFunctions: (ts.FunctionDeclaration | ts.ArrowFunction)[] = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.body !== undefined && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exportedFunctions.push(statement);
    } else if (ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer !== undefined && ts.isArrowFunction(declaration.initializer)) exportedFunctions.push(declaration.initializer);
      }
    }
  }

  const visit = (node: ts.Node): void => {
    statementKinds.push(ts.SyntaxKind[node.kind]);
    if (ts.isImportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (!ts.isStringLiteral(specifier)) record('static-import', '<expr>', null, true, null, true);
      else {
        const text = specifier.text;
        if (node.importClause?.isTypeOnly === true) record('type-import', text, resolveSpecifier(module.path, text, known), false, null, false);
        else if (text.endsWith('.json')) {
          const attribute = node.attributes?.elements.find(element => element.name.kind === ts.SyntaxKind.Identifier && element.name.text === 'type');
          const value = attribute !== undefined && ts.isStringLiteral(attribute.value) ? attribute.value.text : 'none';
          record('static-import', text, null, true, value, false);
        } else record('static-import', text, resolveSpecifier(module.path, text, known), true, null, false);
      }
    } else if (ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined && ts.isStringLiteral(specifier)) record('export-from', specifier.text, resolveSpecifier(module.path, specifier.text, known), !node.isTypeOnly, null, false);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (!ts.isExternalModuleReference(node.moduleReference)) return;
      const expression = node.moduleReference.expression;
      if (ts.isStringLiteral(expression)) record('import-equals', expression.text, resolveSpecifier(module.path, expression.text, known), true, null, false);
      else record('import-equals', `<${ts.SyntaxKind[expression.kind]}>`, null, true, null, true);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const first = node.arguments[0];
        if (first !== undefined && ts.isStringLiteral(first)) record('dynamic-import', first.text, resolveSpecifier(module.path, first.text, known), true, null, false);
        else record('dynamic-import', `import(${renderArgLabel(first)})`, null, true, null, true);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const first = node.arguments[0];
        if (first !== undefined && ts.isStringLiteral(first)) record('require', first.text, resolveSpecifier(module.path, first.text, known), true, null, false);
        else record('require', `require(${renderArgLabel(first)})`, null, true, null, true);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'eval') push('unsafe_global', 'eval(...)');
    } else if (ts.isNewExpression(node)) {
      const label = calleeChain(node.expression);
      if (label === 'Worker' || label === 'SharedWorker' || label.endsWith('.Worker') || label.endsWith('.SharedWorker')) {
        const first = node.arguments?.[0];
        boundary.nestedWorker.push(first !== undefined && ts.isStringLiteral(first) ? first.text : renderArgLabel(first));
        push('protected_import', `new ${label}`);
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === 'Function') push('unsafe_global', 'new Function(...)');
    } else if (ts.isIdentifier(node)) {
      if (isIdentifierName(node)) return;
      if (UNSAFE_GLOBAL_NAMES.has(node.text)) push('unsafe_global', node.text);
      else if (node.text === 'process') push('env_reachable', ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'env' ? 'process.env' : 'process');
    } else if (ts.isPropertyAccessExpression(node)) {
      const chain = propertyChain(node);
      if (chain === 'process.env' || chain.startsWith('process.env.')) push('env_reachable', chain);
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) record('type-import', argument.literal.text, resolveSpecifier(module.path, argument.literal.text, known), false, null, false);
      else record('type-import', '<expr>', null, false, null, false);
    }
    node.forEachChild(visit);
  };
  visit(source);

  if (moduleIsPrivate) push('private_only', 'module itself is private-managed');

  for (const func of exportedFunctions) {
    const label = ts.isFunctionDeclaration(func)
      ? func.name?.text ?? '<anonymous>'
      : ts.isVariableDeclaration(func.parent) && ts.isIdentifier(func.parent.name) ? func.parent.name.text : '<exported-function>';
    const privateReads = new Set<string>();
    const stateReads = new Set<string>();
    const walk = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && !isIdentifierName(node)) {
        const specifier = privateBindings.get(node.text);
        if (specifier !== undefined) privateReads.add(specifier);
        if (mutableTopLevel.has(node.text)) stateReads.add(node.text);
      }
      node.forEachChild(walk);
    };
    walk(func.body ?? func);
    for (const read of privateReads) push('published_reachable', `${label}: ${read}`);
    for (const read of stateReads) push('omitted_state_dependency', `${label}: ${read}`);
  }

  const seen = new Set<string>();
  const uniqueFindings = findings.filter(finding => {
    const key = `${finding.kind}\u0000${finding.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const start = positionOf(source, source);
  const evidence: BoundaryEvidence = {
    path: module.path,
    kind: 'private_analysis_surface',
    line: start.line,
    column: start.column,
    statementKinds: [...new Set(statementKinds)].slice(0, 64),
    boundary: freezeBoundary(boundary),
    imports: Object.freeze(imports.map(entry => Object.freeze({ ...entry }))),
    findings: Object.freeze(uniqueFindings.map(entry => Object.freeze({ ...entry })))
  };
  return { evidence };
}

interface ModuleEdges {
  readonly runtime: readonly string[];
  readonly typeOnly: readonly string[];
  readonly all: readonly string[];
}

function collectModuleEdges(module: ParsedModule, known: ReadonlySet<string>): ModuleEdges {
  const runtime: string[] = [];
  const typeOnly: string[] = [];
  const add = (specifier: string, isType: boolean): void => {
    if (!isRelative(specifier)) return;
    const resolved = resolveSpecifier(module.path, specifier, known);
    if (resolved === null) return;
    (isType ? typeOnly : runtime).push(resolved);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier.text, node.importClause?.isTypeOnly ?? false);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier.text, node.isTypeOnly);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) add(node.moduleReference.expression.text, false);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteral(first)) add(first.text, false);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteral(first)) add(first.text, false);
    }
    node.forEachChild(visit);
  };
  visit(module.source);
  return { runtime: [...new Set(runtime)], typeOnly: [...new Set(typeOnly)], all: [...new Set([...runtime, ...typeOnly])] };
}

function collectClosures(modules: readonly ParsedModule[], known: ReadonlySet<string>): SurfaceImportClosures {
  const privateModules = new Set([...known].filter(path => isPrivateTarget(path)));
  const runtimeEdges = new Map<string, string[]>();
  const typeOnlyTargets = new Set<string>();
  for (const module of modules) {
    const edges = collectModuleEdges(module, known);
    for (const target of edges.typeOnly) typeOnlyTargets.add(target);
    runtimeEdges.set(module.path, edges.runtime.filter(target => /\.(?:ts|tsx)$/.test(target)));
  }
  const roots = modules.map(module => module.path).filter(path => !typeOnlyTargets.has(path));
  const reachable = new Set<string>();
  const privateReachable = new Set<string>();
  const visitFrom = (path: string): void => {
    if (reachable.has(path)) return;
    reachable.add(path);
    for (const next of runtimeEdges.get(path) ?? []) {
      if (privateModules.has(next)) privateReachable.add(next);
      visitFrom(next);
    }
  };
  for (const path of roots) visitFrom(path);
  return { reachable: [...reachable].sort(), privateReachable: [...privateReachable].sort() };
}

function collectEditSurface(modules: readonly ParsedModule[], known: ReadonlySet<string>): SurfaceEditClosure {
  const edges = new Map<string, readonly string[]>();
  for (const module of modules) edges.set(module.path, collectModuleEdges(module, known).all);
  const reverse = new Map<string, Set<string>>();
  for (const [from, targets] of edges) {
    for (const target of targets) {
      if (target === from) continue;
      const set = reverse.get(target) ?? new Set<string>();
      set.add(from);
      reverse.set(target, set);
    }
  }
  const dependentsOf: Record<string, readonly string[]> = {};
  for (const target of [...known].sort()) {
    const seen = new Set<string>([target]);
    const queue = [target];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const next of reverse.get(current) ?? []) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    seen.delete(target);
    dependentsOf[target] = Object.freeze([...seen].sort());
  }
  return { dependentsOf: Object.freeze(dependentsOf) };
}

const VERDICT_PRIORITY: Record<ModuleVerdictLabel, number> = { clean: 0, unknown: 1, unsupported: 2, rejected: 3 };

interface MutableModuleVerdict {
  module: string;
  verdict: ModuleVerdictLabel;
  reasons: VerdictReason[];
}

function classifyOne(item: BoundaryEvidence): MutableModuleVerdict {
  const reasons: VerdictReason[] = [];
  const seen = new Set<string>();
  let verdict: ModuleVerdictLabel = 'clean';
  const raise = (candidate: ModuleVerdictLabel, kind: string, detail: string): void => {
    if (VERDICT_PRIORITY[candidate] > VERDICT_PRIORITY[verdict]) verdict = candidate;
    const key = `${kind}\u0000${detail}`;
    if (!seen.has(key)) { seen.add(key); reasons.push({ kind, detail }); }
  };
  for (const entry of item.imports) {
    if (entry.classification === 'rejected') raise('rejected', entry.reason, entry.specifier);
    else if (entry.classification === 'protected') raise('rejected', 'protected_import', entry.specifier);
    else if (entry.classification === 'computed') raise('unknown', 'computed_loading', entry.specifier);
    else if (entry.classification === 'unknown') raise('unknown', 'unresolved_import', entry.specifier);
  }
  for (const finding of item.findings) {
    if (finding.kind === 'published_reachable') raise('rejected', 'published_private_reach', finding.detail);
    else if (finding.kind === 'protected_import' || finding.kind === 'private_type_only') raise('rejected', finding.kind, finding.detail);
    else if (finding.kind === 'omitted_state_dependency' || finding.kind === 'unsafe_global') raise('unsupported', finding.kind, finding.detail);
    else if (finding.kind === 'env_reachable') raise('unsupported', 'environment_reach', finding.detail);
  }
  return { module: item.path, verdict, reasons };
}

/** Classify every analyzed module: rejected for known forbidden couplings,
 * unsupported for conservative capability limits, unknown for dynamic or
 * unresolved behaviour. The label 'safe' is never a module verdict. */
export function classifyEvidence(evidence: readonly BoundaryEvidence[], dependentsOf?: Readonly<Record<string, readonly string[]>>): ModuleVerdict[] {
  const verdicts: MutableModuleVerdict[] = evidence.map(classifyOne);
  if (dependentsOf !== undefined) {
    const byModule = new Map(verdicts.map(item => [item.module, item]));
    for (const [target, dependents] of Object.entries(dependentsOf)) {
      const origin = byModule.get(target);
      if (origin === undefined || origin.verdict !== 'rejected') continue;
      for (const dependent of dependents) {
        const verdict = byModule.get(dependent);
        if (verdict === undefined || verdict.verdict === 'rejected') continue;
        verdict.verdict = 'rejected';
        verdict.reasons.push({ kind: 'rejected_dependency', detail: `transitively depends on ${target}` });
      }
    }
  }
  return verdicts;
}

export async function buildBoundarySurface(request: SurfaceRequest): Promise<BoundarySurface> {
  if (request.kind !== 'private-analysis-surface') throw new Error('private_analysis_bounds');
  if (request.manifest.length > MAX_MANIFEST_FILES) throw new Error('private_analysis_bounds');
  const known = new Set(request.manifest.map(target => target.path));
  if (known.size !== request.manifest.length) throw new Error('private_analysis_bounds');
  let totalBytes = 0;
  const files: AnalysisSourceFile[] = [];
  for (const target of request.manifest) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(target.path)) throw new Error('private_analysis_bounds');
    if (target.path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) throw new Error('private_analysis_bounds');
    const bytes = await readFile(join(request.root, ...target.path.split('/')));
    totalBytes += bytes.length;
    if (bytes.length > MAX_FILE_BYTES || totalBytes > MAX_SURFACE_BYTES) throw new Error('private_analysis_bounds');
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== target.sha256) throw new Error('private_analysis_evidence_drift');
    files.push({ path: target.path, content: bytes.toString('utf8') });
  }
  const modules = parseModules(files.filter(file => /\.(?:ts|tsx)$/.test(file.path)));
  const analyses = modules.map(module => analyzeModule(module, known));
  const evidence = analyses.map(analysis => analysis.evidence);
  const findings = evidence.flatMap(item => item.findings);
  const privateTargets = [...new Set(analyses.flatMap(analysis => analysis.evidence.boundary.private.map(specifier => resolveSpecifier(analysis.evidence.path, specifier, known) ?? specifier)))].sort();
  const editSurface = collectEditSurface(modules, known);
  const verdicts = classifyEvidence(evidence, editSurface.dependentsOf);
  return Object.freeze({
    canaryReads: false,
    limits: [...ANALYSIS_LIMITS, ANALYSIS_DISCLAIMER],
    assurance: ANALYSIS_ASSURANCE,
    evidence,
    findings,
    importClosures: collectClosures(modules, known),
    editSurface,
    privateTargets,
    verdicts
  });
}

export const ANALYSIS_LIMITS = [
  'Findings are captured syntactically over the pinned manifest bytes; aliases, decorators, generics and conditional runtime paths are not interpreted.',
  'Exported-surface reachability walks only top-level exported function declarations and exported arrow-function bindings; class members are not walked.',
  'No evidence is executed and no build/test/eval/worker runs on this surface.',
  'All findings are advisory; they cannot authorize any action or prove confidentiality.',
  'Unknown or unresolved behaviour is reported as unknown and is never reported safe.'
] as const;

export const ANALYSIS_ASSURANCE = 'bounded' as const;
export const ANALYSIS_DISCLAIMER = 'This static AST linting is never a semantic confidentiality proof; its findings cannot authorize execution, release, disclosure or any privileged action.';
