#!/usr/bin/env node
// The published `box` command (BT12): the bounty tool alone, bundled into
// one file. The kitchen build (src/cli.ts) carries the same dispatch.
import './node-check.js';
import { BOUNTY_COMMANDS } from '../../box-bounty/index.js';
import { runBounty } from './bounty.js';
import { version } from './version.js';

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
if (command === '--help' || command === '-h' || command === 'help') {
  for (const line of HELP_LINES) console.log(line);
  process.exit(0);
}
if (command === '--version') {
  console.log(version());
  process.exit(0);
}
if (command === 'bounty') {
  // No top-level await: the artifact's build target stays parseable well
  // below the declared Node floor so a too-old Node meets the named refusal,
  // not a syntax error. The dispatch is synchronous; every command exits
  // itself or returns and the process ends with the event loop.
  void runBounty(rest, { usage, version });
} else if (command === 'export' || command === 'submit' || command === 'verify' || command === 'trace') {
  // Removed with the older Box platform, not silently: the refusal names
  // `command-removed` like every other retired command.
  console.error(`box ${command}: command-removed — this command belonged to the older Box platform, retired on 18 October 2026; box bounty is the product`);
  process.exit(2);
} else {
  usage(command === undefined ? undefined : `box ${command} is not a command — run box bounty help for the journey`);
}
