import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runDeclaredCheck } from '../box-package/commands.js';
import type { CheckRecord } from '../box-package/commands.js';
import { BountyRefused } from './errors.js';
import { GitFailed, git, gitBlob, gitOutcome, gitWriteBlob } from './git.js';
import type { BountyManifest } from './manifest.js';
import { BUILTIN_RULES, loadOwnerList } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
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
// never-ship rules would strip (.git, .box, secrets, keys, and anything the
// owner's .boxignore names — the same table create enforced outbound) and
// links of any kind are refused by name: foreign bytes enter the repository
// only as plain file content through the merge.
export function extractAnswerChange(manifest: BountyManifest, repoDir: string, rules: readonly NeverShipRule[]): AnswerChange {
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
      const rule = rules.find(candidate => candidate.match(lower));
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

// Every uncommitted path in the worktree, read under the repository's own
// config — the same view the merge uses. `status --porcelain -z` through
// gitOutcome: the trimming `git()` wrapper would eat the leading space of a
// first-line `' M path'` entry and silently mis-parse it, and -z removes
// quoting and rename arrows. Ignored files are invisible to porcelain by
// design; the ignored-file boundary below covers them.
function porcelainDirty(repoRoot: string): string[] {
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
    dirty.push(path);
  }
  return dirty.sort();
}

const covers = (dirty: string, touched: ReadonlySet<string>): boolean => {
  const lower = dirty.toLowerCase();
  for (const touchedPath of touched) {
    if (lower === touchedPath || (lower.endsWith('/') && touchedPath.startsWith(lower)) || (touchedPath.endsWith('/') && lower.startsWith(touchedPath))) return true;
  }
  return false;
};

// Raw bytes of every path the merge could write — captured before it runs and
// restored after a conflict abort or a refusal, so the worktree comes back
// byte-identical regardless of the host's eol filters. git's own `merge
// --abort` restores index and merge state; it does not promise the worktree
// bytes (a refused merge can smudge files through core.autocrlf mid-attempt),
// which is why the bytes are saved here. null means the path did not exist
// before the merge — it is removed on restore.
function snapshotBytes(repoRoot: string, paths: ReadonlySet<string>): Map<string, Buffer | null> {
  const saved = new Map<string, Buffer | null>();
  for (const path of paths) {
    const target = join(repoRoot, ...path.split('/'));
    const stat = statSync(target, { throwIfNoEntry: false });
    saved.set(path, stat?.isFile() === true ? readFileSync(target) : null);
  }
  return saved;
}

function restoreBytes(repoRoot: string, saved: ReadonlyMap<string, Buffer | null>): void {
  for (const [path, bytes] of saved) {
    const target = join(repoRoot, ...path.split('/'));
    if (bytes === null) rmSync(target, { force: true });
    else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); }
  }
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
  // Worktree boundary, checked BEFORE the merge runs, under the repository's
  // own config — the same view the merge itself uses, so a file that is clean
  // under this repo's convention (CRLF bytes in an autocrlf checkout) never
  // draws a false refusal and a real dirty path is named before git can touch
  // it. The paths at stake are exactly the merge-base→answer delta: the
  // solver's change, nothing more.
  //
  // Two kinds of blocking work, refused by name together:
  //  - uncommitted content on a touched path — porcelain sees it (modified,
  //    staged, untracked);
  //  - a file that exists at a touched path but is not in the index — an
  //    ignored file, invisible to porcelain, which `git merge` would overwrite
  //    silently. That is clobber, not a merge: refuse first.
  const mergeBase = gitOutcome(repoRoot, ['merge-base', 'HEAD', record.answer.commit]).stdout.split('\n')[0]!.trim();
  const deltaPaths = /^[0-9a-f]{40}$/.test(mergeBase)
    ? gitOutcome(repoRoot, ['diff', '--name-only', '-z', mergeBase, record.answer.commit]).stdout
        .split('\0').filter(name => name !== '')
    : [...record.answer.changed, ...record.answer.added, ...record.answer.deleted];
  const touched = new Set([...deltaPaths, ...record.answer.changed, ...record.answer.added, ...record.answer.deleted].map(path => path.toLowerCase()));
  const dirty = porcelainDirty(repoRoot);
  const tracked = new Set(gitOutcome(repoRoot, ['ls-files', '-z']).stdout.split('\0').filter(name => name !== '').map(name => name.toLowerCase()));
  const blockedDirty = dirty.filter(path => covers(path, touched));
  const blockedDirtyKeys = new Set(blockedDirty.map(path => path.toLowerCase()));
  const blockedClobber = [...new Set(deltaPaths)].filter(path =>
    !blockedDirtyKeys.has(path.toLowerCase()) && !tracked.has(path.toLowerCase())
    && statSync(join(repoRoot, ...path.split('/')), { throwIfNoEntry: false }) !== undefined);
  const blocked = [...blockedDirty, ...blockedClobber].sort();
  if (blocked.length > 0) {
    throw new BountyRefused('apply-worktree-dirty', `uncommitted work in ${blocked.join(', ')} would be overwritten by the merge — commit it, stash it or move it aside, then run box bounty apply ${id} again`);
  }
  const message = [
    `box bounty ${record.id}: ${record.title}`,
    '',
    `answer: ${record.answer.commit}`,
    `snapshot: ${record.snapshot.commit}`
  ].join('\n');
  // The merge runs under the repository's own config — pinning eol filters off
  // would make every file clean under the repo's convention look modified to
  // the merge and break apply on an ordinary autocrlf checkout. Byte identity
  // on abort is guaranteed by the saved bytes, not by filters: the delta plus
  // every dirty path is captured raw before the merge runs.
  const saved = snapshotBytes(repoRoot, new Set([...deltaPaths, ...dirty]));
  const merged = gitOutcome(repoRoot, [
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
    const paths = gitOutcome(repoRoot, ['diff', '--name-only', '-z', '--diff-filter=U']).stdout
      .split('\0').filter(line => line !== '').sort();
    const aborted = gitOutcome(repoRoot, ['merge', '--abort']);
    if (aborted.status !== 0) {
      throw new GitFailed(`git merge --abort failed in ${repoRoot} after a conflict in ${paths.join(', ')}: ${aborted.stderr.trim()} — resolve the merge state by hand`);
    }
    restoreBytes(repoRoot, saved);
    record.conflicts = { paths, at: new Date().toISOString() };
    persistRecord(repoRoot, record);
    return { record, outcome: 'conflict', conflicts: paths };
  }
  restoreBytes(repoRoot, saved);
  const detail = tail(`${merged.stderr}\n${merged.stdout}`.trim());
  if (/local changes|untracked working tree files|would be overwritten/i.test(detail)) {
    throw new BountyRefused('apply-worktree-dirty', `git merge refused: ${detail}`);
  }
  throw new BountyRefused('merge-failed', `git merge could not land answer ${record.answer.commit} on ${repoRoot}: ${detail}`);
}

// The declared setup+check runs on the SHIPPED set plus the answer — the same
// file list `create` emitted and the solver edited, not the raw snapshot
// commit. Checking out the whole commit would materialise never-ship files and
// .box records the solver never saw, and a check could fail on bytes that were
// never in the bounty. Emission is `cat-file` per manifest path: raw recorded
// blob bytes, hash-checked against the manifest so a corrupt snapshot names
// itself instead of running a phantom tree. Any non-pass ends the bounty
// `rejected` with the failure class, exit and output tail recorded; pass
// returns null.
function verifyAnswer(record: BountyRecord, manifest: BountyManifest, repoRoot: string, change: AnswerChange, repoDir: string): string | null {
  const runRoot = mkdtempSync(join(tmpdir(), 'box-bt3-verify-'));
  try {
    const dir = join(runRoot, 'work');
    mkdirSync(dir, { recursive: true });
    for (const file of manifest.files) {
      const blob = gitBlob(repoRoot, record.snapshot.commit, file.path);
      if (blob === null || sha256(blob) !== file.sha256) {
        throw new BountyRefused('snapshot-corrupt', `snapshot ${record.snapshot.commit} cannot reproduce ${file.path} at the recorded sha256 — the version this answer was made for is damaged beyond use; end the bounty with box bounty reject ${record.id} --reason "snapshot corrupt"`);
      }
      const target = join(dir, ...file.path.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, blob);
    }
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
  // Never-ship applies to the return exactly as it did outbound: built-ins plus
  // the owner's .boxignore. An answer cannot smuggle a path create would have
  // stripped — it is refused by name before anything is extracted.
  const ownerList = loadOwnerList(repoRoot);
  const rules: readonly NeverShipRule[] = ownerList === null ? BUILTIN_RULES : [...BUILTIN_RULES, ownerList.rule];
  const change = extractAnswerChange(manifest, repoDir, rules);
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
