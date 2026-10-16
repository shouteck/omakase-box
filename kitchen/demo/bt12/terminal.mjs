#!/usr/bin/env node
// BT12 demo rig — the driver's two-verb control surface. The fresh agent
// runs exactly one small command; it decides everything else itself:
//
//   node kitchen/demo/bt12/terminal.mjs --run <folder> read
//   node kitchen/demo/bt12/terminal.mjs --run <folder> type "box bounty help"
//   node kitchen/demo/bt12/terminal.mjs --run <folder> type --enter "cmd"
//
// `read` prints the terminal's current screen text (and exits nonzero when
// the terminal's process is gone). `type` sends keystrokes to the real PTY;
// --enter appends a carriage return — the Enter keystroke every pty shell
// submits on. No command is prepared for the driver: it composes and sends
// raw keystrokes itself.
import { createConnection } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const runDir = args[args.indexOf('--run') + 1];
const verb = args.find(a => a === 'read' || a === 'type' || a === 'status');
const enter = args.includes('--enter');
const typed = args.slice(args.indexOf(verb) + 1).filter(a => a !== '--enter');
const port = Number(readFileSync(resolve(runDir, 'port'), 'utf8').trim());

const payload = verb === 'type'
  ? { verb, keys: typed.join(' ') + (enter ? '\r' : '') }
  : { verb };

const reply = await new Promise((resolveReply, reject) => {
  const socket = createConnection({ host: '127.0.0.1', port });
  let buffer = '';
  socket.on('connect', () => socket.write(JSON.stringify(payload) + '\n'));
  socket.on('data', chunk => {
    buffer += chunk;
    const nl = buffer.indexOf('\n');
    if (nl < 0) return;
    resolveReply(buffer.slice(0, nl));
    socket.destroy();
  });
  socket.on('error', reject);
  socket.setTimeout(30000, () => reject(new Error('control surface timed out')));
});
const answer = JSON.parse(reply);
if (answer.error !== undefined) {
  console.error(answer.error);
  process.exit(2);
}
if (verb === 'read') {
  process.stdout.write(answer.screen + '\n');
  process.exit(answer.alive === false ? 1 : 0);
}
if (verb === 'status') {
  process.stdout.write(`alive=${answer.alive}\n`);
  process.exit(0);
}
process.exit(0);
