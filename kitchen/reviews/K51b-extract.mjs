// K51b: lists every test in tests/**/*.test.ts from the TypeScript syntax tree and the refusal names each one asserts.
// Run: node kitchen/reviews/K51b-extract.mjs > extraction.json   (read-only; changes nothing)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();

// The 134 refusal names: every backticked reason name in CONTRACTS.md's "Refusals" paragraphs.
const contracts = readFileSync(join(root, 'docs/box-v4/CONTRACTS.md'), 'utf8').split('\n');
const names = new Set();
for (const [index, line] of contracts.entries()) {
  if (!line.startsWith('**Refusals.**') && !(index > 211 && /`[a-z][a-z-]*`/.test(line))) continue;
  for (const match of line.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`/g)) names.add(match[1]);
}

// ...and every reason name the code itself constructs (CONTRACTS was written for the stages of 19 October and misses the solver side).
const sourceText = [];
const gather = dir => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { if (!['node_modules', 'dist', 'dist-package'].includes(entry)) gather(path); } else if (path.endsWith('.ts')) sourceText.push(readFileSync(path, 'utf8'));
  }
};
gather(join(root, 'packages/box-bounty'));
gather(join(root, 'packages/box-cli/src'));
const code = sourceText.join('\n');
const fromContracts = new Set(names);
const fromCode = new Set();
for (const match of code.matchAll(/(?:BountyRefused|\binvalid)\(\s*['"`]([a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g)) fromCode.add(match[1]);
for (const name of fromCode) names.add(name);
names.delete('solution-too-large-to-show'); // a printed state, not a refusal (CONTRACTS says so)
const files = [];
const walk = dir => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { if (entry !== 'node_modules') walk(path); } else if (entry.endsWith('.test.ts')) files.push(path);
  }
};
walk(join(root, 'tests'));
files.sort();

const rootName = expression => {
  let node = expression;
  for (;;) {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) node = node.expression;
    else if (ts.isCallExpression(node)) node = node.expression;
    else return null;
  }
};
const titleOf = (call, source) => {
  const first = call.arguments[0];
  if (first === undefined) return '';
  if (ts.isStringLiteralLike(first)) return first.text;
  return first.getText(source).slice(0, 160);
};
const refusalsIn = text => {
  const found = new Set();
  for (const match of text.matchAll(/['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g)) if (names.has(match[1])) found.add(match[1]);
  return [...found].sort();
};

// Words that say a test is about a hard stop even when it asserts no refusal name (a behavioural test).
const WORDS = { neverShip: /never-ship|neverShip|boxignore|scanPatch|secret|credential/i, env: /[.]env["'`/ ]|[.]pem|id_rsa/i, private: /private/i, owner: /owner-allow|owner-answer|merge-held|standing|"ask"|'ask'|allowed/i };
const wordsIn = text => Object.entries(WORDS).filter(([, re]) => re.test(text)).map(([name]) => name);
const out = { refusalNames: [...names].sort(), inContractsOnly: [...fromContracts].filter(n => !fromCode.has(n) && names.has(n)).sort(), inCodeOnly: [...fromCode].filter(n => !fromContracts.has(n)).sort(), files: [] };
for (const path of files) {
  const text = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const tests = [];
  const visit = (node, trail) => {
    if (ts.isCallExpression(node)) {
      const kind = rootName(node.expression);
      const isTestCall = kind === 'it' || kind === 'test';
      const isGroup = kind === 'describe';
      if ((isTestCall || isGroup) && node.arguments.length >= 2 && node.arguments.some(arg => ts.isFunctionLike(arg))) {
        const title = titleOf(node, source);
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
        if (isGroup) { ts.forEachChild(node, child => visit(child, [...trail, title])); return; }
        const body = node.getText(source);
        tests.push({ title, group: trail.join(' > '), line, end, lines: end - line + 1, refusals: refusalsIn(body), words: wordsIn(body), titleWords: wordsIn(title), eachTable: /\.each\b/.test(node.expression.getText(source)), skipped: /\.(skip|skipIf|todo)\b/.test(node.expression.getText(source)) });
        return;
      }
    }
    ts.forEachChild(node, child => visit(child, trail));
  };
  visit(source, []);
  out.files.push({ file: relative(root, path).replaceAll('\\', '/'), lines: text.split('\n').length, tests, fileRefusals: refusalsIn(text) });
}
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
