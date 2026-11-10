// Captures the pre-design mock-ups, and the live site as "before", as full-page screenshots.
//
//   node docs/box-v4/design/shoot.mjs            the mock-ups only (reads local files, no network)
//   node docs/box-v4/design/shoot.mjs --before   also the live site, into shots/before/
//   node docs/box-v4/design/shoot.mjs --only board   only shots whose name starts with "board"
//
// It uses the browser already on the machine (Edge, else Chrome) through the repository's own
// @playwright/test, so nothing is downloaded. Widths are the two the design briefs name: 1440 and 390.
// The sticky navigation is made static for the capture, as KITCHEN.md asks of full-page shots (PF17).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE = 'https://open-bounty-board.box-platform.workers.dev';
const WIDTHS = { desktop: [1440, 900], phone: [390, 844] };

// name, page, switches. Every "after" a design brief refers to is one line here.
const AFTER = [
  ['marks', 'marks.html', ''],
  ['board-empty-example', 'board.html', 'n=0'],
  ['board-empty-plain', 'board.html', 'n=0&example=0'],
  ['board-one', 'board.html', 'n=1'],
  ['board-many', 'board.html', 'n=10'],
  ['bounty-posted', 'bounty.html', ''],
  ['bounty-listed', 'bounty.html', 'kind=listed'],
  ['how', 'how.html', ''],
  ['agents', 'agents.html', ''],
  ['numbers-zero', 'numbers.html', 'n=0'],
  ['numbers-sample', 'numbers.html', 'n=1'],
  ['front-a', 'front.html', ''],
  ['front-b', 'front.html', 'hero=b']
];
// Dark is captured for one page of each kind; the tokens are shared, so one shows the rest.
const DARK = new Set(['board-many', 'bounty-posted', 'how', 'front-a', 'board-empty-example']);
const BEFORE = [['front', '/'], ['board', '/board/'], ['how', '/how/'], ['agents', '/agents/'], ['numbers', '/numbers/']];

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const wanted = name => only === null || name.startsWith(only);

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* try the next one */ }
}
if (browser === undefined) { console.error('shoot: neither Edge nor Chrome could be started'); process.exit(1); }

async function shoot(url, file, size, dark) {
  const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'nav[aria-label="Site"], .nav { position: static !important; }' });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  await context.close();
  console.log(`shoot: ${file}`);
}

for (const [name, file, switches] of AFTER) {
  if (!wanted(name)) continue;
  for (const [label, size] of Object.entries(WIDTHS)) {
    for (const dark of DARK.has(name) ? [false, true] : [false]) {
      const query = [switches, dark ? 'theme=dark' : ''].filter(Boolean).join('&');
      await shoot(`${pathToFileURL(join(HERE, file)).href}${query ? `?${query}` : ''}`, join(HERE, 'shots', 'after', `${name}-${label}${dark ? '-dark' : ''}.png`), size, dark);
    }
  }
}
if (args.includes('--before')) {
  for (const [name, path] of BEFORE) {
    if (!wanted(name)) continue;
    for (const [label, size] of Object.entries(WIDTHS)) await shoot(`${LIVE}${path}`, join(HERE, 'shots', 'before', `${name}-${label}.png`), size, false);
  }
}
await browser.close();
