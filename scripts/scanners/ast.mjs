// K75: what every walkthrough scanner shares. A scanner reads source text with the TypeScript parser and reports each finding
// as { file, line, fn, detail }, naming the enclosing function (lines move; the function is the stable name). Scanners take
// their sources as data, so a test can plant a fault in a string and the walkthrough can scan the real tree.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export { ts };

/** Every .ts file under `dirs` (relative to root), as { file, text } with forward-slash paths, sorted. */
export function sourcesUnder(root, dirs) {
  const found = [];
  const walk = dir => {
    let entries;
    try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) { if (!['dist', 'dist-package', 'out', 'node_modules', '.next'].includes(entry.name)) walk(`${dir}/${entry.name}`); }
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push({ file: `${dir}/${entry.name}`, text: readFileSync(join(root, dir, entry.name), 'utf8') });
    }
  };
  dirs.forEach(walk);
  return found.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

export const parse = ({ file, text }) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** The function a node sits in: the nearest function, method or named arrow; null at top level. */
export function enclosingFunction(node) {
  for (let at = node.parent; at !== undefined; at = at.parent) {
    if ((ts.isFunctionDeclaration(at) || ts.isMethodDeclaration(at)) && at.name !== undefined) return at;
    if ((ts.isArrowFunction(at) || ts.isFunctionExpression(at)) && ts.isVariableDeclaration(at.parent)) return at;
  }
  return null;
}
export function functionName(fn, sf) {
  if (fn === null) return '(top level)';
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) return fn.parent.name.getText(sf);
  return fn.name.getText(sf);
}

export const lineOf = (node, sf) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
export const short = text => text.replace(/\s+/g, ' ').slice(0, 100);

export function visit(sf, fn) {
  const go = node => { fn(node); ts.forEachChild(node, go); };
  go(sf);
}

/** Findings in one fixed order, so the walkthrough's output is the same byte for byte on the same tree. */
export const sorted = findings => [...findings].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.detail.localeCompare(b.detail));
