// The owner's one decision — "my agents may use this tool" — kept in the
// owner's own settings folder on this machine, outside every repository:
// never committed, never cloned, and out of reach of a solution, a pull
// request or a collaborator. A project file that claims to allow anything
// grants nothing (the project limits file refuses an authority field by
// name). The tool never infers the yes and never widens it: it reads what
// the owner wrote, at the project level first, then the all-projects
// default.
//
//   <settings dir>/settings.json
//   {
//     "kind": "box-owner-settings",
//     "default":  { "bounty": "allowed", "at": "<iso>", "changes": [ {"bounty": "ask", "at": "<iso>"} ] },
//     "projects": { "<canonical repo path>": { "bounty": "ask", "at": "<iso>", "changes": [...] } }
//   }
//
// Three states, never guessed: written "allowed"; written "ask" (ask me
// each time); nothing written — which is never read as allowed. A fourth,
// written "off", is the owner turning the permission off: everything
// returns to asking and the answer stays on file marked off. Every write
// appends to "changes" with the time, so `status` can say when it last
// changed and a hand-edited file shows.
//
// The three hard stops cannot be expressed here: a name that tries —
// never-ship, private, scan, secret, hard-stop — is `settings-hard-stop`;
// any other name the tool does not know is `settings-unknown-name`.
// Refused, never ignored: silently ignoring a setting the owner wrote
// would read a yes the owner may not have meant.
//
// This is protection, not a lock: the file sits where the owner's own
// programs can write it. It stops accidents and makes a change visible —
// every change is recorded with the time — not an agent that sets out to
// edit a file it can reach. BOUNTY.md says so plainly.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { BountyRefused } from './errors.js';

export const SETTINGS_FILE_NAME = 'settings.json';
// The folder override: tests point the tool at a temporary settings folder,
// never the owner's real one. An agent can point it anywhere it can write —
// a decision read from somewhere else is recorded with its time, visible in
// `status` and `owner setup`; the doc page states this is not a lock.
export const SETTINGS_ENV = 'BOX_BOUNTY_SETTINGS_DIR';

export function settingsDir(): string {
  const override = process.env[SETTINGS_ENV];
  if (override !== undefined && override.trim() !== '') return resolve(override);
  if (process.platform === 'win32') {
    return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), 'box');
  }
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'box');
}

export const settingsFile = (): string => join(settingsDir(), SETTINGS_FILE_NAME);

export type OwnerDecision = 'allowed' | 'ask' | 'off';

interface SettingsLevel {
  readonly bounty: OwnerDecision;
  readonly at: string;
  readonly changes: readonly { readonly bounty: OwnerDecision; readonly at: string }[];
}

export interface OwnerSettings {
  readonly default?: SettingsLevel;
  readonly projects: Readonly<Record<string, SettingsLevel>>;
}

// The repo path as the settings file keys it: the canonical spelling, case
// folded, so a junction or case trick cannot name a second project.
export function projectKey(repoRoot: string): string {
  let real: string;
  try { real = realpathSync(repoRoot); } catch { real = resolve(repoRoot); }
  return real.split(/[\\/]+/).join('/').replace(/\/+$/, '').toLowerCase();
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const DECISIONS = new Set<string>(['allowed', 'ask', 'off']);
// Fields a level may carry. Anything else is refused by name: a name that
// reaches for a hard stop gets its own refusal, everything else the plain
// unknown-name one — the hard stops cannot be expressed or switched off.
const LEVEL_FIELDS = new Set(['bounty', 'at', 'changes']);
const TOP_FIELDS = new Set(['kind', 'default', 'projects']);
const HARD_STOP_WORDS = ['nevership', 'private', 'secret', 'scan', 'hardstop', 'credential'];
const hardStopName = (name: string): boolean => {
  const folded = name.toLowerCase().replace(/[-_]/g, '');
  return HARD_STOP_WORDS.some(word => folded.includes(word));
};

const unknownField = (where: string, name: string): never => {
  if (hardStopName(name)) {
    throw new BountyRefused('settings-hard-stop', `${settingsFile()}: "${name}" tries to reach a hard stop — the three hard stops (never-ship, a private repository, the owner's standing rules) cannot be expressed as settings or switched off by one. Remove "${name}" from ${where}`);
  }
  throw new BountyRefused('settings-unknown-name', `${settingsFile()}: "${name}" is not a setting the tool knows — refused, not ignored. Known names: bounty, at, changes. Fix it or remove it from ${where}`);
};

const bad = (detail: string): never => {
  throw new BountyRefused('settings-malformed', `${settingsFile()} ${detail} — the file exists but the tool cannot understand what the owner set; fix it or remove it`);
};

const level = (value: unknown, where: string): SettingsLevel => {
  if (!isObject(value)) return bad(`: ${where} must hold a JSON object`);
  for (const name of Object.keys(value)) {
    if (!LEVEL_FIELDS.has(name)) unknownField(where, name);
  }
  const bounty = value['bounty'];
  if (typeof bounty !== 'string' || !DECISIONS.has(bounty)) return bad(`: ${where}.bounty must be "allowed", "ask" or "off"`);
  const at = value['at'];
  if (typeof at !== 'string') return bad(`: ${where}.at must be the time the decision was written`);
  const changes = value['changes'];
  if (changes !== undefined && (!Array.isArray(changes) || changes.some(entry => !isObject(entry) || typeof entry['bounty'] !== 'string' || !DECISIONS.has(entry['bounty']) || typeof entry['at'] !== 'string'))) {
    return bad(`: ${where}.changes must be a list of {bounty, at} entries`);
  }
  return { bounty: bounty as OwnerDecision, at, changes: (changes ?? []) as { bounty: OwnerDecision; at: string }[] };
};

// Reading the file: absent means nothing is written — never a refusal.
// Anything present but not the stated shape is a named refusal, on every
// command that reads it, before anything mutates or posts.
export function loadSettings(): OwnerSettings {
  const path = settingsFile();
  if (!existsSync(path)) return { projects: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return bad(`is not readable JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!isObject(parsed)) return bad('must hold a JSON object');
  for (const name of Object.keys(parsed)) {
    if (!TOP_FIELDS.has(name)) unknownField('the settings', name);
  }
  if (parsed['kind'] !== undefined && parsed['kind'] !== 'box-owner-settings') return bad(': "kind" must be "box-owner-settings"');
  const projects: Record<string, SettingsLevel> = {};
  const rawProjects = parsed['projects'];
  if (rawProjects !== undefined) {
    if (!isObject(rawProjects)) return bad(': "projects" must hold a JSON object keyed by project path');
    for (const [key, value] of Object.entries(rawProjects)) {
      projects[key.toLowerCase().replace(/\/+$/, '')] = level(value, `projects["${key}"]`);
    }
  }
  const fallback = parsed['default'];
  return {
    ...(fallback !== undefined ? { default: level(fallback, 'default') } : {}),
    projects
  };
}

export interface DecisionRead {
  /** What the owner wrote for this repository, or null when nothing is
      written — which is never read as allowed. */
  readonly decision: OwnerDecision | null;
  /** Which of the owner's two levels the answer came from. */
  readonly level: 'project' | 'default' | null;
  /** When the decision last changed, as the file records it. */
  readonly at: string | null;
}

// The project level is read first, then the default. "off" written at the
// project level stops a wider "allowed" from applying here — the owner
// scoped the answer on purpose.
export function readDecision(repoRoot: string): DecisionRead {
  const settings = loadSettings();
  const key = projectKey(repoRoot);
  const project = settings.projects[key];
  if (project !== undefined) return { decision: project.bounty, level: 'project', at: project.at };
  if (settings.default !== undefined) return { decision: settings.default.bounty, level: 'default', at: settings.default.at };
  return { decision: null, level: null, at: null };
}

// Writing the owner's decision: the current answer plus the change history,
// one level at a time. The folder is made on the first write; the file is
// never created by reading. Returns where and when it landed.
export function writeDecision(repoRoot: string, level: 'project' | 'default', decision: OwnerDecision): { path: string; at: string; key: string } {
  const settings = loadSettings();
  const at = new Date().toISOString();
  const key = projectKey(repoRoot);
  if (level === 'project') {
    const previous = settings.projects[key];
    const changes = [...(previous?.changes ?? []), ...(previous !== undefined ? [{ bounty: previous.bounty, at: previous.at }] : [])];
    return persist({ ...settings, projects: { ...settings.projects, [key]: { bounty: decision, at, changes } } }, at, key);
  }
  const previous = settings.default;
  const changes = [...(previous?.changes ?? []), ...(previous !== undefined ? [{ bounty: previous.bounty, at: previous.at }] : [])];
  return persist({ ...settings, default: { bounty: decision, at, changes } }, at, key);
}

function persist(settings: OwnerSettings, at: string, key: string): { path: string; at: string; key: string } {
  const dir = settingsDir();
  mkdirSync(dir, { recursive: true });
  const path = settingsFile();
  writeFileSync(path, `${JSON.stringify({ kind: 'box-owner-settings', ...settings }, null, 2)}\n`, 'utf8');
  return { path, at, key };
}
