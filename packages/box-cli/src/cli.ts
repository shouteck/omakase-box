// Box CLI:
//   export <agreement.json> --repo <path> --out <dir> [--pnpm <command|pnpm.cjs path>]
//   submit <submission.json> --agreement <agreement.json> --repo <path> [--box <retained export dir>] [--base <sha>]
//   verify <submission.json> --agreement <agreement.json> --repo <path> [--box <retained export dir>] [--base <sha>] [--pnpm <command|pnpm.cjs path>] [--keep-scratch]
//   trace --out <dir> -- <the test command, as it would normally be typed>
//   bounty create --title "<one line>" --task <file> [--note <file>] [--setup -- <command>] [--check -- <command>] --out <dir> [--repo <path>] [--preview]
//   bounty status [--repo <path>]
//   bounty confirm <id> [--repo <path>]
//   bounty post <id> --to <dir> [--repo <path>]
//   bounty withdraw <id> [--repo <path>]
// Thin shell over packages/box-package and packages/box-trace: argument parsing and
// exit codes live here; all agreement validation, selection, folder emission,
// submission checks, owner-side verify and test-call tracing live in the libraries.
// `verify` applies the patch in a scratch clone, runs the owner checks and lands a
// scratch merge on pass — real history is never touched.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BountyRefused, BountyUsage, confirmBounty, finalizeBounty, parseCreateArgs, planBounty, postBounty, recordPath, renderPreview, renderStatus, resolveRepoRoot, withdrawBounty } from '../../box-bounty/index.js';
import { describeGap, exportBox, PreparationGap, validateSubmission, verifySubmission } from '../../box-package/index.js';
import type { PnpmInvocation } from '../../box-package/index.js';
import { trace, TraceRefused } from '../../box-trace/index.js';

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
  console.error('       box verify <submission.json> --agreement <agreement.json> --repo <path> [--box <retained export dir>] [--base <sha>] [--pnpm <command|pnpm.cjs path>] [--keep-scratch]');
  console.error('       box trace --out <dir> -- <the test command, as it would normally be typed>');
  console.error('       box bounty create --title "<one line>" --task <file> [--note <file>] [--setup -- <command>] [--check -- <command>] --out <dir> [--repo <path>] [--preview]');
  console.error('       box bounty status [--repo <path>]');
  console.error('       box bounty confirm <id> [--repo <path>]');
  console.error('       box bounty post <id> --to <dir> [--repo <path>]');
  console.error('       box bounty withdraw <id> [--repo <path>]');
  process.exit(2);
}

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
};
const flags = ['--repo', '--out', '--pnpm', '--agreement', '--box', '--base', '--to'];
const positional = rest.filter((arg, index) => !arg.startsWith('--') && !flags.includes(rest[index - 1] ?? ''));
const [target, ...extra] = positional;
if (command !== 'trace' && command !== 'bounty' && extra.length > 0) usage(`unexpected argument ${extra[0]}`);

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
} else if (command === 'verify') {
  const agreementPath = flag('--agreement');
  const repoPath = flag('--repo');
  const boxDir = flag('--box');
  const base = flag('--base');
  const keepScratch = rest.includes('--keep-scratch');
  if (target === undefined || agreementPath === undefined || repoPath === undefined) usage();
  try {
    const report = verifySubmission({
      submissionPath: resolve(target),
      agreementPath: resolve(agreementPath),
      repoPath: resolve(repoPath),
      pnpm: pnpmInvocation(rest),
      ...(boxDir !== undefined ? { boxDir: resolve(boxDir) } : {}),
      ...(base !== undefined ? { baseCommit: base } : {}),
      ...(keepScratch ? { keepScratch: true } : {})
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.verdict === 'pass' ? 0 : 3;
  } catch (error) {
    console.error(`verify failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else if (command === 'trace') {
  // Everything after `--` is the command's own argv, verbatim — no shell runs
  // it, so pipes or redirection belong inside a shell the caller invokes.
  const separator = rest.indexOf('--');
  const head = separator >= 0 ? rest.slice(0, separator) : rest;
  const outIndex = head.indexOf('--out');
  const outDir = outIndex >= 0 ? head[outIndex + 1] : undefined;
  const argv = separator >= 0 ? rest.slice(separator + 1) : [];
  if (outDir === undefined || argv.length === 0) usage();
  try {
    const result = await trace({ argv, cwd: process.cwd(), outDir: resolve(outDir) });
    console.error(`box trace: ${result.processes} Python process(es), ${result.functions} function(s), ${result.files} file(s) in ${result.seconds.toFixed(2)}s -> ${result.tracePath}`);
    process.exitCode = result.exitCode ?? 1;
  } catch (error) {
    if (error instanceof TraceRefused) {
      console.error(`box trace: ${error.message}`);
      process.exit(2);
    }
    console.error(`trace failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else if (command === 'bounty') {
  const [subcommand, ...bountyArgs] = rest;
  if (subcommand === undefined) usage('expected: box bounty create|status|confirm|post|withdraw …');
  // Subcommand-local parsing: positional ids, plus --repo and --to as box flags.
  const bountyRepo = (): string => {
    const index = bountyArgs.indexOf('--repo');
    return index >= 0 && bountyArgs[index + 1] !== undefined ? resolve(bountyArgs[index + 1]!) : process.cwd();
  };
  const bountyIds = (): string[] =>
    bountyArgs.filter((arg, index) => !arg.startsWith('--') && !['--repo', '--to'].includes(bountyArgs[index - 1] ?? ''));
  try {
    if (subcommand === 'create') {
      const parsed = parseCreateArgs(bountyArgs);
      if (parsed.title === undefined || parsed.task === undefined || parsed.out === undefined) {
        usage('bounty create needs --title, --task and --out');
      }
      const plan = planBounty({
        repoPath: parsed.repo !== undefined ? resolve(parsed.repo) : process.cwd(),
        title: parsed.title,
        taskPath: resolve(parsed.task),
        ...(parsed.note !== undefined ? { notePath: resolve(parsed.note) } : {}),
        ...(parsed.setup !== undefined ? { setup: parsed.setup } : {}),
        ...(parsed.check !== undefined ? { check: parsed.check } : {}),
        outDir: resolve(parsed.out)
      });
      console.log(renderPreview(plan));
      if (parsed.preview) {
        console.log('preview only — nothing was written. Run again without --preview to write the bounty folder.');
        process.exitCode = 0;
      } else {
        const result = finalizeBounty(plan);
        console.log(`${result.id} — stage 1 of 7: drafted — written to ${result.outDir}`);
        console.log(`record: ${result.recordPath} — the tool writes it; commit it with the project`);
        console.log(`next: the owner reviews the preview above and says yes — then run box bounty confirm ${result.id}. Nothing has been posted; nothing has left this machine.`);
      }
    } else if (subcommand === 'status') {
      if (bountyIds().length > 0) usage('box bounty status takes no id');
      console.log(renderStatus(resolveRepoRoot(bountyRepo())));
    } else if (subcommand === 'confirm') {
      const [id, ...extraIds] = bountyIds();
      if (id === undefined || extraIds.length > 0) usage('box bounty confirm <id> [--repo <path>]');
      const repoRoot = resolveRepoRoot(bountyRepo());
      const record = confirmBounty(repoRoot, id);
      console.log(`${record.id} — stage 2 of 7: confirmed — the owner's yes is recorded in ${recordPath(repoRoot, record.id)}`);
      console.log(`next: deliver it — run box bounty post ${record.id} --to <dir>`);
    } else if (subcommand === 'post') {
      const toIndex = bountyArgs.indexOf('--to');
      const to = toIndex >= 0 ? bountyArgs[toIndex + 1] : undefined;
      const [id, ...extraIds] = bountyIds();
      if (id === undefined || extraIds.length > 0 || to === undefined) usage('box bounty post <id> --to <dir> [--repo <path>]');
      const { record, destination } = postBounty(resolveRepoRoot(bountyRepo()), id, to);
      console.log(`${record.id} — stage 3 of 7: posted — delivered to ${destination}`);
      console.log('next: a solver picks it up there. The answer comes back through this tool; check box bounty status again later.');
    } else if (subcommand === 'withdraw') {
      const [id, ...extraIds] = bountyIds();
      if (id === undefined || extraIds.length > 0) usage('box bounty withdraw <id> [--repo <path>]');
      const { record, outcome } = withdrawBounty(resolveRepoRoot(bountyRepo()), id);
      if (outcome === 'already-withdrawn') {
        console.log(`${record.id} — already withdrawn — nothing to do`);
      } else {
        console.log(`${record.id} — withdrawn — the durability ref is removed and the record says ended`);
      }
    } else {
      usage('expected: box bounty create|status|confirm|post|withdraw …');
    }
  } catch (error) {
    if (error instanceof BountyUsage) usage(error.message);
    if (error instanceof BountyRefused) {
      console.error(`bounty ${subcommand} refused (${error.reason}): ${error.message}`);
      process.exit(3);
    }
    console.error(`bounty ${subcommand} failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else {
  usage();
}
