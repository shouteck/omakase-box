// Box CLI:
//   export <agreement.json> --repo <path> --out <dir> [--pnpm <command|pnpm.cjs path>]
//   submit <submission.json> --agreement <agreement.json> --repo <path> [--box <retained export dir>] [--base <sha>]
// Thin shell over packages/box-package: argument parsing and exit codes live here; all
// agreement validation, selection, folder emission and submission checks live in the
// library. `submit` only validates and reports what it would apply — merging is D3.1.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeGap, exportBox, PreparationGap, validateSubmission } from '../../box-package/index.js';
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
  console.error('       box submit <submission.json> --agreement <agreement.json> --repo <path> [--box <retained export dir>] [--base <sha>]');
  process.exit(2);
}

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
};
const flags = ['--repo', '--out', '--pnpm', '--agreement', '--box', '--base'];
const positional = rest.filter((arg, index) => !arg.startsWith('--') && !flags.includes(rest[index - 1] ?? ''));
const [target, ...extra] = positional;
if (extra.length > 0) usage(`unexpected argument ${extra[0]}`);

if (command === 'export') {
  const repoPath = flag('--repo');
  const outDir = flag('--out');
  if (target === undefined || repoPath === undefined || outDir === undefined) usage();
  try {
    const result = exportBox({
      agreementPath: resolve(target),
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
} else if (command === 'submit') {
  const agreementPath = flag('--agreement');
  const repoPath = flag('--repo');
  const boxDir = flag('--box');
  const base = flag('--base');
  if (target === undefined || agreementPath === undefined || repoPath === undefined) usage();
  try {
    const report = validateSubmission({
      submissionPath: resolve(target),
      agreementPath: resolve(agreementPath),
      repoPath: resolve(repoPath),
      ...(boxDir !== undefined ? { boxDir: resolve(boxDir) } : {}),
      ...(base !== undefined ? { baseCommit: base } : {})
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.accepted ? 0 : 3;
  } catch (error) {
    console.error(`submit failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else {
  usage();
}
