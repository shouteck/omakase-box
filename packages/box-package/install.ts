import { ExportFailed } from './errors.js';
import type { PnpmInvocation } from './export.js';

// The single product-controlled install boundary. Every dependency install the
// product spawns — export's lockfile resolution and base/recipient installs,
// owner verify's scratch install, and declared `pnpm` checks — goes through
// here. The scan is a conservative grammar over the WHOLE effective argv, not a
// first-token heuristic: an install verb anywhere (`--dir /tmp install`, a flag
// value containing an install-word segment) forces --ignore-scripts, and any
// config/flag that could re-enable lifecycle execution is refused before
// anything spawns. No caller override, no unsafe fallback.
export const IGNORE_SCRIPTS = '--ignore-scripts';

// Install-like pnpm subcommands: anything that resolves or links a dependency
// tree is where lifecycle scripts would run.
const INSTALL_VERBS = new Set(['install', 'i', 'add', 'update', 'up', 'remove', 'rm', 'uninstall', 'rebuild', 'import', 'fetch', 'create', 'dlx']);

// Any token mentioning a lifecycle/config switch is refused outright (the one
// allowed token is the exact literal '--ignore-scripts'). This covers
// --no-ignore-scripts, --ignore-scripts=*, --config X / --config=X /
// --config.X=* and dangerously-allow-all-builds in every spelling, wherever the
// token sits — caller prefix or declared args alike.
const UNSAFE_FLAG = /^--config([.=]|$)|ignore-scripts|dangerously-allow-all-builds|enable-pre-post-scripts/i;

export class UnsafeInstall extends ExportFailed {
  constructor(detail: string) {
    super(`install refused: ${detail}`);
    this.name = 'UnsafeInstall';
  }
}

// Scans the effective argv, throwing UnsafeInstall on any lifecycle-enabling or
// ambiguous flag, and returns whether the command is install-like.
export function scanPnpmArgv(argv: readonly string[]): boolean {
  let installLike = false;
  for (const [index, raw] of argv.entries()) {
    if (!raw.startsWith('-')) {
      if (INSTALL_VERBS.has(raw)) installLike = true;
      continue;
    }
    if (raw === IGNORE_SCRIPTS) {
      const next = argv[index + 1];
      if (next === 'false' || next === 'true') throw new UnsafeInstall(`ambiguous value '${next}' after ${IGNORE_SCRIPTS}`);
      continue;
    }
    if (UNSAFE_FLAG.test(raw)) throw new UnsafeInstall(`lifecycle/config override flag in invocation: ${raw}`);
    const eq = raw.indexOf('=');
    if (eq > 0 && raw.slice(eq + 1).split(/[\/]/).some(segment => INSTALL_VERBS.has(segment))) installLike = true;
  }
  return installLike;
}

export function isInstallLike(argv: readonly string[]): boolean {
  return scanPnpmArgv(argv);
}

// Returns argv guaranteed script-safe: --ignore-scripts appended when absent.
// Throws UnsafeInstall when argv tries to re-enable lifecycle execution.
export function enforcedInstallArgs(argv: readonly string[]): string[] {
  scanPnpmArgv(argv);
  return argv.includes(IGNORE_SCRIPTS) ? [...argv] : [...argv, IGNORE_SCRIPTS];
}

// Product-spawned installs: caller prefix plus the operation, enforced as one —
// always install-like, always enforced.
export function productInstallArgs(pnpm: PnpmInvocation, args: readonly string[]): string[] {
  return enforcedInstallArgs([...pnpm.args, ...args]);
}

// Declared `pnpm` command checks: unsafe flags are refused on EVERY pnpm call
// (a non-install command must not hide a lifecycle override), and an
// install-like declared command additionally gains --ignore-scripts.
export function declaredPnpmArgs(pnpm: PnpmInvocation, checkArgs: readonly string[]): string[] {
  const argv = [...pnpm.args, ...checkArgs];
  return scanPnpmArgv(argv) ? enforcedInstallArgs(argv) : argv;
}
