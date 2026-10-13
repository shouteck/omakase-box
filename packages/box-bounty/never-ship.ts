import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename as pathBasename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { BountyRefused } from './errors.js';
import { loadSettings, saveSettings, settingsFile } from './settings.js';

// Never-ship is the security boundary of a whole-repository bounty. The rules below
// are built in and cannot be overridden in this wave. Each rule is evaluated on a
// file's canonical path — realpath-resolved, forward slashes, lower-cased — never on
// the spelling a candidate arrived under, so a case alias or a link or junction
// inside the repository cannot slip a listed file past them. The manifest records
// each rule and how many files it removed; removed file names appear only in the
// local preview, never inside the bounty folder.
//
// There is deliberately no content scanning in this wave: an ordinary-looking file
// that contains a secret is out of scope here — the owner list is the catch-all a
// repository uses to name what the built-ins miss.

export interface NeverShipRule {
  readonly name: string;
  readonly match: (canonicalLowerPath: string) => boolean;
}

const segments = (path: string): string[] => path.split('/');
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const extension = (path: string): string => {
  const base = basename(path);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1) : '';
};

const KEY_EXTENSIONS = new Set(['key', 'pem', 'p12', 'pfx', 'jks', 'keystore', 'ppk', 'gpg']);
const CERT_EXTENSIONS = new Set(['crt', 'cer', 'der', 'cert', 'p7b', 'p7c', 'asc']);
const CREDENTIAL_NAMES = new Set(['.netrc', '.pgpass', '.htpasswd', '.git-credentials', '.npmrc', '.pypirc', '.dockercfg', '.yarnrc', '.yarnrc.yml']);

export const BUILTIN_RULES: readonly NeverShipRule[] = [
  { name: 'dot-git', match: path => segments(path).includes('.git') },
  // Dotfiles `.env`/`.envrc` (+ any `.<env>` extension) and env-file spellings like
  // `prod.env`: the basename ends with `.env`. `.env.example`-style suffixes still
  // count — templates carry real values often enough to keep the strict reading.
  { name: 'dot-env', match: path => /^\.env(?:\.|$)/.test(basename(path)) || /^\.envrc(?:\.|$)/.test(basename(path)) || /\.env$/.test(basename(path)) },
  // Any directory segment containing "secrets" — `secrets/`, `secrets-backup/`,
  // `mysecrets/`. Deliberately plural so ordinary words like `secretary/` and
  // `secretariat/` do not match.
  { name: 'secrets-dir', match: path => segments(path).some(segment => segment.includes('secrets')) },
  { name: 'runtime-dir', match: path => segments(path).includes('.runtime') },
  // The tool's own state: `.box/bounties/<id>.json` records live in the project
  // but a bounty record must never ship inside a later bounty. Exact segment
  // match — the `.boxignore` owner-list file is a different basename entirely
  // and still matches nothing here.
  { name: 'dot-box', match: path => segments(path).includes('.box') },
  {
    name: 'private-key',
    match: path => KEY_EXTENSIONS.has(extension(path)) || /^id_(?:rsa|dsa|ecdsa|ed25519)/.test(basename(path))
  },
  { name: 'certificate', match: path => CERT_EXTENSIONS.has(extension(path)) },
  {
    name: 'credentials-file',
    match: path =>
      CREDENTIAL_NAMES.has(basename(path)) ||
      path.endsWith('/.aws/credentials') || path === '.aws/credentials' ||
      path.endsWith('/.docker/config.json') || path === '.docker/config.json'
  }
];

// The owner's own list: `.boxignore` at the repository root, one pattern per line.
// `#` starts a comment, blank lines are skipped. Gitignore-lite semantics, all
// matches against the canonical path, case-folded:
//   name          a file or directory named `name` at any depth
//   name/         anything under a directory named `name` at any depth
//   *.ext         a basename glob at any depth
//   dir/*.ext     a path glob anchored at the repository root
//   /exact/file   an exact path anchored at the repository root
// There is no `!` negation: owner patterns can only ever remove files, never undo
// a built-in rule. A `!` line is refused rather than silently ignored, so a
// mistaken rule cannot look like it matched.
export const OWNER_LIST_FILE = '.boxignore';

const GLOB_CHAR = /[\\^$+.()|[\]{}]/g;
function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]!;
    if (ch === '*') {
      if (pattern[i + 1] === '*') { out += '.*'; i += 1; }
      else out += '[^/]*';
    } else if (ch === '?') out += '[^/]';
    else out += ch.replace(GLOB_CHAR, m => `\\${m}`);
  }
  return new RegExp(`^${out}$`);
}

function compilePattern(raw: string, line: number): RegExp {
  // Fold case on the pattern side too: matches run against the lower-cased
  // canonical path, so an un-folded pattern containing uppercase could never hit.
  const pattern = raw.trim().toLowerCase();
  if (pattern.startsWith('!')) throw new BountyRefused('invalid-boxignore', `${OWNER_LIST_FILE} line ${line}: '!' negation is not supported — never-ship rules can only remove files`);
  if (pattern.endsWith('/')) {
    const dir = pattern.slice(0, -1);
    const anchored = dir.startsWith('/') || dir.includes('/');
    const body = globToRegExp(dir.startsWith('/') ? dir.slice(1) : dir).source.slice(1, -1);
    return new RegExp(anchored ? `^${body}/` : `(?:^|/)${body}/`);
  }
  if (pattern.startsWith('/')) return globToRegExp(pattern.slice(1));
  if (pattern.includes('/')) return globToRegExp(pattern);
  const body = globToRegExp(pattern).source.slice(1, -1);
  return new RegExp(`(?:^|/)${body}(?:/|$)`);
}

export function loadOwnerList(repoRoot: string): { readonly rule: NeverShipRule; readonly patterns: readonly string[] } | null {
  const file = join(repoRoot, OWNER_LIST_FILE);
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const compiled: RegExp[] = [];
  const patterns: string[] = [];
  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    compiled.push(compilePattern(trimmed, index + 1));
    patterns.push(trimmed);
  });
  if (compiled.length === 0) return null;
  return { rule: { name: 'owner-list', match: path => compiled.some(regex => regex.test(path)) }, patterns };
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

// A listed path covers itself and anything below it. Matching folds case on
// both sides, exactly like the rule table it joins.
const listedUnder = (entries: readonly string[], path: string): boolean => {
  const folded = path.toLowerCase();
  return entries.some(entry => folded === entry.toLowerCase() || folded.startsWith(`${entry.toLowerCase()}/`));
};
export const publishListed = (entries: readonly string[], path: string): boolean => listedUnder(entries, path);

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
        if (rewardClaim !== undefined) throw new BountyRefused('project-claims-reward', `${name} claims "${rewardClaim}" — the reward and its limit live only in the owner's settings (${settingsFile()}); a project file grants nothing. Remove it or rename the key; nothing was read from it`);
        const claim = Object.keys(parsed).find(key => CLAIM_KEY.test(key));
        if (claim !== undefined) throw new BountyRefused('project-claims-list', `${name} claims "${claim}" — the owner's publish lists live only in the owner's settings (${settingsFile()}); a project file grants nothing. Remove it or rename the key; nothing was read from it`);
      }
      continue;
    }
    throw new BountyRefused('project-claims-list', `${name} names an owner publish list — the lists live only in the owner's settings (${settingsFile()}); a project file grants nothing. Remove it; nothing was read from it`);
  }
}

// The owner's lists for one repository: the settings entry keyed by its real
// folder path, after the project-claim check — a claim refuses by name and
// grants nothing, everywhere the lists are consulted.
export function publishLists(repoRoot: string): PublishLists {
  checkProjectClaims(repoRoot);
  const found = loadSettings().publishing?.[realpathSync(repoRoot)];
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
  if (publish.never.length > 0) rules.push({ name: 'owner-never-publish', match: path => listedUnder(publish.never, path) });
  return rules;
}

// Where a `config add` entry lands: resolve the spelling against the
// repository, realpath the nearest existing ancestor and re-append the
// missing tail, then take the offset — the canonical repo-relative spelling
// the scans and the rule table speak. A link at any existing component of
// the spelled path is refused by name; so is a path that lands outside.
function publishEntryPath(repoRoot: string, which: string, named: string): string {
  const root = realpathSync(repoRoot);
  const absolute = resolve(root, named);
  let ancestor = absolute;
  const tail: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new BountyRefused('publish-list-outside', `${which} ${named} cannot be resolved; nothing changed`);
    tail.unshift(pathBasename(ancestor));
    ancestor = parent;
  }
  const canon = join(realpathSync(ancestor), ...tail);
  const offset = toPosix(relative(root, canon));
  if (offset === '' || offset === '..' || offset.startsWith('../') || isAbsolute(offset)) {
    throw new BountyRefused('publish-list-outside', `${which} ${named} resolves to ${canon}${offset === '' ? '' : ', outside the repository'} — a listed path names a path inside the repository; nothing changed`);
  }
  let current = root;
  for (const part of relative(root, absolute).split(sep)) {
    if (part === '' || part === '.' || part === '..') continue;
    current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat === undefined) break;
    if (stat.isSymbolicLink()) throw new BountyRefused('publish-list-link', `${which} ${named} resolves through a link — a listed path must be a real path inside the repository; nothing changed`);
  }
  return offset;
}

// `config add|remove never-publish|safe-to-publish <path>` — the only way the
// lists change. Validation is all before the write: a path that resolves
// outside the repository or through a link is refused by name, and a safe
// entry that names a never-ship path is refused — the safe list cannot carry
// what the table keeps out.
export function changePublishList(repoRoot: string, which: 'never-publish' | 'safe-to-publish', verb: 'add' | 'remove', named: string): string {
  const root = realpathSync(repoRoot);
  const offset = publishEntryPath(repoRoot, which, named);
  if (which === 'safe-to-publish' && verb === 'add') {
    // Judged against the whole never-ship table — built-ins, .boxignore and
    // the never publish list itself. The project-claim check is skipped on
    // purpose: a claim grants nothing but must not block the owner's own
    // settings write that keeps the tool honest.
    const ownerList = loadOwnerList(repoRoot);
    const rules: NeverShipRule[] = [...BUILTIN_RULES, ...(ownerList === null ? [] : [ownerList.rule])];
    const existing = loadSettings().publishing?.[root]?.never ?? [];
    if (existing.length > 0) rules.push({ name: 'owner-never-publish', match: path => listedUnder(existing, path) });
    const rule = rules.find(candidate => candidate.match(offset.toLowerCase()));
    if (rule !== undefined) throw new BountyRefused('publish-list-never-ship', `safe to publish ${offset} names a path the never-ship rule '${rule.name}' keeps out — the safe list cannot carry a never-ship path; nothing changed`);
  }
  const stat = lstatSync(settingsFile(), { throwIfNoEntry: false });
  if (stat !== undefined && (stat.isSymbolicLink() || !stat.isFile())) throw new BountyRefused('publish-list-settings-link', 'the owner settings file is a link or not a plain file; nothing changed');
  const settings = loadSettings();
  const key = which === 'never-publish' ? 'never' : 'safe';
  const previous = settings.publishing?.[root] ?? { never: [], safe: [] };
  const list = [...previous[key]];
  if (verb === 'add') {
    if (list.some(entry => entry.toLowerCase() === offset.toLowerCase())) return `${which}: ${offset} was already listed; nothing changed`;
    list.push(offset);
  } else {
    const index = list.findIndex(entry => entry.toLowerCase() === offset.toLowerCase());
    if (index === -1) throw new BountyRefused('publish-list-not-listed', `${which}: ${offset} is not listed; nothing changed`);
    list.splice(index, 1);
  }
  const next = { never: [...(key === 'never' ? list : previous.never)], safe: [...(key === 'safe' ? list : previous.safe)] };
  saveSettings({ ...settings, publishing: { ...settings.publishing, [root]: next } });
  return `${which}: ${offset} ${verb === 'add' ? 'added' : 'removed'}, written to ${settingsFile()}`;
}
