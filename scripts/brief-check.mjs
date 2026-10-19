// Read-only pre-dispatch check for one wave brief (K36 P3/P4):
//
//   node scripts/brief-check.mjs <brief path> [--root <dir>]
//
// It validates references, not intent: the head chef still reads the brief and
// judges whether the prose honours the decisions it cites. Nothing here writes
// a file or runs a recorded command — the parser reads Markdown text only.
//
// What it checks, narrowly and by name:
//   * the brief exists and has a "## Done when" section (absence is a named
//     failure, never a silent pass);
//   * every `test:<name>` token inside that section (inline code or plain
//     text — fenced blocks are ignored entirely, so historical transcripts
//     and examples are not mistaken for acceptance) resolves to a real
//     package.json script of this root, not a toolchain version or a retired
//     name like BT36's `test:box-package`;
//   * every `waves/<id>.md` reference in the brief points at a file that
//     exists under the root;
//   * the brief's `Owner decisions:` field is present and is `none` or a list
//     of IDs that all exist, exactly once each, in docs/box-v4/DECISIONS.md —
//     unknown IDs, duplicate ledger IDs and a missing or malformed ledger are
//     each named.
//
// Deliberately not checked: whether a decision was really made, whether the
// brief agrees with it, suite semantics, and anything in code fences. Only the
// brief path given on the command line is checked — templates and old briefs
// are never scanned unless asked for.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root as repoRoot } from './process.mjs';

const LEDGER = join('docs', 'box-v4', 'DECISIONS.md');
const ID_PATTERN = /^D-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

// Fenced code blocks removed so recorded commands and transcripts never parse
// as live references. Everything else — including inline `code` — stays.
export function withoutFences(text) {
  let inFence = false;
  const kept = [];
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence) kept.push(line);
  }
  return kept.join('\n');
}

// The "## Done when" section, from its heading to the next same-or-higher
// heading. null when absent — callers name that, it is never a pass.
function doneWhenSection(text) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => /^#{2,3}\s+done when\b/i.test(line.trim()));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^#{1,3}\s/.test(line));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join('\n');
}

// Ledger rows are a Markdown table: | ID | date | kind | scope | source |.
// Returns { ids, problems } — ids maps ID -> count so duplicates are named.
function readLedger(rootDir) {
  const ids = new Map();
  const problems = [];
  const path = join(rootDir, LEDGER);
  if (!existsSync(path)) {
    problems.push(`${LEDGER}: missing — no decision IDs can resolve`);
    return { ids, problems };
  }
  const text = readFileSync(path, 'utf8');
  for (const [index, line] of text.split('\n').entries()) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length < 5) {
      if (/D-\d{4}/.test(line)) problems.push(`${LEDGER}:${index + 1}: malformed row — expected | ID | date | kind | scope | source |`);
      continue;
    }
    const [id, date, kind, scope, source] = cells;
    if (!ID_PATTERN.test(id)) continue; // header/separator rows and prose cells
    ids.set(id, (ids.get(id) ?? 0) + 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`${LEDGER}:${index + 1}: ${id} has no ISO date`);
    if (!['documented', 'quoted'].includes(kind)) problems.push(`${LEDGER}:${index + 1}: ${id} kind must be documented or quoted`);
    if (!scope) problems.push(`${LEDGER}:${index + 1}: ${id} has no scope`);
    if (!source) problems.push(`${LEDGER}:${index + 1}: ${id} has no source file or commit`);
  }
  if (!ids.size && !problems.length) problems.push(`${LEDGER}: no decision entries found`);
  return { ids, problems };
}

// One brief, one root. Returns a list of named diagnostics; empty means clean.
// Pure reads only — the shell in main() is argv parsing and exit codes.
export function checkBrief(briefPath, { rootDir = repoRoot } = {}) {
  const problems = [];
  const resolvedBrief = isAbsolute(briefPath) ? briefPath : resolve(rootDir, briefPath);
  let text;
  try { text = readFileSync(resolvedBrief, 'utf8'); } catch {
    return [`${briefPath}: cannot read the brief`];
  }
  const label = briefPath;

  let scripts = {};
  try { scripts = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).scripts ?? {}; }
  catch { problems.push('package.json: cannot read scripts to resolve acceptance suites'); }

  const ledger = readLedger(rootDir);
  problems.push(...ledger.problems);
  for (const [id, count] of ledger.ids) if (count > 1) problems.push(`${LEDGER}: duplicate decision ID ${id}`);

  const prose = withoutFences(text);
  const section = doneWhenSection(prose);
  if (section === null) problems.push(`${label}: no "## Done when" section — there is no acceptance to check`);
  else {
    // Only lines that spell a command have their `test:*` arguments resolved —
    // a suite name mentioned as prose ("the old test:box-package mistake") is
    // not a command and is never checked. Supported spellings are the ones the
    // kitchen actually uses: verify.mjs, suite.mjs and pnpm lines.
    const commandLines = section.split('\n').filter(line => /\bverify\.mjs\b|\bsuite\.mjs\b|\bpnpm\b/.test(line));
    for (const name of new Set(commandLines.flatMap(line => [...line.matchAll(/\btest:[a-z0-9-]+\b/g)].map(match => match[0])))) {
      if (!Object.hasOwn(scripts, name)) problems.push(`${label}: "${name}" in Done when is not a package.json script — fix the suite name or add the script first`);
    }
  }

  for (const ref of new Set([...prose.matchAll(/\bwaves\/[A-Za-z0-9._-]+\.md\b/g)].map(match => match[0]))) {
    if (!existsSync(join(rootDir, ref))) problems.push(`${label}: linked wave file ${ref} does not exist`);
  }

  const decisionsLine = prose.split('\n').find(line => /^\s*-?\s*owner decisions\s*:/i.test(line));
  if (decisionsLine === undefined) problems.push(`${label}: no "Owner decisions:" field — name the ledger IDs this brief relies on, or none`);
  else {
    const value = decisionsLine.replace(/^[^:]*:/, '').trim();
    if (value === '' || /[<>]/.test(value)) problems.push(`${label}: "Owner decisions:" is a placeholder — fill in ledger IDs or none before dispatch`);
    else if (!/^none$/i.test(value)) {
      for (const id of value.split(/[\s,]+/).filter(Boolean)) {
        if (!ID_PATTERN.test(id)) problems.push(`${label}: "${id}" is not a decision ID (D-YYYY-MM-DD-name)`);
        else if (!ledger.ids.has(id)) problems.push(`${label}: unknown decision ID ${id} — add it to ${LEDGER} or correct the reference`);
      }
    }
  }
  return problems;
}

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  const rootIndex = args.indexOf('--root');
  const rootDir = rootIndex >= 0 ? resolve(args[rootIndex + 1] ?? '') : repoRoot;
  const brief = args.find((arg, index) => !arg.startsWith('--') && !(rootIndex >= 0 && index === rootIndex + 1));
  if (!brief || (rootIndex >= 0 && !args[rootIndex + 1])) {
    console.error('usage: node scripts/brief-check.mjs <brief path> [--root <dir>]');
    process.exit(2);
  }
  const problems = checkBrief(brief, { rootDir });
  for (const problem of problems) console.error(`brief-check: ${problem}`);
  if (problems.length) process.exit(1);
  console.log(`brief-check: ${brief} OK (references only — intent is the head chef's read)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
