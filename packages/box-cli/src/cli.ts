// Box CLI:
//   bounty create --task <file|-> --why "<one line>" [--title "<one line>"] [--repo <path>]
//   bounty help
//   bounty describe [--rules] [--repo <path>]
//   bounty status [<id>] [--full] [--comments] [--repo <path>]
//   bounty post [<id>] [--with-changes] [--include <file>] [--preview] [--repo <path>]
//   bounty look [<id>] <n> [--full] [--repo <path>]
//   bounty apply [<id>] [<n>] [--repo <path>]
//   bounty close [<id>] [--reason "<text>"] [--repo <path>]
//   bounty allow [owner/name|waiting-id] [--ask] [--reward <whole dollars> --reward-limit <whole dollars>]
//   bounty deny [owner/name]
//   bounty config [set|add|remove <setting> <value>]
// A bounty command works without <id> when exactly one bounty can take it.
// Thin shell over packages/box-bounty: argument parsing and exit codes live
// here; every bounty behaviour lives in the library.
import './node-check.js';
import { BOUNTY_COMMANDS } from '../../box-bounty/index.js';
import { runBounty } from './bounty.js';
import { version } from './version.js';

// The bounty tool leads every command list (BT14): it is the product an
// agent is handed. The bounty usage lines are the option table's own (BT18):
// one table in box-bounty/args.ts drives both parsing and help — nothing
// re-derives it.
const HELP_LINES = [
  ...(['create', 'help', 'describe', 'status', 'post', 'look', 'apply', 'close'] as const)
    .map((name, index) => `${index === 0 ? 'usage: ' : '       '}${BOUNTY_COMMANDS[name]!.usage}`),
  '       box bounty allow|deny|config — the owner\'s settings',
  '       <id> may be left out when exactly one bounty can take the command'
];

function usage(message?: string, lines: readonly string[] = HELP_LINES): never {
  if (message !== undefined) console.error(message);
  for (const line of lines) console.error(line);
  process.exit(2);
}

const [command, ...rest] = process.argv.slice(2);
// `box --help` is a request for help, not a wrong command — the list on
// stdout, exit 0, bounty first (BT14).
if (command === '--help' || command === '-h' || command === 'help') {
  for (const line of HELP_LINES) console.log(line);
  process.exit(0);
}
if (command === '--version') {
  console.log(version());
  process.exit(0);
}
// The older platform's commands are gone, not silent (the tool's rule: never
// fail silently) — each refuses by name with `command-removed`, matching the
// wording the published box already used for them.
const REMOVED = ['export', 'submit', 'verify', 'trace'];
if (command !== undefined && REMOVED.includes(command)) {
  console.error(`box ${command}: command-removed — this command belonged to the older Box platform, retired on 18 October 2026; box bounty is the product`);
  process.exit(2);
}
if (command === 'bounty') {
  await runBounty(rest, { usage, version });
} else {
  usage();
}
