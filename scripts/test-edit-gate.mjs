#!/usr/bin/env node
// K62 (H8 of K51d): AGENTS.md rule 2 as a check. The agent that writes the code also writes the tests, so a sentence asking it
// not to edit the judge is advisory; this makes the edit visible and deterministic. A wave that deletes a test, skips it, drops or
// changes an assertion, raises a time limit, or changes a snapshot or the limits' files must list each under
// "## Changed expectations" in its wave file, one line per test: `- <file>::<test title> — <reason>`. Added tests and added
// assertions are never flagged. `.only` is never allowed. It can be bypassed by whoever edits this script too: what it adds is that the
// edit shows in the Result for the owner to read, and that the check does not depend on remembering the rule.
//
// node scripts/test-edit-gate.mjs [--repo <dir>] [--base <ref>] [--head <ref>] [--wave <ID>] [--json] [--history <n>]
// Exit 0: not applied, or every flag listed. 1: an unlisted flag or `.only`. 2: refused (no base to compare with, unreadable repo).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
// The parser is read the first time a test file has to be compared, not at import: off a wave branch, or in a scratch repository
// that has no TypeScript (verify's own end-to-end tests build such repositories), the gate answers without it.
let parser;
const ts = new Proxy({}, { get: (_, name) => (parser ??= require('typescript'))[name] });

const SKIP_MODIFIERS = new Set(['skip', 'skipIf', 'todo', 'fails']);
const GROUPS = new Set(['describe']);
const TESTS = new Set(['it', 'test']);
const ASSERTION_HELPER = /^(?:expect[A-Z]\w*|refused|assert\w*)$/;
const LIMIT_FILES = ['scripts/test-timeout.mjs', 'scripts/vitest.config.mjs'];

function git(repo, args) {
  const run = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: run.status, out: run.stdout ?? '' };
}
const show = (repo, rev, path) => { const run = git(repo, ['show', `${rev}:${path}`]); return run.status === 0 ? run.out : null; };
const resolves = (repo, ref) => git(repo, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]).status === 0;

// ---- reading a test file from its syntax tree ------------------------------------------------------------------------

function rootAndModifiers(expression) {
  const modifiers = [];
  let node = expression;
  for (;;) {
    if (ts.isIdentifier(node)) return { root: node.text, modifiers };
    if (ts.isPropertyAccessExpression(node)) { modifiers.push(node.name.text); node = node.expression; } else if (ts.isElementAccessExpression(node)) node = node.expression;
    else if (ts.isCallExpression(node)) { if (ts.isPropertyAccessExpression(node.expression)) modifiers.push(node.expression.name.text); node = node.expression; } else return { root: null, modifiers };
  }
}
const titleOf = (call, source) => {
  const first = call.arguments[0];
  if (first === undefined) return '';
  return ts.isStringLiteralLike(first) ? first.text : first.getText(source).slice(0, 160);
};
function timeoutOf(call) {
  let found = null;
  for (const argument of call.arguments) {
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      if (ts.isPropertyAssignment(property) && property.name.getText() === 'timeout' && ts.isNumericLiteral(property.initializer)) found = Number(property.initializer.text.replaceAll('_', ''));
    }
  }
  return found;
}
let printer;
function normalised(node, source) {
  printer ??= ts.createPrinter({ removeComments: true });
  return printer.printNode(ts.EmitHint.Unspecified, node, source)
    .replace(/\s+/g, ' ')
    .replace(/ \./g, '.') // a chain broken across lines
    .replace(/([{[(]) /g, '$1').replace(/ ([}\])])/g, '$1').replace(/,([}\])])/g, '$1')
    .trim();
}
function isAssertion(expression) {
  let node = expression;
  for (;;) {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) return node.expression.text === 'expect' || ASSERTION_HELPER.test(node.expression.text);
      node = node.expression;
    } else if (ts.isPropertyAccessExpression(node) || ts.isNonNullExpression(node) || ts.isAwaitExpression(node)) node = node.expression;
    else return false;
  }
}
function assertionsIn(body, source) {
  const found = [];
  const visit = node => {
    if (ts.isExpressionStatement(node) && isAssertion(node.expression)) { found.push(normalised(node.expression, source)); return; }
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body) && isAssertion(node.body)) { found.push(normalised(node.body, source)); return; }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/** Every test and every describe of a file: titles, modifiers, own time limits, assertion lists. */
export function readTests(text, name = 'file.test.ts') {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  const tests = [];
  const groups = [];
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const { root, modifiers } = rootAndModifiers(node.expression);
      const callback = node.arguments.find(argument => ts.isFunctionLike(argument));
      if (root !== null && (TESTS.has(root) || GROUPS.has(root)) && callback !== undefined) {
        const title = titleOf(node, source);
        const entry = { title, modifiers: new Set(modifiers), timeout: timeoutOf(node) };
        if (GROUPS.has(root)) { groups.push(entry); ts.forEachChild(node, visit); return; }
        tests.push({ ...entry, assertions: assertionsIn(callback, source) });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { tests, groups };
}

function indexed(entries) {
  const seen = new Map();
  return entries.map(entry => { const count = seen.get(entry.title) ?? 0; seen.set(entry.title, count + 1); return { ...entry, id: `${entry.title}#${count}` }; });
}

// ---- the flags -------------------------------------------------------------------------------------------------------

const flag = (kind, key, detail, listable = true) => ({ kind, key, detail, listable });
const short = text => (text.length > 150 ? `${text.slice(0, 147)}...` : text);

export function flagsForFile(path, before, after) {
  const file = basename(path);
  const flags = [];
  if (after === null) return [flag('file-deleted', path, `${path} was deleted`)];
  const head = readTests(after, path);
  const base = before === null ? { tests: [], groups: [] } : readTests(before, path);
  const baseTests = new Map(indexed(base.tests).map(test => [test.id, test]));
  const baseGroups = new Map(indexed(base.groups).map(group => [group.id, group]));
  for (const group of indexed(head.groups)) {
    const old = baseGroups.get(group.id);
    if (group.modifiers.has('only')) flags.push(flag('only', `${file}::${group.title}`, '.only on a group', false));
    for (const modifier of group.modifiers) if (SKIP_MODIFIERS.has(modifier) && !(old?.modifiers.has(modifier))) flags.push(flag('test-skipped', `${file}::${group.title}`, `group is now .${modifier}`));
    if (old !== undefined && group.timeout !== null && old.timeout !== null && group.timeout > old.timeout) flags.push(flag('timeout-raised', `${file}::${group.title}`, `group time limit ${old.timeout} ms -> ${group.timeout} ms`));
  }
  const headTests = indexed(head.tests);
  for (const test of headTests) {
    const key = `${file}::${test.title}`;
    const old = baseTests.get(test.id);
    if (test.modifiers.has('only')) flags.push(flag('only', key, '.only on a test', false));
    for (const modifier of test.modifiers) if (SKIP_MODIFIERS.has(modifier) && !(old?.modifiers.has(modifier))) flags.push(flag('test-skipped', key, `test is now .${modifier}`));
    if (old === undefined) continue;
    if (test.timeout !== null && old.timeout !== null && test.timeout > old.timeout) flags.push(flag('timeout-raised', key, `time limit ${old.timeout} ms -> ${test.timeout} ms`));
    const remaining = [...test.assertions];
    const lost = [];
    for (const assertion of old.assertions) {
      const at = remaining.indexOf(assertion);
      if (at >= 0) remaining.splice(at, 1); else lost.push(assertion);
    }
    if (lost.length > 0) flags.push(flag('assertion-changed', key, `${lost.length} assertion(s) removed or changed; was: ${lost.slice(0, 3).map(short).join(' | ')}`));
  }
  const headIds = new Set(headTests.map(test => test.id));
  for (const [id, test] of baseTests) if (!headIds.has(id)) flags.push(flag('test-removed', `${file}::${test.title}`, 'test no longer exists under this title'));
  return flags;
}

export function flagsBetween(repo, base, head) {
  const diff = git(repo, ['diff', '--name-status', '--no-renames', '-z', base, head, '--', 'tests', ...LIMIT_FILES]);
  if (diff.status !== 0) return null;
  const parts = diff.out.split('\0').filter(part => part !== '');
  const flags = [];
  for (let at = 0; at + 1 < parts.length; at += 2) {
    const status = parts[at][0];
    const path = parts[at + 1];
    if (/^tests\/.*\.test\.ts$/.test(path)) flags.push(...flagsForFile(path, status === 'A' ? null : show(repo, base, path), status === 'D' ? null : show(repo, head, path)));
    else if (/^tests\/.*(?:\.snapshot\.json|\.snap)$/.test(path)) { if (status !== 'A') flags.push(flag('snapshot-changed', path, `snapshot ${status === 'D' ? 'deleted' : 'changed'}`)); } else if (LIMIT_FILES.includes(path)) flags.push(flag('limit-changed', path, 'a file that sets the test time limits changed'));
  }
  return flags;
}

// ---- the listing in the wave file ------------------------------------------------------------------------------------

export function listedLines(waveText) {
  if (waveText === null) return [];
  const heading = /^##[ \t]+Changed expectations[ \t]*$/im.exec(waveText);
  if (heading === null) return [];
  const rest = waveText.slice(heading.index + heading[0].length);
  const next = /^##[ \t]/m.exec(rest);
  const section = next === null ? rest : rest.slice(0, next.index);
  return section.split(/\r?\n/).map(line => line.trim()).filter(line => /^[-*]/.test(line)).map(line => line.replace(/^[-*]\s*/, '').replaceAll('`', ''));
}
const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function isListed(key, lines) {
  // The listed lines lose their backticks (a key is often written in code spelling), so a title that holds backticks must lose them too.
  const pattern = new RegExp(`${escaped(key.replaceAll('`', ''))}(?![\\w])(.*)$`);
  return lines.some(line => {
    const match = pattern.exec(line);
    return match !== null && match[1].replace(/^[\s—–:-]+/, '').trim().length >= 8;
  });
}

// ---- the whole check -------------------------------------------------------------------------------------------------

export function gate(repo, { base, head = 'HEAD', wave }) {
  const baseRef = [base, 'master', 'origin/master'].find(ref => ref !== undefined && resolves(repo, ref));
  if (baseRef === undefined) return { applied: true, wave, ok: false, flags: [], unlisted: [], refused: 'no-base', text: 'test-edit gate refused: there is no master (or origin/master, or --base) to compare with, so no test edit can be checked; next: fetch or create master, then run again' };
  const mergeBase = git(repo, ['merge-base', baseRef, head]);
  if (mergeBase.status !== 0) return { applied: true, wave, ok: false, flags: [], unlisted: [], refused: 'no-merge-base', text: `test-edit gate refused: ${head} and ${baseRef} share no history; next: compare against a base that does` };
  const from = mergeBase.out.trim();
  const flags = flagsBetween(repo, from, head);
  if (flags === null) return { applied: true, wave, ok: false, flags: [], unlisted: [], refused: 'diff-failed', text: 'test-edit gate refused: git could not diff the test files; next: run git status in the repository' };
  const waveFile = `waves/${wave}.md`;
  const lines = listedLines(show(repo, head, waveFile));
  const marked = flags.map(entry => ({ ...entry, listed: entry.listable && isListed(entry.key, lines) }));
  const unlisted = marked.filter(entry => !entry.listed);
  const out = [];
  if (marked.length === 0) out.push(`test-edit gate: wave ${wave}: no existing test was removed, skipped or loosened`);
  else {
    out.push(`test-edit gate: wave ${wave}: ${marked.length} existing test edit(s) found, ${marked.length - unlisted.length} listed in ${waveFile}`);
    for (const entry of marked) out.push(`  ${entry.listed ? 'listed  ' : 'UNLISTED'} [${entry.kind}] ${entry.key} — ${entry.detail}`);
  }
  const needed = unlisted.filter(entry => entry.listable);
  if (needed.length > 0) {
    out.push('', `Rule 2: a wave may change what a test expects only when it says so. Add under "## Changed expectations" in ${waveFile}, one line each, with the reason (at least a few words):`);
    for (const entry of needed) out.push(`- ${entry.key} — <why this test changed>`);
  }
  for (const entry of unlisted.filter(item => !item.listable)) out.push('', `${entry.key}: .only is never allowed in a committed test: it silently skips every other test in the run; remove it`);
  return { applied: true, wave, base: from, head, ok: unlisted.length === 0, flags: marked, unlisted, text: out.join('\n') };
}

/** For the Result of the wave that built this gate: what rule 2 looked like on the last n merged waves. */
export function history(repo, count) {
  const merges = git(repo, ['log', '--first-parent', '--merges', '--format=%H %s', '-n', String(count * 3), 'master']).out.split('\n').filter(Boolean)
    .map(line => ({ sha: line.slice(0, 40), wave: /Merge wave\/(\S+?)[:\s]/.exec(`${line.slice(41)} `)?.[1] })).filter(item => item.wave !== undefined).slice(0, count);
  return merges.map(({ sha, wave }) => {
    const flags = flagsBetween(repo, `${sha}^1`, `${sha}^2`) ?? [];
    const lines = listedLines(show(repo, `${sha}^2`, `waves/${wave}.md`));
    return { wave, flags: flags.map(entry => ({ kind: entry.kind, key: entry.key, listed: entry.listable && isListed(entry.key, lines) })) };
  });
}

// ---- the command -----------------------------------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const value = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
  const repo = value('--repo') ?? process.cwd();
  const json = args.includes('--json');
  const say = (report, code) => { process.stdout.write(json ? `${JSON.stringify(report)}\n` : `${report.text}\n`); process.exit(code); };
  if (value('--history') !== undefined) { process.stdout.write(`${JSON.stringify(history(repo, Number(value('--history'))), null, 1)}\n`); return; }
  let wave = value('--wave');
  if (wave === undefined) {
    // The runner's branch name only describes the checkout the command runs in, never a repository named with --repo.
    const named = value('--repo') !== undefined ? undefined : [process.env.GITHUB_HEAD_REF, process.env.GITHUB_REF_NAME].find(name => typeof name === 'string' && name.startsWith('wave/'));
    const current = named ?? git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).out.trim();
    const match = /^wave\/(.+)$/.exec(current);
    if (match === null) say({ applied: false, ok: true, flags: [], unlisted: [], text: `test-edit gate: not applied — branch ${current === 'HEAD' ? '(detached HEAD)' : current} is not a wave branch (wave/<ID>); name the wave with --wave to check it anyway` }, 0);
    wave = match[1];
  }
  const report = gate(repo, { base: value('--base'), head: value('--head') ?? 'HEAD', wave });
  say(report, report.refused !== undefined ? 2 : report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href) main();
