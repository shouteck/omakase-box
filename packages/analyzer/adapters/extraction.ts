import ts from 'typescript';
import { createHash } from 'node:crypto';
import { contentHash } from '../../contracts/hash.js';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SurfaceRequest } from '../core/boundary-surface.js';
import { buildBoundarySurface } from '../core/boundary-surface.js';

export const EXTRACTION_ASSURANCE = 'bounded' as const;
export const MAX_EXTRACTION_FILES = 256;
export const MAX_EXTRACTION_FILE_BYTES = 1_048_576;
export const MAX_EXTRACTION_TOTAL_BYTES = 16 * 1_048_576;
export const MAX_COUPLED_MODULES = 4;
export const MAX_PRIVATE_CALLERS = 8;
export const MAX_CALL_SITES_PER_FILE = 8;
export const MAX_GENERATED_TOTAL_BYTES = 64 * 1024;

export const BOUNDED_EXTRACTION_LIMITS: readonly string[] = [
  'Extraction and parameterization are bounded static AST transformations over hash-verified captured bytes; captured code and generated proposals are never executed on this host.',
  'The supported model covers top-level exported consumer functions that bind one protected call result to a single const local, with one removable protected subject parameter or one single-field props type, plus declared private caller files; anything wider is reported as not_supported instead of silently rewritten.',
  'The extracted public boundary declares structural types only; runtime preservation and integration of the proposed private diff remain pending gates for the isolated runner.',
  'Proposal projections disclose generic option shapes and the generated public boundary text only; they never contain captured payload values, private paths or the retained adapter body.',
  'Proposals and findings cannot authorize execution, transfer, release, disclosure or any privileged action.'
];

export interface CapturedExtractionFile {
  readonly path: string;
  readonly sha256: string;
  readonly content: string;
}

export interface ExtractionRequest {
  readonly kind: 'private-boundary-extraction';
  readonly files: readonly CapturedExtractionFile[];
  readonly protectedModulePath: string;
  readonly coupledModulePaths: readonly string[];
  readonly privateCallerPaths: readonly string[];
  readonly retainedAdapterPath: string;
  readonly boundaryName?: string;
}

export type ExtractionTypeKind = 'string' | 'number' | 'boolean';

export interface ExtractionShapeProperty {
  readonly name: string;
  readonly type: ExtractionTypeKind;
}

export interface BoundaryExtractionChecks {
  readonly baselineTypes: 'passed' | 'not_run';
  readonly transformedTypes: 'passed' | 'failed';
  readonly transformationModel: 'passed' | 'failed';
  readonly modelAssertions: readonly string[];
}

export interface ProposedModuleEdit {
  readonly path: string;
  readonly originalSha256: string;
  readonly generatedSource: string;
  readonly sha256: string;
  readonly edits: readonly string[];
}

export interface BoundaryExtractionProposal {
  readonly assurance: typeof EXTRACTION_ASSURANCE;
  readonly status: 'proposed';
  readonly protectedModulePath: string;
  readonly protectedExports: readonly string[];
  readonly protectedSubjectType: string;
  readonly extractedShape: { readonly kind: 'array-of-object'; readonly elementProperties: readonly ExtractionShapeProperty[] };
  readonly boundary: { readonly path: string; readonly typeName: string; readonly generatedSource: string; readonly sha256: string };
  readonly parameterizedModules: readonly ProposedModuleEdit[];
  readonly retainedAdapter: { readonly path: string; readonly generatedSource: string; readonly sha256: string; readonly protectedCalls: readonly string[]; readonly boundaryTypeName: string };
  readonly privateCallerReplacements: readonly ProposedModuleEdit[];
  readonly advisoryUncapturedCandidates: readonly string[];
  readonly checks: BoundaryExtractionChecks;
  readonly approval: { readonly required: true; readonly status: 'pending_owner_approval'; readonly proposalHash: string };
  readonly limits: readonly string[];
  readonly retainedPrivateWork: readonly string[];
  readonly assumptions: readonly string[];
}

export interface NotSupportedExtraction {
  readonly assurance: typeof EXTRACTION_ASSURANCE;
  readonly status: 'not_supported';
  readonly reason: string;
  readonly missingCapabilities: readonly string[];
  readonly retainedPrivateWork: readonly string[];
  readonly proposalHash: string;
}

export type ExtractionResult = BoundaryExtractionProposal | NotSupportedExtraction;

export interface ExtractionPublicProjection {
  readonly status: 'proposed' | 'not_supported';
  readonly assurance: typeof EXTRACTION_ASSURANCE;
  readonly proposalHash: string;
  readonly boundary: { readonly typeName: string; readonly generatedSource: string; readonly sha256: string } | null;
  readonly extractedShape: { readonly kind: 'array-of-object'; readonly elementProperties: readonly ExtractionShapeProperty[] } | null;
  readonly checks: BoundaryExtractionChecks | null;
  readonly approval: { readonly required: true; readonly status: 'pending_owner_approval' } | null;
  readonly missingCapabilities: readonly string[];
}

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SHIMS_PATH = 'analysis-shims.d.ts';

const DEFAULT_RETAINED_WORK: readonly string[] = [
  'Protected rule computation, trusted wrappers and the private mapping remain private-managed.',
  'The proposed private diff stays data-only and is never executed or applied before owner approval.'
];

function isPortablePath(path: string): boolean {
  if (!PATH_PATTERN.test(path)) return false;
  return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

function isScriptPath(path: string): boolean {
  return (path.endsWith('.ts') || path.endsWith('.tsx')) && !path.endsWith('.d.ts');
}

function hasPrivateSegment(path: string): boolean {
  return path.split('/').includes('private');
}

function notSupported(reason: string, missingCapabilities: readonly string[]): NotSupportedExtraction {
  const payload = { assurance: EXTRACTION_ASSURANCE, status: 'not_supported' as const, reason, missingCapabilities, retainedPrivateWork: DEFAULT_RETAINED_WORK };
  return { ...payload, proposalHash: contentHash(payload) };
}

function relSpecifier(fromDir: string, targetPath: string): string {
  const fromParts = fromDir.split('/').filter(part => part !== '');
  const toParts = targetPath.split('/');
  const fileName = toParts.pop() ?? '';
  const stem = fileName.replace(/\.(?:ts|tsx)$/, '');
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) common += 1;
  const ups = fromParts.length - common;
  const prefix = ups === 0 ? './' : '../'.repeat(ups);
  return prefix + [...toParts.slice(common), `${stem}.js`].join('/');
}

function resolveSpecifier(from: string, specifier: string, known: ReadonlySet<string>): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const parts = from.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  const base = parts.join('/');
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  if (base.endsWith('.js') || base.endsWith('.mjs') || base.endsWith('.cjs')) {
    const stem = base.slice(0, -3);
    candidates.push(`${stem}.ts`, `${stem}.tsx`);
  }
  for (const candidate of candidates) if (known.has(candidate)) return candidate;
  return null;
}

function parseSource(path: string, content: string): ts.SourceFile {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, kind);
}

interface ImportBindingInfo {
  readonly specifier: string;
  readonly resolved: string | null;
  readonly values: readonly string[];
  readonly types: readonly string[];
  readonly namespaces: readonly string[];
}

function importBindings(source: ts.SourceFile, known: ReadonlySet<string>): ImportBindingInfo[] {
  const bindings: ImportBindingInfo[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause !== undefined) {
      const specifier = node.moduleSpecifier.text;
      const resolved = resolveSpecifier(source.fileName, specifier, known);
      const values: string[] = [];
      const types: string[] = [];
      const namespaces: string[] = [];
      const clause = node.importClause;
      const addNamed = (named: ts.NamedImports, typeOnly: boolean): void => {
        for (const element of named.elements) {
          const imported = (element.propertyName ?? element.name).text;
          if (typeOnly || element.isTypeOnly) types.push(imported);
          else values.push(imported);
        }
      };
      if (clause.isTypeOnly === true) {
        if (clause.name !== undefined) types.push(clause.name.text);
        if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) addNamed(clause.namedBindings, true);
      } else {
        if (clause.name !== undefined) values.push(clause.name.text);
        if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) addNamed(clause.namedBindings, false);
        else if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) namespaces.push(clause.namedBindings.name.text);
      }
      bindings.push({ specifier, resolved, values, types, namespaces });
    }
    node.forEachChild(visit);
  };
  source.statements.forEach(statement => visit(statement));
  return bindings;
}

function isNamePosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (parent === undefined) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isQualifiedName(parent) && parent.right === node) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true;
  if ((ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) && parent.name === node) return true;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return true;
  if ((ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent) || ts.isEnumDeclaration(parent)) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) return true;
  if (ts.isImportClause(parent) && parent.name === node) return true;
  if (ts.isNamespaceImport(parent) && parent.name === node) return true;
  if (ts.isExportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) return true;
  if (ts.isJsxAttribute(parent) && parent.name === node) return true;
  return false;
}

function valueNamesWithin(node: ts.Node): Map<string, readonly ts.Identifier[]> {
  const references = new Map<string, ts.Identifier[]>();
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child) && !isNamePosition(child)) {
      const existing = references.get(child.text) ?? [];
      existing.push(child);
      references.set(child.text, existing);
    }
    child.forEachChild(visit);
  };
  node.forEachChild(visit);
  return references;
}

function countValueNamesInExcluding(node: ts.Node, name: string, excluded: readonly ts.Node[]): number {
  let count = 0;
  const visit = (child: ts.Node): void => {
    if (excluded.length > 0 && excluded.some(entry => entry === child || isNodeWithin(child, entry))) return;
    if (ts.isIdentifier(child) && child.text === name && !isNamePosition(child)) count += 1;
    child.forEachChild(visit);
  };
  node.forEachChild(visit);
  return count;
}

function isNodeWithin(node: ts.Node, ancestor: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current !== undefined) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function jsxNameText(name: ts.JsxAttributeName): string | null {
  if (name.kind === ts.SyntaxKind.Identifier) return name.text;
  if (name.kind === ts.SyntaxKind.JsxNamespacedName) return `${name.namespace.text}:${name.name.text}`;
  return null;
}

function bareSpecifiersOf(sources: Iterable<ts.SourceFile>): readonly string[] {
  const bare = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) bare.add(node.moduleSpecifier.text);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) bare.add(node.moduleSpecifier.text);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) bare.add(node.moduleReference.expression.text);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) bare.add(node.argument.literal.text);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] !== undefined && ts.isStringLiteral(node.arguments[0])) bare.add(node.arguments[0].text);
    node.forEachChild(visit);
  };
  for (const source of sources) source.statements.forEach(statement => visit(statement));
  return [...bare].filter(specifier => !specifier.startsWith('./') && !specifier.startsWith('../') && !specifier.startsWith('/')).sort();
}

interface ShimRecord {
  readonly specifier: string;
}

function shimText(bare: readonly string[], external: readonly ShimRecord[] = []): string {
  void external;
  const modules = bare.map(specifier => {
    if (specifier === 'react') return "declare module 'react' {\n  export function useState<S>(initialState: S | (() => S)): [S, (value: S) => void];\n}";
    return `declare module '${specifier}';`;
  });
  return [...modules, 'declare namespace JSX {', '  type Element = any;', '  interface IntrinsicElements { [elem: string]: any }', '  interface IntrinsicAttributes { [key: string]: any }', '}'].join('\n');
}

function compilerOptions(): ts.CompilerOptions {
  return {
    strict: true,
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.Preserve,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
    allowNonTsExtensions: true
  };
}

function pascalCase(input: string): string {
  return input.slice(0, 1).toUpperCase() + input.slice(1);
}

function kebabOf(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function deriveBoundaryTypeName(functionName: string): string {
  let stem = functionName.replace(/^(?:derive|get|compute)(?=[A-Z])/, '').replace(/private/gi, '');
  while (stem.length > 0 && stem.slice(0, 1) === stem.slice(0, 1).toLowerCase()) stem = stem.slice(1);
  if (!/^[A-Za-z]/.test(stem)) stem = 'Options';
  return `Public${pascalCase(stem)}`;
}

interface ContainerPlan {
  readonly container: ts.FunctionDeclaration;
  readonly mode: 'parameter' | 'props';
  readonly addedName: string;
  readonly subjectName: string;
  readonly subjectIndex: number;
  readonly subjectTypeName: string;
  readonly subjectAnnotationNodes: readonly ts.Node[];
  readonly rewrittenParameterNodes: readonly ts.Node[];
  readonly removedStatements: readonly ts.VariableStatement[];
}

interface CallSite {
  readonly call: ts.CallExpression;
  readonly functionName: string;
}

interface CallerSitePlan {
  readonly boundName: string;
  readonly mode: 'parameter' | 'props';
  readonly attributeName: string;
  readonly argumentIndex: number;
}

interface CallerPlan {
  readonly path: string;
  readonly sites: readonly CallerSitePlan[];
}

interface PlannerOutcome {
  readonly planned: boolean;
  readonly failure: string;
  readonly callSites: readonly CallSite[];
  readonly plans: readonly ContainerPlan[];
}

function planContainerForCall(source: ts.SourceFile, call: ts.CallExpression, functionName: string, existing: readonly ContainerPlan[]): PlannerOutcome {
  const parent = call.parent;
  if (parent === undefined || !ts.isVariableDeclaration(parent) || !ts.isIdentifier(parent.name) || parent.type !== undefined) {
    return { planned: false, failure: `the ${functionName} result is not bound to a plain const local of a top-level exported consumer`, callSites: [], plans: [] };
  }
  const localName = parent.name.text;
  const list = parent.parent;
  if (!ts.isVariableDeclarationList(list) || (list.flags & ts.NodeFlags.Const) === 0 || list.declarations.length !== 1) {
    return { planned: false, failure: `the ${functionName} result is not a single const binding`, callSites: [], plans: [] };
  }
  const statement = list.parent;
  if (!ts.isVariableStatement(statement) || statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
    return { planned: false, failure: `the ${functionName} result is exported instead of consuming a parameterized boundary`, callSites: [], plans: [] };
  }
  const block = statement.parent;
  if (block === undefined || !ts.isBlock(block)) {
    return { planned: false, failure: `the ${functionName} binding is outside a function body`, callSites: [], plans: [] };
  }
  const container = block.parent;
  if (container === undefined || !ts.isFunctionDeclaration(container) || container.body !== block || container.name === undefined || container.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) !== true || container.parent === undefined || !ts.isSourceFile(container.parent)) {
    return { planned: false, failure: `the ${functionName} binding is not inside a named top-level exported function`, callSites: [], plans: [] };
  }
  const withinNames = valueNamesWithin(statement);
  const parameterSubjectNames: string[] = [];
  for (const parameter of container.parameters) {
    if (ts.isIdentifier(parameter.name)) parameterSubjectNames.push(parameter.name.text);
    else if (ts.isObjectBindingPattern(parameter.name) && parameter.name.elements.length === 1) {
      const element = parameter.name.elements[0];
      if (element !== undefined && ts.isBindingElement(element) && element.propertyName === undefined && ts.isIdentifier(element.name)) parameterSubjectNames.push(element.name.text);
    }
  }
  const subjectCandidates = [...withinNames.keys()].filter(name => parameterSubjectNames.includes(name));
  if (subjectCandidates.length !== 1) {
    return { planned: false, failure: `${subjectCandidates.length} container parameters feed the protected ${functionName}; the bounded model supports exactly one removable subject`, callSites: [], plans: [] };
  }
  const subjectName = subjectCandidates[0]!;
  const subjectDeclaration = container.parameters.find(parameter => (ts.isIdentifier(parameter.name) && parameter.name.text === subjectName) || (ts.isObjectBindingPattern(parameter.name) && parameter.name.elements.length === 1 && parameter.name.elements[0] !== undefined && ts.isBindingElement(parameter.name.elements[0]) && parameter.name.elements[0].propertyName === undefined && ts.isIdentifier(parameter.name.elements[0].name) && parameter.name.elements[0].name.text === subjectName));
  if (subjectDeclaration === undefined) {
    return { planned: false, failure: `the protected subject ${subjectName} is not a container parameter`, callSites: [], plans: [] };
  }
  const subject = subjectDeclaration;
  const annotation = subjectDeclaration.type;
  if (annotation === undefined || annotation.kind !== ts.SyntaxKind.TypeLiteral && !(ts.isTypeReferenceNode(annotation) && ts.isIdentifier(annotation.typeName))) {
    return { planned: false, failure: `the protected subject ${subjectName} carries an uncheckable annotation`, callSites: [], plans: [] };
  }
  const subjectTypeName = ts.isObjectBindingPattern(subject.name) && subject.type !== undefined && ts.isTypeLiteralNode(subject.type) && subject.type.members[0] !== undefined && ts.isPropertySignature(subject.type.members[0]) && subject.type.members[0].type !== undefined && ts.isTypeReferenceNode(subject.type.members[0].type) && ts.isIdentifier(subject.type.members[0].type.typeName)
    ? subject.type.members[0].type.typeName.text
    : annotation.kind !== ts.SyntaxKind.TypeLiteral && ts.isTypeReferenceNode(annotation) && ts.isIdentifier(annotation.typeName) ? annotation.typeName.text : '';
  const subjectIndex = container.parameters.indexOf(subject);
  const mode: 'parameter' | 'props' = container.parameters.length === 1 && ts.isObjectBindingPattern(container.parameters[0]!.name) ? 'props' : 'parameter';
  if (mode === 'parameter') {
    if (subject.questionToken !== undefined || subject.initializer !== undefined || subject.dotDotDotToken !== undefined) {
      return { planned: false, failure: `the protected subject parameter ${subjectName} carries unsupported modifiers`, callSites: [], plans: [] };
    }
  } else if (subject.questionToken !== undefined || subject.initializer !== undefined || subject.dotDotDotToken !== undefined) {
    return { planned: false, failure: 'the props parameter carries unsupported modifiers', callSites: [], plans: [] };
  }
  if (mode === 'props') {
    const parameter = container.parameters[0]!;
    if (parameter.questionToken !== undefined || parameter.initializer !== undefined || parameter.dotDotDotToken !== undefined) {
      return { planned: false, failure: 'the props parameter carries unsupported modifiers', callSites: [], plans: [] };
    }
    const rawName = parameter.name;
    if (!ts.isObjectBindingPattern(rawName)) {
      return { planned: false, failure: 'the props binding is not an object pattern', callSites: [], plans: [] };
    }
    const binding = rawName;
    const element = binding.elements[0];
    if (binding.elements.length !== 1 || element === undefined || !ts.isBindingElement(element) || !ts.isIdentifier(element.name) || element.propertyName !== undefined) {
      return { planned: false, failure: 'the props binding is not a single plain named field', callSites: [], plans: [] };
    }
    if (parameter.type === undefined || !ts.isTypeLiteralNode(parameter.type) || parameter.type.members.length !== 1 || parameter.type.members[0] === undefined) {
      return { planned: false, failure: 'the props type is not a single-field inline type literal', callSites: [], plans: [] };
    }
    const member = parameter.type.members[0];
    if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name) || member.name.text !== subjectName || member.type === undefined || !ts.isTypeReferenceNode(member.type) || !ts.isIdentifier(member.type.typeName) || member.type.typeName.text !== subjectTypeName) {
      return { planned: false, failure: 'the props field does not carry the protected subject type', callSites: [], plans: [] };
    }
    const prior = existing.find(plan => plan.container === container);
    if (prior !== undefined) {
      if (prior.subjectName !== subjectName || prior.subjectTypeName !== subjectTypeName || prior.addedName !== localName) {
        return { planned: false, failure: 'one consumer binds protected results or subjects inconsistently', callSites: [], plans: [] };
      }
      return { planned: true, failure: '', callSites: [], plans: [{ ...prior, removedStatements: [...prior.removedStatements, statement] }] };
    }
    return { planned: true, failure: '', callSites: [], plans: [{ container, mode, addedName: localName, subjectName, subjectIndex, subjectTypeName, subjectAnnotationNodes: [member.type], rewrittenParameterNodes: [parameter, member.type], removedStatements: [statement] }] };
  }
  if (subjectIndex !== container.parameters.length - 1) {
    return { planned: false, failure: `the protected subject parameter ${subjectName} is not the last parameter, so removal would misalign private callers`, callSites: [], plans: [] };
  }
  const excludedNodes: ts.Node[] = [];
  for (const plan of existing) {
    if (plan.container !== container) continue;
    excludedNodes.push(...plan.subjectAnnotationNodes, ...plan.rewrittenParameterNodes);
  }
  excludedNodes.push(annotation, subject);
  if (countValueNamesInExcluding(container, subjectName, [...excludedNodes, statement]) > 0) {
    return { planned: false, failure: `the protected subject ${subjectName} is still used outside the removable ${functionName} binding`, callSites: [], plans: [] };
  }
  if (container.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === localName && parameter !== subject)) {
    return { planned: false, failure: `the container already declares a parameter named ${localName}`, callSites: [], plans: [] };
  }
  const prior = existing.find(plan => plan.container === container);
  if (prior !== undefined) {
    if (prior.subjectName !== subjectName || prior.subjectTypeName !== subjectTypeName || prior.addedName !== localName) {
      return { planned: false, failure: 'one consumer binds protected results or subjects inconsistently', callSites: [], plans: [] };
    }
    return { planned: true, failure: '', callSites: [], plans: [{ ...prior, removedStatements: [...prior.removedStatements, statement] }] };
  }
  return { planned: true, failure: '', callSites: [], plans: [{ container, mode, addedName: localName, subjectName, subjectIndex, subjectTypeName, subjectAnnotationNodes: [annotation], rewrittenParameterNodes: [subject], removedStatements: [statement] }] };
}

function rewriteContainerSignature(node: ts.FunctionDeclaration, plan: ContainerPlan, typeName: string): ts.FunctionDeclaration {
  const readOnlyArray = ts.factory.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword, ts.factory.createArrayTypeNode(ts.factory.createTypeReferenceNode(typeName)));
  if (plan.mode === 'props') {
    const parameters = node.parameters.map(parameter => {
      if (parameter.type === undefined || !ts.isTypeLiteralNode(parameter.type) || parameter.type.members.length !== 1) return parameter;
      const member = parameter.type.members[0];
      if (member === undefined || !ts.isPropertySignature(member) || member.type === undefined || !ts.isTypeReferenceNode(member.type) || !ts.isIdentifier(member.type.typeName) || member.type.typeName.text !== plan.subjectTypeName) return parameter;
      const updatedMember = ts.factory.createPropertySignature(member.modifiers, ts.factory.createIdentifier(plan.addedName), undefined, readOnlyArray);
      return ts.factory.createParameterDeclaration(parameter.modifiers, parameter.dotDotDotToken, ts.factory.createObjectBindingPattern([ts.factory.createBindingElement(undefined, undefined, ts.factory.createIdentifier(plan.addedName))]), undefined, ts.factory.createTypeLiteralNode([updatedMember]), undefined);
    });
    return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, parameters, node.type, node.body);
  }
  const removable = node.parameters.find(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === plan.subjectName);
  if (removable === undefined) return node;
  const retained = node.parameters.filter(parameter => parameter !== removable);
  const added = ts.factory.createParameterDeclaration(undefined, undefined, ts.factory.createIdentifier(plan.addedName), undefined, readOnlyArray, undefined);
  return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, [...retained, added], node.type, node.body);
}

function parameterizeModule(source: ts.SourceFile, plans: readonly ContainerPlan[], protectedModulePath: string, known: ReadonlySet<string>, boundarySpecifier: string, typeName: string): string {
  let boundaryImportInjected = false;
  const isRemoved = (node: ts.Node): boolean => {
    for (const plan of plans) for (const statement of plan.removedStatements) if (node === statement || isNodeWithin(node, statement)) return true;
    return false;
  };
  const transformed = ts.transform(source, [context => (root: ts.SourceFile): ts.SourceFile => {
    const visit = (node: ts.Node): ts.VisitResult<ts.Node | undefined> => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && resolveSpecifier(source.fileName, node.moduleSpecifier.text, known) === protectedModulePath) {
        if (boundaryImportInjected) return undefined;
        boundaryImportInjected = true;
        return [ts.factory.createImportDeclaration(undefined, ts.factory.createImportClause(true, undefined, ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(typeName))])), ts.factory.createStringLiteral(boundarySpecifier))];
      }
      if (isRemoved(node)) return undefined;
      if (ts.isFunctionDeclaration(node)) {
        const plan = plans.find(candidate => candidate.container === node);
        if (plan !== undefined) {
          const updated = rewriteContainerSignature(node, plan, typeName);
          return ts.visitEachChild(updated, visit, context);
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    const visited = ts.visitNode(root, visit, ts.isSourceFile);
    if (visited === undefined || !ts.isSourceFile(visited)) return root;
    return visited;
  }]).transformed[0];
  if (transformed === undefined || !ts.isSourceFile(transformed)) return ts.createPrinter().printFile(ts.createSourceFile(source.fileName, source.getText(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  return ts.createPrinter().printFile(transformed);
}

function callerPlanFor(sources: ReadonlyMap<string, ts.SourceFile>, callerPath: string, coupled: readonly string[], modulePlans: ReadonlyMap<string, readonly ContainerPlan[]>): { readonly plan: CallerPlan; readonly failure: string } {
  const source = sources.get(callerPath)!;
  const known = new Set(sources.keys());
  const coupledNames = new Map<string, string>();
  for (const binding of importBindings(source, known)) {
    if (binding.resolved === null) continue;
    if (coupled.includes(binding.resolved)) for (const value of binding.values) coupledNames.set(value, binding.resolved);
  }
  const sites: CallerSitePlan[] = [];
  let failure = '';
  const visit = (node: ts.Node): void => {
    if (failure !== '') return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const calleeText = node.expression.text;
      const coupledPath = coupledNames.get(calleeText);
      if (coupledPath !== undefined) {
        const plans = modulePlans.get(coupledPath) ?? [];
        const parameterPlan = plans.find(plan => plan.mode === 'parameter' && plan.container.name !== undefined && plan.container.name.text === calleeText);
        const propsPlan = plans.find(plan => plan.mode === 'props' && plan.container.name !== undefined && plan.container.name.text === calleeText);
        if (propsPlan !== undefined) {
          failure = `caller ${label(callerPath)} invokes the option-parameterized component ${calleeText} directly as a function instead of through JSX`;
          return;
        }
        if (parameterPlan !== undefined) {
          if (node.arguments.length <= parameterPlan.subjectIndex) {
            failure = `caller ${label(callerPath)} passes an unsupported argument shape to ${calleeText}`;
            return;
          }
          sites.push({ boundName: calleeText, mode: 'parameter', attributeName: '', argumentIndex: parameterPlan.subjectIndex });
        }
      }
    }
      if (ts.isJsxAttribute(node) && node.parent.kind === ts.SyntaxKind.JsxAttributes && (node.parent.parent.kind === ts.SyntaxKind.JsxOpeningElement || node.parent.parent.kind === ts.SyntaxKind.JsxSelfClosingElement)) {
        const opening = node.parent.parent as ts.JsxOpeningElement;
        if (opening.tagName.kind === ts.SyntaxKind.Identifier) {
        const attributeName = jsxNameText(node.name);
        if (attributeName === null) return;
        const tagNameText = opening.tagName.text;
        const coupledPath = coupledNames.get(tagNameText);
        if (coupledPath !== undefined) {
          const plans = modulePlans.get(coupledPath) ?? [];
          const propsPlan = plans.find(plan => plan.mode === 'props' && plan.container.name !== undefined && plan.container.name.text === tagNameText && plan.subjectName === attributeName);
          if (propsPlan !== undefined) {
            if (node.initializer === undefined || !ts.isJsxExpression(node.initializer) || node.initializer.expression === undefined) {
              failure = `caller ${label(callerPath)} passes the ${propsPlan.subjectName} prop in an unsupported JSX shape`;
              return;
            }
            sites.push({ boundName: tagNameText, mode: 'props', attributeName, argumentIndex: 0 });
          }
        }
      }
    }
    node.forEachChild(visit);
  };
  source.statements.forEach(statement => visit(statement));
  return { plan: { path: callerPath, sites }, failure };
}

function callerTextFor(source: ts.SourceFile, plan: CallerPlan, adapterSpecifier: string, providerName: string): string {
  let adapterImportInjected = false;
  const transformed = ts.transform(source, [context => (root: ts.SourceFile): ts.SourceFile => {
    const visit = (node: ts.Node): ts.VisitResult<ts.Node | undefined> => {
      if (ts.isImportDeclaration(node) && !adapterImportInjected) {
        adapterImportInjected = true;
        const injection = ts.factory.createImportDeclaration(undefined, ts.factory.createImportClause(false, undefined, ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(providerName))])), ts.factory.createStringLiteral(adapterSpecifier));
        return [injection, node];
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const calleeText = node.expression.text;
        const site = plan.sites.find(candidate => candidate.mode === 'parameter' && candidate.boundName === calleeText);
        if (site !== undefined) {
          const argumentsList = [...node.arguments];
          const original = argumentsList[site.argumentIndex];
          if (original !== undefined) {
            argumentsList[site.argumentIndex] = ts.factory.createCallExpression(ts.factory.createIdentifier(providerName), undefined, [original]);
            return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, argumentsList);
          }
        }
      }
    if (ts.isJsxAttribute(node) && node.parent.kind === ts.SyntaxKind.JsxAttributes && (node.parent.parent.kind === ts.SyntaxKind.JsxOpeningElement || node.parent.parent.kind === ts.SyntaxKind.JsxSelfClosingElement)) {
      const opening = node.parent.parent as ts.JsxOpeningElement;
      if (opening.tagName.kind === ts.SyntaxKind.Identifier) {
          const tagNameText = opening.tagName.text;
          const attributeName = jsxNameText(node.name);
          const site = attributeName === null ? undefined : plan.sites.find(candidate => candidate.mode === 'props' && candidate.boundName === tagNameText && candidate.attributeName === attributeName);
          if (site !== undefined && node.initializer !== undefined && ts.isJsxExpression(node.initializer) && node.initializer.expression !== undefined) {
            return ts.factory.createJsxAttribute(ts.factory.createIdentifier('options'), ts.factory.createJsxExpression(undefined, ts.factory.createCallExpression(ts.factory.createIdentifier(providerName), undefined, [node.initializer.expression])));
          }
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    const visited = ts.visitNode(root, visit, ts.isSourceFile);
    if (visited === undefined || !ts.isSourceFile(visited)) return root;
    const finalRoot = !adapterImportInjected
      ? ts.factory.updateSourceFile(visited, [ts.factory.createImportDeclaration(undefined, ts.factory.createImportClause(false, undefined, ts.factory.createNamedImports([ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(providerName))])), ts.factory.createStringLiteral(adapterSpecifier)), ...visited.statements])
      : visited;
    return finalRoot;
  }]).transformed[0];
  if (transformed === undefined || !ts.isSourceFile(transformed)) return ts.createPrinter().printFile(ts.createSourceFile(source.fileName, source.getText(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  return ts.createPrinter().printFile(transformed);
}

function adapterText(specifierToProtected: string, specifierToBoundary: string, protectedFunctionName: string, subjectTypeName: string, boundaryTypeName: string): string {
  return [
    `import { ${protectedFunctionName} } from '${specifierToProtected}';`,
    `import type { ${subjectTypeName} } from '${specifierToProtected}';`,
    `import type { ${boundaryTypeName} } from '${specifierToBoundary}';`,
    '',
    `export function provide${boundaryTypeName}(subject: ${subjectTypeName}): ${boundaryTypeName}[] {`,
    `  return ${protectedFunctionName}(subject);`,
    '}',
    ''
  ].join('\n');
}

async function openTempSnapshot(files: ReadonlyMap<string, string>): Promise<{ readonly serverPath: (path: string) => string; readonly dispose: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'private-extraction-'));
  const resolvedRoot = resolve(root);
  if (resolvedRoot.startsWith(REPO_ROOT) || REPO_ROOT.startsWith(resolvedRoot)) {
    await rm(root, { recursive: true, force: true });
    throw new Error('private_extraction_bounds');
  }
  for (const [path, content] of files) {
    await mkdir(join(root, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...path.split('/')), content);
  }
  return {
    serverPath: (path: string) => join(root, ...path.split('/')).split('\\').join('/'),
    dispose: () => rm(root, { recursive: true, force: true })
  };
}

async function typeCheckTemp(files: ReadonlyMap<string, string>, internalRelativePaths: ReadonlySet<string>): Promise<readonly string[]> {
  const snapshot = await openTempSnapshot(files);
  try {
    const options = compilerOptions();
    const host = ts.createCompilerHost(options, true);
    const rootNames = [...files.keys()].filter(path => path !== SHIMS_PATH && isScriptPath(path)).map(path => snapshot.serverPath(path));
    rootNames.push(snapshot.serverPath(SHIMS_PATH));
    const program = ts.createProgram(rootNames, options, host);
    const internal = new Set<string>();
    for (const relative of internalRelativePaths) internal.add(snapshot.serverPath(relative));
    const labels: string[] = [];
    for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
      if (diagnostic.file === undefined) continue;
      const path = diagnostic.file.fileName.split('\\').join('/');
      if (internal.size > 0 && !internal.has(path)) continue;
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ').replace(/\s+/g, ' ').slice(0, 160);
      labels.push(`TS${diagnostic.code}@${internalRelativePaths.size > 0 ? [...internalRelativePaths].map(candidate => snapshot.serverPath(candidate) === path ? candidate : null).find(candidate => candidate !== null) ?? path : path}: ${message}`);
      if (labels.length >= 12) break;
    }
    return Object.freeze(labels);
  } finally { await snapshot.dispose(); }
}

async function extractShapeWithChecker(files: ReadonlyMap<string, string>, protectedModulePath: string, protectedFunctionName: string): Promise<ExtractionShapeProperty[] | string> {
  const snapshot = await openTempSnapshot(files);
  try {
    const options = compilerOptions();
    const host = ts.createCompilerHost(options, true);
    const rootNames = [...files.keys()].filter(path => path !== SHIMS_PATH).map(path => snapshot.serverPath(path));
    const program = ts.createProgram(rootNames, options, host);
    const source = program.getSourceFile(snapshot.serverPath(protectedModulePath));
    if (source === undefined) return 'unable to load the protected module for bounded signature checking';
    let target: ts.SignatureDeclaration | undefined;
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === protectedFunctionName && statement.body !== undefined) target = statement;
      else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === protectedFunctionName && declaration.initializer !== undefined && ts.isArrowFunction(declaration.initializer)) target = declaration.initializer;
        }
      }
    }
    if (target === undefined) return `protected export ${protectedFunctionName} is not a declared function in the captured module`;
    const checker = program.getTypeChecker();
    const signature = checker.getSignatureFromDeclaration(target);
    if (signature === undefined) return `the protected export ${protectedFunctionName} has an uncheckable signature`;
    const returnType = checker.getReturnTypeOfSignature(signature);
    if (!checker.isArrayType(returnType) && !checker.isTupleType(returnType)) return `the protected export ${protectedFunctionName} does not disclose an array-shaped consumer surface`;
    let elementType: ts.Type | undefined;
    if (checker.isTupleType(returnType)) {
      const elements = checker.getTypeArguments(returnType as unknown as ts.TypeReference);
      const first = elements[0];
      if (first === undefined || !elements.slice(1).every(element => checker.typeToString(element) === checker.typeToString(first))) return `the protected export ${protectedFunctionName} discloses a heterogeneous tuple rather than one option type`;
      elementType = first;
    } else {
      elementType = checker.getTypeArguments(returnType as unknown as ts.TypeReference)[0];
    }
    if (elementType === undefined) return `the protected export ${protectedFunctionName} cannot disclose a checkable element type`;
    const properties: ExtractionShapeProperty[] = [];
    for (const property of checker.getPropertiesOfType(elementType)) {
      const propertyType = checker.getTypeOfSymbol(property);
      const members = propertyType.isUnion() ? propertyType.types : [propertyType];
      const kinds = new Set<ExtractionTypeKind>();
      let supported = true;
      for (const member of members) {
        if (member.flags & ts.TypeFlags.StringLike) kinds.add('string');
        else if (member.flags & ts.TypeFlags.NumberLike) kinds.add('number');
        else if (member.flags & ts.TypeFlags.BooleanLike) kinds.add('boolean');
        else { supported = false; break; }
      }
      if (!supported || kinds.size !== 1) return `the protected option field ${property.name} is not a bounded string/number/boolean disclosure`;
      const kind = [...kinds][0]!;
      properties.push({ name: property.name, type: kind });
    }
    return properties;
  } finally { await snapshot.dispose(); }
}

function advisoryUncaptured(sources: ReadonlyMap<string, ts.SourceFile>, known: ReadonlySet<string>, protectedModulePath: string, coupled: readonly string[], callers: readonly string[]): readonly string[] {
  const candidates: string[] = [];
  for (const [path, source] of sources) {
    if (!isScriptPath(path) || path === protectedModulePath || coupled.includes(path) || callers.includes(path)) continue;
    if (importBindings(source, known).some(binding => binding.resolved === protectedModulePath && (binding.values.length > 0 || binding.namespaces.length > 0))) candidates.push(path);
  }
  return candidates.sort();
}

interface ModelInput {
  readonly boundaryPath: string;
  readonly boundaryTypeName: string;
  readonly boundaryText: string;
  readonly parameterized: ReadonlyMap<string, string>;
  readonly callerTexts: ReadonlyMap<string, string>;
  readonly adapterPath: string;
  readonly adapterSource: string;
  readonly protectedModulePath: string;
  readonly protectedFunctionName: string;
  readonly subjectTypeName: string;
  readonly shapeProperties: readonly ExtractionShapeProperty[];
  readonly known: ReadonlySet<string>;
}

interface ModelOutcome {
  readonly failed: boolean;
  readonly reason: string;
  readonly assertions: readonly string[];
}

function verifyTransformationModel(input: ModelInput): ModelOutcome {
  const assertions: string[] = [];
  const boundary = parseSource(input.boundaryPath, input.boundaryText);
  let interfaceCount = 0;
  let capturedValues = 0;
  const boundaryFields: { readonly name: string; readonly kind: ExtractionTypeKind | 'unknown' }[] = [];
  const visitBoundary = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === input.boundaryTypeName) {
      interfaceCount += 1;
      for (const member of node.members) {
        if (!ts.isPropertySignature(member) || ts.isIdentifier(member.name) !== true || member.type === undefined) continue;
        const typeKind = member.type.kind;
        const kind: ExtractionTypeKind | 'unknown' = typeKind === ts.SyntaxKind.StringKeyword ? 'string' : typeKind === ts.SyntaxKind.NumberKeyword ? 'number' : typeKind === ts.SyntaxKind.BooleanKeyword ? 'boolean' : 'unknown';
        boundaryFields.push({ name: member.name.text, kind });
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) capturedValues += 1;
    node.forEachChild(visitBoundary);
  };
  boundary.statements.forEach(statement => visitBoundary(statement));
  if (interfaceCount !== 1) return { failed: true, reason: 'the public boundary must declare exactly one generic option interface', assertions: [] };
  if (capturedValues !== 0) return { failed: true, reason: 'the generated public boundary must contain no captured string payload values', assertions: [] };
  if (boundaryFields.length !== input.shapeProperties.length) return { failed: true, reason: 'the generated public boundary does not match the extracted option shape exactly', assertions: [] };
  for (let index = 0; index < boundaryFields.length; index++) {
    const field = boundaryFields[index]!;
    const expected = input.shapeProperties[index]!;
    if (field.name !== expected.name || field.kind !== expected.type) return { failed: true, reason: 'the generated public boundary does not match the extracted option shape exactly', assertions: [] };
  }
  assertions.push('the public boundary exposes exactly the extracted generic option fields and no captured payload values');

  for (const [path, text] of input.parameterized) {
    const module = parseSource(path, text);
    let protectedImports = 0;
    let protectedCalls = 0;
    for (const binding of importBindings(module, input.known)) {
      if (binding.resolved === input.protectedModulePath) protectedImports += 1;
    }
    const visitModule = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === input.protectedFunctionName) protectedCalls += 1;
      node.forEachChild(visitModule);
    };
    module.statements.forEach(statement => visitModule(statement));
    if (protectedImports !== 0) return { failed: true, reason: `the parameterized module ${path} still imports the protected module`, assertions: [] };
    if (protectedCalls !== 0) return { failed: true, reason: `the parameterized module ${path} still calls the protected computation`, assertions: [] };
    let boundaryParameterFound = false;
    let boundaryImportFound = false;
    for (const binding of importBindings(module, input.known)) {
      if (binding.types.includes(input.boundaryTypeName)) boundaryImportFound = true;
    }
    const visitSignature = (node: ts.Node): void => {
      if (ts.isParameter(node) && node.type !== undefined && node.type.getText(module).includes(input.boundaryTypeName)) boundaryParameterFound = true;
      node.forEachChild(visitSignature);
    };
    module.statements.forEach(statement => visitSignature(statement));
    if (!boundaryImportFound || !boundaryParameterFound) return { failed: true, reason: `the parameterized module ${path} does not declare the new typed boundary parameter`, assertions: [] };
  }
  assertions.push('parameterized modules import only the new typed boundary and no longer reference the protected computation');

  const adapter = parseSource(input.adapterPath, input.adapterSource);
  let adapterProtectedValueImport = false;
  let adapterProtectedCall = false;
  const visitAdapter = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause !== undefined && node.importClause.isTypeOnly !== true && resolveSpecifier(input.adapterPath, node.moduleSpecifier.text, input.known) === input.protectedModulePath) adapterProtectedValueImport = true;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === input.protectedFunctionName) adapterProtectedCall = true;
    node.forEachChild(visitAdapter);
  };
  adapter.statements.forEach(statement => visitAdapter(statement));
  if (!adapterProtectedValueImport || !adapterProtectedCall) return { failed: true, reason: 'the retained adapter must keep invoking the protected computation privately', assertions: [] };
  assertions.push(`the retained adapter keeps ${input.protectedFunctionName} private and maps it into the typed ${input.boundaryTypeName} boundary`);

  for (const [path, text] of input.callerTexts) {
    const caller = parseSource(path, text);
    let providerInvocations = 0;
    let protectedImports = 0;
    for (const binding of importBindings(caller, input.known)) if (binding.resolved === input.protectedModulePath) protectedImports += 1;
    const visitCaller = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === `provide${input.boundaryTypeName}`) providerInvocations += 1;
      if (ts.isJsxAttribute(node) && node.initializer !== undefined && ts.isJsxExpression(node.initializer) && node.initializer.expression !== undefined && ts.isCallExpression(node.initializer.expression) && ts.isIdentifier(node.initializer.expression.expression) && node.initializer.expression.expression.text === `provide${input.boundaryTypeName}`) providerInvocations += 1;
      node.forEachChild(visitCaller);
    };
    caller.statements.forEach(statement => visitCaller(statement));
    if (protectedImports !== 0) return { failed: true, reason: `the private caller ${path} still imports the protected module`, assertions: [] };
    if (providerInvocations === 0) return { failed: true, reason: `the private caller ${path} was not rewritten to supply the retained adapter value`, assertions: [] };
  }
  assertions.push('declared private callers supply the protected computation through the retained adapter only');
  void input.subjectTypeName;
  return { failed: false, reason: '', assertions };
}

export async function proposeBoundaryExtraction(request: ExtractionRequest): Promise<ExtractionResult> {
  if (request.kind !== 'private-boundary-extraction') return notSupported('unsupported extraction request kind', ['a private-boundary-extraction request']);
  if (typeof request.retainedAdapterPath !== 'string' || !isPortablePath(request.retainedAdapterPath)) return notSupported('the retained adapter path is not a safe portable relative path', ['a safe portable retained adapter path']);
  if (!hasPrivateSegment(request.retainedAdapterPath)) return notSupported('the retained adapter must stay inside a private-managed path segment so protected work remains private', ['a private-managed retained adapter path']);
  if (request.coupledModulePaths.length < 1 || request.coupledModulePaths.length > MAX_COUPLED_MODULES) return notSupported(`the extractor supports 1 to ${MAX_COUPLED_MODULES} coupled modules per proposal`, ['a bounded coupled module declaration']);
  if (request.privateCallerPaths.length > MAX_PRIVATE_CALLERS) return notSupported(`the extractor supports up to ${MAX_PRIVATE_CALLERS} private caller files per proposal`, ['a bounded private caller declaration']);
  if (request.boundaryName !== undefined && !/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(request.boundaryName)) return notSupported('the declared boundary name is invalid', ['a valid reviewed boundary type name']);

  const fileMap = new Map<string, string>();
  let totalBytes = 0;
  for (const file of request.files) {
    if (!isPortablePath(file.path)) return notSupported(`captured path ${label(file.path)} is not a safe portable relative path`, ['a validated captured manifest']);
    if (fileMap.has(file.path)) return notSupported(`captured path ${label(file.path)} is duplicated`, ['a deduplicated captured manifest']);
    const bytes = Buffer.byteLength(file.content, 'utf8');
    totalBytes += bytes;
    if (fileMap.size >= MAX_EXTRACTION_FILES || bytes > MAX_EXTRACTION_FILE_BYTES || totalBytes > MAX_EXTRACTION_TOTAL_BYTES) return notSupported('the captured snapshot exceeds the extraction byte bounds', ['a bounded captured snapshot']);
    if (createHash('sha256').update(file.content, 'utf8').digest('hex') !== file.sha256) return notSupported(`captured bytes for ${label(file.path)} drift from the pinned digest`, ['a hash-verified captured snapshot']);
    if (file.content.includes('\0')) return notSupported(`captured bytes for ${label(file.path)} contain NUL characters`, ['a text-only captured snapshot']);
    fileMap.set(file.path, file.content);
  }

  const protectedModulePath = request.protectedModulePath;
  const coupled = [...new Set(request.coupledModulePaths)];
  const callers = [...new Set(request.privateCallerPaths)];
  const declaredPaths = [protectedModulePath, ...coupled, ...callers];
  for (const path of declaredPaths) {
    if (!isPortablePath(path)) return notSupported(`declared path ${label(path)} is unsafe for the captured snapshot`, ['safe portable declared paths']);
    if (!fileMap.has(path)) return notSupported(`declared path ${label(path)} is missing from the captured snapshot`, ['captured pinned declared paths']);
    if (!isScriptPath(path)) return notSupported(`declared path ${label(path)} is not captured TypeScript source`, ['captured TypeScript declared paths']);
    if (path === request.retainedAdapterPath) return notSupported('the retained adapter must be a new private module, not a captured path', ['a newly proposed retained adapter']);
  }
  if (coupled.length !== request.coupledModulePaths.length) return notSupported('the coupled module list contains duplicates', ['distinct coupled modules']);
  if (callers.length !== request.privateCallerPaths.length) return notSupported('the private caller list contains duplicates', ['distinct private caller files']);
  if (coupled.includes(protectedModulePath)) return notSupported('the protected module cannot also be a coupled module', ['distinct transformation inputs']);
  if (callers.some(path => coupled.includes(path))) return notSupported('a private caller cannot also be a coupled module', ['distinct transformation inputs']);
  if (request.retainedAdapterPath === SHIMS_PATH) return notSupported('the retained adapter path collides with reserved checking infrastructure', ['a collision-free retained adapter path']);

  const lowered = new Set<string>();
  for (const path of [...fileMap.keys(), request.retainedAdapterPath]) {
    const key = path.toLowerCase();
    if (lowered.has(key) || [...lowered].some(taken => taken.startsWith(`${key}/`) || key.startsWith(`${taken}/`))) {
      return notSupported('case-folded captured paths or the retained adapter collide with an existing path prefix', ['collision-free declared paths']);
    }
    lowered.add(key);
  }

  const sources = new Map<string, ts.SourceFile>();
  for (const [path, content] of fileMap) sources.set(path, parseSource(path, content));
  const known = new Set(fileMap.keys());

  interface CoupledEntry {
    readonly values: ReadonlySet<string>;
    readonly types: ReadonlySet<string>;
  }
  const coupledBindings = new Map<string, CoupledEntry>();
  for (const path of coupled) {
    const bindings = importBindings(sources.get(path)!, known).filter(binding => binding.resolved === protectedModulePath);
    coupledBindings.set(path, { values: new Set(bindings.flatMap(binding => binding.values)), types: new Set(bindings.flatMap(binding => binding.types)) });
  }
  const calledFunctions = new Set<string>();
  for (const entry of coupledBindings.values()) for (const value of entry.values) calledFunctions.add(value);
  if (calledFunctions.size === 0) {
    for (const [path, entry] of coupledBindings) {
      if (entry.types.size > 0) return notSupported(`coupled module ${label(path)} only type-imports from the protected module and consumes no protected computation to parameterize`, ['coupled modules consuming protected computation']);
    }
    return notSupported('no protected computation is imported by the coupled modules', ['coupled value imports of a protected computation']);
  }
  if (calledFunctions.size > 1) return notSupported(`the coupled modules call ${calledFunctions.size} different protected functions; the bounded model supports one protected computation per proposal`, ['one protected computation per proposal']);

  const interpreterCalls = new Map<string, readonly CallSite[]>();
  for (const path of coupled) {
    const source = sources.get(path)!;
    const entry = coupledBindings.get(path)!;
    const calls: CallSite[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && entry.values.has(node.expression.text)) calls.push({ call: node, functionName: node.expression.text });
      node.forEachChild(visit);
    };
    source.statements.forEach(statement => visit(statement));
    if (calls.length > MAX_CALL_SITES_PER_FILE) return notSupported(`coupled module ${label(path)} exceeds ${MAX_CALL_SITES_PER_FILE} protected call sites`, ['bounded protected call sites']);
    interpreterCalls.set(path, calls);
  }

  const modulePlans = new Map<string, readonly ContainerPlan[]>();
  for (const path of coupled) {
    let plans: readonly ContainerPlan[] = [];
    for (const site of interpreterCalls.get(path) ?? []) {
      const outcome = planContainerForCall(sources.get(path)!, site.call, site.functionName, plans);
      if (!outcome.planned) return notSupported(`coupled module ${label(path)}: ${outcome.failure}`, ['a supported consumer shape of the protected computation']);
      plans = outcome.plans;
    }
    if (plans.length === 0) return notSupported(`coupled module ${label(path)} has no supported consumer container for its protected calls`, ['a supported consumer shape of the protected computation']);
    modulePlans.set(path, plans);
  }

  for (const path of coupled) {
    const source = sources.get(path)!;
    const plans = modulePlans.get(path) ?? [];
    const entry = coupledBindings.get(path)!;
    const excluded: ts.Node[] = [...plans.flatMap(plan => plan.removedStatements), ...plans.flatMap(plan => plan.subjectAnnotationNodes), ...plans.flatMap(plan => plan.rewrittenParameterNodes)];
    for (const typeNameImported of entry.types) {
      if (countValueNamesInExcluding(source, typeNameImported, excluded) > 0) {
        return notSupported(`coupled module ${label(path)} still references protected type ${typeNameImported} outside the parameterized subject annotations`, ['removable protected type references']);
      }
    }
    for (const valueName of entry.values) {
      if (countValueNamesInExcluding(source, valueName, excluded) > 0) {
        return notSupported(`coupled module ${label(path)} still references protected computation ${valueName} outside the removable const bindings`, ['removable protected call bindings']);
      }
    }
  }

  const baselineFiles = new Map<string, string>(fileMap);
  baselineFiles.set(SHIMS_PATH, shimText(bareSpecifiersOf([...sources.values()])));
  let baselineLabels: readonly string[] = [];
  try {
    baselineLabels = await typeCheckTemp(baselineFiles, new Set([...fileMap.keys()].filter(isScriptPath).map(path => path.split('\\').join('/'))));
  } catch (error) {
    return notSupported(`the temporary pinned snapshot could not be prepared safely: ${error instanceof Error && error.message.length <= 120 ? error.message : 'sandbox failure'}`, ['an isolated safe checking host']);
  }
  if (baselineLabels.length > 0) {
    return notSupported(`the pinned baseline does not type-check cleanly under the bounded checker (${baselineLabels.join(', ')}); the extractor refuses to propose over a broken base`, ['a clean pinned baseline']);
  }

  const protectedFunctionName = [...calledFunctions][0]!;
  const shapeProperties = await extractShapeWithChecker(baselineFiles, protectedModulePath, protectedFunctionName);
  if (typeof shapeProperties === 'string') {
    return notSupported(shapeProperties, ['a bounded primitive-typed protected disclosure']);
  }
  const distinctSubjectTypes = new Set<string>();
  for (const plans of modulePlans.values()) for (const plan of plans) distinctSubjectTypes.add(plan.subjectTypeName);
  if (distinctSubjectTypes.size !== 1) return notSupported(`the consumer containers use ${distinctSubjectTypes.size} different protected subject types; the bounded model supports one`, ['one protected subject type per proposal']);
  const subjectTypeName = [...distinctSubjectTypes][0]!;
  const protectedTypeDeclarations = new Set<string>();
  const protectedSource = sources.get(protectedModulePath)!;
  const collectDeclarations = (node: ts.Node): void => {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) && node.name !== undefined) protectedTypeDeclarations.add(node.name.text);
    node.forEachChild(collectDeclarations);
  };
  protectedSource.statements.forEach(statement => collectDeclarations(statement));
  if (!protectedTypeDeclarations.has(subjectTypeName)) return notSupported(`the protected subject type ${subjectTypeName} is not declared inside the protected module`, ['a subject type declared in the protected module']);

  const boundaryTypeName = request.boundaryName ?? deriveBoundaryTypeName(protectedFunctionName);
  const boundaryDir = coupled[0]!.split('/').slice(0, -1).join('/');
  const boundaryPath = `${boundaryDir === '' ? '' : `${boundaryDir}/`}${kebabOf(boundaryTypeName)}.ts`;
  if (!isPortablePath(boundaryPath)) return notSupported('the derived public boundary path is not a safe portable path', ['a safe public boundary path']);
  const boundaryKey = boundaryPath.toLowerCase();
  if (lowered.has(boundaryKey) || [...lowered].some(taken => taken.startsWith(`${boundaryKey}/`) || boundaryKey.startsWith(`${taken}/`))) {
    return notSupported('the derived public boundary path collides with a captured or retained path', ['a collision-free boundary path']);
  }

  const parameterized = new Map<string, string>();
  for (const path of coupled) {
    parameterized.set(path, parameterizeModule(sources.get(path)!, modulePlans.get(path)!, protectedModulePath, known, relSpecifier(path.split('/').slice(0, -1).join('/'), boundaryPath), boundaryTypeName));
  }

  const callerPlans: CallerPlan[] = [];
  for (const callerPath of callers) {
    const outcome = callerPlanFor(sources, callerPath, coupled, modulePlans);
    if (outcome.failure !== '') return notSupported(outcome.failure, ['supported private caller call sites']);
    callerPlans.push(outcome.plan);
  }

  const callerTexts = new Map<string, string>();
  for (const plan of callerPlans) {
    callerTexts.set(plan.path, callerTextFor(sources.get(plan.path)!, plan, relSpecifier(plan.path.split('/').slice(0, -1).join('/'), request.retainedAdapterPath), `provide${boundaryTypeName}`));
  }

  const boundaryText = [`export interface ${boundaryTypeName} {`, ...shapeProperties.map(property => `  ${property.name}: ${property.type};`), '}', ''].join('\n');
  const adapterSource = adapterText(
    relSpecifier(request.retainedAdapterPath.split('/').slice(0, -1).join('/'), protectedModulePath),
    relSpecifier(request.retainedAdapterPath.split('/').slice(0, -1).join('/'), boundaryPath),
    protectedFunctionName,
    subjectTypeName,
    boundaryTypeName
  );

  const generatedTotal = [...parameterized.values(), ...callerTexts.values(), boundaryText, adapterSource].reduce((sum, text) => sum + Buffer.byteLength(text, 'utf8'), 0);
  if (generatedTotal > MAX_GENERATED_TOTAL_BYTES) return notSupported('the generated proposal exceeds the bounded output size', ['a bounded generated proposal']);

  const proposedFiles = new Map<string, string>();
  for (const [path, content] of fileMap) proposedFiles.set(path, parameterized.get(path) ?? callerTexts.get(path) ?? content);
  proposedFiles.set(boundaryPath, boundaryText);
  proposedFiles.set(request.retainedAdapterPath, adapterSource);
  proposedFiles.set(SHIMS_PATH, shimText(bareSpecifiersOf([...sources.values()])));
  let transformedLabels: readonly string[] = [];
  try {
    const internalScriptPaths = [...fileMap.keys()].filter(isScriptPath).concat(coupled, callers, [boundaryPath, request.retainedAdapterPath]).map(path => path.split('\\').join('/'));
    transformedLabels = await typeCheckTemp(proposedFiles, new Set(internalScriptPaths));
  } catch (error) {
    return notSupported(`the proposed snapshot could not be checked safely: ${error instanceof Error && error.message.length <= 120 ? error.message : 'sandbox failure'}`, ['an isolated safe checking host']);
  }
  if (transformedLabels.length > 0) {
    return notSupported(`the proposed boundary charts do not type-check (${transformedLabels.join(', ')}); the extractor refuses instead of blessing a failing proposal`, ['a type-clean proposed boundary']);
  }

  const model = verifyTransformationModel({
    boundaryPath,
    boundaryTypeName,
    boundaryText,
    parameterized,
    callerTexts,
    adapterPath: request.retainedAdapterPath,
    adapterSource,
    protectedModulePath,
    protectedFunctionName,
    subjectTypeName,
    shapeProperties,
    known
  });
  if (model.failed) return notSupported(`the transformation model check failed: ${model.reason}`, ['a semantics-preserving bounded transformation model']);

  const retainedWork = [
    `Protected computation ${protectedFunctionName} and subject type ${subjectTypeName} remain in ${protectedModulePath}, retained behind ${request.retainedAdapterPath}.`,
    'Contributors receive only the generated generic option boundary; protected eligibility and scoring logic are not exported.',
    ...DEFAULT_RETAINED_WORK
  ];
  const payload = {
    status: 'proposed' as const,
    assurance: EXTRACTION_ASSURANCE,
    protectedModulePath,
    protectedExports: [protectedFunctionName],
    protectedSubjectType: subjectTypeName,
    extractedShape: { kind: 'array-of-object' as const, elementProperties: shapeProperties },
    boundary: { path: boundaryPath, typeName: boundaryTypeName, generatedSource: boundaryText, sha256: createHash('sha256').update(boundaryText, 'utf8').digest('hex') },
    parameterizedModules: coupled.map(path => ({ path, originalSha256: fileMap.get(path) ?? '', generatedSource: parameterized.get(path) ?? '', sha256: createHash('sha256').update(parameterized.get(path) ?? '', 'utf8').digest('hex'), edits: describeParameterizedEdits(modulePlans.get(path) ?? []) })),
    retainedAdapter: { path: request.retainedAdapterPath, generatedSource: adapterSource, sha256: createHash('sha256').update(adapterSource, 'utf8').digest('hex'), protectedCalls: [protectedFunctionName], boundaryTypeName },
    privateCallerReplacements: callerPlans.map(plan => ({ path: plan.path, originalSha256: fileMap.get(plan.path) ?? '', generatedSource: callerTexts.get(plan.path) ?? '', sha256: createHash('sha256').update(callerTexts.get(plan.path) ?? '', 'utf8').digest('hex'), edits: describeCallerEdits(plan.sites) })),
    advisoryUncapturedCandidates: advisoryUncaptured(sources, known, protectedModulePath, coupled, callers),
    checks: { baselineTypes: 'passed' as const, transformedTypes: 'passed' as const, transformationModel: 'passed' as const, modelAssertions: model.assertions },
    limits: BOUNDED_EXTRACTION_LIMITS,
    retainedPrivateWork: retainedWork,
    assumptions: [
      'Structural type identity is checked at M3.2 by bounded static programs; runtime preservation and integration of the proposed private diff execute only in the validated isolated runner (M4.3).',
      'Ambient checker shims declare externals data-only; external behaviour is neither interpreted nor executed.'
    ]
  };
  return { ...payload, approval: { required: true, status: 'pending_owner_approval', proposalHash: contentHash(payload) } };
}

function label(path: string): string {
  return path.slice(0, 48);
}

function describeParameterizedEdits(plans: readonly ContainerPlan[]): readonly string[] {
  return ['removed protected-module imports', ...plans.map(plan => plan.mode === 'props' ? `rewrote ${plan.container.name?.text ?? 'props'}: protected field ${plan.subjectName} became the typed options of the boundary` : `parameterized ${plan.container.name?.text ?? 'function'}: removed protected subject parameter ${plan.subjectName} and added typed options ${plan.addedName}`)];
}

function describeCallerEdits(sites: readonly CallerSitePlan[]): readonly string[] {
  return sites.map(site => site.mode === 'props' ? `rewrote ${site.boundName}: prop ${site.attributeName} now receives the retained adapter value` : `rewrote ${site.boundName}: argument ${site.argumentIndex} now receives the retained adapter value`);
}

export async function detectExtractionCandidates(request: SurfaceRequest): Promise<readonly { readonly path: string; readonly protectedImports: readonly string[] }[]> {
  const surface = await buildBoundarySurface(request);
  const candidates = surface.evidence.filter(evidence => evidence.boundary.private.length > 0).map(evidence => ({ path: evidence.path, protectedImports: [...evidence.boundary.private] }));
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}
