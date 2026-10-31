// The real pages in a real browser: the built export, served by the same
// handle() the Worker runs, reading a GitHub stand-in over HTTP.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LocalBoard, startLocal } from '../../packages/box-platform/src/local.js';
import { seed120, seedStates, STATE_IDS } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, SCHEMA } from './support.js';

const PACKAGE = fileURLToPath(new URL('../../packages/box-platform/', import.meta.url));
const OUT = join(PACKAGE, 'out');
const SHOTS = join(OUT, 'screenshots');

/** K43's money-word check, ported: a claim is a sentence with the word and no denial. */
export function moneyClaims(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n/).filter(s => /\b(funded|guarantee[sd]?|escrow)\b/i.test(s) && !/\b(never|not|no)\b/i.test(s));
}

const ratio = (a: string, b: string): number => {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('the pages', () => {
  let board: LocalBoard;
  let browser: Browser;
  let clock = NOW;

  const fresh = async (options: { width?: number; dark?: boolean } = {}): Promise<{ page: Page; notFound: string[]; close(): Promise<void> }> => {
    const context = await browser.newContext({ viewport: { width: options.width ?? 1280, height: 900 }, colorScheme: options.dark ? 'dark' : 'light' });
    const page = await context.newPage();
    const notFound: string[] = [];
    page.on('response', response => { if (response.status() === 404 && !response.url().includes('/api/b/')) notFound.push(response.url()); });
    return { page, notFound, close: () => context.close() };
  };
  const visit = async (page: Page, path: string) => {
    await page.goto(`${board.url}${path}`);
    await page.waitForFunction(() => !document.body.innerText.includes('Reading the board.'));
  };

  beforeAll(async () => {
    const built = spawnSync(process.execPath, [join(PACKAGE, 'node_modules/next/dist/bin/next'), 'build'], { cwd: PACKAGE, encoding: 'utf8', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
    if (built.status !== 0) throw new Error(`next build failed:\n${built.stdout}\n${built.stderr}`);
    board = await startLocal({ schema: SCHEMA, out: OUT, now: () => clock, seed: standin => { seedStates(standin, NOW); seed120(standin, NOW); } });
    for (let tick = 0; tick < 40; tick++) {
      await board.refresh();
      await board.env.DB.prepare(`DELETE FROM meta WHERE key LIKE 'budget_%'`).run();
      const unread = await board.env.DB.prepare('SELECT COUNT(*) AS n FROM bounties WHERE details_read_at = 0').first<{ n: number }>();
      if (unread?.n === 0) break;
    }
    browser = await chromium.launch();
    mkdirSync(SHOTS, { recursive: true });
  }, 300000);
  afterAll(async () => { await browser?.close(); await board?.stop(); });

  it('the board lists the seeded bounties with their card facts, and says whose words the titles are', async () => {
    const { page, close } = await fresh();
    await visit(page, '/?repository=example-tidepool/ledger-lite&query=Import');
    const card = page.locator('main ul li').first();
    await expect.poll(() => card.innerText()).toContain('Import fails on a BOM');
    const text = await card.innerText();
    expect(text).toContain('$45');
    expect(text).toContain('example-tidepool/ledger-lite · TypeScript · 4 days old · 2 solutions waiting');
    expect(text).toContain('Posted by example-mara, who pays the solver directly: ');
    expect(text).toMatch(/\d merged · \d paid by the owner's word · \d received by the solvers' word/);
    expect(await page.locator('main').innerText()).toContain(`Titles are the posters' own words.`);
    await visit(page, '/?repository=example-org/repo-1&query=Add thing 1');
    await expect.poll(() => card.innerText()).toContain('Posted by poster-1, who pays the solver directly: no payment history yet.');
    await close();
  });

  it('filters and paging work from the page, and the address keeps them', async () => {
    const { page, close } = await fresh();
    await visit(page, '/');
    await expect.poll(() => page.locator('main').innerText()).toContain('open bounties.');
    await page.selectOption('select[name=language]', 'Rust');
    await page.waitForURL(/language=Rust/);
    await expect.poll(() => page.locator('main [aria-live]').innerText()).toMatch(/^30 of \d+ open bounties match\./);
    expect(await page.locator('main ul li').count()).toBe(20);
    await page.click('text=Next page');
    await page.waitForURL(/page=2/);
    await expect.poll(() => page.locator('main ul li').count()).toBe(10);
    expect(await page.inputValue('select[name=language]')).toBe('Rust');
    await close();
  });

  it('no match names its next step, and the step works', async () => {
    const { page, close } = await fresh();
    await visit(page, '/?query=zzz-nothing');
    await expect.poll(() => page.locator('main').innerText()).toContain('No open bounty matches these filters.');
    await page.click('main >> text=clear the filters');
    await expect.poll(() => page.locator('main ul li').count()).toBe(20);
    await close();
  });

  it('renders the poster\'s HTML and script as text, never executed', async () => {
    const { page, close } = await fresh();
    let dialog = false;
    page.on('dialog', d => { dialog = true; void d.dismiss(); });
    for (const path of ['/?query=Hostile', `/b/${STATE_IDS.hostile}/`]) {
      await visit(page, path);
      await expect.poll(() => page.locator('main').innerText()).toContain('<img src=x onerror=');
      expect(await page.locator('main img').count()).toBe(0);
      expect(await page.locator('main script').count()).toBe(0);
      expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    }
    expect(await page.locator('blockquote').innerText()).toContain('<script>window.__pwned=1</script>');
    expect(dialog).toBe(false);
    await close();
  });

  it.each([
    ['open', STATE_IDS.open, ['Open. No solution yet.', 'How to answer', '$45 for the merged solution. The owner pays its author directly; the board carries no money.', 'The owner said yes to this bounty before it was posted.', 'Source: the project\'s record on GitHub.'], 1],
    ['solutions waiting', STATE_IDS.waiting, ['Open. Solutions are waiting for the owner.', 'Pull request #61 by example-fern: open', 'Pull request #62 by example-quill: open', 'it does not judge or rank them'], 1],
    ['merged', STATE_IDS.merged, ['Merged: pull request #64 by example-quill', 'Pull request #63 by example-fern: open', 'Pull request #64 by example-quill: merged', 'recorded paid: $45 (the owner\'s word)'], 0],
    ['more than one merged', STATE_IDS.moreThanOne, ['GitHub marks more than one pull request merged: #65 by example-fern and #66 by example-rook.', 'the owner decides whom to pay'], 0],
    ['closed without a merge', STATE_IDS.closed, ['Closed without a merge on', 'Nothing is owed.', 'closed without a merge. Source: GitHub.'], 0],
    ['no reward', STATE_IDS.noReward, ['No reward is stated, so nothing is owed.'], 1]
  ])('a bounty page in state: %s', async (_name, id, phrases, primaries) => {
    const { page, close } = await fresh();
    await visit(page, `/b/${id}/`);
    const text = await page.locator('main').innerText();
    for (const phrase of phrases) expect(text).toContain(phrase);
    expect(text).toContain('The poster\'s words (example-mara), from the GitHub issue');
    expect(await page.locator('[data-primary]').count()).toBe(primaries);
    expect(moneyClaims(text)).toEqual([]);
    if (primaries) expect(text).toContain(`box-bounty/${id}`);
    await close();
  });

  it('a solver signs in and lists a method in two steps, an owner-only one reaches only the owner it is owed by, and a page never holds it signed out', async () => {
    const secret = 'browser-sentinel@example.com';
    const standin = board.standin;
    standin.signInAs = { id: 7001, login: 'example-quill' };
    const solver = await fresh();
    await visit(solver.page, '/me/');
    await solver.page.click('[data-primary]');
    await solver.page.waitForSelector('select[name=kind]');
    expect(await solver.page.locator('main').innerText()).toContain('Signed in as example-quill.');
    // A wrong shape is refused where it was typed, with its next step.
    await solver.page.fill('input[name=value]', 'https://evil.example/paypal');
    await solver.page.click('button[data-primary]');
    await expect.poll(() => solver.page.locator('[role=status]').innerText()).toBe('That is not a PayPal.me. Next: paste a link that starts with https://paypal.me/');
    await solver.page.fill('input[name=value]', 'https://paypal.me/examplequill');
    await solver.page.click('button[data-primary]');
    await expect.poll(() => solver.page.locator('main').innerText()).toContain('Everyone, on my profile. Remove');
    // Choosing the email preselects "only an owner who owes me".
    await solver.page.selectOption('select[name=kind]', 'wise-email');
    expect(await solver.page.isChecked('input[value=owner-only]')).toBe(true);
    await solver.page.fill('input[name=value]', secret);
    await solver.page.click('button[data-primary]');
    await expect.poll(() => solver.page.locator('main').innerText()).toContain(secret);

    const bodies: string[] = [];
    const stranger = await fresh();
    stranger.page.on('response', async response => { try { bodies.push(await response.text()); } catch { /* a redirect has no body */ } });
    await visit(stranger.page, `/b/${STATE_IDS.owed}/`);
    await expect.poll(() => stranger.page.locator('main').innerText()).toContain('https://paypal.me/examplequill');
    expect(await stranger.page.locator('main').innerText()).not.toContain('Pay the author directly');
    await visit(stranger.page, '/solver/example-quill/');
    await expect.poll(() => stranger.page.locator('main').innerText()).toContain('https://paypal.me/examplequill');
    expect(await stranger.page.locator('main').innerText()).toContain('Merged solutions');
    expect(await stranger.page.locator('main a[href="https://paypal.me/examplequill"]').getAttribute('rel')).toContain('nofollow');
    expect(bodies.join('\n')).not.toContain(secret);
    await stranger.close();

    standin.signInAs = { id: 7100, login: 'example-mara' };
    const owner = await fresh();
    await visit(owner.page, '/me/');
    await owner.page.click('[data-primary]');
    await owner.page.waitForSelector('select[name=kind]');
    await visit(owner.page, `/b/${STATE_IDS.owed}/`);
    await expect.poll(() => owner.page.locator('main').innerText()).toContain(secret);
    expect(await owner.page.locator('main').innerText()).toContain('Pay the author directly, by a method they listed.');
    await visit(owner.page, '/owner/example-mara/');
    await expect.poll(() => owner.page.locator('main').innerText()).toContain('Open bounties');
    await visit(owner.page, '/solver/example-quill/');
    await expect.poll(() => owner.page.locator('main').innerText()).toContain('https://paypal.me/examplequill');
    expect(await owner.page.locator('main').innerText()).not.toContain(secret);
    await owner.close();

    // Sign-out from the page: the owner-only method is gone for that browser.
    await solver.page.click('text=Sign out');
    await expect.poll(() => solver.page.locator('[data-primary]').innerText()).toBe('Sign in with GitHub');
    expect(await solver.page.locator('main').innerText()).not.toContain(secret);
    await solver.close();
  });

  it('an owner records a payment, the payee disputes it, then confirms: each word attributed, on the page and the profiles, to a stranger too', async () => {
    const signedIn = async (id: number, login: string) => {
      board.standin.signInAs = { id, login };
      const person = await fresh();
      await visit(person.page, '/me/');
      await person.page.click('[data-primary]');
      await person.page.waitForSelector('select[name=kind]');
      await visit(person.page, `/b/${STATE_IDS.owed}/`);
      return person;
    };
    const says = (person: { page: Page }) => person.page.locator('main').innerText();
    const stranger = await fresh();
    await visit(stranger.page, `/b/${STATE_IDS.owed}/`);
    await expect.poll(() => says(stranger)).toContain('Owed to example-quill: $45, since');
    expect(await says(stranger)).toContain('Source: GitHub records pull request #68 merged.');
    expect(await says(stranger)).toContain('Not recorded paid by example-mara.');
    expect(await says(stranger)).not.toContain('Record $45');

    const payee = await signedIn(7001, 'example-quill');
    await expect.poll(() => says(payee)).toContain('Owed to example-quill');
    expect(await says(payee)).not.toContain('Record $45');

    const owner = await signedIn(7100, 'example-mara');
    await owner.page.click('text=Record $45 paid to example-quill');
    await expect.poll(() => says(owner)).toContain('Recorded paid by example-mara on');
    expect(await says(owner)).toContain('The owner\'s word, from their click on the board. Recording moves no money.');
    expect(await says(owner)).toContain('Earned by example-quill: $45');

    await visit(payee.page, `/b/${STATE_IDS.owed}/`);
    await payee.page.click('text=It has not arrived');
    await expect.poll(() => says(payee)).toContain('example-quill says it has not been received');
    await visit(stranger.page, `/b/${STATE_IDS.owed}/`);
    await expect.poll(() => says(stranger)).toContain('The owner and the solver disagree. Both words are shown as theirs; the board does not decide between them.');
    expect(await says(stranger)).toContain('Recorded paid by example-mara');
    await visit(stranger.page, '/owner/example-mara/');
    await expect.poll(() => says(stranger)).toContain('Says not received');

    await payee.page.click('text=Confirm I received $45');
    await expect.poll(() => says(payee)).toContain('example-quill says it was received');
    await visit(stranger.page, '/solver/example-quill/');
    await expect.poll(() => says(stranger)).toContain('1 payment they confirmed received (their word)');

    await visit(owner.page, `/b/${STATE_IDS.owed}/`);
    await owner.page.click('text=Withdraw this record');
    await expect.poll(() => says(owner)).toContain('Owed to example-quill');
    expect(await says(owner)).not.toContain('says it was received');
    for (const person of [stranger, payee, owner]) await person.close();
  });

  it('the sign-in page says what it asks for, and an error code in the address shows fixed words only', async () => {
    const { page, close } = await fresh();
    await page.goto(`${board.url}/sign-in/?error=<script>window.__pwned=1</script>`);
    await page.waitForSelector('[data-primary]');
    const plain = await page.locator('main').innerText();
    expect(plain).toContain('public profile only');
    expect(plain).not.toContain('script');
    await page.goto(`${board.url}/sign-in/?error=try-again`);
    await expect.poll(() => page.locator('main [role=alert]').innerText()).toContain('Next: sign in again.');
    await visit(page, '/privacy/');
    expect(await page.locator('main').innerText()).toContain('It never asks for your email address');
    await close();
  });

  it('a private repository: not listed, not rendered by direct URL, no bytes in any answer', async () => {
    const { page, close } = await fresh();
    const bodies: string[] = [];
    page.on('response', async response => { try { bodies.push(await response.text()); } catch { /* a redirect has no body */ } });
    await visit(page, `/b/${STATE_IDS.private}/`);
    const text = await page.locator('main').innerText();
    expect(text).toContain('Not on the board');
    expect(text).toContain('private repository (those are never listed)');
    await visit(page, '/?query=PRIVATE');
    await expect.poll(() => page.locator('main').innerText()).toContain('No open bounty matches');
    await visit(page, '/');
    await page.waitForTimeout(200);
    const all = bodies.join('\n');
    for (const secret of ['example-hidden', 'PRIVATE SAMPLE', STATE_IDS.private.slice(3) + '"']) expect(all).not.toContain(secret);
    await close();
  });

  it('no deployed file carries a stranger\'s or a private byte: every file, not only pages', () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (path === SHOTS) continue; if (statSync(path).isDirectory()) walk(path); else files.push(path); } };
    walk(OUT);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const text = readFileSync(file).toString('latin1');
      for (const secret of ['example-hidden', 'PRIVATE SAMPLE', 'example-mara', 'bt-0d7e4a3c8b65', 'browser-sentinel@example.com']) expect(text.includes(secret), `${file} holds ${secret}`).toBe(false);
    }
  });

  it('every page\'s words stay clear of a money claim', async () => {
    const { page, close } = await fresh();
    for (const path of ['/', '/how/', '/agents/', '/me/', '/sign-in/', '/privacy/', '/solver/example-quill/', '/owner/example-mara/', `/b/${STATE_IDS.merged}/`]) {
      await visit(page, path);
      expect(moneyClaims(await page.locator('body').innerText()), path).toEqual([]);
    }
    expect(moneyClaims('This bounty is funded and paid out by the board.')).toHaveLength(1);
    await close();
  });

  it('clicks through two pages with nothing answering 404', async () => {
    const { page, notFound, close } = await fresh();
    await visit(page, '/');
    await page.click('main ul li a');
    await page.waitForURL(/\/b\/bt-/);
    await expect.poll(() => page.locator('main').innerText()).toContain('Payment for this bounty');
    await page.click('nav[aria-label=Site] >> text=How it works');
    await page.waitForURL(/\/how\//);
    await page.click('[data-primary]');
    await expect.poll(() => page.locator('main [aria-live]').innerText()).toContain('open bounties');
    expect(notFound).toEqual([]);
    await close();
  });

  it('keyboard: skip link first, then the site name; a visible focus ring; a select reachable', async () => {
    const { page, close } = await fresh();
    await visit(page, '/');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Skip to content');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Open bounty board');
    const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return [s.outlineStyle, s.outlineWidth]; });
    expect(outline).toEqual(['solid', '2px']);
    await page.focus('select[name=sort]');
    await page.keyboard.press('ArrowDown');
    await page.waitForURL(/sort=reward/);
    await close();
  });

  it('K43\'s visual rules, measured on the real pages, both themes and both widths', async () => {
    for (const dark of [false, true]) for (const width of [1280, 390]) {
      const { page, close } = await fresh({ width, dark });
      for (const [name, path] of [['board', '/'], ['bounty', `/b/${STATE_IDS.waiting}/`]] as const) {
        await visit(page, path);
        await expect.poll(() => page.locator('main').innerText()).toMatch(/open bounties\.|Payment for this bounty/);
        const measured = await page.evaluate(() => {
          const sizes = new Set<string>(); const weights = new Set<string>(); const families = new Set<string>(); let shadows = 0; let gradients = 0;
          for (const element of document.querySelectorAll('body *')) {
            const style = getComputedStyle(element);
            if (style.boxShadow !== 'none') shadows++;
            if (style.backgroundImage.includes('gradient')) gradients++;
            if ([...element.childNodes].some(node => node.nodeType === 3 && node.textContent?.trim())) { sizes.add(style.fontSize); weights.add(style.fontWeight); families.add(style.fontFamily.split(',')[0]!); }
          }
          return { sizes: [...sizes], weights: [...weights], families: [...families], shadows, gradients, overflow: document.documentElement.scrollWidth > window.innerWidth, primaries: document.querySelectorAll('[data-primary]').length };
        });
        for (const size of measured.sizes) expect(['13px', '16px', '20px', '32px']).toContain(size);
        for (const weight of measured.weights) expect(['400', '600']).toContain(weight);
        expect(measured.families).toEqual(['Inter']);
        expect(measured).toMatchObject({ shadows: 0, gradients: 0, overflow: false });
        expect(measured.primaries).toBeLessThanOrEqual(1);
        await page.screenshot({ path: join(SHOTS, `${name}-${dark ? 'dark' : 'light'}-${width === 390 ? 'phone' : 'desktop'}.png`), fullPage: false });
      }
      await close();
    }
  }, 120000);

  it('contrast meets WCAG 2.2 AA for every text and control colour, computed from the stylesheet', () => {
    const css = readFileSync(join(PACKAGE, 'app/globals.css'), 'utf8');
    const [light, dark] = [css.slice(0, css.indexOf('@media')), css.slice(css.indexOf('@media'))];
    const token = (block: string, name: string) => new RegExp(`--color-${name}: (#[0-9a-f]{6})`).exec(block)![1]!;
    for (const block of [light, dark]) {
      const paper = token(block, 'paper');
      for (const name of ['ink', 'soft', 'accent']) expect(ratio(token(block, name), paper), name).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('a repository that turns private after listing is gone from the page at render, in the browser', async () => {
    const standin = board.standin;
    const repository = 'example-org/repo-1';
    const { page, close } = await fresh();
    const entry = standin.issues.find(issue => issue.repository === repository)!;
    await visit(page, `/b/${entry.id}/`);
    expect(await page.locator('main').innerText()).toContain('Payment for this bounty');
    standin.repositories.get(repository)!.visibility = 'private';
    clock += 6 * MINUTE;
    await visit(page, `/b/${entry.id}/`);
    expect(await page.locator('main').innerText()).toContain('Not on the board');
    await visit(page, `/?repository=${repository}`);
    await expect.poll(() => page.locator('main').innerText()).toContain('No open bounty matches');
    await close();
  });
});

describe('an empty board and a board that cannot read GitHub', () => {
  it('each names its next step', async () => {
    let clock = NOW;
    const board = await startLocal({ schema: SCHEMA, out: OUT, now: () => clock, seed: () => undefined });
    const browser = await chromium.launch();
    try {
      await board.refresh();
      const page = await browser.newPage();
      await page.goto(`${board.url}/`);
      await expect.poll(() => page.locator('main').innerText()).toContain('A bounty appears here a few minutes after someone posts one on a public GitHub repository.');
      expect(await page.locator('main a[href="/how/"]').count()).toBe(1);
      board.standin.rateLimitAfter = 0;
      board.standin.resetAt = Math.floor((clock + 30 * MINUTE) / 1000);
      clock += 15 * MINUTE;
      await board.refresh();
      await page.goto(`${board.url}/`);
      await expect.poll(() => page.locator('main').innerText()).toContain(`The board could not read GitHub after 12:00 UTC: GitHub's rate limit for this hour is used up. What you see is from 12:00 UTC. Nothing to do: the board tries again every 15 minutes.`);
    } finally {
      await browser.close();
      await board.stop();
    }
  });
});
