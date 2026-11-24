// reads: scripts/walkthrough.mjs, scripts/scanners/, docs/box-v4/register.json, docs/box-v4/WALKTHROUGH.md, packages/
// K75: the walkthrough's deterministic half. Coverage places every product file in the register, or fails naming it; the
// register's JSON and WALKTHROUGH.md's table name the same tables; two runs on one commit print the same bytes.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = join(root, 'scripts', 'walkthrough.mjs');
const scratch: string[] = [];
afterAll(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });
const run = (cwdRoot: string, ...args: string[]) => spawnSync(process.execPath, [script, '--root', cwdRoot, ...args], { encoding: 'utf8', timeout: 120000 });

// A scratch repository holding a register and the given product files, all committed.
function tree(files: Record<string, string>, registered: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kitchen-K75-'));
  scratch.push(dir);
  const git = (...args: string[]) => execFileSync('git', ['-c', `safe.directory=${dir.replaceAll('\\', '/')}`, '-c', 'user.name=k75', '-c', 'user.email=k75@test.invalid', '-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  for (const [path, text] of Object.entries(files)) { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text); }
  mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'box-v4', 'register.json'), JSON.stringify({ tables: [{ id: 'exit-sites', built: true, run: 'node -e 0' }], files: registered }));
  git('add', '-A');
  git('commit', '-qm', 'tree');
  return dir;
}

describe('K75: coverage', () => {
  it('a product file missing from the register fails, naming it; a registered one passes', () => {
    const dir = tree({ 'packages/box-bounty/old.ts': 'export {};\n', 'packages/box-bounty/new.ts': 'export {};\n' }, { 'packages/box-bounty/old.ts': ['exit-sites'] });
    const missing = run(dir, '--coverage-only');
    expect(missing.status).toBe(1);
    expect(missing.stdout).toContain('NOT IN THE REGISTER: packages/box-bounty/new.ts');
    const covered = tree({ 'packages/box-bounty/old.ts': 'export {};\n' }, { 'packages/box-bounty/old.ts': 'not pinned' });
    expect(run(covered, '--coverage-only').status).toBe(0);
  });

  it('a register entry for no file, or pinned by a table not built, fails', () => {
    const dir = tree({ 'packages/box-bounty/a.ts': 'export {};\n' }, { 'packages/box-bounty/a.ts': ['claims'], 'packages/box-bounty/gone.ts': 'not pinned' });
    const answer = run(dir, '--coverage-only');
    expect(answer.status).toBe(1);
    expect(answer.stdout).toContain('IN THE REGISTER, NO SUCH FILE: packages/box-bounty/gone.ts');
    expect(answer.stdout).toContain('PINNED BY A TABLE NOT BUILT: packages/box-bounty/a.ts: claims');
  });

  it('this repository: every product file is in the register', () => {
    const answer = run(root, '--coverage-only');
    expect(answer.stdout).not.toContain('NOT IN THE REGISTER');
    expect(answer.status).toBe(0);
  });
});

describe('K75: the register and its page agree', () => {
  it('register.json names exactly the tables of WALKTHROUGH.md\'s register', () => {
    const page = readFileSync(join(root, 'docs', 'box-v4', 'WALKTHROUGH.md'), 'utf8');
    const rows = [...page.slice(page.indexOf('## The register')).matchAll(/^\| `([^`]+)`([^|]*)\|/gm)].map(match => `${match[1]}${match[2]}`.trim());
    const register = JSON.parse(readFileSync(join(root, 'docs', 'box-v4', 'register.json'), 'utf8')) as { tables: { table: string }[] };
    expect(register.tables.map(table => table.table)).toEqual(rows);
  });
});

describe('K75: the agenda is deterministic', () => {
  it('two runs on one commit print the same bytes', () => {
    const first = run(root, '--no-run');
    const second = run(root, '--no-run');
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('## 4. Scanners');
    expect(second.stdout).toBe(first.stdout);
  });
});
