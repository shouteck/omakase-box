import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportBox } from '../../../packages/box-package/index.js';
import type { ExportResult } from '../../../packages/box-package/index.js';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const FIXTURE = join(ROOT, 'examples', 'private-shop');
export const PNPM_CJS = join(ROOT, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
export const AGREEMENTS = join(FIXTURE, 'box-agreements');
export const CANARY_TOKENS = ['SYNTHETIC_PRIVATE', 'PRIVATE_ELIGIBILITY_CANARY', 'PRIVATE_SCORING_CANARY'];

const runDirectories: string[] = [];
export function runRoot(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `box-d21-${label}-`));
  runDirectories.push(dir);
  return dir;
}
process.once('exit', () => {
  for (const dir of runDirectories) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
});

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
  return exportBox({
    agreementPath,
    repoPath: repo ?? fixtureRepo().repo,
    outDir: outDir ?? join(runRoot('out'), 'box'),
    pnpm: { command: process.execPath, args: [PNPM_CJS] }
  });
}

export interface CleanRun { ok: boolean; steps: Array<{ command: string; code: number | null; output: string }> }

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
    const result = spawnSync(command, args, { cwd: dest, encoding: 'utf8', timeout: 300000 });
    steps.push({ command: `${command} ${args.join(' ')}`, code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.slice(0, 4000) });
    return result.status;
  };
  const pnpm = (args: string[]): number | null => step(process.execPath, [PNPM_CJS, ...args]);
  let ok = pnpm(['install', '--frozen-lockfile']) === 0;
  ok = pnpm(['exec', 'tsc', '--noEmit']) === 0 && ok;
  ok = pnpm(['exec', 'vitest', 'run', evaluatorCheck]) === 0 && ok;
  return { ok, steps };
}

export function requirePnpmTooling(): void {
  if (!existsSync(PNPM_CJS)) throw new Error('repository-local pnpm is unavailable');
}
