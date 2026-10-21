#!/usr/bin/env node
// Screenshots of every page and state, light and dark, desktop and phone,
// into out/screenshots/ (gitignored), plus a measured report of the visual
// rules on the real pages: font sizes, weights, families, shadows,
// gradients, the sample-data label, and the tab order's first stops.
// Uses the Playwright already installed at the repository root; it
// downloads nothing. Run after `npm run build`.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const proto = join(here, '..');
const rootPkg = join(proto, '..', '..', 'package.json');
if (!existsSync(rootPkg)) { console.error('screens: needs the repository root (for its Playwright). Next: run from inside the repository.'); process.exit(2); }
const { chromium } = createRequire(rootPkg)('@playwright/test');
const outDir = join(proto, 'out', 'screenshots');
mkdirSync(outDir, { recursive: true });

const PORT = 4399;
const server = spawn(process.execPath, [join(here, 'serve.mjs'), join(proto, 'out'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => server.stdout.once('data', r));
const base = `http://localhost:${PORT}`;

const PAGES = [
  ['board', '/', null], ['board-empty', '/?state=empty', null], ['board-error', '/?state=error', null],
  ['bounty-open', '/b/bt-0d7e4a3c8b65/', null], ['bounty-solutions-waiting', '/b/bt-2b8d7e01c6a5/', null],
  ['bounty-merged-owed-solver-view', '/b/bt-3a91c0e2d4f1/', null], ['bounty-merged-owed-owner-view', '/b/bt-3a91c0e2d4f1/', 'example-mara'],
  ['bounty-paid-recorded-payee-view', '/b/bt-4c6e19b0a2d8/', 'example-quill'], ['bounty-received-confirmed', '/b/bt-5d2a8f6c1e09/', null],
  ['bounty-disputed', '/b/bt-8b4d1f7a6c30/', null], ['bounty-owner-decides', '/b/bt-7a0c5e8b3f21/', null],
  ['bounty-closed-none', '/b/bt-6e7f3b2d9a14/', null], ['bounty-no-reward', '/b/bt-9c3e6a1d0b47/', null], ['bounty-self-dealt', '/b/bt-b2e8d4f0c639/', null],
  ['owner-record', '/owner/example-mara/', null], ['owner-mixed', '/owner/example-wren/', null], ['owner-no-history', '/owner/example-orrin/', null], ['owner-not-counted', '/owner/example-pike/', null],
  ['solver-record', '/solver/example-quill/', null], ['solver-new', '/solver/example-fern/', null],
  ['me-signed-out', '/me/', null], ['me-owner', '/me/', 'example-mara'], ['me-solver', '/me/', 'example-quill'],
  ['sign-in', '/sign-in/', null], ['how', '/how/', null], ['agents', '/agents/', null], ['prototype', '/prototype/', null], ['not-found', '/b/bt-000000000000/', null],
];
const VIEWS = [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]];

const browser = await chromium.launch();
const report = {};
let shots = 0;
for (const scheme of ['light', 'dark']) {
  for (const [device, viewport] of VIEWS) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
    for (const [name, path, who] of PAGES) {
      const page = await ctx.newPage();
      await page.addInitScript(login => { localStorage.clear(); if (login) localStorage.setItem('obb-prototype-session', login); }, who);
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.screenshot({ path: join(outDir, `${name}--${scheme}-${device}.png`), fullPage: true });
      shots++;
      if (scheme === 'light' && device === 'desktop') {
        report[name] = await page.evaluate(() => {
          const sizes = new Set(), weights = new Set(), families = new Set();
          let shadows = 0, gradients = 0;
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            if (cs.boxShadow !== 'none') shadows++;
            if (cs.backgroundImage.includes('gradient')) gradients++;
            const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
            if (hasText && el.getClientRects().length && !el.closest('.sr-only')) { sizes.add(cs.fontSize); weights.add(cs.fontWeight); families.add(cs.fontFamily.split(',')[0].replace(/"/g, '')); }
          }
          return { sizes: [...sizes].sort(), weights: [...weights].sort(), families: [...families], shadows, gradients, sampleLabel: document.body.innerText.includes('Sample data.'), primaryButtons: document.querySelectorAll('.bg-accent').length };
        });
        const tabs = [];
        for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); tabs.push(await page.evaluate(() => { const a = document.activeElement; return `${a.tagName.toLowerCase()}:${(a.innerText || a.value || a.getAttribute('aria-label') || '').trim().slice(0, 30)}`; })); }
        report[name].firstTabStops = tabs;
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
server.kill();
writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const all = Object.values(report);
const union = k => [...new Set(all.flatMap(r => r[k]))].sort();
console.log(`screens: ${shots} screenshots in ${outDir}`);
console.log(`font sizes in use: ${union('sizes').join(', ')}; weights: ${union('weights').join(', ')}; families: ${union('families').join(', ')}`);
console.log(`shadows: ${all.reduce((n, r) => n + r.shadows, 0)}; gradients: ${all.reduce((n, r) => n + r.gradients, 0)}; pages without the sample label: ${Object.entries(report).filter(([, r]) => !r.sampleLabel).map(([n]) => n).join(', ') || 'none'}`);
console.log(`pages with more than one primary action: ${Object.entries(report).filter(([, r]) => r.primaryButtons > 1).map(([n, r]) => `${n} (${r.primaryButtons})`).join(', ') || 'none'}`);
