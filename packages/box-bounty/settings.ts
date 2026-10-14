import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { gitOutcome } from './git.js';
import { repositoryAddress, repositoryIdentity, requireRepository } from './repository.js';

export const SETTINGS_FILE_NAME = 'settings.json';
export const SETTINGS_ENV = 'BOX_BOUNTY_SETTINGS_DIR';
export function settingsDir(): string {
  const override = process.env[SETTINGS_ENV];
  if (override !== undefined && override.trim() !== '') return resolve(override);
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), 'box');
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'box');
}
export const settingsFile = (): string => join(settingsDir(), SETTINGS_FILE_NAME);
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
  readonly notices: readonly string[];
  readonly retired?: boolean;
}
export interface OwnerSettings {
  readonly default?: SettingsLevel;
  readonly repositories: Readonly<Record<string, SettingsLevel>>;
  readonly migrations: readonly Migration[];
  readonly firstMerges: Readonly<Record<string, MergeNotice>>;
  readonly instructions?: Readonly<Record<string, InstructionSettings>>;
  /** The owner's two publish lists (BT8c), keyed by the repository's real
      folder path — they are about the working files in this checkout, not
      the public repository: `never` paths are kept out of every bounty like
      a never-ship rule; `safe` paths are the ones the pre-publish scan does
      not hold a bounty over. Both live here and never in the project. */
  readonly publishing?: Readonly<Record<string, { readonly never: readonly string[]; readonly safe: readonly string[] }>>;
  /** The reward and limit are per repository since BT11c — they live on each
      `repositories` entry. A file written before then carried one shared
      `reward`/`rewardLimit` for everything; the owner never chose them per
      repository (one was left by a demo run), so on first load they are
      retired into this record — applied to nothing — and the tool says so
      once, recording `toldAt` when the fact was shown. */
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
}
export const projectKey = requireRepository;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const decision = (value: unknown): value is OwnerDecision | null => value === null || value === 'allowed' || value === 'ask' || value === 'off';
const HARD_STOP_WORDS = ['nevership', 'private', 'secret', 'scan', 'hardstop', 'credential'];
export function unknownSetting(name: string): never {
  const folded = name.toLowerCase().replace(/[-_]/g, '');
  const hard = HARD_STOP_WORDS.some(word => folded.includes(word));
  throw new BountyRefused(hard ? 'settings-hard-stop' : 'settings-unknown-name', `${settingsFile()}: "${name}" ${hard ? 'tries to reach a hard stop; hard stops cannot be changed' : 'is not a setting the tool knows; known settings: all-projects, repositories, instructions, instruction-file, reward, reward-limit'}. Nothing changed`);
}
const bad = (detail: string): never => { throw new BountyRefused('settings-malformed', `${settingsFile()}: ${detail}; fix the settings file or remove it`); };
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
function persist(settings: OwnerSettings): void {
  mkdirSync(settingsDir(), { recursive: true });
  writeFileSync(settingsFile(), `${JSON.stringify({ kind: 'box-owner-settings', ...settings }, null, 2)}\n`, 'utf8');
}
// The one write path every settings mutation shares — exported for the
// publish lists, which are validated in never-ship.ts before they land here.
export const saveSettings = persist;

/** A money setting holds {amount, at}: a whole US-dollar amount at or above
    0 and the time the tool wrote it. A hand-written or malformed entry fails
    loudly — the tool never guesses what the file means; an unknown key inside
    it is named like every other unknown setting. */
function moneySetting(value: unknown, where: string): { readonly amount: number; readonly at: string } {
  if (!isObject(value)) return bad(`${where} must hold {amount, at} — a whole dollar amount at or above 0`);
  for (const name of Object.keys(value)) if (!['amount', 'at'].includes(name)) unknownSetting(name);
  const amount = value['amount'];
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0 || typeof value['at'] !== 'string') return bad(`${where} must hold a whole dollar amount at or above 0 with its written time`);
  return { amount, at: value['at'] };
}

// Consume legacy paths once. Unresolved paths grant nothing under a blanket
// default, and conflicting copies require a fresh repository decision.
export function loadSettings(): OwnerSettings {
  const path = settingsFile();
  if (!existsSync(path)) return { repositories: {}, migrations: [], firstMerges: {} };
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { return bad('not readable JSON'); }
  if (!isObject(parsed)) return bad('must hold a JSON object');
  for (const name of Object.keys(parsed)) if (!['kind', 'default', 'projects', 'repositories', 'migrations', 'firstMerges', 'instructions', 'publishing', 'reward', 'rewardLimit', 'retiredReward', 'rewardPromiseSaid', 'rewardNoticeAt'].includes(name)) unknownSetting(name);
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
  const migrations: Migration[] = [];
  const rawMigrations = parsed['migrations'];
  if (rawMigrations !== undefined) {
    if (!Array.isArray(rawMigrations)) return bad('migrations must hold a list');
    for (const entry of rawMigrations) {
      if (!isObject(entry) || typeof entry['path'] !== 'string' || typeof entry['at'] !== 'string' || typeof entry['detail'] !== 'string' || !(entry['repository'] === null || typeof entry['repository'] === 'string')) return bad('a migration notice is unreadable');
      migrations.push({ path: entry['path'], at: entry['at'], repository: entry['repository'], detail: entry['detail'] });
    }
  }
  const firstMerges: Record<string, MergeNotice> = {};
  const rawMerges = parsed['firstMerges'];
  if (rawMerges !== undefined) {
    if (!isObject(rawMerges)) return bad('firstMerges must hold an object');
    for (const [key, entry] of Object.entries(rawMerges)) {
      const address = repositoryAddress(key);
      if (address === null || !isObject(entry) || typeof entry['commit'] !== 'string' || !/^[a-f\d]{40,64}$/.test(entry['commit']) || typeof entry['at'] !== 'string') return bad('a first merge notice is unreadable');
      firstMerges[address] = { commit: entry['commit'], at: entry['at'] };
    }
  }
  const fallback = parsed['default'];
  const instructions: Record<string, InstructionSettings> = {};
  const rawInstructions = parsed['instructions'];
  if (rawInstructions !== undefined) {
    if (!isObject(rawInstructions)) return bad('instructions must hold an object keyed by repository folder');
    for (const [key, value] of Object.entries(rawInstructions)) {
      if (!isAbsolute(key) || !isObject(value) || typeof value['enabled'] !== 'boolean' || !(value['file'] === undefined || typeof value['file'] === 'string') || !Array.isArray(value['notices']) || value['notices'].some(entry => typeof entry !== 'string') || !(value['retired'] === undefined || typeof value['retired'] === 'boolean')) return bad('an instruction maintenance choice is unreadable');
      for (const name of Object.keys(value)) if (!['enabled', 'file', 'notices', 'retired'].includes(name)) unknownSetting(name);
      instructions[key] = { enabled: value['enabled'], ...(value['file'] === undefined ? {} : { file: value['file'] }), notices: value['notices'], ...(value['retired'] === undefined ? {} : { retired: value['retired'] }) };
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
  if (defaultLevel !== undefined && (defaultLevel.reward !== undefined || defaultLevel.rewardLimit !== undefined)) return bad('default cannot hold a reward or a limit — money belongs to a named repository; fix the settings file or remove it');
  // A retired shared reward: loaded so the once-only fact can say what it
  // was, but it is applied to no repository ever again.
  let retiredReward: OwnerSettings['retiredReward'];
  const rawRetired = parsed['retiredReward'];
  if (rawRetired !== undefined) {
    if (!isObject(rawRetired) || typeof rawRetired['at'] !== 'string' || !(rawRetired['toldAt'] === undefined || typeof rawRetired['toldAt'] === 'string')
      || !(rawRetired['reward'] === null || rawRetired['reward'] === undefined || isObject(rawRetired['reward']))
      || !(rawRetired['limit'] === null || rawRetired['limit'] === undefined || isObject(rawRetired['limit']))) return bad('a retired reward record is unreadable');
    for (const name of Object.keys(rawRetired)) if (!['reward', 'limit', 'at', 'toldAt'].includes(name)) unknownSetting(name);
    retiredReward = {
      reward: rawRetired['reward'] === null || rawRetired['reward'] === undefined ? null : moneySetting(rawRetired['reward'], 'retiredReward.reward'),
      limit: rawRetired['limit'] === null || rawRetired['limit'] === undefined ? null : moneySetting(rawRetired['limit'], 'retiredReward.limit'),
      at: rawRetired['at'],
      ...(typeof rawRetired['toldAt'] === 'string' ? { toldAt: rawRetired['toldAt'] } : {})
    };
  }
  // The shared reward/limit a pre-BT11c file carried apply to nothing: the
  // owner never chose them per repository, so they retire into a record the
  // once-only fact reports — they are never read as a setting again. Open
  // bounties keep the amount they were posted with; that lives on records.
  const retiring = parsed['reward'] !== undefined || parsed['rewardLimit'] !== undefined;
  if (retiring) {
    if (retiredReward !== undefined) return bad('the settings file holds both a shared reward and a retired one; fix the settings file or remove it');
    retiredReward = {
      reward: parsed['reward'] === undefined ? null : moneySetting(parsed['reward'], 'reward'),
      limit: parsed['rewardLimit'] === undefined ? null : moneySetting(parsed['rewardLimit'], 'rewardLimit'),
      at: new Date().toISOString()
    };
  }
  const settings: OwnerSettings = { ...(defaultLevel !== undefined ? { default: defaultLevel } : {}), repositories, migrations, firstMerges, ...(rawInstructions === undefined ? {} : { instructions }), ...(rawPublishing === undefined ? {} : { publishing }), ...(retiredReward === undefined ? {} : { retiredReward }), ...(typeof parsed['rewardPromiseSaid'] === 'string' ? { rewardPromiseSaid: parsed['rewardPromiseSaid'] } : {}), ...(typeof parsed['rewardNoticeAt'] === 'string' ? { rewardNoticeAt: parsed['rewardNoticeAt'] } : {}) };
  const legacy = parsed['projects'];
  if (legacy === undefined) {
    if (retiring) persist(settings);
    return settings;
  }
  if (!isObject(legacy)) return bad('projects must hold an object keyed by legacy folder path');
  const entries = Object.entries(legacy).map(([key, value]) => ({ key, entry: level(value, `projects[${JSON.stringify(key)}]`) }));
  const at = new Date().toISOString();
  for (const { key, entry } of entries) {
    let address: string | null = null;
    try {
      if (isAbsolute(key) && existsSync(key)) {
        const top = gitOutcome(key, ['rev-parse', '--show-toplevel']);
        if (top.status === 0 && realpathSync(key).toLowerCase() === realpathSync(top.stdout.trim()).toLowerCase()) address = repositoryIdentity(key);
      }
    } catch { /* no safe identity */ }
    if (address === null) {
      migrations.push({ path: key, repository: null, at, detail: 'could not read exactly one GitHub address; no permission moved. Re-add with box bounty allow <owner/name>' });
      continue;
    }
    const previous = repositories[address];
    if (previous !== undefined && previous.bounty !== entry.bounty) {
      repositories[address] = { bounty: null, at, changes: [...previous.changes, { bounty: previous.bounty, at: previous.at }, ...entry.changes, { bounty: entry.bounty, at: entry.at }] };
      migrations.push({ path: key, repository: address, at, detail: `conflicting old decisions; not allowed. Re-add with box bounty allow ${address}` });
    } else if (previous === undefined) repositories[address] = entry;
    else repositories[address] = { ...previous, changes: [...previous.changes, ...entry.changes, { bounty: entry.bounty, at: entry.at }] };
    if (!migrations.some(notice => notice.path === key)) migrations.push({ path: key, repository: address, at, detail: `moved to ${address}` });
  }
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
  const settings = loadSettings();
  const at = new Date().toISOString();
  if (settings.retiredReward !== undefined) {
    if (settings.retiredReward.toldAt !== undefined) return null;
    const retired = settings.retiredReward;
    persist({ ...settings, retiredReward: { ...retired, toldAt: at } });
    const was = retired.reward === null && retired.limit === null ? 'a shared reward entry without readable amounts' : `a shared reward of $${retired.reward?.amount ?? 0}${retired.limit === null ? '' : ` and a $${retired.limit.amount} limit`}`;
    return `one fact about money: ${was} applied to every repository — it applies to nothing now. Each repository states $0 until you set its own: box bounty config set reward <whole dollars> [owner/name]. Open bounties keep the amount they were posted with (noted ${at})`;
  }
  if (settings.rewardNoticeAt !== undefined) return null;
  if (settings.default === undefined && Object.keys(settings.repositories).length === 0) return null;
  persist({ ...settings, rewardNoticeAt: at });
  return `each repository can state its own reward — the owner sets it inside its checkout or by name: box bounty config set reward <whole dollars> [owner/name]. Until then every bounty states $0 (noted ${at})`;
}

export interface DecisionRead {
  readonly decision: OwnerDecision | null;
  readonly level: 'project' | 'default' | null;
  readonly at: string | null;
  readonly denied?: boolean;
}
export function readDecision(repoRoot: string): DecisionRead {
  const settings = loadSettings();
  if (Object.keys(settings.repositories).length === 0 && settings.migrations.length === 0) {
    return settings.default === undefined ? { decision: null, level: null, at: null } : { decision: settings.default.bounty, level: 'default', at: settings.default.at };
  }
  const key = repositoryIdentity(repoRoot);
  const entry = key === null ? undefined : settings.repositories[key];
  if (entry !== undefined) return { decision: entry.bounty, level: 'project', at: entry.at, ...(entry.bounty === null ? { denied: true } : {}) };
  if (settings.migrations.some(notice => notice.repository === null && resolve(notice.path).toLowerCase() === resolve(repoRoot).toLowerCase())) return { decision: null, level: null, at: null };
  if (settings.default !== undefined) return { decision: settings.default.bounty, level: 'default', at: settings.default.at };
  return { decision: null, level: null, at: null };
}
export function writeRepository(address: string, bounty: OwnerDecision | null, beforeWrite?: () => void, money?: { readonly reward: number; readonly rewardLimit: number | null }): { path: string; at: string; key: string } {
  const key = repositoryAddress(address);
  if (key === null) throw new BountyRefused('repository-address-invalid', `${address} is not a repository address; use owner/name. Nothing changed`);
  const settings = loadSettings();
  const previous = settings.repositories[key];
  if (bounty === null && (previous === undefined || previous.bounty === null || previous.bounty === 'off')) throw new BountyRefused('repository-not-listed', `${key} is not listed; nothing changed`);
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
  if (key === null) throw new BountyRefused('repository-address-invalid', `${address} is not a repository address; use owner/name. Nothing changed`);
  const settings = loadSettings();
  const previous = settings.repositories[key];
  if (previous === undefined || previous.bounty === null || previous.bounty === 'off') throw new BountyRefused('reward-repository-unlisted', `${key} is not on the owner's list — money is promised only for a repository you named. Allow it first: box bounty allow ${key} [--reward <whole dollars> --reward-limit <whole dollars>]. Nothing changed`);
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
  persist({ ...settings, default: { bounty, at, changes: [...(previous?.changes ?? []), ...(previous === undefined ? [] : [{ bounty: previous.bounty, at: previous.at }])] } });
  return { path: settingsFile(), at, key: 'all-projects' };
}
export function readInstructions(repoRoot: string): InstructionSettings {
  return loadSettings().instructions?.[realpathSync(repoRoot)] ?? { enabled: false, notices: [] };
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
  if (relativeFolder === rootKey || relativeFolder.startsWith(`${rootKey}/`)) throw new BountyRefused('settings-inside-repo', 'instruction maintenance settings must live outside the repository; nothing changed');
  const stat = lstatSync(settingsFile(), { throwIfNoEntry: false });
  if (stat !== undefined && (stat.isSymbolicLink() || stat.nlink > 1)) throw new BountyRefused('instruction-settings-link', 'instruction-settings-link: instruction configuration cannot write a linked settings file; nothing changed');
  if (stat !== undefined && !stat.isFile()) throw new BountyRefused('instruction-settings-not-file', 'instruction-settings-not-file: choose an ordinary settings file; nothing changed');
}
export function writeInstructions(repoRoot: string, choice: InstructionSettings): void {
  checkInstructionSettingsWrite(repoRoot);
  const root = realpathSync(repoRoot);
  const settings = loadSettings();
  persist({ ...settings, instructions: { ...settings.instructions, [root]: choice } });
}
interface LocalMergeNotice extends MergeNotice { readonly repository: string }
const localMergeFile = (repoRoot: string): string => join(repoRoot, '.box', 'bounties', 'FIRST_MERGE');
function checkLocalMergePath(repoRoot: string): void {
  for (const path of [join(repoRoot, '.box'), join(repoRoot, '.box', 'bounties'), localMergeFile(repoRoot)]) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat === undefined) continue;
    if (stat.isSymbolicLink() || (path === localMergeFile(repoRoot) ? !stat.isFile() : !stat.isDirectory())) {
      throw new BountyRefused('first-merge-notice-unsafe-path', `${path}: the local first-merge notice must use ordinary directories and a file`);
    }
  }
}
function readLocalMerge(repoRoot: string): LocalMergeNotice | null {
  const path = localMergeFile(repoRoot);
  checkLocalMergePath(repoRoot);
  if (!existsSync(path)) return null;
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new BountyRefused('first-merge-notice-malformed', `${path}: the local first-merge notice is unreadable`); }
  if (!isObject(value) || value['kind'] !== 'box-local-first-merge' || typeof value['repository'] !== 'string' || typeof value['commit'] !== 'string' || !/^[a-f\d]{40,64}$/.test(value['commit']) || typeof value['at'] !== 'string') {
    throw new BountyRefused('first-merge-notice-malformed', `${path}: the local first-merge notice is unreadable`);
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
export function recordFirstMerge(repoRoot: string, commit: string): string | null {
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
      const settings = loadSettings();
      if (settings.firstMerges[address] !== undefined) return null;
      persist({ ...settings, firstMerges: { ...settings.firstMerges, [address]: { commit, at: new Date().toISOString() } } });
    }
  } catch (error) {
    const where = address === null || error instanceof BountyRefused && error.reason.startsWith('first-merge-notice-') ? '.box/bounties/FIRST_MERGE' : 'box bounty config';
    return `Tell the owner: ${fact} The first-merge notice could not be recorded (${error instanceof BountyRefused ? error.reason : 'settings-write-failed'}); the merge stands. Check ${where}.`;
  }
  return `Tell the owner in your closing message: ${fact} ${address === null ? `The receiving GitHub address could not be determined; this notice is recorded in ${JSON.stringify(localMergeFile(repoRoot))}. ` : ''}This notice is recorded once for this repository; merging is not gated.`;
}
