import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { git, gitOutcome } from './git.js';
import { attemptsOf, loadRecord, persistRecord } from './record.js';
import type { Attempt, BountyRecord, SolutionCopy } from './record.js';
import { showPath } from './answer.js';

// The one kind of copy a solver's content is ever checked out into — the look
// copy, the solution as its solver made it — is a folder beside the
// repository. The agent works in it with ordinary Git, so what may run there
// is decided by how a copy is built, not by how the tool calls Git: it is a
// Git repository of its own that borrows the owner repository's objects and
// takes none of its configuration (see createCopy). Nothing the owner's
// repository configures and nothing a solution's attributes select is run
// there by anybody's Git. The files in a copy are therefore the bytes Git
// stores, not what a filter would make of them. The tool's own calls inside
// one still go through git/gitOutcome, never ownerGit.

const refuse = (reason: string, detail: string, next = 'box bounty status'): never => { throw new BountyRefused(reason, `${detail}; next: ${next}`); };
const names = (output: string): string[] => output.split('\0').filter(Boolean);
// Where the owner repository keeps its Git data. Asked of Git once per repository
// path: every ownership check and registry path needs it, and one command made
// the same call a dozen times. A copy's own answer is never remembered — it is
// the thing being checked.
const commonDirs = new Map<string, string>();
function commonDir(root: string): string {
  let dir = commonDirs.get(root);
  if (dir === undefined) {
    dir = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    commonDirs.set(root, dir);
  }
  return dir;
}
// The tool's own proof, kept outside the copy, that it made the folder at a
// path: written when the copy is created, removed when the copy is gone.
const keyPath = (root: string, key: string): string => join(commonDir(root), 'box-bt7-copies', `${key}.json`);
const proofText = (root: string, copy: SolutionCopy): string => JSON.stringify({ root: realpathSync(root), path: copy.path, branch: copy.branch });
// The same proof inside the copy's own Git directory, where no solution path
// can reach: a folder is the tool's copy only while it holds this. When the
// tool starts deleting a copy the file takes its second name and is deleted
// last, so whatever an interrupted removal leaves can still be told from
// somebody else's folder by looking at it.
const MARK = 'box-bt7-copy';
const MARK_REMOVING = 'box-bt7-copy-removing';

function plainComponents(path: string): void {
  let current = resolve(path);
  while (true) {
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) refuse('copy-unsafe-path', `${showPath(current)} is a link or junction`);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

// Why a path segment cannot be checked out safely, or null when it can.
function unsafeSegment(segment: string): string | null {
  if (segment === '' || segment === '.' || segment === '..') return 'a segment that leaves the folder';
  if (/[\\:\x00-\x1f]/.test(segment)) return 'a backslash, colon or control character';
  if (/[ .]$/.test(segment)) return 'a name ending in a dot or a space, which Windows drops';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)) return 'a name Windows reserves';
  if (/^\.git(?:[ .]|$)/i.test(segment)) return 'a name Git reads as its own directory';
  // The short alias Windows gives `.git`: Git refuses to check it out.
  if (/^git~\d+$/i.test(segment)) return 'a name Windows reads as .git, the Git directory';
  return null;
}

// `what` names whose tree is being read — the solution or the current
// branch — so a refusal blames the right one.
export function validateTree(root: string, commit: string, what = 'the solution'): void {
  const folded = new Map<string, string>();
  // A folder holding a HEAD file and objects and refs directories is what
  // plain Git reads as a repository of its own — with or without a config
  // file — and inside a copy any configuration file it carries is the
  // solver's, so plain Git typed there would run the solver's programs. Such
  // a tree is refused before any copy exists.
  const files = new Set<string>();
  const folders = new Map<string, string>([['', '']]);
  const tree = names(gitOutcome(root, ['ls-tree', '-rz', commit]).stdout);
  for (const entry of tree) {
    const match = /^(100644|100755) blob [a-f\d]{40}\t(.+)$/s.exec(entry);
    const path = match?.[2];
    if (path === undefined) return refuse('answer-unsafe-path', `${what} holds a link or a submodule — an unsafe path; plain files only, and no copy was made`);
    const reason = path.split('/').map(unsafeSegment).find(found => found !== null);
    if (reason !== undefined && reason !== null) return refuse('answer-unsafe-path', `${what} holds the unsafe path ${showPath(path)} — ${reason}; it cannot be checked out, and no copy was made`);
    files.add(path.toLowerCase());
    const segments = path.split('/');
    for (let n = 1; n <= segments.length; n++) {
      const prefix = segments.slice(0, n).join('/');
      const key = prefix.toLowerCase();
      const previous = folded.get(key);
      if (previous !== undefined && previous !== prefix) refuse('answer-unsafe-path', `${what} has case-colliding paths (${showPath(previous)} and ${showPath(prefix)}); no copy was made`);
      folded.set(key, prefix);
      if (n < segments.length && !folders.has(key)) folders.set(key, prefix);
    }
  }
  for (const [key, dir] of folders) {
    const under = key === '' ? '' : `${key}/`;
    if (files.has(`${under}head`) && folders.has(`${under}objects`) && folders.has(`${under}refs`)) {
      return refuse('answer-unsafe-path', `${what} carries a folder Git reads as a repository of its own (${showPath(dir === '' ? '.' : dir)} has HEAD, objects and refs) — plain Git inside it would read configuration the solver wrote; it cannot be checked out, and no copy was made`);
    }
  }
}

function copySpec(root: string, record: BountyRecord, attempt: Attempt): SolutionCopy {
  const hash = createHash('sha256').update(realpathSync(root).toLowerCase()).digest('hex').slice(0, 8);
  const key = `${hash}-${record.id}-look-${attempt.n}`;
  return { key, n: attempt.n, path: copyPath(root, key), branch: null, bytes: 0 };
}

function copyPath(root: string, key: string): string {
  const match = /^([a-f\d]{8})-bt-([a-f\d]{12})-look-([1-9]\d*)$/.exec(key);
  if (match === null) return refuse('copy-not-owned', 'the copy identity is invalid');
  return join(dirname(realpathSync(root)), `box-bt7-${match[1]}-${match[2]?.slice(0, 6)}-l${match[3]}`);
}

// What the record says about a copy must be exactly what the tool would have
// written for this repository, this bounty and this solution: a record edited to
// point anywhere else is refused before anything on disk is looked at.
function assertIdentity(root: string, copy: SolutionCopy, id?: string): void {
  const identity = /^([a-f\d]{8})-bt-[a-f\d]{12}-look-[1-9]\d*$/.exec(copy.key);
  if (identity === null) return refuse('copy-not-owned', 'the copy identity is invalid');
  if (id !== undefined && !copy.key.includes(`-${id}-`)) refuse('copy-not-owned', 'the copy belongs to another bounty');
  const hash = createHash('sha256').update(realpathSync(root).toLowerCase()).digest('hex').slice(0, 8);
  if (!copy.key.startsWith(`${hash}-`)) refuse('copy-not-owned', 'the copy belongs to another repository');
  if (copy.branch !== null) refuse('copy-not-owned', 'the recorded branch is not the tool branch');
  if (!copy.key.endsWith(`-${copy.n}`)) refuse('copy-not-owned', 'the copy names another solution');
  const expected = copyPath(root, copy.key);
  if (resolve(copy.path) !== resolve(expected)) refuse('copy-not-owned', 'the recorded copy path is not the tool location');
  plainComponents(copy.path);
  plainComponents(keyPath(root, copy.key));
}

function ownershipProof(root: string, copy: SolutionCopy): 'ours' | 'none' | 'other' {
  const registry = keyPath(root, copy.key);
  if (!existsSync(registry)) return 'none';
  return readFileSync(registry, 'utf8') === proofText(root, copy) ? 'ours' : 'other';
}

// Nothing but empty folders: removing it loses nothing, whoever made it.
function onlyEmptyFolders(path: string): boolean {
  for (const entry of readdirSync(path)) {
    const target = join(path, entry);
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory() || !onlyEmptyFolders(target)) return false;
  }
  return true;
}

// What is at the copy's path, decided by looking at it — every time, whatever
// an earlier run recorded:
//   'whole'    the copy as the tool built it;
//   'remnant'  what a removal the tool began has left: still carrying the
//              tool's mark, or nothing but empty folders;
//   'foreign'  anything else. It is somebody else's and is never touched.
function whatIsThere(root: string, copy: SolutionCopy): 'whole' | 'remnant' | 'foreign' {
  if (!lstatSync(copy.path).isDirectory()) return 'foreign';
  const gitDir = join(copy.path, '.git');
  const marked = (name: string): boolean => {
    if (lstatSync(gitDir, { throwIfNoEntry: false })?.isDirectory() !== true) return false;
    const file = join(gitDir, name);
    return lstatSync(file, { throwIfNoEntry: false })?.isFile() === true && readFileSync(file, 'utf8') === proofText(root, copy);
  };
  if (marked(MARK)) return 'whole';
  return marked(MARK_REMOVING) || onlyEmptyFolders(copy.path) ? 'remnant' : 'foreign';
}

const foreignFolder = (copy: SolutionCopy, retry: string): never => refuse('copy-foreign-folder',
  `a folder that is not the tool's copy sits at ${showPath(copy.path)} — it does not carry the mark the tool puts in a copy it makes. The tool will not touch it; move it away and run the command again`, retry);

// The copy is there, whole, and is the tool's: the record, the proof outside
// the copy and the mark inside it all agree. Anything else is a named refusal
// that changes nothing; `retry` is the command that picks up afterwards and
// `remove` the one that clears what an interrupted removal left.
export function assertOwnedCopy(root: string, copy: SolutionCopy, id: string | undefined, retry: string, remove: string): void {
  assertIdentity(root, copy, id);
  if (ownershipProof(root, copy) !== 'ours') refuse('copy-not-owned', `${showPath(copy.path)} has no matching ownership record outside the copy`);
  if (!existsSync(copy.path)) refuse('copy-missing', `${showPath(copy.path)} is gone — it was removed outside the tool`, retry);
  const found = whatIsThere(root, copy);
  if (found === 'foreign') foreignFolder(copy, retry);
  if (found === 'remnant') refuse('copy-half-removed', `${showPath(copy.path)} no longer holds the copy — only what a removal that was started left there, or empty folders — so nothing can be read or finished from it`, remove);
}

function sizeOf(path: string): number {
  let bytes = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const target = join(path, entry.name);
    if (entry.isDirectory()) bytes += sizeOf(target);
    else if (entry.isFile()) bytes += lstatSync(target).size;
  }
  return bytes;
}

// The copy's own configuration, beyond what `git init` wrote. Three settings
// that attributes do not choose are switched off for anybody's Git there — a
// hooks folder, a file-system monitor and an external diff program, which
// user-level configuration may name by a path that would resolve inside the
// copy. And a few plain values are repeated from the owner repository, which
// may hold them in its own configuration: its line-ending settings, so the
// copy holds the bytes a checkout there would, and the name and address Git
// signs commits with, so Git in the copy works for the agent as it does in
// the repository. None of them names a program.
function copyConfig(root: string): string {
  const core = new Map<string, string>();
  const user = new Map<string, string>();
  for (const entry of names(gitOutcome(root, ['config', '-z', '--get-regexp', '^(core\\.(autocrlf|eol|safecrlf|longpaths)|user\\.(name|email))$']).stdout)) {
    const at = entry.indexOf('\n');
    const [section, name] = entry.slice(0, at < 0 ? entry.length : at).split('.');
    const value = at < 0 ? '' : entry.slice(at + 1);
    if (section === 'core' && name !== undefined && /^[A-Za-z]+$/.test(value)) core.set(name, value);
    if (section === 'user' && name !== undefined && !/[\x00-\x1f\x7f]/.test(value)) user.set(name, `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`);
  }
  const lines = ['[core]', '\thooksPath = /dev/null', '\tfsmonitor = false', ...[...core].map(([name, value]) => `\t${name} = ${value}`), '[diff]', '\texternal ='];
  if (user.size > 0) lines.push('[user]', ...[...user].map(([name, value]) => `\t${name} = ${value}`));
  return `${lines.join('\n')}\n`;
}

function createCopy(root: string, record: BountyRecord, attempt: Attempt, head: string, what: string): SolutionCopy {
  validateTree(root, head, what);
  const copy = copySpec(root, record, attempt);
  plainComponents(copy.path);
  plainComponents(keyPath(root, copy.key));
  if (existsSync(copy.path) || existsSync(keyPath(root, copy.key))) refuse('copy-path-exists', `${showPath(copy.path)} already exists and will not be overwritten`);
  // A repository of its own, not a linked working tree: a linked tree reads the
  // owner repository's configuration, and Git can switch that off for one tree
  // only by rewriting the owner's configuration and repository format.
  // `--template=` keeps the host's template hooks out. The owner repository
  // gains no branch and no registration.
  git(root, ['init', '--quiet', '--template=', '--initial-branch=box-bt7/look', copy.path]);
  const registry = keyPath(root, copy.key);
  mkdirSync(dirname(registry), { recursive: true });
  writeFileSync(registry, proofText(root, copy));
  try {
    const gitDir = join(copy.path, '.git');
    writeFileSync(join(gitDir, MARK), proofText(root, copy));
    // The owner repository's objects are read in place: nothing is copied, and
    // nothing the copy writes goes there.
    mkdirSync(join(gitDir, 'objects', 'info'), { recursive: true });
    writeFileSync(join(gitDir, 'objects', 'info', 'alternates'), `${join(commonDir(root), 'objects').replaceAll('\\', '/')}\n`);
    // The last word on attributes in this copy, above any `.gitattributes` the
    // solution or the owner committed: no filter and no diff driver for any
    // path, and Git's own text merge for every path. A name that the host's
    // user-level configuration defines cannot be selected there either.
    mkdirSync(join(gitDir, 'info'), { recursive: true });
    writeFileSync(join(gitDir, 'info', 'attributes'), '* !filter !diff merge\n');
    appendFileSync(join(gitDir, 'config'), copyConfig(root));
    git(copy.path, ['update-ref', '--no-deref', 'HEAD', head]);
    git(copy.path, ['read-tree', '--reset', '-u', 'HEAD'], { GIT_ATTR_SOURCE: '4b825dc642cb6eb9a060e54bf8d69288fbee4904' });
    return { ...copy, bytes: sizeOf(copy.path) };
  } catch (error) {
    try { removeCopy(root, copy, record.id, 'box bounty status'); } catch { /* the first failure is the one to report */ }
    throw error;
  }
}

// Every component inside the copy is checked before anything is deleted: a link
// or junction planted there would lead a recursive removal somewhere else.
function noLinksInside(path: string, next: string): void {
  for (const entry of readdirSync(path)) {
    const target = join(path, entry);
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) refuse('copy-unsafe-path', `${showPath(target)} is a link or junction, which the tool neither follows nor deletes; remove the link yourself and run the command again`, next);
    if (stat.isDirectory()) noLinksInside(target, next);
  }
}

// Deletes the folder so that the tool's mark goes last. Stopped at any point —
// a process holding a file or sitting in a folder — what is left either still
// carries the mark or is nothing but empty folders. False when something is
// left.
function deleteMarked(path: string): boolean {
  const drop = (target: string): void => { try { rmSync(target, { recursive: true, force: true }); } catch { /* still there: seen below */ } };
  const gitDir = join(path, '.git');
  for (const entry of readdirSync(path)) if (entry !== '.git') drop(join(path, entry));
  if (readdirSync(path).some(entry => entry !== '.git')) return false;
  if (existsSync(gitDir)) {
    for (const entry of readdirSync(gitDir)) if (entry !== MARK_REMOVING) drop(join(gitDir, entry));
    if (readdirSync(gitDir).some(entry => entry !== MARK_REMOVING)) return false;
  }
  drop(path);
  return !existsSync(path);
}

// Removes a copy and the proof the tool kept for it, from wherever a previous
// run or the outside world left things: the folder may be whole, half removed
// or already gone. Running it again always ends in the same place — nothing of
// the copy left — or in a named refusal that says what is in the way. What is
// at the path is looked at before every deletion, never taken from what an
// earlier run recorded: the folder is removed only while it carries the tool's
// mark or holds nothing but empty folders. A folder at the path that is
// neither is somebody else's and stays.
function removeCopy(root: string, copy: SolutionCopy, id: string | undefined, retry: string): void {
  assertIdentity(root, copy, id);
  const proof = ownershipProof(root, copy);
  if (proof === 'other') refuse('copy-not-owned', `${showPath(copy.path)} has no matching ownership record outside the copy`);
  const registry = keyPath(root, copy.key);
  if (existsSync(copy.path)) {
    if (proof === 'none') refuse('copy-not-owned', `${showPath(copy.path)} has no matching ownership record outside the copy`);
    const found = whatIsThere(root, copy);
    if (found === 'foreign') foreignFolder(copy, retry);
    noLinksInside(copy.path, retry);
    if (found === 'whole') renameSync(join(copy.path, '.git', MARK), join(copy.path, '.git', MARK_REMOVING));
    if (!deleteMarked(copy.path)) refuse('copy-in-use', `${showPath(copy.path)} could not be removed — a process is using it (a shell or an editor open inside it). Close it and run the command again`, retry);
  }
  rmSync(registry, { force: true });
  const folder = dirname(registry);
  if (existsSync(folder) && readdirSync(folder).length === 0) rmdirSync(folder);
}

function chosen(record: BountyRecord, n: number): Attempt {
  const found = attemptsOf(record).find(attempt => attempt.n === n);
  if (found === undefined) return refuse('unknown-attempt', `solution ${n} does not exist on ${record.id}`);
  return found;
}

export function lookBounty(root: string, id: string, n: number): { record: BountyRecord; copy: SolutionCopy; diff: string } {
  const record = loadRecord(root, id);
  const attempt = chosen(record, n);
  const again = `box bounty look ${id} ${n}`;
  let copy = record.copies?.find(entry => entry.n === n);
  if (copy !== undefined && !existsSync(copy.path)) {
    // Removed outside the tool: clear what was registered for it and make it anew.
    removeCopy(root, copy, record.id, again);
    record.copies = (record.copies ?? []).filter(entry => entry.n !== n);
    persistRecord(root, record);
    copy = undefined;
  }
  if (copy === undefined) {
    copy = createCopy(root, record, attempt, attempt.commit, 'the solution');
    record.copies = [...record.copies ?? [], copy];
  } else assertOwnedCopy(root, copy, record.id, again, `box bounty unlook ${id} ${n} clears it; ${again} then makes the copy anew`);
  record.attempts = attemptsOf(record).map(entry => entry.n === n && entry.seenAt === undefined ? { ...entry, seenAt: new Date().toISOString() } : entry);
  persistRecord(root, record);
  const base = record.github?.kind === 'history' ? record.github.commit : record.snapshot.baseCommit;
  const diff = gitOutcome(root, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', base ?? '4b825dc642cb6eb9a060e54bf8d69288fbee4904', attempt.commit]).stdout;
  return { record, copy, diff };
}

export function unlookBounty(root: string, id: string, n: number): BountyRecord {
  const record = loadRecord(root, id);
  const copy = record.copies?.find(entry => entry.n === n);
  if (copy === undefined) return refuse('look-not-open', `solution ${n} has no look copy`);
  removeCopy(root, copy, record.id, `box bounty unlook ${id} ${n}`);
  record.copies = (record.copies ?? []).filter(entry => entry.n !== n);
  persistRecord(root, record);
  return record;
}

// The saved job context, under the bounty it belongs to: `indent` places it
// inside that bounty's lines.
export function renderResume(record: BountyRecord, indent = ''): string {
  const context = record.resume;
  if (context?.kind !== 'recorded') return [`${indent}Return to your job`, `${indent}  The branch, commit and changed files were not recorded for this older bounty.`].join('\n');
  return [`${indent}Saved job context (${record.id}) — where the work stood when the bounty was created`, `${indent}  branch: ${showPath(context.branch)}; commit: ${context.commit}`, `${indent}  changed files: ${context.changed.length === 0 ? 'none' : context.changed.map(showPath).join(', ')}`, ...(context.note === null ? [] : [`${indent}  note: ${JSON.stringify(context.note)}`])].join('\n');
}

// What ordinary Git does in a copy, said once wherever a copy is handed to the
// agent. True of how createCopy builds it; the last sentence is the limit.
export const COPY_GIT_FACT = "Git commands in that copy run no hook, filter, merge driver, diff driver or file-system monitor: the copy is a repository of its own that shares this repository's commits but not its configuration, and the solution's attributes select nothing there. Your own user-level Git settings still apply.";

// Every copy the record still lists, with the command that removes each — shown
// for as long as the record lists it, whatever stage the bounty is in.
export function renderCopies(record: BountyRecord, indent = ''): string[] {
  const lines: string[] = [];
  for (const copy of record.copies ?? []) {
    lines.push(existsSync(copy.path)
      ? `${indent}look copy #${copy.n}: ${showPath(copy.path)}; remove: box bounty unlook ${record.id} ${copy.n}`
      : `${indent}look copy #${copy.n}: ${showPath(copy.path)} is gone — removed outside the tool; clear it: box bounty unlook ${record.id} ${copy.n}`);
  }
  return lines;
}
