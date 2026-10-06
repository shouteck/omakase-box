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
// tree is where lifecycle scripts would run. Includes install-adjacent
// aliases (it/install-test, ln/link, rb) and other dependency-mutating
// commands (dedupe, prune, deploy).
const INSTALL_VERBS = new Set([
  'install', 'i', 'it', 'install-test', 'add', 'update', 'up', 'dedupe',
  'remove', 'rm', 'uninstall', 'rebuild', 'rb', 'import', 'fetch', 'create',
  'dlx', 'ln', 'link', 'prune', 'deploy', 'patch-commit', 'store', 'server'
]);

// Declared `pnpm` verbs that are safe to run verbatim: they never resolve or
// mutate the dependency tree. This allowlist, not INSTALL_VERBS, is the
// fail-closed boundary — a verb absent from BOTH sets is refused before
// spawn, so a new/alias pnpm command can never reach a child process
// without --ignore-scripts by accident.
const SAFE_VERBS = new Set([
  'exec', 'e', 'run', 'run-script', 'test', 't', 'start', 'list', 'ls', 'la',
  'll', 'why', 'outdated', 'audit', 'info', 'view', 'version', 'bin', 'root',
  'env', 'config', 'help', 'licenses', 'cat-file', 'cat-index', 'find-hash',
  'patch', 'publish', 'pack', 'self-update', 'setup', 'init', 'doctor'
]);

// Leading pnpm options that consume the NEXT argv token as their value; they
// must be skipped while locating the verb or a value would hide the command.
const VALUE_OPTIONS = new Set([
  '--dir', '-C', '--config', '--filter', '-F', '--filter-prod', '--store-dir',
  '--global-dir', '--modules-dir', '--virtual-store-dir', '--reporter',
  '--registry', '--workspace-packages', '--loglevel', '--package-import-method'
]);

// Leading pnpm options that take no value; recognised booleans pass through.
// A bare unknown `--flag` before the verb is refused: it may take a value,
// which would make the real verb unlocatable.
const BOOLEAN_OPTIONS = new Set([
  '--version', '-v', '--help', '-h', '-r', '--recursive', '--workspace-root',
  '--ignore-scripts',
  '--color', '--no-color', '--silent', '-s', '--quiet', '-q', '--stream',
  '--aggregate-output', '--parseable', '--json', '--long'
]);

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

// Locates the declared pnpm verb: the first non-dash token after the caller
// prefix, skipping recognised value options. Throws UnsafeInstall on an
// ambiguous leading option (unknown bare flags may hide the verb).
function declaredVerb(argv: readonly string[], startIndex: number): string | undefined {
  for (let index = startIndex; index < argv.length; index++) {
    const raw = argv[index];
    if (raw === undefined) break;
    if (!raw.startsWith('-')) return raw;
    if (raw.includes('=')) continue; // --opt=value is self-contained
    if (VALUE_OPTIONS.has(raw)) { index++; continue; } // --opt value
    if (BOOLEAN_OPTIONS.has(raw)) continue;
    throw new UnsafeInstall(`ambiguous leading pnpm option '${raw}': cannot locate the declared verb`);
  }
  return undefined; // `pnpm --version`-style: no verb, nothing installs
}

// Declared `pnpm` command checks: unsafe flags are refused on EVERY pnpm call
// (a non-install command must not hide a lifecycle override). The grammar is
// fail-closed, not a growing denylist: verbs in SAFE_VERBS pass verbatim,
// install-like verbs gain --ignore-scripts, and ANY unknown verb is refused
// before spawn so new pnpm install aliases cannot slip through.
export function declaredPnpmArgs(pnpm: PnpmInvocation, checkArgs: readonly string[]): string[] {
  scanPnpmArgv([...pnpm.args, ...checkArgs]); // refuses lifecycle/config overrides everywhere
  const verb = declaredVerb(checkArgs, 0);
  if (verb === undefined) return [...pnpm.args, ...checkArgs];
  if (INSTALL_VERBS.has(verb)) return enforcedInstallArgs([...pnpm.args, ...checkArgs]);
  if (!SAFE_VERBS.has(verb)) throw new UnsafeInstall(`unsupported declared pnpm verb '${verb}': not provably script-safe`);
  return [...pnpm.args, ...checkArgs];
}
