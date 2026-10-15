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
  'tried, in a GitHub issue on the repository\'s real history. The project',
  'keeps the record; solutions',
  'come back as facts you judge, and nothing a solver wrote is ever run.',
  'GitHub posting is public and free, only to this project\'s already-public',
  'repository — the preview says exactly what becomes public that was not.',
  'Nobody is known to be watching these issues yet.',
  '',
  'worth it when: attempts keep failing, the task needs access or knowledge you',
  'lack, it is cheaper or faster solved elsewhere, or a second opinion counts.',
  'not worth it when: you can plainly do the work — a bounty has a cost and an',
  'answer takes time.',
  '',
  'using it is always your call — create a draft any time; posting needs the',
  'owner to have allowed the tool once — a post that finds none waits and',
  'prints the few lines to put to them. box bounty help shows the journey.'
];

// The money side of `describe`, generated from the owner's setting (BT11a) —
// the amount is never hard-coded, so the text cannot outlive what is set.
export const describeRewardLine = (amount: number): string => amount === 0
  ? 'Every bounty states a reward of $0 — no payment exists.'
  : `Every bounty states a reward of $${amount} — a promise in the owner's name, paid by hand; posting an answer does not guarantee it.`;

export const RULES_LINES: readonly string[] = [
  'box bounty can hand a task to an outside solver and bring solutions back',
  'as facts — `box bounty describe` says what it does, what it costs and when it',
  'beats doing the work yourself. Using it is always your call; the owner\'s',
  'permission applies.'
];

// The marker convention for the block an owner pastes into a rules file. The
// tool owns everything between the markers: on every record mutation the whole
// interior is rewritten with the fixed lines for the current activity —
// while every byte outside the markers is left alone.
export const RULES_MARKERS = { open: '<!-- box-bounty -->', close: '<!-- /box-bounty -->' } as const;

export const rulesBlockInterior = (state: 'idle' | 'open' | 'new'): readonly string[] => [...RULES_LINES, ...(state === 'idle' ? [] : [state === 'new' ? 'a bounty has a new solution; `box bounty` shows more.' : 'a bounty is open; `box bounty` shows more.'])];

export const renderRulesBlock = (state: 'idle' | 'open' | 'new'): string =>
  [RULES_MARKERS.open, ...rulesBlockInterior(state), RULES_MARKERS.close].join('\n');
