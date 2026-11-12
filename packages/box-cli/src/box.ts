#!/usr/bin/env node
// The published `box` command (BT12): the bounty tool alone, bundled into
// one file. The kitchen build (src/cli.ts) carries the same dispatch.
import './node-check.js';
import { BOUNTY_COMMANDS, runSetupCommand } from '../../box-bounty/index.js';
import { runBounty } from './bounty.js';
import { version } from './version.js';

const HELP_LINES = [
  ...(['create', 'help', 'describe', 'status', 'post', 'look', 'apply', 'close', 'discover', 'take', 'submit'] as const)
    .map((name, index) => `${index === 0 ? 'usage: ' : '       '}${BOUNTY_COMMANDS[name]!.usage}`),
  '       omakase-box setup [--remove] — put omakase-box on this machine and a skill where agents look',
  '       omakase-box allow|deny|config — the owner\'s settings',
  '       <id> may be left out when exactly one bounty can take the command'
];

function usage(message?: string, lines: readonly string[] = HELP_LINES): never {
  if (message !== undefined) console.error(message);
  for (const line of lines) console.error(line);
  process.exit(2);
}

const [command, ...rest] = process.argv.slice(2);
if (command === '--help' || command === '-h') {
  for (const line of HELP_LINES) console.log(line);
  process.exit(0);
}
if (command === '--version') {
  console.log(version());
  process.exit(0);
}
if (command === 'setup') {
  // BT65: one strict parser for `setup` (--help writes nothing, a typo is refused), shared by both entry files.
  const result = runSetupCommand(rest);
  if (result.document !== undefined) console.log(JSON.stringify(result.document)); // BT61: --json is one document
  else for (const line of result.lines) (result.code === 0 ? console.log : console.error)(line);
  process.exit(result.code);
}
if (command === 'export' || command === 'verify' || command === 'trace') {
  // Removed with the older Box platform, not silently: the refusal names
  // `command-removed` like every other retired command.
  console.error(`omakase-box ${command}: command-removed — this command belonged to the older Box platform, retired on 18 October 2026; omakase-box is the product`);
  process.exit(2);
}
// BT63: the command is the product's name, so the words after it are the bounty commands. `omakase-box bounty <x>`
// stays accepted, silently: a script or an instruction block written against the old form keeps working.
// No top-level await: the artifact's build target stays parseable well below the declared Node floor so a
// too-old Node meets the named refusal, not a syntax error. The dispatch is synchronous; every command exits
// itself or returns and the process ends with the event loop.
void runBounty(command === 'bounty' ? rest : process.argv.slice(2), { usage, version });
