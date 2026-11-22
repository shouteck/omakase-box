import { BountyRefused } from './errors.js';

// Never-ship is the security boundary of a whole-repository bounty. The rules below
// are built in and cannot be overridden in this wave. Each rule is evaluated on the
// matching skeleton of a file's canonical path — realpath-resolved, forward slashes,
// folded by matchingSkeleton — never on the spelling a candidate arrived under, so a
// case alias, a look-alike spelling or a link or junction inside the repository
// cannot slip a listed file past them. The manifest records
// each rule and how many files it removed; removed file names appear only in the
// local preview, never inside the bounty folder.
//
// There is deliberately no content scanning in this wave: an ordinary-looking file
// that contains a secret is out of scope here — the owner list is the catch-all a
// repository uses to name what the built-ins miss.

export interface NeverShipRule {
  readonly name: string;
  readonly match: (canonicalPath: string) => boolean;
}

// Non-ASCII look-alikes of the letters in the rule words and credential names.
// Deliberately small and named, not Unicode's confusables list: Cyrillic, Greek,
// Armenian and IPA letters, and the dashes. Keys hold what is left after NFKC and
// lower-casing, because callers may lower-case first, so a Greek capital is read
// by its lower-case shape: capital Nu folds to v, not n. ASCII never folds to
// ASCII (`.g1t` is not `.git`).
export const CONFUSABLES: Readonly<Record<string, string>> = {
  a: 'аαɑ',
  b: 'вβ',
  c: 'сςσ',
  d: 'ԁ',
  e: 'еε',
  g: 'ɡց',
  h: 'һнհ',
  i: 'іιı',
  j: 'јϳ',
  k: 'кκ',
  l: 'ӏ',
  m: 'м',
  n: 'ηո',
  o: 'оοօ',
  p: 'рρ',
  r: 'г',
  s: 'ѕ',
  t: 'тτ',
  u: 'υμս',
  v: 'νѵ',
  w: 'ԝ',
  x: 'хχ',
  y: 'уү',
  z: 'ζ',
  '-': '‐‒–—−'
};
const FOLD = new Map(Object.entries(CONFUSABLES).flatMap(([ascii, alikes]) => [...alikes].map(alike => [alike, ascii] as const)));

// What a path is matched as: invisible characters gone, NFKC (width, ligatures,
// composed or decomposed), lower-cased, the table folded. Only matching uses it;
// the path kept and shown stays the real one.
export const matchingSkeleton = (path: string): string =>
  path.replace(/\p{Default_Ignorable_Code_Point}/gu, '').normalize('NFKC').toLowerCase()
    .replaceAll('i̇', 'i') // lower-cased dotted capital I
    .replace(/[^\x00-\x7f]/gu, alike => FOLD.get(alike) ?? alike);

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

// The table as written, on an already-folded path. Everything else uses
// BUILTIN_RULES; this is exported so a test can show the fold is what catches.
export const UNFOLDED_RULES: readonly NeverShipRule[] = [
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

export const BUILTIN_RULES: readonly NeverShipRule[] = UNFOLDED_RULES.map(rule => ({ name: rule.name, match: path => rule.match(matchingSkeleton(path)) }));

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

type GlobToken = { kind: 'literal'; value: string } | { kind: 'star' | 'globstar' | 'one' };
function globTokens(pattern: string): GlobToken[] {
  const tokens: GlobToken[] = [];
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]!;
    if (ch === '*') {
      if (pattern[i + 1] === '*') { tokens.push({ kind: 'globstar' }); i += 1; }
      else tokens.push({ kind: 'star' });
    } else if (ch === '?') tokens.push({ kind: 'one' });
    else tokens.push({ kind: 'literal', value: ch });
  }
  return tokens;
}

function compilePattern(raw: string, line: number): (path: string) => boolean {
  // Fold the pattern side too: matches run against the path's skeleton, so an
  // un-folded pattern containing uppercase could never hit.
  const pattern = matchingSkeleton(raw.trim());
  if (pattern.startsWith('!')) throw new BountyRefused('invalid-boxignore', `${OWNER_LIST_FILE} line ${line}: '!' negation is not supported — never-ship rules can only remove files; next: remove the '!' negation on ${OWNER_LIST_FILE} line ${line}`);
  const directory = pattern.endsWith('/');
  const glob = directory ? pattern.slice(0, -1) : pattern;
  const anchored = glob.startsWith('/') || glob.includes('/');
  const tokens = globTokens(glob.startsWith('/') ? glob.slice(1) : glob);
  return path => {
    let previous = new Uint8Array(path.length + 1);
    let current = new Uint8Array(path.length + 1);
    previous[0] = 1;
    if (!anchored) for (let i = 0; i < path.length; i += 1) if (path[i] === '/') previous[i + 1] = 1;
    // One row per token, one column per UTF-16 path position; no search backtracking.
    for (const token of tokens) {
      current.fill(0);
      const star = token.kind === 'star' || token.kind === 'globstar';
      if (star) current[0] = previous[0]!;
      for (let i = 0; i < path.length; i += 1) {
        const ch = path[i]!;
        const consumes = token.kind === 'literal' ? ch === token.value
          : token.kind === 'globstar' ? ch !== '\n' && ch !== '\r' && ch !== '\u2028' && ch !== '\u2029' : ch !== '/';
        current[i + 1] = star
          ? Number(previous[i + 1] === 1 || (current[i] === 1 && consumes))
          : Number(previous[i] === 1 && consumes);
      }
      [previous, current] = [current, previous];
    }
    if (!directory && previous[path.length] === 1) return true;
    if (directory || !anchored) for (let i = 0; i < path.length; i += 1) if (previous[i] === 1 && path[i] === '/') return true;
    return false;
  };
}

export function parseOwnerList(text: string): { readonly rule: NeverShipRule; readonly patterns: readonly string[] } | null {
  const lines = text.split(/\r?\n/);
  const compiled: ((path: string) => boolean)[] = [];
  const patterns: string[] = [];
  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    compiled.push(compilePattern(trimmed, index + 1));
    patterns.push(trimmed);
  });
  if (compiled.length === 0) return null;
  return { rule: { name: 'owner-list', match: path => { const skeleton = matchingSkeleton(path); return compiled.some(match => match(skeleton)); } }, patterns };
}
