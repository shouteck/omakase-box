// Argument parsing for `bounty create`, pure and testable.
//
//   box bounty create --task <file> --why "<one line>" [--title "<one line>"]
//       [--resume "<context>"] [--repo <path>]
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
  readonly resume?: string;
  readonly repo?: string;
  /** `--full` prints the draft preview and the publication plan — the
      normal form is the three-line contract (BT17). */
  readonly full?: boolean;
}

type CreateValueField = 'why' | 'title' | 'task' | 'resume' | 'repo';
const VALUE_FLAGS = new Map<string, CreateValueField>([['--why', 'why'], ['--title', 'title'], ['--task', 'task'], ['--resume', 'resume'], ['--repo', 'repo']]);
const RETIRED_FLAGS: Readonly<Record<string, string>> = { '--note': 'put what you tried in the task file', '--job': 'put the unfinished work and the larger job in --resume', '--preview': 'create a private draft; post --preview shows what would become public' };
const REMOVED_FLAGS = new Set(['--setup', '--check', '--guard']);
// Money is the owner's to set, never the agent's (BT11a): create and post
// take no amount flag at all, and each spelling an agent might try is a
// named refusal, not a silent drop.
const AMOUNT_FLAGS = new Set(['--reward', '--amount', '--price', '--pay', '--payment', '--limit', '--budget', '--dollars']);


export function parseCreateArgs(argv: readonly string[]): CreateArgs {
  const seen = new Set<string>();
  const parsed: { [K in CreateValueField]?: string } & { full?: boolean } = {};
  const once = (flag: string): void => {
    if (seen.has(flag)) throw new BountyUsage(`${flag} was given twice`);
    seen.add(flag);
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    const equals = token.indexOf('=');
    const flag = equals < 0 ? token : token.slice(0, equals);
    if (RETIRED_FLAGS[flag] !== undefined) throw new BountyRefused('create-option-retired', `${flag} was retired; ${RETIRED_FLAGS[flag]}. Nothing changed`);
    if (flag === '--out') throw new BountyRefused('folder-delivery-retired', 'create writes a local record only; post to GitHub with box bounty post <id>. A private repository cannot be handed off with this tool');
    const field = VALUE_FLAGS.get(token);
    if (field !== undefined) {
      once(token);
      const value = argv[i + 1];
      if (value === undefined) throw new BountyUsage(`${token} needs a value`);
      parsed[field] = value;
      i += 1;
    } else if (token === '--full') {
      once(token);
      parsed.full = true;
    } else if (REMOVED_FLAGS.has(token)) {
      throw new BountyRefused('checks-removed', `${token} names a check — checks were removed on 11 October 2026. A bounty carries no command and the tool runs nothing a solver wrote; pass --task <file> and --why "<one line>"`);
    } else if (AMOUNT_FLAGS.has(token)) {
      throw new BountyRefused('reward-agent-set', `${token} names money — the reward is the owner's to set, never the agent's; create takes no amount. The owner sets it with box bounty config set reward <whole dollars>`);

    } else {
      throw new BountyUsage(`unexpected argument ${token}`);
    }
  }
  return parsed;
}
