// ---------------------------------------------------------------------------
// The pre-publish scan (BT8). With no preview read by a person any more, what
// is about to be published for the first time is scanned for things shaped
// like secrets before it goes out — the stated, small pattern list below,
// kept in step with BOUNTY.md. A hit names file and line, never the value,
// and holds that one bounty for the owner. Not proof of absence — a
// protection of the owner's, like never-ship, not a judgement on the agent.
// No setting switches it off.
// ---------------------------------------------------------------------------

import { showPath } from './notice.js';

export interface SecretRule { readonly name: string; readonly pattern: RegExp }

// The stated list. Each name is what a hit reports.
export const SECRET_RULES: readonly SecretRule[] = [
  { name: 'private-key-block', pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: 'gitlab-token', pattern: /\bglpat-[A-Za-z0-9_-]{15,}\b/ },
  { name: 'aws-access-key-id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'openai-key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'stripe-key', pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { name: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'passworded-connection-string', pattern: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|redis|amqps?|mssql|cockroachdb):\/\/[^\s:'/@]+:[^\s'"@]+@/ },
  // A long random-looking string assigned to a key/secret/token/password-
  // like name: `name = "value"`, `name: "value"` or the bare `name=value`
  // env-file spelling (BT8c). Long enough and mixed enough that ordinary
  // code mentioning such names does not match — a short token, a getter
  // call (the unquoted form refuses a value that continues into `(`) or a
  // plain-words value is not a hit. The unquoted arm cannot span a `.`:
  // `name: some.long.member.access` is code, not a value — a dotted
  // env spelling is one of the stated misses, quoted forms still read.
  { name: 'assigned-secret', pattern: /\b(?:[a-z0-9_.[\]-]*?(?:secret|token|passw(?:or)?d|api[-_]?key|access[-_]?key|private[-_]?key|client[-_]?secret|auth[-_]?token)[a-z0-9_.[\]-]*)\s*[:=]\s*(?:['"]([A-Za-z0-9+/=_.~-]{20,})['"]|([A-Za-z0-9+/=~-]{20,})(?![A-Za-z0-9+/=_.~(]))/i }
];

// "Long random": at least two character classes among lower, upper, digit —
// "application/octet-stream" or a sentence is not a secret.
const randomEnough = (value: string): boolean =>
  [/[a-z]/, /[A-Z]/, /[0-9]/].filter(re => re.test(value)).length >= 2;

export interface ScanHit {
  readonly path: string;
  readonly line: number;
  readonly rule: string;
  /** The first-published commit carrying the hit — named on the hold so the
      agent knows an ordinary git push would publish it too. */
  readonly commit?: string;
}

// Scan one line's text. The assigned-secret rule checks its captured value
// for the mixed classes — the pattern alone cannot say "random".
function scanLine(path: string, lineNo: number, text: string, hits: ScanHit[]): void {
  for (const rule of SECRET_RULES) {
    const found = rule.pattern.exec(text);
    if (found === null) continue;
    if (rule.name === 'assigned-secret' && !randomEnough(found[1] ?? found[2] ?? '')) continue;
    hits.push({ path, line: lineNo, rule: rule.name });
    return; // one hit per line is enough — the line is named, not counted
  }
}

// Scan plain text (a named untracked file) line by line.
export function scanText(path: string, text: string): ScanHit[] {
  const hits: ScanHit[] = [];
  text.split('\n').forEach((line, index) => scanLine(path, index + 1, line, hits));
  return hits;
}

// The bounty's own text (BT45): the title, the why and the task text at
// create, and what a post publishes (issue title, issue body, why on the
// shared memory) — read by the same rules, one label per field. A hit's
// `path` is the label; it has no file, so no publish list can settle it:
// the content is removed and the bounty created again.
export const TEXT_FIELDS = ['(title)', '(why)', '(task text)', '(issue title)', '(issue body)'] as const;
export type TextField = typeof TEXT_FIELDS[number];
export const isTextField = (path: string): path is TextField => (TEXT_FIELDS as readonly string[]).includes(path);
export function scanFields(fields: readonly (readonly [TextField, string])[]): ScanHit[] {
  return fields.flatMap(([label, text]) => scanText(label, text));
}
// Where a hit is, as printed: a field is the tool's own label; a file path
// is quoted like every path the tool prints (BT43).
export const hitPlace = (hit: { readonly path: string; readonly line: number }): string =>
  isTextField(hit.path) ? `${hit.path} line ${hit.line}` : `${showPath(hit.path)}:${hit.line}`;

// A file name as a patch header spells it (BT54): Git quotes a name holding a
// quote, a backslash, a control byte or (unless core.quotepath is off) a
// non-ASCII byte as "caf\303\251.txt". Undo that into the real name, then
// drop one leading a/ or b/ — only one, so a file literally named b/x stays.
const SIMPLE_ESCAPES: Readonly<Record<string, number>> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
function fileName(text: string): string {
  let name = text.trim();
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    const inner = name.slice(1, -1);
    const bytes: number[] = [];
    for (let at = 0; at < inner.length; at += 1) {
      const char = inner[at]!;
      const octal = char === '\\' ? /^[0-7]{3}/.exec(inner.slice(at + 1)) : null;
      if (octal !== null) { bytes.push(Number.parseInt(octal[0], 8)); at += 3; continue; }
      const simple = char === '\\' ? SIMPLE_ESCAPES[inner[at + 1] ?? ''] : undefined;
      if (simple !== undefined) { bytes.push(simple); at += 1; continue; }
      bytes.push(...Buffer.from(char, 'utf8'));
    }
    name = Buffer.from(bytes).toString('utf8');
  }
  return name.replace(/^[ab]\//, '');
}

// Scan a unified diff's added lines — the bytes being published for the
// first time — tracking the new file's path and line numbers. Context and
// removed lines are already public or are leaving, never arriving.
//
// Read the way `git apply` reads a patch (BT54): file headers only between
// `diff --git` and the first `@@` of that file, and inside a hunk the counts
// from its `@@` line say what each line is. So an added line whose text is
// `++ x` (written `+++ x`) is an added line and is scanned, never a header.
export function scanPatch(diff: string): ScanHit[] {
  const hits: ScanHit[] = [];
  let path = '(unknown)';
  let lineNo = 0;
  let oldLeft = 0;
  let newLeft = 0;
  let inHeader = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) { inHeader = true; path = '(unknown)'; oldLeft = 0; newLeft = 0; continue; }
    if (inHeader && line.startsWith('+++ ')) {
      const rest = line.slice(4);
      if (rest.trim() !== '/dev/null') path = fileName(rest);
      continue;
    }
    if (inHeader && line.startsWith('--- ')) {
      const rest = line.slice(4);
      if (path === '(unknown)' && rest.trim() !== '/dev/null') path = fileName(rest);
      continue;
    }
    if (inHeader || (oldLeft === 0 && newLeft === 0)) {
      const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (hunk !== null) {
        oldLeft = hunk[1] === undefined ? 1 : Number.parseInt(hunk[1], 10);
        newLeft = hunk[3] === undefined ? 1 : Number.parseInt(hunk[3], 10);
        lineNo = Number.parseInt(hunk[2]!, 10) - 1;
        inHeader = false;
      }
      continue;
    }
    if (line.startsWith('\\')) continue; // `\ No newline at end of file`
    if (line.startsWith('+') && newLeft > 0) { newLeft -= 1; lineNo += 1; scanLine(path, lineNo, line.slice(1), hits); continue; }
    if (line.startsWith('-') && oldLeft > 0) { oldLeft -= 1; continue; }
    if ((line.startsWith(' ') || line === '') && oldLeft > 0 && newLeft > 0) { oldLeft -= 1; newLeft -= 1; lineNo += 1; }
  }
  return hits;
}

// `git diff -p` prints one `Binary files …` line for each file it treats as
// binary and no added-line text for it — the scan has nothing to read there.
// The path is named as a fact: it was not scanned. That is never a hold —
// the owner's never publish list is the way to keep such a file out.
// Read only where Git writes it, in a file's header (BT54): a content line
// that happens to read `Binary files … differ` is text, not a binary file.
export function binaryPatchPaths(diff: string): string[] {
  const paths: string[] = [];
  let inHeader = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) { inHeader = true; continue; }
    if (inHeader && line.startsWith('@@ ')) { inHeader = false; continue; }
    if (!inHeader) continue;
    const found = /^Binary files (".*"|\S+) and (".*"|.+) differ$/.exec(line);
    if (found !== null) paths.push(fileName(found[2]!.trim() === '/dev/null' ? found[1]! : found[2]!));
  }
  return paths;
}

// The same line drawn on bytes read directly: a NUL inside the head is what
// makes Git call a file binary.
const binaryBytes = (bytes: Buffer): boolean => bytes.subarray(0, 8000).includes(0);
export const looksBinary = binaryBytes;
