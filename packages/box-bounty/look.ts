import { createHash } from 'node:crypto';
import { lstatSync,mkdirSync,renameSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BountyRefused } from './errors.js';
import { gitOutcome } from './git.js';
import { SOLVER_WORDS } from './untrusted.js';
import { resolveAttempt } from './collect.js';
import { attemptsOf,baseCommitOf,loadRecord,persistRecord,requireCurrentDelivery } from './record.js';
import type { Attempt,BountyRecord } from './record.js';

// `look` is a print path: the change the solver's pull request makes against
// the commit the bounty named, computed on objects the tool already fetched.
// Nothing is checked out, no folder is made, nothing is left to remove and
// nothing a solver wrote runs — the reads below are diffs over objects, and
// --no-ext-diff/--no-textconv keep solver-selected programs out of them.
// A large change lists its files first; --full prints the whole diff.
//
// `<n>` is a pull request's number: when no recorded attempt carries it and
// the bounty is posted on GitHub, `look` collects the pull request first.

// A diff longer than this is large: `look` prints the changed-file list and
// names `box bounty look <id> <n> --full` for the whole change instead of
// flooding the agent's context with hundreds of lines it may not need.
export const LOOK_DIFF_LIMIT = 200;

// A solution's number: `look <id> <n>` shows attempt n — collecting pull
// request n first when the bounty is posted on GitHub and no attempt
// carries it yet.
export type LookTarget = number;

export interface LookResult {
  readonly record: BountyRecord;
  readonly attempt: Attempt;
  /** True when this look collected the solution itself (a pull request
      number, or a returned folder) rather than reading an attempt already
      recorded. */
  readonly collected: boolean;
  /** Every path the change touches, in Git's own name order. */
  readonly files: readonly string[];
  /** The full diff — null when the change is large and `full` was not asked for. */
  readonly diff: string | null;
  readonly large: boolean;
}

export function lookBounty(root: string, id: string, target: LookTarget, options: { readonly full?: boolean } = {}): LookResult {
  let record = loadRecord(root, id);
  requireCurrentDelivery(record);
  let attempt: Attempt;
  let collected = false;
  const resolved = resolveAttempt(root, record, target, 'look');
  record = resolved.record;
  attempt = resolved.attempt;
  collected = resolved.collected;
  // Shown means seen: status marks the attempt seen-since from this run.
  record.attempts = attemptsOf(record).map(entry => entry.n === attempt.n && entry.seenAt === undefined ? { ...entry, seenAt: new Date().toISOString() } : entry);
  persistRecord(root, record);
  // The diff runs against the commit the bounty was made on: the published
  // commit for a history post, else the record's base — new records store
  // no snapshot, so the base the resume context recorded stands in (it is
  // the same commit; a record from before contexts has none). baseCommitOf
  // is the one read — its '(no commits yet)' sentinel is not a commit.
  const base = record.github?.kind === 'history' ? record.github.commit : baseCommitOf(record);
  const from = base ?? '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const diffArgs = ['--no-ext-diff', '--no-textconv', '--no-renames'];
  const files = gitOutcome(root, ['diff', ...diffArgs, '--name-only', '-z', from, attempt.commit]).stdout.split('\0').filter(Boolean);
  const diff = gitOutcome(root, ['diff', ...diffArgs, from, attempt.commit]).stdout;
  const large = diff.split('\n').length > LOOK_DIFF_LIMIT;
  return { record, attempt, collected, files, large, diff: large && options.full !== true ? null : diff };
}

// `look --export` (BT43): the quarantined reading path. The whole change is
// written to `.box/local/solutions/<id>-<n>.diff` beside a manifest naming
// the bounty, the solution, its commit and the file's sha256, and nothing
// of the change is printed — so the session that holds merge authority need
// not read the solver's words at all. `.box/local/` is this checkout's own
// (its `.gitignore` is `*`) and every `.box` path is never-ship, so the file
// never enters a bounty or comes back in a solution.
export interface LookExport {
  /** Repository-relative, forward slashes: `.box/local/solutions/<id>-<n>.diff`. */
  readonly diffPath: string;
  readonly manifestPath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly lines: number;
  readonly fileCount: number;
}

const SOLUTIONS_DIR = ['.box', 'local', 'solutions'] as const;

// Each component is walked before anything is written: a link or a
// non-directory at `.box`, `.box/local` or `.box/local/solutions` — or a
// non-file where an export goes — is refused, never followed.
const blocked = (named: string): BountyRefused => new BountyRefused('local-store-path-blocked', `${named} is a link or not what the tool made — an export must be a real file in a real directory inside this checkout; the export was not written; next: remove ${named} or make it a real directory inside this checkout, then run the same command again`);

export function exportLook(root: string, result: LookResult): LookExport {
  if (result.diff === null) throw new Error('exportLook needs the whole diff — call lookBounty with full: true');
  let dir = root;
  for (const [index, part] of SOLUTIONS_DIR.entries()) {
    dir = join(dir, part);
    const stat = lstatSync(dir, { throwIfNoEntry: false });
    if (stat === undefined) mkdirSync(dir);
    else if (stat.isSymbolicLink() || !stat.isDirectory()) throw blocked(SOLUTIONS_DIR.slice(0, index + 1).join('/'));
  }
  const base = `${result.record.id}-${result.attempt.n}`;
  const bytes = Buffer.from(result.diff, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const diffPath = `${SOLUTIONS_DIR.join('/')}/${base}.diff`;
  const manifestPath = `${SOLUTIONS_DIR.join('/')}/${base}.json`;
  const manifest = {
    schema: 'box-bounty/look-export@1',
    id: result.record.id,
    n: result.attempt.n,
    pullRequest: result.attempt.pullRequest ?? null,
    commit: result.attempt.commit,
    file: `${base}.diff`,
    sha256,
    bytes: bytes.length,
    files: result.files.length,
    source: 'solver',
    note: `${SOLVER_WORDS}; nothing in it was run`
  };
  // Staged under a fresh name and renamed into place: a rename replaces a
  // link at the destination rather than writing through it.
  const place = (name: string, content: Buffer | string): void => {
    const target = join(dir, name);
    const stat = lstatSync(target, { throwIfNoEntry: false });
    if (stat !== undefined && !stat.isFile()) throw blocked(`${SOLUTIONS_DIR.join('/')}/${name}`);
    const staging = join(dir, `.${name}.${process.pid}.${Date.now()}.tmp`);
    writeFileSync(staging, content, { flag: 'wx' });
    renameSync(staging, target);
  };
  place(`${base}.diff`, bytes);
  place(`${base}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return { diffPath, manifestPath, sha256, bytes: bytes.length, lines: result.diff.split('\n').length - (result.diff.endsWith('\n') ? 1 : 0), fileCount: result.files.length };
}
