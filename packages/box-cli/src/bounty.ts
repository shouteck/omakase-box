// The `omakase-box` command dispatch, shared by both entrypoints: the
// kitchen build (src/cli.ts, which also carries the older platform
// commands) and the published artifact (src/box.ts, the bounty tool alone).
// One code path — the tool behaves identically installed and from this
// repository.
import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { actingOn, loadSettings, repositoryIdentity, applyBounty, BountyRefused, BountyUsage, closeBounty, createBounty, allowRepository, denyRepository, renderConfig, changeConfig, renderSummary, parseCreateArgs, parseOptions, commandHelp, OPTIONS_NOTE, postBounty, readDecision, renderDescribe, renderHelp, renderPreview, renderRules, renderStatus, repoReward, requireRepository, resolveRepoRoot, setMergeNoticeListener, setInstructionNoticeListener, renderOverview, showPath, statusDocument, lookDocument, configDocument, HOOK_GH_CALL_COUNT, HOOK_GH_CALL_LIMIT_MS, HOOK_GITHUB_BUDGET_MS, hookDisclosure, hookHost, hookOff, hookOn, hookStatus, limitGitHubCalls, runHook } from '../../box-bounty/index.js';
import { boardAddress, boardNotToldLine, flushBoardHints, readBoardFacts } from '../../box-bounty/index.js';
import type { ParsedOptions } from '../../box-bounty/index.js';
import { applyDocument, closeAttemptDocument, closeDocument, createDocument, ownerDocument, postDocument, postPreviewDocument, previewGitHub, previewGitHubFacts, refusalDocument, submitDocument, submitTakenResult, takeDocument, textDocument } from '../../box-bounty/index.js';
import { attemptStatus, closeTaken, discover, discoverDocument, loadTaken, renderDescribeSolving, renderDiscover, submitTaken, takeBounty, takenOverview } from '../../box-bounty/index.js';
import { escapeControls, exportLook, findDocument, lookBounty, solverBlock, SOLVER_WORDS, renderFind, renderResume, openRecords, endedContaining, readGitPinsOncePerProcess, boundAmount, payToLine, gitOutcome } from '../../box-bounty/index.js';

// Does .git/config name this remote — read as bytes, so the apply output
// costs no extra Git start. `.git` can be a linked worktree's `gitdir:`
// pointer; the shared config then sits in the common dir its `commondir`
// file names. Anything unreadable answers false — the caller states the
// local fact without naming a remote it cannot confirm.
const remoteNamed = (repoRoot: string, name: string): boolean => {
  try {
    let dotGit = join(repoRoot, '.git');
    const entry = lstatSync(dotGit, { throwIfNoEntry: false });
    if (entry === undefined) return false;
    if (entry.isFile()) {
      const pointer = readFileSync(dotGit, 'utf8');
      if (!pointer.startsWith('gitdir:')) return false;
      const gitdir = resolve(repoRoot, pointer.slice('gitdir:'.length).trim());
      const common = readFileSync(join(gitdir, 'commondir'), 'utf8').trim();
      dotGit = resolve(gitdir, common);
    }
    return readFileSync(join(dotGit, 'config'), 'utf8').includes(`[remote "${name}"]`);
  } catch { return false; }
};

export interface BountyHost {
  /** print the message plus usage lines and exit 2 — the entrypoint's usage(). */
  readonly usage: (message?: string, lines?: readonly string[]) => never;
  /** `omakase-box --version`'s answer. */
  readonly version: () => string;
}

// BT43 correction 3: the one output guard. Every write the bounty command
// makes to standard output or standard error — console.log, console.error,
// a direct stream write, host.usage, the notices the library emits — passes
// through escapeControls at the stream itself, so no raw control and no
// character that hides or reorders text reaches a terminal or an agent on
// any path, listed or not. The tool's own text holds none of them, so the
// guard costs it nothing. The one way past it is a --json document, written
// whole by the function returned here: it is data, JSON.stringify escapes
// C0 and the line feed, and its foreignFields name what a stranger wrote.
const guardOutput = (): ((document: object) => void) => {
  const raw = process.stdout.write.bind(process.stdout);
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream) as (chunk: string, ...rest: unknown[]) => boolean;
    stream.write = ((chunk: string | Uint8Array, ...rest: unknown[]) =>
      write(escapeControls(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')), ...rest)) as typeof stream.write;
  }
  return document => { raw(`${JSON.stringify(document)}\n`); };
};

// A refusal or a failure is one line by contract: a line break inside its
// message is written `\n`, so text the message carries cannot start a line
// of its own (BT43 correction 3). The tool's own multi-line refusals are
// declared here by reason; the held ones (owner blocks) print on their own
// branch, unchanged.
const MULTI_LINE_REFUSALS: ReadonlySet<string> = new Set(['repository-choice-needed']);
const oneLine = (message: string): string => message.replaceAll('\n', '\\n');

export async function runBounty(rest: readonly string[], host: BountyHost): Promise<void> {
  const printDocument = guardOutput();
  const [requested, ...commandArgs] = rest;
  // A leading option means the overview: `omakase-box --repo <path>` (and
  // --help/--version below). Anything else is a subcommand name.
  const subcommand = requested !== undefined && !requested.startsWith('-') ? requested : undefined;
  const bountyArgs = subcommand === undefined ? rest : commandArgs;
  // BT61: whether a document was asked for is decided from the raw arguments, before anything is parsed: a usage error happens
  // before parsing succeeds, and under --json it is one document too.
  const jsonRequested = bountyArgs.includes('--json');
  const commandName = subcommand ?? 'overview';
  // (Typed on the variable so a call narrows the way host.usage's did: TypeScript only does that for an annotated name.)
  const usageError: (message?: string, lines?: readonly string[]) => never = (message, lines) => {
    if (jsonRequested) {
      printDocument(refusalDocument(commandName, 'usage', message ?? '', 2, lines ?? []));
      process.exit(2);
    }
    return host.usage(message, lines);
  };
  // BT61: under --json the lines a text view prints on the side go into the document's `notices`, never to standard output;
  // the four commands that had a document before (status, look, config, find) and discover set their own (standard error).
  const notices: string[] = [];
  const aside = (line: string): void => { if (jsonRequested) notices.push(line); else console.log(line); };
  // The command's own lines, collected as they are printed, so a document carries the text as data (and the text is unchanged).
  const out: string[] = [];
  const say = (line: string): void => { out.push(line); if (!jsonRequested) console.log(line); };
  // describe, help and hook: the text is the content, so the document is its lines.
  const showText = (command: 'describe' | 'help' | 'hook', text: string, facts: Record<string, unknown> = {}): void => {
    if (jsonRequested) printDocument(textDocument(command, facts, text.split('\n'), notices));
    else console.log(text);
  };
  setInstructionNoticeListener(aside);
  readGitPinsOncePerProcess(); // this process runs one command and exits
  // A reading command can recognise a solution the agent merged itself and
  // close the bounty — the one line saying so belongs to whichever command
  // noticed, printed the moment it happens.
  setMergeNoticeListener(aside);
  // PF5: whatever this command changed, or an earlier one left unsent, goes to
  // the board as the process ends, on every exit path. A hook has a time budget.
  if (subcommand !== 'hook') {
    const named = bountyArgs.indexOf('--repo');
    process.once('exit', () => {
      if (boardAddress() === '') return;
      let root: string;
      try { root = resolveRepoRoot(bountyArgs[named + 1] !== undefined && named >= 0 ? bountyArgs[named + 1]! : process.cwd(), subcommand ?? 'status'); } catch { return; }
      const notTold = boardNotToldLine(flushBoardHints(root));
      if (notTold !== null && ['post', 'apply', 'close', 'config'].includes(subcommand ?? '') && !(jsonRequested && subcommand !== 'config')) console.error(notTold);
    });
  }
  // BT18: every command reads its options through the one parser driven by
  // the table in box-bounty/args.ts — an option is understood or refused by
  // name; --help/-h anywhere answers with that command's usage, exit 0.
  const parse = (name: string): ParsedOptions => {
    const parsed = parseOptions(name, bountyArgs);
    if (parsed.help) {
      console.log(commandHelp(name));
      process.exit(0);
    }
    return parsed;
  };
  const repoPath = (parsed: ParsedOptions): string => {
    const repo = parsed.values['--repo'];
    return repo !== undefined ? resolve(repo) : process.cwd();
  };
  const commandIds = (parsed: ParsedOptions): string[] => {
    const positional = [...parsed.positionals];
    if (positional[0]?.startsWith('bt-')) return positional;
    const root = resolveRepoRoot(repoPath(parsed), subcommand);
    // The bounties this command can act on: the open ones, plus for `close`
    // an ended one whose outside work is still owed — close retries it. The
    // store answers both without reading every record (BT31).
    const eligible = [
      ...openRecords(root),
      ...(subcommand === 'close' ? endedContaining(root, '"pending": "') : [])
    ];
    if (eligible.length !== 1) throw new BountyRefused('bounty-ambiguous', `name a bounty: ${eligible.map(record => `${record.id} ${JSON.stringify(record.title)}`).join(', ') || 'none open'}; next: omakase-box status`);
    return [eligible[0]!.id, ...positional];
  };

  // The line every ended bounty prints: which job was waiting on it — the
  // --job file when one was recorded, else the title.
  const jobLine = (record: { partOf?: string; job?: { file: string } | null; title: string }): string =>
    `the job it came from: ${record.partOf ?? record.job?.file ?? record.title}`;

  // BT16 rule 8: when the checkout's remotes name several GitHub
  // repositories and the owner's list settled one, every acting command says
  // which first. The helper builds the line once and stays silent otherwise.
  const sayActingOn = (root: string): void => {
    const line = actingOn(root);
    if (line !== null) aside(line);
  };
  try {
    // The commands BT7c removed: a typed name is a named refusal that says
    // what replaced it — never a silent drop, never an alias that runs the
    // old operation. The refusal line above names what was typed.
    const removed: Record<string, string> = {
      answer: 'collection is a step inside look and apply, not a command; next: omakase-box look <id> <number> collects a pull request and shows its change; omakase-box apply <id> <number> collects and merges',
      questions: 'reading what other accounts wrote is part of status; next: omakase-box status <id> --comments',
      reply: 'the tool no longer writes comments for you; next: comment on the issue in your own words with your own gh, for example gh issue comment <number> --body "<your own words>"',
      undo: 'the tool no longer reverses an applied merge — the merge is one ordinary commit and ordinary Git reverses it; next: git revert -m 1 <merge>',
      reject: 'ending a bounty with nothing merged is one command now; next: omakase-box close <id> --reason "<why>" keeps the reason on the record',
      withdraw: 'ending a bounty with nothing merged is one command now; next: omakase-box close <id>',
      remind: 'the tool no longer supplies reminders; next: omakase-box status shows the current overview',
      confirm: 'the owner allows the tool once, not each bounty; next: preview with omakase-box post <id> --preview, publish with omakase-box post <id>; the owner uses omakase-box allow, deny and config'
    };
    if (removed[subcommand!] !== undefined) {
      throw new BountyRefused('command-removed', removed[subcommand!]!);
    }
    if (subcommand === 'owner') {
      const replacements: Record<string, string> = { setup: 'omakase-box config', allow: 'omakase-box allow', ask: 'omakase-box allow --ask', off: 'omakase-box deny', on: 'omakase-box allow', answer: 'omakase-box allow <waiting-bounty-id>', summary: 'omakase-box status --since <iso>' };
      throw new BountyRefused('command-removed', `owner ${bountyArgs[0] ?? ''} was removed. Nothing changed; next: ${replacements[bountyArgs[0] ?? ''] ?? 'omakase-box allow, omakase-box deny or omakase-box config'}`);
    }
    if (subcommand === undefined) {
      // `omakase-box --version` — the package version, like `omakase-box --version`.
      if (bountyArgs.includes('--version')) {
        say(host.version());
        process.exit(0);
      }
      const parsed = parse('overview');
      try { say(renderOverview(resolveRepoRoot(repoPath(parsed), 'overview'))); }
      catch (error) {
        if (!(error instanceof BountyRefused) || error.reason !== 'not-a-repository' || parsed.values['--repo'] !== undefined) throw error;
        say(renderDescribe(null));
      }
    } else if (subcommand === 'help') {
      // Works outside a checkout too — it reads no repository.
      parse('help');
      showText('help', `${renderHelp()}\n\n${OPTIONS_NOTE}`);
    } else if (subcommand === 'describe') {
      // Works outside a checkout too — without a repository it prints the
      // description and says the live facts need one.
      const parsed = parse('describe');
      // PF27: the solving half reads no repository; it works anywhere.
      if (parsed.switches.has('--solving')) {
        showText('describe', renderDescribeSolving(), { mode: 'solving' });
        return;
      }
      let described: string | null = null;
      try {
        described = resolveRepoRoot(repoPath(parsed), 'describe');
      } catch (error) {
        if (!(error instanceof BountyRefused)) throw error; // not-a-repository → the description alone prints
      }
      showText('describe', parsed.switches.has('--rules') ? renderRules(described) : renderDescribe(described), { mode: parsed.switches.has('--rules') ? 'rules' : 'description', repository: described });
    } else if (subcommand === 'create') {
      const parsed = parseCreateArgs(bountyArgs);
      if (parsed.help === true) {
        say(commandHelp('create'));
        process.exit(0);
      }
      // --task stays a usage error; a missing --why is the named refusal
      // missing-why, thrown by planBounty — not a usage wall.
      if (parsed.task === undefined) usageError('create needs --task <file|-> (and --why "<one line>") — run omakase-box help');
      const result = createBounty({
        repoPath: resolve(parsed.repo ?? process.cwd()), why: parsed.why ?? '',
        ...(parsed.title !== undefined ? { title: parsed.title } : {}),
        taskPath: parsed.task === '-' ? '-' : resolve(parsed.task),
        ...(parsed.resume !== undefined ? { resumeNote: parsed.resume } : {}),
        ...(parsed.partOf !== undefined ? { partOf: parsed.partOf } : {})
      });
      // The contract (BT17): one line says what happened, then only facts
      // needing attention now, then one next line. The draft preview is the
      // detail — `--full` prints it. What posting would publish is `post
      // --preview`'s answer; create states none of it (BT20).
      const full = parsed.full === true;
      if (full) say(renderPreview(result.plan));
      const plan = result.plan;
      const lines = [`${result.id} — drafted in ${plan.repoRoot}`];
      // Each path quoted (BT43 correction 5): after an apply the working
      // state holds file names a solver chose.
      for (const hit of plan.scan.hits) lines.push(`  scan hit: ${showPath(hit.path)}:${hit.line} — ${hit.rule}`);
      if (plan.scan.binary.length > 0) lines.push(`  not scanned — Git would treat them as binary: ${plan.scan.binary.map(showPath).join(', ')}`);
      for (const entry of plan.ruleRemovals) lines.push(`  never-ship removed (${entry.rule}): ${entry.removed}`);
      if (plan.titleShortened) lines.push(`  title: ${plan.title} (shortened)`);
      const { amount } = repoReward(plan.repoRoot);
      if (amount > 0) lines.push(`  states $${amount} when posted — the reward in force now for this repository`);
      let waitsForOwner: string | null = null;
      try {
        const address = requireRepository(plan.repoRoot);
        const decision = readDecision(plan.repoRoot).decision;
        if (decision !== 'allowed') waitsForOwner = String(decision);
        if (decision !== 'allowed') lines.push(`  a GitHub post waits for the owner — ${decision === 'ask' ? 'they asked to be asked each time' : 'they have not allowed the tool'}; omakase-box allow ${address} is their answer`);
      } catch { /* an unlistable repository leaves permission unsaid — post names it */ }
      if (full) {
        lines.push(`  record: ${result.recordPath}`);
        if (plan.task.file !== 'standard input') lines.push('  the task file stays where it is — the tool reads it and never commits or removes it');
      }
      const nextLine = `next: omakase-box post ${result.id} (--preview shows what becomes public)`;
      lines.push(nextLine);
      say(lines.join('\n'));
      if (jsonRequested) printDocument(createDocument(result, { reward: amount, waitsForOwner, next: nextLine.slice('next: '.length) }, out.join('\n').split('\n'), notices));
    } else if (subcommand === 'discover') {
      // The solver's half (PF24): no checkout needed; the owner's word and the agent's bookmark live outside every repository.
      const parsed = parse('discover');
      const minReward = parsed.values['--min-reward'];
      if (minReward !== undefined && !/^\d+$/.test(minReward)) throw new BountyRefused('reward-amount-invalid', `--min-reward "${minReward}" is not a whole dollar amount at or above 0; nothing was read or changed; next: pass a whole dollar amount`);
      const from = parsed.values['--from'];
      if (from !== undefined && from !== 'start' && from !== 'now') throw new BountyRefused('discover-from-invalid', '--from takes start or now; nothing was read or changed; next: omakase-box discover --from start, or --from now');
      const languages = parsed.repeated['--language'];
      if (jsonRequested) {
        // discover's document predates the notices field (BT19): its side lines stay on standard error, as status's do.
        setInstructionNoticeListener(line => console.error(line));
        setMergeNoticeListener(line => console.error(line));
      }
      const result = discover({
        ...(languages === undefined ? {} : { languages: [...languages] }),
        ...(parsed.switches.has('--any-language') ? { anyLanguage: true } : {}),
        ...(minReward === undefined ? {} : { minReward: Number(minReward) }),
        ...(from === undefined ? {} : { from })
      });
      // Shown first, then saved: a failure in between repeats these bounties next time, never skips them.
      if (parsed.switches.has('--json')) printDocument(discoverDocument(result));
      else say(renderDiscover(result).join('\n'));
      result.save();
    } else if (subcommand === 'take') {
      // The solver's half (PF25): no checkout needed; the workspace is a new folder outside every repository.
      const parsed = parse('take');
      const [id] = parsed.positionals;
      if (id === undefined) usageError('omakase-box take <id> [--into <new folder>]');
      const into = parsed.values['--into'];
      const result = takeBounty(id, into === undefined ? {} : { into: resolve(into) });
      if (jsonRequested) printDocument(takeDocument(result, id, notices));
      else say(result.lines.join('\n'));
    } else if (subcommand === 'submit') {
      // The solver's half (PF26): the draft becomes ready for review; no checkout needed.
      const parsed = parse('submit');
      const [id] = parsed.positionals;
      if (id === undefined) usageError('omakase-box submit <id>');
      const submitted = submitTakenResult(id);
      if (jsonRequested) printDocument(submitDocument(submitted, notices));
      else say(submitted.text);
    } else if (subcommand === 'find') {
      // Recall by purpose (BT28): one query over every readable record.
      const parsed = parse('find');
      const query = parsed.positionals.join(' ');
      const root = resolveRepoRoot(repoPath(parsed), 'find');
      if (parsed.switches.has('--json')) {
        setInstructionNoticeListener(line => console.error(line));
        setMergeNoticeListener(line => console.error(line));
        printDocument(findDocument(root, query));
      } else {
        sayActingOn(root);
        say(renderFind(root, query));
      }
    } else if (subcommand === 'status') {
      const parsed = parse('status');
      const [id] = parsed.positionals;
      // PF26: a bounty this account took is read from GitHub and the board's public answers; it needs no checkout.
      if (id !== undefined && loadTaken(id) !== null) {
        if (parsed.switches.has('--json') || parsed.switches.has('--full') || parsed.values['--since'] !== undefined) throw new BountyRefused('taken-status-options', `${id} is a bounty you took: its status prints text, and --comments adds what was written on its pull request; nothing was read; next: omakase-box status ${id} --comments`);
        say(attemptStatus(id, { comments: parsed.switches.has('--comments') }));
        return;
      }
      let root: string;
      try { root = resolveRepoRoot(repoPath(parsed), 'status'); }
      catch (error) {
        // Outside a checkout, the attempts this account took are still this command's to show.
        const taken = takenOverview();
        if (!(error instanceof BountyRefused) || error.reason !== 'not-a-repository' || parsed.values['--repo'] !== undefined || id !== undefined || taken.length === 0) throw error;
        say(taken.join('\n'));
        return;
      }
      const since = parsed.values['--since'];
      flushBoardHints(root);
      readBoardFacts(root, id);
      if (parsed.switches.has('--json')) {
        // BT19: one document on standard output and nothing else. Everything
        // the text view prints — the acting-on line, the once-only notices,
        // a recognised merge — is stderr here; --since is a text report
        // the document does not carry, so it is refused by name.
        if (since !== undefined) usageError('--since prints a text report the document does not carry; drop --json: omakase-box status --since <iso>');
        setInstructionNoticeListener(line => console.error(line));
        setMergeNoticeListener(line => console.error(line));
        printDocument(statusDocument(root, { ...(id === undefined ? {} : { id }), comments: parsed.switches.has('--comments') }, line => console.error(line)));
      } else {
        sayActingOn(root);
        say(renderStatus(root, { ...(id === undefined ? {} : { id }), full: parsed.switches.has('--full'), comments: parsed.switches.has('--comments') }));
        if (id === undefined) { const taken = takenOverview(); if (taken.length > 0) say(taken.join('\n')); }
        if (since !== undefined) say(renderSummary(root, since));
      }
    } else if (subcommand === 'post') {
      const parsed = parse('post');
      const to = parsed.values['--to'] ?? 'github';
      const [id, ...extraIds] = commandIds(parsed);
      // The two publication choices, moved from the removed `confirm`:
      // --with-changes says the task needs every uncommitted change to
      // tracked files (one tool-built commit on the bounty branch);
      // --include names an untracked file to publish, once per file. Both
      // show in --preview, and each makes the post wait for the owner.
      const withChanges = parsed.switches.has('--with-changes');
      const include = [...(parsed.repeated['--include'] ?? [])];
      if (id === undefined || extraIds.length > 0) usageError('omakase-box post <id> [--with-changes] [--include <file>] [--preview] [--repo <path>]');
      const repoRoot = resolveRepoRoot(repoPath(parsed), 'post');
      sayActingOn(repoRoot);
      if (parsed.switches.has('--preview')) {
        const facts = previewGitHubFacts(repoRoot, id, { withChanges, include });
        say(facts.preview);
        say('preview only — nothing was posted. Run again without --preview to publish it.');
        if (jsonRequested) printDocument(postPreviewDocument(id, facts, out.join('\n').split('\n'), notices));
        process.exit(0);
      }
      const { record, destination } = postBounty(repoRoot, id, to, { choice: { withChanges, include } });
      say(`${record.id} — posted — delivered to ${destination}`);
      if (record.github?.scanBinary !== undefined && record.github.scanBinary.length > 0) say(`scan: not scanned — Git treats them as binary: ${record.github.scanBinary.map(showPath).join(', ')}`);
      // Which written owner answer allowed the post is an audit fact —
      // `status <id> --full` carries it; the compact post stays at three lines.
      say(`next: omakase-box status reads the pull requests; omakase-box look ${record.id} <number> collects one and shows its change`);
      if (jsonRequested) printDocument(postDocument(record, destination, out, notices));
    } else if (subcommand === 'apply') {
      // Approval is the owner's, never the agent's (BT13): a flag that tries
      // to mark a merge as asked-for or approved is a named refusal that
      // changes nothing — kept in the option table's refused hook.
      const parsed = parse('apply');
      const [id, attemptText, ...extraIds] = commandIds(parsed);
      const attempt = attemptText !== undefined && /^\d+$/.test(attemptText) ? Number.parseInt(attemptText, 10) : undefined;
      if (id === undefined || extraIds.length > 0
        || (attemptText !== undefined && attempt === undefined)) {
        usageError('omakase-box apply [id] [<n>] [--repo <path>]');
      }
      const applyRoot = resolveRepoRoot(repoPath(parsed), 'apply');
      sayActingOn(applyRoot);
      const result = applyBounty(applyRoot, id, attempt);
      let notOnGitHub: { upstream: string | null; ahead: number | null; publish: string | null } | null = null;
      let nextLine: string | null = null;
      if (result.firstMergeNotice !== undefined) say(result.firstMergeNotice);
      if (result.payMessage !== undefined) for (const line of result.payMessage) say(line);
      if (result.record.github?.pending !== null && result.record.github?.pending !== undefined) say(result.record.github.pending);
      if (result.record.github?.closedNote !== undefined) say(`github: ${result.record.github.closedNote}`);
      if (result.outcome === 'applied') {
        // The saved job the bounty came from is what the agent returns to —
        // the compact form names it; the commit hash is `status --full`'s.
        say(`${result.record.id} — applied — attempt ${result.attempt} merged as ${result.mergeCommit} on this branch`);
        // BT37: the merge exists in this checkout only — say so and say the
        // exact publish command, in git's own convention (`git status` says
        // "Your branch is ahead of 'origin/main' by N commits. (use "git
        // push" to publish your local commits)"). The tool never pushes.
        // Two Git reads at most; a failed read or a detached HEAD states the
        // local fact alone — a count or command git did not provide is never
        // fabricated.
        const upstream = gitOutcome(applyRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).stdout.trim();
        if (upstream !== '') {
          const ahead = gitOutcome(applyRoot, ['rev-list', '--count', '@{u}..HEAD']).stdout.trim();
          notOnGitHub = { upstream, ahead: /^d+$/.test(ahead) ? Number(ahead) : null, publish: 'git push' };
          say(/^\d+$/.test(ahead)
            ? `not on GitHub yet: this branch is ${ahead} commit(s) ahead of ${upstream} — publish it with: git push`
            : `not on GitHub yet: this branch's upstream is ${upstream} — publish it with: git push`);
        } else {
          const branch = gitOutcome(applyRoot, ['branch', '--show-current']).stdout.trim();
          notOnGitHub = { upstream: null, ahead: null, publish: branch === '' ? null : remoteNamed(applyRoot, 'origin') ? `git push -u origin ${branch}` : null };
          say(branch === '' ? 'not on GitHub yet: the merge is local to this checkout'
            : remoteNamed(applyRoot, 'origin') ? `not on GitHub yet: this branch has no upstream — publish it with: git push -u origin ${branch}`
            : `not on GitHub yet: this branch (${branch}) has no upstream and this checkout has no remote named origin — publish it by pushing ${branch} to the repository's remote`);
        }
        if (result.record.github !== undefined) say('this merge counts for the solver once it is on the default branch on GitHub; the tool never pushes it');
        say(`ended — ${jobLine(result.record)}; to reverse it: git revert -m 1 ${result.mergeCommit}`);
        say(renderResume(result.record));
      } else {
        const branch = result.record.resume?.kind === 'recorded' ? result.record.resume.branch : 'the branch the bounty was created on';
        say(`${result.record.id} — merging attempt ${result.attempt} onto the current code conflicts in: ${(result.conflicts ?? []).map(showPath).join(', ')} — aborted; worktree and index are exactly as before`);
        const clean = result.clean ?? [];
        say(clean.length === 0
          ? 'none of the solution\'s files would merge cleanly'
          : `of the solution's files, these would merge cleanly: ${clean.map(showPath).join(', ')}`);
        const commits = result.commits ?? [];
        if (commits.length === 0) say(`no commit on this branch since ${result.base ?? 'the shared commit'} touches the clashing files`);
        else {
          say(`commits on this branch since ${result.base} that touch the clashing files:`);
          for (const line of commits) say(`  ${line}`);
        }
        say('a merge the agent performs itself runs under the owner\'s own Git settings — the tool\'s pins are not part of it');
        nextLine = `next: read the solution with omakase-box look ${result.record.id} ${result.attempt}; once the solution's commit is merged on ${branch} the next bounty command closes the bounty, or end it with omakase-box close ${result.record.id} --reason "<why>"`;
        say(nextLine);
      }
      if (jsonRequested) {
        const github = result.record.github;
        printDocument(applyDocument(result, {
          notOnGitHub, pending: github?.pending ?? null, closedNote: github?.closedNote ?? null, payMessage: result.payMessage ?? [], firstMergeNotice: result.firstMergeNotice ?? null,
          job: result.record.partOf ?? result.record.job?.file ?? result.record.title, next: nextLine?.slice('next: '.length) ?? null
        }, out.join(String.fromCharCode(10)).split(String.fromCharCode(10)), notices));
      }
    } else if (subcommand === 'look') {
      const parsed = parse('look');
      const [id, text, ...extraIds] = commandIds(parsed);
      const n = text !== undefined && /^\d+$/.test(text) ? Number.parseInt(text, 10) : undefined;
      if (id === undefined || extraIds.length > 0
        || n === undefined
        || (text !== undefined && n === undefined)) {
        usageError('omakase-box look [id] <n> [--full] [--export] [--json] [--repo <path>]');
      }
      const root = resolveRepoRoot(repoPath(parsed), subcommand);
      const asJson = parsed.switches.has('--json');
      // Under --json the acting-on line and any collection notice are
      // stderr — standard output carries the document alone (BT19).
      if (asJson) {
        setInstructionNoticeListener(line => console.error(line));
        setMergeNoticeListener(line => console.error(line));
        const acting = actingOn(root);
        if (acting !== null) console.error(acting);
      } else sayActingOn(root);
      const exporting = parsed.switches.has('--export');
      // The quarantined path prints none of the change; a JSON document
      // would carry the whole diff on standard output, so the two do not mix.
      if (exporting && asJson) usageError('--export writes the change to a file and prints none of it, and --json prints it; drop one: omakase-box look <id> <n> --export, or omakase-box look <id> <n> --json');
      const result = lookBounty(root, id, n!, { full: parsed.switches.has('--full'), whole: exporting });
      if (asJson) {
        printDocument(lookDocument(result));
      } else {
      const label = result.attempt.n;
      // The stranger-text label stays every time — the solver's words are
      // never the tool's own. The read-off-objects reassurance is the help's
      // standing explanation (BT17).
      say(`${id} solution ${label} — ${result.collected ? 'collected — ' : ''}written by the solver, not by the tool; nothing in it was run or checked out.`);
      // PF27: a pull request collected again at a new head: its number shows the latest version, which has its own solution number.
      if (result.attempt.pullRequest !== undefined && result.attempt.n !== result.attempt.pullRequest) say(`this is pull request #${result.attempt.pullRequest}'s latest version collected, solution ${label}; omakase-box apply ${id} ${result.attempt.pullRequest} takes this version.`);
      if (result.attempt.payTo !== undefined && (boundAmount(result.record) ?? 0) > 0) say(payToLine(result.attempt.payTo));
      // BT43: the solver's lines leave through the one renderer, inside its
      // labelled block, and the tool's own `next:` comes after the footer.
      if (exporting) {
        const written = exportLook(root, result);
        say(`exported, not printed — the file holds ${SOLVER_WORDS}: ${written.diffPath}`);
        say(`  sha256 ${written.sha256}; ${written.fileCount} file(s), ${written.lines} line(s), ${written.bytes} byte(s); manifest ${written.manifestPath}`);
        say('advice only: read the file in a session that has no write access to this checkout, then choose and apply from your own session; the file holds the change\'s raw bytes, so open it as text, not with cat in a terminal');
        say(`next: omakase-box apply ${id} ${label} chooses this solution; omakase-box status ${id} shows what else waits`);
      } else if (result.diff === null) {
        const tooLarge = result.tooLarge;
        if (tooLarge !== null) say(`${tooLarge.reason}: the change is ${tooLarge.bytes} bytes, over the ${tooLarge.limit} the tool prints; none of the diff is shown.`);
        say(`${tooLarge?.fileCount ?? result.files.length} file(s) changed:`);
        for (const line of solverBlock('solver', result.files)) say(line);
        if (tooLarge !== null && tooLarge.filesOmitted > 0) say(`${tooLarge.filesOmitted} more file name(s) are not listed; the list has the same limit.`);
        say(`next: ${tooLarge?.next ?? `omakase-box look ${id} ${label} --full prints the whole change; omakase-box apply ${id} ${label} chooses this solution`}`);
      } else {
        for (const line of solverBlock('solver', result.diff.split('\n'))) say(line);
        say(`next: omakase-box apply ${id} ${label} chooses this solution; omakase-box status ${id} shows what else waits`);
      }
      }
    } else if (subcommand === 'close') {
      const parsed = parse('close');
      const reason = parsed.values['--reason'];
      // PF25: an id the solver took is withdrawn on GitHub; it needs no checkout.
      const named = parsed.positionals[0];
      if (named !== undefined && parsed.positionals.length === 1 && loadTaken(named) !== null) {
        const withdrawn = closeTaken(named);
        if (jsonRequested) printDocument(closeAttemptDocument(named, withdrawn, notices)); else console.log(withdrawn);
        return;
      }
      const [id, ...extraIds] = commandIds(parsed);
      if (id === undefined || extraIds.length > 0) usageError('omakase-box close [id] [--reason "<text>"] [--repo <path>]');
      const closeRoot = resolveRepoRoot(repoPath(parsed), 'close');
      sayActingOn(closeRoot);
      const { record, outcome, payMessage } = closeBounty(closeRoot, id, reason);
      if (payMessage !== undefined) for (const line of payMessage) say(line);
      if (record.github?.pending !== null && record.github?.pending !== undefined) say(record.github.pending);
      if (record.github?.closedNote !== undefined) say(`github: ${record.github.closedNote}`);
      if (outcome === 'already-ended') {
        say(`${record.id} — already ended (${record.stage}) — nothing to do; ${jobLine(record)}`);
      } else {
        say(`${record.id} — ${record.stage} — ${record.stage === 'rejected' ? 'the reason is recorded' : 'the bounty is withdrawn'}; ${jobLine(record)}`);
      }
      if (jsonRequested) {
        printDocument(closeDocument({ outcome, record }, {
          reason: reason ?? null, pay: payMessage ?? [], pending: record.github?.pending ?? null, closedNote: record.github?.closedNote ?? null,
          job: record.partOf ?? record.job?.file ?? record.title
        }, out.join(String.fromCharCode(10)).split(String.fromCharCode(10)), notices));
      }
    } else if (subcommand === 'allow' || subcommand === 'deny' || subcommand === 'config') {
      // `allow` carries the repository's own money in the same breath
      // (BT11c): --reward and --reward-limit each take a whole-dollar amount.
      // These three keep authority-arguments for what is about values —
      // a repeated option, a missing amount (the parser's authority specs).
      const parsed = parse(subcommand);
      const values = [...parsed.positionals];
      const reward = parsed.values['--reward'];
      const rewardLimit = parsed.values['--reward-limit'];
      const money = reward === undefined && rewardLimit === undefined ? undefined
        : { ...(reward !== undefined ? { reward } : {}), ...(rewardLimit !== undefined ? { rewardLimit } : {}) };
      // `config set <name> <value>` is three words; four is allowed only for
      // `reward`/`reward-limit`'s repository target and for `paid`'s `no`.
      const withTarget = values[0] === 'set' && (values[1] === 'reward' || values[1] === 'reward-limit' || values[1] === 'paid');
      if (subcommand === 'config' && values.length !== 0 && values.length !== 3 && !(values.length === 4 && withTarget)) throw new BountyRefused('authority-arguments', 'unexpected arguments. Nothing changed; next: omakase-box allow [owner/name|waiting-id] [--ask] [--reward <whole dollars> --reward-limit <whole dollars>], omakase-box deny [owner/name], or omakase-box config [set|add|remove <setting> <value>]');
      let root: string | null = null;
      try { root = resolveRepoRoot(repoPath(parsed), subcommand); }
      catch (error) { if (!(error instanceof BountyRefused) || error.reason !== 'not-a-repository' || parsed.values['--repo'] !== undefined) throw error; }
      // BT61: the owner's word read from the settings the command left (typed state), beside the text it printed.
      const ownerFacts = (name: string | undefined) => {
        if (name?.startsWith('bt-')) return { kind: 'bounty' as const, repository: null, id: name, decision: null, reward: null, rewardLimit: null };
        let address: string | null = name ?? null;
        if (address === null && root !== null) { try { address = repositoryIdentity(root); } catch { address = null; } }
        const entry = address === null ? undefined : Object.entries(loadSettings().repositories).find(([key]) => key.toLowerCase() === address!.toLowerCase())?.[1];
        return { kind: 'repository' as const, repository: address, id: null, decision: entry?.bounty ?? null, reward: entry?.reward?.amount ?? null, rewardLimit: entry?.rewardLimit?.amount ?? null };
      };
      if (subcommand === 'allow') {
        const said = allowRepository(root, values[0], parsed.switches.has('--ask'), money, aside);
        if (jsonRequested) printDocument(ownerDocument('allow', ownerFacts(values[0]), said.split(String.fromCharCode(10)), notices)); else console.log(said);
      }
      else if (subcommand === 'deny') {
        const said = denyRepository(root, values[0]);
        if (jsonRequested) printDocument(ownerDocument('deny', ownerFacts(values[0]), said.split(String.fromCharCode(10)), notices)); else console.log(said);
      }
      else if (values.length === 0 && parsed.switches.has('--json')) {
        // One settings document on standard output; notices ride stderr (BT19).
        setInstructionNoticeListener(line => console.error(line));
        setMergeNoticeListener(line => console.error(line));
        printDocument(configDocument(root, line => console.error(line)));
      }
      else if (parsed.switches.has('--json')) usageError('--json reads the settings and config set|add|remove writes them; drop --json: omakase-box config set <name> <value>');
      else console.log(values.length === 0 ? renderConfig(root, { full: parsed.switches.has('--full') }) : changeConfig(root, values[0]!, values[1]!, values[2]!, text => console.log(text), values.length === 4 ? values[3] : undefined));
    } else if (subcommand === 'hook') {
      // BT9: the owner switches the hook on and off; hosts run the slot
      // commands. `hook start|pause|finish` is the one shared output command
      // every host's entry calls — silent with nothing to say, exit 0 always,
      // so a session is never blocked by it.
      const parsed = parse('hook');
      const [action] = parsed.positionals;
      const hostName = parsed.values['--host'];
      const explain = parsed.switches.has('--explain');
      const confirm = parsed.switches.has('--confirm');
      if (action === 'start' || action === 'pause' || action === 'finish') {
        if (hostName !== undefined || confirm) usageError(`omakase-box hook ${action} [--explain] [--repo <path>]`);
        let root: string | null = null;
        let rootRefusal: string | null = null;
        // Any refusal here (no checkout, Git itself unreadable or refusing)
        // is a silent exit-0: a session must never be blocked or made noisy
        // by the hook — --explain still says what happened, by name.
        try { root = resolveRepoRoot(repoPath(parsed), 'hook'); }
        catch (error) { if (!(error instanceof BountyRefused)) throw error; rootRefusal = error.reason; }
        if (root === null) {
          if (explain) console.log(rootRefusal === 'not-a-repository' ? 'nothing to report — not inside a Git checkout' : `nothing to report — the checkout could not be read (${rootRefusal ?? 'unreadable'})`);
          process.exit(0);
        }
        // Notices (a merge recognised while records were read, an
        // instruction refusal) are collected into the context lines — the
        // JSON envelope is the only stdout a host ever sees.
        const notices: string[] = [];
        setMergeNoticeListener(line => notices.push(line));
        setInstructionNoticeListener(line => notices.push(line));
        limitGitHubCalls(HOOK_GH_CALL_LIMIT_MS, HOOK_GH_CALL_COUNT, Date.now() + HOOK_GITHUB_BUDGET_MS);
        let run;
        try { run = runHook(root, action, notices); }
        catch { process.exit(0); }
        if (explain) console.log(run.lines.length === 0 ? 'nothing to report — no open bounties, nothing new' : run.lines.join('\n'));
        // The envelope is JSON a host decodes into an agent's context, where
        // an escape the stream guard wrote over its bytes would come back raw:
        // its strings (additionalContext) take the same escapes before encoding.
        else if (run.output !== null) console.log(JSON.stringify(JSON.parse(run.output) as unknown, (_key, value: unknown) => typeof value === 'string' ? escapeControls(value) : value));
        process.exit(0);
      }
      if (action === undefined) {
        showText('hook', hookStatus(resolveRepoRoot(repoPath(parsed), 'hook')), { action: 'status', host: null });
      } else if (action === 'on') {
        const host = hookHost(hostName);
        const root = resolveRepoRoot(repoPath(parsed), 'hook on');
        // Without --confirm the disclosure prints and nothing is written —
        // its last line names the outcome and the confirming command.
        showText('hook', confirm ? hookOn(root, host) : hookDisclosure(root, host), { action: confirm ? 'on' : 'disclosure', host: hostName ?? null });
      } else if (action === 'off') {
        if (confirm || explain) usageError('omakase-box hook off --host <name>');
        showText('hook', hookOff(resolveRepoRoot(repoPath(parsed), 'hook off'), hookHost(hostName)), { action: 'off', host: hostName ?? null });
      } else {
        usageError('omakase-box hook | omakase-box hook on|off --host <name> | omakase-box hook start|pause|finish [--explain]');
      }
    } else {
      usageError(`omakase-box ${subcommand} is not a bounty command — run omakase-box help for the journey`);
    }
  } catch (error) {
    if (error instanceof BountyUsage) usageError(error.message, error.lines);
    if (error instanceof BountyRefused) {
      const held = ['owner-allow-needed', 'owner-answer-needed', 'publish-held', 'merge-held'].includes(error.reason);
      // BT61: under --json a refusal is one document on standard output (standard error stays empty) with the exit code it has
      // today: 0 for a held answer, 3 for a refusal.
      if (jsonRequested) {
        printDocument(refusalDocument(commandName, error.reason, error.message, held ? 0 : 3));
        process.exit(held ? 0 : 3);
      }
      if (held) {
        console.log(error.message);
        process.exit(0);
      }
      console.error(`${subcommand ?? 'overview'} refused (${error.reason}): ${MULTI_LINE_REFUSALS.has(error.reason) ? error.message : oneLine(error.message)}`);
      process.exit(3);
    }
    if (jsonRequested) {
      printDocument(refusalDocument(commandName, 'failed', error instanceof Error ? error.message : String(error), 1));
      process.exit(1);
    }
    console.error(`${subcommand ?? 'overview'} failed: ${oneLine(error instanceof Error ? error.message : String(error))}`);
    process.exit(1);
  }
}
