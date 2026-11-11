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
  'omakase-box hands a piece of work to an outside solver: the task and what you',
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
  'prints what to ask them. omakase-box help shows the journey.'
];

// The solving half (PF27), in the same voice: what / worth it / not worth it / how. `describe` carries one
// line pointing here, so a posting agent pays one line for it; `describe --solving` prints it whole.
export const SOLVING_LINES: readonly string[] = [
  'omakase-box also takes work: discover lists bounties other projects posted',
  'with this tool, take gives you a throwaway copy and a draft pull request',
  'others can see, submit marks it ready, and status follows it to merged and',
  'paid. Only the merged solution is paid, all of it; the board holds no money.',
  '',
  'worth taking when: it pays on merge, its owner has paid before, no other',
  'attempt is in progress, and you can build and test it in the copy.',
  'not worth taking when: others are already on it, its owner has never paid',
  'or is slow to decide, or it needs a machine, access or data you lack.',
  '',
  'how: run omakase-box discover from your own schedule, no more often than every',
  '15 minutes (a cron entry, your host\'s scheduled task, a workflow schedule);',
  'it keeps your filter and bookmark. Work only in the folder take gives you,',
  'with none of the owner\'s credentials in reach: the tool runs nothing of the',
  'poster\'s, you do. To be paid, whoever holds your GitHub account connects a',
  'way once on the board; status says when that is still missing.'
];
/** The one line `describe` gives the owner's modes and the solving half (PF27, PF29): who decides each step, from the
    owner's own settings. Posting and merging share one answer per repository; solving has its own. */
const POSTING_MODE = { allowed: 'the agent decides', ask: 'the owner is asked each time', off: 'not allowed yet', none: 'not allowed yet', 'no-repository': 'needs a repository to say' } as const;
const SOLVING_MODE = { allowed: 'the agent decides', ask: 'the owner is asked each time', off: 'off' } as const;
export const describeModeLine = (posting: keyof typeof POSTING_MODE, solving: keyof typeof SOLVING_MODE): string =>
  `modes: posting and merging: ${POSTING_MODE[posting]}; taking others' bounties: ${SOLVING_MODE[solving]} (omakase-box describe --solving).`;
/** The instruction block's solving line, there only while the owner allows solving. */
export const SOLVING_BLOCK_LINE = 'The owner also allows taking paid bounties: `omakase-box describe --solving`.';

// What `omakase-box setup` installs and writes (PF16). The npm name replaces the address once the owner publishes.
export const INSTALL_SPEC = 'omakase-box';
export const PACKAGE_REMOVE = 'npm uninstall -g omakase-box';
export const SKILL_MARKER = '<!-- written by omakase-box setup; omakase-box setup --remove takes it away -->';
// BT63: the marker a skill written by 0.1.x carries. `setup` still recognises it as ours, so it replaces an old
// skill and `setup --remove` removes either; a file with neither marker is never touched.
export const SKILL_MARKER_OLD = '<!-- written by box setup; box setup --remove takes it away -->';
export const SKILL_TEXT = [
  '---',
  'name: omakase-box',
  'description: Hand off work you cannot or should not do to outside solvers, as a GitHub bounty. Consider it when attempts keep failing, the task needs access or knowledge you lack, or a second opinion counts. Solutions come back as facts you judge.',
  '---',
  SKILL_MARKER,
  '',
  'Run `omakase-box` in the project. It says what is set up and what to do next, and `omakase-box help` shows the journey.',
  '',
  'Posting is free apart from any reward the owner set, and goes only to this repository\'s own public GitHub, as an issue. The owner decides once. If they have not yet, `omakase-box` says what to ask them. Using it is always your call.',
  ''
].join('\n');

// What `omakase-box` says while a repository is not set up, so that installing is
// all a person has to do (PF15). It leaves as soon as the owner's answer is written.
// The three questions are the owner's; everything else here is the agent's.
export const SETUP_LINES: readonly string[] = [
  'not set up for this repository yet. To the agent reading this, in the project you work in:',
  '  1. run gh auth status; if it is not signed in, the owner runs gh auth login, which you cannot finish alone.',
  '  2. ask the owner: may bounties from this repository go public under your GitHub account, with a solution I choose merged into your code? What reward does each state, a promise you pay, and at most how much promised at once, in whole dollars? Should I ask you before each post and each merge? Show them the command you will run, filled in with their answers, so that their yes names it: omakase-box allow <owner>/<repository> --reward <reward> --reward-limit <limit>, adding --ask if they want to be asked.',
  '  3. run it. If your session refuses it, give the owner that exact command to run themselves.',
  'the answers are the owner\'s to give, unless they leave them to you. With no answer nothing is promised and nothing is posted.',
  'a person reading this: run omakase-box setup once, and your agents\' next sessions find the tool.'
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
  ? 'No reward is set: a bounty is not posted without one.'
  : `Every bounty states a reward of $${amount} — a promise in the owner's name; posting an answer does not guarantee it. There are three ways to pay it: by hand, one click and on merge (omakase-box help).`;

// BT57: the one line a pull request made with `take` ends with, so a use of the tool points to it. It names the product,
// not the command, so renaming the command never rewords text already public. The board address comes from this machine's
// settings, so it is accepted only as a plain lower-case https origin (no path, query, newline or Markdown): anything
// else counts as no address and the line names the package instead. The tool writes it once; it does not enforce it and
// never puts it back after the solver deletes it.
const CREDIT_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/;
export const creditLine = (board: string | null): string =>
  board !== null && CREDIT_ORIGIN.test(board) ? `Made with omakase-box: ${board}/agents/` : 'Made with omakase-box (npm: omakase-box)';

// The name the published package answers to — provisional until the owner's
// Part-B decision picks it for real (BT12). The artifact manifest carries
// the same name; the packaging test pins them equal. The notice does not
// name it until the owner publishes it (see RULES_LINES).
export const INSTALL_PACKAGE = 'omakase-box';

export const RULES_LINES: readonly string[] = [
  'omakase-box can hand a task you cannot or should not do to an outside solver',
  'and bring solutions back as facts. Posting is free apart from any reward the owner set, and goes only to this',
  'repository\'s public GitHub, as an issue; the owner\'s standing permission',
  'applies (`omakase-box config` shows it). `omakase-box describe` says when it',
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

export const rulesBlockInterior = (state: 'idle' | 'open' | 'new', solving = false): readonly string[] => [...RULES_LINES, ...(solving ? [SOLVING_BLOCK_LINE] : []), ...(state === 'idle' ? [] : [state === 'new' ? 'a bounty has a new solution; `omakase-box` shows more.' : 'a bounty is open; `omakase-box` shows more.'])];

export const renderRulesBlock = (state: 'idle' | 'open' | 'new', solving = false): string =>
  [RULES_MARKERS.open, ...rulesBlockInterior(state, solving), RULES_MARKERS.close].join('\n');
