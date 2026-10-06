import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { removeFixtureLink } from './fixture-link.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k7-ci2-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const PNPM_STUB = "const { spawnSync } = require('child_process');\nconst { readFileSync } = require('fs');\nconst { join } = require('path');\nconst scripts = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).scripts;\nconst name = process.argv[process.argv.indexOf('run') + 1];\nconst command = scripts[name];\nif (!command) process.exit(2);\nprocess.exit(spawnSync(command, { shell: true, stdio: 'inherit', cwd: process.cwd() }).status ?? 1);\n";

function repo(script: string) {
  const dir = temp();
  mkdirSync(join(dir, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin'), { recursive: true });
  for (const name of readdirSync(join(root, 'scripts'))) {
    if (name.endsWith('.mjs') || name === 'toolchain.json') copyFileSync(join(root, 'scripts', name), join(dir, 'scripts', name));
  }
  writeFileSync(join(dir, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'), PNPM_STUB);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fake-repo', private: true, scripts: { 'test:x': script } }));
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.kitchen/\n');
  const gitDir = dir.replace(/[\/]+$/, '').replaceAll(String.fromCharCode(92), '/');
  const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${gitDir}`, '-c', 'user.email=kitchen@test.invalid', '-c', 'user.name=kitchen', ...args], { cwd: dir, encoding: 'utf8' });
  git(['init', '-q']);
  git(['add', '-A']);
  git(['commit', '-qm', 'init']);
  return dir;
}

const verify = (dir: string) => spawnSync(process.execPath, [join(dir, 'scripts', 'verify.mjs'), '--only', '--db=none', 'test:x'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
const summaries = (dir: string) => readdirSync(join(dir, '.kitchen', 'runs')).map(name => JSON.parse(readFileSync(join(dir, '.kitchen', 'runs', name, 'summary.json'), 'utf8')));

describe('verify final Git-state diagnostics', () => {
  it('names the paths a mid-run dirty write left behind', () => {
    const dir = repo(`node -e "require('fs').writeFileSync('leftover.txt','x');require('fs').writeFileSync('odd name.txt','y')"`);
    const run = verify(dir);
    const output = (run.stdout ?? '') + (run.stderr ?? '');
    expect(run.status).toBe(3);
    expect(output).toContain('UNCOMMITTED');
    expect(output).toContain('leftover.txt');
    expect(output).toContain('odd name.txt');
    const [summary] = summaries(dir);
    expect(summary.verdict).toBe('UNCOMMITTED');
    expect(summary.dirty).toBe(true);
    expect(summary.finalStatus).toBe('dirty');
    expect(summary.dirtyPaths.join('\n')).toContain('leftover.txt');
    expect(summary.dirtyPaths.join('\n')).toContain('odd name.txt');
  }, 120000);

  it('names an unreadable final status instead of a guessed dirty list', () => {
    const dir = repo(`node -e "require('fs').rmSync('.git',{recursive:true,force:true})"`);
    const run = verify(dir);
    const output = (run.stdout ?? '') + (run.stderr ?? '');
    expect(run.status).toBe(3);
    expect(output).toContain('UNCOMMITTED');
    expect(output).toMatch(/unreadable|could not be read/i);
    const [summary] = summaries(dir);
    expect(summary.verdict).toBe('UNCOMMITTED');
    expect(summary.dirty).toBe(true);
    expect(summary.finalStatus).toBe('unreadable');
  }, 120000);

  it('records a clean final status on a clean run', () => {
    const dir = repo('node -e "process.exit(0)"');
    const run = verify(dir);
    expect(run.status).toBe(0);
    const [summary] = summaries(dir);
    expect(summary.verdict).toBe('PASS');
    expect(summary.dirty).toBe(false);
    expect(summary.finalStatus).toBe('clean');
  }, 120000);
});

describe('in-repo fixture link lifecycle', () => {
  it('a directory junction created inside the suite tree is removed without touching its populated target', () => {
    const dir = temp();
    const target = join(dir, 'real');
    mkdirSync(target);
    writeFileSync(join(target, 'keep.txt'), 'x');
    const link = join(dir, 'kitchen-k6-fix-link');
    symlinkSync(target, link, 'junction');
    removeFixtureLink(link);
    expect(existsSync(link)).toBe(false);
    expect(readFileSync(join(target, 'keep.txt'), 'utf8')).toBe('x');
  });

  it('refuses to remove a real populated directory at the fixture path', () => {
    const dir = temp();
    const occupied = join(dir, 'kitchen-k6-fix-link');
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, 'keep.txt'), 'x');
    expect(() => removeFixtureLink(occupied)).toThrow();
    expect(readFileSync(join(occupied, 'keep.txt'), 'utf8')).toBe('x');
  });

  it('refuses to remove a non-link file at the fixture path', () => {
    const dir = temp();
    const occupied = join(dir, 'kitchen-k6-fix-link');
    writeFileSync(occupied, 'x');
    expect(() => removeFixtureLink(occupied)).toThrow();
    expect(readFileSync(occupied, 'utf8')).toBe('x');
  });

  it('removes a dangling fixture link', () => {
    const dir = temp();
    const target = join(dir, 'real');
    mkdirSync(target);
    const link = join(dir, 'kitchen-k6-fix-link');
    symlinkSync(target, link, 'junction');
    rmSync(target, { recursive: true, force: true });
    removeFixtureLink(link);
    expect(existsSync(link)).toBe(false);
  });

  it('a missing fixture path is idempotent', () => {
    const dir = temp();
    expect(() => removeFixtureLink(join(dir, 'kitchen-k6-fix-link'))).not.toThrow();
  });

  it('kitchen tests never rely on rmdirSync for in-repo fixtures', () => {
    const offenders = readdirSync(join(root, 'tests', 'kitchen'))
      .filter(name => name.endsWith('.test.ts') && name !== 'k7-ci2-final-status.test.ts')
      .filter(name => readFileSync(join(root, 'tests', 'kitchen', name), 'utf8').includes('rmdirSync'));
    expect(offenders).toEqual([]);
  });
});
