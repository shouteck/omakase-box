// Sample world for the K43 prototype. Every name is invented: logins and
// repositories all start with "example-". Each field is tagged with where the
// real board would read it (see docs/box-v4/PLATFORM-UX.md, "What the board
// can know"): block = the issue's box-bounty-format block; github = GitHub's
// public API; memory = the shared-memory chain refs/box-bounty/<id>;
// board = the board's own records (sign-in, profile, a click).

export const SAMPLE_NOW = '2026-10-21T09:00:00Z';
export const BOARD_READ_AT = '2026-10-21T08:45:00Z';

// Only what an anonymous visitor may see: the private repository and the
// values of owner-only payment methods are in restricted.mjs, which no page
// imports (M3, K43 correction round 1).

// github: public repository facts. Push access is not here: the board cannot
// read it for another account with a no-scope token. Self-dealing is read
// from each merged pull request's `association` instead (lib/facts.mjs).
export const repositories = {
  'example-tidepool/ledger-lite': { language: 'TypeScript', visibility: 'public', defaultBranch: 'main' },
  'example-tidepool/tide-cli': { language: 'Go', visibility: 'public', defaultBranch: 'main' },
  'example-orrin/lumen-forms': { language: 'TypeScript', visibility: 'public', defaultBranch: 'main' },
  'example-wren/sparrow-kit': { language: 'TypeScript', visibility: 'public', defaultBranch: 'main' },
  'example-juno/tallow': { language: 'Python', visibility: 'public', defaultBranch: 'main' },
  'example-juno/riverbed': { language: 'Rust', visibility: 'public', defaultBranch: 'main' },
  'example-kestrel/pikeworks': { language: 'TypeScript', visibility: 'public', defaultBranch: 'main' },
};

// board: what each person chose to publish when signed in. `methods` are the
// ones shown to everyone; `ownerOnly` counts those marked "Only an owner who
// owes me" (their values: restricted.mjs). `since` is the GitHub account's
// creation year (github, public profile).
export const people = {
  'example-mara': { since: 2017, methods: [] },
  'example-orrin': { since: 2024, methods: [] },
  'example-wren': { since: 2019, methods: [] },
  'example-juno': { since: 2021, methods: [] },
  'example-pike': { since: 2025, methods: [] },
  'example-quill': {
    since: 2019,
    methods: [
      { kind: 'paypal', value: 'https://paypal.me/example-quill', visibility: 'everyone' },
      { kind: 'sponsors', value: 'https://github.com/sponsors/example-quill', visibility: 'everyone' },
    ],
    ownerOnly: 1,
  },
  'example-sol': { since: 2020, methods: [{ kind: 'stripe', value: 'https://buy.stripe.com/example-sol', visibility: 'everyone' }] },
  'example-rook': { since: 2022, methods: [], ownerOnly: 1 },
  'example-fern': { since: 2026, methods: [] },
  // The sample's self-dealing case: a second account of example-pike's, a collaborator on the repository.
  'example-pike-alt': { since: 2026, sampleNote: 'Sample self-dealing case: GitHub lists this account as a COLLABORATOR on example-kestrel/pikeworks, where example-pike posts, so its merged solution and payment are not counted in either record. The board cannot know two accounts are one person; it can read how GitHub associates the merged pull request\'s author with the repository.', methods: [{ kind: 'paypal', value: 'https://paypal.me/example-pike-alt', visibility: 'everyone' }] },
};

const c = n => (n.repeat(40)).slice(0, 40); // invented 40-hex commit

// One entry per bounty. issue/title/task/poster/issueState: github.
// id/repository/createdAt/reward/workCommit/payment: block.
// approvedBy: memory (posted.allowedBy). solutions: github (pull requests on
// box-bounty/<id>, state=all) with headOnDefault from the compare API and
// association = the pull request's public `author_association`, kept as first
// read after the merge. paid: memory `paid` events (source "memory") or the
// owner's click (source "board"); `to` names the payee when more than one
// pull request was merged. receipt: the payee's click on the board.
export const bounties = [
  {
    id: 'bt-1f04c2a9e7b3', repository: 'example-orrin/lumen-forms', issue: 12, poster: 'example-orrin',
    title: 'Date field loses the time zone when a form is restored from a draft',
    task: 'When a saved draft is restored, every <DateField> value comes back in UTC instead of the zone it was typed in.\n\nWanted: restoring a draft keeps the original zone. Done means the new test in tests/draft-restore.test.ts passes and the existing suite still passes.\n\nWhat I tried: storing the offset next to the value (breaks the schema version check), and Intl.DateTimeFormat().resolvedOptions() at restore time (wrong when the draft was made elsewhere).',
    createdAt: '2026-10-17T14:05:00Z', reward: 60, workCommit: c('1f04c2a9'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'open',
    solutions: [], paid: [], receipt: [],
  },
  {
    id: 'bt-2b8d7e01c6a5', repository: 'example-tidepool/ledger-lite', issue: 41, poster: 'example-mara',
    title: 'CSV import rejects files with a byte-order mark',
    task: 'Importing a CSV saved by a common spreadsheet app fails with "unexpected column: \\uFEFFdate". The first header carries a UTF-8 byte-order mark.\n\nWanted: import accepts files with or without the mark; nothing else about parsing changes. Done means `npm test -- csv` passes, including the two fixture files in tests/fixtures/bom/.\n\nWhat I tried: stripping the mark in the reader, which broke streaming imports over 64 KB.',
    createdAt: '2026-10-12T09:30:00Z', reward: 40, workCommit: c('2b8d7e01'), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'open',
    solutions: [
      { pr: 44, author: 'example-rook', openedAt: '2026-10-14T11:00:00Z', state: 'open' },
      { pr: 46, author: 'example-fern', openedAt: '2026-10-19T16:20:00Z', state: 'open' },
    ],
    paid: [], receipt: [],
  },
  {
    id: 'bt-3a91c0e2d4f1', repository: 'example-tidepool/ledger-lite', issue: 30, poster: 'example-mara',
    title: 'Monthly totals double-count transfers between two own accounts',
    task: 'A transfer from checking to savings shows up as both spending and income in the monthly totals.\n\nWanted: transfers between two accounts of the same person are excluded from totals. Done means tests/totals.test.ts passes, including the new transfer cases.',
    createdAt: '2026-10-02T10:00:00Z', reward: 50, workCommit: c('3a91c0e2'), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'closed', closedAt: '2026-10-15T08:10:00Z',
    solutions: [
      { pr: 31, author: 'example-quill', openedAt: '2026-10-08T13:00:00Z', state: 'merged', mergedAt: '2026-10-15T08:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' },
      { pr: 33, author: 'example-sol', openedAt: '2026-10-10T09:00:00Z', state: 'closed' },
    ],
    paid: [], receipt: [],
  },
  {
    id: 'bt-4c6e19b0a2d8', repository: 'example-tidepool/ledger-lite', issue: 26, poster: 'example-mara',
    title: 'Export to OFX writes amounts with a comma in some locales',
    task: 'With the app language set to German, OFX exports write 12,50 instead of 12.50 and banks reject the file.\n\nWanted: OFX amounts always use a dot. Done means tests/ofx.test.ts passes under LANG=de_DE.',
    createdAt: '2026-09-29T08:00:00Z', reward: 35, workCommit: c('4c6e19b0'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'closed', closedAt: '2026-10-10T12:05:00Z',
    solutions: [{ pr: 27, author: 'example-quill', openedAt: '2026-10-03T15:00:00Z', state: 'merged', mergedAt: '2026-10-10T12:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' }],
    paid: [{ at: '2026-10-18T19:30:00Z', amount: 35, source: 'memory' }], receipt: [],
  },
  {
    id: 'bt-5d2a8f6c1e09', repository: 'example-tidepool/tide-cli', issue: 9, poster: 'example-mara',
    title: 'Windows: tide sync fails on paths longer than 260 characters',
    task: 'tide sync aborts with ENAMETOOLONG on Windows for deep folders.\n\nWanted: long paths sync on Windows. Done means the long-path case in sync_test.go passes on a Windows runner.\n\nWhat I tried: nothing; I have no Windows machine.',
    createdAt: '2026-09-08T07:00:00Z', reward: 60, workCommit: c('5d2a8f6c'), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'closed', closedAt: '2026-09-20T10:05:00Z',
    solutions: [{ pr: 10, author: 'example-sol', openedAt: '2026-09-15T10:00:00Z', state: 'merged', mergedAt: '2026-09-20T10:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' }],
    paid: [{ at: '2026-09-22T09:00:00Z', amount: 60, source: 'board' }],
    receipt: [{ at: '2026-09-23T07:40:00Z', by: 'example-sol', kind: 'received' }],
  },
  {
    id: 'bt-6e7f3b2d9a14', repository: 'example-juno/tallow', issue: 18, poster: 'example-juno',
    title: 'Speed up the nightly report query',
    task: 'The nightly report takes 40 minutes. Wanted: under 5 minutes on the sample database in bench/.',
    createdAt: '2026-09-01T12:00:00Z', reward: 25, workCommit: c('6e7f3b2d'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'closed', closedAt: '2026-10-05T09:00:00Z', closedKind: 'closed-none',
    solutions: [{ pr: 20, author: 'example-fern', openedAt: '2026-09-10T08:00:00Z', state: 'closed' }],
    paid: [], receipt: [],
  },
  {
    id: 'bt-7a0c5e8b3f21', repository: 'example-wren/sparrow-kit', issue: 7, poster: 'example-wren',
    title: 'Tooltip flickers when the pointer crosses its arrow',
    task: 'Moving the pointer over the tooltip arrow hides and shows the tooltip in a loop.\n\nWanted: no flicker. Done means the hover test in tests/tooltip.spec.ts passes.',
    createdAt: '2026-09-15T10:00:00Z', reward: 30, workCommit: c('7a0c5e8b'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'closed', closedAt: '2026-09-28T17:05:00Z',
    solutions: [
      { pr: 8, author: 'example-fern', openedAt: '2026-09-20T10:00:00Z', state: 'merged', mergedAt: '2026-09-28T17:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' },
      { pr: 9, author: 'example-rook', openedAt: '2026-09-21T10:00:00Z', state: 'merged', mergedAt: '2026-09-28T17:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' },
    ],
    paid: [], receipt: [],
  },
  {
    id: 'bt-8b4d1f7a6c30', repository: 'example-wren/sparrow-kit', issue: 5, poster: 'example-wren',
    title: 'Dialog traps focus after it closes',
    task: 'After closing a dialog with Escape, Tab never leaves the page header.\n\nWanted: focus returns to the element that opened the dialog. Done means tests/dialog.spec.ts passes.',
    createdAt: '2026-08-28T10:00:00Z', reward: 50, workCommit: c('8b4d1f7a'), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'closed', closedAt: '2026-09-10T11:05:00Z',
    solutions: [{ pr: 6, author: 'example-sol', openedAt: '2026-09-02T10:00:00Z', state: 'merged', mergedAt: '2026-09-10T11:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' }],
    paid: [{ at: '2026-09-12T08:00:00Z', amount: 50, source: 'memory' }],
    receipt: [{ at: '2026-10-01T09:00:00Z', by: 'example-sol', kind: 'not-received' }],
  },
  {
    id: 'bt-9c3e6a1d0b47', repository: 'example-juno/tallow', issue: 22, poster: 'example-juno',
    title: 'Document the config file format',
    task: 'There is no reference for tallow.toml. Wanted: docs/config.md listing every key, its type and default, generated or written by hand.',
    createdAt: '2026-10-19T15:00:00Z', reward: 0, workCommit: c('9c3e6a1d'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'open',
    solutions: [], paid: [], receipt: [],
  },
  {
    id: 'bt-a17f2c9e4d56', repository: 'example-juno/riverbed', issue: 3, poster: 'example-juno',
    title: 'Port the tokenizer from regex to a hand-written lexer',
    task: 'The regex tokenizer is the slowest part of a parse. Wanted: a hand-written lexer with the same output on every file in corpus/. Done means cargo test passes and bench/lex.rs is at least 3x faster.',
    createdAt: '2026-10-06T09:00:00Z', reward: 120, workCommit: c('a17f2c9e'), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'open',
    solutions: [
      { pr: 4, author: 'example-rook', openedAt: '2026-10-11T09:00:00Z', state: 'open' },
      { pr: 5, author: 'example-fern', openedAt: '2026-10-12T09:00:00Z', state: 'closed' },
    ],
    paid: [], receipt: [],
  },
  {
    id: 'bt-b2e8d4f0c639', repository: 'example-kestrel/pikeworks', issue: 2, poster: 'example-pike',
    title: 'Add a dark theme',
    task: 'Wanted: a dark theme following the system setting.',
    createdAt: '2026-09-25T09:00:00Z', reward: 100, workCommit: c('b2e8d4f0'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'closed', closedAt: '2026-09-26T09:05:00Z',
    solutions: [{ pr: 3, author: 'example-pike-alt', openedAt: '2026-09-25T18:00:00Z', state: 'merged', mergedAt: '2026-09-26T09:00:00Z', headOnDefault: true, association: 'COLLABORATOR' }],
    paid: [{ at: '2026-09-26T10:00:00Z', amount: 100, source: 'board' }],
    receipt: [{ at: '2026-09-26T10:05:00Z', by: 'example-pike-alt', kind: 'received' }],
  },
  {
    id: 'bt-c5a1b7e3f082', repository: 'example-wren/sparrow-kit', issue: 14, poster: 'example-wren',
    title: 'Menu keyboard navigation skips disabled items inconsistently',
    task: 'Arrow keys skip disabled items going down but stop on them going up.\n\nWanted: both directions skip disabled items. Done means tests/menu.spec.ts passes, including the new disabled-item cases.',
    createdAt: '2026-10-14T13:00:00Z', reward: 80, workCommit: c('c5a1b7e3'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'open',
    solutions: [{ pr: 15, author: 'example-sol', openedAt: '2026-10-18T10:00:00Z', state: 'open' }],
    paid: [], receipt: [],
  },
  {
    id: 'bt-d8f6a2c1e475', repository: 'example-tidepool/ledger-lite', issue: 19, poster: 'example-mara',
    title: 'Budget view crashes when a category has no transactions',
    task: 'Opening the budget view with an empty category throws "Cannot read properties of undefined (reading \'total\')".\n\nWanted: empty categories show 0. Done means tests/budget.test.ts passes.',
    createdAt: '2026-08-20T10:00:00Z', reward: 40, workCommit: c('d8f6a2c1'), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'closed', closedAt: '2026-08-30T10:05:00Z',
    solutions: [{ pr: 20, author: 'example-quill', openedAt: '2026-08-24T10:00:00Z', state: 'merged', mergedAt: '2026-08-30T10:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' }],
    paid: [{ at: '2026-09-01T10:00:00Z', amount: 40, source: 'memory' }],
    receipt: [{ at: '2026-09-02T08:00:00Z', by: 'example-quill', kind: 'received' }],
  },
  {
    id: 'bt-e3c9f5a7b1d2', repository: 'example-tidepool/ledger-lite', issue: 15, poster: 'example-mara',
    title: 'Search ignores accents in payee names',
    task: 'Searching "cafe" does not find "Café". Wanted: accent-insensitive search. Done means tests/search.test.ts passes.',
    createdAt: '2026-08-01T10:00:00Z', reward: 25, workCommit: c('e3c9f5a7'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'closed', closedAt: '2026-08-12T10:05:00Z',
    solutions: [{ pr: 16, author: 'example-rook', openedAt: '2026-08-05T10:00:00Z', state: 'merged', mergedAt: '2026-08-12T10:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' }],
    paid: [{ at: '2026-08-13T10:00:00Z', amount: 25, source: 'board' }],
    receipt: [{ at: '2026-08-15T10:00:00Z', by: 'example-rook', kind: 'received' }],
  },
  {
    id: 'bt-f0b2d8e6a913', repository: 'example-tidepool/tide-cli', issue: 4, poster: 'example-mara',
    title: 'Retry uploads on connection reset',
    task: 'An upload that hits a connection reset fails the whole sync. Wanted: retry that file up to three times with backoff. Done means sync_retry_test.go passes.',
    createdAt: '2026-07-10T10:00:00Z', reward: 80, workCommit: c('f0b2d8e6'), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'closed', closedAt: '2026-07-28T10:05:00Z',
    solutions: [{ pr: 5, author: 'example-quill', openedAt: '2026-07-20T10:00:00Z', state: 'merged', mergedAt: '2026-07-28T10:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' }],
    paid: [{ at: '2026-07-30T10:00:00Z', amount: 80, source: 'memory' }],
    receipt: [{ at: '2026-07-30T18:00:00Z', by: 'example-quill', kind: 'received' }],
  },
  {
    id: 'bt-0d7e4a3c8b65', repository: 'example-tidepool/ledger-lite', issue: 48, poster: 'example-mara',
    title: 'Recurring transactions skip the 31st in short months',
    task: 'A transaction set to repeat on the 31st never appears in months with 30 days or fewer.\n\nWanted: it falls on the last day of short months. Done means tests/recurring.test.ts passes, including the February cases.',
    createdAt: '2026-10-17T08:00:00Z', reward: 45, workCommit: c('0d7e4a3c'), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'open',
    solutions: [], paid: [], receipt: [],
  },
  {
    id: 'bt-1e9a6c4f2b78', repository: 'example-kestrel/pikeworks', issue: 6, poster: 'example-pike',
    title: 'Rewrite the settings page in the new component library',
    task: 'Wanted: settings page moved to the new components with no visual change. Done means the screenshot tests pass.',
    createdAt: '2026-10-18T09:00:00Z', reward: 150, workCommit: c('1e9a6c4f'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'open',
    solutions: [], paid: [], receipt: [],
  },
  {
    id: 'bt-2f0b7d5a3c89', repository: 'example-wren/sparrow-kit', issue: 3, poster: 'example-wren',
    title: 'Popover position is wrong inside scrolled containers',
    task: 'Popovers inside a scrolled container open at the unscrolled position.\n\nWanted: correct position. Done means tests/popover.spec.ts passes.',
    createdAt: '2026-08-25T10:00:00Z', reward: 40, workCommit: c('2f0b7d5a'), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'closed', closedAt: '2026-09-10T15:05:00Z',
    solutions: [{ pr: 4, author: 'example-quill', openedAt: '2026-09-01T10:00:00Z', state: 'merged', mergedAt: '2026-09-10T15:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' }],
    paid: [], receipt: [],
  },
  {
    id: 'bt-3a1c8e6b4d90', repository: 'example-wren/sparrow-kit', issue: 1, poster: 'example-wren',
    title: 'Button group loses its border radius on the last child',
    task: 'The last button in a group has square corners. Wanted: rounded like the first.',
    createdAt: '2026-08-10T10:00:00Z', reward: 20, workCommit: c('3a1c8e6b'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'closed', closedAt: '2026-08-20T10:05:00Z',
    solutions: [{ pr: 2, author: 'example-rook', openedAt: '2026-08-14T10:00:00Z', state: 'merged', mergedAt: '2026-08-20T10:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' }],
    paid: [{ at: '2026-08-25T10:00:00Z', amount: 20, source: 'memory' }],
    receipt: [{ at: '2026-08-26T10:00:00Z', by: 'example-rook', kind: 'received' }],
  },
  {
    id: 'bt-5c3e0a9f7d12', repository: 'example-juno/tallow', issue: 11, poster: 'example-juno',
    title: 'Add a --quiet flag to the report command',
    task: 'Wanted: tallow report --quiet prints nothing but errors. Done means tests/test_cli.py passes.',
    createdAt: '2026-08-15T10:00:00Z', reward: 0, workCommit: c('5c3e0a9f'), payment: null,
    approvedBy: 'owner-standing-rule', issueState: 'closed', closedAt: '2026-08-22T10:05:00Z',
    solutions: [{ pr: 12, author: 'example-sol', openedAt: '2026-08-18T10:00:00Z', state: 'merged', mergedAt: '2026-08-22T10:00:00Z', headOnDefault: true, association: 'CONTRIBUTOR' }],
    paid: [], receipt: [],
  },
];
