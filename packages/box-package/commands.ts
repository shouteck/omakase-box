import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { CommandCheck } from './agreement.js';
import type { PnpmInvocation } from './export.js';
import { declaredPnpmArgs, UnsafeInstall } from './install.js';
import { toPosix } from './selection.js';

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

export interface CheckRecord {
  readonly name: string;
  readonly tool: CommandCheck['tool'];
  readonly declaredArgv: readonly string[];
  readonly command: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly context: CheckContext;
  readonly role: 'guard' | 'outcome';
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

// Pinned tool resolution: 'node' is the running runtime (the declared toolchain's
// own interpreter on this host), 'pnpm' is the caller's pinned invocation, and
// 'tsc'/'vitest' run through it so the repo's lockfile picks the binary.
function toolCommand(check: CommandCheck, pnpm: PnpmInvocation): { command: string; args: string[] } {
  switch (check.tool) {
    case 'node': return { command: process.execPath, args: [...check.args] };
    case 'pnpm': return { command: pnpm.command, args: declaredPnpmArgs(pnpm, check.args) };
    case 'tsc':
    case 'vitest': return { command: pnpm.command, args: [...pnpm.args, 'exec', check.tool, ...check.args] };
  }
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

export function runDeclaredCheck(check: CommandCheck, root: string, pnpm: PnpmInvocation): CheckRecord {
  const rel = (target: string): string => { const offset = relative(realpathSync(root), target); return offset === '' ? '.' : toPosix(offset); };
  let resolved: { command: string; args: string[] };
  try {
    resolved = toolCommand(check, pnpm);
  } catch (error) {
    // A declared install that tries to re-enable lifecycle scripts is refused
    // before spawn: an 'error' record is the evidence, never a silent pass.
    if (error instanceof UnsafeInstall) {
      const cwd = containedCwd(root, check.cwd);
      return { name: check.name, tool: check.tool, declaredArgv: check.args, command: pnpm.command, argv: [], cwd: rel(cwd), context: check.context, role: check.role, exit: null, result: 'error', log: error.message, seconds: 0 };
    }
    throw error;
  }
  const cwd = containedCwd(root, check.cwd);
  const began = Date.now();
  const run = spawnSync(resolved.command, resolved.args, {
    cwd,
    encoding: 'utf8',
    timeout: check.timeoutMs,
    windowsHide: true
  });
  const seconds = (Date.now() - began) / 1000;
  const log = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().slice(-LOG_TAIL);
  let result: CheckResult;
  if (run.error !== undefined) result = (run.error as NodeJS.ErrnoException).code === 'ETIMEDOUT' || run.signal === 'SIGTERM' ? 'timeout' : 'error';
  else result = run.status === 0 ? 'pass' : 'fail';
  const detail = run.error !== undefined && result === 'error' ? `${run.error.message}\n${log}` : log;
  return {
    name: check.name,
    tool: check.tool,
    declaredArgv: check.args,
    command: resolved.command,
    argv: resolved.args,
    cwd: rel(cwd),
    context: check.context,
    role: check.role,
    exit: run.status,
    result,
    log: detail,
    seconds
  };
}

export function runDeclaredChecks(checks: readonly CommandCheck[], root: string, pnpm: PnpmInvocation, context: CheckContext): CheckRecord[] {
  return checks.filter(check => check.context === context).map(check => runDeclaredCheck(check, root, pnpm));
}
