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
export interface SettingsLevel extends Change { readonly changes: readonly Change[] }
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
}
export const projectKey = requireRepository;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const decision = (value: unknown): value is OwnerDecision | null => value === null || value === 'allowed' || value === 'ask' || value === 'off';
const HARD_STOP_WORDS = ['nevership', 'private', 'secret', 'scan', 'hardstop', 'credential'];
export function unknownSetting(name: string): never {
  const folded = name.toLowerCase().replace(/[-_]/g, '');
  const hard = HARD_STOP_WORDS.some(word => folded.includes(word));
  throw new BountyRefused(hard ? 'settings-hard-stop' : 'settings-unknown-name', `${settingsFile()}: "${name}" ${hard ? 'tries to reach a hard stop; hard stops cannot be changed' : 'is not a setting the tool knows; known settings: all-projects, repositories, instructions, instruction-file'}. Nothing changed`);
}
const bad = (detail: string): never => { throw new BountyRefused('settings-malformed', `${settingsFile()}: ${detail}; fix the settings file or remove it`); };
function change(value: unknown, where: string): Change {
  if (!isObject(value) || !decision(value['bounty']) || typeof value['at'] !== 'string') return bad(`${where} must hold {bounty, at}, with bounty allowed, ask, off or null`);
  for (const name of Object.keys(value)) if (!['bounty', 'at'].includes(name)) unknownSetting(name);
  return { bounty: value['bounty'], at: value['at'] };
}
function level(value: unknown, where: string): SettingsLevel {
  if (!isObject(value)) return bad(`${where} must hold an object`);
  for (const name of Object.keys(value)) if (!['bounty', 'at', 'changes'].includes(name)) unknownSetting(name);
  const current = change({ bounty: value['bounty'], at: value['at'] }, where);
  const raw = value['changes'];
  if (raw !== undefined && !Array.isArray(raw)) return bad(`${where}.changes must hold a list`);
  return { ...current, changes: raw === undefined ? [] : raw.map(entry => change(entry, `${where}.changes`)) };
}
function persist(settings: OwnerSettings): void {
  mkdirSync(settingsDir(), { recursive: true });
  writeFileSync(settingsFile(), `${JSON.stringify({ kind: 'box-owner-settings', ...settings }, null, 2)}\n`, 'utf8');
}
// The one write path every settings mutation shares — exported for the
// publish lists, which are validated in never-ship.ts before they land here.
export const saveSettings = persist;

// Consume legacy paths once. Unresolved paths grant nothing under a blanket
// default, and conflicting copies require a fresh repository decision.
export function loadSettings(): OwnerSettings {
  const path = settingsFile();
  if (!existsSync(path)) return { repositories: {}, migrations: [], firstMerges: {} };
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { return bad('not readable JSON'); }
  if (!isObject(parsed)) return bad('must hold a JSON object');
  for (const name of Object.keys(parsed)) if (!['kind', 'default', 'projects', 'repositories', 'migrations', 'firstMerges', 'instructions', 'publishing'].includes(name)) unknownSetting(name);
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
  const settings: OwnerSettings = { ...(fallback !== undefined ? { default: level(fallback, 'default') } : {}), repositories, migrations, firstMerges, ...(rawInstructions === undefined ? {} : { instructions }), ...(rawPublishing === undefined ? {} : { publishing }) };
  const legacy = parsed['projects'];
  if (legacy === undefined) return settings;
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
export function writeRepository(address: string, bounty: OwnerDecision | null, beforeWrite?: () => void): { path: string; at: string; key: string } {
  const key = repositoryAddress(address);
  if (key === null) throw new BountyRefused('repository-address-invalid', `${address} is not a repository address; use owner/name. Nothing changed`);
  const settings = loadSettings();
  const previous = settings.repositories[key];
  if (bounty === null && (previous === undefined || previous.bounty === null || previous.bounty === 'off')) throw new BountyRefused('repository-not-listed', `${key} is not listed; nothing changed`);
  const at = new Date().toISOString();
  const changes = [...(previous?.changes ?? []), ...(previous === undefined ? [] : [{ bounty: previous.bounty, at: previous.at }])];
  beforeWrite?.();
  persist({ ...settings, repositories: { ...settings.repositories, [key]: { bounty, at, changes } } });
  return { path: settingsFile(), at, key };
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
