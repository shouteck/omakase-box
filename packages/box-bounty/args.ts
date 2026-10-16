// Argument parsing for `box bounty`, pure and testable (BT18).
//
// One table — BOUNTY_COMMANDS — is every option each command accepts: an
// option is either listed there and understood, or refused by name. One
// function — parseOptions — applies the same rules to every command:
//
//   1. --help or -h where an option name or a positional is expected: the
//      command prints its usage and does nothing else (parseOptions returns
//      { help: true }). The word after an option that takes a value is that
//      value, whatever it looks like — `close --reason -h` records `-h` as
//      the reason, as git and gh do (BT26).
//   2. --name=value is read exactly as --name value; a switch given a value
//      is a usage error ("--full takes no value").
//   3. The named refusals run before the unknown-option rule: retired,
//      removed and money spellings each keep their own reason.
//   4. --json is a named refusal (json-not-supported) on every command
//      whose table entry does not list it — status, look and config take
//      it (BT19); every other command still refuses it by name.
//   5. Any other option is a usage error naming it and the command.
//   6. An option that takes a value, given none, is a usage error — none
//      means the line ends or the next word is another option the command
//      lists; every other word is the value, dashes and all.
//   7. An option given twice is a usage error — --include is the only
//      repeatable one.
//   8. More positionals than the command takes is a usage error naming the
//      extra word.
//   9. "-" alone is a positional (standard input), never an option; any
//      other dash word that names nothing is an unknown option.
//
// allow/deny/config keep their authority-arguments refusal (exit 3) where it
// is about values — a repeated option, a missing amount; unknown options
// there are the same usage error as everywhere else.

import { BountyRefused } from './errors.js';

export class BountyUsage extends Error {
  /** The usage lines printed after the message; undefined means the whole list. */
  readonly lines?: readonly string[];
  constructor(message: string, lines?: readonly string[]) {
    super(message);
    this.name = 'BountyUsage';
    if (lines !== undefined) this.lines = lines;
  }
}

// Said once on the help screen — the parser keeps it true. (No removed
// command's name may appear here — the help test forbids them.)
export const OPTIONS_NOTE = '--help works on every command, printing that command\'s usage; --name=value is the same as --name value.';

export interface OptionRule {
  /** How the value shows in usage and help, e.g. '<path>' — value options only. */
  readonly arg?: string;
  /** One line on what it does, printed by --help. */
  readonly help: string;
  /** The option may be repeated (only --include is). */
  readonly repeatable?: boolean;
  /** allow/deny/config word a missing value with this phrase ("a path"). */
  readonly missing?: string;
}

export interface CommandSpec {
  /** 'box bounty status' — how errors and refusals name the command. */
  readonly label: string;
  /** 'box bounty status [<id>] ...' — the usage line --help and usage errors print. */
  readonly usage: string;
  /** One line on what the command does — its line from `bounty help`. */
  readonly blurb: string;
  /** Positionals accepted; one more is a usage error naming the word. */
  readonly positionals: number;
  readonly values?: Readonly<Record<string, OptionRule>>;
  readonly switches?: Readonly<Record<string, OptionRule>>;
  /** keep authority-arguments (exit 3) for repeated options and missing values. */
  readonly authority?: boolean;
  /**
   * The named refusals that outrank the unknown-option rule, called per
   * option token before the table lookup; `value` is the `--name=value`
   * part or the next word. Return a refusal, or undefined to keep parsing.
   */
  readonly refused?: (flag: string, value: string | undefined) => BountyRefused | undefined;
}

const REPO: OptionRule = { arg: '<path>', missing: 'a path', help: 'the checkout to work in, instead of the current folder' };
const AMOUNT: OptionRule = { arg: '<whole dollars>', missing: 'a whole dollar amount', help: '' };

// Checks were removed on 11 October 2026: a bounty is the task, the note and
// the code, and nothing a solver wrote is ever run. The old command flags —
// --setup, --check and --guard — are not accepted at all: each is a NAMED
// refusal (`checks-removed`), so an agent reusing an old command line gets a
// reason that says checks were removed, never a silent drop.
const RETIRED_FLAGS: Readonly<Record<string, string>> = { '--note': 'put what you tried in the task file', '--job': 'put the unfinished work and the larger job in --resume', '--preview': 'create a private draft; post --preview shows what would become public' };
const REMOVED_FLAGS = new Set(['--setup', '--check', '--guard']);
// Money is the owner's to set, never the agent's (BT11a): create and post
// take no amount flag at all, and each spelling an agent might try is a
// named refusal, not a silent drop.
const AMOUNT_FLAGS = new Set(['--reward', '--amount', '--price', '--pay', '--payment', '--limit', '--budget', '--dollars']);
const amountRefusal = (flag: string, command: string): BountyRefused | undefined =>
  AMOUNT_FLAGS.has(flag)
    ? new BountyRefused('reward-agent-set', `${flag} names money — the reward is the owner's to set, never the agent's; ${command} takes no amount. The owner sets it with box bounty config set reward <whole dollars>`)
    : undefined;
const folderRefusal = (flag: string): BountyRefused | undefined =>
  flag === '--from'
    ? new BountyRefused('folder-delivery-retired', 'folder solutions were retired; collect a pull request with box bounty look <id> <number> or box bounty apply <id> <number>. Nothing changed')
    : undefined;

export const BOUNTY_COMMANDS: Readonly<Record<string, CommandSpec>> = {
  overview: {
    label: 'box bounty', usage: 'box bounty [--repo <path>]',
    blurb: 'the standing picture — every open bounty, what each waits on, and the next step',
    positionals: 0,
    values: { '--repo': REPO }
  },
  help: {
    label: 'box bounty help', usage: 'box bounty help',
    blurb: 'the whole journey on one screen — what each command does and the stage it leaves',
    positionals: 0
  },
  describe: {
    label: 'box bounty describe', usage: 'box bounty describe [--rules] [--repo <path>]',
    blurb: 'what the tool does, when it is worth using and when not, plus the facts to choose',
    positionals: 0,
    values: { '--repo': REPO },
    switches: { '--rules': { help: "print the block for a project's rules file" } }
  },
  create: {
    label: 'box bounty create', usage: 'box bounty create --task <file|-> --why "<one line>" [--title "<one line>"] [--resume "<context>"] [--repo <path>]',
    blurb: 'save the task and private context and snapshot the working state → drafted',
    positionals: 0,
    values: {
      '--task': { arg: '<file|->', help: 'the task file written for the solver; "-" reads standard input' },
      '--why': { arg: '"<one line>"', help: 'one line on why the work is handed off' },
      '--title': { arg: '"<one line>"', help: 'the bounty title; derived from the task when omitted' },
      '--resume': { arg: '"<context>"', help: 'private context for unfinished work and the larger job' },
      '--repo': REPO
    },
    switches: { '--full': { help: 'print the draft preview' } },
    refused: (flag) => {
      if (RETIRED_FLAGS[flag] !== undefined) return new BountyRefused('create-option-retired', `${flag} was retired; ${RETIRED_FLAGS[flag]}. Nothing changed`);
      if (flag === '--out') return new BountyRefused('folder-delivery-retired', 'create writes a local record only; post to GitHub with box bounty post <id>. A private repository cannot be handed off with this tool');
      if (REMOVED_FLAGS.has(flag)) return new BountyRefused('checks-removed', `${flag} names a check — checks were removed on 11 October 2026. A bounty carries no command and the tool runs nothing a solver wrote; pass --task <file> and --why "<one line>"`);
      return amountRefusal(flag, 'create');
    }
  },
  status: {
    label: 'box bounty status', usage: 'box bounty status [<id>] [--full] [--comments] [--since <iso>] [--json] [--repo <path>]',
    blurb: 'every open bounty, the pull requests waiting, the attempts and the next step',
    positionals: 1,
    values: {
      '--since': { arg: '<iso>', help: 'also print the summary of what changed since that time' },
      '--repo': REPO
    },
    switches: {
      '--full': { help: 'add history and the full reports' },
      '--comments': { help: 'print comments written by others, marked as theirs' },
      '--json': { help: 'print one JSON document (schema box-bounty/status@1) instead of text' }
    }
  },
  post: {
    label: 'box bounty post', usage: 'box bounty post [<id>] [--with-changes] [--include <file>] [--preview] [--repo <path>]',
    blurb: 'publishes the GitHub issue and branch → posted — or waits on the owner',
    positionals: 1,
    values: {
      '--include': { arg: '<file>', repeatable: true, help: 'publish this untracked file too; once per file' },
      '--to': { arg: 'github', help: 'the destination — github is the only one' },
      '--repo': REPO
    },
    switches: {
      '--with-changes': { help: 'the task needs every uncommitted change to tracked files' },
      '--preview': { help: 'show exactly what becomes public; posts nothing' }
    },
    refused: (flag, value) => {
      if (flag === '--to' && value !== 'github') return new BountyRefused('folder-delivery-retired', 'folder delivery was retired; post to GitHub with box bounty post <id>. A private repository cannot be handed off with this tool');
      return amountRefusal(flag, 'post');
    }
  },
  look: {
    label: 'box bounty look', usage: 'box bounty look [<id>] <n> [--full] [--json] [--repo <path>]',
    blurb: 'collect pull request <n> (or show solution <n> already collected) — its change, written by the solver and marked as theirs',
    positionals: 2,
    values: { '--repo': REPO },
    switches: {
      '--full': { help: 'print the whole change, however large' },
      '--json': { help: 'print one JSON document (schema box-bounty/look@1) instead of text' }
    },
    refused: folderRefusal
  },
  apply: {
    label: 'box bounty apply', usage: 'box bounty apply [<id>] [<n>] [--repo <path>]',
    blurb: 'merge a solution onto the current code — collects like look when <n> names a pull request → applied',
    positionals: 2,
    values: { '--repo': REPO },
    refused: (flag) => folderRefusal(flag)
      ?? (/^--(yes|ok|approve|approved|allow|allowed|owner|force|confirm|answered|permit|accept|asked|skip-ask|no-ask|without-ask|i-asked)/.test(flag)
        ? new BountyRefused('merge-approval-agent', `${flag} tries to mark a merge approved — an agent cannot approve a merge; the owner answers a waiting merge with box bounty allow <id>. Nothing changed`)
        : undefined)
  },
  close: {
    label: 'box bounty close', usage: 'box bounty close [<id>] [--reason "<text>"] [--repo <path>]',
    blurb: 'end a bounty with nothing merged → rejected with --reason, withdrawn without',
    positionals: 1,
    values: {
      '--reason': { arg: '"<text>"', help: 'the why, kept on the record' },
      '--repo': REPO
    }
  },
  allow: {
    label: 'box bounty allow', usage: 'box bounty allow [owner/name|waiting-id] [--ask] [--reward <whole dollars> --reward-limit <whole dollars>] [--repo <path>]',
    blurb: 'the owner allows the tool — for this repository, or by default; answers a waiting bounty or merge',
    positionals: 1,
    authority: true,
    values: {
      '--reward': { ...AMOUNT, help: 'the reward for one bounty, in whole dollars' },
      '--reward-limit': { ...AMOUNT, help: 'the most one bounty may state, in whole dollars' },
      '--repo': REPO
    },
    switches: { '--ask': { help: 'the tool asks before each post rather than posting freely' } }
  },
  deny: {
    label: 'box bounty deny', usage: 'box bounty deny [owner/name] [--repo <path>]',
    blurb: 'the owner refuses the tool for this repository',
    positionals: 1,
    authority: true,
    values: { '--repo': REPO }
  },
  config: {
    label: 'box bounty config', usage: 'box bounty config [set|add|remove <setting> <value> [owner/name]] [--full] [--json] [--repo <path>]',
    blurb: "the owner's settings — the reward, the repository list, what the tool may do",
    positionals: 4,
    authority: true,
    values: { '--repo': REPO },
    switches: {
      '--full': { help: 'print every setting and where it came from' },
      '--json': { help: 'print one JSON document (schema box-bounty/config@1) instead of text' }
    }
  },
  hook: {
    label: 'box bounty hook', usage: 'box bounty hook | box bounty hook on|off --host <name> | box bounty hook start|pause|finish [--explain] [--repo <path>]',
    blurb: 'owner-opt-in awareness at session moments: on|off per host; start|pause|finish is what a host entry runs',
    positionals: 1,
    values: {
      '--host': { arg: '<name>', help: 'the host the hook is for' },
      '--repo': REPO
    },
    switches: {
      '--explain': { help: 'print what the hook would report instead of the host envelope' },
      '--confirm': { help: 'the second run that actually switches the hook on' }
    }
  }
};

export interface ParsedOptions {
  /** --help or -h appeared anywhere: print commandHelp(command), exit 0, do nothing else. */
  readonly help: boolean;
  readonly positionals: readonly string[];
  /** Value options used once: their value. */
  readonly values: Readonly<Record<string, string>>;
  /** The repeatable options used: every value in order. */
  readonly repeated: Readonly<Record<string, readonly string[]>>;
  readonly switches: ReadonlySet<string>;
}

// `usage: <the command's line>` — for --help; usage errors print the same line.
export function commandHelp(command: string): string {
  const spec = BOUNTY_COMMANDS[command];
  if (spec === undefined) throw new Error(`no option table for ${command}`);
  const lines = [`usage: ${spec.usage}`, `  ${spec.blurb}`];
  for (const [flag, rule] of Object.entries(spec.values ?? {})) lines.push(`  ${flag}${rule.arg === undefined ? '' : ` ${rule.arg}`} — ${rule.help}`);
  for (const [flag, rule] of Object.entries(spec.switches ?? {})) lines.push(`  ${flag} — ${rule.help}`);
  return lines.join('\n');
}

export function parseOptions(command: string, argv: readonly string[]): ParsedOptions {
  const spec = BOUNTY_COMMANDS[command];
  if (spec === undefined) throw new Error(`no option table for ${command}`);
  const empty = { help: true as const, positionals: [], values: {}, repeated: {}, switches: new Set<string>() };
  // 1. Help where an option name or a positional is expected wins over
  //    everything — the command does nothing else. The word after an option
  //    that takes a value is its value and is skipped here (a `--name=`
  //    word carries its value inside itself), so `--reason -h` is a value
  //    while `close --reason x -h` still prints help.
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === '--help' || token === '-h') return empty;
    if (token.startsWith('-') && token !== '-' && !token.includes('=') && spec.values?.[token] !== undefined) i += 1;
  }
  // 3. The named refusals scan the whole line before any option can be
  //    unknown (5); --json is itself a named refusal (4).
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('-') || token === '-') continue;
    const equals = token.indexOf('=');
    const flag = equals < 0 ? token : token.slice(0, equals);
    const refusal = spec.refused?.(flag, equals < 0 ? argv[i + 1] : token.slice(equals + 1));
    if (refusal !== undefined) throw refusal;
    if (flag === '--json' && spec.switches?.['--json'] === undefined) throw new BountyRefused('json-not-supported', `--json is not available on ${spec.label} yet`);
  }
  const positionals: string[] = [];
  const values: Record<string, string> = {};
  const repeated: Record<string, string[]> = {};
  const switches = new Set<string>();
  const fail = (message: string): never => { throw new BountyUsage(message, [`usage: ${spec.usage}`]); };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    // 9. "-" alone is a positional; any other dash word that names nothing
    //    is an unknown option — it can never read as an id.
    if (!token.startsWith('-') || token === '-') {
      positionals.push(token);
      // 8. More positionals than the command takes names the extra word.
      if (positionals.length > spec.positionals) fail(`unexpected argument ${token}`);
      continue;
    }
    const equals = token.indexOf('=');
    const flag = equals < 0 ? token : token.slice(0, equals);
    const inline = equals < 0 ? undefined : token.slice(equals + 1);
    const switchRule = spec.switches?.[flag];
    if (switchRule !== undefined) {
      // 2. A switch takes no value — not even through "=".
      if (inline !== undefined) fail(`${flag} takes no value`);
      if (switches.has(flag)) {
        // 7. allow/deny/config keep authority-arguments for a repeated option.
        if (spec.authority === true) throw new BountyRefused('authority-arguments', `${flag} was repeated; nothing changed`);
        fail(`${flag} was given twice`);
      }
      switches.add(flag);
      continue;
    }
    const rule = spec.values?.[flag];
    if (rule !== undefined) {
      let value: string | undefined = inline;
      if (value === undefined) {
        // 6. A value option with none — end of arguments, or a next word
        //    that names an option the command lists. Every other word is
        //    the value, whatever it looks like: `-`, `-h`, `--help`, an
        //    unknown option — the git rule for an option needing a value.
        const next = argv[i + 1];
        const namesOption = (word: string): boolean => {
          if (!word.startsWith('-') || word === '-') return false;
          const name = word.includes('=') ? word.slice(0, word.indexOf('=')) : word;
          return spec.values?.[name] !== undefined || spec.switches?.[name] !== undefined;
        };
        if (next === undefined || namesOption(next)) {
          if (spec.authority === true) throw new BountyRefused('authority-arguments', `${flag} needs ${rule.missing ?? 'a value'}; nothing changed`);
          throw new BountyUsage(`${flag} needs a value`, [`usage: ${spec.usage}`]);
        }
        value = next;
        i += 1;
      }
      if (rule.repeatable === true) (repeated[flag] ??= []).push(value);
      else if (values[flag] !== undefined) {
        if (spec.authority === true) throw new BountyRefused('authority-arguments', `${flag} was repeated; nothing changed`);
        fail(`${flag} was given twice`);
      } else values[flag] = value;
      continue;
    }
    // 5. An option the command does not list is a usage error naming it.
    fail(`unknown option ${flag} for ${spec.label}`);
  }
  return { help: false, positionals, values, repeated, switches };
}

export interface CreateArgs {
  /** --help or -h was given: the caller prints commandHelp('create') and exits 0. */
  readonly help?: true;
  readonly why?: string;
  readonly title?: string;
  readonly task?: string;
  readonly resume?: string;
  readonly repo?: string;
  /** `--full` prints the draft preview — the normal form is the
      three-line contract (BT17). */
  readonly full?: boolean;
}

export function parseCreateArgs(argv: readonly string[]): CreateArgs {
  const parsed = parseOptions('create', argv);
  if (parsed.help) return { help: true };
  return {
    ...(parsed.values['--why'] !== undefined ? { why: parsed.values['--why'] } : {}),
    ...(parsed.values['--title'] !== undefined ? { title: parsed.values['--title'] } : {}),
    ...(parsed.values['--task'] !== undefined ? { task: parsed.values['--task'] } : {}),
    ...(parsed.values['--resume'] !== undefined ? { resume: parsed.values['--resume'] } : {}),
    ...(parsed.values['--repo'] !== undefined ? { repo: parsed.values['--repo'] } : {}),
    ...(parsed.switches.has('--full') ? { full: true } : {})
  };
}
