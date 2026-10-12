// K12: the bounty suite's files run in parallel workers (scripts/suite.mjs
// `suiteWorkers`). This file pins the audit that made that safe, so a future
// helper that reintroduces shared state trips here before it reaches the
// runner — not inside a flaky parallel suite. Audited 2026-10-12:
//   * every scratch path comes from mkdtemp — nothing writes to a fixed name;
//   * every process.env mutation (PATH, GIT_EXEC_PATH, BT6_GH_STATE) is
//     restored in a finally — nothing leaks into a worker's later files;
//   * nothing writes under the repository checkout — temp dirs only;
//   * no `git config --global`, no servers, no fixed ports.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixture, withoutGh } from '../box/bounty/github-fixture.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = join(root, 'tests', 'box', 'bounty');
const sources = readdirSync(dir)
  .filter(name => name.endsWith('.ts'))
  .map(name => [name, readFileSync(join(dir, name), 'utf8')] as const);

// Writes into the checkout would be shared state: every write-call statement
// is scanned for a mention of ROOT (the only repo-anchored path the suite holds).
const WRITES = /\b(writeFileSync|mkdirSync|rmSync|cpSync|copyFileSync|appendFileSync|renameSync|utimesSync|symlinkSync|chmodSync)\([^;\n]*\bROOT\b/;

describe('bounty suite files share no state — the K12 parallel-safety audit', () => {
  it('no file writes under the repository checkout', () => {
    for (const [name, text] of sources) expect(WRITES.test(text), name).toBe(false);
  });

  it('no file touches global git config, a server socket or a fixed temp path', () => {
    for (const [name, text] of sources) {
      expect(text.includes('--global'), name).toBe(false);
      expect(/\b(createServer|listen)\s*\(/.test(text), name).toBe(false);
      // fixed-name temp paths would collide across workers; mkdtemp is the only allowed root
      expect(/tmpdir\(\)\s*[,+][^)]*['"`][^'"`]*['"`]\s*\+?\s*['"`]/.test(text.replace(/mkdtempSync\([^)]*\)/g, '')), name).toBe(false);
    }
  });

  it('fixture() restores PATH and BT6_GH_STATE it sets', () => {
    const pathBefore = process.env.PATH;
    const stateBefore = process.env.BT6_GH_STATE;
    fixture(() => {
      expect(process.env.PATH).not.toBe(pathBefore);
      expect(typeof process.env.BT6_GH_STATE).toBe('string');
    });
    expect(process.env.PATH).toBe(pathBefore);
    if (stateBefore === undefined) expect(process.env.BT6_GH_STATE).toBeUndefined();
    else expect(process.env.BT6_GH_STATE).toBe(stateBefore);
  });

  it('withoutGh() restores PATH and GIT_EXEC_PATH it replaces', () => {
    const pathBefore = process.env.PATH;
    const execBefore = process.env.GIT_EXEC_PATH;
    withoutGh(() => {
      expect(process.env.PATH?.split(delimiter)).toHaveLength(1);
    });
    expect(process.env.PATH).toBe(pathBefore);
    if (execBefore === undefined) expect(process.env.GIT_EXEC_PATH).toBeUndefined();
    else expect(process.env.GIT_EXEC_PATH).toBe(execBefore);
  });
});

describe('suiteWorkers — the parallel decision itself', () => {
  const probe = (expression: string) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as s from './scripts/suite.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));

  it('bounty files run in parallel; the audit above is why they may', () => {
    expect(probe(`s.suiteWorkers('box', 'bounty')`)).toBeGreaterThan(1);
  });

  it('other suites still run one worker at a time', () => {
    expect(probe(`s.suiteWorkers('box', 'auth')`)).toBe(1);
    expect(probe(`s.suiteWorkers('kitchen', undefined)`)).toBe(1);
  });
});
