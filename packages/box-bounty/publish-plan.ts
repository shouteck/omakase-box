import { remoteUrl,invalid,type GitHubChoice } from './gh.js';
import { spawnSync } from 'node:child_process';
import { lstatSync,mkdtempSync,readFileSync,realpathSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute,join,relative,resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { git,gitBlob,gitFilteredBlob,gitIndexWrite,gitOutcome,gitProgram,gitRefsWrite,ownerGitOutcome } from './git.js';
import type { IndexChange } from './git.js';
import { publishListed,publishLists } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import type { BountyRecord,WaitingFor } from './record.js';
import { binaryPatchPaths,looksBinary,scanPatch,scanText } from './scan.js';
import type { ScanHit } from './scan.js';

// ---------------------------------------------------------------------------
// The history path (BT6a): a bounty is an issue on the code that is already
// there. Everything below computes, previews and verifies exactly what would
// become public that was not — the newest commit the GitHub repository already
// has, the commits it lacks, and at most one tool-built commit of work the
// agent says the task needs. Posting and looking never touch the working
// tree, the index or the current branch.
// ---------------------------------------------------------------------------

const BS = String.fromCharCode(92);
const toPosix = (path: string): string => path.split(BS).join('/');

// What the remote reports, never a possibly-stale local tracking name: the
// remote's heads and tags are fetched into a wave-named namespace and their
// tips are read back. Leftovers from a crashed run are dropped first so a
// deleted remote branch cannot linger as coverage the remote no longer has.
const scanRoot = (id: string): string => `refs/box-bt6a-scan/${id}`;

function dropScanRefs(root: string, id: string): void {
  const refs = gitOutcome(root, ['for-each-ref', '--format=%(refname)', scanRoot(id)]);
  if (refs.status !== 0) return;
  try {
    gitRefsWrite(root, refs.stdout.split('\n').filter(ref => ref !== '').map(ref => ({ delete: ref })));
  } catch {
    // Best-effort, as the per-ref deletes were: leftovers are the state found.
  }
}

function scanRemote(root: string, repository: string, id: string): string[] {
  dropScanRefs(root, id);
  const scan = scanRoot(id);
  const fetch = gitOutcome(root, ['fetch', '--no-tags', '--no-recurse-submodules', remoteUrl(repository), `+refs/heads/*:${scan}/heads/*`, `+refs/tags/*:${scan}/tags/*`]);
  if (fetch.status !== 0 || fetch.error !== undefined) {
    dropScanRefs(root, id);
    return invalid('github-git-failed', 'Git could not read what the GitHub repository has; check signed-in Git and retry');
  }
  const tips = gitOutcome(root, ['for-each-ref', '--format=%(objectname)', scan]);
  if (tips.status !== 0) return invalid('github-git-failed', 'Git could not read what the GitHub repository has; check signed-in Git and retry');
  return [...new Set(tips.stdout.split('\n').map(line => line.trim()).filter(sha => /^[a-f\d]{40}$/.test(sha)))];
}

// git with a stdin payload — the exclusion list for `rev-list --stdin` can be
// longer than a command line allows on this host.
function gitStdin(repo: string, args: readonly string[], input: string): string {
  const result = spawnSync(gitProgram(), ['-c', `safe.directory=${repo.replaceAll(BS, '/')}`, '-c', 'core.hooksPath=/dev/null', '-C', repo, ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    windowsHide: true
  });
  if (result.status !== 0 || result.error !== undefined) {
    const detail = ((result.stderr ?? '') || (result.stdout ?? '') || result.error?.message || `exit ${result.status}`).trim();
    throw new BountyRefused('github-git-failed', `git ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout ?? '';
}

interface NamedStatus { readonly status: string; readonly path: string }

// `git diff --name-status -z --no-renames` output: STATUS and path as separate
// NUL fields. --no-renames everywhere so a rename's source is never folded away.
export function parseNameStatus(output: string): NamedStatus[] {
  const entries = output.split('\0');
  const parsed: NamedStatus[] = [];
  for (let i = 0; i + 1 < entries.length; i += 2) {
    const status = entries[i]!; const path = entries[i + 1]!;
    if (status === '' || path === '') continue;
    parsed.push({ status, path });
  }
  return parsed;
}

// Paths a diff touches that a never-ship rule covers — any status, including
// D: a path being published for the first time is refused whether a commit
// adds, changes or deletes it.
export function neverShipViolations(statuses: readonly NamedStatus[], rules: readonly NeverShipRule[]): { path: string; rule: string }[] {
  const violations: { path: string; rule: string }[] = [];
  for (const { path } of statuses) {
    const rule = rules.find(candidate => candidate.match(path.toLowerCase()));
    if (rule !== undefined) violations.push({ path, rule: rule.name });
  }
  return violations;
}

// The pre-publish scan's text functions live in scan.ts (BT20): the same
// SECRET_RULES over added lines and untracked bytes, imported above. A hit
// names file and line, never the value, and holds that one bounty for the
// owner.

// The empty tree — what a root commit is diffed against, so every path it
// plants appears as 'A' in the scan instead of disappearing behind the failed
// `<sha>^` a root has no answer for.
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// `git diff --name-status` of a commit against its first parent, or against
// the empty tree when it has none: every path a commit introduces shows up in
// its own diff, so a never-ship file cannot hide in a root commit or in the
// tree of a merge that drops it. A failed diff is a refusal, never "no paths".
// `firstParent` is the commit's first parent when the caller's own rev-list
// --parents already printed it — the per-commit `rev-list --parents -n 1`
// question is then asked zero extra times. null means "read it", the empty
// tree covers the no-parent case a present map produces.
export function commitStatuses(root: string, sha: string, consequence: string, knownParent?: string): NamedStatus[] {
  let parent = knownParent;
  if (parent === undefined) {
    const parents = gitOutcome(root, ['rev-list', '--parents', '-n', '1', sha]);
    if (parents.status !== 0) return invalid('github-git-failed', `Git could not read commit ${sha.slice(0, 12)}; ${consequence}`);
    parent = parents.stdout.trim().split(/\s+/).slice(1)[0] ?? EMPTY_TREE;
  }
  const diff = gitOutcome(root, ['diff', '--name-status', '-z', '--no-renames', parent, sha]);
  if (diff.status !== 0) return invalid('github-git-failed', `Git could not read commit ${sha.slice(0, 12)}; ${consequence}`);
  return parseNameStatus(diff.stdout);
}

// `git diff HEAD --name-status` — every change to tracked files, staged or
// not, as the working tree stands: M (modified), A (staged new), D (deleted),
// T (type change). Untracked files are invisible to it by design.
// One `ls-files -s` read answers both questions the index gets asked in a
// GitHub plan: are any paths unmerged (a stage number above 0), and what mode
// does each tracked path carry (kept so a wip commit preserves executables).
interface StagedIndex {
  readonly unmerged: boolean;
  readonly modes: ReadonlyMap<string, string>;
}

function stagedIndex(root: string): StagedIndex {
  const listed = ownerGitOutcome(root, ['ls-files', '-s', '-z']);
  const modes = new Map<string, string>();
  // Failed reads keep the old meaning too: `ls-files -u` nonzero meant "not
  // checked", and a failed `-s` left modes empty — the diff read below reports
  // the failure as it did.
  let unmerged = false;
  for (const entry of listed.stdout.split('\0')) {
    const match = /^(\d+) [a-f\d]{40} (\d)\t(.+)$/.exec(entry);
    if (match === null) continue;
    if (match[2] !== '0') unmerged = true;
    else modes.set(match[3]!, match[1]!);
  }
  return { unmerged, modes };
}

// `unmergedKnown` comes from the stagedIndex read the plan already made —
// the same index `ls-files -u` would have listed.
function trackedChanges(root: string, unmergedKnown: boolean): NamedStatus[] {
  if (unmergedKnown) {
    return invalid('github-unmerged-paths', 'the repository has unmerged paths — finish or abort the merge before posting to GitHub');
  }
  const diff = ownerGitOutcome(root, ['diff', '--name-status', '-z', '--no-renames', 'HEAD']);
  if (diff.status !== 0) return invalid('github-git-failed', `Git could not read the uncommitted state: ${(diff.stderr || diff.stdout).trim()}`);
  return parseNameStatus(diff.stdout);
}

// Untracked entries (`??` porcelain) — counted, never published unless named.
function untrackedEntries(root: string): string[] {
  const status = ownerGitOutcome(root, ['status', '--porcelain', '-z']);
  if (status.status !== 0) return invalid('github-git-failed', `Git could not read the working state: ${(status.stderr || status.stdout).trim()}`);
  const entries = status.stdout.split('\0');
  const untracked: string[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (entry.length < 4) continue;
    if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') i += 1;
    else if (entry.startsWith('?? ')) untracked.push(entry.slice(3));
  }
  return untracked;
}

// Every named file must exist as a plain, untracked file inside the repository
// and not be on the never-ship list — each violation is a named refusal that
// publishes nothing.
function validateIncludes(root: string, names: readonly string[], rules: readonly NeverShipRule[]): string[] {
  if (names.length === 0) return []; // no names — the toplevel question is never asked
  const realRoot = git(root, ['rev-parse', '--show-toplevel']).trim();
  const included: string[] = [];
  for (const name of names) {
    const absolute = resolve(root, name);
    let real = '';
    try { real = realpathSync(absolute); } catch { real = ''; }
    const offset = real === '' ? '' : toPosix(relative(realRoot, real));
    if (real === '' || offset === '' || offset.startsWith('../') || offset === '..' || isAbsolute(offset)) {
      return invalid('github-include-invalid', `--include ${name} does not resolve to a file inside the repository — name untracked files inside the checkout, one by one`);
    }
    const stat = lstatSync(absolute, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isFile() || stat.isSymbolicLink()) {
      return invalid(stat === undefined ? 'github-include-missing' : 'github-include-invalid',
        stat === undefined
          ? `--include ${name} does not exist — untracked files are published only when named, and only files that exist can be named`
          : `--include ${name} resolves to ${offset}, which is not a plain untracked file — name each file itself`);
    }
    if (offset.startsWith('.box/bounties/')) {
      return invalid('github-include-invalid', `--include ${name} resolves to ${offset} — the tool's own bounty records carry owner-only context and are never published`);
    }
    const rule = rules.find(candidate => candidate.match(offset.toLowerCase()));
    if (rule !== undefined) {
      return invalid('github-include-never-ship', `--include ${name} resolves to ${offset}, which the never-ship rule '${rule.name}' covers — it cannot be published; nothing was posted`);
    }
    const tracked = ownerGitOutcome(root, ['ls-files', '--error-unmatch', '-z', '--', offset]);
    if (tracked.status === 0) {
      return invalid('github-include-invalid', `--include ${name} resolves to ${offset}, which is already tracked — it is published through the uncommitted-changes choice, not named by hand`);
    }
    included.push(offset);
  }
  return included;
}

interface WipBuild {
  readonly commit: string;
  readonly tree: string;
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
}

// The work-in-progress commit: the working state of tracked files plus the
// untracked files named by hand, built on a temporary index — the real index,
// the working tree and the current branch never move. Author and committer
// dates are pinned to the record's creation time, so the same inputs always
// produce the same commit: the preview, the record and the push can never
// disagree about what the commit is.
// `modes` and `headTree` come from reads the plan already made — the index has
// not moved since (nothing between them writes it), so the facts are still true.
function buildWip(root: string, record: BountyRecord, tracked: readonly NamedStatus[], include: readonly string[], modes: ReadonlyMap<string, string>, headTree: string): WipBuild | null {
  const work = mkdtempSync(join(tmpdir(), `box-bt6a-${record.id}-wip-`));
  try {
    const env = { GIT_INDEX_FILE: join(work, 'index') };
    git(root, ['read-tree', 'HEAD'], env);
    const changed: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];
    const pending: IndexChange[] = [];
    // Every component the commit places is checked with lstat, links NOT
    // followed: a link or junction at the path — or at any directory above
    // it — resolves to bytes elsewhere, so publishing it would ship what the
    // path never named. Non-plain entries are refused, not recorded as link
    // blobs: the stricter of the two fixes, and the simpler. Removals are
    // queued like placements and land in the same order in one index write.
    const place = (path: string): boolean => {
      const parts = path.split('/');
      let absolute = root;
      for (const [index, part] of parts.entries()) {
        absolute = join(absolute, part);
        const stat = lstatSync(absolute, { throwIfNoEntry: false });
        if (stat === undefined) {
          pending.push({ mode: '0', sha: null, path });
          return false;
        }
        if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory()) || (index === parts.length - 1 && !stat.isFile())) {
          return invalid('github-non-plain-path', `the uncommitted state holds a link or other non-plain entry at ${path} — the tool publishes file contents, not links; nothing was posted`);
        }
      }
      // The blob is what `git add` would store for the path — its configured
      // clean filter, eol and ident applied — so the commit carries the same
      // filtered bytes `create` ships, never the raw working-tree form. A
      // filter that cannot produce them is a named refusal before anything is
      // pushed; the raw bytes are never a fallback.
      let blob: string;
      try {
        blob = gitFilteredBlob(root, path, readFileSync(absolute));
      } catch (error) {
        return invalid('github-filter-failed', `the filtered form of ${path} cannot be produced — ${error instanceof Error ? error.message : String(error)} — the tool publishes the filtered form only; fix the configured filter or commit the file, then post again. Nothing was posted`);
      }
      pending.push({ mode: modes.get(path) ?? '100644', sha: blob, path });
      return true;
    };
    for (const { status, path } of tracked) {
      if (status === 'D') {
        pending.push({ mode: '0', sha: null, path });
        deleted.push(path);
        continue;
      }
      const present = place(path);
      // An 'A' whose file vanished lands as absent — never in HEAD either, so
      // there is nothing to list. A modified path gone from the worktree is a
      // deletion; anything present is a change or, staged-new, an addition.
      if (!present) { if (status !== 'A') deleted.push(path); }
      else if (status === 'A') added.push(path);
      else changed.push(path);
    }
    for (const path of include) {
      if (place(path)) added.push(path);
    }
    // One index write lands every removal and placement in listed order.
    gitIndexWrite(root, env.GIT_INDEX_FILE, pending);
    const tree = git(root, ['write-tree'], env);
    if (tree === headTree) return null; // the choices resolved to no change
    const commit = git(root, [
      '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
      'commit-tree', tree, '-p', 'HEAD',
      '-m', `box bounty ${record.id}: work in progress`
    ], { ...env, GIT_AUTHOR_DATE: record.createdAt, GIT_COMMITTER_DATE: record.createdAt });
    return { commit, tree, changed: changed.sort(), added: added.sort(), deleted: deleted.sort() };
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

export interface GitHubPlan {
  /** The newest commit on the current branch the GitHub repository already has. */
  readonly base: string;
  readonly head: string;
  /** The commit the bounty branch points at — base, head or the wip commit. */
  readonly tip: string;
  readonly tipTree: string;
  /** Commits the branch would publish that GitHub lacks — unpushed commits
      plus the tool's work-in-progress commit, oldest first. */
  readonly pushed: readonly { readonly sha: string; readonly subject: string }[];
  readonly publishedFiles: readonly { readonly commit: string; readonly files: readonly NamedStatus[] }[];
  readonly wipCommit: string | null;
  readonly wip: { readonly changed: readonly string[]; readonly added: readonly string[]; readonly deleted: readonly string[] } | null;
  /** Tracked changes the agent said the task does not need — they stay home. */
  readonly leftHome: number;
  readonly untracked: number;
  readonly include: readonly string[];
  /** The pre-publish scan over first-published bytes: added lines of each
      first-published commit's diff, the work-in-progress diff and every
      named include file. File and line named, never the value. `suppressed`
      counts hits on owner safe-listed paths — named, never held. `binary`
      names files Git treats as binary: they were not scanned (a fact, never
      a hold — never publish is how the owner keeps one out). */
  readonly scan: { readonly hits: readonly ScanHit[]; readonly suppressed: number; readonly binary: readonly string[]; readonly commitsScanned: number };
  /** Never-ship-named paths already in the public history — facts, not
      refusals: this tool cannot take back what is already public. */
  readonly publicNeverShip: readonly string[];
  readonly licence: { readonly file: string | null; readonly declared: string | null };
}

const LICENCE_NAME = /^licen[cs]e([._ -].*)?$/i;
export const PREVIEW_PUBLIC_NAMES = 20;

// What a wait records of the plan it was made under — the base, the commits
// published for the first time, the work-in-progress lists and the choices.
// The owner's one answer is bound to exactly this: a move afterwards means
// the answer was for something else and does not carry (github-preview-stale).
export function shownOfPlan(plan: GitHubPlan): NonNullable<WaitingFor['shown']> {
  return {
    base: plan.base,
    head: plan.head,
    tip: plan.tip,
    pushed: plan.pushed.map(commit => commit.sha),
    include: plan.include,
    leftHome: plan.leftHome,
    untracked: plan.untracked
  };
}

export function planGitHub(root: string, repository: string, record: BountyRecord, rules: readonly NeverShipRule[], choice: GitHubChoice): GitHubPlan {
  // One rev-parse answers both HEAD questions the plan asks: the branch tip
  // and its tree — used for the no-commits refusal, the wip comparison and
  // the plan's head/tipTree fields.
  const headLines = gitOutcome(root, ['rev-parse', 'HEAD', 'HEAD^{tree}']).stdout.split('\n').map(line => line.trim());
  const headSha = headLines[0] ?? '';
  const headTree = headLines[1] ?? '';
  if (!/^[a-f\d]{40}$/.test(headSha) || !/^[a-f\d]{40}$/.test(headTree)) {
    return invalid('github-no-public-base', 'the current branch has no commits yet — there is nothing the GitHub repository can already have');
  }
  const tips = scanRemote(root, repository, record.id);
  try {
    if (tips.length === 0) {
      return invalid('github-no-public-base', 'the GitHub repository reports no branches or tags — there is nothing public to point solvers at');
    }
    // The commits on the current branch the remote lacks, newest first — read
    // from what the remote itself reports, never a local tracking name.
    // --parents rides the same walk: each line's second field is the commit's
    // first parent, so no per-commit `rev-list --parents` is needed below.
    const stdin = `HEAD\n${tips.map(sha => `^${sha}`).join('\n')}\n`;
    const firstParents = new Map<string, string>();
    const unpushed = gitStdin(root, ['rev-list', '--stdin', '--topo-order', '--parents'], stdin)
      .split('\n').map(line => line.trim().split(/\s+/)).filter(fields => /^[a-f\d]{40}$/.test(fields[0] ?? ''))
      .map(fields => {
        if (fields[1] !== undefined) firstParents.set(fields[0]!, fields[1]!);
        return fields[0]!;
      });
    const unpushedSet = new Set(unpushed);
    // The newest commit the repository already has: the first commit in
    // topological order on the current branch that is not in the unpushed set.
    const base = gitOutcome(root, ['rev-list', '--topo-order', 'HEAD']).stdout
      .split('\n').map(line => line.trim()).find(sha => sha !== '' && !unpushedSet.has(sha));
    if (base === undefined) {
      return invalid('github-no-public-base', 'the current branch shares no commit with the GitHub repository — there is nothing public to point solvers at');
    }
    // One staged-index read answers "any unmerged paths" for trackedChanges
    // and "what modes does the index know" for the wip commit — the index is
    // not written between those two questions.
    const staged = stagedIndex(root);
    // The tool's own records under .box/bounties/ are bookkeeping, not work —
    // they carry owner-only context (`job`, `why`) documented as never
    // shipped, so they can no more land on the bounty branch than a
    // never-ship file can.
    const tracked = trackedChanges(root, staged.unmerged).filter(change => !change.path.startsWith('.box/bounties/'));
    const untracked = untrackedEntries(root).filter(entry => !entry.startsWith('.box/bounties/'));
    const include = validateIncludes(root, choice.include, rules);
    const needsWip = (choice.withChanges && tracked.length > 0) || include.length > 0;
    const wip = needsWip ? buildWip(root, record, choice.withChanges ? tracked : [], include, staged.modes, headTree) : null;
    const tip = wip?.commit ?? headSha;
    const tipTree = wip?.tree ?? headTree;
    // Never-ship on what is new only: every commit first published here,
    // judged by what it lands versus its first parent — a root commit versus
    // the empty tree, so a planted path cannot hide. A never-ship-named file
    // already in the public history is a fact, not a refusal — this tool
    // cannot take it back, so the preview says so instead.
    const violations: { path: string; rule: string }[] = [];
    const publishedFiles: { commit: string; files: readonly NamedStatus[] }[] = [];
    for (const sha of unpushed) {
      const files = commitStatuses(root, sha, 'nothing was posted', firstParents.get(sha) ?? EMPTY_TREE);
      publishedFiles.push({ commit: sha, files });
      violations.push(...neverShipViolations(files, rules));
    }
    if (wip !== null) {
      const statuses = parseNameStatus(gitOutcome(root, ['diff', '--name-status', '-z', '--no-renames', 'HEAD', wip.tree]).stdout);
      publishedFiles.push({ commit: wip.commit, files: statuses });
      violations.push(...neverShipViolations(statuses, rules));
    }
    if (violations.length > 0) {
      const named = [...new Map(violations.map(v => [v.path, v])).values()];
      return invalid('github-never-ship', `a change being published for the first time touches never-ship paths — refused, nothing was posted: ${named.map(v => `${v.path} (rule '${v.rule}')`).join(', ')}`);
    }
    // The pre-publish scan: the added lines of every commit published for
    // the first time, of the work-in-progress diff, and of each named
    // untracked file — the same diffs the never-ship read already walks, one
    // extra git read per first-published commit. Each hit carries the commit
    // it sits in so the hold can name it: an ordinary git push would publish
    // that commit just the same. Files Git calls binary give the scan no
    // lines — named as not scanned, never held (BT8c).
    const publish = publishLists(root);
    const found: ScanHit[] = [];
    const binary: string[] = [];
    for (const sha of unpushed) {
      const patch = gitOutcome(root, ['diff', '-p', '--no-renames', firstParents.get(sha) ?? EMPTY_TREE, sha]);
      if (patch.status !== 0) return invalid('github-git-failed', `Git could not read commit ${sha.slice(0, 12)} for the pre-publish scan; nothing was posted`);
      found.push(...scanPatch(patch.stdout).map(hit => ({ ...hit, commit: sha })));
      binary.push(...binaryPatchPaths(patch.stdout));
    }
    if (wip !== null) {
      const patch = gitOutcome(root, ['diff', '-p', '--no-renames', 'HEAD', wip.tree]);
      if (patch.status !== 0) return invalid('github-git-failed', 'Git could not read the work-in-progress diff for the pre-publish scan; nothing was posted');
      found.push(...scanPatch(patch.stdout).map(hit => ({ ...hit, commit: wip.commit })));
      binary.push(...binaryPatchPaths(patch.stdout));
    }
    for (const offset of include) {
      try {
        const bytes = readFileSync(join(root, ...offset.split('/')));
        if (looksBinary(bytes)) { binary.push(offset); continue; }
        found.push(...scanText(offset, bytes.toString('utf8')));
      } catch { return invalid('github-include-missing', `--include ${offset} could not be read for the pre-publish scan; nothing was posted`); }
    }
    // The owner's safe to publish list is the scan's only exception: hits on
    // those paths are counted, never held — never-ship rules still apply to
    // them, a safe-listed path cannot carry a never-ship file.
    const hits = found.filter(hit => !publishListed(publish.safe, hit.path));
    const publicNeverShip: string[] = [];
    const baseTree = gitOutcome(root, ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', '--name-only', base]);
    for (const path of baseTree.stdout.split('\0')) {
      if (path !== '' && rules.some(rule => rule.match(path.toLowerCase()))) publicNeverShip.push(path);
    }
    // The licence fact, from the tree solvers will see: a licence file at the
    // branch root, plus the licence a package.json there declares.
    const rootEntries = gitOutcome(root, ['-c', 'core.quotepath=false', 'ls-tree', '-z', '--name-only', tipTree]).stdout.split('\0');
    const licenceFile = rootEntries.find(entry => LICENCE_NAME.test(entry)) ?? null;
    let declared: string | null = null;
    // The root listing already answered whether package.json is there — the
    // blob is read only when it is.
    const packageJson = rootEntries.includes('package.json') ? gitBlob(root, tipTree, 'package.json') : null;
    if (packageJson !== null) {
      try {
        const pkg = JSON.parse(packageJson.toString('utf8')) as { license?: unknown };
        if (typeof pkg.license === 'string' && pkg.license.trim() !== '') declared = pkg.license.trim();
      } catch { /* an unreadable package.json leaves declared null — a fact, not an error */ }
    }
    // One log --no-walk answers every commit-subject question, in the same
    // oldest-first order the pushed list is built in.
    const subjectShas = [...unpushed].reverse();
    const subjects = unpushed.length === 0
      ? []
      : git(root, ['log', '--no-walk=unsorted', '--format=%s', ...subjectShas]).split('\n');
    const pushed = subjectShas.map((sha, index) => ({ sha, subject: subjects[index] ?? '' }));
    if (wip !== null) pushed.push({ sha: wip.commit, subject: `box bounty ${record.id}: work in progress` });
    return {
      base,
      head: headSha,
      tip,
      tipTree,
      pushed,
      publishedFiles,
      wipCommit: wip?.commit ?? null,
      wip: wip === null ? null : { changed: wip.changed, added: wip.added, deleted: wip.deleted },
      leftHome: choice.withChanges ? 0 : tracked.length,
      untracked: untracked.length,
      include,
      scan: { hits, suppressed: found.length - hits.length, binary: [...new Set(binary)], commitsScanned: unpushed.length + (wip === null ? 0 : 1) },
      publicNeverShip: publicNeverShip.sort(),
      licence: { file: licenceFile, declared }
    };
  } finally {
    dropScanRefs(root, record.id);
  }
}
