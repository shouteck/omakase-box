#!/usr/bin/env node
// K75: the walkthrough's deterministic half (docs/box-v4/WALKTHROUGH.md). Prints the agenda in a fixed order:
//   1. Scope: product files changed since the newest walkthrough/* tag, by component.
//   2. Coverage: every product file placed in docs/box-v4/register.json (pinned by a built table, or "not pinned").
//      A product file missing from the register, or a register entry for no file, exits 1 naming it.
//   3. Invariants: each built table's check, run, PASS or FAIL.
//   4. Scanners: each scanners/*.mjs, its mode and findings.
//   5. Checklist: the judgment questions under each component in scope.
// The output carries no clock, duration or absolute path: two runs on one commit print the same bytes.
//
// node scripts/walkthrough.mjs [--no-run] [--coverage-only] [--root <dir>]
// node scripts/walkthrough.mjs --references    re-reads each source the register records; by hand, needs the network
// Exit 0: coverage holds and every built check and fail-mode scanner passed. 1: otherwise. 2: refused.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const value = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const root = (value('--root') ?? fileURLToPath(new URL('../', import.meta.url))).replace(/[\\/]+$/, '');
const here = fileURLToPath(new URL('./', import.meta.url));
const say = line => process.stdout.write(`${line}\n`);
const refuse = message => { process.stderr.write(`walkthrough refused: ${message}\n`); process.exit(2); };

export const COMPONENTS = ['packages/box-bounty', 'packages/box-cli/src', 'packages/box-platform/src', '.github/workflows'];
export const PRODUCT = /^(packages\/box-bounty|packages\/box-cli\/src|packages\/box-platform\/src)\/.+\.(ts|tsx|mjs|cjs|js)$/;
const BUILD_OUTPUT = /(^|\/)(dist|dist-package|out|node_modules|\.next)\//;
const SCANNERS = ['login-permission', 'board-setting-in-tool-answer', 'stranger-in-hook', 'read-writes-outward', 'record-write', 'git-defences'];

const git = gitArgs => spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...gitArgs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const registerPath = join(root, 'docs', 'box-v4', 'register.json');
if (!existsSync(registerPath)) refuse(`no register at docs/box-v4/register.json; next: run from the repository root or pass --root`);
const register = JSON.parse(readFileSync(registerPath, 'utf8'));

if (args.includes('--references')) {
  const recorded = register.tables.flatMap(table => (table.references ?? []).map(reference => ({ table: table.id, ...reference })));
  if (recorded.length === 0) { say('references: none recorded in docs/box-v4/register.json'); process.exit(0); }
  let changed = 0;
  for (const reference of recorded) {
    let now;
    try { now = createHash('sha256').update(await (await fetch(reference.address)).text()).digest('hex'); } catch { now = null; }
    const state = now === null ? 'unreadable' : now === reference.sha256 ? 'unchanged' : 'changed';
    if (state !== 'unchanged') changed += 1;
    say(`${state.padEnd(10)} ${reference.table}  ${reference.address}  (read ${reference.date})`);
  }
  process.exit(changed === 0 ? 0 : 1);
}

let failed = false;

// 1. Scope
const tags = (git(['tag', '--list', 'walkthrough/*', '--sort=-creatordate']).stdout ?? '').split('\n').filter(Boolean).sort().reverse();
const since = tags[0] ?? null;
if (!args.includes('--coverage-only')) {
  say('# Walkthrough agenda');
  say('');
  say(`## 1. Scope${since === null ? ': no walkthrough/* tag yet, so every product file' : `: changed since ${since}`}`);
  const changed = since === null ? null : (git(['diff', '--name-only', `${since}..HEAD`]).stdout ?? '').split('\n').filter(Boolean);
  for (const component of COMPONENTS) {
    const inComponent = changed === null ? null : changed.filter(path => path.startsWith(`${component}/`));
    say(`- ${component}: ${inComponent === null ? 'all' : inComponent.length === 0 ? 'no change' : `${inComponent.length} changed`}`);
    for (const path of inComponent ?? []) say(`  - ${path}`);
  }
  say('');
}

// 2. Coverage
const tracked = (git(['ls-files']).stdout ?? '').split('\n').filter(Boolean);
const product = tracked.filter(path => PRODUCT.test(path) && !BUILD_OUTPUT.test(path)).sort();
const builtTables = new Set(register.tables.filter(table => table.built).map(table => table.id));
const missing = product.filter(path => register.files[path] === undefined);
const stale = Object.keys(register.files).filter(path => !product.includes(path)).sort();
const unknownTable = Object.entries(register.files).flatMap(([path, entry]) => entry === 'not pinned' ? [] : (Array.isArray(entry) ? entry : [entry]).filter(id => !builtTables.has(id)).map(id => `${path}: ${id}`)).sort();
const pinned = product.filter(path => Array.isArray(register.files[path])).length;
say(`## 2. Coverage: ${product.length} product files, ${pinned} pinned by a built table, ${product.length - pinned - missing.length} not pinned, ${missing.length} not in the register`);
for (const path of missing) say(`- NOT IN THE REGISTER: ${path} (next: add it to docs/box-v4/register.json, pinned or "not pinned")`);
for (const path of stale) say(`- IN THE REGISTER, NO SUCH FILE: ${path}`);
for (const entry of unknownTable) say(`- PINNED BY A TABLE NOT BUILT: ${entry}`);
if (missing.length + stale.length + unknownTable.length > 0) failed = true;
if (args.includes('--coverage-only')) process.exit(failed ? 1 : 0);
say('');

// 3. Invariants
say('## 3. Invariants: each built table\'s check');
for (const table of register.tables) {
  if (!table.built) { say(`- ${table.id}: not built yet (${table.wave})`); continue; }
  if (args.includes('--no-run')) { say(`- ${table.id}: not run (--no-run): ${table.run}`); continue; }
  const [command, ...rest] = table.run.split(' ');
  const run = spawnSync(command === 'node' ? process.execPath : command, rest, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const pass = run.status === 0;
  if (!pass) failed = true;
  say(`- ${table.id}: ${pass ? 'PASS' : 'FAIL'}: ${table.run}`);
}
say('');

// 4. Scanners
say('## 4. Scanners');
const { sourcesUnder } = await import(pathToFileURL(join(here, 'scanners', 'ast.mjs')).href);
for (const name of SCANNERS) {
  const scanner = await import(pathToFileURL(join(here, 'scanners', `${name}.mjs`)).href);
  const sources = scanner.files !== undefined
    ? sourcesUnder(root, [...new Set(scanner.files.map(file => file.slice(0, file.lastIndexOf('/'))))]).filter(source => scanner.files.includes(source.file))
    : sourcesUnder(root, scanner.dirs ?? []);
  const findings = scanner.scan(sources, root);
  const failing = scanner.mode === 'fail' ? (scanner.failing ? scanner.failing(findings) : findings) : [];
  if (failing.length > 0) failed = true;
  say(`- ${scanner.id} (${scanner.mode}${scanner.switchesIn ? `, fail from ${scanner.switchesIn}` : ''}): ${findings.length} found${scanner.mode === 'fail' ? `, ${failing.length} failing` : ''}. From ${scanner.from}.`);
  for (const finding of findings) say(`  - ${finding.file}:${finding.line} ${finding.fn}: ${finding.detail}${finding.allowed ? ` (allowed: ${finding.allowed})` : ''}`);
}
say('');

// 5. Checklist
say('## 5. Checklist: answer each in the walkthrough\'s file');
const practice = readFileSync(join(root, 'docs', 'box-v4', 'WALKTHROUGH.md'), 'utf8');
const judgment = practice.slice(practice.indexOf('## The judgment part'), practice.indexOf('## The record'));
const questions = [...judgment.matchAll(/^\d+\. (.+)$/gm)].map(match => match[1].replaceAll('**', '').trim());
const scopeChanged = since === null ? null : (git(['diff', '--name-only', `${since}..HEAD`]).stdout ?? '').split('\n').filter(Boolean);
for (const component of COMPONENTS) {
  if (scopeChanged !== null && !scopeChanged.some(path => path.startsWith(`${component}/`))) continue;
  say(`### ${component}`);
  questions.forEach((question, index) => say(`${index + 1}. ${question}`));
}
say('');
say(failed ? 'walkthrough: something above FAILED' : 'walkthrough: coverage holds; every built check and fail-mode scanner passed');
process.exit(failed ? 1 : 0);
