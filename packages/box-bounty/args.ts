// Argument parsing for `bounty create`, pure and testable.
//
//   box bounty create --title "<one line>" --task <file> [--note <file>]
//       [--setup -- <command>] [--check -- <command>] --out <dir>
//       [--repo <path>] [--preview]
//
// --setup and --check take a program plus verbatim argv after a `--` separator;
// no shell ever runs them. A command segment ends at the next token that names
// a box flag (so `--check -- node t.js --out dir` parses `--out` as box's flag).
// A bare `--` inside a command is passed to the program as a literal argument,
// which keeps `npm test -- --grep x`-style invocations intact. To pass a program
// an argument spelled exactly like a box flag, order it before the command's
// `--` is impossible — reorder so box flags come first.

export class BountyUsage extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BountyUsage';
  }
}

export interface CreateArgs {
  readonly title?: string;
  readonly task?: string;
  readonly note?: string;
  readonly setup?: readonly string[];
  readonly check?: readonly string[];
  readonly out?: string;
  readonly repo?: string;
  readonly preview: boolean;
}

const VALUE_FLAGS = new Set(['--title', '--task', '--note', '--out', '--repo']);
const COMMAND_FLAGS = new Set(['--setup', '--check']);
const FLAG_NAMES = new Set([...VALUE_FLAGS, ...COMMAND_FLAGS, '--preview']);

export function parseCreateArgs(argv: readonly string[]): CreateArgs {
  const seen = new Set<string>();
  const parsed: { title?: string; task?: string; note?: string; setup?: string[]; check?: string[]; out?: string; repo?: string; preview: boolean } = { preview: false };
  const once = (flag: string): void => {
    if (seen.has(flag)) throw new BountyUsage(`${flag} was given twice`);
    seen.add(flag);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (VALUE_FLAGS.has(token)) {
      once(token);
      const value = argv[i + 1];
      if (value === undefined) throw new BountyUsage(`${token} needs a value`);
      parsed[token.slice(2) as 'title' | 'task' | 'note' | 'out' | 'repo'] = value;
      i += 1;
    } else if (COMMAND_FLAGS.has(token)) {
      once(token);
      if (argv[i + 1] !== '--') throw new BountyUsage(`${token} must be followed by -- then the command, e.g. ${token} -- npm test`);
      const command: string[] = [];
      let j = i + 2;
      while (j < argv.length && !FLAG_NAMES.has(argv[j]!)) { command.push(argv[j]!); j += 1; }
      if (command.length === 0) throw new BountyUsage(`${token} needs a command after --`);
      parsed[token.slice(2) as 'setup' | 'check'] = command;
      i = j - 1;
    } else if (token === '--preview') {
      once(token);
      parsed.preview = true;
    } else {
      throw new BountyUsage(`unexpected argument ${token}`);
    }
  }
  return parsed;
}
