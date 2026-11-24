// reads: scripts/scanners/login-permission.mjs, scripts/scanners/ast.mjs, packages/box-platform/src/
// K75 scanner (fail mode), from the walkthrough of 23–24 November 2026 (PF61): no permission on the board decided by login.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs module without types
import * as scanner from '../../scripts/scanners/login-permission.mjs';
// @ts-expect-error a plain .mjs module without types
import { sourcesUnder } from '../../scripts/scanners/ast.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const planted = (text: string) => [{ file: 'packages/box-platform/src/planted.ts', text }];

describe('scanner: a permission decided by login name (PF61)', () => {
  it('bites: a role, an *Allowed check and a 403 handler that compare logins', () => {
    const found = scanner.scan(planted(`
      export function roleOf(facts, viewer) { return same(viewer.login, facts.poster) ? 'owner' : 'other'; }
      export function ownerOnlyAllowed(facts, viewer) { return viewer.login === facts.poster; }
      async function recordIt(viewer, facts) { if (!same(viewer.login, facts.poster)) return json(403, {}); return json(200, {}); }
      const shown = (a, b) => same(a, b); // a name match outside any access decision: not flagged
      function isSignedIn(login) { return login !== null; } // a null check: not flagged
    `));
    expect(found.map((f: { fn: string }) => f.fn)).toEqual(['roleOf', 'ownerOnlyAllowed', 'recordIt']);
    expect(scanner.failing(found)).toHaveLength(3);
  });

  it('the board holds: every match in an access decision is allow-listed with its reason', () => {
    const found = scanner.scan(sourcesUnder(root, scanner.dirs));
    expect(scanner.failing(found)).toEqual([]);
    // The allow-list names only matches that still exist, so it cannot hide a later one by drifting.
    const keys = found.map((f: { file: string; fn: string; detail: string }) => `${f.file}#${f.fn}: ${f.detail}`);
    expect(Object.keys(scanner.ALLOWED).filter(key => !keys.includes(key))).toEqual([]);
  });
});
