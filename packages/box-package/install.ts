import { ExportFailed } from './errors.js';
import type { PnpmInvocation } from './export.js';

// The single product-controlled install boundary. Every dependency install the
// product spawns — export's lockfile resolution and base/recipient installs,
// and owner verify's scratch install — goes through here and always carries
// --ignore-scripts; any config/flag that could re-enable lifecycle execution is
// refused before anything spawns. No caller override, no unsafe fallback.
//
// Declared `pnpm` checks are a different thing: they may only RUN something
// (RUN_VERBS), never manage packages. They are owner-approved code and the
// product makes no sandbox claim for them; their safety depends on where they
// are run.
export const IGNORE_SCRIPTS = '--ignore-scripts';

// The only verbs a declared `pnpm` check may use, passed through verbatim.
// Every other verb — install-like, package-management or unknown — is refused.
const RUN_VERBS = new Set(['exec', 'e', 'run', 'run-script', 'test', 't']);

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
// ambiguous flag.
function scanPnpmArgv(argv: readonly string[]): void {
  for (const [index, raw] of argv.entries()) {
    if (raw === IGNORE_SCRIPTS) {
      const next = argv[index + 1];
      if (next === 'false' || next === 'true') throw new UnsafeInstall(`ambiguous value '${next}' after ${IGNORE_SCRIPTS}`);
    } else if (raw.startsWith('-') && UNSAFE_FLAG.test(raw)) {
      throw new UnsafeInstall(`lifecycle/config override flag in invocation: ${raw}`);
    }
  }
}

// Product-spawned installs: caller prefix plus the operation, scanned as one,
// with --ignore-scripts appended when absent.
export function productInstallArgs(pnpm: PnpmInvocation, args: readonly string[]): string[] {
  const argv = [...pnpm.args, ...args];
  scanPnpmArgv(argv);
  return argv.includes(IGNORE_SCRIPTS) ? argv : [...argv, IGNORE_SCRIPTS];
}

// Locates the declared pnpm verb: the first non-dash token, skipping
// recognised value options. Throws UnsafeInstall on an ambiguous leading
// option (unknown bare flags may hide the verb).
function declaredVerb(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index++) {
    const raw = argv[index];
    if (raw === undefined) break;
    if (!raw.startsWith('-')) return raw;
    if (raw.includes('=')) continue; // --opt=value is self-contained
    if (VALUE_OPTIONS.has(raw)) { index++; continue; } // --opt value
    if (BOOLEAN_OPTIONS.has(raw)) continue;
    throw new UnsafeInstall(`ambiguous leading pnpm option '${raw}': cannot locate the declared verb`);
  }
  return undefined; // `pnpm --version`-style: no verb, nothing runs or installs
}

// Declared `pnpm` command checks: lifecycle/config override flags are refused
// on every call, and any verb outside RUN_VERBS is refused before spawn. What
// is left passes through verbatim.
export function declaredPnpmArgs(pnpm: PnpmInvocation, checkArgs: readonly string[]): string[] {
  const argv = [...pnpm.args, ...checkArgs];
  scanPnpmArgv(argv);
  const verb = declaredVerb(checkArgs);
  if (verb !== undefined && !RUN_VERBS.has(verb)) throw new UnsafeInstall(`declared pnpm verb '${verb}' is not a run verb: only ${[...RUN_VERBS].join(', ')} may be declared`);
  return argv;
}
