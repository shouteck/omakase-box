import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportBox } from '../../../packages/box-package/index.js';
import type { ExportResult } from '../../../packages/box-package/index.js';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const FIXTURE = join(ROOT, 'examples', 'private-shop');
export const PNPM_CJS = join(ROOT, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
export const PNPM_SHIM = join(ROOT, 'tests', 'box', 'package', 'pnpm-shim.mjs');
export const AGREEMENTS = join(FIXTURE, 'box-agreements');
export const CANARY_TOKENS = ['SYNTHETIC_PRIVATE', 'PRIVATE_ELIGIBILITY_CANARY', 'PRIVATE_SCORING_CANARY'];
export const STATS_FILE = join(tmpdir(), `box-k6-stats-${process.pid}.jsonl`);
export function recordOp(op: string, seconds?: number): void {
  try { appendFileSync(STATS_FILE, JSON.stringify({ op, seconds }) + '\n'); } catch { }
}

const runDirectories: string[] = [];
export function runRoot(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `box-d21-${label}-`));
  runDirectories.push(dir);
  return dir;
}
process.once('exit', () => {
  for (const dir of runDirectories) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
});

// K6 trust boundary: lockfile reuse is invocation-local and owned here. An
// inherited caller cache dir is deleted outright so nothing forwards it to a
// child process. The committed pnpm-shim.mjs never caches; this invocation
// materializes its own copy inside a fresh run root, and only that copy gets a
// sibling `pnpm-shim.cachedir` naming a directory this invocation created.
// Uncached mode writes no cachedir file, so every resolution is real.
delete process.env.BOX_K6_LOCKFILE_CACHE;
let invocationShim: string | undefined;
function lockfileShim(): string {
  if (invocationShim === undefined) {
    const dir = runRoot('lockfile-shim');
    invocationShim = join(dir, 'pnpm-shim.mjs');
    cpSync(PNPM_SHIM, invocationShim);
    if (process.env.K6_LOCKFILE_MODE !== 'uncached') {
      writeFileSync(join(dir, 'pnpm-shim.cachedir'), join(runRoot('lockfile-cache'), 'cache') + '\n');
    }
  }
  return invocationShim;
}

export function listFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = join(current, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(target); continue; }
      files.push(relative(dir, target).split(sep).join('/'));
    }
  };
  walk(dir);
  return files.sort();
}

export function privateByteLeaks(dir: string): string[] {
  const leaks: string[] = [];
  for (const file of listFiles(dir)) {
    const text = readFileSync(join(dir, file), 'utf8');
    if (CANARY_TOKENS.some(token => text.includes(token)) || text.includes('src/private/')) leaks.push(file);
  }
  return leaks;
}

export interface FixtureRepo { repo: string; baseCommit: string }
export function fixtureGit(repo: string, args: string[]): string {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}
export function fixtureCommit(repo: string, message: string): string {
  fixtureGit(repo, ['add', '-A']);
  fixtureGit(repo, ['-c', 'user.name=box-fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', message]);
  return fixtureGit(repo, ['rev-parse', 'HEAD']);
}

// Materializes an isolated owner repository: a real git repo in the OS temp directory whose
// tree is the private-shop fixture (minus build/install output). The exporter sees exactly
// what a real owner repo looks like - a base commit it can pin and a clean tree to copy.
export function materializeFixtureRepo(): FixtureRepo {
  const repo = join(runRoot('repo'), 'owner-repo');
  const target = join(repo, 'examples', 'private-shop');
  mkdirSync(target, { recursive: true });
  const copy = (from: string, to: string): void => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (['node_modules', 'dist'].includes(entry.name)) continue;
      const source = join(from, entry.name);
      const dest = join(to, entry.name);
      if (entry.isDirectory()) { mkdirSync(dest, { recursive: true }); copy(source, dest); }
      else cpSync(source, dest);
    }
  };
  copy(FIXTURE, target);
  fixtureGit(repo, ['init', '-b', 'main']);
  return { repo, baseCommit: fixtureCommit(repo, 'private-shop-before-v1') };
}

let shared: FixtureRepo | undefined;
export function fixtureRepo(): FixtureRepo {
  return shared ??= materializeFixtureRepo();
}

// An installable owner workspace for D3.1 verify tests: the same fixture tree under
// examples/private-shop, plus the smallest honest pnpm workspace around it (root
// package.json, workspace file, tsconfig, .gitignore). pnpm install runs once here so
// the committed tree carries a real lockfile — verify's scratch clone then runs its
// own `install --frozen-lockfile`, `tsc --noEmit` and `vitest` exactly as it does in
// the real repository. Toolchain versions mirror the repo's declared toolchain.
export function materializeOwnerRepo(): FixtureRepo {
  const repo = join(runRoot('owner'), 'owner-repo');
  const write = (rel: string, content: string): void => {
    const target = join(repo, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  write('package.json', JSON.stringify({
    name: 'owner-repo', version: '0.0.0', private: true, type: 'module',
    devDependencies: { typescript: '6.0.3', vitest: '5.0.1', vite: '8.3.1', '@types/node': '24.13.6', '@types/react': '19.3.0', '@types/react-dom': '19.3.0' }
  }, null, 2) + '\n');
  write('pnpm-workspace.yaml', 'packages:\n  - examples/*\n');
  write('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
      noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true,
      jsx: 'react-jsx', esModuleInterop: true, skipLibCheck: true, noEmit: true,
      types: ['node', 'react', 'react-dom']
    },
    include: ['examples/**/*.ts', 'examples/**/*.tsx', 'tests/**/*.ts'],
    exclude: ['node_modules', '**/dist']
  }, null, 2) + '\n');
  write('.gitignore', 'node_modules/\ndist/\n');
  // The fixture's vite.config.ts imports this repo-level helper; the owner
  // workspace must carry it for `tsc --noEmit` to mean what it means upstream.
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'scripts', 'vite-safety.ts'), join(repo, 'scripts', 'vite-safety.ts'));
  const target = join(repo, 'examples', 'private-shop');
  mkdirSync(target, { recursive: true });
  const copy = (from: string, to: string): void => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (['node_modules', 'dist'].includes(entry.name)) continue;
      const source = join(from, entry.name);
      const dest = join(to, entry.name);
      if (entry.isDirectory()) { mkdirSync(dest, { recursive: true }); copy(source, dest); }
      else cpSync(source, dest);
    }
  };
  copy(FIXTURE, target);
  const installBegan = Date.now();
  const install = spawnSync(process.execPath, [PNPM_CJS, 'install'], { cwd: repo, encoding: 'utf8', timeout: 300000 });
  recordOp('owner-install', (Date.now() - installBegan) / 1000);
  if (install.status !== 0) throw new Error(`owner fixture install failed: ${install.stderr ?? install.stdout}`);
  fixtureGit(repo, ['init', '-b', 'main']);
  return { repo, baseCommit: fixtureCommit(repo, 'private-shop-before-v1') };
}

let sharedOwner: FixtureRepo | undefined;
export function ownerRepo(): FixtureRepo {
  return sharedOwner ??= materializeOwnerRepo();
}

export interface AgreementOverrides { baseCommit?: string | null; mutate?: (agreement: Record<string, unknown>) => void }
export function agreementFile(name: 'request-a' | 'request-b', overrides: AgreementOverrides = {}): string {
  const agreement = JSON.parse(readFileSync(join(AGREEMENTS, `${name}.json`), 'utf8')) as Record<string, unknown>;
  if (overrides.baseCommit === null) delete agreement.baseCommit;
  else agreement.baseCommit = overrides.baseCommit ?? fixtureRepo().baseCommit;
  overrides.mutate?.(agreement);
  const path = join(runRoot('agreement'), `${name}-${runDirectories.length}.json`);
  writeFileSync(path, JSON.stringify(agreement, null, 2));
  return path;
}

export function runExport(agreementPath: string, repo?: string, outDir?: string): ExportResult {
  const began = Date.now();
  try {
    return exportBox({
      agreementPath,
      repoPath: repo ?? fixtureRepo().repo,
      outDir: outDir ?? join(runRoot('out'), 'box'),
      pnpm: { command: process.execPath, args: [lockfileShim(), PNPM_CJS] }
    });
  } finally {
    recordOp('export', (Date.now() - began) / 1000);
  }
}

export interface CleanRun { ok: boolean; steps: Array<{ command: string; code: number | null; output: string; seconds: number }> }

// The packaging proof: copy the produced folder into a clean directory outside the repo,
// install only from its own lockfile, and run its declared checks. The temp directory is
// under the OS temp root, so module resolution can never climb into the owner checkout.
export function cleanCheck(boxDir: string, evaluatorCheck: string): CleanRun {
  const dest = join(runRoot('clean'), 'box');
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(boxDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    cpSync(join(boxDir, entry.name), join(dest, entry.name), { recursive: true });
  }
  const steps: CleanRun['steps'] = [];
  const step = (command: string, args: string[]): number | null => {
    const began = Date.now();
    const result = spawnSync(command, args, { cwd: dest, encoding: 'utf8', timeout: 300000 });
    steps.push({ command: `${command} ${args.join(' ')}`, code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.slice(0, 4000), seconds: (Date.now() - began) / 1000 });
    return result.status;
  };
  const pnpm = (op: string, args: string[]): number | null => {
    const code = step(process.execPath, [PNPM_CJS, ...args]);
    recordOp(op, steps.at(-1)?.seconds);
    return code;
  };
  let ok = pnpm('box-install', ['install', '--frozen-lockfile']) === 0;
  ok = pnpm('box-typecheck', ['exec', 'tsc', '--noEmit']) === 0 && ok;
  ok = pnpm('box-suite', ['exec', 'vitest', 'run', evaluatorCheck]) === 0 && ok;
  return { ok, steps };
}

export function requirePnpmTooling(): void {
  if (!existsSync(PNPM_CJS)) throw new Error('repository-local pnpm is unavailable');
}

// Copies an exported Box into a fresh directory outside the repo and hands it to the
// emitted submit tool exactly as a recipient would: plain `node box/submit.mjs`, no
// box-cli, no repository.
export function copyBox(boxDir: string, label = 'worked'): string {
  const dest = join(runRoot(label), 'box');
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(boxDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    cpSync(join(boxDir, entry.name), join(dest, entry.name), { recursive: true });
  }
  return dest;
}

export interface SubmitRun { readonly status: number | null; readonly stdout: string; readonly stderr: string }
export function runSubmitTool(dir: string, outArg?: string): SubmitRun {
  const args = [join(dir, 'box', 'submit.mjs'), ...(outArg !== undefined ? [outArg] : [])];
  const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
