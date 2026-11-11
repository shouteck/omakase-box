import { lstatSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { canonicalFolder } from './folder.js';
import { BountyRefused } from './errors.js';
import { git, gitIndexWrite, gitOutcome, gitStdin, ownerGit } from './git.js';
import type { IndexChange } from './git.js';
import { showPath } from './notice.js';
import { storedIds } from './store.js';
import type { NeverShipRule } from './never-ship.js';

// The snapshot is the repository as it stands: tracked files with their uncommitted
// changes, plus untracked files that are not ignored; no .git, no history. It is
// pinned by a commit Git itself can resolve later: a temporary index (GIT_INDEX_FILE)
// is seeded from HEAD, `add -A` records the working state into the object store, and
// `commit-tree` wraps that tree in a commit parented on HEAD. The real index, the
// working tree and the current branch are never touched; the commit is unreachable
// and belongs to the repository alone.
//
// Enumeration walks that commit's tree, so the shipped set is exactly what the
// identifier records. Every candidate is then realpath-resolved before it is judged:
// exclusion runs on the canonical path, not the spelling — a case alias or a link
// or junction inside the repository lands on its real path, and a link whose target
// leaves the repository is refused by name, not followed.

export interface SnapshotFile {
  readonly path: string;
  readonly realPath: string;
  /** Byte size of the emitted content: the recorded blob's size when the
      canonical path is itself a blob in the tree, else the live file's size. */
  readonly bytes: number;
}
export interface SnapshotRemoval { readonly path: string; readonly rule: string }

export interface Snapshot {
  readonly commit: string;
  readonly tree: string;
  readonly baseCommit: string | null;
  readonly files: readonly SnapshotFile[];
  /** Every blob path in the snapshot tree, as spelled by git — emission takes
      bytes from `commit:path` whenever a canonical path is present here. */
  readonly blobs: ReadonlySet<string>;
  /** Every non-blob path in the snapshot tree, as spelled by git — gitlinks
      (submodules). A gitlink is never a blob, so without this a moved
      submodule HEAD reads as a deleted file. */
  readonly links: ReadonlySet<string>;
  readonly removed: readonly SnapshotRemoval[];
}

const BACKSLASH = String.fromCharCode(92);
const toPosix = (path: string): string => path.split(BACKSLASH).join('/');

// How many entries the real index must hold before comparing stats pays for
// its extra Git starts. Below it `add -A` is cheaper, and start counts are as
// they were. Past PATHSPEC_LIMIT changed files, one literal pathspec each costs
// more than the plain `add -A`.
export const STAT_PATH_ENTRIES = 1000;
const PATHSPEC_LIMIT = 1000;

// The number of entries the real index states in its header, read in Node so a
// small repository pays no process. Null for anything but a plain readable one.
function indexEntries(repoRoot: string): { readonly path: string; readonly entries: number } | null {
  try {
    const dotGit = join(repoRoot, '.git');
    const gitDir = lstatSync(dotGit).isDirectory() ? dotGit : /^gitdir: (.+?)\r?\n?$/.exec(readFileSync(dotGit, 'utf8'))?.[1];
    if (gitDir === undefined) return null;
    const path = join(isAbsolute(gitDir) ? gitDir : join(repoRoot, gitDir), 'index');
    const header = readFileSync(path).subarray(0, 12);
    return header.subarray(0, 4).toString('latin1') === 'DIRC' ? { path, entries: header.readUInt32BE(8) } : null;
  } catch { return null; }
}

// One `ls-files -s --debug` entry: mode, blob, stage, path, then the cached stat.
const INDEX_ENTRY = /(\d{6}) ([0-9a-f]{40,64}) (\d)\t([^\0]*)\0 {2}ctime: (\d+):(\d+)\n {2}mtime: (\d+):(\d+)\n {2}dev: \d+\tino: \d+\n {2}uid: \d+\tgid: \d+\n {2}size: (\d+)\tflags: [0-9a-f]+\n/y;

// BT46: the temporary index gets every entry whose file provably has not moved
// since the real index hashed it, and `add` hashes the rest. "Provably" is this
// code's own comparison against the live file: Git's reading of the same cache
// would obey assume-unchanged and skip-worktree, and those are exactly the
// edits that must still ship (BT39). An entry is trusted only if the path is in
// what `add -A` would consider, it is a plain file under plain folders, size
// and mtime match, its mtime is older than the index (Git's racy rule), and no
// clean filter applies: an owner can adopt a filter after a file was hashed, and
// `add -A` would filter it now. An edited .gitattributes takes the plain path.
// False means nothing was decided and the caller takes the plain path; a real
// index format this cannot read costs speed, never exactness.
function recordUnchanged(repoRoot: string, env: { readonly GIT_INDEX_FILE: string }, indexPath: string): boolean {
  try {
    const realIndexAt = lstatSync(indexPath, { bigint: true }).mtimeNs;
    const listing = git(repoRoot, ['ls-files', '-s', '--debug', '-z']) + '\n';
    const listed = gitOutcome(repoRoot, ['-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], env);
    if (listed.status !== 0 || listed.error !== undefined) return false;
    const considered = new Set(listed.stdout.split('\0').filter(Boolean));
    const plainFolders = new Map<string, boolean>();
    const plainFolder = (folder: string): boolean => {
      if (folder === '') return true;
      const known = plainFolders.get(folder);
      if (known !== undefined) return known;
      const cut = folder.lastIndexOf('/');
      const plain = plainFolder(cut === -1 ? '' : folder.slice(0, cut)) && lstatSync(join(repoRoot, ...folder.split('/'))).isDirectory();
      plainFolders.set(folder, plain);
      return plain;
    };
    const unmoved: IndexChange[] = [];
    INDEX_ENTRY.lastIndex = 0;
    let read = 0;
    let entries = 0;
    for (let entry = INDEX_ENTRY.exec(listing); entry !== null; entry = INDEX_ENTRY.exec(listing)) {
      read = INDEX_ENTRY.lastIndex;
      entries += 1;
      const [, mode, sha, stage, path, ctimeS, ctimeN, mtimeS, mtimeN, size] = entry as unknown as readonly [string, string, string, string, string, string, string, string, string, string];
      if (stage !== '0' || mode !== '100644' && mode !== '100755' || !considered.has(path)) continue;
      const cut = path.lastIndexOf('/');
      let stat;
      try {
        if (!plainFolder(cut === -1 ? '' : path.slice(0, cut))) continue;
        stat = lstatSync(join(repoRoot, ...path.split('/')), { bigint: true });
      } catch { continue; }
      if (!stat.isFile()) continue;
      const mtime = BigInt(mtimeS) * 1_000_000_000n + BigInt(mtimeN);
      if (BigInt.asUintN(32, stat.size) !== BigInt(size) || stat.mtimeNs !== mtime || mtime >= realIndexAt) continue;
      // Windows Git records creation time as ctime and has no exec bit to compare.
      if (process.platform !== 'win32' && (stat.ctimeNs !== BigInt(ctimeS) * 1_000_000_000n + BigInt(ctimeN) || (stat.mode & 0o100n) !== 0n !== (mode === '100755'))) continue;
      unmoved.push({ mode, sha, path });
    }
    if (read !== listing.length || entries === 0) return false;
    // Only an answer naming the path as unfiltered counts; anything else re-hashes.
    const attributes = gitStdin(repoRoot, ['check-attr', '-z', '--stdin', 'filter'], unmoved.map(entry => `${entry.path}\0`).join('')).split('\0');
    const unfiltered = new Set<string>();
    for (let at = 0; at + 2 < attributes.length; at += 3) if (attributes[at + 2] === 'unspecified' || attributes[at + 2] === 'unset') unfiltered.add(attributes[at]!);
    const trusted = unmoved.filter(entry => unfiltered.has(entry.path));
    const changed = new Set(considered);
    for (const entry of trusted) changed.delete(entry.path);
    if (changed.size > PATHSPEC_LIMIT || [...changed].some(path => path === '.gitattributes' || path.endsWith('/.gitattributes'))) return false;
    gitIndexWrite(repoRoot, env.GIT_INDEX_FILE, trusted);
    if (changed.size > 0) gitStdin(repoRoot, ['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], [...changed].join('\0'), { ...env, GIT_LITERAL_PATHSPECS: '1' }, 'owner');
    return true;
  } catch { return false; }
}

export function createSnapshotCommit(repoRoot: string, workDir: string, statFrom = STAT_PATH_ENTRIES): { commit: string; tree: string; baseCommit: string | null } {
  const head = gitOutcome(repoRoot, ['rev-parse', '--verify', '-q', 'HEAD']);
  const baseCommit = head.status === 0 && /^[a-f0-9]{40}$/.test(head.stdout.trim()) ? head.stdout.trim() : null;
  const env = { GIT_INDEX_FILE: join(workDir, 'snapshot-index') };
  // The owner's working state and nothing else: the owner's clean filters run,
  // so what ships is what the owner's own commit would store (a git-lfs pointer,
  // a git-crypt ciphertext), never the working-tree form.
  // BT39: this seed is deliberately a bare `read-tree`, not a copy of the real
  // index — a copy would inherit assume-unchanged/skip-worktree bits and the
  // stat cache, and `add -A` would then ship stale bytes for files the owner
  // edited under those flags (probe: kitchen-BT39-probe). An entry is re-hashed
  // unless recordUnchanged has compared it with the live file itself (BT46).
  const seed = () => ownerGit(repoRoot, ['read-tree', ...(baseCommit !== null ? [baseCommit] : ['--empty'])], env);
  seed();
  const index = indexEntries(repoRoot);
  if (index === null || index.entries < statFrom) ownerGit(repoRoot, ['add', '-A'], env);
  else if (!recordUnchanged(repoRoot, env, index.path)) {
    seed();
    ownerGit(repoRoot, ['add', '-A'], env);
  }
  const tree = ownerGit(repoRoot, ['write-tree'], env);
  const commit = git(repoRoot, [
    '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
    'commit-tree', tree, ...(baseCommit !== null ? ['-p', baseCommit] : []),
    '-m', 'box-bounty working-state snapshot (not referenced by any branch)'
  ], env);
  return { commit, tree, baseCommit };
}

// BT39: the per-file canonicalisation starts with the native realpath
// variant — one system call instead of the JavaScript walk's lstat per
// component (the create profile's second-largest cost). But the native call
// returns the on-disk spelling, while the JS walk the contract was built on
// returns the spelling it was given — and `path`, the scan names and the
// note all carry that spelling byte-for-byte. So the native answer is used
// only when it resolves to the SAME name the input spelled (case-folded
// compare): a plain file keeps its tree spelling exactly as the JS walk
// produced it. Anything else — a case-divergent disk name, a symlink or
// junction that redirected, an escape — falls back to the JS walk, which
// reproduces the baseline result byte-for-byte. Links are rare; the fast
// path pays for the common case and the checks see nothing new.
export function classifySnapshot(repoRoot: string, commit: string, rules: readonly NeverShipRule[]): { files: SnapshotFile[]; removed: SnapshotRemoval[]; blobs: Set<string>; links: Set<string> } {
  const realRoot = canonicalFolder(repoRoot);
  // -c core.quotepath=false: without it ls-tree C-quotes non-ASCII names even under -z.
  const listing = git(repoRoot, ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', '--format=%(objecttype) %(objectsize) %(path)', commit]);
  const escapes: string[] = [];
  const unreadable: string[] = [];
  const shipped = new Map<string, SnapshotFile>();
  const removed: SnapshotRemoval[] = [];
  const removedPaths = new Set<string>();
  const blobSize = new Map<string, number>();
  const links = new Set<string>();
  for (const record of listing.split('\0')) {
    if (record === '') continue;
    const firstSpace = record.indexOf(' ');
    const secondSpace = record.indexOf(' ', firstSpace + 1);
    if (secondSpace === -1) continue;
    const path = record.slice(secondSpace + 1);
    if (record.slice(0, firstSpace) !== 'blob') { links.add(path); continue; } // gitlinks (submodules) and anything non-file
    const size = Number.parseInt(record.slice(firstSpace + 1, secondSpace), 10);
    if (Number.isFinite(size)) blobSize.set(path, size);
    const absolute = join(realRoot, ...path.split('/'));
    let real: string;
    let sizeOnDisk = 0;
    try {
      const resolved = canonicalFolder(absolute);
      real = toPosix(relative(realRoot, resolved)).toLowerCase() === toPosix(relative(realRoot, absolute)).toLowerCase()
        ? absolute // no link, same name modulo case — the JS walk's answer is this spelling
        : resolved; // a link/junction redirected: judged by where it lands, in the root's one spelling (BT64)
      const stat = statSync(real);
      if (!stat.isFile()) { unreadable.push(path); continue; }
      sizeOnDisk = stat.size;
    } catch {
      unreadable.push(path);
      continue;
    }
    const offset = toPosix(relative(realRoot, real));
    if (offset === '' || offset.startsWith('../') || offset === '..' || isAbsolute(offset)) {
      escapes.push(path);
      continue;
    }
    const canonical = offset;
    const key = canonical.toLowerCase();
    if (shipped.has(key) || removedPaths.has(key)) continue; // a second spelling of the same real file
    const rule = rules.find(entry => entry.match(key));
    if (rule !== undefined) { removed.push({ path: canonical, rule: rule.name }); removedPaths.add(key); }
    else shipped.set(key, { path: canonical, realPath: real, bytes: blobSize.get(canonical) ?? sizeOnDisk });
  }
  if (escapes.length > 0) {
    throw new BountyRefused(
      'link-escape',
      `${escapes.length} path(s) inside the repository resolve outside it — refused, not followed: ${escapes.sort().map(showPath).join(', ')}; next: remove the link or junction.`
    );
  }
  if (unreadable.length > 0) {
    throw new BountyRefused(
      'unreadable-path',
      `${unreadable.length} path(s) in the snapshot cannot be read (a broken link, a link to a directory, or a file that vanished mid-scan): ${unreadable.sort().map(showPath).join(', ')}; next: fix or remove the listed paths, then rerun the same command`
    );
  }
  // BT31: records live in `.box/local/box.db` now — `add -A` no longer sees
  // `.box/bounties/<id>.json` files, but the never-ship accounting must name
  // them exactly as when they were files. Every id the store knows counts as
  // a removed `.box/bounties/<id>.json` path (the database itself sits under
  // `.box/local/`'s own ignore, never entering the tree at all). storedIds
  // reads only an existing database — no database yet means no ids and
  // nothing is created here.
  for (const id of storedIds(repoRoot)) {
    const offset = `.box/bounties/${id}.json`;
    const key = offset.toLowerCase();
    if (shipped.has(key) || removedPaths.has(key)) continue;
    const rule = rules.find(entry => entry.match(key));
    if (rule !== undefined) { removed.push({ path: offset, rule: rule.name }); removedPaths.add(key); }
  }
  const files = [...shipped.values()].sort((a, b) => a.path.localeCompare(b.path));
  return { files, removed: removed.sort((a, b) => a.path.localeCompare(b.path)), blobs: new Set(blobSize.keys()), links };
}

export function createSnapshot(repoRoot: string, workDir: string, rules: readonly NeverShipRule[]): Snapshot {
  const { commit, tree, baseCommit } = createSnapshotCommit(repoRoot, workDir);
  const { files, removed, blobs, links } = classifySnapshot(repoRoot, commit, rules);
  return { commit, tree, baseCommit, files, blobs, links, removed };
}
