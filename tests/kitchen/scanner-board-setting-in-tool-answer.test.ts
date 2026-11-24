// reads: scripts/scanners/board-setting-in-tool-answer.mjs, scripts/scanners/ast.mjs, packages/box-platform/src/
// K75 scanner (fail mode), from the walkthrough of 23–24 November 2026 (D-2026-11-24-card-is-the-only-board-setting):
// an owner's board-only settings never reach the answers the tool and agents read.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs module without types
import * as scanner from '../../scripts/scanners/board-setting-in-tool-answer.mjs';
// @ts-expect-error a plain .mjs module without types
import { sourcesUnder } from '../../scripts/scanners/ast.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

describe('scanner: board settings in a tool-facing answer', () => {
  it('bites: the feed reading the owner\'s switches; the same query in a non-tool file is not flagged', () => {
    const query = 'const rows = await db.prepare(`SELECT r.repository FROM pay_repositories r WHERE r.github_id = ?`).all();';
    expect(scanner.scan([{ file: 'packages/box-platform/src/feed.ts', text: query }])).toHaveLength(1);
    expect(scanner.scan([{ file: 'packages/box-platform/src/agent-input.ts', text: query }])).toHaveLength(1);
    expect(scanner.scan([{ file: 'packages/box-platform/src/account.ts', text: query }])).toEqual([]);
  });

  it('the board holds: no tool-facing file reads an owner-setting table', () => {
    expect(scanner.scan(sourcesUnder(root, scanner.dirs))).toEqual([]);
  });
});
