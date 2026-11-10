// node docs/box-v4/design/hero/shot.mjs  -> hero/shots/*.png (stills at several moments, and a phone width)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url)); mkdirSync(join(HERE, 'shots'), { recursive: true });
const b = await chromium.launch({ channel: 'msedge' });
const moments = process.argv.slice(2).map(Number); 
for (const [w, tag] of [[1440, 'desktop'], [390, 'phone']]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: w === 390 ? 2 : 1 }); const p = await c.newPage();
  await p.goto(pathToFileURL(join(HERE, 'hero.html')).href);
  for (const t of moments.length ? moments : [8.05]) {
    // The page's loop starts at the still picture (8.05 s); wait until the wanted moment comes round.
    const wait = ((t - 8.05 + 11.4) % 11.4) * 1000;
    await p.reload(); await p.waitForTimeout(wait + 60);
    await p.locator('.ob-hero').screenshot({ path: join(HERE, 'shots', `${tag}-${String(t).replace('.', '_')}.png`) });
  }
  await c.close();
}
await b.close();
