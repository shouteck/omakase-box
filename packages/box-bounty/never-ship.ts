import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BountyRefused } from './errors.js';

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
