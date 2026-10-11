import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k7-ci-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

describe('frozen workspace install leaves the lockfile untouched', () => {
  it('every workspace package directory has a pnpm-lock.yaml importer entry', () => {
    const manifest = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
    const packagesBlock = manifest.split(/^packages:/m)[1]?.split(/^\S/m)[0] ?? '';
    const dirs = new Set<string>();
    for (const entry of packagesBlock.matchAll(/^\s+-\s+(\S+)\s*$/gm)) {
      const pattern = entry[1]!;
      if (pattern.endsWith('/*')) {
        const parent = join(root, pattern.slice(0, -2));
        if (!existsSync(parent)) continue;
        for (const name of readdirSync(parent)) {
          const dir = `${pattern.slice(0, -2)}/${name}`;
          if (existsSync(join(root, dir, 'package.json'))) dirs.add(dir);
        }
      } else if (existsSync(join(root, pattern, 'package.json'))) dirs.add(pattern);
    }
    const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
    const importersBlock = lockfile.split(/^importers:/m)[1]?.split(/^\S/m)[0] ?? '';
    const importers = new Set([...importersBlock.matchAll(/^  (.+?):\s*(?:\{\})?$/gm)].map(m => m[1]));
    expect([...dirs].filter(dir => !importers.has(dir)).sort()).toEqual([]);
  });
});

describe('verify dirty preflight', () => {
  it('refuses before any work on an uncommitted tree and records UNCOMMITTED honestly', () => {
    const dir = temp();
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    for (const name of readdirSync(join(root, 'scripts'))) {
      if (name.endsWith('.mjs') || name === 'toolchain.json') copyFileSync(join(root, 'scripts', name), join(dir, 'scripts', name));
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fake-repo', private: true, scripts: { 'test:x': 'node -e "process.exit(0)"' } }));
    writeFileSync(join(dir, 'tracked.txt'), 'clean\n');
    const gitDir = dir.replace(/[\\/]+$/, '').replaceAll(String.fromCharCode(92), '/');
    const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${gitDir}`, '-c', 'user.email=kitchen@test.invalid', '-c', 'user.name=kitchen', ...args], { cwd: dir, encoding: 'utf8' });
    git(['init', '-q']);
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
    writeFileSync(join(dir, 'tracked.txt'), 'dirty\n');
    const run = spawnSync(process.execPath, [join(dir, 'scripts', 'verify.mjs'), '--only', '--db=none', 'test:x'], { cwd: dir, encoding: 'utf8', timeout: 60000 });
    const output = (run.stdout ?? '') + (run.stderr ?? '');
    expect(run.status).toBe(3);
    expect(output).toContain('UNCOMMITTED');
    expect(output).toContain('tracked.txt');
    const runsDir = join(dir, '.kitchen', 'runs');
    const [name] = readdirSync(runsDir);
    const summary = JSON.parse(readFileSync(join(runsDir, name!, 'summary.json'), 'utf8'));
    expect(summary.verdict).toBe('UNCOMMITTED');
    expect(summary.dirty).toBe(true);
    expect(summary.steps).toEqual([]);
    expect(summary.notRun).toContain('test:x');
  }, 90000);
});
