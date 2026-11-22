import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { basename as pathBasename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { BountyRefused } from './errors.js';
import { canonicalFolder, folderEntry, withFolderEntry } from './folder.js';
import { showPath } from './notice.js';
import { loadSettings, saveSettings, settingsFile } from './settings.js';

import { BUILTIN_RULES, matchingSkeleton, OWNER_LIST_FILE, parseOwnerList, type NeverShipRule } from './never-ship-paths.js';
export { BUILTIN_RULES, CONFUSABLES, matchingSkeleton, OWNER_LIST_FILE, UNFOLDED_RULES, type NeverShipRule } from './never-ship-paths.js';

export function loadOwnerList(repoRoot: string): { readonly rule: NeverShipRule; readonly patterns: readonly string[] } | null {
  const file = join(repoRoot, OWNER_LIST_FILE);
  return existsSync(file) ? parseOwnerList(readFileSync(file, 'utf8')) : null;
}

// ---------------------------------------------------------------------------
// The owner's two publish lists (BT8c), kept in the owner's own settings
// folder — never in the project, where a solution or an agent could write
// them. `never` is the owner's addition to the never-ship table: a listed
// path is kept out of every bounty. `safe` is the pre-publish scan's only
// exception: paths the scan does not hold a bounty over, for known false
// alarms such as fixtures with made-up keys. A path on the safe list still
// cannot carry a never-ship file — the scan holds nothing there, but the
// table still keeps it out.
//
// Entries are repository-relative paths, stored under the canonical spelling
// they resolve to. A path matches itself or anything beneath it.
// ---------------------------------------------------------------------------

export interface PublishLists { readonly never: readonly string[]; readonly safe: readonly string[] }

const toPosix = (path: string): string => path.split('\\').join('/');

// A listed path covers itself and anything below it, folded on both sides.
const listedUnder = (entries: readonly string[], path: string, fold: (text: string) => string): boolean => {
  const folded = fold(path);
  return entries.some(entry => folded === fold(entry) || folded.startsWith(`${fold(entry)}/`));
};
// The never list joins the rule table and folds like it.
const neverListed = (entries: readonly string[], path: string): boolean => listedUnder(entries, path, matchingSkeleton);
// The safe list is the scan's one exception, so it folds case only: a look-alike
// of a safe path is a different file and gets no exception.
export const publishListed = (entries: readonly string[], path: string): boolean => listedUnder(entries, path, text => text.toLowerCase());

// A project file cannot claim the lists — they live in the owner's settings
// only. The claim surfaces: files spelled like the lists, and settings-shaped
// JSON that names them. `.boxignore` is not a claim — it is the project's own
// never-ship list and every pattern in it can only ever remove files.
const CLAIM_KEY = /^(?:never[-_ ]?publish|safe[-_ ]?to[-_ ]?publish|safe[-_ ]?list|never[-_ ]?ship)$/i;
// Money is the owner's to set, exactly like the publish boundary: a project
// file — solver-written or agent-written — can claim a reward or a limit all
// it likes; the claim is refused by name and grants nothing (BT11a).
const REWARD_CLAIM_KEY = /^(?:reward|bounty[-_ ]?reward|reward[-_ ]?amount|reward[-_ ]?limit|bounty[-_ ]?limit|payment|payment[-_ ]?limit|promised[-_ ]?limit)$/i;
const CLAIM_FILES = ['never-publish', 'safe-to-publish', 'never-ship', 'safe-list'];

export function checkProjectClaims(repoRoot: string): void {
  const candidates = [...CLAIM_FILES, ...CLAIM_FILES.map(name => join('.box', name)), 'settings.json', join('.box', 'settings.json'), join('.box', 'limits.json')];
  for (const name of candidates) {
    const file = join(repoRoot, name);
    if (!existsSync(file)) continue;
    if (name.endsWith('.json')) {
      let parsed: unknown;
      try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; } // unreadable is not a claim the tool can read
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rewardClaim = Object.keys(parsed).find(key => REWARD_CLAIM_KEY.test(key));
        if (rewardClaim !== undefined) throw new BountyRefused('project-claims-reward', `${name} claims "${rewardClaim}" — the reward and its limit live only in the owner's settings (${settingsFile()}); a project file grants nothing; nothing was read from it; next: remove it or rename the key`);
        const claim = Object.keys(parsed).find(key => CLAIM_KEY.test(key));
        if (claim !== undefined) throw new BountyRefused('project-claims-list', `${name} claims "${claim}" — the owner's publish lists live only in the owner's settings (${settingsFile()}); a project file grants nothing; nothing was read from it; next: remove it or rename the key`);
      }
      continue;
    }
    throw new BountyRefused('project-claims-list', `${name} names an owner publish list — the lists live only in the owner's settings (${settingsFile()}); a project file grants nothing; nothing was read from it; next: remove it`);
  }
}

// The owner's lists for one repository: the settings entry keyed by its real
// folder path, after the project-claim check — a claim refuses by name and
// grants nothing, everywhere the lists are consulted.
export function publishLists(repoRoot: string): PublishLists {
  checkProjectClaims(repoRoot);
  const found = folderEntry(loadSettings().publishing, repoRoot);
  return { never: found?.never ?? [], safe: found?.safe ?? [] };
}

// The whole never-ship table for a repository: the built-ins, the project's
// `.boxignore` (patterns can only remove), and the owner's `never publish`
// settings entries — same judgement in create, post, answer and merged.
export function shipRules(repoRoot: string): readonly NeverShipRule[] {
  const rules: NeverShipRule[] = [...BUILTIN_RULES];
  const ownerList = loadOwnerList(repoRoot);
  if (ownerList !== null) rules.push(ownerList.rule);
  const publish = publishLists(repoRoot);
  if (publish.never.length > 0) rules.push({ name: 'owner-never-publish', match: path => neverListed(publish.never, path) });
  return rules;
}

// Where a `config add` entry lands: resolve the spelling against the
// repository, realpath the nearest existing ancestor and re-append the
// missing tail, then take the offset — the canonical repo-relative spelling
// the scans and the rule table speak. A link at any existing component of
// the spelled path is refused by name; so is a path that lands outside.
function publishEntryPath(repoRoot: string, which: string, named: string): string {
  const root = canonicalFolder(repoRoot);
  const absolute = resolve(root, named);
  // The typed path is quoted wherever it is named (BT43 correction 5): it is
  // often a name a scan hold showed, which after an apply can be a solver's.
  const shown = showPath(named);
  let ancestor = absolute;
  const tail: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new BountyRefused('publish-list-outside', `${which} ${shown} cannot be resolved; nothing changed; next: fix or remove the ${shown} entry in ${which}`);
    tail.unshift(pathBasename(ancestor));
    ancestor = parent;
  }
  const canon = join(canonicalFolder(ancestor), ...tail);
  const offset = toPosix(relative(root, canon));
  if (offset === '' || offset === '..' || offset.startsWith('../') || isAbsolute(offset)) {
    throw new BountyRefused('publish-list-outside', `${which} ${shown} resolves to ${showPath(canon)}${offset === '' ? '' : ', outside the repository'} — a listed path names a path inside the repository; nothing changed; next: remove ${shown} from ${which} or name a path inside the repository`);
  }
  let current = root;
  for (const part of relative(root, absolute).split(sep)) {
    if (part === '' || part === '.' || part === '..') continue;
    current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat === undefined) break;
    if (stat.isSymbolicLink()) throw new BountyRefused('publish-list-link', `${which} ${shown} resolves through a link — a listed path must be a real path inside the repository; nothing changed; next: replace ${shown} in ${which} with a real path inside the repository`);
  }
  return offset;
}

// `config add|remove never-publish|safe-to-publish <path>` — the only way the
// lists change. Validation is all before the write: a path that resolves
// outside the repository or through a link is refused by name, and a safe
// entry that names a never-ship path is refused — the safe list cannot carry
// what the table keeps out.
export function changePublishList(repoRoot: string, which: 'never-publish' | 'safe-to-publish', verb: 'add' | 'remove', named: string): string {
  const offset = publishEntryPath(repoRoot, which, named);
  const listed = showPath(offset);
  if (which === 'safe-to-publish' && verb === 'add') {
    // Judged against the whole never-ship table — built-ins, .boxignore and
    // the never publish list itself. The project-claim check is skipped on
    // purpose: a claim grants nothing but must not block the owner's own
    // settings write that keeps the tool honest.
    const ownerList = loadOwnerList(repoRoot);
    const rules: NeverShipRule[] = [...BUILTIN_RULES, ...(ownerList === null ? [] : [ownerList.rule])];
    const existing = folderEntry(loadSettings().publishing, repoRoot)?.never ?? [];
    if (existing.length > 0) rules.push({ name: 'owner-never-publish', match: path => neverListed(existing, path) });
    const rule = rules.find(candidate => candidate.match(offset.toLowerCase()));
    if (rule !== undefined) throw new BountyRefused('publish-list-never-ship', `safe to publish ${listed} names a path the never-ship rule '${rule.name}' keeps out — the safe list cannot carry a never-ship path; nothing changed; next: remove ${listed} from the safe list — never-ship paths cannot be listed`);
  }
  const stat = lstatSync(settingsFile(), { throwIfNoEntry: false });
  if (stat !== undefined && (stat.isSymbolicLink() || !stat.isFile())) throw new BountyRefused('publish-list-settings-link', 'the owner settings file is a link or not a plain file; nothing changed; next: make the owner settings file a plain file, then rerun the same command');
  const settings = loadSettings();
  const key = which === 'never-publish' ? 'never' : 'safe';
  const previous = folderEntry(settings.publishing, repoRoot) ?? { never: [], safe: [] };
  const list = [...previous[key]];
  if (verb === 'add') {
    if (list.some(entry => entry.toLowerCase() === offset.toLowerCase())) return `${which}: ${listed} was already listed; nothing changed`;
    list.push(offset);
  } else {
    const index = list.findIndex(entry => entry.toLowerCase() === offset.toLowerCase());
    if (index === -1) throw new BountyRefused('publish-list-not-listed', `${which}: ${listed} is not listed; nothing changed; next: add ${listed} to ${which} or remove it from the named paths`);
    list.splice(index, 1);
  }
  const next = { never: [...(key === 'never' ? list : previous.never)], safe: [...(key === 'safe' ? list : previous.safe)] };
  saveSettings({ ...settings, publishing: withFolderEntry(settings.publishing, repoRoot, next) });
  return `${which}: ${listed} ${verb === 'add' ? 'added' : 'removed'}, written to ${settingsFile()}`;
}
