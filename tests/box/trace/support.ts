import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll } from 'vitest';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const FIXTURE = join(ROOT, 'examples', 'c1-py-trace');
// The CLI is exercised through its real built entrypoint — verify's `build`
// step runs before suites, and `node scripts/workspace.mjs build` refreshes
// it during the inner loop.
export const CLI = join(ROOT, 'packages', 'box-cli', 'dist', 'cli.js');
export function requireCli(): void {
  if (!existsSync(CLI)) throw new Error('packages/box-cli/dist/cli.js is missing — run `node scripts/workspace.mjs build` first');
}

const runDirectories: string[] = [];
export function runRoot(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `box-c1-${label}-`));
  runDirectories.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of runDirectories.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
});

// The plain run this wave is compared against: the same command without tracing.
export function plainRun(args: string[]): { status: number | null; seconds: number; output: string } {
  const began = Date.now();
  const run = spawnSync('python', args, { cwd: FIXTURE, encoding: 'utf8', timeout: 120000 });
  return { status: run.status, seconds: (Date.now() - began) / 1000, output: `${run.stdout ?? ''}${run.stderr ?? ''}` };
}

export interface CliRun { status: number | null; stdout: string; stderr: string; earlyAt: number | null; exitedAt: number; seconds: number }

// Runs the real CLI source (Node 24 strips types) so the suite exercises the
// `box trace` command line itself, not only the library. earlyAt records when
// the first stdout chunk arrived — the streaming check needs it before exit.
export function runCli(args: string[], cwd = FIXTURE): Promise<CliRun> {
  requireCli();
  return new Promise((resolveRun) => {
    const began = Date.now();
    const child = spawn(process.execPath, [CLI, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let earlyAt: number | null = null;
    child.stdout.on('data', chunk => {
      earlyAt ??= Date.now();
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', () => resolveRun({ status: null, stdout, stderr, earlyAt, exitedAt: Date.now(), seconds: (Date.now() - began) / 1000 }));
    child.on('exit', code => resolveRun({ status: code, stdout, stderr, earlyAt, exitedAt: Date.now(), seconds: (Date.now() - began) / 1000 }));
  });
}

export function readTrace(outDir: string): {
  schemaVersion: number;
  command: { argv: string[]; display: string; cwd: string; exitCode: number | null };
  seconds: number;
  repository: { root: string; commit: string | null };
  interpreters: Array<{ executable: string; version: string }>;
  processes: number;
  pids: number[];
  files: Array<{ path: string; kind: string }>;
  functions: Array<{ path: string; start: number; end: number; label: string; kind: string; order: number; pid: number }>;
  unseen: string[];
  warnings: string[];
} {
  return JSON.parse(readFileSync(join(outDir, 'trace.json'), 'utf8'));
}
