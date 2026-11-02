// The real pages in a real browser: the built export, served by the same
// handle() the Worker runs, reading a GitHub stand-in over HTTP.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LocalBoard, startLocal } from '../../packages/box-platform/src/local.js';
import { STRIPE_COUNTRIES } from '../../packages/box-platform/src/pay-ways.js';
import { seed120, seedStates, STATE_IDS } from '../../packages/box-platform/standin/standin.js';
import { CLI, journeyWorld, wordsOf } from './commands.js';
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
    // The owner signs in as GitHub id 7100 throughout, so the board reads their bounties with that id (PF21).
    board = await startLocal({ schema: SCHEMA, out: OUT, now: () => clock, seed: standin => { standin.accountIds.set('example-mara', 7100); seedStates(standin, NOW); seed120(standin, NOW); } });
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
    await visit(page, '/board/?repository=example-tidepool/ledger-lite&query=Import');
    const card = page.locator('main ul li').first();
    await expect.poll(() => card.innerText()).toContain('Import fails on a BOM');
    const text = await card.innerText();
    expect(text).toContain('$45');
    expect(text).toContain('example-tidepool/ledger-lite · TypeScript · 4 days old · 2 solutions waiting');
    expect(text).toContain('example-mara: ');
    expect(text).toMatch(/\d merged · \d paid, the owner's word · \d received, the solvers' word/);
    expect(await page.locator('main').innerText()).toContain(`Titles are the posters' own words.`);
    await visit(page, '/board/?repository=example-org/repo-1&query=Add thing 1');
    await expect.poll(() => card.innerText()).toContain('poster-1: no payment history yet.');
    await close();
  });

  it('filters and paging work from the page, and the address keeps them', async () => {
    const { page, close } = await fresh();
    await visit(page, '/board/');
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
    await visit(page, '/board/?query=zzz-nothing');
    await expect.poll(() => page.locator('main').innerText()).toContain('No open bounty matches these filters.');
    await page.click('main >> text=clear the filters');
    await expect.poll(() => page.locator('main ul li').count()).toBe(20);
    await close();
  });

  it('renders the poster\'s HTML and script as text, never executed', async () => {
    const { page, close } = await fresh();
    let dialog = false;
    page.on('dialog', d => { dialog = true; void d.dismiss(); });
    for (const path of ['/board/?query=Hostile', `/b/${STATE_IDS.hostile}/`]) {
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
    ['open', STATE_IDS.open, ['Open. No solution yet.', 'How to answer', 'When a solution is merged, its author is owed $45 by the owner, paid directly.', 'The owner said yes to this bounty before it was posted.', 'Source: the project\'s record on GitHub.'], 1],
    ['solutions waiting', STATE_IDS.waiting, ['Open. Solutions are waiting for the owner.', 'Pull request #61 by example-fern: open', 'Pull request #62 by example-quill: open', 'it does not judge or rank them'], 1],
    ['merged', STATE_IDS.merged, ['Merged: pull request #64 by example-quill', 'Pull request #63 by example-fern: open', 'Pull request #64 by example-quill: merged', 'recorded paid: $45 (the owner\'s word)'], 0],
    ['more than one merged', STATE_IDS.moreThanOne, ['GitHub marks more than one pull request merged: #65 by example-fern and #66 by example-rook.', 'the owner decides whom to pay'], 0],
    ['closed without a merge', STATE_IDS.closed, ['Closed without a merge on', 'Nothing is owed.', 'closed without a merge. Source: GitHub.'], 0],
    ['no reward', STATE_IDS.noReward, ['No reward is stated, so nothing is owed.'], 1]
  ])('a bounty page in state: %s', async (_name, id, phrases, primaries) => {
    const { page, close } = await fresh();
    await visit(page, `/b/${id}/`);
    await page.waitForSelector('#history');
    // textContent: terms and history wait behind a disclosure, and are still on the page.
    for (const phrase of phrases) await expect.poll(() => page.locator('main').textContent()).toContain(phrase);
    const text = (await page.locator('main').textContent())!;
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
    await solver.page.waitForSelector('[role=tablist]');
    expect(await solver.page.locator('[data-account] summary').getAttribute('aria-label')).toBe('Account: example-quill');
    // PF19: adding a way to be paid is a dialog on the solver's side.
    await solver.page.click('button[role=tab]:has-text("Solver")');
    await solver.page.click('text=+ Add a way to be paid');
    await solver.page.waitForSelector('dialog[open] input[name=kind]');
    // A wrong shape is refused where it was typed, with its next step.
    await solver.page.fill('input[name=value]', 'https://evil.example/paypal');
    await solver.page.click('dialog button[type=submit]');
    await expect.poll(() => solver.page.locator('dialog [role=status]').innerText()).toBe('That is not a PayPal.me. Next: paste a link that starts with https://paypal.me/');
    await solver.page.fill('input[name=value]', 'https://paypal.me/examplequill');
    await solver.page.click('dialog button[type=submit]');
    await expect.poll(() => solver.page.locator('main').innerText()).toContain('https://paypal.me/examplequill · Seen by: Everyone');
    // Choosing the email preselects "only an owner who owes me".
    await solver.page.click('text=+ Add a way to be paid');
    await solver.page.check('dialog[open] input[name=kind][value=wise-email]');
    expect(await solver.page.isChecked('input[value=owner-only]')).toBe(true);
    await solver.page.fill('input[name=value]', secret);
    await solver.page.click('dialog button[type=submit]');
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
    await owner.page.waitForSelector('[role=tablist]');
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
    await solver.page.click('[data-account] summary');
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
      await person.page.waitForSelector('[role=tablist]');
      await visit(person.page, `/b/${STATE_IDS.owed}/`);
      return person;
    };
    const says = (person: { page: Page }) => person.page.locator('main').innerText();
    const stranger = await fresh();
    await visit(stranger.page, `/b/${STATE_IDS.owed}/`);
    await expect.poll(() => says(stranger)).toContain('Owed to example-quill: $45, since');
    expect(await says(stranger)).toContain('Source: GitHub records pull request #68 merged.');
    expect(await says(stranger)).toContain('Not recorded paid by example-mara.');
    expect(await says(stranger)).not.toContain('Mark $45');

    const payee = await signedIn(7001, 'example-quill');
    await expect.poll(() => says(payee)).toContain('Owed to example-quill');
    expect(await says(payee)).not.toContain('Mark $45');

    const owner = await signedIn(7100, 'example-mara');
    await owner.page.click('text=Mark $45 paid to example-quill');
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
    expect(await says(stranger)).toContain('recorded paid, the solver says not received');

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

  it('the front page says it in few words, shows the real product, and leads to the detail', async () => {
    const { page, close } = await fresh();
    await visit(page, '/');
    await expect.poll(() => page.locator('main').innerText()).toContain('Not set up on this board yet.');
    const text = await page.locator('main').innerText();
    for (const phrase of ['Work your agent can\'t finish, finished.', 'goes out as a GitHub issue', 'come back as pull requests', 'never ships', 'Nothing a solver wrote is run', 'Post a private repository.', 'The board never holds money', 'By hand', 'One click', 'On merge', 'You pay through a link they listed', 'POST /mcp', 'GET /bounties.json']) expect(text).toContain(phrase);
    expect(text).not.toContain('Newest bounties');
    // No key on this board: the two ways that need one say so, and by hand does not.
    expect(text.match(/Not set up on this board yet./g)).toHaveLength(2);
    expect(text).toContain('You pay yourself'); // PF18, the owner: the cards show your part, not a button's words.
    expect(text).not.toContain('One click for you');
    // How it works says the ways in its steps, once, and which this board does not have.
    await visit(page, '/how/');
    await expect.poll(() => page.locator('main').textContent()).toContain('One click and on merge are not set up on this board yet.');
    const how = await page.locator('main').textContent();
    expect(how).not.toContain('Three ways to pay');
    expect(how).not.toContain('You pay yourself');
    expect(how).toContain('On your page, list a way and be paid by hand.'); // This board has no key. PF18: the words follow what it has.
    // A person only installs: every other command is folded away.
    expect(await page.locator('#hand-off ol > li').count()).toBe(4);
    expect(how).toContain('On merge pays without you:');
    expect(how).toContain('merges it and pushes');
    // One window: each command sits under a comment naming the card it belongs to.
    const groups = await page.locator('#hand-off details [data-group]').evaluateAll(elements => elements.map(element => ({
      title: element.querySelector('[data-comment]')?.textContent,
      commands: [...element.querySelectorAll('code[data-command]')].map(code => code.textContent!.split(' ').slice(0, 3).join(' '))
    })));
    expect(groups).toEqual([
      { title: '# Asks you a few things', commands: ['box bounty allow'] },
      { title: '# Packs and posts', commands: ['box bounty create', 'box bounty post', 'box bounty post'] },
      { title: '# Reads the solutions', commands: ['box bounty status', 'box bounty look'] },
      { title: '# Merges one', commands: ['box bounty apply'] }
    ]);
    const cards = await page.locator('#hand-off ol > li p.font-medium').allTextContents();
    expect(groups.map(group => group.title)).toEqual(cards.map(card => `# ${card}`));
    // A person gets on with the page: the only links in the owner's and solver's sections skip between them.
    expect(await page.locator('#hand-off a').count()).toBe(0);
    expect(await page.locator('#answer a').count()).toBe(0);
    expect(how).toContain('/bounties.json');
    expect(await page.locator('#hand-off details code[data-command]').count()).toBe(7);
    expect(await page.locator('#hand-off code[data-command]').count()).toBe(7);
    expect(await page.locator('#hand-off details').evaluate(element => (element as HTMLDetailsElement).open)).toBe(false);
    await visit(page, '/');
    // The picture is the real product in real text, and says it is an example.
    expect(await page.locator('main figure').innerText()).toContain('An example. Every name in it is invented');
    expect(await page.locator('[data-primary]').getAttribute('href')).toBe('/how/');
    expect(await page.locator('main a[href="/board/"]').count()).toBeGreaterThan(0);
    expect(await page.locator('main a[href^="/how/#"]').count()).toBe(0);
    await close();
  });

  // PF18: the real pages, each reading what the board says it has. Made fixed, the words fail here.
  it.each([
    ['no key', [], false, { through: 'A payment provider', connect: 'On your page, list a way and be paid by hand.', absent: ['Stripe or', 'connect Stripe', 'connect PayPal', 'a bank account in a supported country'] }],
    ['Stripe only', ['Stripe'], true, { through: 'Stripe', connect: 'connect Stripe and an owner can pay you with one click or on merge.', absent: ['PayPal'] }],
    ['PayPal only', ['PayPal'], false, { through: 'PayPal', connect: 'connect PayPal and an owner can pay you with one click.', absent: ['connect Stripe', 'a bank account in a supported country'] }],
    ['both', ['Stripe', 'PayPal'], true, { through: 'Stripe or PayPal', connect: 'connect Stripe or PayPal and an owner can pay you with one click; connected Stripe also covers on merge.', absent: [] }]
  ])('with %s, the card and How it works name what this board has', async (_name, one_click, on_merge, want) => {
    const { page, close } = await fresh();
    await page.route('**/api/ways', route => route.fulfill({ json: { by_hand: true, one_click, on_merge } }));
    await visit(page, '/');
    const oneClick = page.locator('main li', { has: page.locator('h3', { hasText: /^One click$/ }) });
    await expect.poll(() => oneClick.locator('p').first().innerText()).toBe(want.through);
    if (one_click.length === 0) await expect.poll(() => oneClick.innerText()).toContain('Not set up on this board yet');
    const front = await page.locator('main').innerText();
    expect(front.includes('One click for you')).toBe(one_click.length > 0);
    expect(front.includes('Nothing for you')).toBe(on_merge);
    expect(moneyClaims(front)).toEqual([]);
    await visit(page, '/how/');
    const step = page.locator('main li', { has: page.locator('h4', { hasText: 'Get merged, get paid, confirm' }) });
    await expect.poll(() => step.textContent()).toContain(want.connect);
    await expect.poll(async () => await page.locator('[data-stripe-reach]').count()).toBe(on_merge ? 1 : 0);
    const how = (await page.locator('main').textContent())!;
    for (const word of want.absent) expect(how, word).not.toContain(word);
    expect(moneyClaims(how)).toEqual([]);
    await close();
  });

  // PF19: Your page in each state, read from the real page with /api/me as the board would answer it.
  describe('your page, by role', () => {
    const debt = (id: string, title: string, amount: number, to: string | null, from: string) => ({ id, title, amount, since: new Date(NOW - 2 * 86400000).toISOString(), to, from });
    const base = { signed_in: true, sponsors_page: 'https://github.com/sponsors/example-rook', methods: [], paypal: { set_up: false, connected: false }, you_owe: [], owed_to_you: [], bounties: { list: [], more: false } };
    const pay = (over: object = {}) => ({ set_up: true, solver: { connected: false, ready: false }, card: null, limit: null, repositories: [], ...over });
    const open = async (me: object, path = '/me/', width = 1280) => {
      const view = await fresh({ width });
      await view.page.route('**/api/ways', route => route.fulfill({ json: { by_hand: true, one_click: ['Stripe'], on_merge: true } }));
      await view.page.route('**/api/me', route => route.fulfill({ json: me }));
      await view.page.goto(`${board.url}${path}`);
      await view.page.waitForSelector('[role=tablist]');
      return view;
    };
    const selected = (page: Page) => page.locator('[aria-label="Your role"] [role=tab][aria-selected=true]').innerText();

    it('an owner: what they owe, and pay on merge per repository; nothing about ways an owner need not set up', async () => {
      const owed = { id: STATE_IDS.owed, title: 'Pay me', repository: 'example-org/ledger', issue_number: 4, created_at: new Date(NOW - 2 * 86400000).toISOString(), reward: 45, solutions: 1, stage: 'due', merged: 'example-quill', note: null, card_failed: false, payable: true };
      const { page, close } = await open({ ...base, login: 'example-mara', you_owe: [debt(STATE_IDS.owed, 'Pay me', 45, 'example-quill', 'example-mara')], bounties: { list: [owed], more: false }, pay: pay({ card: 'visa ending 3155', repositories: [{ repository: 'example-org/ledger', on_at: new Date(NOW).toISOString(), limit: 100 }, { repository: 'example-org/lite', on_at: new Date(NOW).toISOString(), limit: 50 }] }) });
      expect(await selected(page)).toContain('Owner');
      expect(await page.locator('h1').innerText()).toBe('Owner');
      const text = await page.locator('main').innerText();
      // PF21: what is owed is the Payment due stage, chosen when the page opens (it was the "You owe" figure).
      expect(await page.locator('[data-stage-tab][aria-selected=true]').innerText()).toMatch(/^Payment due\s+1\s+\$45$/);
      expect(await page.locator(`tr[data-bounty="${STATE_IDS.owed}"]`).innerText()).toMatch(/Merged · example-quill\s+\$45\s+Pay \$45/);
      expect(await page.locator('table[aria-label="Repositories on pay on merge"] tbody tr').allInnerTexts()).toEqual([expect.stringMatching(/example-org\/ledger\s+\$100/), expect.stringMatching(/example-org\/lite\s+\$50/)]);
      for (const absent of ['By hand', 'One click', 'Owed to you']) expect(text, absent).not.toContain(absent);
      expect(moneyClaims(text)).toEqual([]);
      await close();
    });

    it.each([
      ['connected', { connected: true, ready: true }, 'Connected', 'ok', 'Ready'],
      ['checking', { connected: true, ready: false }, 'Stripe is checking your details', 'wait', 'Needs Stripe'],
      ['not connected', { connected: false, ready: false }, 'Not connected', 'off', 'Needs Stripe']
    ])('a solver whose Stripe is %s: each status follows what the board says', async (_name, solver, badge, tone, onMerge) => {
      const { page, close } = await open({ ...base, login: 'example-quill', owed_to_you: [debt(STATE_IDS.owed, 'Pay me', 60, 'example-quill', 'example-mara')], methods: [{ kind: 'github-sponsors', value: 'https://github.com/sponsors/example-quill', visibility: 'everyone', link: true }], pay: pay({ solver }) });
      expect(await selected(page)).toContain('Solver');
      expect(await page.locator('h1').innerText()).toBe('Solver');
      const stripe = page.locator('#stripe');
      expect(await stripe.locator('[data-badge]').innerText()).toBe(badge);
      expect(await stripe.locator('[data-badge]').getAttribute('data-badge')).toBe(tone);
      const text = await page.locator('main').innerText();
      expect(await page.locator('[data-figure]').innerText()).toMatch(/Owed to you\s+\$60/);
      expect(text).toContain(onMerge);
      expect(text).toContain('https://github.com/sponsors/example-quill · Seen by: Everyone');
      expect(text).not.toContain('You owe');
      expect(moneyClaims(text)).toEqual([]);
      await close();
    });

    it('both roles: the one owing opens, the other shows its count, and arrows switch', async () => {
      const both = { ...base, login: 'example-rook', you_owe: [debt(STATE_IDS.owed, 'Pay me', 30, 'example-fern', 'example-rook')], owed_to_you: [debt(STATE_IDS.merged, 'Paid to me', 45, 'example-rook', 'example-mara')], pay: pay() };
      const { page, close } = await open(both);
      expect(await selected(page)).toContain('Owner');
      expect(await page.locator('[role=tab]:has-text("Solver") [data-waiting]').innerText()).toBe('1');
      await page.locator('[aria-label="Your role"] [role=tab][aria-selected=true]').focus();
      await page.keyboard.press('ArrowRight');
      expect(await selected(page)).toContain('Solver');
      expect(await page.evaluate(() => document.activeElement?.textContent)).toContain('Solver');
      await close();
      // The address names a side: back from Stripe, the solver's side opens even with something owed.
      const back = await open(both, '/me/#stripe');
      expect(await selected(back.page)).toContain('Solver');
      await back.close();
    });

    // PF20, the owner: one fixed amount called "Reward" (never "limit", the tool's word for its budget), and repositories
    // picked from the owner's own bounties, nothing typed.
    it('pay on merge says "Reward"; only your repositories with bounties are offered, each starting from its reward', async () => {
      const yours = [{ repository: 'example-org/ledger', open: 2, reward: 45 }, { repository: 'example-org/lite', open: 1, reward: 75 }];
      const { page, close } = await open({ ...base, login: 'example-mara', pay: pay({ card: 'visa ending 3155', repositories: [{ repository: 'example-org/ledger', on_at: new Date(NOW).toISOString(), limit: 45, open: 2 }], yours }) }, '/me/#pay');
      const section = async () => { const text = await page.locator('main').innerText(); return text.slice(text.indexOf('Pay on merge')); };
      expect(await page.locator('table[aria-label="Repositories on pay on merge"] th').allInnerTexts()).toEqual(['Repository', 'Reward', 'Open bounties', 'On since', '']);
      expect(await section()).not.toMatch(/limit|charge up to/i);
      await page.click('text=+ Add a repository');
      const dialog = page.locator('dialog[open]');
      expect(await dialog.locator('input[name=repository]').evaluateAll(inputs => inputs.map(input => [(input as HTMLInputElement).type, (input as HTMLInputElement).value]))).toEqual([['radio', 'example-org/lite']]);
      expect(await dialog.innerText()).toContain('1 open · $75');
      expect(await page.inputValue('dialog[open] input[name=reward]')).toBe('75');
      expect(await dialog.innerText()).not.toMatch(/limit/i);
      await close();
    });

    // PF20, the owner: removing the card is the page's one destructive action, so it sits on the card and is said in full first.
    it('removing the card asks first, names what stops, and Cancel changes nothing', async () => {
      const card = { card: 'visa ending 3155', repositories: [{ repository: 'example-org/ledger', on_at: new Date(NOW).toISOString(), limit: 45, open: 2 }, { repository: 'example-org/lite', on_at: new Date(NOW).toISOString(), limit: 75, open: 1 }], yours: [] };
      const { page, close } = await open({ ...base, login: 'example-mara', pay: pay(card) }, '/me/#pay');
      const sent: unknown[] = [];
      await page.route('**/api/me/pay', route => { sent.push(route.request().postDataJSON()); return route.fulfill({ json: { pay: pay({ card: null, repositories: [], yours: [] }) } }); });
      expect(await page.locator('main').innerText()).not.toContain('turn pay on merge off');
      const remove = page.getByRole('button', { name: 'Remove', exact: true });
      expect(await remove.count()).toBe(1);
      expect(await remove.getAttribute('data-danger')).toBe('true');
      await remove.click();
      const dialog = page.locator('dialog[open]');
      expect(await dialog.locator('h2').innerText()).toBe('Remove your card?');
      expect(await dialog.locator('[data-removing]').innerText()).toMatch(/Pay on merge stops for all 2 repositories\.\s+visa ending 3155 is removed from Stripe; the board can no longer charge it\.\s+Payments already made do not change\. You can still pay any bounty from its page\./);
      await dialog.locator('button:has-text("Cancel")').click();
      await expect.poll(() => page.locator('dialog[open]').count()).toBe(0);
      expect(sent).toEqual([]);
      await remove.click();
      await page.locator('dialog[open] button[type=submit]').click();
      await expect.poll(() => sent).toEqual([{ remove_card: true }]);
      await close();
    });

    it('with no bounties posted, pay on merge says to post one first, and offers nothing to type', async () => {
      const { page, close } = await open({ ...base, login: 'example-mara', pay: pay({ card: 'visa ending 3155', repositories: [], yours: [] }) }, '/me/#pay');
      expect(await page.locator('main').innerText()).toMatch(/No repositories yet\.\s+Pay on merge works on repositories where you have posted a bounty\. Post one with your agent \(box bounty\), and it appears here to turn on\./);
      expect(await page.locator('text=+ Add a repository').count()).toBe(0);
      await close();
    });

    it('the account menu holds the public profile and sign-out; the add dialog opens and closes by keyboard; a phone holds it all', async () => {
      const me = { ...base, login: 'example-quill', pay: pay() };
      const { page, close } = await open(me);
      expect(await page.locator('main').innerText()).not.toContain('Sign out');
      await page.click('[data-account] summary');
      expect(await page.locator('[data-account] [role=menu]').innerText()).toMatch(/Your public profile as a solver[\s\S]*Sign out/);
      await page.keyboard.press('Escape');
      await page.locator('button:has-text("+ Add a way to be paid")').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('dialog[open]');
      await page.keyboard.press('Escape');
      await expect.poll(() => page.locator('dialog[open]').count()).toBe(0);
      await close();
      const phone = await open(me, '/me/', 390);
      expect(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await phone.close();
    });
  });

  it('the picker comes from the one source', async () => {
    const { page, close } = await fresh();
    await page.route('**/api/ways', route => route.fulfill({ json: { by_hand: true, one_click: ['Stripe'], on_merge: true } }));
    await page.route('**/api/me', route => route.fulfill({ json: { signed_in: true, login: 'example-quill', sponsors_page: 'https://github.com/sponsors/example-quill', methods: [], pay: { set_up: true, solver: { connected: false, ready: false }, card: null, limit: null, repositories: [] }, paypal: { set_up: false, connected: false }, you_owe: [], owed_to_you: [] } }));
    await visit(page, '/me/');
    // The browser's own names: Node's say "Hong Kong SAR China".
    const names = await page.evaluate(codes => codes.map(code => new Intl.DisplayNames(['en'], { type: 'region' }).of(code)!), [...STRIPE_COUNTRIES]);
    await page.locator('select[name=country]').waitFor();
    const picker = await page.locator('select[name=country] option').allTextContents();
    expect(picker).toEqual(names);
    await close();
  });

  it('how it works: both paths, every step, and each fact the front page leaves out', async () => {
    const { page, close } = await fresh();
    await visit(page, '/how/');
    const text = (await page.locator('main').textContent())!;
    for (const phrase of ['Hand off work', 'Answer bounties', 'Nothing a solver wrote is run', 'a private repository is refused', 'never-ship files', 'anything else in it is too', 'The board never holds money', 'install nothing from this page', 'nothing here makes them pay', 'it asks you before each post and each merge', 'only the repository, the issue number, the bounty id and what happened']) expect(text).toContain(phrase);
    // The agent's four, the solver's three.
    expect(await page.locator('main ol > li').count()).toBe(7);
    expect(await page.locator('main a[href="#answer"]').count()).toBe(1);
    expect(await page.locator('#answer h2').innerText()).toBe('Answer bounties');
    expect(await page.locator('#limits details').count()).toBe(4); // PF18, the owner: building from source moved to the README.
    await page.click('#limits summary >> text=What becomes public');
    expect(await page.locator('#limits details[open]').innerText()).toContain('a private repository is refused');
    await close();
  });

  it('the front page tells its story once, and does not move at all when motion is reduced', async () => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const still = await context.newPage();
    await still.goto(`${board.url}/`);
    expect(await still.evaluate(() => document.getAnimations().length)).toBe(0);
    await context.close();
    const moving = await fresh();
    await moving.page.goto(`${board.url}/`);
    const iterations = await moving.page.evaluate(() => document.getAnimations().map(a => a.effect?.getTiming().iterations));
    expect(iterations.length).toBeGreaterThan(0);
    for (const count of iterations) expect(count).toBe(1);
    // Complete at rest: when the story has told itself, nothing in the picture is hidden.
    await moving.page.waitForTimeout(5000);
    expect(await moving.page.evaluate(() => [...document.querySelectorAll('.story')].every(el => getComputedStyle(el).opacity === '1'))).toBe(true);
    await moving.close();
  }, 30000);

  it('a copy button copies exactly the words beside it, and says so', async () => {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    await page.goto(`${board.url}/how/`);
    await page.click('#hand-off details summary');
    const block = page.locator('main button[aria-label="Copy commands"]');
    await block.click();
    await expect.poll(() => block.innerText()).toBe('Copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    for (const line of ['# Packs and posts', 'box bounty allow <owner>/<repository>', 'box bounty apply <id> <n>']) expect(copied).toContain(line);
    await page.locator('main button[aria-label="Copy install line"]').click();
    const install = await page.locator('main code[data-install]').allInnerTexts();
    // Windows' clipboard hands back \r\n for the \n the page wrote.
    await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).split(/\r?\n/)).toEqual(install);
    await context.close();
  });

  it('a bounty page: the breadcrumb goes to the board, and the branch can be copied', async () => {
    const { page, close } = await fresh();
    await visit(page, `/b/${STATE_IDS.open}/`);
    await page.waitForSelector('nav[aria-label=Breadcrumb]');
    expect(await page.locator('nav[aria-label=Breadcrumb] a').getAttribute('href')).toBe('/board/');
    expect(await page.locator('main button[aria-label="Copy branch name"]').getAttribute('data-copy')).toBe(`box-bounty/${STATE_IDS.open}`);
    await close();
  });

  it('a poster\'s HTML in the list renders as text, never executed', async () => {
    const { page, close } = await fresh();
    await page.route('**/api/board', async route => {
      const response = await route.fetch();
      const body = await response.json() as { bounties: { title: string }[] };
      body.bounties[0]!.title = '<img src=x onerror=window.__pwned=1>';
      await route.fulfill({ response, json: body });
    });
    await visit(page, '/board/');
    await expect.poll(() => page.locator('main ul').innerText()).toContain('<img src=x onerror=');
    expect(await page.locator('main ul img').count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await close();
  });

  it('every command on the front page runs with the arguments it prints, in order, through the whole journey', async () => {
    const { page, close } = await fresh();
    await visit(page, '/how/');
    // Text, not what shows: the agent's commands are folded until someone opens them.
    const lines = await page.locator('main code[data-command]').allTextContents();
    await visit(page, '/');
    const posted = await page.locator('main [data-flow-output=post]').innerText();
    const applied = await page.locator('main [data-flow-output=apply]').innerText();
    await close();
    // The page's own list: a command added, dropped or reworded fails here.
    expect(lines).toEqual([
      'box bounty allow <owner>/<repository> --reward <reward> --reward-limit <limit>',
      'box bounty create --task TASK.md --why "beyond what this agent can do"',
      'box bounty post <id> --preview',
      'box bounty post <id>',
      'box bounty status <id>',
      'box bounty look <id> <n>',
      'box bounty apply <id> <n>'
    ]);
    const world = journeyWorld();
    try {
      const fill = (line: string, values: Record<string, string>): string[] => {
        const words = wordsOf(line);
        expect(words.slice(0, 2)).toEqual(['box', 'bounty']);
        return words.slice(1).map(word => Object.entries(values).reduce((out, [key, value]) => out.replaceAll(key, value), word));
      };
      const values: Record<string, string> = { '<owner>': 'owner', '<repository>': 'project', '<reward>': '10', '<limit>': '50' };
      const run = (line: string, expected: string) => {
        const { status, output } = world.box(fill(line, values));
        expect(status, `${line}\n${output}`).toBe(0);
        expect(output, line).not.toMatch(/^usage:/m);
        expect(output, line).toContain(expected);
        return output;
      };
      const [allow, create, preview, post, status, look, apply] = lines as [string, string, string, string, string, string, string];
      const paid = 'box bounty config set paid <id>'; // Off the page, since paying is on the bounty's page; the tool still prints it.
      run(allow, 'owner/project');
      values['<id>'] = /bt-[a-f\d]{12}/.exec(run(create, 'bt-'))![0];
      // A second open bounty: from here a command with no id has to say which one.
      expect(world.box(['bounty', 'create', '--task', 'OTHER.md', '--why', 'another handoff']).status).toBe(0);
      run(preview, 'preview only');
      // The picture's output is what the tool prints, its invented id and address aside.
      const printed = run(post, 'posted');
      expect(printed).toContain(posted.replaceAll('bt-4f2a91c07d3e', values['<id>']!).replace(/https:\/\/github\.com\/example-org\/ledger\/issues\/48$/, ''));
      values['<n>'] = String(world.answer(values['<id>']!));
      run(status, values['<id>']!);
      run(look, 'written by the solver');
      for (const line of [look, apply]) {
        const refused = world.box(fill(line.replace('<id> ', ''), values));
        expect(refused.output, line).toContain('name a bounty');
      }
      expect(world.fixed()).toBe(false);
      const merged = run(apply, 'applied');
      expect(merged.replace(/\b[a-f\d]{40}\b/g, '<commit>')).toContain(applied.replaceAll('bt-4f2a91c07d3e', values['<id>']!).replace('attempt 62', `attempt ${values['<n>']}`).replace(/\b[a-f\d]{40}\b/, '<commit>'));
      expect(world.fixed()).toBe(true);
      run(paid, values['<id>']!);
      // Each usage line's arguments are on the page: `look <n>` alone would fail here.
      for (const [line, command, names] of [[post, 'post', ['<id>']], [status, 'status', ['<id>']], [look, 'look', ['<id>', '<n>']], [apply, 'apply', ['<id>', '<n>']]] as const) {
        const usage = /^usage: (.*)$/m.exec(world.box(['bounty', command, '--help']).output)![1]!;
        for (const name of names) {
          expect(usage).toContain(name);
          expect(line, usage).toContain(name);
        }
      }
    } finally {
      world.close();
    }
  }, 180000);

  it('the install line names what the release attaches, and the source lines give a real box', async () => {
    const { page, close } = await fresh();
    await visit(page, '/how/');
    const install = await page.locator('main code[data-install]').allInnerTexts();
    await close();
    const clone = join(PACKAGE, '../..');
    const lines = /## Build it from source[\s\S]*?```bash\r?\n([\s\S]*?)```/.exec(readFileSync(join(clone, 'README.md'), 'utf8'))![1]!.trim().split(/\r?\n/);
    // The page, the release job and the guide inside the package name one address.
    expect(install).toEqual(['npx -y omakase-box setup']);
    expect(readFileSync(join(clone, 'FIRST-FIVE-MINUTES.md'), 'utf8')).toContain(install[0]!);
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('git clone https://github.com/shouteck/omakase-box');
    expect(lines[5]).toBe('box bounty');
    for (const script of ['scripts/pnpm.mjs', 'scripts/tooling/package.json']) expect(existsSync(join(clone, script)), script).toBe(true);
    // The printed install line, into a throwaway prefix: it makes a real `box`, and this machine's own commands are untouched.
    const prefix = mkdtempSync(join(tmpdir(), 'kitchen-PF15-prefix-'));
    const env = { ...process.env, npm_config_prefix: prefix, PATH: [prefix, join(prefix, 'bin'), process.env['PATH']].join(delimiter) };
    const run = (line: string, cwd: string) => spawnSync(line, { cwd, env, shell: true, encoding: 'utf8', timeout: 120000 });
    try {
      const installed = run(`${lines[4]!} --no-audit --no-fund`, clone);
      expect(installed.status, installed.stderr).toBe(0);
      const box = run('box bounty help', prefix);
      expect(box.status, box.stderr).toBe(0);
      expect(box.stdout).toContain('the journey');
    } finally {
      // npm removes its own link first, so deleting the folder cannot follow it into the clone (BT46).
      run('npm uninstall -g @private-task/box-cli --no-audit --no-fund', clone);
      rmSync(prefix, { recursive: true, force: true });
    }
  }, 180000);

  it('your page: an owner sees what they owe and the solver what is owed to them, and each links to the bounty', async () => {
    const signedIn = async (id: number, login: string) => {
      board.standin.signInAs = { id, login };
      const person = await fresh();
      await visit(person.page, '/me/');
      await person.page.click('[data-primary]');
      await person.page.waitForSelector('[role=tablist]');
      return person;
    };
    // PF21: the owner's side opens on the stage waiting on them, Payment due, where what they owe is paid from.
    const owner = await signedIn(7100, 'example-mara');
    expect(await owner.page.locator('[role=tablist][aria-label="Your role"] [role=tab][aria-selected=true]').innerText()).toContain('Owner');
    expect(await owner.page.locator('[data-stage-tab][aria-selected=true]').innerText()).toMatch(/^Payment due\s+2\s+\$90$/);
    const owed = owner.page.locator(`tr[data-bounty="${STATE_IDS.owed}"]`);
    expect(await owed.innerText()).toMatch(/Duplicate rows after a retry\s+example-tidepool\/ledger-lite #55 · \d+ days? ago\s+Payment due\s+Pay on merge is off for this repository\.\s+\$45\s+Pay \$45/);
    expect(await owed.locator(`a[href="/b/${STATE_IDS.owed}/"]`).count()).toBe(1);
    expect(await owed.locator(`a[href="/b/${STATE_IDS.owed}/#payment"]`).innerText()).toBe('Pay $45');
    const solver = await signedIn(7001, 'example-quill');
    expect(await solver.page.locator('[role=tab][aria-selected=true]').innerText()).toContain('Solver');
    expect(await solver.page.locator('table[aria-label="Coming to you"] tbody tr').filter({ hasText: 'Duplicate rows after a retry' }).innerText()).toMatch(/example-mara\s+\$45\s+\d+ \w+ \d{4}\s+Open/);
    for (const person of [owner, solver]) await person.close();
  });

  it('your bounties: the stages choose the list, every row has the same shape, and only the owner\'s own bounties are there', async () => {
    board.standin.signInAs = { id: 7100, login: 'example-mara' };
    const { page, close } = await fresh();
    await visit(page, '/me/');
    await page.click('[data-primary]');
    await page.waitForSelector('[data-stage-tab]');
    const stages = await page.locator('[data-stage-tab]').allInnerTexts();
    expect(stages.map(text => text.replace(/\s+/g, ' ').trim())).toEqual(['Waiting for solutions 3 $90', 'Solutions in 1 $45', 'Payment due 2 $90', 'Paid 1 $45']);
    expect(await page.locator('[data-stage-tab="due"] [data-waiting-dot]').count()).toBe(1);
    const shown = async () => page.locator('tr[data-bounty]').evaluateAll(rows => rows.map(row => `${(row as HTMLElement).dataset['stage']} ${(row.querySelector('a') as HTMLElement).innerText}`));
    await page.click('[data-stage-tab="paid"]');
    expect(await shown()).toEqual(['paid Totals round the wrong way']);
    expect(await page.locator(`tr[data-bounty="${STATE_IDS.merged}"] [data-detail]`).innerText()).toBe('example-quill · Recorded by you');
    expect(await page.locator(`tr[data-bounty="${STATE_IDS.merged}"] [data-detail] a`).getAttribute('href')).toBe('/solver/example-quill/');
    // The arrow keys move along the stages, as a tab list does.
    await page.focus('[data-stage-tab="paid"]');
    await page.keyboard.press('ArrowLeft');
    expect(await page.locator('[data-stage-tab][aria-selected=true]').getAttribute('data-stage-tab')).toBe('due');
    await page.click('[data-view="all"]');
    const all = await shown();
    expect(all).toHaveLength(8);
    // Every bounty on the page is one example-mara opened; none of the 120 other posters' bounties is.
    expect(all.every(entry => !entry.includes('example-org'))).toBe(true);
    expect(await page.locator('tr[data-bounty]').evaluateAll(rows => rows.every(row => row.querySelectorAll('td').length === 4))).toBe(true);
    await page.click('[data-view="closed"]');
    expect(await shown()).toEqual(['closed Export to a format nobody uses']);
    await close();
    // A person who posted nothing is told how bounties arrive.
    board.standin.signInAs = { id: 7001, login: 'example-quill' };
    const quill = await fresh();
    await visit(quill.page, '/me/');
    await quill.page.click('[data-primary]');
    // Something is owed to them, so the solver's side opens; the owner's side is one click away.
    await quill.page.click('[aria-label="Your role"] [role=tab]:has-text("Owner")');
    await quill.page.waitForSelector('[data-no-bounties]');
    expect(await quill.page.locator('[data-no-bounties]').innerText()).toContain('box bounty post');
    await quill.close();
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
    const privacy = await page.locator('main').innerText();
    expect(privacy).toContain('It never asks for your email address');
    for (const stored of ['your Stripe account ID', 'customer and card IDs', 'the provider\'s payment IDs', 'your PayPal account ID']) expect(privacy).toContain(stored);
    await close();
  });

  it('the footer names who runs the board and reaches the terms, which say it holds no money', async () => {
    const { page, notFound, close } = await fresh();
    await visit(page, '/board/');
    expect(await page.locator('footer').innerText()).toContain('Run by omakase-box');
    await page.click('footer >> text=Terms');
    await page.waitForURL(/\/terms\//);
    const terms = await page.locator('main').innerText();
    for (const phrase of ['run by omakase-box', 'never holds money', 'does not guarantee that anyone pays', 'Refunds, disputes and reversals', 'no warranty']) expect(terms).toContain(phrase);
    expect(notFound).toEqual([]);
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
    await visit(page, '/board/?query=PRIVATE');
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
    for (const path of ['/', '/board/', '/how/', '/agents/', '/me/', '/sign-in/', '/privacy/', '/terms/', '/solver/example-quill/', '/owner/example-mara/', `/b/${STATE_IDS.merged}/`]) {
      await visit(page, path);
      expect(moneyClaims(await page.locator('body').innerText()), path).toEqual([]);
    }
    expect(moneyClaims('This bounty is funded and paid out by the board.')).toHaveLength(1);
    await close();
  });

  it('clicks through two pages with nothing answering 404', async () => {
    const { page, notFound, close } = await fresh();
    await visit(page, '/board/');
    await page.click('main ul li a');
    await page.waitForURL(/\/b\/bt-/);
    await expect.poll(() => page.locator('main').innerText()).toContain('Payment for this bounty');
    await page.click('nav[aria-label=Site] >> text=How it works');
    await page.waitForURL(/\/how\//);
    await page.click('nav[aria-label=Site] a[href="/board/"]');
    await expect.poll(() => page.locator('main [aria-live]').innerText()).toContain('open bounties');
    expect(notFound).toEqual([]);
    await close();
  });

  it('keyboard: skip link first, then the site name; a visible focus ring; a select reachable', async () => {
    const { page, close } = await fresh();
    await visit(page, '/board/');
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

  it('the visual rules, measured on the real pages, both themes and both widths', async () => {
    for (const dark of [false, true]) for (const width of [1280, 390]) {
      const { page, close } = await fresh({ width, dark });
      for (const [name, path] of [['front', '/'], ['board', '/board/'], ['bounty', `/b/${STATE_IDS.waiting}/`]] as const) {
        await visit(page, path);
        await expect.poll(() => page.locator('main').innerText()).toMatch(/three ways|open bounties.|Payment for this bounty/);
        const measured = await page.evaluate(() => {
          const sizes = new Set<string>(); const weights = new Set<string>(); const families = new Set<string>();
          for (const element of document.querySelectorAll('body *')) {
            const style = getComputedStyle(element);
            if ([...element.childNodes].some(node => node.nodeType === 3 && node.textContent?.trim())) { sizes.add(style.fontSize); weights.add(style.fontWeight); families.add(style.fontFamily.split(',')[0]!); }
          }
          return { sizes: [...sizes], weights: [...weights], families: [...families], overflow: document.documentElement.scrollWidth > window.innerWidth, primaries: document.querySelectorAll('[data-primary]').length };
        });
        for (const size of measured.sizes) expect(['13px', '14px', '16px', '20px', '28px', '40px', '56px', '80px']).toContain(size);
        for (const weight of measured.weights) expect(['400', '500', '600']).toContain(weight);
        for (const family of measured.families) expect(['"Geist Sans"', '"Geist Mono"']).toContain(family);
        expect(measured.families).toContain('"Geist Sans"');
        expect(measured.overflow).toBe(false);
        expect(measured.primaries).toBeLessThanOrEqual(1);
        await page.screenshot({ path: join(SHOTS, `${name}-${dark ? 'dark' : 'light'}-${width === 390 ? 'phone' : 'desktop'}.png`), fullPage: false });
      }
      await close();
    }
  }, 120000);

  it('every piece of text is readable on what is actually behind it, in both themes', async () => {
    for (const colorScheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({ colorScheme, reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      for (const path of ['/', '/how/', '/board/', `/b/${STATE_IDS.waiting}/`]) {
        await visit(page, path);
        const pairs = await page.evaluate(() => {
          const parse = (value: string) => /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/.exec(value)?.slice(1).map(part => part === undefined ? 1 : Number(part));
          const hex = (rgb: number[]) => `#${rgb.slice(0, 3).map(part => Math.round(part).toString(16).padStart(2, '0')).join('')}`;
          const found: { text: string; ink: string; ground: string }[] = [];
          for (const element of document.querySelectorAll('main *')) {
            if (![...element.childNodes].some(node => node.nodeType === 3 && node.textContent?.trim())) continue;
            const ink = parse(getComputedStyle(element).color);
            let at: Element | null = element;
            let ground: number[] | undefined;
            while (at !== null && (ground === undefined || ground[3] === 0)) { ground = parse(getComputedStyle(at).backgroundColor); at = at.parentElement; }
            if (ink !== undefined && ground !== undefined && ground[3] !== 0) found.push({ text: element.textContent!.trim().slice(0, 40), ink: hex(ink), ground: hex(ground) });
          }
          return found;
        });
        expect(pairs.length, path).toBeGreaterThan(5);
        for (const pair of pairs) expect(ratio(pair.ink, pair.ground), `${colorScheme} ${path}: "${pair.text}" ${pair.ink} on ${pair.ground}`).toBeGreaterThanOrEqual(4.5);
      }
      await context.close();
    }
  }, 60000);

  it('contrast meets WCAG 2.2 AA for every text and control colour, computed from the stylesheet', () => {
    const css = readFileSync(join(PACKAGE, 'app/globals.css'), 'utf8');
    const [light, dark] = [css.slice(0, css.indexOf('@media')), css.slice(css.indexOf('@media'))];
    const token = (block: string, name: string) => new RegExp(`--color-${name}: (#[0-9a-f]{6})`).exec(block)![1]!;
    for (const block of [light, dark]) {
      const paper = token(block, 'paper');
      for (const name of ['ink', 'soft', 'accent']) expect(ratio(token(block, name), paper), name).toBeGreaterThanOrEqual(4.5);
      for (const ground of ['surface', 'card']) for (const name of ['ink', 'soft', 'accent']) expect(ratio(token(block, name), token(block, ground)), `${name} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(block, 'button-ink'), token(block, 'button')), 'the button').toBeGreaterThanOrEqual(4.5);
      for (const name of ['code-ink', 'code-soft']) expect(ratio(token(block, name), token(block, 'code')), `${name} on code`).toBeGreaterThanOrEqual(4.5);
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
    await visit(page, `/board/?repository=${repository}`);
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
      await page.goto(`${board.url}/board/`);
      await expect.poll(() => page.locator('main').innerText()).toContain('A bounty appears here a few minutes after someone posts one on a public GitHub repository.');
      expect(await page.locator('main a[href="/how/"]').count()).toBe(1);
      // No filter panel over nothing.
      expect(await page.locator('main form[role=search]').count()).toBe(0);
      // The front page simply leaves the list out.
      await page.goto(`${board.url}/`);
      await page.waitForLoadState('networkidle');
      expect(await page.locator('main').innerText()).not.toContain('Newest bounties');
      board.standin.rateLimitAfter = 0;
      board.standin.resetAt = Math.floor((clock + 30 * MINUTE) / 1000);
      clock += 15 * MINUTE;
      await board.refresh();
      await page.goto(`${board.url}/board/`);
      await expect.poll(() => page.locator('main').innerText()).toContain(`The board could not read GitHub after 12:00 UTC: GitHub's rate limit for this hour is used up. What you see is from 12:00 UTC. Nothing to do: the board tries again every 15 minutes.`);
    } finally {
      await browser.close();
      await board.stop();
    }
  });
});
