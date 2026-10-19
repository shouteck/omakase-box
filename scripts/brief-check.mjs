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
//   * every `test:<name>` token and every `npm run`/`pnpm run` argument on
//     command lines inside that section (lines spelling verify.mjs, suite.mjs,
//     pnpm or npm run — fenced blocks are ignored entirely, and a bare suite
//     name in prose is not a command) resolves, case-sensitively, to a real
//     package.json script of this root — not a toolchain version, a retired
//     name like BT36's `test:box-package`, or a case variant like
//     `test:Kitchen`. A `vitest` line is named as unsupported rather than
//     silently accepted;
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
    // Only lines that spell a command have their suite arguments resolved — a
    // suite name mentioned as prose ("the old test:box-package mistake") is
    // not a command and is never checked. Supported spellings are the ones the
    // kitchen actually uses: verify.mjs, suite.mjs, `pnpm`, and `npm run` /
    // `pnpm run`. Names are compared exactly, preserving case: `test:Kitchen`
    // is not the `test:kitchen` script and fails by name. A `vitest` line is
    // named as an unsupported spelling rather than silently accepted.
    for (const [index, line] of section.split('\n').entries()) {
      const isCommand = /\bverify\.mjs\b|\bsuite\.mjs\b|\bpnpm\b|\bnpm\s+run\b/.test(line);
      if (/\bvitest\b/.test(line)) problems.push(`${label}: line ${index + 1} of Done when spells "vitest" — acceptance commands are verify.mjs/suite.mjs/pnpm/npm run spellings, not a direct runner`);
      if (!isCommand) continue;
      const names = [...line.matchAll(/\btest:[a-zA-Z0-9-]+\b/g)].map(match => match[0]);
      for (const match of line.matchAll(/\b(?:npm|pnpm)\s+run\s+([a-zA-Z0-9:_-]+)/g)) names.push(match[1]);
      for (const name of new Set(names)) {
        if (!Object.hasOwn(scripts, name)) problems.push(`${label}: "${name}" in Done when is not a package.json script — fix the suite name or add the script first`);
      }
    }
  }

  for (const ref of new Set([...prose.matchAll(/\bwaves\/[A-Za-z0-9._-]+\.md\b/g)].map(match => match[0]))) {
    if (!existsSync(join(rootDir, ref))) problems.push(`${label}: linked wave file ${ref} does not exist`);
  }

  // Every "Owner decisions:" line is read — checking only the first would let
  // a second field smuggle an unknown ID or a conflicting "none". The format
  // is one field; two or more are rejected by name rather than reconciled.
  const decisionsLines = prose.split('\n').filter(line => /^\s*-?\s*owner decisions\s*:/i.test(line));
  if (decisionsLines.length === 0) problems.push(`${label}: no "Owner decisions:" field — name the ledger IDs this brief relies on, or none`);
  else {
    if (decisionsLines.length > 1) problems.push(`${label}: ${decisionsLines.length} "Owner decisions:" fields — one field only; merge the IDs into it`);
    for (const line of decisionsLines) {
      const value = line.replace(/^[^:]*:/, '').trim();
      if (value === '' || /[<>]/.test(value)) { problems.push(`${label}: "Owner decisions:" is a placeholder — fill in ledger IDs or none before dispatch`); continue; }
      const tokens = value.split(/[\s,]+/).filter(Boolean);
      const ids = tokens.filter(token => ID_PATTERN.test(token));
      if (tokens.some(token => /^none$/i.test(token)) && ids.length) problems.push(`${label}: "Owner decisions:" mixes "none" with IDs — pick one or the other`);
      const seen = new Set();
      for (const token of tokens) {
        if (/^none$/i.test(token)) continue;
        if (!ID_PATTERN.test(token)) problems.push(`${label}: "${token}" is not a decision ID (D-YYYY-MM-DD-name)`);
        else {
          if (seen.has(token)) problems.push(`${label}: "Owner decisions:" repeats ${token}`);
          seen.add(token);
          if (!ledger.ids.has(token)) problems.push(`${label}: unknown decision ID ${token} — add it to ${LEDGER} or correct the reference`);
        }
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
