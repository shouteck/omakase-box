// The solver's half of the tool (PF24): the owner allows solving once, with guard rails the agent cannot loosen,
// and `discover` brings each new bounty since the agent's own bookmark, once, with the facts to judge it.
// The owner's word lives in the owner's settings; the agent's filter and bookmark are the agent's, in the tool's own
// file beside them (D-2026-11-03-solver-in-the-tool: tuning in lives in the solver). The tool schedules nothing:
// the agent's host wakes it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boardAddress, readBoardNumbers, readFeedPage } from './board.js';
import { BountyRefused } from './errors.js';
import { repositoryAddress } from './repository.js';
import { loadSettings, saveSettings, settingsDir, writeToolFile, type SolvingSettings } from './settings.js';
import { blockFooter, blockHeader, solverAccount, solverLine } from './untrusted.js';
import { quoteForeign } from './notice.js';

export const DISCOVER_PAGE = 10;
/** The board's own floor for checking (PF22): more often gains nothing. */
export const DISCOVER_FLOOR_MINUTES = 15;
const OFF: SolvingSettings = { mode: 'off', floor: 0, paysOnMergeOnly: false, skip: [], at: '' };
const NOT_RUN = 'the board has not read or run any repository\'s code; work on a bounty only in a throwaway copy, with no credentials of yours in reach.';
const SCHEDULE = `run it again from your own schedule, no more often than every ${DISCOVER_FLOOR_MINUTES} minutes: a cron entry, your host's scheduled task, or a workflow schedule`;

export const solvingOf = (): SolvingSettings => loadSettings().solving ?? OFF;

// ---- the owner's word: config set solving|solving-floor|solving-pays-on-merge, add|remove solving-skip -----------

const MODE_WORDS = { off: 'off — your agents do not take bounties', ask: 'ask each time — your agents find bounties and ask you before taking one', allowed: 'allowed — your agents may take bounties within these limits' } as const;

export function changeSolving(verb: string, name: string, value: string): string {
  const now = new Date().toISOString();
  const current = solvingOf();
  const save = (next: Omit<SolvingSettings, 'at'>): void => saveSettings({ ...loadSettings(), solving: { ...next, at: now } });
  if (name === 'solving') {
    if (verb !== 'set' || (value !== 'off' && value !== 'ask' && value !== 'allowed')) throw new BountyRefused('config-value-invalid', 'nothing changed; next: omakase-box config set solving <off|ask|allowed>');
    save({ ...current, mode: value });
    return [`solving: ${MODE_WORDS[value]}; written ${now} to the owner's settings, outside every repository.`,
      ...(value === 'off' ? [] : ['Taking a bounty means your agent runs a stranger\'s code from that repository; it should work only in a throwaway copy, with none of your credentials in reach.', `limits in force: ${limitWords({ ...current, mode: value, at: now })}; change: omakase-box config set solving-floor <whole dollars>, config set solving-pays-on-merge <true|false>, config add solving-skip <owner/name>`])].join('\n');
  }
  if (name === 'solving-floor') {
    if (verb !== 'set' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new BountyRefused('config-value-invalid', 'nothing changed; next: omakase-box config set solving-floor <whole dollars>');
    save({ ...current, floor: Number(value) });
    return `solving-floor: $${Number(value)} — your agents never take a bounty stating less; written ${now}.`;
  }
  if (name === 'solving-pays-on-merge') {
    if (verb !== 'set' || (value !== 'true' && value !== 'false')) throw new BountyRefused('config-value-invalid', 'nothing changed; next: omakase-box config set solving-pays-on-merge <true|false>');
    save({ ...current, paysOnMergeOnly: value === 'true' });
    return `solving-pays-on-merge: ${value} — ${value === 'true' ? 'your agents take only bounties the board says pay on merge' : 'your agents may take bounties whatever way they pay'}; written ${now}.`;
  }
  // solving-skip
  const address = repositoryAddress(value);
  if ((verb !== 'add' && verb !== 'remove') || address === null) throw new BountyRefused('config-value-invalid', 'nothing changed; next: omakase-box config add solving-skip <owner/name>, or remove solving-skip <owner/name>');
  const skip = verb === 'add' ? [...new Set([...current.skip, address])] : current.skip.filter(entry => entry !== address);
  save({ ...current, skip });
  return `solving-skip: ${skip.length === 0 ? 'none' : skip.join(', ')} — your agents never take a bounty from ${skip.length === 1 ? 'it' : 'these'}; written ${now}.`;
}

const limitWords = (solving: SolvingSettings): string =>
  [`at least $${solving.floor}`, solving.paysOnMergeOnly ? 'pays on merge only' : 'any way of paying', solving.skip.length === 0 ? 'no repository skipped' : `never from ${solving.skip.join(', ')}`].join('; ');

/** The owner's solving lines in `config`. */
export function solvingLines(full: boolean): string[] {
  const solving = loadSettings().solving;
  if (solving === undefined && !full) return ['solving: off (nothing written) — your agents do not take bounties; change: omakase-box config set solving <off|ask|allowed>'];
  const now = solving ?? OFF;
  return [
    `solving: ${MODE_WORDS[now.mode]}${solving === undefined ? ' (nothing written)' : `, changed ${now.at}`}; change: omakase-box config set solving <off|ask|allowed>`,
    `  limits your agents cannot loosen: ${limitWords(now)}; change: omakase-box config set solving-floor <whole dollars>, config set solving-pays-on-merge <true|false>, config add|remove solving-skip <owner/name>`
  ];
}

// ---- the agent's own filter and bookmark ---------------------------------------------------------------------

interface Discovered { readonly board: string; readonly bookmark: string; readonly languages: readonly string[]; readonly minReward: number; readonly at: string }
const discoverFile = (): string => join(settingsDir(), 'discover.json');
const LANGUAGE = /^[A-Za-z\d#+.\- ]{1,40}$/;

/** The agent's file. Unreadable or hand-broken: started again from nothing, and said; it carries no authority. */
function loadDiscovered(): { readonly value: Discovered | null; readonly reset: boolean } {
  const path = discoverFile();
  if (!existsSync(path)) return { value: null, reset: false };
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const value = raw as Record<string, unknown>;
    if (value === null || typeof value !== 'object' || typeof value['board'] !== 'string' || typeof value['bookmark'] !== 'string' || !/^[A-Za-z\d_-]{1,200}$/.test(value['bookmark'])
      || !Array.isArray(value['languages']) || (value['languages'] as unknown[]).some(entry => typeof entry !== 'string' || !LANGUAGE.test(entry))
      || typeof value['minReward'] !== 'number' || !Number.isSafeInteger(value['minReward']) || (value['minReward'] as number) < 0) return { value: null, reset: true };
    return { value: { board: value['board'], bookmark: value['bookmark'], languages: value['languages'] as string[], minReward: value['minReward'] as number, at: String(value['at'] ?? '') }, reset: false };
  } catch { return { value: null, reset: true }; }
}

// ---- discover --------------------------------------------------------------------------------------------------

export interface DiscoverOptions {
  /** The agent's languages; given, they replace the saved ones. */
  readonly languages?: readonly string[];
  /** Clears the saved languages. */
  readonly anyLanguage?: boolean;
  /** The agent's own minimum; never below the owner's floor. */
  readonly minReward?: number;
  /** Where a first run, or a restart, begins: every open bounty, or only those listed from now. */
  readonly from?: 'start' | 'now';
}

export interface DiscoveredBounty {
  readonly id: string; readonly title: string; readonly reward: number; readonly paysOnMerge: boolean;
  readonly repository: string; readonly language: string | null; readonly owner: string;
  readonly record: { readonly merged: number; readonly recordedPaid: number; readonly confirmedReceived: number; readonly owedNow: number };
  readonly decisions: { readonly count: number; readonly medianDays: number | null };
  readonly solutionsOpen: number; readonly openAllByPoster: boolean; readonly attempts: number;
  /** PF29: others' pull requests on this owner's bounties, and what GitHub's checks say on the attempts shown. */
  readonly pullRequests: { readonly merged: number; readonly closed: number; readonly open: number } | null;
  readonly checks: Readonly<Record<'passing' | 'failing' | 'pending' | 'none' | 'unread', number>>;
  readonly ageDays: number; readonly branch: string; readonly baseCommit: string; readonly page: string;
}
export interface DiscoverResult {
  readonly board: string; readonly mode: SolvingSettings['mode']; readonly limits: SolvingSettings;
  readonly filter: { readonly languages: readonly string[]; readonly minReward: number };
  readonly bounties: readonly DiscoveredBounty[]; readonly more: boolean; readonly skipped: number;
  readonly unreadable: number; readonly began: 'start' | 'now' | 'bookmark'; readonly resetNote: string | null;
  /** PF29: the board as a whole in one line, on a first run (from the start or from now), when an agent decides whether
      to check this board at all; null on a routine run from a bookmark, which makes one request as before, or with no board. */
  readonly numbers: string | null;
  /** Saves the bookmark: call only once the bounties are shown, so a failure repeats them rather than skips them. */
  readonly save: () => void;
}

const num = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** One feed entry as the solver sees it, or null when it does not read as the board's own shape. */
function entryOf(raw: unknown): DiscoveredBounty | null {
  if (raw === null || typeof raw !== 'object') return null;
  const e = raw as Record<string, any>;
  const id = typeof e['id'] === 'string' && /^bt-[a-f\d]{12}$/.test(e['id']) ? e['id'] : null;
  const title = typeof e['poster_says']?.['title'] === 'string' ? e['poster_says']['title'] as string : null;
  const reward = num(e['reward']?.['amount']);
  const repository = typeof e['repository']?.['name'] === 'string' ? repositoryAddress(e['repository']['name']) : null;
  const language = typeof e['repository']?.['language'] === 'string' && LANGUAGE.test(e['repository']['language']) ? e['repository']['language'] as string : null;
  const owner = typeof e['owner']?.['login'] === 'string' ? e['owner']['login'] as string : null;
  const record = e['owner']?.['record'];
  const decisions = e['owner']?.['decisions'];
  const odds = e['owner']?.['pull_requests'];
  const pullRequests = num(odds?.['merged']) !== null && num(odds?.['closed']) !== null && num(odds?.['open']) !== null ? { merged: odds['merged'] as number, closed: odds['closed'] as number, open: odds['open'] as number } : null;
  const checks = { passing: 0, failing: 0, pending: 0, none: 0, unread: 0 };
  for (const draft of Array.isArray(e['attempts_in_progress']?.['drafts']) ? e['attempts_in_progress']['drafts'] as unknown[] : []) {
    const state = (draft as Record<string, any> | null)?.['checks']?.['state'];
    if (typeof state === 'string' && Object.hasOwn(checks, state)) checks[state as keyof typeof checks] += 1;
  }
  // PF32: a bounty an owner listed from the board is answered on the default branch, its pull request closing the issue.
  const listed = e['way_in'] === 'listed' && typeof e['answer']?.['closes_issue'] === 'string' && /^Fixes #\d{1,9}$/.test(e['answer']['closes_issue']);
  const branch = typeof e['answer']?.['branch'] === 'string' && (e['answer']['branch'] === `box-bounty/${id}` || (listed && /^[\w./-]{1,255}$/.test(e['answer']['branch']))) ? e['answer']['branch'] as string : null;
  const base = typeof e['answer']?.['base_commit'] === 'string' && /^[a-f\d]{40}$/.test(e['answer']['base_commit']) ? e['answer']['base_commit'] as string : null;
  const page = typeof e['links']?.['page'] === 'string' && /^https?:\/\/[^\s"]+$/.test(e['links']['page']) ? e['links']['page'] as string : null;
  if (id === null || title === null || reward === null || repository === null || owner === null || branch === null || base === null || page === null || typeof e['pays_on_merge'] !== 'boolean') return null;
  return {
    id, title, reward, paysOnMerge: e['pays_on_merge'], repository, language, owner,
    record: { merged: num(record?.['merged']) ?? 0, recordedPaid: num(record?.['recorded_paid']) ?? 0, confirmedReceived: num(record?.['confirmed_received']) ?? 0, owedNow: num(record?.['owed_now']) ?? 0 },
    decisions: { count: num(decisions?.['count']) ?? 0, medianDays: num(decisions?.['median_days']) },
    solutionsOpen: num(e['solutions']?.['open']) ?? 0, openAllByPoster: e['solutions']?.['open_all_by_poster'] === true,
    attempts: num(e['attempts_in_progress']?.['count']) ?? 0, pullRequests, checks, ageDays: num(e['age_days']) ?? 0, branch, baseCommit: base, page
  };
}

export function discover(options: DiscoverOptions): DiscoverResult {
  const limits = solvingOf();
  if (limits.mode === 'off') throw new BountyRefused('solving-off', 'solving is off — the owner has not allowed your agents to take bounties, so nothing was read; next: ask the owner to run omakase-box config set solving allowed (or ask, to be asked before each one)');
  const board = boardAddress();
  if (board === '') throw new BountyRefused('board-off', 'the board is off in the owner\'s settings, so there is nothing to discover from; nothing was read; next: the owner names it with omakase-box config set board <address>');
  if (options.minReward !== undefined && options.minReward < limits.floor) throw new BountyRefused('below-owner-floor', `--min-reward $${options.minReward} is below the owner's floor of $${limits.floor}, which you cannot loosen; nothing was read or changed; next: give --min-reward ${limits.floor} or more, or leave it out`);
  for (const language of options.languages ?? []) if (!LANGUAGE.test(language)) throw new BountyRefused('language-invalid', `--language ${quoteForeign(language)} is not a language name; nothing was read or changed; next: a name GitHub uses, such as TypeScript`);
  const saved = loadDiscovered();
  const known = saved.value !== null && saved.value.board === board ? saved.value : null;
  const languages = options.anyLanguage === true ? [] : options.languages ?? known?.languages ?? [];
  const minReward = Math.max(limits.floor, options.minReward ?? known?.minReward ?? 0);
  const began: DiscoverResult['began'] = options.from ?? (known === null ? 'start' : 'bookmark');
  const since = began === 'bookmark' ? known!.bookmark : began;
  const query = new URLSearchParams({ since, limit: String(DISCOVER_PAGE) });
  if (minReward > 0) query.set('min_reward', String(minReward));
  if (languages.length === 1) query.set('language', languages[0]!);
  const read = readFeedPage(query.toString());
  if ('failed' in read) throw new BountyRefused('board-unread', `the board could not be read: ${read.failed}; nothing changed and the bookmark stays; next: run omakase-box discover again later`);
  const next = read.page['since_next'];
  const entries = read.page['bounties'];
  if (typeof next !== 'string' || !/^[A-Za-z\d_-]{1,200}$/.test(next) || !Array.isArray(entries)) throw new BountyRefused('board-unread', 'the board\'s answer did not carry a bookmark or a list; nothing changed and the bookmark stays; next: run omakase-box discover again later');
  let unreadable = 0;
  let skipped = 0;
  const bounties: DiscoveredBounty[] = [];
  for (const raw of entries) {
    const entry = entryOf(raw);
    if (entry === null) { unreadable += 1; continue; }
    const languageFits = languages.length === 0 || (entry.language !== null && languages.some(name => name.toLowerCase() === entry.language!.toLowerCase()));
    if (!languageFits || entry.reward < minReward || (limits.paysOnMergeOnly && !entry.paysOnMerge) || limits.skip.includes(entry.repository)) { skipped += 1; continue; }
    bounties.push(entry);
  }
  const resetNote = saved.reset ? 'your discover bookmark was unreadable and started again from every open bounty' : saved.value !== null && saved.value.board !== board ? `the board changed from ${saved.value.board}, so your bookmark started again there` : null;
  return {
    board, mode: limits.mode, limits, filter: { languages, minReward }, bounties, more: entries.length >= DISCOVER_PAGE, skipped, unreadable, began, resetNote, numbers: began === 'bookmark' ? null : readBoardNumbers(),
    save: () => writeToolFile(discoverFile(), `${JSON.stringify({ kind: 'box-discover', board, bookmark: next, languages, minReward, at: new Date().toISOString() }, null, 2)}\n`)
  };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The text view: the tool's lines, and each poster's title inside its own labelled block. */
export function renderDiscover(result: DiscoverResult): string[] {
  const filter = [result.filter.languages.length === 0 ? 'any language' : result.filter.languages.join(' or '), `at least $${result.filter.minReward}`, ...(result.limits.paysOnMergeOnly ? ['pays on merge only'] : []), ...(result.limits.skip.length > 0 ? [`never from ${result.limits.skip.join(', ')}`] : [])].join('; ');
  const lines = [
    `discover: ${plural(result.bounties.length, 'new bounty', 'new bounties')} on ${result.board} ${result.began === 'bookmark' ? 'since your bookmark' : result.began === 'start' ? 'from every open bounty' : 'from now'} — filter: ${filter}`,
    ...(result.resetNote === null ? [] : [result.resetNote]),
    ...(result.numbers === null ? [] : [result.numbers]),
    NOT_RUN
  ];
  if (result.mode === 'ask') lines.push('the owner asked to be asked before each bounty you take.');
  for (const b of result.bounties) {
    const decided = b.decisions.medianDays === null ? 'no decision yet' : `decides in a median ${plural(b.decisions.medianDays, 'day', 'days')} (${b.decisions.count} decided)`;
    lines.push('');
    const checked = (['failing', 'pending', 'passing', 'none'] as const).filter(state => b.checks[state] > 0).map(state => `${b.checks[state]} ${state === 'none' ? 'with no checks' : state}`);
    lines.push(`${b.id} — $${b.reward}, pays on merge: ${b.paysOnMerge ? "yes (the reward is within the owner's approved limit, with a saved card)" : 'no'} · attempts in progress: ${b.attempts}${checked.length === 0 ? '' : ` (GitHub's checks: ${checked.join(', ')})`} · open pull requests: ${b.solutionsOpen}${b.openAllByPoster ? ' (all by the poster)' : ''} · posted ${plural(b.ageDays, 'day', 'days')} ago`);
    lines.push(`  owner ${solverAccount(b.owner)}: ${b.record.merged} merged, ${b.record.recordedPaid} recorded paid, ${b.record.confirmedReceived} confirmed received, ${b.record.owedNow} owed now; ${decided}${b.pullRequests === null ? '' : `; others' pull requests: ${b.pullRequests.merged} merged, ${b.pullRequests.closed} closed without a merge, ${b.pullRequests.open} open`}`);
    lines.push(`  ${b.repository}${b.language === null ? '' : ` (${b.language})`} · answer from ${b.branch} at ${b.baseCommit.slice(0, 12)} · ${b.page}`);
    lines.push(`  ${blockHeader('other account')}`, `  ${solverLine(b.title, 'other account')}`, `  ${blockFooter('other account')}`);
  }
  if (result.skipped > 0) lines.push('', `${plural(result.skipped, 'bounty', 'bounties')} new on the board did not pass your filter or the owner's limits.`);
  if (result.unreadable > 0) lines.push(`${plural(result.unreadable, 'entry', 'entries')} from the board did not read as the board's own shape and were left out.`);
  lines.push('', result.more ? 'more new bounties are waiting; next: omakase-box discover again now' : `bookmark saved; next: ${SCHEDULE}`);
  return lines;
}

/** The --json document (box-bounty/discover@1): the same read, one document, with whose words each stranger's field is. */
export const discoverDocument = (result: DiscoverResult): object => ({
  schema: 'box-bounty/discover@1', board: result.board, solving: { mode: result.mode, floor: result.limits.floor, paysOnMergeOnly: result.limits.paysOnMergeOnly, skip: result.limits.skip },
  filter: result.filter, began: result.began, resetNote: result.resetNote, notRun: NOT_RUN, numbers: result.numbers,
  bounties: result.bounties, skipped: result.skipped, unreadable: result.unreadable, more: result.more,
  next: result.more ? 'omakase-box discover' : SCHEDULE,
  foreignFields: [{ field: 'bounties[].title', source: 'other account' }, { field: 'bounties[].owner', source: 'other account' }]
});
