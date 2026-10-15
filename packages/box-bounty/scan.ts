// ---------------------------------------------------------------------------
// The pre-publish scan (BT8). With no preview read by a person any more, what
// is about to be published for the first time is scanned for things shaped
// like secrets before it goes out — the stated, small pattern list below,
// kept in step with BOUNTY.md. A hit names file and line, never the value,
// and holds that one bounty for the owner. Not proof of absence — a
// protection of the owner's, like never-ship, not a judgement on the agent.
// No setting switches it off.
// ---------------------------------------------------------------------------

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

// Scan a unified diff's added lines — the bytes being published for the
// first time — tracking the new file's path and line numbers. Context and
// removed lines are already public or are leaving, never arriving.
export function scanPatch(diff: string): ScanHit[] {
  const hits: ScanHit[] = [];
  let path = '(unknown)';
  let lineNo = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      path = line.slice(4).trim().replace(/^b\//, '').replace(/^"(.*)"$/, '$1');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk !== null) { lineNo = Number.parseInt(hunk[1]!, 10) - 1; continue; }
    if (line.startsWith('+')) { lineNo += 1; scanLine(path, lineNo, line.slice(1), hits); continue; }
    if (line.startsWith(' ')) lineNo += 1;
  }
  return hits;
}

// `git diff -p` prints one `Binary files …` line for each file it treats as
// binary and no added-line text for it — the scan has nothing to read there.
// The path is named as a fact: it was not scanned. That is never a hold —
// the owner's never publish list is the way to keep such a file out.
export function binaryPatchPaths(diff: string): string[] {
  const paths: string[] = [];
  for (const line of diff.split('\n')) {
    const found = /^Binary files .* and b\/(.+) differ$/.exec(line);
    if (found !== null) paths.push(found[1]!.replace(/^"(.*)"$/, '$1'));
  }
  return paths;
}

// The same line drawn on bytes read directly: a NUL inside the head is what
// makes Git call a file binary.
const binaryBytes = (bytes: Buffer): boolean => bytes.subarray(0, 8000).includes(0);
export const looksBinary = binaryBytes;
