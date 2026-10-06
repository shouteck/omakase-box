import { ExportFailed } from './errors.js';
import type { PnpmInvocation } from './export.js';

// The single product-controlled install boundary. Every dependency install the
// product itself spawns — export's lockfile resolution and owner verify's
// scratch install — goes through here and always carries --ignore-scripts; any
// config/flag that could re-enable lifecycle execution is refused before
// anything spawns. No caller override, no unsafe fallback.
//
// Declared agreement commands are a different thing: arbitrary owner-approved
// programs run verbatim by the declared-command runner (commands.ts). The
// product makes no sandbox claim for them — they are execution authority, and
// their safety depends on where they are run.
export const IGNORE_SCRIPTS = '--ignore-scripts';

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
