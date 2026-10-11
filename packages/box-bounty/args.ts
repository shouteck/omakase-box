// Argument parsing for `bounty create`, pure and testable.
//
//   box bounty create --task <file> --why "<one line>" [--title "<one line>"]
//       [--note <file>] [--job <file>] [--out <dir>]
//       [--repo <path>] [--preview]
//
// Checks were removed on 11 October 2026: a bounty is the task, the note and
// the code, and nothing a solver wrote is ever run. The old command flags —
// --setup, --check and --guard — are not accepted at all: each is a NAMED
// refusal (`checks-removed`), so an agent reusing an old command line gets a
// reason that says checks were removed, never a silent drop.

import { BountyRefused } from './errors.js';

export class BountyUsage extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BountyUsage';
  }
}

export interface CreateArgs {
  readonly why?: string;
  readonly title?: string;
  readonly task?: string;
  readonly note?: string;
  readonly job?: string;
  readonly out?: string;
  readonly repo?: string;
  readonly preview: boolean;
}

const VALUE_FLAGS = new Set(['--why', '--title', '--task', '--note', '--job', '--out', '--repo']);
const REMOVED_FLAGS = new Set(['--setup', '--check', '--guard']);
const FLAG_NAMES = new Set([...VALUE_FLAGS, '--preview']);

export function parseCreateArgs(argv: readonly string[]): CreateArgs {
  const seen = new Set<string>();
  const parsed: { why?: string; title?: string; task?: string; note?: string; job?: string; out?: string; repo?: string; preview: boolean } = { preview: false };
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
      parsed[token.slice(2) as 'why' | 'title' | 'task' | 'note' | 'job' | 'out' | 'repo'] = value;
      i += 1;
    } else if (REMOVED_FLAGS.has(token)) {
      throw new BountyRefused('checks-removed', `${token} names a check — checks were removed on 11 October 2026. A bounty carries no command and the tool runs nothing a solver wrote; pass --task <file> and --why "<one line>" (and --note <file> if you have one)`);
    } else if (token === '--preview') {
      once(token);
      parsed.preview = true;
    } else {
      throw new BountyUsage(`unexpected argument ${token}`);
    }
  }
  return parsed;
}
