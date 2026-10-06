import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { CommandCheck } from './agreement.js';
import type { PnpmInvocation } from './export.js';
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

// Pinned tool resolution: 'node' is the running runtime (the declared toolchain's
// own interpreter on this host), 'pnpm' is the caller's pinned invocation, and
// 'tsc'/'vitest' run through it so the repo's lockfile picks the binary.
function toolCommand(check: CommandCheck, pnpm: PnpmInvocation): { command: string; args: string[] } {
  switch (check.tool) {
    case 'node': return { command: process.execPath, args: [...check.args] };
    case 'pnpm': return { command: pnpm.command, args: [...pnpm.args, ...check.args] };
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
  const resolved = toolCommand(check, pnpm);
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
  const rel = relative(realpathSync(root), cwd);
  return {
    name: check.name,
    tool: check.tool,
    declaredArgv: check.args,
    command: resolved.command,
    argv: resolved.args,
    cwd: rel === '' ? '.' : toPosix(rel),
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
