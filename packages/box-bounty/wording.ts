// The agent-facing wording of the bounty tool: the description `describe`
// prints and the rules block an owner pastes into a project's rules file.
// This file IS the product of wave BT4 —
// "wording is product": published work found wording alone changes a tool's
// use tenfold, and that more detail is not better, so every string below is
// short on purpose.
//
// The rejected candidates and the scenario pack that tests them live in
// kitchen/scenarios/bt4.md. If the comparative runs overturn the pick, the
// fix is to swap the constants below — nothing else carries this wording.

// --- Candidate A (picked — the comparative runs stood it): what / worth it / not worth it ---
// States all three things an agent needs to choose — what the tool does, when
// it is worth using and when it is not — without commanding a choice. See the
// pack for candidates B (minimal pointer) and C (trigger list).

export const DESCRIBE_LINES: readonly string[] = [
  'box bounty hands a piece of work to an outside solver: the task and what you',
  'tried — on GitHub an issue on the repository\'s real history, in a folder a',
  'snapshot minus never-ship files — the project keeps the record; solutions',
  'come back as facts you judge, and nothing a solver wrote is ever run.',
  'GitHub posting is public and free, only to this project\'s already-public',
  'repository — the preview says exactly what becomes public that was not.',
  'Nobody is known to be watching these issues yet. A local folder is still',
  'available. Every bounty states a reward of $0 — no payment exists.',
  '',
  'worth it when: attempts keep failing, the task needs access or knowledge you',
  'lack, it is cheaper or faster solved elsewhere, or a second opinion counts.',
  'not worth it when: you can plainly do the work — a bounty has a cost and an',
  'answer takes time.',
  '',
  'using it is always your call — create a draft any time; the owner\'s yes',
  '(box bounty confirm) gates posting. box bounty help shows the whole journey.'
];

export const RULES_LINES: readonly string[] = [
  'box bounty can hand a task to an outside solver and bring solutions back',
  'as facts — `box bounty describe` says what it does, what it costs and when it',
  'beats doing the work yourself. Using it is always your call; the owner\'s',
  'limits apply.'
];

// The marker convention for the block an owner pastes into a rules file. The
// tool owns everything between the markers: on every record mutation the whole
// interior is rewritten — the rules lines plus the current open-bounties line —
// while every byte outside the markers is left alone.
export const RULES_MARKERS = { open: '<!-- box-bounty -->', close: '<!-- /box-bounty -->' } as const;

export const rulesBlockInterior = (openBountiesLine: string): readonly string[] => [...RULES_LINES, openBountiesLine];

export const renderRulesBlock = (openBountiesLine: string): string =>
  [RULES_MARKERS.open, ...rulesBlockInterior(openBountiesLine), RULES_MARKERS.close].join('\n');
