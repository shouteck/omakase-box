// K12 pin: every *named* suite whose tests reach a database must be in
// DB_SUITES, or `verify --only test:<name>` reports db=none and the suite
// dies on "BOX_TEST_DATABASE_URL is not configured" — the defect the pass
// reproduced on b3d73a9. The need is derived, not restated: a suite needs the
// database when one of its files reads process.env.BOX_TEST_ /
// BOX_DELEGATION_DATABASE_URL or imports the host test runtime module
// directly, or execs a scripts/verify-*.mjs that reaches acquireHostRuntime
// (the *-live pattern). A restated list here would pass while the real list
// drifted.
//
// K29: every database consumer went with the older platform and verify no
// longer provisions one at all. The derivation stays — it now proves the
// surviving suites genuinely have no database need, so a reintroduced
// consumer fails here before it fails a run.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const probe = (expression: string) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as s from './scripts/suite.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));

// Actual consumption forms only — comments and regex literals (like this
// file's own) do not match.
const DIRECT = /process\.env\.BOX_TEST_DATABASE_URL|process\.env\.BOX_DELEGATION_DATABASE_URL|host-test-runtime\.mjs/;
const EXEC = /'scripts\/verify-[a-z-]+\.mjs'|"scripts\/verify-[a-z-]+\.mjs"/g;
const scriptNeedsDb = (name: string) => DIRECT.test(readFileSync(join(root, 'scripts', name), 'utf8')) || /acquireHostRuntime/.test(readFileSync(join(root, 'scripts', name), 'utf8'));
const dbScripts = new Set(readdirSync(join(root, 'scripts')).filter(name => /^verify-.*\.mjs$/.test(name)).filter(scriptNeedsDb));

function* files(directory: string): Generator<string> {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (name.endsWith('.ts')) yield path;
  }
}

function suiteNeedsDatabase(directory: string): boolean {
  let list: string[];
  try { list = [...files(directory)]; } catch { return false; } // no such suite directory = no need
  for (const path of list) {
    const text = readFileSync(path, 'utf8');
    if (DIRECT.test(text)) return true;
    for (const match of text.matchAll(EXEC)) if (dbScripts.has(match[0].slice(1, -1).split('/').pop()!)) return true;
  }
  return false;
}

describe('DB_SUITES — every named suite that needs a database is listed', () => {
  it('K29: no surviving suite reaches a database and the sets are empty', () => {
    // The older platform's *-live suites and their scripts/verify-*.mjs
    // helpers are gone; the derivation now verifies the empty set is honest.
    expect(dbScripts.size).toBe(0);
    expect(suiteNeedsDatabase(join(root, 'tests', 'box', 'bounty'))).toBe(false); // bounty genuinely has no database
    expect(suiteNeedsDatabase(join(root, 'tests', 'kitchen'))).toBe(false);
    expect(probe('[...s.DB_SUITES]')).toEqual([]);
    expect(probe('[...s.DB_CHECK_SUITES]')).toEqual([]);
  });

  it('no test:* suite whose files reach a database is missing (the b3d73a9 defect)', () => {
    const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const dbSuites = new Set<string>(probe('[...s.DB_SUITES]'));
    const missing: string[] = [];
    for (const [name, command] of Object.entries(scripts)) {
      if (!name.startsWith('test:')) continue;
      const match = command.match(/suite\.mjs\s+(.+)$/);
      if (!match) continue;
      const key = match[1]!.trim(); // same shape suiteKey produces
      const directory = key.startsWith('box --suite ') ? join(root, 'tests', 'box', key.slice(12)) : join(root, 'tests', key);
      if (suiteNeedsDatabase(directory) && !dbSuites.has(key)) missing.push(key);
    }
    expect(missing, 'named suites whose tests need a database but are absent from DB_SUITES').toEqual([]);
  });
});
