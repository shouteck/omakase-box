// Box CLI: `node packages/box-cli/dist/cli.js export <agreement.json> --repo <path> --out <dir>`.
// Thin shell over packages/box-package: argument parsing and exit codes live here; all
// agreement validation, selection and folder emission live in the library.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeGap, exportBox, PreparationGap } from '../../box-package/index.js';
import type { PnpmInvocation } from '../../box-package/index.js';

function pnpmInvocation(argv: readonly string[]): PnpmInvocation {
  const flagIndex = argv.indexOf('--pnpm');
  if (flagIndex >= 0) {
    const value = argv[flagIndex + 1];
    if (value === undefined) usage('--pnpm needs a command or pnpm.cjs path');
    return value.endsWith('.cjs') ? { command: process.execPath, args: [value] } : { command: value, args: [] };
  }
  // In a repo checkout prefer the pinned tooling pnpm so export uses the declared toolchain.
  const local = fileURLToPath(new URL('../../../scripts/tooling/node_modules/pnpm/bin/pnpm.cjs', import.meta.url));
  if (existsSync(local)) return { command: process.execPath, args: [local] };
  return { command: 'pnpm', args: [] };
}

function usage(message?: string): never {
  if (message !== undefined) console.error(message);
  console.error('usage: box export <agreement.json> --repo <path> --out <dir> [--pnpm <command|pnpm.cjs path>]');
  process.exit(2);
}

const [command, ...rest] = process.argv.slice(2);
if (command !== 'export') usage();
const positional = rest.filter((arg, index) => !arg.startsWith('--') && rest[index - 1] !== '--pnpm');
const flag = (name: string): string | undefined => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
};
const [agreementPath] = positional;
const repoPath = flag('--repo');
const outDir = flag('--out');
if (agreementPath === undefined || repoPath === undefined || outDir === undefined) usage();

try {
  const result = exportBox({
    agreementPath: resolve(agreementPath),
    repoPath: resolve(repoPath),
    outDir: resolve(outDir),
    pnpm: pnpmInvocation(rest)
  });
  console.log(JSON.stringify({
    exported: result.outDir,
    baseCommit: result.baseCommit,
    files: result.files,
    disclosure: result.disclosure
  }, null, 2));
} catch (error) {
  if (error instanceof PreparationGap) {
    console.error(`export failed: ${error.gaps.length} preparation gap(s)`);
    for (const gap of error.gaps) console.error(`  - ${describeGap(gap)}`);
    process.exit(3);
  }
  console.error(`export failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
