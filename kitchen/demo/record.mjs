#!/usr/bin/env node
// A demo video the kitchen makes by itself.
//
//   node kitchen/demo/record.mjs [--real | --standin] [--pause <seconds>]
//     [--per-line <seconds>] [--max-pause <seconds>] [--url-pause <seconds>]
//     [--out <folder>]
//
// Runs kitchen/demo/bt11b-replay.mjs in its unattended mode while a windowless
// browser records video. The browser shows the replay's output, line by line;
// when the replay prints a `PAGE <url>` line naming an address inside the
// sandbox repository the browser goes there at that moment and comes back. It
// opens nothing else — never the payment link, never an address outside the
// sandbox — and a refused PAGE line is written into the transcript and the
// index. `--real` (the default) needs `gh` signed in and
// shouteck/box-bounty-sandbox allowed for bounties; `--standin` needs no
// network and no credential and says so on its title card.
//
// The screen shows a shortened view of the run: tool commands read `box
// bounty …`, paths under the home folder and the run's scratch area read
// `<project>`, `<settings>`, `<run>`, `<tool>` or `<home>`, git noise and API
// replies stay off screen, and a step's pause follows how much text it
// showed. The transcript keeps every line — full commands included — with
// only the path shortening applied and over-long API replies marked and
// shortened; screen.txt is exactly what the viewer saw. Nothing the product
// prints is reworded, reordered or dropped from the screen.
//
// Beside the video the run folder carries a still at every step — taken when
// the step has finished printing — and at every page shown, the transcript,
// screen.txt, and an index a reviewer can check without watching anything.
// Output goes to kitchen/demo/runs/<mode>-<stamp>/, or to --out; an existing
// non-empty folder is refused, never clobbered.

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
// Longer than this, a single reply line is marked and shortened in the
// transcript and kept off the screen — a GitHub API reply, never the
// product's own output.
const LONG_LINE = 500;

const args = process.argv.slice(2);
const real = !args.includes('--standin');
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const PAUSE = flag('--pause', '2');
const PER_LINE = flag('--per-line', '0.25');
const MAX_PAUSE = flag('--max-pause', '14');
const URL_PAUSE = flag('--url-pause', '8');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
const OUT = resolve(flag('--out', join(HERE, 'runs', `${real ? 'real' : 'standin'}-${stamp}`)));

// --- the named refusals -------------------------------------------------------
const refuse = (why) => { console.log(`record refused: ${why}`); process.exit(2); };

// dist/cli.js is one bundle of the workspace's packages: the newest .ts
// under packages/ must not postdate it — a stale build is the stale-`dist`
// failure a recorded run would silently carry. Returns the name of what to
// rebuild, or null.
export function buildIsStale(packagesDir) {
  const cli = join(packagesDir, 'box-cli', 'dist', 'cli.js');
  if (!existsSync(cli)) return 'box-cli';
  const built = statSync(cli).mtimeMs;
  let newestSrc = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(path); }
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) newestSrc = Math.max(newestSrc, statSync(path).mtimeMs);
    }
  };
  walk(packagesDir);
  return newestSrc > built ? 'box-cli' : null;
}

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
  const stale = buildIsStale(join(REPO, 'packages'));
  if (stale) refuse(`packages/${stale}/dist/cli.js is older than the sources it is built from — a recording would show a stale tool; build first: node scripts/workspace.mjs build`);
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
  const lines = [];          // the transcript — every line the replay printed,
                             // with paths shortened and over-long API replies
                             // marked and shortened; nothing else changed
  const screen = [];         // exactly what a viewer sees, line for line
  const index = [];          // rows for index.md
  const leftOnGitHub = [];   // the run's own "left on GitHub" lines, real mode
  const t0 = Date.now();
  const at = () => ((Date.now() - t0) / 1000);
  const stampOf = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const wait = (ms) => new Promise(done => setTimeout(done, ms));
  const pad = n => String(n).padStart(2, '0');
  let exitCode = 1;
  let browser, context, page;

  // Path shortening, applied to the transcript and the screen alike. The
  // replay writes the run's own folders to a paths file; the recorder adds
  // the tool's checkout and the home folder itself.
  const pathsFile = join(OUT, 'paths.json');
  let pathMap = null;
  const shortenPaths = (line) => {
    if (pathMap === null) {
      try {
        const paths = JSON.parse(readFileSync(pathsFile, 'utf8'));
        pathMap = [];
        for (const [abs, ph] of [[paths.project, '<project>'], [paths.settings, '<settings>'], [paths.run, '<run>'], [REPO, '<tool>'], [homedir(), '<home>']]) {
          if (!abs) continue;
          pathMap.push([abs, ph], [abs.replaceAll('\\', '/'), ph]);
        }
        pathMap.sort((a, b) => b[0].length - a[0].length);
        lines.push('[recorder] path shorthand — <project> the run\'s example checkout, <settings> the run\'s own settings folder, <run> the scratch folder, <tool> the tool\'s checkout, <home> the home folder');
      } catch { /* not written yet — the next line tries again */ }
    }
    if (pathMap) for (const [abs, ph] of pathMap) line = line.split(abs).join(ph);
    return line;
  };

  // What stays off screen, besides <<< >>> regions: git's plumbing chatter
  // and any single line too long to read (an API reply — the transcript keeps
  // it, marked and shortened). Everything the product prints is shown as is.
  const OFF_SCREEN = /^(remote: |warning: |Cloning into |Fetching |remote:$)/;
  const displayed = (line) => {
    if (OFF_SCREEN.test(line)) return null;
    if (line.length > LONG_LINE) return null;
    if (/^\{.*\}$/.test(line)) return null; // a single-line API reply — the transcript keeps it
    // A tool command runs unchanged; only the display shortens it to `box …`.
    const cli = line.indexOf('cli.js bounty ');
    if (line.startsWith('$ ') && cli !== -1) return `$ box bounty ${line.slice(cli + 'cli.js bounty '.length)}`;
    const shim = line.indexOf('gh-standin.cjs api ');
    if (line.startsWith('$ ') && shim !== -1) return `$ gh api ${line.slice(shim + 'gh-standin.cjs api '.length)}`;
    return line;
  };
  const truncated = (line) => line.length > LONG_LINE
    ? `${line.slice(0, 160)}… [recorder: a ${line.length}-character reply, kept off screen — its address is the PAGE line]`
    : line;

  const still = async (name) => {
    await page.screenshot({ path: join(OUT, 'stills', name) });
    return `stills/${name}`;
  };
  const showTerminal = async () => page.setContent(terminalHtml(screen));

  try {
    browser = await chromium.launch();
    context = await browser.newContext({ recordVideo: { dir: videoTmp, size: VIEW }, viewport: VIEW });
    page = await context.newPage();

    // Title card — plain words about what the viewer is about to see.
    await page.setContent(card('box bounty — an agent hands a task to outside solvers', [
      `Recorded ${new Date().toISOString().slice(0, 10)} — tool commit ${commit.slice(0, 12)}.`,
      'The tool packages a task an agent cannot or should not do, posts it as a public bounty, and tells the owner whom to pay when a solution is merged.',
      real
        ? `This is a <b>real run</b>: the tool posts a test bounty in <b>github.com/${REAL_REPO}</b>, a test repository run by the owner, and pays nothing — the $1 reward is a test payment link.`
        : 'This is a <b>stand-in run</b>: a fake GitHub on this machine. <b>No network, no credential, nothing leaves the machine.</b>',
      'Both solvers are played by the owner\'s own GitHub account because this is a test — in real use they are other people. That is why the pay message names the owner\'s account.',
      'The owner decided once, before the demo: this repository may carry bounties, each promising $1, at most $5 promised at once.',
      "What looks like a terminal is the replay's real output shown in a browser — not a filmed window. One line before each step says who is acting; the payment link itself is never opened.",
    ]));
    index.push({ at: at(), who: 'title card', still: await still('card-title.png'), address: '' });
    await wait(6000);
    await showTerminal();

    // The replay, unattended — its own modes and pauses, passed through.
    const child = spawn(process.execPath, [REPLAY, real ? '--real' : '--standin', '--auto', '--pause', PAUSE, '--per-line', PER_LINE, '--max-pause', MAX_PAUSE, '--url-pause', URL_PAUSE, '--paths', pathsFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let steps = 0, pages = 0, readingLeft = false, hidden = false;
    let pendingStepStill = null; // a step's still waits for its finished screen
    const captureStepStill = async () => {
      if (pendingStepStill === null) return;
      index[pendingStepStill.row].still = await still(pendingStepStill.name);
      pendingStepStill = null;
    };
    const paint = async (line) => page.evaluate(`(function(){var t=document.getElementById('term');if(!t)return;var d=document.createElement('div');var l=LINE;d.className=l.startsWith('=== ')?'step':l.startsWith('PAGE ')?'page':l.startsWith('$ ')?'cmd':'';d.textContent=l;t.appendChild(d);window.scrollTo(0,document.body.scrollHeight)})()`.replace('LINE', JSON.stringify(line)));
    const onLine = async (raw) => {
      const line = shortenPaths(raw.replace(/\r$/, ''));
      if (line === '<<<') { hidden = true; lines.push('[recorder] run but not shown on screen:'); return; }
      if (line === '>>>') { hidden = false; lines.push('[recorder] shown on screen again.'); return; }
      const kept = truncated(line);
      lines.push(kept);
      if (readingLeft && line.trimStart().startsWith('- ')) leftOnGitHub.push(line.trim());
      if (line.startsWith('left on GitHub')) readingLeft = true;
      if (hidden) return;
      const show = displayed(line);
      if (line.startsWith('=== step ')) {
        // The previous step has finished printing: its still is this screen.
        await captureStepStill();
        steps += 1;
        const who = line.replace(/^=== step \d+ — /, '');
        index.push({ at: at(), who, still: '', address: '' });
        pendingStepStill = { row: index.length - 1, name: `step-${pad(steps)}.png` };
        if (show !== null) { screen.push(show); await paint(show); }
        return;
      }
      if (line.startsWith('PAGE ')) {
        if (show !== null) { screen.push(show); await paint(show); }
        await captureStepStill(); // a PAGE line is the step's last print
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
        return;
      }
      if (show !== null) { screen.push(show); await paint(show); }
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
    await captureStepStill(); // the last step's still, on the finished screen

    // Closing card — what the run left on GitHub, by exact name.
    const left = real
      ? (leftOnGitHub.length ? leftOnGitHub.map(item => esc(item)) : ['(the replay named nothing — see the transcript)'])
      : ['stand-in run — nothing ever left this machine'];
    await page.setContent(card('the run is over — what it left behind', [
      ...(real ? ['<b>left on GitHub, by exact name:</b>'] : []),
      ...left,
      'The transcript, the index and one still per step sit beside this video in its run folder.',
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
  writeFileSync(join(OUT, 'screen.txt'), screen.join('\n') + '\n');
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
