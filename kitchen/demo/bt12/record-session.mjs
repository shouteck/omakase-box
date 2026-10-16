#!/usr/bin/env node
// BT12 demo rig — recorder. Reuses kitchen/demo/record.mjs's recording
// approach (Playwright windowless page -> demo.webm, stills, transcript,
// index) against a real PTY instead of a scripted replay: the pty_host's
// `read` verb is polled and the current terminal screen is painted like a
// live window. The driver acts through terminal.mjs's read/type only; the
// recorder never types and never reads a credential. The session ends when
// the terminal's process exits (the driver types `exit`) — graceful close
// finalizes the video and the index.
//
//   node kitchen/demo/bt12/record-session.mjs --cwd <clean clone>
//       --run <out folder> [--shell cmd.exe] [--env-file <json>]
//       [--poll-ms 400]
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const HOST = join(HERE, 'pty_host.py');
const VIEW = { width: 1280, height: 800 };
const POLL_MS_DEFAULT = 400;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const CWD = resolve(flag('--cwd'));
const OUT = resolve(flag('--run'));
const POLL = Number(flag('--poll-ms', String(POLL_MS_DEFAULT)));
const refuse = (why) => { console.log(`record-session refused: ${why}`); process.exit(2); };
if (CWD === REPO || CWD.startsWith(REPO + String.fromCharCode(92)) || CWD.startsWith(REPO + '/')) {
  refuse('--cwd must be outside the tool checkout — the demo drives a clean clone only');
}
if (existsSync(OUT) && readdirSync(OUT).length > 0) {
  refuse(`the output folder ${OUT} already exists and is not this command's`);
}
if (!existsSync(HOST)) refuse(`pty host missing at ${HOST}`);
if (!existsSync(CWD)) refuse(`--cwd ${CWD} does not exist`);

const projectBrowsers = join(REPO, '.runtime', 'browsers');
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync(projectBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = projectBrowsers;
}
let chromium;
try { ({ chromium } = await import('@playwright/test')); }
catch { refuse('@playwright/test is not importable — run node scripts/pnpm.mjs install --frozen-lockfile'); }

mkdirSync(join(OUT, 'stills'), { recursive: true });
const videoTmp = join(OUT, '.video');
mkdirSync(videoTmp, { recursive: true });

const pythonArgs = [HOST, '--cwd', CWD, '--run', OUT];
for (const opt of ['--shell', '--env-file', '--cols', '--rows']) {
  if (args.includes(opt)) pythonArgs.push(opt, flag(opt));
}
const host = spawn('python', pythonArgs, { stdio: ['ignore', 'ignore', 'inherit'] });
const portFile = join(OUT, 'port');
for (let i = 0; i < 200 && !existsSync(portFile); i += 1) {
  if (host.exitCode !== null) refuse(`pty host exited ${host.exitCode} before writing its port`);
  await new Promise(done => setTimeout(done, 100));
}
if (!existsSync(portFile)) refuse('pty host did not publish its control port');
const port = Number(readFileSync(portFile, 'utf8').trim());

const call = (payload) => new Promise((done, fail) => {
  const socket = createConnection({ host: '127.0.0.1', port });
  let buffer = '';
  socket.on('connect', () => socket.write(JSON.stringify(payload) + '\n'));
  socket.on('data', chunk => {
    buffer += chunk;
    const nl = buffer.indexOf('\n');
    if (nl < 0) return;
    done(JSON.parse(buffer.slice(0, nl)));
    socket.destroy();
  });
  socket.on('error', fail);
  socket.setTimeout(15000, () => fail(new Error('pty control surface timed out')));
});

const MONO = "Consolas, 'Courier New', monospace";
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const terminalHtml = (text) => `<!doctype html><html><body style="margin:0;background:#0c0c0c;color:#e6e6e6;font:20px/1.45 ${MONO}"><pre style="padding:24px 32px;margin:0;white-space:pre-wrap;word-break:break-word">${esc(text) === '' ? '&nbsp;' : esc(text)}</pre></body></html>`;
const card = (title, rows) => `<!doctype html><html><body style="margin:0;background:#0c0c0c;color:#e6e6e6;font:20px/1.45 ${MONO}"><div style="padding:80px 90px"><div style="font-size:30px;color:#ffd479;margin-bottom:36px">${title}</div>${rows.map(row => `<div style="margin:10px 0">${row}</div>`).join('')}</div></body></html>`;

const commit = spawnSync('git', ['-c', `safe.directory=${REPO.replaceAll(String.fromCharCode(92), '/')}`, 'rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim() || '(unknown)';
const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000);
const stampOf = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
const pad = (n) => String(n).padStart(2, '0');
const wait = (ms) => new Promise(done => setTimeout(done, ms));

let browser, context, page;
const index = [];
const transcript = [];
let frames = 0;
try {
  browser = await chromium.launch();
  context = await browser.newContext({ recordVideo: { dir: videoTmp, size: VIEW }, viewport: VIEW });
  page = await context.newPage();
  await page.setContent(card('box bounty — a fresh agent drives a real terminal', [
    `Recorded ${new Date().toISOString().slice(0, 10)} — tool commit ${commit.slice(0, 12)}.`,
    'The window is a real pseudo-terminal in a clean folder; a driver agent reads its screen and sends keystrokes through two verbs — read and type — nothing else is scripted.',
    'What is kept beside this video: the full transcript, the action log (every read and keystroke with its prompting screen), one still per change, and the index.',
  ]));
  index.push({ at: at(), what: 'title card', still: await (async () => { const n = 'card-title.png'; await page.screenshot({ path: join(OUT, 'stills', n) }); return `stills/${n}`; })(), address: '' });
  await wait(4000);

  let last = null;
  let alive = true;
  while (alive) {
    const answer = await call({ verb: 'read' });
    if (answer.error !== undefined) refuse(answer.error);
    alive = answer.alive !== false;
    if (answer.screen !== last) {
      last = answer.screen;
      frames += 1;
      transcript.push(`=== frame ${frames} at ${stampOf(at())} ===`);
      transcript.push(answer.screen);
      await page.setContent(terminalHtml(answer.screen));
      const name = `frame-${pad(frames)}.png`;
      await page.screenshot({ path: join(OUT, 'stills', name) });
      index.push({ at: at(), what: 'terminal changed', still: `stills/${name}`, address: '' });
    }
    await wait(POLL);
  }
  transcript.push(`=== terminal process exited at ${stampOf(at())} ===`);
  await page.setContent(card('the session is over', [
    'The terminal process exited; the recording is complete.',
    'The transcript, the action log and one still per change sit beside this video in its run folder.',
  ]));
  index.push({ at: at(), what: 'closing card', still: await (async () => { const n = 'card-end.png'; await page.screenshot({ path: join(OUT, 'stills', n) }); return `stills/${n}`; })(), address: '' });
  await wait(2500);
} finally {
  try { await context?.close(); } catch {}
  try { await browser?.close(); } catch {}
  host.kill();
}
for (const file of readdirSync(videoTmp)) {
  if (file.endsWith('.webm')) renameSync(join(videoTmp, file), join(OUT, 'demo.webm'));
}
rmSync(videoTmp, { recursive: true, force: true });
writeFileSync(join(OUT, 'transcript.txt'), transcript.join('\n') + '\n');
const videoBytes = existsSync(join(OUT, 'demo.webm')) ? statSync(join(OUT, 'demo.webm')).size : 0;
writeFileSync(join(OUT, 'index.md'), [
  `# recording index — bt12 terminal session ${new Date(t0).toISOString()}`,
  '',
  `video: demo.webm (${VIEW.width}x${VIEW.height}, ~${stampOf(at())} min, ${videoBytes} bytes)`,
  `tool commit: ${commit}`,
  `terminal: ${CWD}`,
  '',
  '| video time | event | still |',
  '|------------|-------|-------|',
  ...index.map(i => `| ${stampOf(i.at)} | ${i.what} | ${i.still} |`),
  '',
].join('\n'));
console.log(`recorded: ${join(OUT, 'demo.webm')} (${videoBytes} bytes), ${frames} frames, transcript.txt`);
process.exit(0);
