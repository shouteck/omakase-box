// BT61 — the documents of the commands BT26 did not cover cannot fall behind their text. For each command that changes
// something (create, the preview, post, apply, close) the journey runs once with --json; the document's `lines` are the
// text the command printed (bt61-text.test.ts proves the text path prints exactly those lines), and every label in them
// (`next:`, `github:`, `scan hit:` ...) must be a fact the same document carries under a named pointer, or a named non-fact.
// The table below is the agreement: a label the text prints that it does not list fails, and so does a pointer missing from
// the document. `lines` itself is never an answer: a label mapped to it would make the test vacuous.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { sharedFixture } from './github-fixture.js';
import { CLI_DIST, makeRepo } from './support.js';

type Doc = Record<string, unknown>;
const box = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });
const LABEL_RE = /^\s*([a-z][a-z' -]{0,40}):\s/;
const labelsOf = (lines: readonly string[]): string[] => {
  const found = new Set<string>();
  for (const line of lines) {
    const match = LABEL_RE.exec(line);
    if (match !== null && match[1]!.trim().split(' ').length <= 4) found.add(match[1]!.trim());
  }
  return [...found];
};
const has = (document: unknown, pointer: string): boolean => {
  let node = document;
  for (const raw of pointer.split('/').slice(1)) {
    const part = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (node === null || typeof node !== 'object') return false;
    if (Array.isArray(node)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) return false;
      node = node[index];
    } else {
      if (!Object.prototype.hasOwnProperty.call(node, part)) return false;
      node = (node as Record<string, unknown>)[part];
    }
  }
  return true;
};

// Every label a command's text can print, mapped to the pointer that carries the same fact, or to null with the reason in NOT_FACT.
const LABELS: Record<string, Record<string, string | null>> = {
  create: { 'next': '/next', 'scan hit': '/scan/hits', 'title': '/title', 'record': '/record', 'not scanned': '/scan/notScanned' },
  'post --preview': { 'next': null },
  post: { 'next': '/next', 'scan': '/scanBinary' },
  // The owner's block after a merge (`bounty`, `merged solution`, `merged in`, `reward`) is the `pay` lines; the resume block
  // (`branch`, `changed files`) is `resume`.
  apply: { 'github': '/github/closedNote', 'next': '/next', 'not on github yet': '/notOnGitHub', 'bounty': '/pay', 'merged solution': '/pay', 'merged in': '/pay', 'reward': '/pay', 'branch': '/resume/branch', 'changed files': '/resume/changed' },
  close: { 'github': '/github/closedNote', 'bounty': '/pay', 'merged solution': '/pay', 'merged in': '/pay', 'reward': '/pay' }
};
const NOT_FACT: Record<string, Record<string, string>> = {
  'post --preview': { 'next': 'a suggestion in the preview text; the document carries the facts the preview states' }
};

describe('every label a mutating command prints is a document fact or a named non-fact', { timeout: 300000 }, () => {
  const world = sharedFixture();
  const { repo, id, pr } = world;
  const failures: string[] = [];
  const check = (command: string, cwd: string, args: string[]): Doc => {
    const ran = box(cwd, args);
    expect(ran.status, `${args.join(' ')}: ${ran.stdout}${ran.stderr}`).toBe(0);
    const document = JSON.parse(ran.stdout) as Doc;
    for (const label of labelsOf(document['lines'] as string[])) {
      const entry = LABELS[command]?.[label];
      if (entry === undefined) failures.push(`${command} prints label '${label}' the LABELS table does not list`);
      else if (entry === '/lines') failures.push(`${command} label '${label}' is mapped to /lines, which proves nothing`);
      else if (entry !== null && !has(document, entry)) failures.push(`${command} label '${label}' maps to '${entry}', missing from the document`);
      else if (entry === null && NOT_FACT[command]?.[label] === undefined) failures.push(`${command} label '${label}' has no reason in NOT_FACT`);
    }
    return document;
  };

  it('the journey: create, preview, post, apply, close', () => world.run(() => {
    const plain = makeRepo({ 'TASK.md': 'Fix it.\n' });
    check('create', plain, ['create', '--task', 'TASK.md', '--why', 'agreement', '--json']);
    check('post --preview', repo, ['post', id, '--preview', '--json']);
    box(repo, ['allow', 'owner/project', '--reward', '10', '--reward-limit', '30']);
    check('post', repo, ['post', id, '--json']);
    pr('solver-a');
    box(repo, ['look', id, '1']);
    check('apply', repo, ['apply', id, '1', '--json']);
    check('close', repo, ['close', id, '--json']);
    expect(failures).toEqual([]);
  }));

  it('the check has teeth: a label mapped to a missing pointer, or to /lines, is a failure', () => {
    const document: Doc = { next: 'x', lines: ['next: x'] };
    expect(has(document, '/next')).toBe(true);
    expect(has(document, '/missing')).toBe(false);
    expect(labelsOf(['next: x', 'plain line', 'scan hit: a:1 — rule'])).toEqual(['next', 'scan hit']);
  });
});
