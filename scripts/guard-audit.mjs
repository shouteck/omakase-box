#!/usr/bin/env node
// K66 (H3 of K51d): the hard stops, broken on purpose. A test that passes on broken code proves nothing, and a suite of
// thousands of tests can hold a guarantee that no test would notice losing. This script takes the break table
// (kitchen/reviews/guard-breaks.json: one exact-text replacement per break, the guarantees it breaks, the test files that must
// notice), applies each break in a throwaway `git worktree` of the committed code, runs those test files, and reports "red" (a
// test failed: the guard works) or "silent" (nothing failed: a guarantee is unprotected here). The working tree and the shared
// node_modules are never touched: the worktree borrows node_modules through a directory link that is removed with rmdir/unlink
// before the worktree is, so Git never walks into the real folder.
//
// node scripts/guard-audit.mjs [--only <id>] [--json] [--check-breaks]
//   --check-breaks  no run: every break's find text is present once (or `nth` picks one), its test files exist and carry a
//                   `// @guards` tag for its guarantees, and every hard-stop guarantee in CONTRACTS.md has a break
//   --root --breaks --build <cmd|none> --config --vitest --modules   (used by the tests of this script)
// Exit 0: every break red (or the static check passed). 1: a silent, stale, ambiguous or failed-to-build break. 2: refused.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const value = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const root = (value('--root') ?? process.cwd()).replaceAll('\\', '/');
const json = args.includes('--json');
const modules = value('--modules') ?? join(root, 'node_modules');
const vitest = value('--vitest') ?? join(modules, 'vitest', 'vitest.mjs');
const config = value('--config') ?? 'scripts/vitest.config.mjs';
const buildCommand = value('--build') ?? 'node scripts/workspace.mjs build';
const breaksPath = value('--breaks') ?? join(root, 'kitchen', 'reviews', 'guard-breaks.json');
const only = value('--only');

const refuse = message => { process.stderr.write(`guard-audit refused: ${message}\n`); process.exit(2); };
const git = (cwd, gitArgs) => spawnSync('git', ['-c', `safe.directory=${root}`, '-C', cwd, ...gitArgs], { encoding: 'utf8' });

if (!existsSync(breaksPath)) refuse(`no break table at ${breaksPath}; next: run from the repository root or pass --breaks`);
const table = JSON.parse(readFileSync(breaksPath, 'utf8')).breaks;
if (!Array.isArray(table) || table.length === 0) refuse('the break table holds no breaks');
if (only !== undefined && !table.some(entry => entry.id === only)) refuse(`no break named ${only}; known: ${table.map(entry => entry.id).join(', ')}`);

const occurrences = (text, find) => text.split(find).length - 1;
const tagsIn = text => new Set([...text.matchAll(/^\s*\/\/\s*@guards\s+(.+?)\s*$/gm)].flatMap(match => match[1].split(/[\s,]+/).filter(Boolean)));

// ---- the static check ------------------------------------------------------------------------------------------------

function checkBreaks() {
  const problems = [];
  for (const entry of table) {
    const path = join(root, entry.file);
    if (!existsSync(path)) { problems.push({ kind: 'missing-file', id: entry.id, detail: `${entry.id}: ${entry.file} does not exist` }); continue; }
    const count = occurrences(readFileSync(path, 'utf8'), entry.find);
    if (count === 0) problems.push({ kind: 'stale', id: entry.id, detail: `${entry.id}: the find text is not in ${entry.file} any more; update the break` });
    else if (entry.nth === undefined && count > 1) problems.push({ kind: 'ambiguous', id: entry.id, detail: `${entry.id}: the find text occurs ${count} times in ${entry.file}; give nth` });
    else if (entry.nth !== undefined && entry.nth >= count) problems.push({ kind: 'stale', id: entry.id, detail: `${entry.id}: nth ${entry.nth} but only ${count} occurrence(s)` });
    for (const test of entry.tests ?? []) {
      const testPath = join(root, test);
      if (!existsSync(testPath)) { problems.push({ kind: 'missing-test', id: entry.id, detail: `${entry.id}: test file ${test} does not exist` }); continue; }
      const contracts = join(root, 'docs', 'box-v4', 'CONTRACTS.md');
      if (existsSync(contracts) && !(entry.guarantees ?? []).some(id => tagsIn(readFileSync(testPath, 'utf8')).has(id))) problems.push({ kind: 'untagged-test', id: entry.id, detail: `${entry.id}: ${test} carries no // @guards tag for ${(entry.guarantees ?? []).join(' or ')}` });
    }
  }
  const contracts = join(root, 'docs', 'box-v4', 'CONTRACTS.md');
  let hardStops = [];
  if (existsSync(contracts)) {
    hardStops = readFileSync(contracts, 'utf8').split(/\r?\n/).map(line => /^- ([A-Z]+[0-9]+)\. .*hard stop \d/i.exec(line)?.[1]).filter(Boolean);
    for (const id of hardStops) if (!table.some(entry => (entry.guarantees ?? []).includes(id))) problems.push({ kind: 'hard-stop-no-break', id, detail: `hard-stop guarantee ${id} has no break in the table: add one` });
  }
  const report = { ok: problems.length === 0, problems, breaks: table.length, hardStops, text: problems.length === 0 ? `guard-audit --check-breaks: ${table.length} breaks current, ${hardStops.length} hard-stop guarantees each broken somewhere` : problems.map(problem => `PROBLEM [${problem.kind}] ${problem.detail}`).join('\n') };
  process.stdout.write(json ? `${JSON.stringify(report)}\n` : `${report.text}\n`);
  process.exit(report.ok ? 0 : 1);
}
if (args.includes('--check-breaks')) checkBreaks();

// ---- the run ---------------------------------------------------------------------------------------------------------

const wt = join(mkdtempSync(join(tmpdir(), 'guard-audit-')), 'wt').replaceAll('\\', '/');
const added = git(root, ['worktree', 'add', '--detach', wt, 'HEAD']);
if (added.status !== 0) refuse(`git could not make a worktree of HEAD: ${added.stderr.trim()}`);
const links = [];
const results = [];
function link(target, path) { symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir'); links.push(path); }
function unlink(path) {
  if (process.platform === 'win32') spawnSync('cmd', ['/c', 'rmdir', path.replaceAll('/', '\\')], { encoding: 'utf8' });
  else { try { unlinkSync(path); } catch { /* checked below */ } }
}

function runTests(tests) {
  const out = join(wt, '.guard-audit-result.json');
  const ran = spawnSync(process.execPath, [vitest, 'run', '--maxWorkers=1', '--config', config, '--reporter=json', `--outputFile=${out}`, ...tests], { cwd: wt, encoding: 'utf8', env: { ...process.env, BOX_BOARD_DEFAULT: '' }, timeout: 900000 });
  if (!existsSync(out)) return { error: (ran.stderr || ran.stdout || 'vitest wrote no result').slice(0, 300) };
  const failed = [];
  for (const file of JSON.parse(readFileSync(out, 'utf8')).testResults) {
    const bad = file.assertionResults.filter(test => test.status === 'failed');
    for (const test of bad) failed.push(test.title);
    if (bad.length === 0 && file.status === 'failed') failed.push('(the test file failed to run)');
  }
  return { failed };
}

try {
  if (existsSync(modules)) link(modules, join(wt, 'node_modules'));
  if (existsSync(join(root, 'packages'))) {
    for (const name of readdirSync(join(root, 'packages'))) {
      if (existsSync(join(root, 'packages', name, 'node_modules')) && existsSync(join(wt, 'packages', name))) link(join(root, 'packages', name, 'node_modules'), join(wt, 'packages', name, 'node_modules'));
    }
  }
  for (const entry of table.filter(item => only === undefined || item.id === only)) {
    const began = Date.now();
    const done = (status, extra = {}) => results.push({ id: entry.id, guarantees: entry.guarantees ?? [], file: entry.file, status, failed: [], detail: '', ...extra, seconds: Math.round((Date.now() - began) / 1000) });
    const path = join(wt, entry.file);
    if (!existsSync(path)) { done('stale', { detail: `${entry.file} does not exist` }); continue; }
    const text = readFileSync(path, 'utf8');
    const count = occurrences(text, entry.find);
    if (count === 0) { done('stale', { detail: 'the find text is not in the file' }); continue; }
    if (entry.nth === undefined && count > 1) { done('ambiguous', { detail: `the find text occurs ${count} times; give nth` }); continue; }
    const parts = text.split(entry.find);
    const nth = entry.nth ?? 0;
    if (nth >= count) { done('stale', { detail: `nth ${nth} but ${count} occurrence(s)` }); continue; }
    writeFileSync(path, parts.slice(0, nth + 1).join(entry.find) + entry.replace + parts.slice(nth + 1).join(entry.find));
    try {
      if (buildCommand !== 'none') {
        const [program, ...rest] = buildCommand.split(' ');
        const built = spawnSync(program === 'node' ? process.execPath : program, rest, { cwd: wt, encoding: 'utf8', timeout: 600000 });
        if (built.status !== 0) { done('build-failed', { detail: (built.stdout + built.stderr).slice(-300) }); continue; }
      }
      const ran = runTests(entry.tests ?? []);
      if (ran.error !== undefined) done('error', { detail: ran.error });
      else done(ran.failed.length > 0 ? 'red' : 'silent', { failed: ran.failed.slice(0, 500), detail: `${ran.failed.length} test(s) failed` });
    } finally { git(wt, ['checkout', '--', entry.file]); }
  }
} finally {
  for (const path of links) unlink(path);
  const still = links.filter(path => existsSync(path));
  if (still.length > 0) process.stderr.write(`guard-audit: NOT removing the worktree, a link is still present: ${still.join(', ')} (worktree at ${wt}; remove the link by hand first)\n`);
  else git(root, ['worktree', 'remove', '--force', wt]);
}

const bad = results.filter(result => result.status !== 'red');
const text = [`guard-audit: ${results.length} break(s): ${results.length - bad.length} red, ${bad.length} not`]
  .concat(results.map(result => `  ${result.status.toUpperCase().padEnd(10)} ${result.id.padEnd(28)} [${result.guarantees.join(' ')}] ${result.status === 'red' ? `${result.failed.length}+ test(s) went red` : result.detail}`)).join('\n');
process.stdout.write(json ? `${JSON.stringify({ ok: bad.length === 0, results, text })}\n` : `${text}\n`);
process.exit(bad.length === 0 ? 0 : 1);
