import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, realpathSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import type { CommandCheck, SetupCommand } from './agreement.js';
import { ExportFailed } from './errors.js';
import { toPosix } from './paths.js';

// Runs the agreement's declared command checks. Commands are data parsed at the
// agreement boundary — a pinned tool (node, pnpm, tsc, vitest via the declared
// pnpm toolchain), verbatim argv with no shell expansion, and a cwd that must
// resolve inside the context root on its canonical path. Every run records the
// exact command, context and role, exit status, a bounded output tail and the
// elapsed seconds; a timeout or spawn failure is a named result, never a pass.
// Child environments are inherited (the tools need PATH/HOME) but nothing the
// runner emits includes environment data.

export type CheckContext = 'owner' | 'recipient';
export type CheckResult = 'pass' | 'fail' | 'timeout' | 'error';
export type CommandRole = 'setup' | 'guard' | 'outcome';

export interface CheckRecord {
  readonly name: string;
  readonly program: string;
  readonly declaredArgv: readonly string[];
  readonly command: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly context: CheckContext;
  readonly role: CommandRole;
  readonly exit: number | null;
  readonly result: CheckResult;
  readonly log: string;
  readonly outputSha256: string;
  readonly seconds: number;
}

const LOG_TAIL = 4000;

// A disposable clone carries tracked files only; the pinned local toolchain
// (scripts/tooling, e.g. the repository-local pnpm bundle) is installed, not
// committed. Declared checks run with the same pinned tools the worktree has:
// if the owner repo has a scripts/tooling directory it is copied into the clone
// before any command executes. This is toolchain materialization, not source —
// it changes nothing the commands measure.
export function materializeTooling(repo: string, clone: string): void {
  const source = join(repo, 'scripts', 'tooling');
  if (existsSync(source)) cpSync(source, join(clone, 'scripts', 'tooling'), { recursive: true });
}

export class ProgramUnavailable extends ExportFailed {
  constructor(readonly program: string) {
    super(`declared program '${program}' is not available: it is not on PATH and not an existing path`);
    this.name = 'ProgramUnavailable';
  }
}

export class ProgramLaunchUnsupported extends ExportFailed {
  constructor(detail: string) {
    super(`declared program cannot be launched safely: ${detail}`);
    this.name = 'ProgramLaunchUnsupported';
  }
}

interface ResolvedProgram { readonly path: string; readonly kind: 'executable' | 'command-file' }
const COMMAND_FILE = /\.(cmd|bat)$/i;
const pathExtensions = (): string[] => (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map(ext => ext.toLowerCase()).filter(ext => ext !== '');

export function resolveProgram(program: string, root?: string): ResolvedProgram {
  const candidates: string[] = [];
  const push = (base: string): void => {
    candidates.push(base);
    if (process.platform === 'win32' && !/\.[^\\/]+$/.test(base)) {
      for (const ext of pathExtensions()) candidates.push(base + ext);
    }
  };
  if (isAbsolute(program)) push(resolve(program));
  else if (program.includes('/') || program.includes('\\')) push(resolve(root ?? process.cwd(), program));
  else for (const dir of (process.env.PATH ?? '').split(delimiter)) { if (dir !== '') push(join(dir, program)); }
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      if (root !== undefined && !isAbsolute(program) && (program.includes('/') || program.includes('\\'))) {
        const canonicalRoot = realpathSync(root);
        const offset = relative(canonicalRoot, realpathSync(candidate));
        if (offset === '' || offset.startsWith('..') || isAbsolute(offset)) {
          throw new ProgramLaunchUnsupported(`declared program path '${program}' resolves outside the context root`);
        }
      }
      return { path: candidate, kind: COMMAND_FILE.test(candidate) ? 'command-file' : 'executable' };
    }
  }
  throw new ProgramUnavailable(program);
}

export function preflightPrograms(agreement: { readonly setup: readonly SetupCommand[]; readonly commands: readonly CommandCheck[]; readonly requires: readonly { readonly program: string }[] }, root?: string): void {
  const declared = [...agreement.setup.map(command => command.program), ...agreement.commands.map(command => command.program), ...agreement.requires.map(tool => tool.program)];
  const missing = [...new Set(declared)].filter(program => {
    try { resolveProgram(program, root); return false; }
    catch (error) { if (error instanceof ProgramUnavailable) return true; throw error; }
  });
  if (missing.length > 0) throw new ProgramUnavailable(missing.join(', '));
}

function launch(resolved: ResolvedProgram, args: readonly string[], cwd: string, timeoutMs: number) {
  if (resolved.kind === 'command-file') {
    if (process.platform !== 'win32') throw new ProgramLaunchUnsupported(`command file ${resolved.path} can only be launched on Windows`);
    for (const token of [resolved.path, ...args]) {
      if (/["%!\r\n]/.test(token)) throw new ProgramLaunchUnsupported(`argument ${JSON.stringify(token)} cannot be carried to a Windows command file: '"', '%', '!' and line breaks are refused`);
      if (/\\$/.test(token)) throw new ProgramLaunchUnsupported(`argument ${JSON.stringify(token)} cannot be carried to a Windows command file: a trailing backslash would escape the closing quote and merge the next argument`);
    }
    const line = `"${[resolved.path, ...args].map(token => `"${token}"`).join(' ')}"`;
    return spawnSync('cmd.exe', ['/d', '/s', '/c', line], { cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, windowsVerbatimArguments: true });
  }
  return spawnSync(resolved.path, [...args], { cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
}

export class CheckOutsideRoot extends Error {
  constructor(readonly path: string) {
    super(`declared check cwd ${path} resolves outside the context root`);
    this.name = 'CheckOutsideRoot';
  }
}

function containedCwd(root: string, cwd: string): string {
  const canonicalRoot = realpathSync(root);
  const target = realpathSync(resolve(canonicalRoot, cwd === '.' ? '' : cwd));
  const offset = relative(canonicalRoot, target);
  if (offset !== '' && (offset.startsWith('..') || isAbsolute(offset))) throw new CheckOutsideRoot(cwd);
  return target;
}

// Normalise timing-variable content for stable cross-run comparison:
// test durations, start times and elapsed times change every run even
// when the check itself is identical.  Only the digest (outputSha256)
// uses this — the raw log is unchanged.
function normaliseTimings(text: string): string {
  return text
    .replace(/\b\d+ms\b/g, 'Nms')
    .replace(/\b\d+\.\d+s\b/g, 'N.Ns')
    .replace(/\bStart at \d+:\d+:\d+/g, 'Start at HH:MM:SS')
    .replace(/Duration \d+\.?\d*s/g, m => m.replace(/\d+\.?\d*/g, 'N'));
}

export function runDeclaredCheck(check: SetupCommand | CommandCheck, root: string): CheckRecord {
  const role: CommandRole = 'role' in check ? check.role : 'setup';
  const canonicalRoot = realpathSync(root);
  const rel = (target: string): string => { const offset = relative(canonicalRoot, target); return offset === '' ? '.' : toPosix(offset); };
  const normalize = (text: string): string => {
    let out = text.replace(/\r\n/g, '\n');
    for (const spelling of new Set([canonicalRoot, toPosix(canonicalRoot)])) if (spelling !== '') out = out.split(spelling).join('<root>');
    return out;
  };
  const digest = (stdout: string, stderr: string): string => {
    const normalised = (text: string): string => normaliseTimings(normalize(text));
    return createHash('sha256').update(JSON.stringify([normalised(stdout), normalised(stderr)])).digest('hex');
  };
  const cwd = containedCwd(canonicalRoot, check.cwd);
  let resolved: ResolvedProgram;
  let run: ReturnType<typeof launch>;
  const began = Date.now();
  try {
    resolved = resolveProgram(check.program, canonicalRoot);
    run = launch(resolved, check.args, cwd, check.timeoutMs);
  } catch (error) {
    if (error instanceof ProgramUnavailable || error instanceof ProgramLaunchUnsupported) {
      const message = error instanceof Error ? error.message : String(error);
      return { name: check.name, program: check.program, declaredArgv: check.args, command: check.program, argv: [], cwd: rel(cwd), context: check.context, role, exit: null, result: 'error', log: message, outputSha256: digest(message, ''), seconds: (Date.now() - began) / 1000 };
    }
    throw error;
  }
  const seconds = (Date.now() - began) / 1000;
  const stdout = run.stdout ?? '';
  const stderr = run.stderr ?? '';
  const log = `${normalize(stdout)}${normalize(stderr)}`.trim().slice(-LOG_TAIL);
  let result: CheckResult;
  if (run.error !== undefined) result = (run.error as NodeJS.ErrnoException).code === 'ETIMEDOUT' || run.signal === 'SIGTERM' ? 'timeout' : 'error';
  else result = run.status === 0 ? 'pass' : 'fail';
  const detail = run.error !== undefined && result === 'error' ? `${run.error.message}\n${log}` : log;
  return {
    name: check.name,
    program: check.program,
    declaredArgv: check.args,
    command: resolved.path,
    argv: [...check.args],
    cwd: rel(cwd),
    context: check.context,
    role,
    exit: run.status,
    result,
    log: detail,
    outputSha256: digest(stdout, stderr),
    seconds
  };
}

export function runSetup(setup: readonly SetupCommand[], root: string, context: CheckContext): CheckRecord[] {
  return setup.filter(command => command.context === context).map(command => runDeclaredCheck(command, root));
}

export function runDeclaredChecks(checks: readonly CommandCheck[], root: string, context: CheckContext): CheckRecord[] {
  return checks.filter(check => check.context === context).map(check => runDeclaredCheck(check, root));
}
