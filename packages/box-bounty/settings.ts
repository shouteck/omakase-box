import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { gitOutcome } from './git.js';
import { chooseRepository, repositoryAddress, repositoryChoiceLines } from './repository.js';
import type { RemoteCandidate } from './repository.js';

export const SETTINGS_FILE_NAME = 'settings.json';
export const SETTINGS_ENV = 'BOX_BOUNTY_SETTINGS_DIR';
export function settingsDir(): string {
  const override = process.env[SETTINGS_ENV];
  if (override !== undefined && override.trim() !== '') return resolve(override);
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), 'box');
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'box');
}
export const settingsFile = (): string => join(settingsDir(), SETTINGS_FILE_NAME);
// The tool's own memory sits next to the owner's file — the same folder, so
// BOX_BOUNTY_SETTINGS_DIR covers both — because gh keeps config.yml and
// state.yml apart the same way: what the owner chose is never mixed with
// what the tool noted for itself.
export const STATE_FILE_NAME = 'state.json';
export const stateFile = (): string => join(settingsDir(), STATE_FILE_NAME);
export type OwnerDecision = 'allowed' | 'ask' | 'off';
interface Change { readonly bounty: OwnerDecision | null; readonly at: string }
interface MoneyEntry { readonly amount: number; readonly at: string }
export interface SettingsLevel extends Change {
  readonly changes: readonly Change[];
  /** The reward each new bounty posted to this repository states (BT11c):
      whole US dollars, $0 unless the owner named one for this repository.
      Lives on the repository entry — never on the all-projects extra. */
  readonly reward?: MoneyEntry;
  /** The most that may be promised across this repository's open bounties. */
  readonly rewardLimit?: MoneyEntry;
}
interface Migration { readonly path: string; readonly at: string; readonly repository: string | null; readonly detail: string }
interface MergeNotice { readonly commit: string; readonly at: string }
export interface InstructionSettings {
  readonly enabled: boolean;
  readonly file?: string;
}
/** The tool's own per-checkout instruction marks (BT22 correction): which
    "this file lacks the block" notices were already shown — kept as each
    file path's hash — and whether the retired `.box/limits.json` fact was
    said once. These are the tool's memory, never the owner's choice, so
    they live in state.json beside `said`; `enabled` and `file` stay in the
    owner's file. Keyed by the repository's real folder path — the same key
    the owner's `instructions` map uses. */
export interface InstructionNotes {
  readonly notices: readonly string[];
  readonly retired?: boolean;
}
/** The owner's choices — the whole content of settings.json (BT22). Nothing
    here is written by the tool for itself: every field is an answer the
    owner gave or a list the owner set. */
export interface OwnerSettings {
  readonly default?: SettingsLevel;
  readonly repositories: Readonly<Record<string, SettingsLevel>>;
  readonly instructions?: Readonly<Record<string, InstructionSettings>>;
  /** The owner's two publish lists (BT8c), keyed by the repository's real
      folder path — they are about the working files in this checkout, not
      the public repository: `never` paths are kept out of every bounty like
      a never-ship rule; `safe` paths are the ones the pre-publish scan does
      not hold a bounty over. Both live here and never in the project. */
  readonly publishing?: Readonly<Record<string, { readonly never: readonly string[]; readonly safe: readonly string[] }>>;
  /** Owner answers to held merges (BT13), keyed `<repository>#<bounty-id>`.
      They live here, outside every repository, because the bounty record is
      inside it: an approval written on the record could be forged where the
      agent works. Each entry binds the answer to the attempt, its commit
      and the branch tip the owner was shown — a changed solution or moved
      branch no longer matches and is asked again. */
  readonly mergeAnswers?: Record<string, MergeAnswer>;
}
/** The tool's own bookkeeping — the whole content of state.json (BT22).
    Nothing here carries authority: no decision, reward, limit or answer is
    ever read from this file, so a hand-edited one can only make the tool
    forget — and an unreadable one is reset, never refused. */
export interface ToolState {
  /** Standing explanations the tool said once and never repeats (BT17),
      keyed `<repository folder real path or *>#<topic>` — a repository
      scope for facts that apply the first time they are true in one
      project, `*` for facts about the settings themselves. The value is
      the time the line was shown. */
  readonly said?: Readonly<Record<string, string>>;
  /** The reward and limit are per repository since BT11c — they live on each
      `repositories` entry in the owner's file. A file written before then
      carried one shared `reward`/`rewardLimit` for everything; the owner
      never chose them per repository (one was left by a demo run), so on
      first load they are retired into this record — applied to nothing —
      and the tool says so once, recording `toldAt` when the fact was shown. */
  readonly retiredReward?: {
    readonly reward: MoneyEntry | null;
    readonly limit: MoneyEntry | null;
    readonly at: string;
    readonly toldAt?: string;
  };
  /** When the tool once said, in plain words, what a reward is — recorded so
      it is said once ever, at the first amount above 0. */
  readonly rewardPromiseSaid?: string;
  /** When the once-only "a reward can now be set" fact was shown to an owner
      whose settings predate the reward settings — recorded so it is shown
      once ever. */
  readonly rewardNoticeAt?: string;
  /** When the once-only "ask me each time now covers merges" fact was shown
      to an owner carrying an `ask` written before BT13 — recorded so it is
      shown once ever. An `ask` written by this tool is marked at the write:
      the owner saw the merge sentence in the block they answered. */
  readonly askMergeNoticeAt?: string;
  /** First outside merges already told (BT8a), keyed by the receiving
      repository's GitHub address. */
  readonly firstMerges: Readonly<Record<string, MergeNotice>>;
  /** What the one-time legacy `projects` migration did to each old path. */
  readonly migrations: readonly Migration[];
  /** Per-checkout instruction marks — the "file lacks the block" hashes and
      the `.box/limits.json` retirement mark the tool shows once ever. Same
      key shape as the owner's `instructions` map, which keeps only the
      owner's own `enabled`/`file` fields. */
  readonly instructionNotes: Readonly<Record<string, InstructionNotes>>;
  /** Per-checkout shared-memory state (BT32), keyed by the repository's
      real folder path: when the chain fetch last ran, and the last failure
      (kept so "not refreshed" is said once per spell, not per command). */
  readonly chains?: Readonly<Record<string, { readonly fetchedAt?: string; readonly error?: { readonly at: string; readonly reason: string } }>>;
}
/** One recorded owner answer to a held merge (BT13). */
export interface MergeAnswer {
  readonly n: number;
  readonly commit: string;
  readonly head: string;
  readonly at: string;
}
export const projectKey = requireRepository;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The repositories the owner listed — an `allowed` or `ask` entry names a
    repository the owner chose. A denied (`null`) or `off` entry is not on
    the list, and the all-projects extra is never read as choosing between
    remotes (BT16 rules 4 and 6). */
function activeAddresses(settings: OwnerSettings): Set<string> {
  return new Set(Object.entries(settings.repositories).filter(([, entry]) => entry.bounty === 'allowed' || entry.bounty === 'ask').map(([address]) => address));
}

/** This checkout's GitHub repository: the remotes' single candidate, or the
    one candidate on the owner's list. `null` for no remotes and for a
    checkout whose several candidates the list does not settle — that state
    is *unlisted*, not a repository. The remote refusals still propagate:
    github-remote-required, github-remote-mismatch, repository-several-allowed
    and repository-destination-mismatch. */
export function repositoryIdentity(root: string): string | null {
  const choice = chooseRepository(root, activeAddresses(loadSettings()));
  return choice?.kind === 'one' ? choice.address : null;
}

/** The checkout's repository or the named refusal — no GitHub remote at all
    is repository-address-required; several candidates with none on the list
    is repository-choice-needed carrying the candidate lines. */
export function requireRepository(root: string): string {
  const choice = chooseRepository(root, activeAddresses(loadSettings()));
  if (choice === null) throw new BountyRefused('repository-address-required', 'this repository has no GitHub address, so it cannot be listed; next: add a GitHub remote, then run box bounty allow');
  if (choice.kind === 'unlisted') throw new BountyRefused('repository-choice-needed', `this checkout's remotes name several GitHub repositories; tell me which one it is — nothing was posted and nothing changed:\n${repositoryChoiceLines(choice.candidates).join('\n')}
next: the owner names one with box bounty allow <owner/name>`);
  return choice.address;
}

/** The several candidates when this checkout's remotes cannot be settled by
    the owner's list — null otherwise and on any remote refusal, which the
    gate itself names. The wait lines and nothing else need this view. */
export function unlistedRemotes(repoRoot: string): readonly RemoteCandidate[] | null {
  try {
    const choice = chooseRepository(repoRoot, activeAddresses(loadSettings()));
    return choice?.kind === 'unlisted' ? choice.candidates : null;
  } catch {
    return null;
  }
}

/** Rule 8's one line — built once here so the five commands share the
    wording. Only a checkout whose several GitHub candidates the owner's
    list settles earns it: with nothing on the list no remote can be the
    chosen one, so no Git read runs. With one candidate nothing new prints. */
export function actingOn(repoRoot: string): string | null {
  const listed = activeAddresses(loadSettings());
  if (listed.size === 0) return null;
  try {
    const choice = chooseRepository(repoRoot, listed);
    if (choice === null || choice.kind !== 'one' || choice.candidates.length < 2) return null;
    return `acting on ${choice.address} (${choice.candidates.length} GitHub remotes; the one on your list)`;
  } catch {
    return null;
  }
}
const decision = (value: unknown): value is OwnerDecision | null => value === null || value === 'allowed' || value === 'ask' || value === 'off';
const HARD_STOP_WORDS = ['nevership', 'private', 'secret', 'scan', 'hardstop', 'credential'];
export function unknownSetting(name: string): never {
  const folded = name.toLowerCase().replace(/[-_]/g, '');
  const hard = HARD_STOP_WORDS.some(word => folded.includes(word));
  throw new BountyRefused(hard ? 'settings-hard-stop' : 'settings-unknown-name', `${settingsFile()}: "${name}" ${hard ? 'tries to reach a hard stop; hard stops cannot be changed' : 'is not a setting the tool knows; known settings: all-projects, repositories, instructions, instruction-file, reward, reward-limit, paid'}. Nothing changed; next: name a known setting — a hard stop cannot be changed`);
}
const bad = (detail: string): never => { throw new BountyRefused('settings-malformed', `${settingsFile()}: ${detail}; next: fix the settings file or remove it`); };
function change(value: unknown, where: string): Change {
  if (!isObject(value) || !decision(value['bounty']) || typeof value['at'] !== 'string') return bad(`${where} must hold {bounty, at}, with bounty allowed, ask, off or null`);
  for (const name of Object.keys(value)) if (!['bounty', 'at'].includes(name)) unknownSetting(name);
  return { bounty: value['bounty'], at: value['at'] };
}
function level(value: unknown, where: string): SettingsLevel {
  if (!isObject(value)) return bad(`${where} must hold an object`);
  for (const name of Object.keys(value)) if (!['bounty', 'at', 'changes', 'reward', 'rewardLimit'].includes(name)) unknownSetting(name);
  const current = change({ bounty: value['bounty'], at: value['at'] }, where);
  const raw = value['changes'];
  if (raw !== undefined && !Array.isArray(raw)) return bad(`${where}.changes must hold a list`);
  return {
    ...current,
    changes: raw === undefined ? [] : raw.map(entry => change(entry, `${where}.changes`)),
    ...(value['reward'] === undefined ? {} : { reward: moneySetting(value['reward'], `${where}.reward`) }),
    ...(value['rewardLimit'] === undefined ? {} : { rewardLimit: moneySetting(value['rewardLimit'], `${where}.rewardLimit`) })
  };
}
// Both files land whole or not at all (BT22): the new content is written
// beside the target under this process's own name, then renamed over it in
// one move, so a crash mid-write leaves the previous complete file, never a
// torn one — and a stale `<file>.<pid>.tmp` is just litter the next write
// replaces. On Windows the rename can fail while another process holds the
// target open, so it is retried for about a second; past that the write is
// refused by name rather than gambled on.
const WRITE_RENAME_MS = 1_000;
function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, text, 'utf8');
  const giveUp = Date.now() + WRITE_RENAME_MS;
  for (;;) {
    try {
      renameSync(temp, path);
      return;
    } catch (error) {
      if (Date.now() >= giveUp) {
        try { rmSync(temp, { force: true }); } catch { /* litter over a wrong claim */ }
        throw new BountyRefused('settings-write-failed', `${path}: the file could not be replaced (${error instanceof Error ? error.message : String(error)}); the previous file stands, nothing was lost; next: fix what blocked the write, then rerun the same command`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

// The one write path to the owner's file — reached only when the owner
// changed something: `allow`, `deny`, `config set`/`add`/`remove`, the merge
// answers `allow <id>` records and `apply` releases, and the two one-time
// migrations on load (legacy `projects`, and the bookkeeping keys moving to
// state.json). A read command never reaches it. Exported for the publish
// lists, which are validated in never-ship.ts before they land here.
function persist(settings: OwnerSettings): void {
  writeAtomic(settingsFile(), `${JSON.stringify({ kind: 'box-owner-settings', ...settings }, null, 2)}\n`);
}
export const saveSettings = persist;

/** The write path for the tool's own file — any command may land here; the
    owner's file is untouched by bookkeeping. */
export function saveState(state: ToolState): void {
  writeAtomic(stateFile(), `${JSON.stringify({ kind: 'box-tool-state', ...state }, null, 2)}\n`);
}

// ---- the tool's own state ---------------------------------------------------

/** The keys a settings file once carried for the tool — still accepted there
    so the first load can move them out; never written back (BT22). */
const STATE_KEYS = ['said', 'rewardPromiseSaid', 'rewardNoticeAt', 'askMergeNoticeAt', 'firstMerges', 'migrations', 'retiredReward', 'chains'] as const;

// The moved fields read the same in either file — `refuse` and `unknownName`
// are the file's own verdicts: settings-malformed/-unknown-name for the
// owner's file, an unreadable reset for the tool's own.
function movedState(parsed: Record<string, unknown>, refuse: (detail: string) => never, unknownName: (name: string) => never): ToolState {
  const migrations: Migration[] = [];
  const rawMigrations = parsed['migrations'];
  if (rawMigrations !== undefined) {
    if (!Array.isArray(rawMigrations)) return refuse('migrations must hold a list');
    for (const entry of rawMigrations) {
      if (!isObject(entry) || typeof entry['path'] !== 'string' || typeof entry['at'] !== 'string' || typeof entry['detail'] !== 'string' || !(entry['repository'] === null || typeof entry['repository'] === 'string')) return refuse('a migration notice is unreadable');
      migrations.push({ path: entry['path'], at: entry['at'], repository: entry['repository'], detail: entry['detail'] });
    }
  }
  const firstMerges: Record<string, MergeNotice> = {};
  const rawMerges = parsed['firstMerges'];
  if (rawMerges !== undefined) {
    if (!isObject(rawMerges)) return refuse('firstMerges must hold an object');
    for (const [key, entry] of Object.entries(rawMerges)) {
      const address = repositoryAddress(key);
      if (address === null || !isObject(entry) || typeof entry['commit'] !== 'string' || !/^[a-f\d]{40,64}$/.test(entry['commit']) || typeof entry['at'] !== 'string') return refuse('a first merge notice is unreadable');
      firstMerges[address] = { commit: entry['commit'], at: entry['at'] };
    }
  }
  const instructionNotes: Record<string, InstructionNotes> = {};
  const rawNotes = parsed['instructionNotes'];
  if (rawNotes !== undefined) {
    if (!isObject(rawNotes)) return refuse('instructionNotes must hold an object keyed by repository folder');
    for (const [key, entry] of Object.entries(rawNotes)) {
      if (!isAbsolute(key) || !isObject(entry) || !Array.isArray(entry['notices']) || entry['notices'].some(item => typeof item !== 'string') || !(entry['retired'] === undefined || typeof entry['retired'] === 'boolean')) return refuse('an instruction notes entry is unreadable');
      for (const name of Object.keys(entry)) if (!['notices', 'retired'].includes(name)) unknownName(name);
      instructionNotes[key] = { notices: entry['notices'], ...(entry['retired'] === undefined ? {} : { retired: entry['retired'] }) };
    }
  }
  let retiredReward: ToolState['retiredReward'];
  const rawRetired = parsed['retiredReward'];
  if (rawRetired !== undefined) {
    if (!isObject(rawRetired) || typeof rawRetired['at'] !== 'string' || !(rawRetired['toldAt'] === undefined || typeof rawRetired['toldAt'] === 'string')
      || !(rawRetired['reward'] === null || rawRetired['reward'] === undefined || isObject(rawRetired['reward']))
      || !(rawRetired['limit'] === null || rawRetired['limit'] === undefined || isObject(rawRetired['limit']))) return refuse('a retired reward record is unreadable');
    for (const name of Object.keys(rawRetired)) if (!['reward', 'limit', 'at', 'toldAt'].includes(name)) unknownName(name);
    retiredReward = {
      reward: rawRetired['reward'] === null || rawRetired['reward'] === undefined ? null : moneySetting(rawRetired['reward'], 'retiredReward.reward', refuse, unknownName),
      limit: rawRetired['limit'] === null || rawRetired['limit'] === undefined ? null : moneySetting(rawRetired['limit'], 'retiredReward.limit', refuse, unknownName),
      at: rawRetired['at'],
      ...(typeof rawRetired['toldAt'] === 'string' ? { toldAt: rawRetired['toldAt'] } : {})
    };
  }
  const chains: Record<string, { readonly fetchedAt?: string; readonly error?: { readonly at: string; readonly reason: string } }> = {};
  const rawChains = parsed['chains'];
  if (rawChains !== undefined) {
    if (!isObject(rawChains)) return refuse('chains must hold an object keyed by repository folder');
    for (const [key, entry] of Object.entries(rawChains)) {
      if (!isObject(entry)
        || !(entry['fetchedAt'] === undefined || typeof entry['fetchedAt'] === 'string')
        || !(entry['error'] === undefined || isObject(entry['error']) && typeof entry['error']['at'] === 'string' && typeof entry['error']['reason'] === 'string')) return refuse('a chains entry is unreadable');
      chains[key] = {
        ...(typeof entry['fetchedAt'] === 'string' ? { fetchedAt: entry['fetchedAt'] } : {}),
        ...(isObject(entry['error']) ? { error: { at: entry['error']['at'] as string, reason: entry['error']['reason'] as string } } : {})
      };
    }
  }
  return {
    ...(parsed['said'] === undefined ? {} : { said: saidMap(parsed['said'], refuse) }),
    ...(retiredReward === undefined ? {} : { retiredReward }),
    ...(typeof parsed['rewardPromiseSaid'] === 'string' ? { rewardPromiseSaid: parsed['rewardPromiseSaid'] } : {}),
    ...(typeof parsed['rewardNoticeAt'] === 'string' ? { rewardNoticeAt: parsed['rewardNoticeAt'] } : {}),
    ...(typeof parsed['askMergeNoticeAt'] === 'string' ? { askMergeNoticeAt: parsed['askMergeNoticeAt'] } : {}),
    firstMerges,
    migrations,
    instructionNotes,
    ...(Object.keys(chains).length > 0 ? { chains } : {})
  };
}

/** Fold records moved out of an old settings file into the tool's state —
    the state's own entries win every clash: a said-once mark, a notice's
    time, a first-merge commit. */
function mergeState(state: ToolState, moved: ToolState): ToolState {
  const scalar = <K extends 'retiredReward' | 'rewardPromiseSaid' | 'rewardNoticeAt' | 'askMergeNoticeAt'>(key: K): Pick<ToolState, K> | Record<never, never> => {
    const value = state[key] ?? moved[key];
    return value === undefined ? {} : { [key]: value } as Pick<ToolState, K>;
  };
  return {
    ...(moved.said !== undefined || state.said !== undefined ? { said: { ...moved.said, ...state.said } } : {}),
    ...scalar('retiredReward'),
    ...scalar('rewardPromiseSaid'),
    ...scalar('rewardNoticeAt'),
    ...scalar('askMergeNoticeAt'),
    firstMerges: { ...moved.firstMerges, ...state.firstMerges },
    migrations: [...moved.migrations, ...state.migrations],
    instructionNotes: { ...moved.instructionNotes, ...state.instructionNotes },
    ...(moved.chains !== undefined || state.chains !== undefined ? { chains: { ...moved.chains, ...state.chains } } : {})
  };
}

// The state file is the tool's own, so a bad shape is never the owner's
// problem: one line says it was reset, the run continues with an empty
// state, and the file is rewritten — an explanation may then be said once
// more, but nothing the owner decided was ever kept here to lose. Anything
// the tool does not write — a wrong kind, an unknown key, a bad value — is
// unreadable; the file is never read for authority, so a hand edit can only
// make the tool forget.
class StateUnreadable { constructor(readonly detail: string) {} }
export function loadState(): ToolState {
  const path = stateFile();
  if (!existsSync(path)) return { firstMerges: {}, migrations: [], instructionNotes: {} };
  const unreadable = (detail: string): never => { throw new StateUnreadable(detail); };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isObject(parsed)) return unreadable('must hold a JSON object');
    for (const name of Object.keys(parsed)) if (!['kind', ...STATE_KEYS, 'instructionNotes'].includes(name)) unreadable(`"${name}" is not something the tool writes to its state`);
    if (parsed['kind'] !== undefined && parsed['kind'] !== 'box-tool-state') return unreadable('kind must be box-tool-state');
    return movedState(parsed, unreadable, name => unreadable(`"${name}" is not something the tool writes to its state`));
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof StateUnreadable)) throw error;
    console.error(`the tool's own state at ${path} was unreadable and was reset`);
    const empty: ToolState = { firstMerges: {}, migrations: [], instructionNotes: {} };
    try { saveState(empty); } catch { /* the reset could not be written — the next read tries again */ }
    return empty;
  }
}

/** A money setting holds {amount, at}: a whole US-dollar amount at or above
    0 and the time the tool wrote it. A hand-written or malformed entry fails
    loudly — the tool never guesses what the file means; an unknown key inside
    it is named like every other unknown setting. */
function moneySetting(value: unknown, where: string, refuse: (detail: string) => never = bad, unknownName: (name: string) => never = unknownSetting): { readonly amount: number; readonly at: string } {
  if (!isObject(value)) return refuse(`${where} must hold {amount, at} — a whole dollar amount at or above 0`);
  for (const name of Object.keys(value)) if (!['amount', 'at'].includes(name)) unknownName(name);
  const amount = value['amount'];
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0 || typeof value['at'] !== 'string') return refuse(`${where} must hold a whole dollar amount at or above 0 with its written time`);
  return { amount, at: value['at'] };
}

// Consume legacy paths once. Unresolved paths grant nothing under a blanket
// default, and conflicting copies require a fresh repository decision.
export function loadSettings(): OwnerSettings {
  const path = settingsFile();
  if (!existsSync(path)) return { repositories: {} };
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { return bad('not readable JSON'); }
  if (!isObject(parsed)) return bad('must hold a JSON object');
  for (const name of Object.keys(parsed)) if (!['kind', 'default', 'projects', 'repositories', 'migrations', 'firstMerges', 'instructions', 'publishing', 'reward', 'rewardLimit', 'retiredReward', 'rewardPromiseSaid', 'rewardNoticeAt', 'askMergeNoticeAt', 'mergeAnswers', 'said'].includes(name)) unknownSetting(name);
  if (parsed['kind'] !== undefined && parsed['kind'] !== 'box-owner-settings') return bad('kind must be box-owner-settings');
  const repositories: Record<string, SettingsLevel> = {};
  const rawRepositories = parsed['repositories'];
  if (rawRepositories !== undefined) {
    if (!isObject(rawRepositories)) return bad('repositories must hold an object keyed by GitHub address');
    for (const [key, value] of Object.entries(rawRepositories)) {
      const address = repositoryAddress(key);
      if (address === null) return bad(`repositories key ${JSON.stringify(key)} is not a GitHub address`);
      if (repositories[address] !== undefined) return bad(`duplicate repository address ${address}`);
      repositories[address] = level(value, `repositories[${JSON.stringify(key)}]`);
    }
  }
  const fallback = parsed['default'];
  const instructions: Record<string, InstructionSettings> = {};
  // `notices`/`retired` inside an instruction entry were the tool's own
  // once-only marks written into the owner's file before the state split —
  // still accepted so the first load can move them out; never written back.
  const movedInstructionNotes: Record<string, InstructionNotes> = {};
  const rawInstructions = parsed['instructions'];
  if (rawInstructions !== undefined) {
    if (!isObject(rawInstructions)) return bad('instructions must hold an object keyed by repository folder');
    for (const [key, value] of Object.entries(rawInstructions)) {
      if (!isAbsolute(key) || !isObject(value) || typeof value['enabled'] !== 'boolean' || !(value['file'] === undefined || typeof value['file'] === 'string')
        || !(value['notices'] === undefined || (Array.isArray(value['notices']) && !value['notices'].some(entry => typeof entry !== 'string')))
        || !(value['retired'] === undefined || typeof value['retired'] === 'boolean')) return bad('an instruction maintenance choice is unreadable');
      for (const name of Object.keys(value)) if (!['enabled', 'file', 'notices', 'retired'].includes(name)) unknownSetting(name);
      instructions[key] = { enabled: value['enabled'], ...(value['file'] === undefined ? {} : { file: value['file'] }) };
      if (value['notices'] !== undefined || value['retired'] !== undefined) {
        const notes = value['notices'] === undefined ? [] : value['notices'] as readonly string[];
        movedInstructionNotes[key] = { notices: notes, ...(value['retired'] === undefined ? {} : { retired: value['retired'] as boolean }) };
      }
    }
  }
  const publishing: Record<string, { readonly never: readonly string[]; readonly safe: readonly string[] }> = {};
  const rawPublishing = parsed['publishing'];
  if (rawPublishing !== undefined) {
    if (!isObject(rawPublishing)) return bad('publishing must hold an object keyed by repository folder');
    for (const [key, value] of Object.entries(rawPublishing)) {
      if (!isAbsolute(key) || !isObject(value)) return bad('a publishing entry is unreadable');
      for (const name of Object.keys(value)) if (!['never', 'safe'].includes(name)) unknownSetting(name);
      const lists = (list: unknown): string[] => {
        if (!Array.isArray(list) || list.some(entry => typeof entry !== 'string')) return bad('a publishing entry list is unreadable');
        return list;
      };
      publishing[key] = { never: lists(value['never'] ?? []), safe: lists(value['safe'] ?? []) };
    }
  }
  // The all-projects extra never carries a reward: money is promised only
  // for a repository the owner named (BT11c). A hand-written file that puts
  // one there fails loudly like every other wrong shape.
  const defaultLevel = fallback === undefined ? undefined : level(fallback, 'default');
  if (defaultLevel !== undefined && (defaultLevel.reward !== undefined || defaultLevel.rewardLimit !== undefined)) return bad('default cannot hold a reward or a limit — money belongs to a named repository');
  // What the tool once wrote into the owner's file is still read — and a
  // bad shape still fails loudly — but it is never the owner's again: the
  // first load that finds a moved key folds it into state.json (the state's
  // own entries win every clash) and rewrites this file without it. That
  // fold happens once; afterwards this file changes only on the owner's own
  // commands.
  let moved = movedState(parsed, bad, unknownSetting);
  if (Object.keys(movedInstructionNotes).length > 0) moved = { ...moved, instructionNotes: { ...moved.instructionNotes, ...movedInstructionNotes } };
  // A retired shared reward is kept so the once-only fact can say what it
  // was, but it is applied to no repository ever again. The shared
  // reward/limit a pre-BT11c file carried apply to nothing: the owner never
  // chose them per repository, so they retire into the record the once-only
  // fact reports — they are never read as a setting again. Open bounties
  // keep the amount they were posted with; that lives on records.
  const retiring = parsed['reward'] !== undefined || parsed['rewardLimit'] !== undefined;
  if (retiring) {
    if (moved.retiredReward !== undefined) return bad('the settings file holds both a shared reward and a retired one');
    moved = {
      ...moved,
      retiredReward: {
        reward: parsed['reward'] === undefined ? null : moneySetting(parsed['reward'], 'reward'),
        limit: parsed['rewardLimit'] === undefined ? null : moneySetting(parsed['rewardLimit'], 'rewardLimit'),
        at: new Date().toISOString()
      }
    };
  }
  const mergeAnswers: Record<string, MergeAnswer> = {};
  const rawAnswers = parsed['mergeAnswers'];
  if (rawAnswers !== undefined) {
    if (!isObject(rawAnswers)) return bad('mergeAnswers must hold an object');
    for (const [key, entry] of Object.entries(rawAnswers)) {
      if (!isObject(entry) || !Number.isSafeInteger(entry['n']) || (entry['n'] as number) < 1
        || typeof entry['commit'] !== 'string' || !/^[a-f\d]{40}$/.test(entry['commit'])
        || typeof entry['head'] !== 'string' || !/^[a-f\d]{40}$/.test(entry['head'])
        || typeof entry['at'] !== 'string') return bad(`mergeAnswers[${JSON.stringify(key)}] is unreadable`);
      mergeAnswers[key] = { n: entry['n'] as number, commit: entry['commit'], head: entry['head'], at: entry['at'] };
    }
  }
  const settings: OwnerSettings = { ...(defaultLevel !== undefined ? { default: defaultLevel } : {}), repositories, ...(rawInstructions === undefined ? {} : { instructions }), ...(rawPublishing === undefined ? {} : { publishing }), ...(Object.keys(mergeAnswers).length === 0 ? {} : { mergeAnswers }) };
  const legacy = parsed['projects'];
  if (legacy !== undefined && !isObject(legacy)) return bad('projects must hold an object keyed by legacy folder path');
  const carried = STATE_KEYS.some(key => parsed[key] !== undefined) || Object.keys(movedInstructionNotes).length > 0;
  if (legacy === undefined) {
    // State first: if the owner's rewrite then fails, the moved keys still
    // stand in this file and the fold-in runs again — and the state's own
    // entries already win every clash.
    if (carried || retiring) { saveState(mergeState(loadState(), moved)); persist(settings); }
    return settings;
  }
  const entries = Object.entries(legacy).map(([key, value]) => ({ key, entry: level(value, `projects[${JSON.stringify(key)}]`) }));
  const at = new Date().toISOString();
  const notices: Migration[] = [];
  for (const { key, entry } of entries) {
    let address: string | null = null;
    try {
      if (isAbsolute(key) && existsSync(key)) {
        const top = gitOutcome(key, ['rev-parse', '--show-toplevel']);
        if (top.status === 0 && realpathSync(key).toLowerCase() === realpathSync(top.stdout.trim()).toLowerCase()) {
          // Never repositoryIdentity — it would recurse into loadSettings.
          // An empty list means only a single candidate resolves, so a
          // two-remote checkout keeps today's rule: no permission moved.
          const choice = chooseRepository(key, new Set());
          address = choice?.kind === 'one' ? choice.address : null;
        }
      }
    } catch { /* no safe identity */ }
    if (address === null) {
      notices.push({ path: key, repository: null, at, detail: 'could not read exactly one GitHub address; no permission moved. Re-add with box bounty allow <owner/name>' });
      continue;
    }
    const previous = repositories[address];
    if (previous !== undefined && previous.bounty !== entry.bounty) {
      repositories[address] = { bounty: null, at, changes: [...previous.changes, { bounty: previous.bounty, at: previous.at }, ...entry.changes, { bounty: entry.bounty, at: entry.at }] };
      notices.push({ path: key, repository: address, at, detail: `conflicting old decisions; not allowed. Re-add with box bounty allow ${address}` });
    } else if (previous === undefined) repositories[address] = entry;
    else repositories[address] = { ...previous, changes: [...previous.changes, ...entry.changes, { bounty: entry.bounty, at: entry.at }] };
    if (!notices.some(notice => notice.path === key)) notices.push({ path: key, repository: address, at, detail: `moved to ${address}` });
  }
  saveState(mergeState(loadState(), { ...moved, migrations: [...moved.migrations, ...notices] }));
  persist(settings);
  return settings;
}

/** The reward each new bounty posted to one repository will state and the
    most that may be promised across its open bounties (BT11c) — read from
    that repository's own entry, the owner's settings, never the agent's. A
    repository with no entry — one allowed only through the all-projects
    extra — states $0: money is promised only for a repository the owner
    named, and a null address (no GitHub remote) can never be listed. */
export function readReward(address: string | null): { readonly amount: number; readonly limit: number | null } {
  const entry = address === null ? undefined : loadSettings().repositories[address];
  return { amount: entry?.reward?.amount ?? 0, limit: entry?.rewardLimit?.amount ?? null };
}

/** The reward read for a checkout: resolves this repository's address and
    reads its own entry. A repository whose remotes cannot name one GitHub
    address cannot be listed, so it states $0 like one the owner never
    listed — read paths never fail on a remote problem; `allow` and the post
    gate are where identity refusals are named. An empty list answers $0
    without resolving the address at all — the same early read `readDecision`
    makes, so this adds no Git work to a command that had none. */
export function repoReward(repoRoot: string): { readonly amount: number; readonly limit: number | null } {
  const settings = loadSettings();
  if (Object.keys(settings.repositories).length === 0) return { amount: 0, limit: null };
  let address: string | null = null;
  try { address = repositoryIdentity(repoRoot); } catch { /* an unlistable repository states $0 */ }
  const entry = address === null ? undefined : settings.repositories[address];
  return { amount: entry?.reward?.amount ?? 0, limit: entry?.rewardLimit?.amount ?? null };
}

/** The once-only facts about rewards owed to an owner whose settings predate
    them. First: a shared reward/limit written before BT11c was retired on
    load — it applies to nothing now, and the tool says once what it was and
    how to set a repository's own. Then the older BT11a shape: decisions but
    no reward anywhere — the tool says once that each repository can state
    its own. Returns the line the first time it applies and persists that it
    was shown — told once ever, and a fresh settings file (no decisions
    written yet) is not told at all: first use already carries the fact. */
export function rewardNoticeLine(): string | null {
  // Settings first — its load runs any pending move-out, so the state read
  // below already holds what an old file carried.
  const settings = loadSettings();
  const state = loadState();
  const at = new Date().toISOString();
  if (state.retiredReward !== undefined) {
    if (state.retiredReward.toldAt !== undefined) return null;
    const retired = state.retiredReward;
    saveState({ ...state, retiredReward: { ...retired, toldAt: at } });
    const was = retired.reward === null && retired.limit === null ? 'a shared reward entry without readable amounts' : `a shared reward of $${retired.reward?.amount ?? 0}${retired.limit === null ? '' : ` and a $${retired.limit.amount} limit`}`;
    return `one fact about money: ${was} applied to every repository — it applies to nothing now. Each repository states $0 until you set its own: box bounty config set reward <whole dollars> [owner/name]. Open bounties keep the amount they were posted with (noted ${at})`;
  }
  if (state.rewardNoticeAt !== undefined) return null;
  if (settings.default === undefined && Object.keys(settings.repositories).length === 0) return null;
  saveState({ ...state, rewardNoticeAt: at });
  return `each repository can state its own reward — the owner sets it inside its checkout or by name: box bounty config set reward <whole dollars> [owner/name]. Until then every bounty states $0 (noted ${at})`;
}

/** The once-only fact owed to an owner carrying an `ask` written before
    BT13: "ask me each time" now covers merges too. A pre-wave `ask` kept its
    meaning and then some — the owner is told once that it also asks before
    each merge. An `ask` the tool wrote already carried the merge sentence,
    so the write itself marks the fact told. */
export function askMergeNoticeLine(): string | null {
  const settings = loadSettings();
  const state = loadState();
  if (state.askMergeNoticeAt !== undefined) return null;
  const asks = settings.default?.bounty === 'ask' || Object.values(settings.repositories).some(entry => entry.bounty === 'ask');
  if (!asks) return null;
  const at = new Date().toISOString();
  saveState({ ...state, askMergeNoticeAt: at });
  return `one fact about ask me each time: it now covers merges too — the owner is asked before each post and before each merge (noted ${at})`;
}

/** The `said` map is the tool's own record of standing explanations already
    shown — a malformed entry fails loudly in the owner's file like every
    other wrong shape, and resets the tool's own. */
function saidMap(value: unknown, refuse: (detail: string) => never = bad): Record<string, string> {
  if (!isObject(value)) return refuse('said must hold an object of topic keys to times');
  const out: Record<string, string> = {};
  for (const [key, at] of Object.entries(value)) {
    if (typeof at !== 'string') return refuse('a said entry is unreadable');
    out[key] = at;
  }
  return out;
}

const saidKey = (repoRoot: string | null, topic: string): string =>
  `${repoRoot === null ? '*' : realpathSync(repoRoot)}#${topic}`;

/** Read without recording — for a caller that must emit the explanation
    before the record may be written (the allow disclosure prints while
    authority is still unchanged, so its "said" record waits until after the
    decision write — BT8a's order guard). */
export function saidAlready(repoRoot: string | null, topic: string): boolean {
  loadSettings(); // its load runs any pending move-out, so the mark is read from state
  return loadState().said?.[saidKey(repoRoot, topic)] !== undefined;
}

/** Record that a standing explanation was said. */
export function markSaid(repoRoot: string | null, topic: string): void {
  const key = saidKey(repoRoot, topic);
  loadSettings(); // move-out first, as in saidAlready
  const state = loadState();
  if (state.said?.[key] !== undefined) return;
  saveState({ ...state, said: { ...state.said, [key]: new Date().toISOString() } });
}

/** Say a standing explanation exactly once — the first time it applies —
    and record that it was said so it is never repeated (BT17). `repoRoot`
    scopes the fact to one repository; `null` is the once-ever scope for a
    fact about the settings themselves. Returns true when the caller should
    print its line. */
export function saidOnce(repoRoot: string | null, topic: string): boolean {
  if (saidAlready(repoRoot, topic)) return false;
  markSaid(repoRoot, topic);
  return true;
}

// The key a merge answer is recorded under — the repository's GitHub
// address when it has one, the checkout path when it does not, so one
// bounty id cannot borrow an answer across repositories.
const mergeAnswerKey = (repoRoot: string, id: string): string => {
  let address: string | null = null;
  try { address = repositoryIdentity(repoRoot); } catch { /* an unlistable repository keys on its path */ }
  return `${address ?? repoRoot}#${id}`;
};

/** The recorded owner answer to this bounty's held merge — null when none
    stands. `allow <id>` writes it after re-checking what the owner was
    shown; a matching apply carries it; a drifted one simply never matches. */
export function readMergeAnswer(repoRoot: string, id: string): MergeAnswer | null {
  return loadSettings().mergeAnswers?.[mergeAnswerKey(repoRoot, id)] ?? null;
}
export function writeMergeAnswer(repoRoot: string, id: string, bound: { readonly n: number; readonly commit: string; readonly head: string }): void {
  const settings = loadSettings();
  persist({ ...settings, mergeAnswers: { ...settings.mergeAnswers, [mergeAnswerKey(repoRoot, id)]: { ...bound, at: new Date().toISOString() } } });
}
export function dropMergeAnswer(repoRoot: string, id: string): void {
  const settings = loadSettings();
  const key = mergeAnswerKey(repoRoot, id);
  if (settings.mergeAnswers?.[key] === undefined) return;
  const rest = { ...settings.mergeAnswers };
  delete rest[key];
  persist({ ...settings, mergeAnswers: rest });
}

export interface DecisionRead {
  readonly decision: OwnerDecision | null;
  readonly level: 'project' | 'default' | null;
  readonly at: string | null;
  readonly denied?: boolean;
}
export function readDecision(repoRoot: string): DecisionRead {
  const settings = loadSettings();
  const migrations = loadState().migrations;
  if (Object.keys(settings.repositories).length === 0 && migrations.length === 0) {
    if (settings.default === undefined) return { decision: null, level: null, at: null };
    // The all-projects extra never chooses between remotes (BT16 rule 6): a
    // checkout whose several GitHub candidates are not on the list stays
    // undecided here. The remote read runs only on this branch, so a
    // command that started no Git process before still starts none; a read
    // that cannot settle keeps the default and the gate names the refusal.
    let unlisted = false;
    try { unlisted = chooseRepository(repoRoot, activeAddresses(settings))?.kind === 'unlisted'; }
    catch { /* remotes that cannot name a GitHub repository keep the default */ }
    return unlisted ? { decision: null, level: null, at: null } : { decision: settings.default.bounty, level: 'default', at: settings.default.at };
  }
  const choice = chooseRepository(repoRoot, activeAddresses(settings));
  if (choice?.kind === 'unlisted') return { decision: null, level: null, at: null };
  const key = choice?.kind === 'one' ? choice.address : null;
  const entry = key === null ? undefined : settings.repositories[key];
  if (entry !== undefined) return { decision: entry.bounty, level: 'project', at: entry.at, ...(entry.bounty === null ? { denied: true } : {}) };
  if (migrations.some(notice => notice.repository === null && resolve(notice.path).toLowerCase() === resolve(repoRoot).toLowerCase())) return { decision: null, level: null, at: null };
  if (settings.default !== undefined) return { decision: settings.default.bounty, level: 'default', at: settings.default.at };
  return { decision: null, level: null, at: null };
}
export function writeRepository(address: string, bounty: OwnerDecision | null, beforeWrite?: () => void, money?: { readonly reward: number; readonly rewardLimit: number | null }): { path: string; at: string; key: string } {
  const key = repositoryAddress(address);
  if (key === null) throw new BountyRefused('repository-address-invalid', `${address} is not a repository address. Nothing changed; next: pass an owner/name repository address`);
  const settings = loadSettings();
  const previous = settings.repositories[key];
  if (bounty === null && (previous === undefined || previous.bounty === null || previous.bounty === 'off')) throw new BountyRefused('repository-not-listed', `${key} is not listed; nothing changed; next: the owner lists it first with box bounty allow ${key}`);
  const at = new Date().toISOString();
  const changes = [...(previous?.changes ?? []), ...(previous === undefined ? [] : [{ bounty: previous.bounty, at: previous.at }])];
  // Money lives on this entry alone. `deny` clears it — a re-allowed
  // repository states $0 until the owner names an amount again — while a
  // bare `allow` keeps what the entry already said, and an `allow` that
  // names amounts replaces them.
  const moneyFields = bounty === null || bounty === 'off' ? {}
    : money !== undefined ? {
      reward: { amount: money.reward, at: money.reward === previous?.reward?.amount ? previous.reward!.at : at },
      ...(money.rewardLimit === null ? {} : { rewardLimit: { amount: money.rewardLimit, at: money.rewardLimit === previous?.rewardLimit?.amount ? previous.rewardLimit!.at : at } })
    }
    : { ...(previous?.reward === undefined ? {} : { reward: previous.reward }), ...(previous?.rewardLimit === undefined ? {} : { rewardLimit: previous.rewardLimit }) };
  const entry: SettingsLevel = { bounty, at, changes, ...moneyFields };
  beforeWrite?.();
  // An `ask` written through the tool was answered under wording that said
  // it covers merges — the once-only fact is already told (BT13). The mark
  // is the tool's own record: it lands in the state file before the
  // decision does, so a refused settings write cannot leave a told-mark
  // with no `ask` it marks.
  if (bounty === 'ask') {
    const state = loadState();
    if (state.askMergeNoticeAt === undefined) saveState({ ...state, askMergeNoticeAt: at });
  }
  persist({ ...settings, repositories: { ...settings.repositories, [key]: entry } });
  return { path: settingsFile(), at, key };
}

/** Write the reward or the limit on one repository entry — the entry must
    already be on the owner's list as allowed or ask: money is promised only
    for a repository the owner named (BT11c). The pair rules — a reward above
    $0 needs a limit at or above it, a limit never sits below the reward —
    are the caller's to check, so the refusal can name which side failed. */
export function writeMoney(address: string, patch: { readonly reward?: number; readonly rewardLimit?: number }): { readonly at: string; readonly key: string; readonly entry: SettingsLevel } {
  const key = repositoryAddress(address);
  if (key === null) throw new BountyRefused('repository-address-invalid', `${address} is not a repository address. Nothing changed; next: pass an owner/name repository address`);
  const settings = loadSettings();
  const previous = settings.repositories[key];
  if (previous === undefined || previous.bounty === null || previous.bounty === 'off') throw new BountyRefused('reward-repository-unlisted', `${key} is not on the owner's list — money is promised only for a repository you named. Nothing changed; next: box bounty allow ${key} [--reward <whole dollars> --reward-limit <whole dollars>]`);
  const at = new Date().toISOString();
  const entry: SettingsLevel = { ...previous, ...(patch.reward === undefined ? {} : { reward: { amount: patch.reward, at } }), ...(patch.rewardLimit === undefined ? {} : { rewardLimit: { amount: patch.rewardLimit, at } }) };
  persist({ ...settings, repositories: { ...settings.repositories, [key]: entry } });
  return { at, key, entry };
}
export function writeDecision(repoRoot: string, scope: 'project' | 'default', bounty: OwnerDecision): { path: string; at: string; key: string } {
  if (scope === 'project') return writeRepository(requireRepository(repoRoot), bounty);
  const settings = loadSettings();
  const at = new Date().toISOString();
  const previous = settings.default;
  if (bounty === 'ask') {
    const state = loadState();
    if (state.askMergeNoticeAt === undefined) saveState({ ...state, askMergeNoticeAt: at });
  }
  persist({ ...settings, default: { bounty, at, changes: [...(previous?.changes ?? []), ...(previous === undefined ? [] : [{ bounty: previous.bounty, at: previous.at }])] } });
  return { path: settingsFile(), at, key: 'all-projects' };
}
export function readInstructions(repoRoot: string): InstructionSettings {
  return loadSettings().instructions?.[realpathSync(repoRoot)] ?? { enabled: false };
}
export function checkInstructionSettingsWrite(repoRoot: string): void {
  const root = realpathSync(repoRoot);
  let ancestor = resolve(settingsDir());
  const tail: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    tail.unshift(basename(ancestor));
    ancestor = parent;
  }
  const folder = resolve(realpathSync(ancestor), ...tail);
  const relativeFolder = folder.toLowerCase().replaceAll('\\', '/');
  const rootKey = root.toLowerCase().replaceAll('\\', '/');
  if (relativeFolder === rootKey || relativeFolder.startsWith(`${rootKey}/`)) throw new BountyRefused('settings-inside-repo', 'instruction maintenance settings must live outside the repository; nothing changed; next: name a settings file outside the repository');
  const stat = lstatSync(settingsFile(), { throwIfNoEntry: false });
  if (stat !== undefined && (stat.isSymbolicLink() || stat.nlink > 1)) throw new BountyRefused('instruction-settings-link', 'instruction-settings-link: instruction configuration cannot write a linked settings file; nothing changed; next: name a settings file that is not a link');
  if (stat !== undefined && !stat.isFile()) throw new BountyRefused('instruction-settings-not-file', 'instruction-settings-not-file; nothing changed; next: name an ordinary settings file');
}
export function writeInstructions(repoRoot: string, choice: InstructionSettings): void {
  checkInstructionSettingsWrite(repoRoot);
  const root = realpathSync(repoRoot);
  const settings = loadSettings();
  persist({ ...settings, instructions: { ...settings.instructions, [root]: choice } });
}

/** The tool's instruction marks for one checkout — the "file lacks the
    block" hashes and the retired-`.box/limits.json` mark — read from
    state.json. The settings load runs first so an old file's per-instruction
    `notices`/`retired` are already folded into state before this read. */
export function readInstructionNotes(repoRoot: string): InstructionNotes {
  loadSettings(); // move-out first, as in saidAlready
  return loadState().instructionNotes[realpathSync(repoRoot)] ?? { notices: [] };
}

/** The write path for those marks — the state writer alone, so a read
    command's once-only marks never touch the owner's file. */
export function writeInstructionNotes(repoRoot: string, notes: InstructionNotes): void {
  loadSettings(); // move-out first, so a pending old file's marks are kept
  const state = loadState();
  saveState({ ...state, instructionNotes: { ...state.instructionNotes, [realpathSync(repoRoot)]: notes } });
}
interface LocalMergeNotice extends MergeNotice { readonly repository: string }
const localMergeFile = (repoRoot: string): string => join(repoRoot, '.box', 'bounties', 'FIRST_MERGE');
function checkLocalMergePath(repoRoot: string): void {
  for (const path of [join(repoRoot, '.box'), join(repoRoot, '.box', 'bounties'), localMergeFile(repoRoot)]) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat === undefined) continue;
    if (stat.isSymbolicLink() || (path === localMergeFile(repoRoot) ? !stat.isFile() : !stat.isDirectory())) {
      throw new BountyRefused('first-merge-notice-unsafe-path', `${path}: the local first-merge notice must use ordinary directories and a file; next: name ordinary directories and a file for the first-merge notice`);
    }
  }
}
function readLocalMerge(repoRoot: string): LocalMergeNotice | null {
  const path = localMergeFile(repoRoot);
  checkLocalMergePath(repoRoot);
  if (!existsSync(path)) return null;
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new BountyRefused('first-merge-notice-malformed', `${path}: the local first-merge notice is unreadable; next: fix or remove ${path} — the local first-merge notice must be readable`); }
  if (!isObject(value) || value['kind'] !== 'box-local-first-merge' || typeof value['repository'] !== 'string' || typeof value['commit'] !== 'string' || !/^[a-f\d]{40,64}$/.test(value['commit']) || typeof value['at'] !== 'string') {
    throw new BountyRefused('first-merge-notice-malformed', `${path}: the local first-merge notice is unreadable; next: fix or remove ${path} — the local first-merge notice must be readable`);
  }
  return { repository: value['repository'], commit: value['commit'], at: value['at'] };
}
export function localFirstMergeLine(repoRoot: string): string | null {
  try {
    const notice = readLocalMerge(repoRoot);
    return notice === null ? null : `first outside solution merged in local repository ${JSON.stringify(notice.repository)}: commit ${notice.commit} at ${notice.at}`;
  } catch {
    return 'the local first-merge notice could not be read; merge history stands. Check .box/bounties/FIRST_MERGE';
  }
}
export interface FirstMergeNotice {
  /** The standalone line, emitted only when there is no pay block to ride
      in or the write failed (BT14 — a recorded first merge fuses into the
      payment message so the two facts are one block). */
  readonly line: string;
  readonly receiving: string;
  /** False when the write failed — a failed notice never rides in the
      owner block, it stands alone with its failure named. */
  readonly recorded: boolean;
}
export function recordFirstMerge(repoRoot: string, commit: string): FirstMergeNotice | null {
  let address: string | null = null;
  try { address = repositoryIdentity(repoRoot); } catch { /* A landed merge still gets a local fact, never a publication address. */ }
  const receiving = address ?? 'this local repository';
  const fact = `a solution written by someone outside was merged into ${receiving}, commit ${commit}.`;
  try {
    if (readLocalMerge(repoRoot) !== null) return null;
    if (address === null) {
      mkdirSync(join(repoRoot, '.box', 'bounties'), { recursive: true });
      checkLocalMergePath(repoRoot);
      writeFileSync(localMergeFile(repoRoot), `${JSON.stringify({ kind: 'box-local-first-merge', repository: realpathSync(repoRoot), commit, at: new Date().toISOString() }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    } else {
      loadSettings(); // move-out first, so a pending old file's marks are seen
      const state = loadState();
      if (state.firstMerges[address] !== undefined) return null;
      saveState({ ...state, firstMerges: { ...state.firstMerges, [address]: { commit, at: new Date().toISOString() } } });
    }
  } catch (error) {
    const where = address === null || error instanceof BountyRefused && error.reason.startsWith('first-merge-notice-') ? '.box/bounties/FIRST_MERGE' : 'box bounty config';
    return { line: `Tell the owner: ${fact} The first-merge notice could not be recorded (${error instanceof BountyRefused ? error.reason : 'settings-write-failed'}); the merge stands. Check ${where}.`, receiving, recorded: false };
  }
  return { line: `Tell the owner in your closing message: ${fact} ${address === null ? `The receiving GitHub address could not be determined; this notice is recorded in ${JSON.stringify(localMergeFile(repoRoot))}. ` : ''}This notice is recorded once for this repository.`, receiving, recorded: true };
}
