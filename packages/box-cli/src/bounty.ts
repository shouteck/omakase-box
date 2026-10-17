// The `box bounty` command dispatch, shared by both entrypoints: the
// kitchen build (src/cli.ts, which also carries the older platform
// commands) and the published artifact (src/box.ts, the bounty tool alone).
// One code path — the tool behaves identically installed and from this
// repository.
import { resolve } from 'node:path';
import { actingOn, applyBounty, BountyRefused, BountyUsage, closeBounty, createBounty, allowRepository, denyRepository, renderConfig, changeConfig, renderSummary, parseCreateArgs, parseOptions, commandHelp, OPTIONS_NOTE, postBounty, readDecision, renderDescribe, renderHelp, renderPreview, renderRules, renderStatus, repoReward, requireRepository, resolveRepoRoot, setMergeNoticeListener, setInstructionNoticeListener, renderOverview, showPath, statusDocument, lookDocument, configDocument, HOOK_GH_CALL_COUNT, HOOK_GH_CALL_LIMIT_MS, HOOK_GITHUB_BUDGET_MS, hookDisclosure, hookHost, hookOff, hookOn, hookStatus, limitGitHubCalls, runHook } from '../../box-bounty/index.js';
import type { ParsedOptions } from '../../box-bounty/index.js';
import { previewGitHub } from '../../box-bounty/index.js';
import { findDocument, lookBounty, quoteForeign, renderFind, renderResume, openRecords, endedContaining, readGitPinsOncePerProcess, boundAmount, payToLine } from '../../box-bounty/index.js';

export interface BountyHost {
  /** print the message plus usage lines and exit 2 — the entrypoint's usage(). */
  readonly usage: (message?: string, lines?: readonly string[]) => never;
  /** `box --version`'s answer. */
  readonly version: () => string;
}

export async function runBounty(rest: readonly string[], host: BountyHost): Promise<void> {
  const [requested, ...commandArgs] = rest;
  // A leading option means the overview: `box bounty --repo <path>` (and
  // --help/--version below). Anything else is a subcommand name.
  const subcommand = requested !== undefined && !requested.startsWith('-') ? requested : undefined;
  const bountyArgs = subcommand === undefined ? rest : commandArgs;
  setInstructionNoticeListener(line => console.log(line));
  readGitPinsOncePerProcess(); // this process runs one command and exits
  // A reading command can recognise a solution the agent merged itself and
  // close the bounty — the one line saying so belongs to whichever command
  // noticed, printed the moment it happens.
  setMergeNoticeListener(line => console.log(line));
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
    if (eligible.length !== 1) throw new BountyRefused('bounty-ambiguous', `name a bounty: ${eligible.map(record => `${record.id} ${JSON.stringify(record.title)}`).join(', ') || 'none open'}; next: box bounty status`);
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
    if (line !== null) console.log(line);
  };
  try {
    // The commands BT7c removed: a typed name is a named refusal that says
    // what replaced it — never a silent drop, never an alias that runs the
    // old operation. The refusal line above names what was typed.
    const removed: Record<string, string> = {
      answer: 'collection is a step inside look and apply, not a command — box bounty look <id> <number> collects a pull request and shows its change; box bounty apply <id> <number> collects and merges',
      questions: 'reading what other accounts wrote is part of status — box bounty status <id> --comments',
      reply: 'the tool no longer writes comments for you — comment on the issue in your own words with your own gh, for example gh issue comment <number> --body "<your own words>"',
      undo: 'the tool no longer reverses an applied merge — the merge is one ordinary commit and ordinary Git reverses it: git revert -m 1 <merge>',
      reject: 'ending a bounty with nothing merged is one command now — box bounty close <id> --reason "<why>" keeps the reason on the record',
      withdraw: 'ending a bounty with nothing merged is one command now — box bounty close <id>',
      remind: 'the tool no longer supplies reminders; box bounty shows the current overview',
      confirm: 'the owner allows the tool once, not each bounty — preview with box bounty post <id> --preview, publish with box bounty post <id>; the owner uses box bounty allow, deny and config'
    };
    if (removed[subcommand!] !== undefined) {
      throw new BountyRefused('command-removed', removed[subcommand!]!);
    }
    if (subcommand === 'owner') {
      const replacements: Record<string, string> = { setup: 'box bounty config', allow: 'box bounty allow', ask: 'box bounty allow --ask', off: 'box bounty deny', on: 'box bounty allow', answer: 'box bounty allow <waiting-bounty-id>', summary: 'box bounty status --since <iso>' };
      throw new BountyRefused('command-removed', `owner ${bountyArgs[0] ?? ''} was removed; use ${replacements[bountyArgs[0] ?? ''] ?? 'box bounty allow, box bounty deny or box bounty config'}. Nothing changed`);
    }
    if (subcommand === undefined) {
      // `box bounty --version` — the package version, like `box --version`.
      if (bountyArgs.includes('--version')) {
        console.log(host.version());
        process.exit(0);
      }
      const parsed = parse('overview');
      try { console.log(renderOverview(resolveRepoRoot(repoPath(parsed), 'overview'))); }
      catch (error) {
        if (!(error instanceof BountyRefused) || error.reason !== 'not-a-repository' || parsed.values['--repo'] !== undefined) throw error;
        console.log(renderDescribe(null));
      }
    } else if (subcommand === 'help') {
      // Works outside a checkout too — it reads no repository.
      parse('help');
      console.log(`${renderHelp()}\n\n${OPTIONS_NOTE}`);
    } else if (subcommand === 'describe') {
      // Works outside a checkout too — without a repository it prints the
      // description and says the live facts need one.
      const parsed = parse('describe');
      let described: string | null = null;
      try {
        described = resolveRepoRoot(repoPath(parsed), 'describe');
      } catch (error) {
        if (!(error instanceof BountyRefused)) throw error; // not-a-repository → the description alone prints
      }
      console.log(parsed.switches.has('--rules') ? renderRules(described) : renderDescribe(described));
    } else if (subcommand === 'create') {
      const parsed = parseCreateArgs(bountyArgs);
      if (parsed.help === true) {
        console.log(commandHelp('create'));
        process.exit(0);
      }
      // --task stays a usage error; a missing --why is the named refusal
      // missing-why, thrown by planBounty — not a usage wall.
      if (parsed.task === undefined) host.usage('bounty create needs --task <file|-> (and --why "<one line>") — run box bounty help');
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
      if (full) {
        console.log(renderPreview(result.plan));
      }
      const plan = result.plan;
      const lines = [`${result.id} — drafted in ${plan.repoRoot}`];
      for (const hit of plan.scan.hits) lines.push(`  scan hit: ${hit.path}:${hit.line} — ${hit.rule}`);
      if (plan.scan.binary.length > 0) lines.push(`  not scanned — Git would treat them as binary: ${plan.scan.binary.join(', ')}`);
      for (const entry of plan.ruleRemovals) lines.push(`  never-ship removed (${entry.rule}): ${entry.removed}`);
      if (plan.titleShortened) lines.push(`  title: ${plan.title} (shortened)`);
      const { amount } = repoReward(plan.repoRoot);
      if (amount > 0) lines.push(`  states $${amount} when posted — the reward in force now for this repository`);
      try {
        const address = requireRepository(plan.repoRoot);
        const decision = readDecision(plan.repoRoot).decision;
        if (decision !== 'allowed') lines.push(`  a GitHub post waits for the owner — ${decision === 'ask' ? 'they asked to be asked each time' : 'they have not allowed the tool'}; box bounty allow ${address} is their answer`);
      } catch { /* an unlistable repository leaves permission unsaid — post names it */ }
      if (full) {
        lines.push(`  record: ${result.recordPath}`);
        if (plan.task.file !== 'standard input') lines.push('  the task file stays where it is — the tool reads it and never commits or removes it');
      }
      lines.push(`next: box bounty post ${result.id} (--preview shows what becomes public)`);
      console.log(lines.join('\n'));
    } else if (subcommand === 'find') {
      // Recall by purpose (BT28): one query over every readable record.
      const parsed = parse('find');
      const query = parsed.positionals.join(' ');
      const root = resolveRepoRoot(repoPath(parsed), 'find');
      if (parsed.switches.has('--json')) {
        setInstructionNoticeListener(line => console.error(line));
        setMergeNoticeListener(line => console.error(line));
        console.log(JSON.stringify(findDocument(root, query)));
      } else {
        sayActingOn(root);
        console.log(renderFind(root, query));
      }
    } else if (subcommand === 'status') {
      const parsed = parse('status');
      const [id] = parsed.positionals;
      const root = resolveRepoRoot(repoPath(parsed), 'status');
      const since = parsed.values['--since'];
      if (parsed.switches.has('--json')) {
        // BT19: one document on standard output and nothing else. Everything
        // the text view prints — the acting-on line, the once-only notices,
        // a recognised merge — is stderr here; --since is a text report
        // the document does not carry, so it is refused by name.
        if (since !== undefined) throw new BountyRefused('json-not-supported', '--since prints a text report — run box bounty status --since <iso> without --json');
        setInstructionNoticeListener(line => console.error(line));
        setMergeNoticeListener(line => console.error(line));
        console.log(JSON.stringify(statusDocument(root, { ...(id === undefined ? {} : { id }), comments: parsed.switches.has('--comments') }, line => console.error(line))));
      } else {
        sayActingOn(root);
        console.log(renderStatus(root, { ...(id === undefined ? {} : { id }), full: parsed.switches.has('--full'), comments: parsed.switches.has('--comments') }));
        if (since !== undefined) console.log(renderSummary(root, since));
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
      if (id === undefined || extraIds.length > 0) host.usage('box bounty post <id> [--with-changes] [--include <file>] [--preview] [--repo <path>]');
      const repoRoot = resolveRepoRoot(repoPath(parsed), 'post');
      sayActingOn(repoRoot);
      if (parsed.switches.has('--preview')) {
        console.log(previewGitHub(repoRoot, id, { withChanges, include }));
        console.log('preview only — nothing was posted. Run again without --preview to publish it.');
        process.exit(0);
      }
      const { record, destination } = postBounty(repoRoot, id, to, { choice: { withChanges, include } });
      console.log(`${record.id} — posted — delivered to ${destination}`);
      if (record.github?.scanBinary !== undefined && record.github.scanBinary.length > 0) console.log(`scan: not scanned — Git treats them as binary: ${record.github.scanBinary.join(', ')}`);
      // Which written owner answer allowed the post is an audit fact —
      // `status <id> --full` carries it; the compact post stays at three lines.
      console.log(`next: box bounty status reads the pull requests; box bounty look ${record.id} <number> collects one and shows its change`);
    } else if (subcommand === 'apply') {
      // Approval is the owner's, never the agent's (BT13): a flag that tries
      // to mark a merge as asked-for or approved is a named refusal that
      // changes nothing — kept in the option table's refused hook.
      const parsed = parse('apply');
      const [id, attemptText, ...extraIds] = commandIds(parsed);
      const attempt = attemptText !== undefined && /^\d+$/.test(attemptText) ? Number.parseInt(attemptText, 10) : undefined;
      if (id === undefined || extraIds.length > 0
        || (attemptText !== undefined && attempt === undefined)) {
        host.usage('box bounty apply [id] [<n>] [--repo <path>]');
      }
      const applyRoot = resolveRepoRoot(repoPath(parsed), 'apply');
      sayActingOn(applyRoot);
      const result = applyBounty(applyRoot, id, attempt);
      if (result.firstMergeNotice !== undefined) console.log(result.firstMergeNotice);
      if (result.payMessage !== undefined) for (const line of result.payMessage) console.log(line);
      if (result.record.github?.pending !== null && result.record.github?.pending !== undefined) console.log(result.record.github.pending);
      if (result.record.github?.closedNote !== undefined) console.log(`github: ${result.record.github.closedNote}`);
      if (result.outcome === 'applied') {
        // The saved job the bounty came from is what the agent returns to —
        // the compact form names it; the commit hash is `status --full`'s.
        console.log(`${result.record.id} — applied — attempt ${result.attempt} merged as ${result.mergeCommit} on this branch`);
        console.log(`ended — ${jobLine(result.record)}; to reverse it: git revert -m 1 ${result.mergeCommit}`);
        console.log(renderResume(result.record));
      } else {
        const branch = result.record.resume?.kind === 'recorded' ? result.record.resume.branch : 'the branch the bounty was created on';
        console.log(`${result.record.id} — merging attempt ${result.attempt} onto the current code conflicts in: ${(result.conflicts ?? []).map(showPath).join(', ')} — aborted; worktree and index are exactly as before`);
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
      const parsed = parse('look');
      const [id, text, ...extraIds] = commandIds(parsed);
      const n = text !== undefined && /^\d+$/.test(text) ? Number.parseInt(text, 10) : undefined;
      if (id === undefined || extraIds.length > 0
        || n === undefined
        || (text !== undefined && n === undefined)) {
        host.usage('box bounty look [id] <n> [--full] [--json] [--repo <path>]');
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
      const result = lookBounty(root, id, n!, { full: parsed.switches.has('--full') });
      if (asJson) {
        console.log(JSON.stringify(lookDocument(result)));
      } else {
      const label = result.attempt.n;
      // The stranger-text label stays every time — the solver's words are
      // never the tool's own. The read-off-objects reassurance is the help's
      // standing explanation (BT17).
      console.log(`${id} solution ${label} — ${result.collected ? 'collected — ' : ''}written by the solver, not by the tool; nothing in it was run or checked out.`);
      if (result.attempt.payTo !== undefined && (boundAmount(result.record) ?? 0) > 0) console.log(payToLine(result.attempt.payTo));
      if (result.diff === null) {
        console.log(`${result.files.length} file(s) changed:`);
        for (const file of result.files) console.log(`solver change | ${quoteForeign(file)}`);
        console.log(`next: box bounty look ${id} ${label} --full prints the whole change; box bounty apply ${id} ${label} chooses this solution`);
      } else {
        for (const line of result.diff.split('\n')) console.log(`solver change | ${quoteForeign(line)}`);
        console.log(`next: box bounty apply ${id} ${label} chooses this solution; box bounty status ${id} shows what else waits`);
      }
      }
    } else if (subcommand === 'close') {
      const parsed = parse('close');
      const reason = parsed.values['--reason'];
      const [id, ...extraIds] = commandIds(parsed);
      if (id === undefined || extraIds.length > 0) host.usage('box bounty close [id] [--reason "<text>"] [--repo <path>]');
      const closeRoot = resolveRepoRoot(repoPath(parsed), 'close');
      sayActingOn(closeRoot);
      const { record, outcome, payMessage } = closeBounty(closeRoot, id, reason);
      if (payMessage !== undefined) for (const line of payMessage) console.log(line);
      if (record.github?.pending !== null && record.github?.pending !== undefined) console.log(record.github.pending);
      if (record.github?.closedNote !== undefined) console.log(`github: ${record.github.closedNote}`);
      if (outcome === 'already-ended') {
        console.log(`${record.id} — already ended (${record.stage}) — nothing to do; ${jobLine(record)}`);
      } else {
        console.log(`${record.id} — ${record.stage} — ${record.stage === 'rejected' ? 'the reason is recorded' : 'the bounty is withdrawn'}; ${jobLine(record)}`);
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
      const namedMoney = values[0] === 'set' && (values[1] === 'reward' || values[1] === 'reward-limit');
      if (subcommand === 'config' && values.length !== 0 && values.length !== 3 && !(values.length === 4 && namedMoney)) throw new BountyRefused('authority-arguments', 'unexpected arguments; use allow [owner/name|waiting-id] [--ask] [--reward <whole dollars> --reward-limit <whole dollars>], deny [owner/name], or config [set|add|remove <setting> <value>]. Nothing changed');
      let root: string | null = null;
      try { root = resolveRepoRoot(repoPath(parsed), subcommand); }
      catch (error) { if (!(error instanceof BountyRefused) || error.reason !== 'not-a-repository' || parsed.values['--repo'] !== undefined) throw error; }
      if (subcommand === 'allow') console.log(allowRepository(root, values[0], parsed.switches.has('--ask'), money, text => console.log(text)));
      else if (subcommand === 'deny') console.log(denyRepository(root, values[0]));
      else if (values.length === 0 && parsed.switches.has('--json')) {
        // One settings document on standard output; notices ride stderr (BT19).
        setInstructionNoticeListener(line => console.error(line));
        setMergeNoticeListener(line => console.error(line));
        console.log(JSON.stringify(configDocument(root, line => console.error(line))));
      }
      else if (parsed.switches.has('--json')) throw new BountyRefused('json-not-supported', '--json reads the settings — config set|add|remove writes them; run it without --json. Nothing changed');
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
        if (hostName !== undefined || confirm) host.usage(`box bounty hook ${action} [--explain] [--repo <path>]`);
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
        else if (run.output !== null) console.log(run.output);
        process.exit(0);
      }
      if (action === undefined) {
        console.log(hookStatus(resolveRepoRoot(repoPath(parsed), 'hook')));
      } else if (action === 'on') {
        const host = hookHost(hostName);
        const root = resolveRepoRoot(repoPath(parsed), 'hook on');
        // Without --confirm the disclosure prints and nothing is written —
        // its last line names the outcome and the confirming command.
        console.log(confirm ? hookOn(root, host) : hookDisclosure(root, host));
      } else if (action === 'off') {
        if (confirm || explain) host.usage('box bounty hook off --host <name>');
        console.log(hookOff(resolveRepoRoot(repoPath(parsed), 'hook off'), hookHost(hostName)));
      } else {
        host.usage('box bounty hook | box bounty hook on|off --host <name> | box bounty hook start|pause|finish [--explain]');
      }
    } else {
      host.usage(`box bounty ${subcommand} is not a bounty command — run box bounty help for the journey`);
    }
  } catch (error) {
    if (error instanceof BountyUsage) host.usage(error.message, error.lines);
    if (error instanceof BountyRefused) {
      if (['owner-allow-needed', 'owner-answer-needed', 'publish-held', 'merge-held'].includes(error.reason)) {
        console.log(error.message);
        process.exit(0);
      }
      console.error(`bounty ${subcommand ?? 'overview'} refused (${error.reason}): ${error.message}`);
      process.exit(3);
    }
    console.error(`bounty ${subcommand ?? 'overview'} failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
