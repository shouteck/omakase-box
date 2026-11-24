// reads: scripts/scanners/stranger-in-hook.mjs, scripts/scanners/record-write.mjs, scripts/scanners/read-writes-outward.mjs, scripts/scanners/git-defences.mjs, scripts/scanners/ast.mjs, packages/box-bounty/, packages/box-cli/src/
// K75 scanners in report or pending mode, from the walkthrough of 23–24 November 2026: each prints what it finds and fails
// nothing until the wave that establishes its rule switches it to fail (named in each module's `switchesIn`). Here each is
// shown to bite on a planted fault, and to run over the real code.
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs module without types
import * as stranger from '../../scripts/scanners/stranger-in-hook.mjs';
// @ts-expect-error a plain .mjs module without types
import * as recordWrite from '../../scripts/scanners/record-write.mjs';
// @ts-expect-error a plain .mjs module without types
import * as readWrites from '../../scripts/scanners/read-writes-outward.mjs';
// @ts-expect-error a plain .mjs module without types
import * as gitDefences from '../../scripts/scanners/git-defences.mjs';
// @ts-expect-error a plain .mjs module without types
import { sourcesUnder } from '../../scripts/scanners/ast.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
type Finding = { file: string; line: number; fn: string; detail: string };

describe('report-mode scanners bite on a planted fault', () => {
  it('stranger-in-hook (BT93): a solver\'s pull request description put into the hook\'s lines', () => {
    const found: Finding[] = stranger.scan([{ file: 'packages/box-bounty/hook.ts', text: 'function lines(record) { return [`new: ${record.attempts[0].description}`, `by ${pull.author}`, record.title]; }' }]);
    expect(found.map(f => f.detail)).toEqual(['pull.author', 'record.attempts[0].description']);
    expect(stranger.mode).toBe('report');
  });

  it('record-write (BT96): a record written back with no revision', () => {
    const found: Finding[] = recordWrite.scan([{ file: 'packages/box-bounty/x.ts', text: 'export function bump(root, record) { record.stage = "x"; persistRecord(root, record); writeStored(root, record); }' }]);
    expect(found.map(f => `${f.fn}: ${f.detail}`)).toEqual(['bump: persistRecord(root, record)', 'bump: writeStored(root, record)']);
  });

  it('read-writes-outward (BT100): a read command that reaches a GitHub write and a push; a GraphQL query is a read', () => {
    const cli = `if (subcommand === 'status') { showStatus(root); } else if (subcommand === 'post') { post(root); }`;
    const lib = [
      'function showStatus(root) { refresh(root); api(root, "graphql", { query: "query { viewer { login } }" }); }',
      'function refresh(root) { api(root, `repos/x/issues/1/comments`, { body: "hi" }); gitOutcome(root, ["push", "origin", "x"]); }',
      'function post(root) { api(root, "repos/x/issues", { title: "t" }); }'
    ].join('\n');
    const found: Finding[] = readWrites.scan([{ file: readWrites.CLI, text: cli }, { file: 'packages/box-bounty/lib.ts', text: lib }]);
    expect(found.map(f => `${f.fn}: ${f.detail.split(':')[0]}`)).toEqual(['refresh: github-write', 'refresh: git-push']);
  });

  it('git-defences (BT97): pending until the table exists; once it does, it says BT97 must replace it', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'kitchen-K75-'));
    try {
      expect(gitDefences.scan([], scratch)).toEqual([]);
      mkdirSync(join(scratch, 'docs', 'box-v4'), { recursive: true });
      writeFileSync(join(scratch, gitDefences.TABLE), '# Git defences\n');
      expect(gitDefences.scan([], scratch)).toHaveLength(1);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
});

describe('report-mode scanners run over the real code', () => {
  it('each returns its findings in a fixed order (what the walkthrough prints)', () => {
    const twice = () => [
      stranger.scan(sourcesUnder(root, ['packages/box-bounty']).filter((s: { file: string }) => stranger.files.includes(s.file))),
      recordWrite.scan(sourcesUnder(root, recordWrite.dirs)),
      readWrites.scan(sourcesUnder(root, readWrites.dirs)),
      gitDefences.scan([], root)
    ];
    const first = twice();
    expect(first[1].length).toBeGreaterThan(0); // BT96's work list is not empty today
    expect(JSON.stringify(twice())).toBe(JSON.stringify(first));
  });
});
