// Box CLI:
//   export <agreement.json> --repo <path> --out <dir> [--pnpm <command|pnpm.cjs path>]
//   submit <submission.json> --agreement <agreement.json> --repo <path> [--box <retained export dir>] [--base <sha>]
//   verify <submission.json> --agreement <agreement.json> --repo <path> [--box <retained export dir>] [--base <sha>] [--pnpm <command|pnpm.cjs path>] [--keep-scratch]
//   trace --out <dir> -- <the test command, as it would normally be typed>
//   bounty create --task <file> --why "<one line>" [--title "<one line>"] [--note <file>] [--job <file>] [--out <dir>] [--repo <path>] [--preview]
//   bounty help
//   bounty describe [--rules] [--repo <path>]
//   bounty status [<id>] [--full] [--comments] [--repo <path>]
//   bounty post [<id>] --to <dir|github> [--with-changes] [--include <file>] [--preview] [--repo <path>]
//   bounty look [<id>] (<n> | --from <dir>) [--full] [--repo <path>]
//   bounty apply [<id>] [<n> | --from <dir>] [--repo <path>]
//   bounty close [<id>] [--reason "<text>"] [--repo <path>]
//   bounty allow [owner/name|waiting-id] [--ask]
//   bounty deny [owner/name]
//   bounty config [set|add|remove <setting> <value>]
// A bounty command works without <id> when exactly one bounty can take it.
// Thin shell over packages/box-package and packages/box-trace: argument parsing and
// exit codes live here; all agreement validation, selection, folder emission,
// submission checks, owner-side verify and test-call tracing live in the libraries.
// `verify` applies the patch in a scratch clone, runs the owner checks and lands a
// scratch merge on pass — real history is never touched.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBounty, BountyRefused, BountyUsage, closeBounty, finalizeBounty, allowRepository, denyRepository, renderConfig, changeConfig, renderSummary, parseCreateArgs, planBounty, postBounty, recordPath, renderDescribe, renderHelp, renderPreview, renderRules, renderStatus, resolveRepoRoot, setMergeNoticeListener, setInstructionNoticeListener, renderOverview, showPath } from '../../box-bounty/index.js';
import { previewGitHub } from '../../box-bounty/index.js';
import { lookBounty, quoteForeign, renderResume, listRecords, isOpenStage, readGitPinsOncePerProcess } from '../../box-bounty/index.js';
// box-package and box-trace load behind the commands that need them: their
// dependency weight (typescript, zod) is paid once by export/submit/verify/
// trace, never by every `box bounty` spawn.
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
  console.error('       box verify <submission.json> --agreement <agreement.json> --repo <path> [--box <retained export dir>] [--base <sha>] [--pnpm <command|pnpm.cjs path>] [--keep-scratch]');
  console.error('       box trace --out <dir> -- <the test command, as it would normally be typed>');
  console.error('       box bounty create --task <file> --why "<one line>" [--title "<one line>"] [--note <file>] [--job <file>] [--resume "<short note>"] [--out <dir>] [--repo <path>] [--preview]');
  console.error('       box bounty help');
  console.error('       box bounty describe [--rules] [--repo <path>]');
  console.error('       box bounty status [<id>] [--full] [--comments] [--repo <path>]');
  console.error('       box bounty post [<id>] --to <dir|github> [--with-changes] [--include <file>] [--preview] [--repo <path>]');
  console.error('       box bounty look [<id>] (<n> | --from <dir>) [--full] [--repo <path>]');
  console.error('       box bounty apply [<id>] [<n> | --from <dir>] [--repo <path>]');
  console.error('       box bounty close [<id>] [--reason "<text>"] [--repo <path>]');
  console.error('       <id> may be left out when exactly one bounty can take the command');
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
  const { describeGap, exportBox, PreparationGap } = await import('../../box-package/index.js');
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
  const { validateSubmission } = await import('../../box-package/index.js');
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
  const { verifySubmission } = await import('../../box-package/index.js');
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
  const { trace, TraceRefused } = await import('../../box-trace/index.js');
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
  const [requested, ...commandArgs] = rest;
  const subcommand = requested === '--repo' ? undefined : requested;
  const bountyArgs = requested === '--repo' ? rest : commandArgs;
  setInstructionNoticeListener(line => console.log(line));
  readGitPinsOncePerProcess(); // this process runs one command and exits
  // A reading command can recognise a solution the agent merged itself and
  // close the bounty — the one line saying so belongs to whichever command
  // noticed, printed the moment it happens.
  setMergeNoticeListener(line => console.log(line));
  // Subcommand-local parsing: positional ids, plus --repo and --to as box flags.
  const bountyRepo = (): string => {
    const index = bountyArgs.indexOf('--repo');
    return index >= 0 && bountyArgs[index + 1] !== undefined ? resolve(bountyArgs[index + 1]!) : process.cwd();
  };
  const bountyIds = (): string[] =>
    bountyArgs.filter((arg, index) => !arg.startsWith('--') && !['--repo', '--to', '--from', '--reason', '--include', '--since'].includes(bountyArgs[index - 1] ?? ''));

  const commandIds = (): string[] => {
    const positional = bountyIds();
    if (positional[0]?.startsWith('bt-')) return positional;
    const root = resolveRepoRoot(bountyRepo(), subcommand);
    // The bounties this command can act on: the open ones, plus for `close`
    // an ended one whose outside work is still owed — close retries it.
    const eligible = listRecords(root).flatMap(entry => entry.record !== null && (isOpenStage(entry.record.stage)
      || subcommand === 'close' && entry.record.github?.pending !== null && entry.record.github?.pending !== undefined) ? [entry.record] : []);
    if (eligible.length !== 1) throw new BountyRefused('bounty-ambiguous', `name a bounty: ${eligible.map(record => `${record.id} ${JSON.stringify(record.title)}`).join(', ') || 'none open'}; next: box bounty status`);
    return [eligible[0]!.id, ...positional];
  };

  // The line every ended bounty prints: which job was waiting on it — the
  // --job file when one was recorded, else the title.
  const jobLine = (record: { job?: { file: string } | null; title: string }): string =>
    `the job it came from: ${record.job?.file ?? record.title}`;
  try {
    // The commands BT7c removed: a typed name is a named refusal that says
    // what replaced it — never a silent drop, never an alias that runs the
    // old operation. The refusal line above names what was typed.
    const removed: Record<string, string> = {
      answer: 'collection is a step inside look and apply, not a command — box bounty look <id> <number> collects a pull request and shows its change; box bounty apply <id> <number> collects and merges; a returned folder goes to the same two with --from <dir>',
      questions: 'reading what other accounts wrote is part of status — box bounty status <id> --comments',
      reply: 'the tool no longer writes comments for you — comment on the issue in your own words with your own gh, for example gh issue comment <number> --body "<your own words>"',
      undo: 'the tool no longer reverses an applied merge — the merge is one ordinary commit and ordinary Git reverses it: git revert -m 1 <merge>',
      reject: 'ending a bounty with nothing merged is one command now — box bounty close <id> --reason "<why>" keeps the reason on the record',
      withdraw: 'ending a bounty with nothing merged is one command now — box bounty close <id>',
      remind: 'the tool no longer supplies reminders; box bounty shows the current overview',
      confirm: 'the owner allows the tool once, not each bounty — preview with box bounty post <id> --to github --preview, publish with box bounty post <id> --to github; the owner uses box bounty allow, deny and config'
    };
    if (removed[subcommand!] !== undefined) {
      throw new BountyRefused('command-removed', removed[subcommand!]!);
    }
    if (subcommand === 'owner') {
      const replacements: Record<string, string> = { setup: 'box bounty config', allow: 'box bounty allow', ask: 'box bounty allow --ask', off: 'box bounty deny', on: 'box bounty allow', answer: 'box bounty allow <waiting-bounty-id>', summary: 'box bounty status --since <iso>' };
      throw new BountyRefused('command-removed', `owner ${bountyArgs[0] ?? ''} was removed; use ${replacements[bountyArgs[0] ?? ''] ?? 'box bounty allow, box bounty deny or box bounty config'}. Nothing changed`);
    }
    if (subcommand === undefined) {
      if (bountyArgs.length !== 0 && (bountyArgs.length !== 2 || bountyArgs[0] !== '--repo' || bountyArgs[1]?.startsWith('--'))) usage('box bounty [--repo <path>]');
      try { console.log(renderOverview(resolveRepoRoot(bountyRepo(), 'overview'))); }
      catch (error) {
        if (!(error instanceof BountyRefused) || error.reason !== 'not-a-repository' || bountyArgs.includes('--repo')) throw error;
        console.log(renderDescribe(null));
      }
    } else if (subcommand === 'help') {
      // Works outside a checkout too — it reads no repository.
      console.log(renderHelp());
    } else if (subcommand === 'describe') {
      // Works outside a checkout too — without a repository it prints the
      // description and says the live facts need one.
      if (bountyIds().length > 0) usage('box bounty describe [--rules] [--repo <path>]');
      let described: string | null = null;
      try {
        described = resolveRepoRoot(bountyRepo(), 'describe');
      } catch (error) {
        if (!(error instanceof BountyRefused)) throw error; // not-a-repository → the description alone prints
      }
      console.log(bountyArgs.includes('--rules') ? renderRules(described) : renderDescribe(described));
    } else if (subcommand === 'create') {
      const parsed = parseCreateArgs(bountyArgs);
      // --task stays a usage error; a missing --why is the named refusal
      // missing-why, thrown by planBounty — not a usage wall.
      if (parsed.task === undefined) usage('bounty create needs --task <file> (and --why "<one line>") — run box bounty help');
      const plan = planBounty({
        repoPath: parsed.repo !== undefined ? resolve(parsed.repo) : process.cwd(),
        why: parsed.why ?? '',
        ...(parsed.title !== undefined ? { title: parsed.title } : {}),
        taskPath: resolve(parsed.task),
        ...(parsed.note !== undefined ? { notePath: resolve(parsed.note) } : {}),
        ...(parsed.job !== undefined ? { jobPath: resolve(parsed.job) } : {}),
        ...(parsed.resume !== undefined ? { resumeNote: parsed.resume } : {}),
        ...(parsed.out !== undefined ? { outDir: resolve(parsed.out) } : {})
      });
      console.log(renderPreview(plan));
      if (parsed.preview) {
        console.log('preview only — nothing was written. Run again without --preview to write the bounty folder.');
        process.exitCode = 0;
      } else {
        const result = finalizeBounty(plan);
        console.log(`${result.id} — drafted — written to ${result.outDir}`);
        console.log(`record: ${result.recordPath} — the tool writes it; commit it with the project`);
        console.log(`next: deliver it — run box bounty post ${result.id} --to <dir|github> (--preview shows what a GitHub post makes public). Nothing has been posted; nothing has left this machine.`);
      }
    } else if (subcommand === 'status') {
      const [id, ...extraIds] = bountyIds();
      if (extraIds.length > 0) usage('box bounty status [id] [--full] [--comments]');
      const root = resolveRepoRoot(bountyRepo(), 'status');
      const sinceIndex = bountyArgs.indexOf('--since');
      const since = sinceIndex < 0 ? undefined : bountyArgs[sinceIndex + 1];
      if (sinceIndex >= 0 && (since === undefined || since.startsWith('--'))) usage('box bounty status --since <iso>');
      console.log(renderStatus(root, { ...(id === undefined ? {} : { id }), full: bountyArgs.includes('--full'), comments: bountyArgs.includes('--comments') }));
      if (since !== undefined) console.log(renderSummary(root, since));
    } else if (subcommand === 'post') {
      const toIndex = bountyArgs.indexOf('--to');
      const to = toIndex >= 0 ? bountyArgs[toIndex + 1] : undefined;
      const [id, ...extraIds] = commandIds();
      // The two publication choices, moved from the removed `confirm`:
      // --with-changes says the task needs every uncommitted change to
      // tracked files (one tool-built commit on the bounty branch);
      // --include names an untracked file to publish, once per file. Both
      // show in --preview, and each makes the post wait for the owner.
      const withChanges = bountyArgs.includes('--with-changes');
      const include: string[] = [];
      bountyArgs.forEach((arg, index) => {
        if (arg !== '--include') return;
        const named = bountyArgs[index + 1];
        if (named === undefined || named.startsWith('--')) usage('box bounty post <id> --to github [--with-changes] [--include <file>] [--preview]');
        include.push(named!);
      });
      if (id === undefined || extraIds.length > 0 || to === undefined || (withChanges || include.length > 0) && to !== 'github') usage('box bounty post <id> --to <dir|github> [--with-changes] [--include <file>] [--preview] [--repo <path>]');
      const repoRoot = resolveRepoRoot(bountyRepo(), 'post');
      if (bountyArgs.includes('--preview')) {
        if (to !== 'github') usage('box bounty post <id> --to github --preview — only a GitHub post has a preview');
        console.log(previewGitHub(repoRoot, id, { withChanges, include }));
        console.log('preview only — nothing was posted. Run again without --preview to publish it.');
        process.exit(0);
      }
      const { record, destination } = postBounty(repoRoot, id, to, { choice: { withChanges, include } });
      console.log(`${record.id} — posted — delivered to ${destination}`);
      if (record.allowedBy !== undefined) console.log(`allowed by: the owner's ${record.allowedBy.decision === 'allowed' ? `${record.allowedBy.level === 'default' ? 'all-projects setting' : 'repository entry'} "allowed" written ${record.allowedBy.decisionAt}` : 'one-bounty answer'}`);
      console.log(record.github !== undefined ? `next: box bounty status reads open pull requests; box bounty look ${record.id} <number> collects one and shows its change` : `next: a solver picks it up there — box bounty status shows the bounty meanwhile; when the folder comes back run box bounty look ${record.id} --from <dir>`);
    } else if (subcommand === 'apply') {
      const [id, attemptText, ...extraIds] = commandIds();
      const fromIndex = bountyArgs.indexOf('--from');
      const from = fromIndex >= 0 ? bountyArgs[fromIndex + 1] : undefined;
      const attempt = attemptText !== undefined && /^\d+$/.test(attemptText) ? Number.parseInt(attemptText, 10) : undefined;
      if (id === undefined || extraIds.length > 0
        || (fromIndex >= 0 && (from === undefined || from.startsWith('--')))
        || (from !== undefined && attemptText !== undefined)
        || (attemptText !== undefined && attempt === undefined)) {
        usage('box bounty apply [id] [<n> | --from <dir>] [--repo <path>]');
      }
      const result = applyBounty(resolveRepoRoot(bountyRepo(), 'apply'), id, from !== undefined ? { from: resolve(from) } : attempt);
      if (result.firstMergeNotice !== undefined) console.log(result.firstMergeNotice);
      if (result.record.github?.pending !== null && result.record.github?.pending !== undefined) console.log(result.record.github.pending);
      if (result.record.github?.closedNote !== undefined) console.log(`github: ${result.record.github.closedNote}`);
      if (result.outcome === 'applied') {
        console.log(`${result.record.id} — applied — attempt ${result.attempt} merged as ${result.mergeCommit}, which is on this branch and names the bounty`);
        console.log(`ended — ${jobLine(result.record)}; the durability refs are removed. To reverse it: git revert -m 1 ${result.mergeCommit} — the merge is one ordinary commit`);
        console.log(renderResume(result.record));
      } else {
        const branch = result.record.resume?.kind === 'recorded' ? result.record.resume.branch : 'the branch the bounty was created on';
        console.log(`${result.record.id} — merging attempt ${result.attempt} onto the current code conflicts in: ${(result.conflicts ?? []).map(showPath).join(', ')}`);
        console.log('the merge was aborted — the worktree and index are exactly as before; the record stays where it was');
        const clean = result.clean ?? [];
        console.log(clean.length === 0
          ? 'none of the solution\'s files would merge cleanly'
          : `of the solution's files, these would merge cleanly: ${clean.map(showPath).join(', ')}`);
        const commits = result.commits ?? [];
        if (commits.length === 0) console.log(`no commit on this branch since ${result.base ?? 'the shared commit'} touches the clashing files`);
        else {
          console.log(`commits on this branch since ${result.base} that touch the clashing files:`);
          for (const line of commits) console.log(`  ${line}`);
        }
        console.log('a merge the agent performs itself runs under the owner\'s own Git settings — the tool\'s pins are not part of it');
        console.log(`next: read the solution with box bounty look ${result.record.id} ${result.attempt}; once the solution's commit is merged on ${branch} the next bounty command closes the bounty, or end it with box bounty close ${result.record.id} --reason "<why>"`);
      }
    } else if (subcommand === 'look') {
      const [id, text, ...extraIds] = commandIds();
      const fromIndex = bountyArgs.indexOf('--from');
      const from = fromIndex >= 0 ? bountyArgs[fromIndex + 1] : undefined;
      const n = text !== undefined && /^\d+$/.test(text) ? Number.parseInt(text, 10) : undefined;
      if (id === undefined || extraIds.length > 0
        || (fromIndex >= 0 && (from === undefined || from.startsWith('--')))
        || (from === undefined) === (n === undefined)
        || (text !== undefined && n === undefined)) {
        usage('box bounty look [id] (<n> | --from <dir>) [--full] [--repo <path>]');
      }
      const root = resolveRepoRoot(bountyRepo(), subcommand);
      const result = lookBounty(root, id, from !== undefined ? { from: resolve(from) } : n!, { full: bountyArgs.includes('--full') });
      const label = result.attempt.n;
      console.log(`${id} solution ${label} — ${result.collected ? 'collected first — ' : ''}the change below was written by the solver, not by the tool; the tool ran nothing of the solver's to show it. It is read from fetched objects — nothing is checked out, nothing is left behind.`);
      if (result.diff === null) {
        console.log(`${result.files.length} file(s) changed:`);
        for (const file of result.files) console.log(`solver change | ${quoteForeign(file)}`);
        console.log(`next: box bounty look ${id} ${label} --full prints the whole change; box bounty apply ${id} ${label} chooses this solution`);
      } else {
        for (const line of result.diff.split('\n')) console.log(`solver change | ${quoteForeign(line)}`);
        console.log(`next: box bounty apply ${id} ${label} chooses this solution; box bounty status ${id} shows what else waits`);
      }
    } else if (subcommand === 'close') {
      const reasonIndex = bountyArgs.indexOf('--reason');
      const reason = reasonIndex >= 0 ? bountyArgs[reasonIndex + 1] : undefined;
      const [id, ...extraIds] = commandIds();
      if (id === undefined || extraIds.length > 0 || (reasonIndex >= 0 && (reason === undefined || reason.startsWith('--')))) usage('box bounty close [id] [--reason "<text>"] [--repo <path>]');
      const { record, outcome } = closeBounty(resolveRepoRoot(bountyRepo(), 'close'), id, reason);
      if (record.github?.pending !== null && record.github?.pending !== undefined) console.log(record.github.pending);
      if (record.github?.closedNote !== undefined) console.log(`github: ${record.github.closedNote}`);
      if (outcome === 'already-ended') {
        console.log(`${record.id} — already ended (${record.stage}) — nothing to do`);
        console.log(`ended — ${jobLine(record)}`);
      } else {
        console.log(`${record.id} — ${record.stage} — ${record.stage === 'rejected' ? 'the reason is recorded and' : 'the durability ref is removed and'} the record says ended`);
        console.log(`ended — ${jobLine(record)}`);
      }
    } else if (subcommand === 'allow' || subcommand === 'deny' || subcommand === 'config') {
      const values: string[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < bountyArgs.length; i += 1) {
        const arg = bountyArgs[i]!;
        if (arg === '--repo' || arg === '--ask' && subcommand === 'allow') {
          if (seen.has(arg)) throw new BountyRefused('authority-arguments', `${arg} was repeated; nothing changed`);
          seen.add(arg);
          if (arg === '--repo') {
            const value = bountyArgs[++i];
            if (value === undefined || value.startsWith('--')) throw new BountyRefused('authority-arguments', '--repo needs a path; nothing changed');
          }
        } else if (arg.startsWith('--')) throw new BountyRefused('authority-arguments', `unexpected option ${arg}; nothing changed`);
        else values.push(arg);
      }
      if ((subcommand === 'allow' || subcommand === 'deny') && values.length > 1 || subcommand === 'config' && values.length !== 0 && values.length !== 3) throw new BountyRefused('authority-arguments', 'unexpected arguments; use allow [owner/name|waiting-id], deny [owner/name], or config [set|add|remove <setting> <value>]. Nothing changed');
      let root: string | null = null;
      try { root = resolveRepoRoot(bountyRepo(), subcommand); }
      catch (error) { if (!(error instanceof BountyRefused) || error.reason !== 'not-a-repository' || seen.has('--repo')) throw error; }
      if (subcommand === 'allow') console.log(allowRepository(root, values[0], seen.has('--ask'), text => console.log(text)));
      else if (subcommand === 'deny') console.log(denyRepository(root, values[0]));
      else console.log(values.length === 0 ? renderConfig(root) : changeConfig(root, values[0]!, values[1]!, values[2]!, text => console.log(text)));
    } else {
      usage(`box bounty ${subcommand} is not a bounty command — run box bounty help for the journey`);
    }
  } catch (error) {
    if (error instanceof BountyUsage) usage(error.message);
    if (error instanceof BountyRefused) {
      if (['owner-allow-needed', 'owner-answer-needed', 'publish-held'].includes(error.reason)) {
        console.log(error.message);
        process.exit(0);
      }
      console.error(`bounty ${subcommand} refused (${error.reason}): ${error.message}`);
      process.exit(3);
    }
    console.error(`bounty ${subcommand} failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else {
  usage();
}
