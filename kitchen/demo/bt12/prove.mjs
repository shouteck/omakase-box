#!/usr/bin/env node
// BT12 demo rig — proof on a toy task before any real drive (the wave's
// "prove the rig first" step). A driver-shaped caller — not the real driver,
// which the head chef starts later — exercises the exact same two-verb
// surface a driver will: read the terminal, send keystrokes. Nothing about
// the answer is scripted into the rig itself.
//
// Toy steps (all through the control surface, never direct process calls):
//   1. start the pty + recorder in a fresh empty folder;
//   2. read the screen until the shell prompt answers;
//   3. type `echo BT12-TOY` + Enter, read until the echo is on screen;
//   4. type `gh api repos/shouteck/box-bounty-sandbox --jq .full_name` —
//      opens one public address read-only through the sign-in already on
//      the machine (the driver never sees a credential);
//   5. read until the repository's name is on screen, then type `exit`;
//   6. the recorder detects the dead terminal, finalizes video/stills/
//      transcript/index — the proof then checks the webm, the action log
//      and the transcript, and prints the verdict.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TERMINAL = join(HERE, 'terminal.mjs');
const RECORDER = join(HERE, 'record-session.mjs');
const OUT = resolve(process.argv[process.argv.indexOf('--run') + 1] ?? mkdtempSync(join(tmpdir(), 'bt12-rig-')));
const TOY = join(OUT, 'session');
const PUBLIC_READ = 'repos/shouteck/box-bounty-sandbox';

const wait = (ms) => new Promise(done => setTimeout(done, ms));
const terminal = (verb, text) => new Promise((done, fail) => {
  const args = [TERMINAL, '--run', TOY, verb];
  if (verb === 'type') args.push('--enter', ...text.split(' '));
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', c => out += c);
  child.stderr.on('data', c => err += c);
  child.on('close', code => code === 0 ? done(out) : fail(new Error(`terminal ${verb} exited ${code}: ${err}`)));
});
const readUntil = async (needle, tries = 80, predicate) => {
  for (let i = 0; i < tries; i += 1) {
    const screen = await terminal('read');
    const found = predicate !== undefined ? predicate(screen) : screen.includes(needle);
    if (found) return screen;
    await wait(500);
  }
  throw new Error(`screen never showed ${JSON.stringify(needle)}`);
};

// The terminal's working folder must live outside the tool checkout — the
// recorder refuses anything else, the same rule the real demo's clean clone
// obeys. Only the run's evidence folder stays under the (ignored) runs dir.
const checkout = mkdtempSync(join(tmpdir(), 'bt12-toy-checkout-'));
const recorder = spawn(process.execPath, [RECORDER, '--cwd', checkout, '--run', TOY], { stdio: ['ignore', 'pipe', 'inherit'] });
for (let i = 0; i < 100 && !existsSync(join(TOY, 'port')); i += 1) await wait(100);
if (!existsSync(join(TOY, 'port'))) throw new Error('pty host never published its control port');

try {
  await readUntil('>');
  await terminal('type', 'echo BT12-TOY');
  // The echoed command itself contains the needle — the proof needs the
  // command's own OUTPUT line, which is the needle alone on a screen line.
  await readUntil('BT12-TOY', 80, screen => screen.split('\n').some(line => line.trim() === 'BT12-TOY'));
  await terminal('type', `gh api ${PUBLIC_READ} --jq .full_name`);
  await readUntil('shouteck/box-bounty-sandbox');
  await terminal('type', 'exit');
  const exitCode = await new Promise(done => recorder.on('close', done));
  if (exitCode !== 0) throw new Error(`recorder exited ${exitCode}`);
} catch (error) {
  recorder.kill();
  throw error;
}

const video = join(TOY, 'demo.webm');
const transcript = readFileSync(join(TOY, 'transcript.txt'), 'utf8');
const actions = readFileSync(join(TOY, 'actions.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
const problems = [];
if (!existsSync(video) || statSync(video).size < 10000) problems.push('demo.webm missing or empty');
if (!transcript.includes('BT12-TOY')) problems.push('transcript lost the toy echo');
if (!transcript.includes('shouteck/box-bounty-sandbox')) problems.push('transcript lost the gh api answer');
if (!existsSync(join(TOY, 'actions.jsonl'))) problems.push('actions.jsonl missing');
if (!actions.some(a => a.verb === 'read')) problems.push('no read verb in the action log');
if (!actions.some(a => a.verb === 'type' && String(a.detail).includes('echo BT12-TOY'))) problems.push('the typed echo is not in the action log');
if (!existsSync(join(TOY, 'index.md'))) problems.push('index.md missing');
if (!readdirSync(join(TOY, 'stills')).length) problems.push('no stills captured');
if (problems.length) { console.log('rig proof FAILED:\n' + problems.map(p => `  - ${p}`).join('\n')); process.exit(1); }
console.log(`rig proven: ${join(TOY, 'demo.webm')} — ${actions.length} control verbs, ${statSync(video).size} bytes of video`);
