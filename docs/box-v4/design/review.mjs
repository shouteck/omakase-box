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
// 11 November 2026); and the picture replaced by a still drawing (picture.mjs), proposed.
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

// 3. How it works, third pass. Each half of the page offers two ways, chosen with two tabs (the same tab the
// signed-in page uses for a bounty's stages), so the ways sit side by side and are never stacked:
//   Hand off work:   With the tool (you install, your agent does the rest)  |  Without installing (list an issue)
//   Answer bounties: With the tool (you set up, your agent does the rest)   |  By hand (explicit steps, no jargon)
// The page's rule is kept: the boxed panel is only ever what an agent does. Paying follows the first half and
// is shown as the three cards the front page already has. `mode` picks which tabs are open in the picture.
const how = async ({ mode }) => {
  const hand = document.querySelector('#hand-off'), answer = document.querySelector('#answer');
  const [handTitle, who, install, panel] = hand.children;
  const list = answer.querySelector('ol');
  const stepTpl = list.children[0], codeTpl = install.children[1].firstElementChild;
  const byHand = mode === 'hand';

  const code = (lines) => {
    const block = codeTpl.cloneNode(true), first = block.querySelector('code');
    first.removeAttribute('data-install'); first.textContent = lines[0]; first.style.display = 'block';
    let last = first;
    for (const line of lines.slice(1)) { const next = first.cloneNode(true); next.textContent = line; last.after(next); last = next; }
    return block;
  };
  const steps = (items) => {
    const ol = list.cloneNode(false);
    items.forEach(([name, words, lines], index) => {
      const li = stepTpl.cloneNode(true);
      li.children[0].textContent = String(index + 1);
      const body = li.children[1]; body.querySelector('h4').textContent = name;
      body.querySelector('h4').nextElementSibling.innerHTML = `<p>${words}</p>`;
      body.style.maxWidth = '44rem';
      if (lines) { const block = code(lines); block.style.marginTop = '0.75rem'; body.append(block); }
      ol.append(li);
    });
    return ol;
  };
  const tabs = (items, open) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'tablist');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 1.5rem;margin:1.75rem 0 2.5rem';
    items.forEach(([name, words], index) => {
      const on = index === open, tab = document.createElement('button');
      tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(on));
      tab.style.cssText = `text-align:left;padding:0.9rem 0 0.25rem;border-top:${on ? '2px solid var(--color-ink)' : '1px solid var(--color-line);margin-top:1px'}`;
      tab.innerHTML = `<span class="text-lg font-medium tracking-tight" style="display:block;color:${on ? 'var(--color-ink)' : 'var(--color-soft)'}">${name}</span><span class="text-sm text-soft" style="display:block;margin-top:0.15rem">${words}</span>`;
      row.append(tab);
    });
    return row;
  };

  // ---- Hand off work ----
  const handTabs = tabs([['With the tool', 'You install it once. Your agent posts and merges.'], ['Without installing', 'Put a reward on an issue you already have.']], byHand ? 1 : 0);
  const listing = steps([
    ['Sign in with GitHub', 'On <a href="/me/">Your page</a>. Nothing is installed.'],
    ['Paste the issue’s address and set a reward', 'Any open issue on a public repository that you wrote, own or can write to. The reward is in whole US dollars.', ['https://github.com/owner/repository/issues/12']],
    ['Solvers answer on GitHub', 'They open pull requests whose description says “Fixes #12”. The board links each one to your bounty. You review and merge on GitHub, as always.'],
    ['You choose whom to pay', 'One is paid, from every pull request linked to the issue.']
  ]);
  hand.replaceChildren(handTitle, handTabs, ...(byHand ? [listing] : [who, install, panel]));

  // ---- Paying, after either way ----
  const paying = document.createElement('section');
  paying.style.marginTop = '5rem';
  const payTitle = handTitle.cloneNode(true); payTitle.removeAttribute('id'); payTitle.textContent = 'Then you pay the solver';
  const payWords = document.createElement('p'); payWords.className = 'mt-3 text-soft'; payWords.style.maxWidth = '40rem';
  payWords.textContent = 'When a solution is merged, the reward is owed. The board never holds money: it goes from you to the solver, one of three ways.';
  const frontPage = new DOMParser().parseFromString(await (await fetch('/')).text(), 'text/html');
  const ways = document.importNode([...frontPage.querySelectorAll('h3')].find(h => h.textContent.includes('three ways')).closest('div[class*="bg-surface"]').lastElementChild, true);
  ways.style.marginTop = '1.75rem';
  paying.append(payTitle, payWords, ways);
  hand.after(paying);

  // ---- Answer bounties ----
  const setUpTitle = who.cloneNode(true); setUpTitle.textContent = 'You set it up';
  const setUp = install.cloneNode(true);
  setUp.querySelector('p').textContent = 'The same tool. Allow solving once, and on your page connect a way to be paid. That is all you do.';
  setUp.children[1].replaceChildren(code(['npx -y omakase-box setup', 'box bounty config set solving allowed']));
  const agent = panel.cloneNode(true);
  agent.querySelector('h3').nextElementSibling.textContent = 'It finds work that fits, does it in the open, and follows it until you are paid.';
  const cards = agent.querySelector('ol'), card = cards.children[0];
  cards.replaceChildren(...[['Finds a bounty', 'New ones since its last look, by language and reward.'], ['Starts in the open', 'A throwaway copy and a draft pull request others can see.'], ['Marks it ready', 'When the work is done, for the owner’s agent to read.'], ['Follows it to paid', 'Merged, paid, and whether the money arrived.']]
    .map(([name, words]) => { const c = card.cloneNode(true); c.children[0].textContent = name; c.children[1].textContent = words; return c; }));
  const manual = steps([
    ['Pick a bounty on the board', 'Open its page. It shows the task, the reward, how the owner pays, and the exact steps for that bounty.'],
    ['Fork the repository and start from the bounty’s branch', 'Fork it on GitHub, then copy your fork and switch to the branch the bounty was posted on. Its name is on the bounty’s page and starts with “box-bounty/”.', ['git clone https://github.com/you/repository', 'cd repository', 'git fetch https://github.com/owner/repository refs/heads/box-bounty/bt-4f2a91c07d3e', 'git checkout -b my-answer FETCH_HEAD']],
    ['Do the work and open a pull request', 'Push your branch to your fork. On GitHub, open a pull request into the owner’s repository and choose the bounty’s branch as the base, not main.', ['git push origin my-answer']],
    ['Get merged, get paid, confirm', 'Sign in on <a href="/me/">Your page</a> and connect a way to be paid. When the owner pays, say on the bounty’s page whether it arrived.']
  ]);
  const note = document.createElement('p'); note.className = 'text-sm text-soft'; note.style.cssText = 'margin-top:1.5rem;max-width:44rem';
  note.textContent = 'A bounty listed from an existing issue is simpler: open your pull request against the repository’s usual branch and write “Fixes #12” in its description. The bounty’s page says which kind it is.';
  const answerTabs = tabs([['With the tool', 'You set it up once. Your agent finds, solves and follows up.'], ['By hand', 'Your own tools and a GitHub account. Nothing to install.']], byHand ? 1 : 0);
  answer.replaceChildren(answer.children[0], answerTabs, ...(byHand ? [manual, note] : [setUpTitle, setUp, agent]));
};

// 4. The empty board, third pass: one message, the two ways in as two small cards, one quiet sample row.
const emptyBoard = () => {
  const box = [...document.querySelectorAll('p')].find(p => p.textContent.includes('No open bounties on the board yet')).parentElement;
  const way = (href, name, words) => `<a href="${href}" class="bg-card border border-line rounded-2xl" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.25rem;text-decoration:none;color:var(--color-ink);text-align:left"><span><span class="font-medium" style="display:block">${name}</span><span class="text-sm text-soft" style="display:block">${words}</span></span><span aria-hidden="true" style="display:grid;place-items:center;width:2rem;height:2rem;border-radius:999px;background:var(--color-button);color:var(--color-button-ink);flex:none">›</span></a>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div style="border-top:1px solid var(--color-line);padding:4.5rem 0 3.5rem;text-align:center">
      <p class="text-xl font-medium tracking-tight">No open bounties yet.</p>
      <p class="mt-2 text-soft" style="max-width:30rem;margin-left:auto;margin-right:auto">A bounty appears here a few minutes after someone posts one on a public GitHub repository.</p>
      <div style="margin:2rem auto 0;max-width:46rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:0.75rem">
        ${way('/how/', 'Post one with your agent', 'Install the tool once. It hands off on its own.')}
        ${way('/me/', 'List an issue you already have', 'Put a reward on it. Nothing to install.')}
      </div>
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
const PICTURES = { a: readFileSync(join(HERE, 'picture-a.html'), 'utf8'), b: readFileSync(join(HERE, 'picture-b.html'), 'utf8') };
const SHOTS = [
  { name: 'front-a', path: '/', patches: [frame, front], give: { HERO: PICTURES.a } },
  { name: 'front-b', path: '/', patches: [frame, front], give: { HERO: PICTURES.b } },
  { name: 'how-tool', path: '/how/', patches: [frame, how], give: { mode: 'tool' } },
  { name: 'how-hand', path: '/how/', patches: [frame, how], give: { mode: 'hand' } },
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
// The review page: the source with the two pictures put in.
writeFileSync(join(HERE, 'review.html'), readFileSync(join(HERE, 'review.src.html'), 'utf8').replace('<!--PICTURE-A-->', () => PICTURES.a).replace('<!--PICTURE-B-->', () => PICTURES.b));
