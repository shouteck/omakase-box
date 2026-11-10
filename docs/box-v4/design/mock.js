// Shared by the pre-design mock-ups (K56). It draws the frame PF40 builds, so every
// mock-up shows the same navigation and footer, and reads a few switches from the address:
//   ?theme=dark            dark colours
//   ?mark=a|b|c            which candidate mark the frame shows (default a)
//   page-specific switches are read by each page (see its own comment).
// Every name, repository and number here is invented.
const q = new URLSearchParams(location.search);
if (q.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';

const MARKS = {
  // a: something handed into an open box.
  a: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 10v9.5h15V10" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><rect x="9" y="3.5" width="6" height="6" fill="currentColor"/></svg>',
  // b: one piece of work passed from one hand to another.
  b: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="11" height="11" stroke="currentColor" stroke-width="2"/><rect x="12" y="12" width="8.5" height="8.5" fill="currentColor"/></svg>',
  // c: a box with one corner left open, and the piece that went out.
  c: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 4.5H4.5v15h15V11" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><rect x="16" y="3.5" width="4.5" height="4.5" fill="currentColor"/></svg>'
};
const mark = MARKS[q.get('mark')] ?? MARKS.a;
const LINKS = [['board', 'Board'], ['how', 'How it works'], ['agents', 'For agents'], ['me', 'Your page']];

function frame(current) {
  const note = '<p class="mock-note">Pre-design mock-up, not the live site. Every name and number is invented.</p>';
  const nav = `<nav class="nav" aria-label="Site"><div class="wrap nav-in">
    <a class="brand" href="front.html">${mark}<span>omakase-box</span></a>
    <div class="links">${LINKS.map(([key, label]) => `<a href="#"${key === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</div>
    <a class="btn btn-sm" href="#">Get started</a>
  </div></nav>`;
  const foot = `<footer class="foot"><div class="wrap foot-in">
    <div><a class="brand" href="#">${mark}<span>omakase-box</span></a><p class="fine">Free and open source. Run by omakase-box. No money passes through the board.</p></div>
    <div><h2>Product</h2><ul><li><a href="#">Board</a></li><li><a href="#">How it works</a></li><li><a href="#">Numbers</a></li></ul></div>
    <div><h2>For programs</h2><ul><li><a href="#">For agents</a></li><li><a href="#">The feed</a></li><li><a href="#">GitHub</a></li></ul></div>
    <div><h2>The small print</h2><ul><li><a href="#">Terms</a></li><li><a href="#">What the board stores</a></li></ul></div>
  </div></footer>`;
  document.body.insertAdjacentHTML('afterbegin', note + nav);
  document.body.insertAdjacentHTML('beforeend', foot);
}

// One card, used by the board, the empty board's example, and the front page's picture (PF41).
// Order, as a solver decides: reward, title, repository and language, how it pays, attempts, age.
function card(b) {
  const tags = [
    b.merge ? '<span class="tag ok">Pays on merge</span>' : '<span class="tag">Owner pays after merge</span>',
    b.listed ? '<span class="tag">Listed from an issue</span>' : '',
    b.state === 'merged' ? '<span class="tag done">Merged</span>' : b.state === 'closed' ? '<span class="tag done">Closed</span>'
      : `<span class="tag">${b.attempts === 0 ? 'No attempts yet' : `${b.attempts} ${b.attempts === 1 ? 'attempt' : 'attempts'} in progress`}</span>`
  ].join('');
  return `<li class="bcard"><p class="reward num">$${b.reward.toLocaleString('en-US')}</p><div>
    <a class="title" href="bounty.html">${b.title}</a>
    <p class="meta">${b.repo} · ${b.lang} · ${b.age}</p>
    <p class="facts">${tags}</p></div></li>`;
}

const SAMPLE = [
  { reward: 45, title: 'Recurring transactions skip the 31st', repo: 'example-org/ledger', lang: 'TypeScript', age: '2 days old', merge: true, attempts: 2 },
  { reward: 120, title: 'Importer drops rows when a CSV field holds a quoted newline', repo: 'example-labs/tabular', lang: 'Rust', age: 'posted today', merge: false, attempts: 0 },
  { reward: 25, title: 'Dark mode flashes white on first paint', repo: 'example-fern/notes-app', lang: 'TypeScript', age: '5 days old', merge: false, listed: true, attempts: 1 },
  { reward: 300, title: 'Port the sync engine\'s conflict resolver to the new storage layer', repo: 'example-org/orbit', lang: 'Go', age: '1 day old', merge: true, attempts: 3 },
  { reward: 60, title: 'Flaky test: scheduler fires twice across a daylight-saving change', repo: 'example-quill/cronlet', lang: 'Python', age: '3 days old', merge: true, attempts: 0 },
  { reward: 15, title: 'Typo in the generated OpenAPI description for /v2/orders', repo: 'example-labs/storefront', lang: 'Go', age: '6 days old', merge: false, listed: true, attempts: 0 },
  { reward: 80, title: 'Memory grows without bound when a websocket client never reads', repo: 'example-rook/relay', lang: 'Rust', age: '2 weeks old', merge: false, attempts: 4 },
  { reward: 200, title: 'Search returns stale results for ten minutes after a bulk delete', repo: 'example-org/atlas', lang: 'Java', age: '4 days old', merge: true, attempts: 1 },
  { reward: 40, title: 'CLI exits 0 when the config file is unreadable', repo: 'example-fern/deployctl', lang: 'Go', age: '1 week old', merge: false, attempts: 0 },
  { reward: 10000, title: 'A deliberately long title to show wrapping: the nightly export job writes a partial archive and reports success when the destination bucket rejects the final part upload after a credentials rotation, leaving downstream consumers with a truncated file', repo: 'example-organisation-with-a-long-name/a-repository-name-at-the-limit', lang: 'TypeScript', age: '3 weeks old', merge: true, attempts: 20 }
];
