import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, realpathSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import type { CommandCheck, SetupCommand } from './agreement.js';
import { ExportFailed } from './errors.js';
import { toPosix } from './selection.js';

// Runs the agreement's declared setup commands and command checks. Commands are
// data parsed at the agreement boundary — an arbitrary program name or path,
// verbatim argv with no shell expansion, and a cwd that must resolve inside the
// context root on its canonical path. Every run records the exact resolved
// program, context and role, exit status, a bounded output tail and the elapsed
// seconds; a timeout or spawn failure is a named result, never a pass. Child
// environments are inherited (the tools need PATH/HOME) but nothing the runner
// emits includes environment data.

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

// The single documented launch rule, an operating-system fact rather than tool
// dispatch. A declared program is a spelled-out path that must exist, or a bare
// name searched on PATH (on Windows with each PATHEXT extension in turn).
// Whatever the name resolves to decides how it starts — never the name itself:
// on Windows a resolved .cmd/.bat command file is launched through
// `cmd.exe /d /s /c` with the resolved path and every argument in double
// quotes. An argument containing `"`, `%`, `!` or a line break cannot be
// carried on that command line and is refused as an unsafe launch case.
export function resolveProgram(program: string): ResolvedProgram {
  const candidates: string[] = [];
  const push = (base: string): void => {
    candidates.push(base);
    if (process.platform === 'win32' && !/\.[^\\/]+$/.test(base)) {
      for (const ext of pathExtensions()) candidates.push(base + ext);
    }
  };
  if (isAbsolute(program) || program.includes('/') || program.includes('\\')) push(resolve(program));
  else for (const dir of (process.env.PATH ?? '').split(delimiter)) { if (dir !== '') push(join(dir, program)); }
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return { path: candidate, kind: COMMAND_FILE.test(candidate) ? 'command-file' : 'executable' };
    }
  }
  throw new ProgramUnavailable(program);
}

// Every declared program — setup, checks and solver prerequisites — must
// resolve before the first command executes anywhere, so a missing program is
// named with no earlier setup side effect having run.
export function preflightPrograms(agreement: { readonly setup: readonly SetupCommand[]; readonly commands: readonly CommandCheck[]; readonly requires: readonly { readonly program: string }[] }): void {
  const declared = [...agreement.setup.map(command => command.program), ...agreement.commands.map(command => command.program), ...agreement.requires.map(tool => tool.program)];
  const missing = [...new Set(declared)].filter(program => {
    try { resolveProgram(program); return false; }
    catch (error) { if (error instanceof ProgramUnavailable) return true; throw error; }
  });
  if (missing.length > 0) throw new ProgramUnavailable(missing.join(', '));
}

function launch(resolved: ResolvedProgram, args: readonly string[], cwd: string, timeoutMs: number) {
  if (resolved.kind === 'command-file') {
    if (process.platform !== 'win32') throw new ProgramLaunchUnsupported(`command file ${resolved.path} can only be launched on Windows`);
    for (const token of [resolved.path, ...args]) {
      if (/["%!\r\n]/.test(token)) throw new ProgramLaunchUnsupported(`argument ${JSON.stringify(token)} cannot be carried to a Windows command file: '"', '%', '!' and line breaks are refused`);
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

export function runDeclaredCheck(check: SetupCommand | CommandCheck, root: string): CheckRecord {
  const role: CommandRole = 'role' in check ? check.role : 'setup';
  const rel = (target: string): string => { const offset = relative(realpathSync(root), target); return offset === '' ? '.' : toPosix(offset); };
  const cwd = containedCwd(root, check.cwd);
  let resolved: ResolvedProgram;
  let run: ReturnType<typeof launch>;
  const began = Date.now();
  try {
    resolved = resolveProgram(check.program);
    run = launch(resolved, check.args, cwd, check.timeoutMs);
  } catch (error) {
    // A program that cannot be found or launched safely is a named 'error'
    // record — the evidence, never a silent pass and never a red outcome.
    if (error instanceof ProgramUnavailable || error instanceof ProgramLaunchUnsupported) {
      return { name: check.name, program: check.program, declaredArgv: check.args, command: check.program, argv: [], cwd: rel(cwd), context: check.context, role, exit: null, result: 'error', log: error instanceof Error ? error.message : String(error), seconds: (Date.now() - began) / 1000 };
    }
    throw error;
  }
  const seconds = (Date.now() - began) / 1000;
  const log = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().slice(-LOG_TAIL);
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
    seconds
  };
}

export function runSetup(setup: readonly SetupCommand[], root: string, context: CheckContext): CheckRecord[] {
  return setup.filter(command => command.context === context).map(command => runDeclaredCheck(command, root));
}

export function runDeclaredChecks(checks: readonly CommandCheck[], root: string, context: CheckContext): CheckRecord[] {
  return checks.filter(check => check.context === context).map(check => runDeclaredCheck(check, root));
}
