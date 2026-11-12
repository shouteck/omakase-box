#!/usr/bin/env node
// K64 (H2 of K51d): the proof map as a check. docs/box-v4/CONTRACTS.md gives every guarantee an id (C1, P1, PY1, ...) and marks the
// ones that are a hard stop ("hard stop 2"). A test says which guarantee it proves with comment lines directly above it:
//     // @guards P1 R3
//     it('a private repository is refused by name', ...)
// so "which test defends G", "which guarantee has no test" and "which tests defend the same thing" are answered by this script
// and not by reading. The ids sit in comments, not in titles: a rename would read as a removed test to the test-edit gate (K62).
//
// node scripts/proof-map.mjs [--root <dir>] [--json] [--check]
// --check exits 1 on: unknown-id (an annotation names an id CONTRACTS lacks), dangling (an annotation above no test),
// hard-stop-untested (a hard-stop guarantee with no test, even if listed as untagged), untagged-not-listed (no test and not in
// kitchen/reviews/proof-gaps.json), gap-now-tagged (listed there and now has a test: the list only shrinks), gap-unknown.
// Exit 2: CONTRACTS.md missing or holding no guarantees: a map that read nothing is not a pass.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const value = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const root = value('--root') ?? process.cwd();
const json = args.includes('--json');
const check = args.includes('--check');

function readGuarantees(text) {
  const found = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^- ([A-Z]+[0-9]+)\. (.*)$/.exec(line);
    if (match === null) continue;
    const stop = /hard stop (\d)/i.exec(match[2]);
    found.push({ id: match[1], hardStop: stop === null ? null : stop[1], text: match[2].slice(0, 160) });
  }
  return found;
}

function testFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...testFiles(path)); else if (entry.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

const TEST_LINE = /^\s*(?:it|test)(?:\.[A-Za-z]+(?:\([^)]*\))?)*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;
function annotationsIn(path, text) {
  const found = [];
  const dangling = [];
  let pending = [];
  let pendingLine = 0;
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const tag = /^\s*\/\/\s*@guards\s+(.+?)\s*$/.exec(line);
    if (tag !== null) {
      if (pending.length === 0) pendingLine = index + 1;
      pending.push(...tag[1].split(/[\s,]+/).filter(Boolean));
      continue;
    }
    if (pending.length === 0) continue;
    if (/^\s*\/\//.test(line)) continue; // ordinary comment lines may sit between the tag and the test
    // A table (`it.each([...])(title, ...)`) often opens with its rows on the next lines, so its title is not on this line.
    const test = TEST_LINE.exec(line) ?? (/^\s*(?:it|test)\.(?:each|for)\b/.test(line) ? [line, '', '(table)'] : null);
    if (test !== null) for (const id of pending) found.push({ id, file: path, line: index + 1, title: test[2] });
    else dangling.push({ file: path, line: pendingLine, ids: pending });
    pending = [];
  }
  if (pending.length > 0) dangling.push({ file: path, line: pendingLine, ids: pending });
  return { found, dangling };
}

const contractsPath = join(root, 'docs', 'box-v4', 'CONTRACTS.md');
if (!existsSync(contractsPath)) {
  console.error(`proof-map refused: ${relative(process.cwd(), contractsPath) || contractsPath} (CONTRACTS.md) is missing, so there is nothing to map; next: run from the repository root or pass --root`);
  process.exit(2);
}
const guarantees = readGuarantees(readFileSync(contractsPath, 'utf8'));
if (guarantees.length === 0) {
  console.error('proof-map refused: CONTRACTS.md holds no guarantee lines of the form "- C1. ..."; next: check the file');
  process.exit(2);
}

const annotations = [];
const dangling = [];
for (const path of testFiles(join(root, 'tests')).sort()) {
  const result = annotationsIn(relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8'));
  annotations.push(...result.found);
  dangling.push(...result.dangling);
}
const gapsPath = join(root, 'kitchen', 'reviews', 'proof-gaps.json');
let untagged = [];
let gapsReadable = true;
if (existsSync(gapsPath)) {
  try { const gaps = JSON.parse(readFileSync(gapsPath, 'utf8')); untagged = Array.isArray(gaps.untagged) ? gaps.untagged : []; } catch { gapsReadable = false; }
}

const known = new Set(guarantees.map(guarantee => guarantee.id));
const mapped = guarantees.map(guarantee => ({ ...guarantee, tests: annotations.filter(item => item.id === guarantee.id).map(({ file, line, title }) => ({ file, line, title })) }));
const problems = [];
for (const item of annotations) if (!known.has(item.id)) problems.push({ kind: 'unknown-id', id: item.id, detail: `${item.file}:${item.line} "${item.title}" names ${item.id}, which CONTRACTS.md does not have` });
for (const item of dangling) problems.push({ kind: 'dangling', detail: `${item.file}:${item.line} @guards ${item.ids.join(' ')} sits above no test` });
if (!gapsReadable) problems.push({ kind: 'gaps-unreadable', detail: 'kitchen/reviews/proof-gaps.json is not valid JSON of the form {"untagged": [ids]}' });
for (const guarantee of mapped) {
  const listed = untagged.includes(guarantee.id);
  if (guarantee.tests.length === 0 && guarantee.hardStop !== null) problems.push({ kind: 'hard-stop-untested', id: guarantee.id, detail: `${guarantee.id} (hard stop ${guarantee.hardStop}) has no test tagged @guards ${guarantee.id}` });
  else if (guarantee.tests.length === 0 && !listed) problems.push({ kind: 'untagged-not-listed', id: guarantee.id, detail: `${guarantee.id} has no tagged test and is not in kitchen/reviews/proof-gaps.json: tag a test, or list it there` });
  if (guarantee.tests.length > 0 && listed) problems.push({ kind: 'gap-now-tagged', id: guarantee.id, detail: `${guarantee.id} now has ${guarantee.tests.length} tagged test(s): remove it from kitchen/reviews/proof-gaps.json (the list only shrinks)` });
}
for (const id of untagged) if (!known.has(id)) problems.push({ kind: 'gap-unknown', id, detail: `${id} is in kitchen/reviews/proof-gaps.json but not in CONTRACTS.md` });

const tagged = mapped.filter(guarantee => guarantee.tests.length > 0);
const lines = [`proof map: ${guarantees.length} guarantees, ${tagged.length} with a tagged test, ${guarantees.length - tagged.length} untagged (${untagged.length} listed); ${annotations.length} tags on ${new Set(annotations.map(item => `${item.file}:${item.line}`)).size} tests`];
for (const guarantee of mapped.filter(item => item.hardStop !== null)) lines.push(`  hard stop ${guarantee.hardStop}  ${guarantee.id.padEnd(4)} ${String(guarantee.tests.length).padStart(3)} test(s)  ${guarantee.text.slice(0, 80)}`);
for (const problem of problems) lines.push(`  PROBLEM [${problem.kind}] ${problem.detail}`);
const report = { ok: problems.length === 0, problems, guarantees: mapped, tags: annotations.length, text: lines.join('\n') };
process.stdout.write(json ? `${JSON.stringify(report)}\n` : `${report.text}\n`);
process.exit(check && problems.length > 0 ? 1 : 0);
