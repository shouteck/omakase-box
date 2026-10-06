import { ExportFailed } from './errors.js';
import type { PnpmInvocation } from './export.js';

// The single product-controlled install boundary. Every dependency install the
// product spawns — export's lockfile resolution and base/recipient installs,
// owner verify's scratch install, and declared `pnpm` checks that are installs —
// goes through here and carries --ignore-scripts, so upstream lifecycle scripts
// never execute. There is no caller override and no unsafe fallback: an
// invocation (caller prefix or agreement argv) carrying a flag that re-enables
// lifecycle execution is refused before anything spawns.
export const IGNORE_SCRIPTS = '--ignore-scripts';

// Install-like pnpm subcommands: anything that resolves or links a dependency
// tree is where lifecycle scripts would run.
const INSTALL_VERBS = new Set(['install', 'i', 'add', 'update', 'up', 'remove', 'rm', 'uninstall', 'rebuild', 'import', 'fetch', 'create', 'dlx']);

// Flags that would re-enable lifecycle or build-script execution.
const SCRIPT_ENABLING = /^--(no-ignore-scripts|ignore-scripts=false|enable-pre-post-scripts|dangerously-allow-all-builds(=.*)?|config\.(ignore-scripts|dangerously-allow-all-builds|enable-pre-post-scripts)=)/;

export class UnsafeInstall extends ExportFailed {
  constructor(detail: string) {
    super(`install refused: ${detail}`);
    this.name = 'UnsafeInstall';
  }
}

const firstVerb = (argv: readonly string[]): string | undefined => argv.find(arg => !arg.startsWith('-'));
export const isInstallLike = (argv: readonly string[]): boolean => INSTALL_VERBS.has(firstVerb(argv) ?? '');

// Returns argv guaranteed script-safe: --ignore-scripts appended when absent
// (a later duplicate is harmless; pnpm honors the flag anywhere). Throws
// UnsafeInstall when argv tries to re-enable lifecycle execution — checking the
// whole effective argv means a hostile --pnpm prefix cannot slip one past.
export function enforcedInstallArgs(argv: readonly string[]): string[] {
  const unsafe = argv.filter(arg => SCRIPT_ENABLING.test(arg));
  if (unsafe.length > 0) throw new UnsafeInstall(`lifecycle-enabling flag(s) in invocation: ${unsafe.join(', ')}`);
  return argv.includes(IGNORE_SCRIPTS) ? [...argv] : [...argv, IGNORE_SCRIPTS];
}

// Product-spawned installs: caller prefix plus the operation, enforced as one.
export function productInstallArgs(pnpm: PnpmInvocation, args: readonly string[]): string[] {
  return enforcedInstallArgs([...pnpm.args, ...args]);
}

// Declared `pnpm` command checks: an install-like declared command is forced
// safe the same way; anything else passes through verbatim.
export function declaredPnpmArgs(pnpm: PnpmInvocation, checkArgs: readonly string[]): string[] {
  const argv = [...pnpm.args, ...checkArgs];
  return isInstallLike(checkArgs) ? enforcedInstallArgs(argv) : argv;
}
