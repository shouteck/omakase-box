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

// What the tool tells the board (PF5), said wherever the setting is shown.
export const BOARD_SENDS = 'after a post, a merge, a close or a paid record the tool sends it the repository, issue number, bounty id and event name, and nothing else; the board then reads GitHub';

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
  'not worth it when: you can plainly do the work, or a solver could not do',
  'it either (it needs a machine, access or data you cannot share) — a bounty',
  'has a cost and an answer takes time.',
  '',
  'using it is always your call — create a draft any time; posting needs the',
  'owner to have allowed the tool once — a post that finds none waits and',
  'prints the few lines to put to them. box bounty help shows the journey.'
];

// What `box bounty` says while a repository is not set up, so that installing is
// all a person has to do (PF15). It leaves as soon as the owner's answer is written.
// The three questions are the owner's; everything else here is the agent's.
export const SETUP_LINES: readonly string[] = [
  'not set up for this repository yet. To the agent reading this, in the project you work in:',
  '  1. run gh auth status; if it is not signed in, the owner runs gh auth login, which you cannot finish alone.',
  '  2. ask the owner: may bounties from this repository go public under your GitHub account, with a solution I choose merged into your code? What reward does each state, a promise you pay, and at most how much promised at once, in whole dollars? Should I ask you before each post and each merge?',
  '  3. run box bounty allow <owner>/<repository> --reward <reward> --reward-limit <limit>, adding --ask if they want to be asked; then box bounty config set instructions true, which adds one marked block to this project\'s instruction files so later sessions know the tool, and says so if there are none. Tell them what it did.',
  'the answers are the owner\'s to give, unless they leave them to you. With no answer nothing is promised and nothing is posted.',
  'a person reading this: tell your agent to run box bounty.'
];

// The pre-publish scan's limits, one line wherever a scan result is shown
// before posting (BT45): `create` and `post --preview`.
export const RESUME_STAYED = 'Any --resume note stayed on the machine that posted it.';
export const SCAN_LIMIT_LINE = 'the scan reads text for the shapes listed in BOUNTY.md; binary files, base64, split lines and names that do not look like secrets are not covered.';

// What stands in for a field the scan flagged, so the value is never printed.
export const WITHHELD = '(withheld — the scan flagged it; see the hit above)';

// The money side of `describe`, generated from the owner's setting (BT11a) —
// the amount is never hard-coded, so the text cannot outlive what is set.
export const describeRewardLine = (amount: number): string => amount === 0
  ? 'Every bounty states a reward of $0 — nothing promised.'
  : `Every bounty states a reward of $${amount} — a promise in the owner's name; posting an answer does not guarantee it. There are three ways to pay it: by hand, one click and on merge (box bounty help).`;

// The name the published package answers to — provisional until the owner's
// Part-B decision picks it for real (BT12). The artifact manifest carries
// the same name; the packaging test pins them equal. The notice does not
// name it until the owner publishes it (see RULES_LINES).
export const INSTALL_PACKAGE = 'omakase-box';

export const RULES_LINES: readonly string[] = [
  'box bounty can hand a task you cannot or should not do to an outside solver',
  'and bring solutions back as facts. Posting is free apart from any reward the owner set, and goes only to this',
  'repository\'s own public GitHub, as an issue; the owner\'s standing permission',
  'applies (`box bounty config` shows it). `box bounty describe` says when it',
  'is worth it. Using it is your call. Install: npm i -g omakase-box'
  // No install line yet (BT12 correction): `npx <name> bounty help` returns
  // here when the owner publishes the package name (Part B). An unpublished
  // name in an instruction an agent executes can be claimed by anyone first,
  // and every notice would then run a stranger's code.
];

// The marker convention for the block an owner pastes into a rules file. The
// tool owns everything between the markers: on every record mutation the whole
// interior is rewritten with the fixed lines for the current activity —
// while every byte outside the markers is left alone.
export const RULES_MARKERS = { open: '<!-- box-bounty -->', close: '<!-- /box-bounty -->' } as const;

export const rulesBlockInterior = (state: 'idle' | 'open' | 'new'): readonly string[] => [...RULES_LINES, ...(state === 'idle' ? [] : [state === 'new' ? 'a bounty has a new solution; `box bounty` shows more.' : 'a bounty is open; `box bounty` shows more.'])];

export const renderRulesBlock = (state: 'idle' | 'open' | 'new'): string =>
  [RULES_MARKERS.open, ...rulesBlockInterior(state), RULES_MARKERS.close].join('\n');
