import { BountyRefused } from './errors.js';
import { postBounty } from './commands.js';
import { isOpenStage, listRecords, loadRecord, persistRecord, retiredRoute } from './record.js';
import { promisedTotal } from './money.js';
import { DECISION_WORDS, ownerBlock } from './owner-text.js';
import { attemptsOf } from './record.js';
import { applyBounty } from './answer.js';
import { gitOutcome } from './git.js';
import { askMergeNoticeLine, loadSettings, loadState, localFirstMergeLine, markSaid, readDecision, repositoryIdentity, requireRepository, rewardNoticeLine, saidAlready, saveState, settingsFile, unknownSetting, writeDecision, writeMergeAnswer, writeMoney, writeRepository } from './settings.js';
import type { DecisionRead } from './settings.js';
import type { BountyRecord, WaitingFor } from './record.js';
import { relative } from 'node:path';
import { checkInstructionFile, checkInstructionMarkers, discoverInstructions, instructionNotices, syncInstructions } from './instructions.js';
import { checkInstructionSettingsWrite, readInstructions, writeInstructions } from './settings.js';
import { changePublishList, publishLists } from './never-ship.js';
import { githubRemotes, repositoryAddress } from './repository.js';
import { boundAmount } from './format.js';

// What `allow` prints before it writes: the owner block first — the plain
// sentences that say what a bounty is, that it is public under the owner's
// account, that the answer covers this repository only, what each bounty
// pays, and whether the owner is asked before posts and merges (BT13 — the
// merge sentences are part of the choice itself). The agent's part after
// the block says what the settings are not.
const disclosure = (address: string, amount: number, limit: number | null, ask: boolean): string[] => [
  ...ownerBlock([
    'A bounty asks people outside the project to fix something, and it is posted publicly on GitHub under your account.',
    'Your answer covers this repository only. A solution your agent chooses is merged into your code.',
    amount === 0
      ? `Each bounty on ${address} states $0 — no payment is promised.`
      : `Each bounty on ${address} promises $${amount}, which you pay by hand — at most $${limit} promised across its open bounties at once.`,
    ask
      ? 'You will be asked before each post and before each merge.'
      : 'You will not be asked before a post or a merge.',
    'Do you allow this?'
  ]),
  'for you — the answer is recorded in the owner\'s own settings, outside the repository.'
];

// What the settings are not is a standing explanation: said once ever,
// recorded, and kept in help and describe (BT17).
const NOT_A_LOCK = 'the settings stop accidents and record changes; they are not a lock against an agent that deliberately changes them.';

const wholeDollars = (flag: string, value: string): number => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new BountyRefused('reward-amount-invalid', `${flag} "${value}" is not a whole dollar amount at or above 0; nothing changed`);
  return Number(value);
};

export interface AllowMoney {
  readonly reward?: string;
  readonly rewardLimit?: string;
}

export function allowRepository(repoRoot: string | null, name?: string, ask = false, money?: AllowMoney, emitDisclosure?: (text: string) => void): string {
  if (name?.startsWith('bt-')) {
    if (ask || repoRoot === null || money?.reward !== undefined || money?.rewardLimit !== undefined) throw new BountyRefused('allow-arguments', 'a waiting bounty requires a repository and takes no money options; nothing changed');
    return allowBounty(repoRoot, name);
  }
  const address = name === undefined ? (repoRoot === null ? null : requireRepository(repoRoot)) : repositoryAddress(name);
  if (address === null) throw new BountyRefused('repository-address-invalid', 'allow needs a GitHub repository address, owner/name, or a waiting bounty; nothing changed');
  // Allowing a repository and stating what its bounties promise is one
  // command: --reward and --reward-limit write this entry's own money
  // (BT11c). With neither, the repository is allowed at $0 — unless the
  // entry already states an amount, which a bare allow keeps.
  const previous = loadSettings().repositories[address];
  const reward = money?.reward === undefined ? previous?.reward?.amount ?? 0 : wholeDollars('--reward', money.reward);
  const limit = money?.rewardLimit === undefined ? previous?.rewardLimit?.amount ?? null : wholeDollars('--reward-limit', money.rewardLimit);
  if (reward > 0 && limit === null) throw new BountyRefused('reward-needs-limit', `a reward above $0 needs the most that may be promised across ${address}'s open bounties — add --reward-limit <whole dollars> or set it first: box bounty config set reward-limit <whole dollars> ${address}; nothing changed`);
  if (reward > 0 && limit !== null && limit < reward) throw new BountyRefused('limit-below-reward', `--reward-limit $${limit} sits below a $${reward} reward for ${address}; nothing changed`);
  const words = disclosure(address, reward, limit, ask);
  // The once-ever explanation is decided now but recorded only after the
  // decision write — recording it first would write the owner's settings
  // before the disclosure the owner reads was shown (the BT8a order guard).
  const sayNotALock = !saidAlready(null, 'settings-not-a-lock');
  const wordsForOwner = sayNotALock ? [...words, NOT_A_LOCK] : words;
  writeRepository(address, ask ? 'ask' : 'allowed', emitDisclosure === undefined ? undefined : () => emitDisclosure(wordsForOwner.join('\n')), money === undefined ? undefined : { reward, rewardLimit: limit });
  if (sayNotALock) markSaid(null, 'settings-not-a-lock');
  // What this checkout now resolves to — computed after the write, because
  // in a several-remote checkout the write is what settles the choice (BT16
  // rule 7). A checkout whose remotes still cannot settle releases nothing.
  let currentAddress: string | null = null;
  let namesRemote = false;
  if (repoRoot !== null) {
    try {
      namesRemote = githubRemotes(repoRoot)?.some(candidate => candidate.address === address) ?? false;
      currentAddress = repositoryIdentity(repoRoot);
    } catch { /* named addresses work outside this checkout */ }
  }
  const lines = [...(emitDisclosure === undefined ? wordsForOwner : []), `${ask ? 'ask me each time' : 'allowed'}: ${address} — written to the owner's settings.`, reward === 0 ? `bounties on ${address} state $0 — no payment is promised; set one with box bounty config set reward <whole dollars> ${address}` : `bounties on ${address} state $${reward} — a promise you pay by hand; at most $${limit} promised open at once`];
  if (ask) lines.push('This covers each post and each merge — the owner is asked before either.');
  const retiredNotice = rewardNoticeLine();
  if (retiredNotice !== null) lines.push(retiredNotice);
  const askNotice = askMergeNoticeLine();
  if (askNotice !== null) lines.push(askNotice);
  // A name this checkout's remotes do not carry is still written — `allow`
  // names any repository — but it cannot release this checkout's waits;
  // that is said plainly (BT16 rule 7).
  if (name !== undefined && repoRoot !== null && !namesRemote) lines.push(`${address} is not one of this checkout's remotes; nothing here was released`);
  // A named repository may be allowed from outside any checkout. Release
  // waits only when the current checkout has that same address.
  if (!ask && repoRoot !== null && currentAddress === address) {
    for (const entry of listRecords(repoRoot)) {
      const record = entry.record;
      // A bounty held for a merge runs its merge on the next `apply` — the
      // new decision already covers it; the wait's binding still applies.
      if (record?.stage === 'waiting' && record.waiting?.for === 'merge') {
        lines.push(`${record.id} waits for a merge — box bounty apply ${record.id} ${record.waiting.merge?.n ?? '<n>'} runs it now`);
        continue;
      }
      if (record?.stage !== 'waiting' || record.waiting?.for !== 'post' || record.waiting.to === undefined) continue;
      if (record.waiting.reason === 'secrets') {
        lines.push(`${record.id} still waits on the pre-publish scan — an answer cannot release it; decide in box bounty config: the path goes on safe to publish or never publish.`);
        continue;
      }
      if (record.waiting.reason === 'untracked-file') {
        lines.push(`${record.id} still waits on the pre-publish check; box bounty allow ${record.id} answers that one hold.`);
        continue;
      }
      try {
        const posted = postBounty(repoRoot, record.id, record.waiting.to, { ...(record.waiting.choice === undefined ? {} : { choice: record.waiting.choice }) });
        // The released bounty states its amount in the same breath (BT14) —
        // what went out is what it pays.
        lines.push(`${record.id}: the waiting bounty went out: ${posted.destination} — it states $${boundAmount(posted.record) ?? 0}`);
      } catch (error) {
        lines.push(`${record.id} still waits: ${error instanceof BountyRefused ? `${error.reason}: ${error.message}` : error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return lines.join('\n');
}
export function denyRepository(repoRoot: string | null, name?: string): string {
  const address = name === undefined ? (repoRoot === null ? null : requireRepository(repoRoot)) : repositoryAddress(name);
  if (address === null) throw new BountyRefused('repository-address-invalid', 'deny needs a GitHub repository address, owner/name; nothing changed');
  // deny returns the repository to nothing written — its reward and limit go
  // with the entry, so a re-allowed repository states $0 again.
  const previous = loadSettings().repositories[address];
  writeRepository(address, null);
  // The removal's consequence is named in the same breath (BT14): the
  // reward and the limit that went with the entry, so a later re-allow
  // knows what to state again.
  const money = previous !== undefined && (previous.reward !== undefined || previous.rewardLimit !== undefined)
    ? ` Its reward ($${previous.reward?.amount ?? 0})${previous.rewardLimit !== undefined ? ` and limit ($${previous.rewardLimit.amount})` : ''} went with the entry — re-allow states them again.` : '';
  const retiredNotice = rewardNoticeLine();
  const askNotice = askMergeNoticeLine();
  return `${address}: not allowed — removed from the active list; all-projects does not re-allow it; open bounties are untouched.${money}\nnext: box bounty allow ${address} re-allows it${retiredNotice === null ? '' : `\n${retiredNotice}`}${askNotice === null ? '' : `\n${askNotice}`}`;
}
export function allowBounty(repoRoot: string, id: string): string {
  const record = loadRecord(repoRoot, id);
  const waiting = record.waiting;
  if (record.stage === 'waiting' && waiting?.for === 'merge') return allowMerge(repoRoot, record, waiting);
  if (record.stage !== 'waiting' || waiting?.for !== 'post' || waiting.to === undefined) throw new BountyRefused('owner-answer-not-waiting', `${id} is not waiting for a post; nothing changed. box bounty status ${id} shows its state`);
  const retired = retiredRoute(record);
  if (retired !== null) throw new BountyRefused(retired, `this bounty waited for retired folder delivery; nothing changed. End it with box bounty close ${id}`);
  if (waiting.reason === 'secrets') throw new BountyRefused('allow-scan-held', `${id} waits on the pre-publish scan — an owner answer cannot release it. Decide in box bounty config: the path goes on safe to publish or never publish; or the flagged content is removed and the post run again; nothing changed`);
  // A one-bounty yes cannot say which repository it covers (BT16 rule 6):
  // in a checkout whose remotes name several GitHub repositories the list
  // has not settled, this refuses repository-choice-needed before the
  // answer is recorded — nothing changes, and the refusal lists the
  // candidates and their commands.
  requireRepository(repoRoot);
  // The answer is recorded bound to what the owner was shown before the held
  // post reruns: a wait the rerun uncovers carries it forward for the same
  // post, and a later `post` reuses it only while the published state still
  // matches — drift drops it (github-preview-stale or a fresh wait).
  record.waiting = { ...waiting, answered: { at: new Date().toISOString(), ...(waiting.shown === undefined ? {} : { shown: waiting.shown }) } };
  persistRecord(repoRoot, record);
  const posted = postBounty(repoRoot, id, waiting.to, { answered: true, ...(waiting.choice === undefined ? {} : { choice: waiting.choice }) });
  return `${id}: answered once; posted to ${posted.destination} — it states $${boundAmount(posted.record) ?? 0}. No repository decision changed.`;
}

// `allow <id>` on a merge wait (BT13): the owner's answer releases the
// merge, and only the merge — nothing is written to the owner's settings.
// The answer is bound to what the owner was shown: which attempt, at which
// commit, onto which branch tip. A changed solution or a moved branch is a
// named refusal that changes nothing — the owner answers again on the new
// state, recorded by a fresh `apply`.
function allowMerge(repoRoot: string, record: BountyRecord, waiting: WaitingFor): string {
  const bound = waiting.merge;
  if (bound === undefined) throw new BountyRefused('merge-approval-stale', `${record.id} waits for a merge approval that names nothing it is bound to — run box bounty apply ${record.id} again so the wait records the current state for the owner; nothing changed`);
  const attempt = attemptsOf(record).find(candidate => candidate.n === bound.n);
  const head = gitOutcome(repoRoot, ['rev-parse', 'HEAD']).stdout.trim();
  if (attempt === undefined || attempt.commit !== bound.commit || head !== bound.head) {
    throw new BountyRefused('merge-approval-stale', `${record.id}: the solution or the branch changed underneath the waiting merge — the owner's answer was for what they were shown, so it does not carry over. Run box bounty apply ${record.id} again so the wait records the new state; nothing changed`);
  }
  // The answer is written to the owner's settings — outside the repository
  // — before the merge reruns: a conflict keeps it so the owner is not
  // asked twice for the same bound state, and a drift then makes the
  // stale check above refuse it. Nothing on the record marks a merge
  // approved, so a record edited inside the checkout cannot forge one.
  writeMergeAnswer(repoRoot, record.id, bound);
  const result = applyBounty(repoRoot, record.id, bound.n, { answered: true });
  const lines = result.outcome === 'applied'
    ? [`${record.id}: answered once; solution ${bound.n} merged as ${result.mergeCommit}. No repository decision changed.`]
    : [`${record.id}: answered once; the merge conflicted in ${(result.conflicts ?? []).join(', ')} — worktree and index are exactly as before; the answer stands while the solution and this branch's state are unchanged. No repository decision changed.`];
  if (result.firstMergeNotice !== undefined) lines.push(result.firstMergeNotice);
  if (result.payMessage !== undefined) lines.push(...result.payMessage);
  return lines.join('\n');
}
// Bare `config` is the working surface (BT14): what is in force, the
// repository table, the publish lists, the waiting answers — and never a
// never-set-off setting rendered as if written. The long explanations, the
// history and the all-projects row live under `config --full`, which the
// bare surface names on its last line.
export function renderConfig(repoRoot: string | null, options?: { readonly full?: boolean }): string {
  const full = options?.full === true;
  const settings = loadSettings();
  let address: string | null = null;
  let current: DecisionRead | null = null;
  let identityFact = 'no checkout selected';
  if (repoRoot !== null) {
    try { address = repositoryIdentity(repoRoot); identityFact = address ?? 'no GitHub address'; if (address !== null) current = readDecision(repoRoot); }
    catch (error) { identityFact = error instanceof BountyRefused ? `${error.reason}: ${error.message}` : String(error); }
  }
  const active = Object.entries(settings.repositories).filter(([, entry]) => entry.bounty === 'allowed' || entry.bounty === 'ask');
  // The promise count lives in each repository's own records — readable only
  // for the checkout this command runs in.
  let promisedHere: number | null = null;
  if (repoRoot !== null) promisedHere = promisedTotal(listRecords(repoRoot).filter(entry => entry.record !== null && isOpenStage(entry.record.stage)));
  const global = settings.default?.bounty === 'allowed' ? 'true' : settings.default?.bounty === 'ask' ? 'ask' : 'false (off by default)';
  const undecided: string[] = [];
  if (address === null) undecided.push('a GitHub address for this checkout');
  else if (current?.decision === null && !current.denied) undecided.push('no repository permission for this repository');
  if (settings.default === undefined) undecided.push('all-projects (nothing written; defaults to off)');
  const effective = current === null ? 'permission cannot be read without one GitHub address' : current.denied || current.decision === 'off' && current.level === 'project'
    ? `not allowed; ${current.denied ? 'denied' : 'marked off'} at ${current.at}; the all-projects setting does not override this decision`
    : current.decision === null || current.decision === 'off' ? 'not allowed; no repository permission is written'
      : `${current.decision === 'ask' ? DECISION_WORDS.ask : 'allowed'}${current.level === 'default' ? ' by the all-projects setting' : ' by this repository entry'}, changed ${current.at}`;
  const lines = [
    `the owner's settings: ${settingsFile()}`,
    // What allowing means is a standing explanation — said on `allow` and
    // kept in help and describe; the bare surface names facts in force (BT17).
    ...(full ? ['Allowing a repository means bounties are public under your GitHub account and a solution the agent chooses is merged into your code. Each repository entry covers that repository only.'] : []),
    `this repository: ${identityFact}; ${effective}`,
    // A never-set all-projects is not a setting — nothing was written, so
    // the bare surface omits the row (BT14). --full always shows it.
    ...(full || settings.default !== undefined ? [
      `all-projects: ${global}${settings.default === undefined ? ', nothing written' : `, changed ${settings.default.at}`}; change: box bounty config set all-projects <true|false|ask>`,
      '  true grants publication permission in repositories without their own decision; false grants no blanket permission; ask asks before each post and each merge in repositories without their own decision.',
      '  A repository entry overrides all-projects. A dated deny removal keeps that repository not allowed even when all-projects is true or ask; box bounty allow <owner/name> re-allows it.'
    ] : []),
    `repositories: ${active.length} active — each entry carries its own reward and its own limit; allow: box bounty allow <owner/name>; deny: box bounty deny <owner/name>`,
    ...(full ? [
      '  a repository with no reward written states $0. Set one: box bounty config set reward <whole dollars> [owner/name]; its limit: box bounty config set reward-limit <whole dollars> [owner/name] — run inside its checkout or name the repository. The all-projects extra never carries a reward.',
      'ask me each time covers each post and each merge: the tool\'s own post or merge waits for the owner\'s answer; a merge the agent lands by hand still closes the bounty and is stated as not asked. Closing never waits.'
    ] : []),
    `not decided yet: ${undecided.length === 0 ? 'nothing among the settings shown' : undecided.join('; ')}`
  ];
  if (address !== null) {
    if (current?.decision !== 'allowed') lines.push(`  ${DECISION_WORDS.allow}: box bounty allow ${address}`);
    if (current?.decision !== 'ask') lines.push(`  ${DECISION_WORDS.ask}: box bounty allow ${address} --ask`);
  }
  if (repoRoot !== null) {
    const publish = publishLists(repoRoot);
    lines.push(`never publish: ${publish.never.length === 0 ? 'none listed' : publish.never.join(', ')} — kept out of every bounty; change: box bounty config add never-publish <path>, or remove never-publish <path>`);
    lines.push(`safe to publish: ${publish.safe.length === 0 ? 'none listed' : publish.safe.join(', ')} — paths the pre-publish scan does not hold a bounty over; change: box bounty config add safe-to-publish <path>, or remove safe-to-publish <path>`);
    const choice = readInstructions(repoRoot);
    lines.push(`instructions: ${choice.enabled ? 'on' : 'off'}; change: box bounty config set instructions <true|false>`);
    lines.push(`instruction-file: ${choice.file ?? 'none chosen'}; choose any existing file: box bounty config set instruction-file <existing-path>`);
    const found = discoverInstructions(repoRoot);
    lines.push(`instruction files found: ${found.length === 0 ? 'none; name an existing file with box bounty config set instruction-file <existing-path>' : found.map(file => `${file.path}${file.refusal === undefined ? '' : ` (refused: ${file.refusal})`}`).join(', ')}`);
    lines.push(...instructionNotices(repoRoot, false));
    const listed = listRecords(repoRoot);
    if (address === null || settings.repositories[address] === undefined) {
      lines.push(`promised across this repository's open bounties: $${promisedHere ?? 0} — this repository is not listed, so its bounties state $0`);
    }
    const waiting = listed.flatMap(entry => entry.record?.stage === 'waiting' ? [entry.record] : []);
    for (const record of waiting) {
      const held = record!.waiting!;
      lines.push(held.for === 'merge'
        ? `  ${record!.id} waits for a merge — ${DECISION_WORDS.once}: box bounty allow ${record!.id}`
        : held.reason === 'secrets'
          ? `  ${record!.id} waits on the pre-publish scan — decide with the lists above: safe to publish or never publish the path`
          : `  ${DECISION_WORDS.once}: box bounty allow ${record!.id}`);
    }
    if (waiting.length === 0) lines.push('waiting actions: none; see current actions with box bounty status');
  }
  // The repository table: one line each — address, its decision, its reward,
  // its limit, and what its open bounties promise now. The promise count is
  // readable only in this checkout; every other repository's lives in its own
  // records. The commands that change each sit on the header lines above.
  for (const [key, entry] of Object.entries(settings.repositories)) {
    const state = entry.bounty === null || entry.bounty === 'off'
      ? `not allowed; denied at ${entry.at}; all-projects does not apply after deny`
      : `${entry.bounty === 'ask' ? DECISION_WORDS.ask : 'allowed'}, added ${entry.changes[0]?.at ?? entry.at}, changed ${entry.at}`;
    const reward = entry.reward?.amount ?? 0;
    const limit = entry.rewardLimit?.amount ?? null;
    const promise = key === address && promisedHere !== null
      ? (limit === null ? `open bounties here promise $${promisedHere}; no limit set` : `open bounties here promise $${promisedHere} of a $${limit} limit — ${promisedHere <= limit ? `$${limit - promisedHere} left` : `$${promisedHere - limit} over`}`)
      : 'open-promise count lives in that repository\'s own records';
    // A denied entry offers a re-allow, never a second remove for a
    // repository already gone (BT14); its history is the long form's.
    const change = entry.bounty === null || entry.bounty === 'off'
      ? `re-allow: box bounty allow ${key}`
      : `change: box bounty allow ${key}${entry.bounty === 'ask' ? '' : ' --ask'}; remove: box bounty deny ${key}`;
    lines.push(`  ${key}: ${state}; reward $${reward}${limit === null ? ', no limit set' : `, limit $${limit}`}; ${promise}; ${change}`);
    if (full) for (const previous of entry.changes) lines.push(`    history: ${previous.bounty ?? 'denied'} at ${previous.at}`);
  }
  if (!full) lines.push('every setting, its history and the commands that change it: box bounty config --full');
  const rewardNotice = rewardNoticeLine();
  if (rewardNotice !== null) lines.push(rewardNotice);
  const askNotice = askMergeNoticeLine();
  if (askNotice !== null) lines.push(askNotice);
  // Migration and first-merge facts are the tool's records, kept in its own
  // state file — the render is the same, the source is not the owner's file.
  const toolState = loadState();
  for (const notice of toolState.migrations) lines.push(`migration ${notice.at}: ${JSON.stringify(notice.path)} ${notice.detail}; re-add: box bounty allow ${notice.repository ?? '<owner/name>'}`);
  for (const [key, notice] of Object.entries(toolState.firstMerges)) lines.push(`first outside solution merged in ${key}: commit ${notice.commit} at ${notice.at}; see: box bounty status --full`);
  const localMerge = repoRoot === null ? null : localFirstMergeLine(repoRoot);
  if (localMerge !== null) lines.push(localMerge);
  return lines.join('\n');
}
export function changeConfig(repoRoot: string | null, verb: string, name: string, value: string, emitDisclosure?: (text: string) => void, target?: string): string {
  if (name === 'instructions' || name === 'instruction-file') {
    if (repoRoot === null || verb !== 'set') throw new BountyRefused('config-value-invalid', 'instruction settings require a checkout and config set; nothing changed');
    checkInstructionSettingsWrite(repoRoot);
    const previous = readInstructions(repoRoot);
    if (name === 'instructions') {
      if (value !== 'true' && value !== 'false') throw new BountyRefused('config-value-invalid', 'use box bounty config set instructions <true|false>; nothing changed');
      writeInstructions(repoRoot, { ...previous, enabled: value === 'true' });
      return [`instructions: ${value === 'true' ? 'on' : 'off'}; owner's settings outside the repository. Existing blocks remain when off.`, ...syncInstructions(repoRoot, true)].join('\n');
    }
    const file = checkInstructionFile(repoRoot, value);
    checkInstructionMarkers(file);
    writeInstructions(repoRoot, { ...previous, file: relative(repoRoot, file).replaceAll('\\', '/') });
    return [`instruction-file: ${value}; saved in the owner's settings. Enable or add the block: box bounty config set instructions true`, ...syncInstructions(repoRoot, true)].join('\n');
  }
  if ((name === 'never-publish' || name === 'safe-to-publish') && (verb === 'add' || verb === 'remove')) {
    if (repoRoot === null) throw new BountyRefused('config-value-invalid', `${name} lists paths inside one repository — run it inside a checkout; nothing changed`);
    return changePublishList(repoRoot, name, verb, value);
  }
  if (name === 'never-publish' || name === 'safe-to-publish') throw new BountyRefused('config-value-invalid', `use box bounty config add ${name} <path>, or config remove ${name} <path>; nothing changed`);
  // `config add/remove repositories` is retired (BT14): the verbs live on
  // `allow`/`deny` now, so the old command is a named refusal that points
  // there rather than silently still working. Any other verb on the same
  // name gets the same pointer — never the "not a setting" wall.
  if (name === 'repositories') {
    const target = verb === 'remove' ? `box bounty deny ${value ?? '<owner/name>'}` : `box bounty allow ${value ?? '<owner/name>'}`;
    throw new BountyRefused('config-command-removed', `box bounty config ${verb} repositories ${verb === 'add' || verb === 'remove' ? 'was removed' : 'is not how a repository is listed'} — ${verb === 'remove' ? 'denying' : 'allowing'} a repository is its own command: ${target}; nothing changed`);
  }
  if (name === 'reward' || name === 'reward-limit') {
    if (verb !== 'set') throw new BountyRefused('config-value-invalid', `use box bounty config set ${name} <whole dollars> [owner/name]; nothing changed`);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new BountyRefused('reward-amount-invalid', `"${value}" is not a whole dollar amount at or above 0; nothing changed`);
    const amount = Number(value);
    // Money is a fact of one repository entry — the checkout this runs in, or
    // the repository named after the amount. A repository not on the owner's
    // list cannot be paid on; the all-projects extra never carries a reward.
    if (target === 'all-projects') throw new BountyRefused('reward-all-projects', `the all-projects extra is not a repository and never carries a reward — name a repository: box bounty config set ${name} ${value} <owner/name>; nothing changed`);
    const address = target === undefined
      ? (repoRoot === null ? null : repositoryIdentity(repoRoot))
      : repositoryAddress(target);
    if (address === null) throw new BountyRefused('repository-address-invalid', `config set ${name} needs a repository — run it inside a checkout with one GitHub address or name one: box bounty config set ${name} ${value} <owner/name>; nothing changed`);
    const settings = loadSettings();
    const entry = settings.repositories[address];
    if (entry === undefined || entry.bounty === null || entry.bounty === 'off') throw new BountyRefused('reward-repository-unlisted', entry === undefined
      ? `${address} is not on the owner's list — allow it first, with its amounts in the same breath: box bounty allow ${address} --reward <whole dollars> --reward-limit <whole dollars>; nothing changed`
      : `${address} is denied — allow it again before setting what it pays; nothing changed`);
    const lines: string[] = [];
    if (name === 'reward') {
      const limit = entry.rewardLimit?.amount ?? null;
      if (amount > 0 && (limit === null || limit < amount)) throw new BountyRefused('reward-needs-limit', limit === null
        ? `a reward above $0 on ${address} first needs the most that may be promised across that repository's open bounties — set it: box bounty config set reward-limit <whole dollars> ${address}; nothing changed`
        : `${address}'s open-bounty limit is $${limit}, below a $${amount} reward — raise it first: box bounty config set reward-limit <whole dollars> ${address}; nothing changed`);
      // The first amount above 0 is the moment the tool says in plain words
      // what a reward is — once ever, recorded so it is never repeated.
      const firstNaming = amount > 0 && loadState().rewardPromiseSaid === undefined;
      const written = writeMoney(address, { reward: amount });
      if (firstNaming) saveState({ ...loadState(), rewardPromiseSaid: written.at });
      lines.push(`${address} reward: $${amount}, written ${written.at} to ${settingsFile()} — each bounty posted on ${address} now states it; other repositories are unchanged.`);
      if (firstNaming) lines.push('A bounty reward is a promise, made in your name, that you pay by hand — the tool never moves money.');
    } else {
      const reward = entry.reward?.amount ?? 0;
      if (amount < reward) throw new BountyRefused('limit-below-reward', `${address}'s reward is $${reward} — the limit on what its open bounties may promise cannot be set below it; nothing changed`);
      const written = writeMoney(address, { rewardLimit: amount });
      lines.push(`${address} reward limit: $${amount}, written ${written.at} to ${settingsFile()} — the most that may be promised across ${address}'s open bounties; other repositories are unchanged.`);
    }
    // Bounties already out keep the amount they were posted with — a change
    // here is for later bounties only, and the tool says so while any are
    // open. Only this checkout's records can be counted; another repository's
    // promise lives in its own records.
    const open = repoRoot !== null && repositoryIdentity(repoRoot) === address
      ? listRecords(repoRoot).filter(listed => listed.record !== null && isOpenStage(listed.record.stage))
      : [];
    const posted = open.filter(listed => boundAmount(listed.record!) !== undefined).length;
    if (posted > 0) lines.push(`${posted} open ${posted === 1 ? 'bounty keeps' : 'bounties keep'} the amount each was posted with — this changes later bounties only.`);
    else lines.push('a bounty keeps the amount it was posted with — this changes later bounties only.');
    if (repoRoot !== null && repositoryIdentity(repoRoot) === address) {
      const promised = promisedTotal(open);
      const limit = name === 'reward-limit' ? amount : entry.rewardLimit?.amount ?? null;
      lines.push(limit === null ? `promised now: $${promised} across this repository's open bounties; no limit is set` : `promised now: $${promised} across this repository's open bounties — ${promised <= limit ? `$${limit - promised} left of` : `$${promised - limit} over`} the $${limit} limit`);
    }
    return lines.join('\n');
  }
  if (name !== 'all-projects') return unknownSetting(name);
  if (verb !== 'set' || !['true', 'false', 'ask'].includes(value)) throw new BountyRefused('config-value-invalid', 'use box bounty config set all-projects <true|false|ask>; nothing changed');
  const bounty = value === 'true' ? 'allowed' : value === 'ask' ? 'ask' : 'off';
  const written = writeDecision(repoRoot ?? '.', 'default', bounty);
  const merge = bounty === 'allowed' ? 'Merging is not gated — the owner is not asked before a merge.' : 'The owner is asked before each merge too — ask me each time covers posts and merges.';
  return `all-projects: ${value}, written ${written.at}. ${value === 'true' ? 'Bounties may be public under your GitHub account across all projects; solutions the agent chooses are merged into your code.' : 'Each post needs a repository permission or one-bounty answer.'} Dated deny exceptions stay not allowed. ${merge}`;
}

export function renderSummary(repoRoot: string, since?: string): string {
  let from = '';
  if (since !== undefined) {
    if (!Number.isFinite(Date.parse(since))) throw new BountyRefused('summary-time-invalid', `--since ${since} is not a readable time; pass an ISO time`);
    from = new Date(since).toISOString();
  }
  const posted: string[] = [], merged: string[] = [], closed: string[] = [], waiting: string[] = [], findings: string[] = [];
  for (const entry of listRecords(repoRoot)) {
    const record = entry.record;
    if (record === null) continue;
    for (const event of record.events) {
      if (event.at < from) continue;
      if (event.stage === 'posted') posted.push(`${record.id} at ${event.at} (${event.destination ?? 'unspecified destination'})`);
      else if (event.stage === 'applied') merged.push(`${record.id} at ${event.at} (merge ${event.merge ?? 'unnamed'})`);
      else if (['rejected', 'withdrawn', 'undone'].includes(event.stage)) closed.push(`${record.id} ${event.stage} at ${event.at}`);
    }
    if (record.waiting !== undefined) waiting.push(`${record.id} (${record.waiting.reason}, since ${record.waiting.at})`);
    // Scan findings are standing facts, not events — a settled one carries no
    // time of its own, so every finding on the record is reported, whatever
    // --since says about the events around it.
    for (const finding of record.scanFindings ?? []) {
      for (const hit of finding.hits) findings.push(`${record.id}: ${hit.path}:${hit.line} (${hit.rule}) — ${finding.settled ?? 'flagged — unsettled'}`);
    }
  }
  const read = readDecision(repoRoot);
  return [`what was done since ${since === undefined ? 'the beginning' : from}: facts from the record`, `  bounties posted: ${posted.length}: ${posted.join('; ')}`, `  solutions merged: ${merged.length}: ${merged.join('; ')}`, `  bounties closed with none: ${closed.length}: ${closed.join('; ')}`, `  waiting now: ${waiting.length}: ${waiting.join('; ')}`, `  scan findings: ${findings.length}: ${findings.join('; ')}`, `the owner's decision is ${read.decision ?? 'nothing written'}`].join('\n');
}
