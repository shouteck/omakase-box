#!/usr/bin/env node
// K16 — a demo video the kitchen makes by itself.
//
//   node kitchen/demo/record.mjs [--real | --standin] [--pause <seconds>]
//                                [--url-pause <seconds>] [--out <folder>]
//
// Runs kitchen/demo/bt11b-replay.mjs in its unattended mode while a windowless
// browser records video. The browser shows the replay's output, line by line,
// exactly as printed; when the replay prints a `PAGE <url>` line naming an
// address inside the sandbox repository the browser goes there at that moment
// and comes back. It opens nothing else — never the payment link, never an
// address outside the sandbox — and a refused PAGE line is written into the
// transcript and the index. `--real` (the default) needs `gh` signed in and
// shouteck/box-bounty-sandbox allowed for bounties; `--standin` needs no
// network and no credential and says so on its title card.
//
// Beside the video the run folder carries a still at every step and every page
// shown, the full transcript, and an index a reviewer can check without
// watching anything. Output goes to kitchen/demo/runs/<mode>-<stamp>/, or to
// --out; an existing non-empty folder is refused, never clobbered.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const CLI = join(REPO, 'packages', 'box-cli', 'dist', 'cli.js');
const REPLAY = join(HERE, 'bt11b-replay.mjs');
const REAL_REPO = 'shouteck/box-bounty-sandbox';
const VIEW = { width: 1280, height: 800 };

const args = process.argv.slice(2);
const real = !args.includes('--standin');
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const PAUSE = flag('--pause', '1.5');
const URL_PAUSE = flag('--url-pause', '8');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
const OUT = resolve(flag('--out', join(HERE, 'runs', `${real ? 'real' : 'standin'}-${stamp}`)));

// --- the named refusals -------------------------------------------------------
const refuse = (why) => { console.log(`record refused: ${why}`); process.exit(2); };

// The only address the recorder may navigate to in a real run: a page inside
// the sandbox repository. A PAGE line naming anything else — another
// repository, the payment link, a solver's own text — is refused and logged.
export function allowedAddress(url, isReal) {
  if (!isReal) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com'
      && parsed.pathname.toLowerCase().startsWith(`/${REAL_REPO.toLowerCase()}/`);
  } catch { return false; }
}
export function pageUrlOf(line) {
  const rest = line.trim().slice('PAGE'.length).trim();
  return rest.split(/\s/)[0] ?? '';
}

const IS_MAIN = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  // --- preflight: everything is checked before the replay (and any post) starts
  if (existsSync(OUT) && readdirSync(OUT).length > 0) refuse(`the output folder ${OUT} already exists and is not this command's — nothing was written`);
  if (!existsSync(CLI)) refuse('the tool is not built — run node scripts/workspace.mjs build first');
  if (!existsSync(REPLAY)) refuse(`the replay is missing at ${REPLAY}`);
  // The project's own browser path first (the same one scripts/suite.mjs
  // sets); the machine-wide default stays as fallback. Nothing is installed.
  const projectBrowsers = join(REPO, '.runtime', 'browsers');
  if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync(projectBrowsers)) process.env.PLAYWRIGHT_BROWSERS_PATH = projectBrowsers;
  if (real) {
    const auth = spawnSync('gh', ['auth', 'status', '--hostname', 'github.com'], { encoding: 'utf8' });
    if (auth.status !== 0) refuse('gh is not signed in — nothing was posted');
    const settingsEnv = process.env.BOX_BOUNTY_SETTINGS_DIR;
    const settingsDir = settingsEnv ?? (process.platform === 'win32'
      ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'box')
      : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'box'));
    const settings = existsSync(join(settingsDir, 'settings.json'))
      ? JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf8'))
      : {};
    const entry = settings?.repositories?.[REAL_REPO];
    if (entry?.bounty !== 'allowed' && settings?.default?.bounty !== 'allowed') {
      refuse(`${REAL_REPO} is not allowed for bounties on this machine — nothing was posted; the owner allows it with: box bounty allow ${REAL_REPO}`);
    }
    const repo = spawnSync('gh', ['api', `repos/${REAL_REPO}`], { encoding: 'utf8' });
    if (repo.status !== 0) refuse(`the sandbox ${REAL_REPO} is not reachable — nothing was posted`);
  }
  let chromium;
  try { ({ chromium } = await import('@playwright/test')); }
  catch { refuse('@playwright/test is not importable — run node scripts/pnpm.mjs install --frozen-lockfile'); }
  try { const probe = await chromium.launch(); await probe.close(); }
  catch (error) { refuse(`a Playwright browser could not be launched (${String(error.message ?? error).split('\n')[0]}) — install the project's own with: node scripts/pnpm.mjs exec playwright install chromium`); }

  // --- the run folder ---------------------------------------------------------
  mkdirSync(join(OUT, 'stills'), { recursive: true });
  const videoTmp = join(OUT, '.video');
  mkdirSync(videoTmp, { recursive: true });

  const commit = spawnSync('git', ['-c', `safe.directory=${REPO.replaceAll(String.fromCharCode(92), '/')}`, 'rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim() || '(unknown)';

  const MONO = "Consolas, 'Courier New', monospace";
  const shell_ = (inner) => `<!doctype html><html><body style="margin:0;background:#0c0c0c;color:#e6e6e6;font:20px/1.45 ${MONO}">${inner}</body></html>`;
  const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const cls = (line) => line.startsWith('=== ') ? 'step' : line.startsWith('PAGE ') ? 'page' : line.startsWith('$ ') ? 'cmd' : '';
  function terminalHtml(all) {
    const body = all.map(line => `<div class="${cls(line)}">${esc(line) === '' ? '&nbsp;' : esc(line)}</div>`).join('\n');
    return shell_(`<style>
      .step { color:#ffd479; font-weight:bold; margin-top:14px; }
      .page { color:#7cc7ff; font-weight:bold; }
      .cmd  { color:#9ece9e; }
      .term { padding:24px 32px; white-space:pre-wrap; word-break:break-word; }
    </style><div class="term" id="term">${body}</div><script>window.scrollTo(0,document.body.scrollHeight)</script>`);
  }
  const card = (title, rows) => shell_(`<div style="padding:80px 90px">
    <div style="font-size:30px;color:#ffd479;margin-bottom:36px">${title}</div>
    ${rows.map(row => `<div style="margin:10px 0">${row}</div>`).join('')}
  </div>`);

  // --- recording --------------------------------------------------------------
  const lines = [];          // the transcript, exactly what the replay printed
  const index = [];          // rows for index.md
  const leftOnGitHub = [];   // the run's own "left on GitHub" lines, real mode
  const t0 = Date.now();
  const at = () => ((Date.now() - t0) / 1000);
  const stampOf = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const wait = (ms) => new Promise(done => setTimeout(done, ms));
  const pad = n => String(n).padStart(2, '0');
  let exitCode = 1;
  let browser, context, page;

  const still = async (name) => {
    await page.screenshot({ path: join(OUT, 'stills', name) });
    return `stills/${name}`;
  };
  const showTerminal = async () => page.setContent(terminalHtml(lines));

  try {
    browser = await chromium.launch();
    context = await browser.newContext({ recordVideo: { dir: videoTmp, size: VIEW }, viewport: VIEW });
    page = await context.newPage();

    // Title card — plain words about what the viewer is about to see.
    await page.setContent(card("box bounty — the solver's payment link, a recorded run", [
      `Recorded ${new Date().toISOString().slice(0, 10)} — tool commit ${commit.slice(0, 12)}.`,
      real
        ? `This is a <b>real run</b>: the tool posts a test bounty in <b>github.com/${REAL_REPO}</b>, a test repository run by the owner; the solvers are the owner's own agents. <b>No real money is paid.</b>`
        : 'This is a <b>stand-in run</b>: a fake GitHub on this machine. <b>No network, no credential, nothing leaves the machine.</b>',
      "What looks like a terminal window is the replay's real output shown in a browser — not a filmed terminal.",
      'One line before each step says who is acting. Real pages are shown as the run creates them; the payment link itself is never opened.',
    ]));
    index.push({ at: at(), who: 'title card', still: await still('card-title.png'), address: '' });
    await wait(4500);
    await showTerminal();

    // The replay, unattended — its own modes and pauses, passed through.
    const child = spawn(process.execPath, [REPLAY, real ? '--real' : '--standin', '--auto', '--pause', PAUSE, '--url-pause', URL_PAUSE], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let steps = 0, pages = 0, readingLeft = false;
    const onLine = async (line) => {
      line = line.replace(/\r$/, '');
      lines.push(line);
      if (readingLeft && line.trimStart().startsWith('- ')) leftOnGitHub.push(line.trim());
      if (line.startsWith('left on GitHub')) readingLeft = true;
      if (line.startsWith('=== step ')) {
        steps += 1;
        const who = line.replace(/^=== step \d+ — /, '');
        index.push({ at: at(), who, still: await still(`step-${pad(steps)}.png`), address: '' });
      } else if (line.startsWith('PAGE ')) {
        pages += 1;
        const url = pageUrlOf(line);
        if (allowedAddress(url, real)) {
          index.push({ at: at(), who: 'the recorder shows the real page', still: '', address: url });
          lines.push(`[recorder] visiting ${url}`);
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await wait(1200);
            if (url.includes('/pull/')) {
              const target = page.getByText('pay-to:', { exact: false }).first();
              try { await target.scrollIntoViewIfNeeded({ timeout: 5000 }); }
              catch { await page.evaluate('window.scrollTo(0,document.body.scrollHeight)'); }
            } else if (/closed|closing comment/i.test(line)) {
              await page.evaluate('window.scrollTo(0,document.body.scrollHeight)');
            }
            await wait(1500);
          } catch (error) {
            lines.push(`[recorder] navigation to ${url} failed: ${String(error.message ?? error).split('\n')[0]} — the run's own record of it stands`);
          }
          index[index.length - 1].still = await still(`page-${pad(pages)}.png`);
          await showTerminal();
        } else {
          lines.push(`[recorder] not visiting ${url} — outside ${REAL_REPO} (refused)`);
          index.push({ at: at(), who: 'PAGE line refused — outside the sandbox', still: await still(`page-${pad(pages)}.png`), address: `refused: ${url}` });
          await showTerminal();
        }
        return; // a PAGE line was already painted by the full re-render — appending it again would double it on screen
      }
      await page.evaluate(`(function(){var t=document.getElementById('term');if(!t)return;var d=document.createElement('div');var l=LINE;d.className=l.startsWith('=== ')?'step':l.startsWith('PAGE ')?'page':l.startsWith('$ ')?'cmd':'';d.textContent=l;t.appendChild(d);window.scrollTo(0,document.body.scrollHeight)})()`.replace('LINE', JSON.stringify(line)));
    };
    const drain = () => { const out = buffer.split('\n'); buffer = out.pop(); return out; };
    const queue = [];
    let busy = Promise.resolve();
    const feed = (chunk) => {
      buffer += chunk;
      for (const line of drain()) queue.push(line);
      busy = busy.then(async () => { while (queue.length) await onLine(queue.shift()); });
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    await new Promise(done => child.on('close', code => { exitCode = code ?? 1; done(); }));
    // Whatever the child left without a newline is still a real line; drain
    // the queue to the end — the last lines (what the run left behind) count.
    if (buffer.length) { queue.push(buffer); buffer = ''; }
    busy = busy.then(async () => { while (queue.length) await onLine(queue.shift()); });
    await busy;

    // Closing card — what the run left on GitHub, by exact name.
    const left = real
      ? (leftOnGitHub.length ? leftOnGitHub.map(item => esc(item)) : ['(the replay named nothing — see the transcript)'])
      : ['stand-in run — nothing ever left this machine'];
    await page.setContent(card('the run is over — what it left behind', [
      ...(real ? ['<b>left on GitHub, by exact name:</b>'] : []),
      ...left,
      `The transcript, the index and one still per step sit beside this video in ${OUT}.`,
    ]));
    index.push({ at: at(), who: 'closing card — what the run left', still: await still('card-end.png'), address: '' });
    await wait(3500);
  } finally {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
  }

  // --- artifacts ---------------------------------------------------------------
  for (const file of readdirSync(videoTmp)) {
    if (file.endsWith('.webm')) renameSync(join(videoTmp, file), join(OUT, 'demo.webm'));
  }
  rmSync(videoTmp, { recursive: true, force: true });
  writeFileSync(join(OUT, 'transcript.txt'), lines.join('\n') + '\n');
  const videoBytes = existsSync(join(OUT, 'demo.webm')) ? statSync(join(OUT, 'demo.webm')).size : 0;
  writeFileSync(join(OUT, 'index.md'), [
    `# recording index — ${real ? 'real' : 'stand-in'} run ${new Date(t0).toISOString()}`,
    '',
    `video: demo.webm (${VIEW.width}x${VIEW.height}, ~${stampOf(at())} min, ${videoBytes} bytes)`,
    `tool commit: ${commit}`,
    `mode: ${real ? `real — posted for real in github.com/${REAL_REPO}` : 'stand-in — a fake GitHub on this machine; no network, no credential'}`,
    '',
    '| video time | who is acting | still | address |',
    '|------------|---------------|-------|---------|',
    ...index.map(i => `| ${stampOf(i.at)} | ${i.who.replaceAll('|', String.fromCharCode(92) + '|')} | ${i.still} | ${i.address} |`),
    '',
  ].join('\n'));
  console.log(`recorded: ${join(OUT, 'demo.webm')} (${videoBytes} bytes), ${index.length} index rows, transcript.txt`);
  if (exitCode !== 0) console.log(`the replay itself exited ${exitCode} — the video and transcript show the run as far as it went`);
  process.exit(exitCode);
}
