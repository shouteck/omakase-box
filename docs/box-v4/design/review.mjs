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

// 2. The front page (approved by the owner, 11 November 2026): the install line under the two buttons and a
// third way in. The picture stays as it is today.
const front = () => {
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
};

// The command's new name, everywhere a page prints it (owner, 11 November 2026). On the real site this comes
// from the tool itself when BT63 renames the command: the pages' commands are checked against the built tool.
const rename = () => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) if (node.nodeValue.includes('box bounty')) node.nodeValue = node.nodeValue.replaceAll('box bounty ', 'omakase-box ').replaceAll('box bounty', 'omakase-box');
};

// 3. How it works, fourth pass. Each half offers two ways, switched by a small two-part control beside its
// heading. The tool's way shows the one thing a person runs and then the agent's panel (the panel is only ever
// what an agent does). The other way is three or four short steps in one row: a number, an action, one line.
// Paying is not repeated here: the front page shows the three ways; this page keeps one line and a link.
const how = ({ mode }) => {
  const hand = document.querySelector('#hand-off'), answer = document.querySelector('#answer');
  const [handTitle, who, install, panel] = hand.children;
  const codeTpl = install.children[1].firstElementChild;
  const byHand = mode === 'hand';

  const code = (lines) => {
    const block = codeTpl.cloneNode(true), first = block.querySelector('code');
    first.removeAttribute('data-install'); first.textContent = lines[0]; first.style.display = 'block';
    let last = first;
    for (const line of lines.slice(1)) { const next = first.cloneNode(true); next.textContent = line; last.after(next); last = next; }
    return block;
  };
  // A heading with the switch at its right: [ With the tool | Without it ].
  const heading = (title, options, open) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem 2rem;margin-bottom:2.25rem';
    title.style.margin = '0';
    const control = document.createElement('div');
    control.setAttribute('role', 'tablist');
    control.style.cssText = 'display:inline-flex;background:var(--color-surface);border-radius:999px;padding:0.25rem';
    options.forEach((name, index) => {
      const on = index === open, tab = document.createElement('button');
      tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(on)); tab.textContent = name;
      tab.style.cssText = `border-radius:999px;padding:0.4rem 1.1rem;font-size:0.9375rem;white-space:nowrap;border:1px solid ${on ? 'var(--color-line)' : 'transparent'};background:${on ? 'var(--color-card)' : 'transparent'};color:${on ? 'var(--color-ink)' : 'var(--color-soft)'};font-weight:${on ? 500 : 400}`;
      control.append(tab);
    });
    row.append(title, control);
    return row;
  };
  // Short steps, side by side: a number, what to do, one line.
  const steps = (items) => {
    const ol = document.createElement('ol');
    ol.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:2rem;border-top:1px solid var(--color-line);padding-top:1.75rem;list-style:none;margin:0;padding-left:0`;
    items.forEach(([name, words], index) => {
      const li = document.createElement('li');
      li.innerHTML = `<p class="text-sm text-soft tabular-nums">${index + 1}</p><p class="font-medium" style="margin-top:0.35rem">${name}</p><p class="text-sm text-soft" style="margin-top:0.25rem">${words}</p>`;
      ol.append(li);
    });
    return ol;
  };

  // ---- Hand off work ----
  const listing = steps([
    ['Open Your page', 'Sign in with GitHub, then choose <a href="/me/">List an issue</a>.'],
    ['Give it the issue and a reward', 'Paste the link to your GitHub issue and type the amount in dollars.'],
    ['Merge on GitHub as usual', 'Solvers send pull requests that fix the issue. You pick one to pay.']
  ]);
  const owed = document.createElement('p'); owed.className = 'text-sm text-soft'; owed.style.marginTop = '2rem';
  owed.innerHTML = 'When a solution is merged, you pay the solver directly: by hand, with one click, or on merge. <a href="/#flow">The three ways</a>';
  hand.replaceChildren(heading(handTitle, ['With the tool', 'Without it'], byHand ? 1 : 0), ...(byHand ? [listing] : [who, install, panel]), owed);

  // ---- Answer bounties ----
  const answerTitle = answer.children[0];
  const setUpTitle = who.cloneNode(true); setUpTitle.textContent = 'You set it up';
  const setUp = install.cloneNode(true);
  setUp.querySelector('p').textContent = 'Install the tool, allow solving, and connect a way to be paid on Your page.';
  setUp.children[1].replaceChildren(code(['npx -y omakase-box setup', 'box bounty config set solving allowed']));
  const agent = panel.cloneNode(true);
  agent.querySelector('h3').nextElementSibling.textContent = 'It finds work that fits, does it in the open, and follows it until you are paid.';
  const cards = agent.querySelector('ol'), card = cards.children[0];
  cards.replaceChildren(...[['Finds a bounty', 'New ones since its last look, by language and reward.'], ['Starts in the open', 'A throwaway copy and a draft pull request others can see.'], ['Marks it ready', 'When the work is done.'], ['Follows it to paid', 'Merged, paid, and whether the money arrived.']]
    .map(([name, words]) => { const c = card.cloneNode(true); c.children[0].textContent = name; c.children[1].textContent = words; return c; }));
  const manual = steps([
    ['Pick a bounty', 'On <a href="/board/">the board</a>. Its page has the task and the reward.'],
    ['Fork and branch', 'Fork the repository. Start from the branch named on the bounty’s page.'],
    ['Open a pull request', 'Into that same branch, on the owner’s repository.'],
    ['Get paid', 'Connect a way on <a href="/me/">Your page</a>. The owner pays you when it is merged.']
  ]);
  answer.replaceChildren(heading(answerTitle, ['With the tool', 'By hand'], byHand ? 1 : 0), ...(byHand ? [manual] : [setUpTitle, setUp, agent]));
  answer.style.marginTop = '5rem';
};

// 4. The empty board (agreed by the owner, 11 November 2026): one centred message with the two ways in as the
// site's own blue links, and one quiet sample row.
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
          <p class="text-sm text-soft">example-org: 4 merged · 4 paid, the owner’s word · 3 received, the solvers’ word.</p>
        </div>
        <p class="text-lg font-medium tabular-nums whitespace-nowrap text-right">$45</p>
      </li></ul>
      <p class="text-sm text-soft" style="padding-top:0.5rem">An example. Every name in it is invented.</p>
    </div>`;
  box.replaceWith(wrap);
};

// ---- the shots ----
const EMPTY = { open_total: 0, count: 0, page: 1, pages: 1, bounties: [], languages: [], repositories: [] };
const SHOTS = [
  { name: 'front', path: '/', patches: [frame, front, rename] },
  { name: 'how-tool', path: '/how/', patches: [frame, how, rename], give: { mode: 'tool' } },
  { name: 'how-hand', path: '/how/', patches: [frame, how, rename], give: { mode: 'hand' } },
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
      if (after) for (const patch of shot.patches) await page.evaluate(patch, { MARK, ...(shot.give ?? {}) });
      await page.evaluate(() => document.fonts.ready);
      const file = join(OUT, `${shot.name}-${label}-${after ? 'after' : 'before'}.jpg`);
      await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 82 });
      await context.close();
      console.log(`review: ${file}`);
    }
  }
}
await browser.close();
writeFileSync(join(HERE, 'review.html'), readFileSync(join(HERE, 'review.src.html'), 'utf8'));
