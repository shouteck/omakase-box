import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runDeclaredCheck } from '../box-package/commands.js';
import type { CheckRecord } from '../box-package/commands.js';
import { BountyRefused } from './errors.js';
import { GitFailed, git, gitOutcome, gitWriteBlob } from './git.js';
import type { BountyManifest } from './manifest.js';
import { BUILTIN_RULES } from './never-ship.js';
import { dropDurabilityRefs, isOpenStage, loadRecord, persistRecord, refName, transitionTo } from './record.js';
import type { BountyRecord } from './record.js';

// `bounty answer` — the return journey. A solver hands back the whole bounty
// folder (`bounty.json` + `repo/`); this module binds it, extracts the change,
// proves it, and lands it:
//
//   bind     — bounty.json must name this id and this snapshot.commit, and its
//              bytes must hash to the manifestSha256 the record pinned at
//              create. Anything else is a named refusal, never a crash.
//   extract  — compare repo/ against the manifest's per-file sha256: changed,
//              added, deleted. No diff text, no git inside the answer folder.
//   prove    — mechanical bounties recreate the snapshot in a clean directory
//              (the same temporary-index + checkout-index recipe the tests use),
//              apply the change there, and run the declared setup+check exactly
//              as `create` did. Reviewed bounties land at `answered`.
//   land     — the change becomes an answer commit on the snapshot's base
//              commit, built on a temporary index, and `apply` merges it with
//              git's own three-way machinery. Foreign bytes never touch the
//              worktree except through `git merge`; a conflict aborts
//              byte-identical and a dirty worktree the merge would overwrite
//              is a named refusal made before the merge can run.
//
// Rejection reasons model verify.ts's failure classes: a check or setup that
// cannot run (environment-failure) is not the same state as a check that ran
// and failed (implementation-failure); the class, exit and output tail are
// recorded on the `rejected` event.

const COMMAND_TIMEOUT_MS = 300_000;
const TAIL = 2000;

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');
const toPosix = (path: string): string => path.split('\\').join('/');
const tail = (text: string): string => text.slice(-TAIL);
const describeCommand = (argv: readonly string[]): string => argv.map(token => (token.includes(' ') ? JSON.stringify(token) : token)).join(' ');

const endedRefusal = (record: BountyRecord): BountyRefused =>
  new BountyRefused('already-ended', `bounty ${record.id} already ended (${record.stage}) — an ended bounty takes no further transitions; the record is its history`);

export interface AnswerChange {
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
}

interface AnswerFolder {
  readonly manifest: BountyManifest;
  readonly manifestBytes: Buffer;
  readonly repoDir: string;
}

export interface AnswerResult {
  readonly record: BountyRecord;
  /** `answered`: reviewed, waiting on a person. `applied`: merged. `conflict`:
      verified/answered, merge aborted clean, paths recorded. `rejected`: ended. */
  readonly outcome: 'answered' | 'applied' | 'conflict' | 'rejected';
  readonly mergeCommit?: string | undefined;
  readonly conflicts?: readonly string[] | undefined;
  readonly rejection?: string | undefined;
}

export interface ApplyResult {
  readonly record: BountyRecord;
  readonly outcome: 'applied' | 'conflict';
  readonly mergeCommit?: string | undefined;
  readonly conflicts?: readonly string[] | undefined;
}

function readAnswerFolder(fromDir: string): AnswerFolder {
  const folder = resolve(fromDir);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new BountyRefused('answer-malformed', `--from ${fromDir} is not a directory — the answer is the whole bounty folder handed back`);
  }
  const manifestPath = join(folder, 'bounty.json');
  const repoDir = join(folder, 'repo');
  if (!existsSync(manifestPath)) {
    throw new BountyRefused('answer-malformed', `${manifestPath} does not exist — the answer is the whole bounty folder with its original bounty.json`);
  }
  if (!existsSync(repoDir) || !statSync(repoDir).isDirectory()) {
    throw new BountyRefused('answer-malformed', `${repoDir} does not exist — the answer folder must contain the bounty.json it shipped with and a repo/ tree`);
  }
  const manifestBytes = readFileSync(manifestPath);
  let manifest: BountyManifest | null = null;
  try {
    const parsed = JSON.parse(manifestBytes.toString('utf8')) as BountyManifest;
    if (parsed !== null && typeof parsed === 'object' && parsed.kind === 'box-bounty'
      && typeof parsed.id === 'string' && typeof parsed.snapshot?.commit === 'string'
      && Array.isArray(parsed.files) && parsed.files.every(file => typeof file?.path === 'string' && typeof file?.sha256 === 'string')) {
      manifest = parsed;
    }
  } catch {
    manifest = null;
  }
  if (manifest === null) {
    throw new BountyRefused('answer-malformed', `${manifestPath} is not a readable bounty manifest — hand the folder back with the bounty.json it shipped with`);
  }
  return { manifest, manifestBytes, repoDir };
}

// The change, extracted by comparing repo/ against the manifest's per-file
// sha256 — never a diff text, never git inside the answer. Entries the
// never-ship rules would strip (.git, .box, secrets, keys) and links of any
// kind are refused by name: foreign bytes enter the repository only as plain
// file content through the merge.
export function extractAnswerChange(manifest: BountyManifest, repoDir: string): AnswerChange {
  const expected = new Map<string, { readonly path: string; readonly sha256: string }>();
  for (const file of manifest.files) expected.set(file.path.toLowerCase(), file);
  const seen = new Set<string>();
  const changed: string[] = [];
  const added: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new BountyRefused('answer-unsafe-path', `the returned repo/ holds a link at ${relPath} — an answer carries plain files only; replace it with real content`);
      }
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relPath);
        continue;
      }
      if (!entry.isFile()) {
        throw new BountyRefused('answer-unsafe-path', `the returned repo/ holds a non-file entry at ${relPath} — an answer carries plain files only`);
      }
      const lower = relPath.toLowerCase();
      const rule = BUILTIN_RULES.find(candidate => candidate.match(lower));
      if (rule !== undefined) {
        throw new BountyRefused('answer-never-ship', `the returned repo/ contains ${relPath}, which the never-ship rule '${rule.name}' removes — an answer cannot reintroduce what the boundary strips`);
      }
      const bytes = readFileSync(join(dir, entry.name));
      const hit = expected.get(lower);
      seen.add(lower);
      if (hit === undefined) added.push(relPath);
      else if (sha256(bytes) !== hit.sha256) changed.push(hit.path); // land under the manifest's spelling
    }
  };
  walk(repoDir, '');
  const deleted = [...expected.keys()].filter(lower => !seen.has(lower)).map(lower => expected.get(lower)!.path);
  const change = { changed: changed.sort(), added: added.sort(), deleted: deleted.sort() };
  if (change.changed.length === 0 && change.added.length === 0 && change.deleted.length === 0) {
    throw new BountyRefused('answer-empty', `the returned repo/ is byte-identical to what the bounty shipped — a return that changes nothing is no answer. Edit repo/ and hand it back`);
  }
  return change;
}

// The answer commit is seeded from the BASE commit's tree, not the snapshot's:
// the merge's incoming delta must be exactly the solver's change. Seeding from
// the snapshot would drag every uncommitted edit and untracked file that was
// live at create time into the merge, and git would refuse to land it over the
// still-uncommitted worktree — the common case, since snapshotting uncommitted
// work is what `create` is for. Deletions apply only where the base tree has
// the path (a file untracked at create is simply absent again).
//
// `hash-object --stdin` writes the solver's bytes as blobs with no filters;
// update-index places them. The real index, the worktree and the current
// branch are never touched. With an unborn HEAD at create (baseCommit null)
// the snapshot commit itself is the base.
function buildAnswerCommit(repoRoot: string, record: BountyRecord, change: AnswerChange, repoDir: string): string {
  const base = record.snapshot.baseCommit ?? record.snapshot.commit;
  const work = mkdtempSync(join(tmpdir(), 'box-bt3-index-'));
  try {
    const env = { GIT_INDEX_FILE: join(work, 'index') };
    git(repoRoot, ['read-tree', base], env);
    for (const path of change.deleted) {
      if (gitOutcome(repoRoot, ['cat-file', '-e', `${base}:${path}`]).status === 0) {
        git(repoRoot, ['update-index', '--force-remove', '--', path], env);
      }
    }
    for (const path of [...change.changed, ...change.added]) {
      const blob = gitWriteBlob(repoRoot, readFileSync(join(repoDir, ...path.split('/'))));
      git(repoRoot, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], env);
    }
    const tree = git(repoRoot, ['write-tree'], env);
    return git(repoRoot, [
      '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
      'commit-tree', tree, '-p', base,
      '-m', `box-bounty answer ${record.id}\n\nmade against snapshot ${record.snapshot.commit}\n${change.changed.length} changed, ${change.added.length} added, ${change.deleted.length} deleted`
    ], env);
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

const runOne = (argv: readonly string[], name: string, root: string): CheckRecord => {
  const [program, ...args] = argv;
  return runDeclaredCheck({ name, program: program!, args, cwd: '.', context: 'recipient', timeoutMs: COMMAND_TIMEOUT_MS }, root);
};

// Uncommitted paths the merge would overwrite. `status --porcelain -z` through
// gitOutcome — the trimming `git()` wrapper would eat the leading space of a
// first-line `' M path'` entry and silently mis-parse it; -z also removes
// quoting and rename arrows. A `??` dir entry still counts if a touched path
// sits under it (or it under one).
function dirtyPaths(repoRoot: string, touched: ReadonlySet<string>): string[] {
  const outcome = gitOutcome(repoRoot, ['status', '--porcelain', '-z']);
  if (outcome.status !== 0) {
    throw new GitFailed(`git status failed in ${repoRoot}: ${(outcome.stderr || outcome.stdout).trim()}`);
  }
  const dirty: string[] = [];
  const entries = outcome.stdout.split('\0');
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (entry.length < 4) continue;
    const path = entry.slice(3);
    if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') i += 1; // -z renames carry the source as a second entry
    const lower = path.toLowerCase();
    for (const touchedPath of touched) {
      if (lower === touchedPath || (lower.endsWith('/') && touchedPath.startsWith(lower)) || (touchedPath.endsWith('/') && lower.startsWith(touchedPath))) {
        dirty.push(path);
        break;
      }
    }
  }
  return dirty.sort();
}

// `apply`: git's own three-way merge lands the recorded answer commit onto the
// repository as it stands — never raw writes into the worktree. A conflict
// aborts the merge (worktree and index come back byte-identical) and the record
// keeps its stage with the conflicting paths as the next step. Uncommitted
// changes the merge would overwrite are a named refusal, not damage.
export function applyBounty(repoRoot: string, id: string): ApplyResult {
  const record = loadRecord(repoRoot, id);
  if (!isOpenStage(record.stage)) throw endedRefusal(record);
  if (record.stage !== 'answered' && record.stage !== 'verified') {
    throw new BountyRefused('wrong-stage', `bounty ${id} is ${record.stage} — apply merges an answer that has come back; nothing has arrived for this bounty yet`);
  }
  if (record.answer === null || record.answer === undefined) {
    throw new BountyRefused('answer-missing', `bounty ${id} is ${record.stage} but the record names no answer commit — hand the folder back through box bounty answer ${id} --from <dir>`);
  }
  if (gitOutcome(repoRoot, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0) {
    throw new BountyRefused('merge-in-progress', `a merge is already in progress in ${repoRoot} — finish it or run git merge --abort before applying a bounty`);
  }
  // Worktree boundary, checked BEFORE the merge runs: the paths git would
  // overwrite are exactly the merge-base→answer delta (the solver's change,
  // nothing more). Untracked files in the way count as dirty. Refusing here is
  // load-bearing — a refused `git merge` is not byte-preserving on autocrlf
  // hosts: it smudges worktree files during the attempt.
  const mergeBase = gitOutcome(repoRoot, ['merge-base', 'HEAD', record.answer.commit]).stdout.split('\n')[0]!.trim();
  const touched = /^[0-9a-f]{40}$/.test(mergeBase)
    ? new Set(gitOutcome(repoRoot, ['diff', '--name-only', '-z', mergeBase, record.answer.commit]).stdout
        .split('\0').filter(name => name !== '').map(name => name.toLowerCase()))
    : new Set([...record.answer.changed, ...record.answer.added, ...record.answer.deleted].map(path => path.toLowerCase()));
  const blocked = dirtyPaths(repoRoot, touched);
  if (blocked.length > 0) {
    throw new BountyRefused('apply-worktree-dirty', `uncommitted changes in ${blocked.join(', ')} would be overwritten by the merge — commit or stash them, then run box bounty apply ${id} again`);
  }
  const message = [
    `box bounty ${record.id}: ${record.title}`,
    '',
    `answer: ${record.answer.commit}`,
    `snapshot: ${record.snapshot.commit}`
  ].join('\n');
  // core.autocrlf=false pins the merge's bytes to the recorded identifiers:
  // extracted files land as raw blob bytes, and a later --abort restores the
  // worktree byte-identical instead of re-smudging through the host's filters.
  const merged = gitOutcome(repoRoot, [
    '-c', 'core.autocrlf=false',
    '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
    'merge', '--no-ff', '-m', message, record.answer.commit
  ]);
  if (merged.status === 0) {
    const mergeCommit = git(repoRoot, ['rev-parse', 'HEAD']);
    record.conflicts = null;
    transitionTo(repoRoot, record, 'applied');
    // The bounty ended: the durability refs' work is done.
    dropDurabilityRefs(repoRoot, id);
    return { record, outcome: 'applied', mergeCommit };
  }
  const mergeHead = gitOutcome(repoRoot, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
  if (mergeHead.status === 0) {
    const paths = gitOutcome(repoRoot, ['diff', '--name-only', '--diff-filter=U']).stdout
      .split('\n').map(line => line.trim()).filter(line => line !== '').sort();
    const aborted = gitOutcome(repoRoot, ['-c', 'core.autocrlf=false', 'merge', '--abort']);
    if (aborted.status !== 0) {
      throw new GitFailed(`git merge --abort failed in ${repoRoot} after a conflict in ${paths.join(', ')}: ${aborted.stderr.trim()} — resolve the merge state by hand`);
    }
    record.conflicts = { paths, at: new Date().toISOString() };
    persistRecord(repoRoot, record);
    return { record, outcome: 'conflict', conflicts: paths };
  }
  const detail = tail(`${merged.stderr}\n${merged.stdout}`.trim());
  if (/local changes|untracked working tree files|would be overwritten/i.test(detail)) {
    throw new BountyRefused('apply-worktree-dirty', `git merge refused: ${detail}`);
  }
  throw new BountyRefused('merge-failed', `git merge could not land answer ${record.answer.commit} on ${repoRoot}: ${detail}`);
}

// The declared setup+check on the recreated snapshot plus the answer — exactly
// as `create` ran them. Any non-pass ends the bounty `rejected` with the
// failure class, exit and output tail recorded; pass returns null.
function verifyAnswer(record: BountyRecord, manifest: BountyManifest, repoRoot: string, change: AnswerChange, repoDir: string): string | null {
  const runRoot = mkdtempSync(join(tmpdir(), 'box-bt3-verify-'));
  try {
    const dir = join(runRoot, 'work');
    mkdirSync(dir, { recursive: true });
    const env = { GIT_INDEX_FILE: join(runRoot, 'index') };
    git(repoRoot, ['-c', 'core.autocrlf=false', 'read-tree', record.snapshot.commit], env);
    git(repoRoot, ['-c', 'core.autocrlf=false', 'checkout-index', '-a', `--prefix=${toPosix(dir)}/`], env);
    for (const path of change.deleted) rmSync(join(dir, ...path.split('/')), { force: true });
    for (const path of [...change.changed, ...change.added]) {
      const target = join(dir, ...path.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(join(repoDir, ...path.split('/'))));
    }
    if (manifest.setup !== null && manifest.setup.argv.length > 0) {
      const setup = runOne(manifest.setup.argv, 'setup', dir);
      if (setup.result === 'error' || setup.result === 'timeout') {
        return `environment-failure: setup '${describeCommand(manifest.setup.argv)}' could not run (${setup.result}) — ${tail(setup.log)}`;
      }
      if (setup.result !== 'pass') {
        return `environment-failure: setup '${describeCommand(manifest.setup.argv)}' exited ${setup.exit} — ${tail(setup.log)}`;
      }
    }
    if (manifest.check === null || manifest.check.argv.length === 0) {
      return 'environment-failure: the bounty is mechanical but the returned bounty.json names no check';
    }
    const check = runOne(manifest.check.argv, 'check', dir);
    if (check.result === 'error' || check.result === 'timeout') {
      return `environment-failure: check '${describeCommand(manifest.check.argv)}' could not run (${check.result}) — ${tail(check.log)}`;
    }
    if (check.result !== 'pass') {
      return `implementation-failure: check '${describeCommand(manifest.check.argv)}' exited ${check.exit} on the snapshot it was made for — ${tail(check.log)}`;
    }
    return null;
  } finally {
    rmSync(runRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

// `answer <id> --from <dir>`: bind, extract, prove, land. A posted bounty moves
// taken → answered (the events tell the true story); mechanical then proves the
// check on the recreated snapshot → verified → applied automatically, or
// rejected with the reason recorded.
export function answerBounty(repoRoot: string, id: string, fromDir: string): AnswerResult {
  const record = loadRecord(repoRoot, id);
  if (!isOpenStage(record.stage)) throw endedRefusal(record);
  if (record.stage !== 'posted') {
    throw new BountyRefused('not-posted', `bounty ${id} is ${record.stage}, not posted — an answer can only come back to a bounty that was delivered (box bounty post ${id} --to <dir>)`);
  }
  const { manifest, manifestBytes, repoDir } = readAnswerFolder(fromDir);
  if (manifest.id !== id) {
    throw new BountyRefused('answer-mismatch', `the returned bounty.json names ${manifest.id}, not ${id} — this answer belongs to a different bounty`);
  }
  if (manifest.snapshot.commit !== record.snapshot.commit) {
    throw new BountyRefused('snapshot-mismatch', `the returned bounty.json pins snapshot ${manifest.snapshot.commit} but ${id} was made for ${record.snapshot.commit} — the answer does not match the version it must land on`);
  }
  if (record.manifestSha256 !== undefined && sha256(manifestBytes) !== record.manifestSha256) {
    throw new BountyRefused('manifest-tampered', `the returned bounty.json is not byte-identical to the one this bounty shipped — it binds the answer and must come back unmodified; edit repo/ only`);
  }
  const change = extractAnswerChange(manifest, repoDir);
  if (gitOutcome(repoRoot, ['rev-parse', '--verify', '-q', refName(id)]).status !== 0) {
    throw new BountyRefused('snapshot-lost', `refs/box-bounty/${id} is gone — the snapshot this answer was made for can no longer be recreated or merged from. Nothing can come back to this bounty; end it with box bounty reject ${id} --reason "snapshot lost"`);
  }
  const commit = buildAnswerCommit(repoRoot, record, change, repoDir);
  transitionTo(repoRoot, record, 'taken');
  transitionTo(repoRoot, record, 'answered');
  record.answer = { commit, changed: change.changed, added: change.added, deleted: change.deleted };
  record.conflicts = null;
  persistRecord(repoRoot, record);
  // Durability refs: refs/box-bounty/<id> keeps the snapshot commit alive;
  // <id>-answer keeps the answer commit alive. The answer's parent is the base
  // commit, so it does not reach the snapshot — both refs are needed, and end
  // stages delete both.
  git(repoRoot, ['update-ref', `${refName(id)}-answer`, commit]);

  if (record.level !== 'mechanical') {
    return { record, outcome: 'answered' };
  }
  const rejection = verifyAnswer(record, manifest, repoRoot, change, repoDir);
  if (rejection !== null) {
    transitionTo(repoRoot, record, 'rejected', { reason: rejection });
    dropDurabilityRefs(repoRoot, id);
    return { record, outcome: 'rejected', rejection };
  }
  transitionTo(repoRoot, record, 'verified');
  const applied = applyBounty(repoRoot, id);
  if (applied.outcome === 'conflict') {
    return { record: applied.record, outcome: 'conflict', conflicts: applied.conflicts };
  }
  return { record: applied.record, outcome: 'applied', mergeCommit: applied.mergeCommit };
}
