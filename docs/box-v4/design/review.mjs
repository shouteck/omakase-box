// Before-and-after pictures of the site, made from the real pages.
//
//   node packages/box-platform/local.mjs          (in another terminal: the local board with sample data)
//   node docs/box-v4/design/review.mjs            (writes docs/box-v4/design/review/*.png)
//
// "Before" is the page exactly as the code on this checkout builds it. "After" is the same page with a
// small patch applied in the browser: the proposal, and nothing else. So everything a proposal does not
// mention is, by construction, unchanged. The patches below are the design; a wave that builds one
// reads its patch here.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'review');
const BOARD = process.env.BOARD ?? 'http://localhost:4320';
const SIZES = { desktop: [1440, 900], phone: [390, 844] };
mkdirSync(OUT, { recursive: true });

// Mark A, chosen by the owner on 11 November 2026.
const MARK = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:1.15rem;height:1.15rem;flex:none"><path d="M4.5 10v9.5h15V10" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><rect x="9" y="3.5" width="6" height="6" fill="currentColor"/></svg>';

// ---- the patches. Each runs inside the page. ----

// 1. The frame: the mark and the one name; one action at the end of the navigation; every link on a phone.
const frame = ({ MARK }) => {
  const nav = document.querySelector('nav[aria-label="Site"] > div');
  const brand = nav.querySelector('a[href="/"]');
  brand.innerHTML = `${MARK}<span>omakase-box</span>`;
  Object.assign(brand.style, { display: 'inline-flex', alignItems: 'center', gap: '0.55rem' });
  for (const link of nav.querySelectorAll('a')) link.classList.remove('hidden');
  const phone = window.innerWidth < 640;
  const action = document.createElement('a');
  action.href = '/how/';
  action.textContent = 'Get started';
  Object.assign(action.style, { background: 'var(--color-button)', color: 'var(--color-button-ink)', padding: '0.3rem 0.9rem', borderRadius: '999px', fontWeight: '500', textDecoration: 'none', whiteSpace: 'nowrap' });
  if (phone) {
    // Row one: the name and the action. Row two: every link.
    brand.style.width = 'auto'; brand.style.marginRight = 'auto';
    brand.after(action);
    const breaker = document.createElement('span'); breaker.style.flexBasis = '100%'; action.after(breaker);
    nav.style.columnGap = '1rem';
    for (const link of nav.querySelectorAll('a')) if (link.textContent === 'GitHub') link.remove();
  } else nav.append(action);
  document.title = document.title.replace(/open bounty board/i, 'omakase-box');
};

// 2. The front page: the install line under the two buttons; a third way in (both approved by the owner,
// 11 November 2026); and the picture replaced by the hand-off bench (hero/build.mjs), proposed.
const front = ({ HERO }) => {
  const buttons = document.querySelector('header p.mt-8');
  const line = document.createElement('p');
  line.style.cssText = 'margin:1.25rem auto 0;display:inline-flex;align-items:center;gap:0.9rem;border:1px solid var(--color-line);background:var(--color-card);border-radius:999px;padding:0.4rem 0.45rem 0.4rem 1.1rem;max-width:100%';
  line.innerHTML = '<code style="font-size:0.875rem"><span style="color:var(--color-soft)">$ </span>npx -y omakase-box setup</code><span style="font-size:0.8125rem;border:1px solid var(--color-line);border-radius:999px;padding:0.1rem 0.7rem;color:var(--color-soft)">Copy</span>';
  const holder = document.createElement('div'); holder.append(line); buttons.after(holder);
  const doors = document.querySelector('section[aria-label="Where to start"]');
  const third = doors.children[1].cloneNode(true);
  third.querySelector('h3').textContent = 'Maintain a repository?';
  third.querySelector('p').textContent = 'Put a reward on an issue you already have. Nothing to install.';
  third.querySelector('a').firstChild.textContent = 'List an issue ';
  doors.children[0].after(third);
  if (window.innerWidth >= 768) doors.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  if (HERO) document.querySelector('figure > div.wash').outerHTML = HERO;
};

// 3. How it works, the solver's half. The page's own rule is kept: plain text is what you do, the boxed panel is
// what your agent does. So the solver's half gets the same three parts as the owner's half: what you set up once,
// what your agent then does on its own, and, for anyone working without the tool, the steps by hand (unchanged).
const how = () => {
  const handOff = document.querySelector('#hand-off');
  const [title, install, panel] = [handOff.children[1], handOff.children[2], handOff.children[3]];
  const list = document.querySelector('#answer ol');
  const setUpTitle = title.cloneNode(true); setUpTitle.textContent = 'You set it up';
  const setUp = install.cloneNode(true);
  setUp.querySelector('p').innerHTML = 'The same tool. Allow solving once, and on your page connect a way to be paid. That is all you do.';
  const code = setUp.querySelector('code[data-install]');
  const second = code.cloneNode(true); second.textContent = 'box bounty config set solving allowed';
  second.style.display = 'block'; code.style.display = 'block'; code.after(second);
  const agent = panel.cloneNode(true);
  agent.querySelector('h3').nextElementSibling.textContent = 'It finds work that fits, does it in the open, and follows it until you are paid.';
  const cards = agent.querySelector('ol'); const card = cards.children[0];
  const STEPS = [['Finds a bounty', 'New ones since its last look, by language and reward.'], ['Starts in the open', 'A throwaway copy and a draft pull request others can see.'], ['Marks it ready', "When the work is done, for the owner's agent to read."], ['Follows it to paid', 'Merged, paid, and whether the money arrived.']];
  cards.replaceChildren(...STEPS.map(([name, words]) => { const c = card.cloneNode(true); c.children[0].textContent = name; c.children[1].textContent = words; return c; }));
  const byHandTitle = title.cloneNode(true); byHandTitle.textContent = 'Or answer by hand, with your own tools';
  byHandTitle.style.marginTop = '3.5rem';
  list.before(setUpTitle, setUp, agent, byHandTitle);
};

// 4. The empty board, second pass: one message, two plain links, and one sample row. No panels.
const emptyBoard = () => {
  const box = [...document.querySelectorAll('p')].find(p => p.textContent.includes('No open bounties on the board yet')).parentElement;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div style="border-top:1px solid var(--color-line);padding:4.5rem 0 3.5rem;text-align:center">
      <p class="text-xl font-medium tracking-tight">No open bounties yet.</p>
      <p class="mt-2 text-soft" style="max-width:30rem;margin-left:auto;margin-right:auto">A bounty appears here a few minutes after someone posts one on a public GitHub repository.</p>
      <p style="margin-top:1.5rem;display:flex;gap:0.5rem 2rem;justify-content:center;flex-wrap:wrap"><a href="/how/" class="font-medium" style="text-decoration:none">Post one with your agent <span aria-hidden="true">›</span></a><a href="/me/" class="font-medium" style="text-decoration:none">List an issue you already have <span aria-hidden="true">›</span></a></p>
    </div>
    <div style="max-width:46rem;margin:0 auto">
      <p class="text-sm text-soft" style="padding-bottom:0.5rem">What one will look like</p>
      <ul><li class="border-t border-b border-line py-5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-8" style="opacity:.7">
        <div class="min-w-0">
          <p class="text-lg font-medium tracking-tight">Recurring transactions skip the 31st</p>
          <p class="mt-1 text-sm text-soft">example-org/ledger · TypeScript · 2 days old · 2 solutions waiting</p>
          <p class="text-sm text-soft">example-org: 4 merged · 4 paid, the owner's word · 3 received, the solvers' word.</p>
        </div>
        <p class="text-lg font-medium tabular-nums whitespace-nowrap text-right">$45</p>
      </li></ul>
      <p class="text-sm text-soft" style="padding-top:0.5rem">An example. Every name in it is invented.</p>
    </div>`;
  box.replaceWith(wrap);
};

// ---- the shots ----
const EMPTY = { open_total: 0, count: 0, page: 1, pages: 1, bounties: [], languages: [], repositories: [] };
const HERO = readFileSync(join(HERE, 'hero', 'hero.fragment.html'), 'utf8').split('<script>')[0] + '</div>';
const SHOTS = [
  { name: 'front', path: '/', patches: [frame, front] },
  { name: 'how', path: '/how/', patches: [frame, how] },
  { name: 'board-empty', path: '/board/', patches: [frame, emptyBoard], empty: true }
];

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
for (const shot of SHOTS) {
  for (const [label, size] of Object.entries(SIZES)) {
    for (const after of [false, true]) {
      const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      if (shot.empty) await page.route('**/api/board*', async route => {
        const real = await (await route.fetch()).json();
        await route.fulfill({ json: { ...real, ...EMPTY } });
      });
      await page.goto(`${BOARD}${shot.path}`, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: 'nav[aria-label="Site"] { position: static !important; }' });
      if (after) for (const patch of shot.patches) await page.evaluate(patch, { MARK, HERO });
      await page.evaluate(() => document.fonts.ready);
      const file = join(OUT, `${shot.name}-${label}-${after ? 'after' : 'before'}.jpg`);
      await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 82 });
      await context.close();
      console.log(`review: ${file}`);
    }
  }
}
await browser.close();
// The review page: the source with the picture's fragment put in.
writeFileSync(join(HERE, 'review.html'), readFileSync(join(HERE, 'review.src.html'), 'utf8').replace('<!--HERO-->', () => readFileSync(join(HERE, 'hero', 'hero.fragment.html'), 'utf8')));
