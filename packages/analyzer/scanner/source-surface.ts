import ts from 'typescript';

/** Source-surface construction: one cached AST per captured snapshot file, plus
 * small syntactic helpers. Stores only paths and syntactic kinds; never executes
 * or emits captured text. */

export interface AnalysisSourceFile {
  readonly path: string;
  readonly content: string;
}

export interface ParsedModule {
  readonly path: string;
  readonly source: ts.SourceFile;
}

export function parseModules(files: readonly AnalysisSourceFile[]): ParsedModule[] {
  return files.map(file => {
    const scriptKind = file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return { path: file.path, source: ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, scriptKind) };
  });
}

export interface Position { readonly line: number; readonly column: number }

export function positionOf(source: ts.SourceFile, node: ts.Node): Position {
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { line: line + 1, column: character + 1 };
}

/** True when the identifier is a name/label position rather than a value read. */
export function isIdentifierName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (parent === undefined) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isQualifiedName(parent) && parent.right === node) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true;
  if (ts.isGetAccessorDeclaration(parent) && parent.name === node) return true;
  if (ts.isSetAccessorDeclaration(parent) && parent.name === node) return true;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return true;
  if (ts.isClassDeclaration(parent) && parent.name === node) return true;
  if (ts.isInterfaceDeclaration(parent) && parent.name === node) return true;
  if (ts.isTypeAliasDeclaration(parent) && parent.name === node) return true;
  if (ts.isEnumDeclaration(parent) && parent.name === node) return true;
  if (ts.isEnumMember(parent) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) return true;
  if (ts.isNamespaceImport(parent) && parent.name === node) return true;
  if (ts.isExportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) return true;
  if (ts.isNamespaceExport(parent) && parent.name === node) return true;
  if (ts.isJsxAttribute(parent) && parent.name === node) return true;
  if (ts.isLabeledStatement(parent) && parent.label === node) return true;
  if (ts.isBreakOrContinueStatement(parent) && (parent.label === node)) return true;
  return false;
}

export function patternNames(name: ts.BindingName): { plain: string[]; renamed: string[] } {
  const plain: string[] = [];
  const renamed: string[] = [];
  if (ts.isIdentifier(name)) {
    plain.push(name.text);
    return { plain, renamed };
  }
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue;
    if (element.propertyName === undefined) {
      if (ts.isIdentifier(element.name)) plain.push(element.name.text);
      else renamed.push(...patternNames(element.name).plain);
    } else if (ts.isIdentifier(element.propertyName)) {
      if (ts.isIdentifier(element.name)) renamed.push(element.name.text);
      else renamed.push(...patternNames(element.name).plain);
    } else renamed.push(...patternNames(element.name).plain);
  }
  return { plain, renamed };
}

export function calleeChain(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return `${calleeChain(expression.expression)}.${expression.name.text}`;
  if (ts.isElementAccessExpression(expression)) return `${calleeChain(expression.expression)}[<expr>]`;
  return `<${ts.SyntaxKind[expression.kind]}>`;
}

export function propertyChain(expression: ts.Expression): string {
  const parts: string[] = [];
  let current: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  parts.unshift(ts.isIdentifier(current) ? current.text : `<${ts.SyntaxKind[current.kind]}>`);
  return parts.join('.');
}
