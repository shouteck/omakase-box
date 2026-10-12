import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { resolveProgram } from '../box-package/commands.js';
import { answerBounty, NOTHING_RUN, quoteForeign, readAnswerFolder, showPath } from './answer.js';
import { renderListing } from './create.js';
import { BountyRefused } from './errors.js';
import { dryMergeOnto, git, gitBlob, gitOutcome, gitProgram, gitWriteBlob, mergeBase, ownerGitOutcome } from './git.js';
import type { DryMerge } from './git.js';
import { BUILTIN_RULES, loadOwnerList } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import { attemptRefName, attemptsOf, isOpenStage, loadRecord, persistRecord, resolveLimits, transitionTo } from './record.js';
import type { Attempt, BountyRecord } from './record.js';

// The bounty branch as it is posted now (BT6a): a name pointing at commits of
// the repository's real history — the newest commit GitHub already had, the
// poster's unpushed commits as they are, and at most one tool-built commit for
// uncommitted work the agent said the task needs. Nothing else is uploaded;
// solvers fork and open pull requests against the branch like any project.
// Publications written before this wave carry no `kind`: they were one
// parentless commit of a whole-repository snapshot. Those records still load,
// collect and close through the snapshot code kept below; `status` marks them.
export interface GitHubPublication {
  readonly repository: string;
  readonly account: string;
  readonly branch: string;
  readonly commit: string;
  readonly title: string;
  readonly body: string;
  /** `unnamed`: how many of them carry an account name GitHub returned in a form the tool will not print. */
  questions?: { readonly count: number; readonly latestAt: string | null; readonly unnamed?: number };
  seenPullRequests?: { readonly n: number; readonly commit: string; readonly at: string }[];
  /** 'history' on posts made since the bounty became an issue on the code that
      is already there; absent on snapshot posts made before. */
  readonly kind?: 'history';
  /** The newest commit on the poster's branch the GitHub repository already
      had — the commit the bounty branch is based on. History posts. */
  readonly base?: string;
  /** Commits the branch carries that GitHub did not have — the poster's
      unpushed commits plus the tool's work-in-progress commit, oldest first. */
  readonly pushed?: readonly { readonly sha: string; readonly subject: string }[];
  /** The tool-built work-in-progress commit on top, when the agent said the
      task needed uncommitted work — parented on the poster's HEAD, built by
      plumbing so the working tree, index and branch never moved. */
  readonly wipCommit?: string;
  readonly wip?: { readonly changed: readonly string[]; readonly added: readonly string[]; readonly deleted: readonly string[] } | null;
  state: 'preparing' | 'branch-pushed' | 'posted' | 'closed';
  issue: { readonly number: number; readonly url: string } | null;
  pending: string | null;
  /** Set when closing removed a branch that carried first-published commits —
      names them so nothing the agent published is lost by surprise. */
  closedNote?: string;
  outside?: { readonly at: string; readonly issueState: 'open' | 'closed'; readonly answers: string };
  unavailableAt?: string | null;
}

// The agent's two publication choices, made at `confirm <id> --to github` and
// recorded in githubApproval so `post` publishes exactly what was approved.
export interface GitHubChoice {
  /** The task needs the uncommitted changes to tracked files: they become one
      tool-built commit on the bounty branch. Absent, they stay home. */
  readonly withChanges: boolean;
  /** Untracked files to publish, named one by one. Never-ship names and names
      that do not resolve to untracked plain files are refused. */
  readonly include: readonly string[];
}

const PUBLIC_ONLY = 'posting outside would publish the code, so GitHub posting is only for repositories already public; a local folder is still available';
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const redact = (text: string): string => text.replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+)/g, '[credential redacted]');
const invalid = (reason: string, message: string): never => { throw new BountyRefused(reason, message); };
const publicationRef = (id: string): string => `refs/box-bounty/${id}-github`;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const READABLE_LOGIN = /^[a-z\d][a-z\d-]{0,38}(?:\[bot\])?$/i;
const login = (value: unknown): string => typeof value === 'string' && READABLE_LOGIN.test(value) ? value : invalid('github-response-invalid', 'GitHub returned an unreadable account name; nothing was executed');
const number = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid('github-response-invalid', 'GitHub returned an unreadable number');

// Never include gh/git diagnostics here: signed-in programs can print credentials.
function gh(root: string, args: readonly string[]): string {
  let program: ReturnType<typeof resolveProgram>;
  try { program = resolveProgram('gh'); }
  catch { return invalid('github-cli-missing', 'GitHub CLI gh is missing; install and sign in to gh, or post to a local folder'); }
  let result;
  if (program.kind === 'command-file') {
    for (const token of [program.path, ...args]) {
      if (/["%!\r\n]/.test(token) || /\\$/.test(token)) return invalid('github-cli-unsafe', 'this gh command file cannot carry these arguments safely; use the gh executable');
    }
    const line = `"${[program.path, ...args].map(token => `"${token}"`).join(' ')}"`;
    let interpreter: string;
    try { interpreter = resolveProgram('cmd.exe').path; }
    catch { return invalid('github-cli-missing', 'the command-file interpreter is missing; use the gh executable'); }
    result = spawnSync(interpreter, ['/d', '/s', '/c', line], { cwd: root, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  } else {
    result = spawnSync(program.path, [...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  }
  if (result.error !== undefined || result.status !== 0) return invalid('github-command-failed', 'GitHub CLI could not complete the requested operation; check gh sign-in and access, then retry');
  return result.stdout ?? '';
}

function api(root: string, endpoint: string, payload?: object, method?: string): unknown {
  const work = mkdtempSync(join(tmpdir(), 'box-bt6-gh-'));
  try {
    const args = ['api', '--hostname', 'github.com', endpoint];
    if (payload !== undefined) {
      const path = join(work, 'input.json');
      writeFileSync(path, JSON.stringify(payload));
      args.push('--method', method ?? 'POST', '--input', path);
    }
    const output = gh(root, args);
    try { return JSON.parse(output); }
    catch { return invalid('github-response-invalid', 'GitHub returned unreadable data; retry after checking gh'); }
  } finally { rmSync(work, { recursive: true, force: true }); }
}

function pages(root: string, endpoint: string): unknown[] {
  const entries: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const data = api(root, `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(data)) return invalid('github-response-invalid', 'GitHub returned an unreadable list');
    entries.push(...data);
    if (data.length < 100) return entries;
  }
}

function signedAccount(root: string): string {
  const account = api(root, 'user');
  if (!isObject(account)) return invalid('github-response-invalid', 'the signed-in account could not be read');
  return login(account['login']);
}

function ownRepository(root: string): string {
  const remote = gitOutcome(root, ['remote', 'get-url', '--push', '--all', 'origin']);
  const urls = remote.stdout.trim().split('\n');
  if (remote.status !== 0 || urls.length !== 1) return invalid('github-remote-required', 'the project must have one GitHub origin push destination; a local folder is still available');
  const url = urls[0] ?? '';
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z\d][a-z\d-]{0,38})\/([a-z\d_.-]+?)(?:\.git)?$/i.exec(url);
  if (match === null) return invalid('github-remote-required', 'origin is not an unambiguous GitHub repository; a local folder is still available');
  const repository = `${match[1]}/${match[2]}`;
  const fetch = gitOutcome(root, ['remote', 'get-url', '--all', 'origin']);
  const fetchUrls = fetch.stdout.trim().split('\n');
  const fetchMatch = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z\d][a-z\d-]{0,38})\/([a-z\d_.-]+?)(?:\.git)?$/i.exec(fetchUrls[0] ?? '');
  if (fetch.status !== 0 || fetchUrls.length !== 1 || fetchMatch === null || `${fetchMatch[1]}/${fetchMatch[2]}`.toLowerCase() !== repository.toLowerCase()) return invalid('github-remote-mismatch', 'origin fetch and push destinations must name the same GitHub repository; nothing was posted');
  return repository;
}

function publicRepository(root: string): string {
  const repository = ownRepository(root);
  try { gh(root, ['auth', 'status', '--hostname', 'github.com']); }
  catch (error) {
    if (error instanceof BountyRefused && error.reason === 'github-cli-missing') throw error;
    return invalid('github-not-signed-in', 'gh is not signed in to GitHub; sign in outside the tool or use a local folder');
  }
  let info: unknown;
  try { info = api(root, `repos/${repository}`); }
  catch { return invalid('github-visibility-unreadable', PUBLIC_ONLY); }
  if (!isObject(info) || typeof info['full_name'] !== 'string' || info['full_name'].toLowerCase() !== repository.toLowerCase() || typeof info['private'] !== 'boolean' || info['visibility'] !== 'public' && info['visibility'] !== 'private' && info['visibility'] !== 'internal') return invalid('github-visibility-unreadable', PUBLIC_ONLY);
  if (info['private'] !== false || info['visibility'] !== 'public') return invalid('github-private-repository', PUBLIC_ONLY);
  return info['full_name'];
}

function boundFolder(record: BountyRecord) {
  const folder = readAnswerFolder(record.folder);
  if (folder.manifest.id !== record.id || folder.manifest.snapshot.commit !== record.snapshot.commit || record.manifestSha256 === undefined || digest(folder.manifestBytes) !== record.manifestSha256) return invalid('manifest-tampered', 'the bounty folder no longer matches its recorded manifest; nothing was posted');
  return folder;
}

// The listing a legacy (pre-BT6a) publication carried — kept so records
// confirmed the old way can still post, collect and close unchanged.
function listingSnapshot(record: BountyRecord, repository: string) {
  if (!/^bt-[a-f\d]{12}$/.test(record.id)) return invalid('record-corrupt', 'the bounty identifier is not valid');
  const { manifest } = boundFolder(record);
  const branch = `box-bounty/${record.id}`;
  const title = `[box bounty ${record.id}] ${manifest.title}`;
  const sourceListing = renderListing(manifest, manifest.note)
    .replace('`repo/` holds', 'The branch root holds')
    .replace('There is no `.git` and no history.', 'No owner Git history was shipped.');
  const body = `${sourceListing}\n\n## Answer on GitHub\n\nRepository: https://github.com/${repository}\nBranch to work from: \`${branch}\`\nClone only this branch, make the change, and open a pull request against \`${branch}\` in this repository. The branch contains exactly the shipped source, with no owner history.\n\nNobody is known to be watching these issues yet. Anyone can read this issue and the branch, and any account may answer. Collecting an answer runs nothing a solver wrote.\n\n<!-- box-bounty:${record.id} -->\n`;
  return { branch, title, body };
}

function shippedCommit(root: string, record: BountyRecord): string {
  const { manifest } = boundFolder(record);
  const work = mkdtempSync(join(tmpdir(), 'box-bt6-index-'));
  try {
    const env = { GIT_INDEX_FILE: join(work, 'index') };
    git(root, ['read-tree', '--empty'], env);
    for (const file of manifest.files) {
      const bytes = gitBlob(root, record.snapshot.commit, file.path);
      if (bytes === null || digest(bytes) !== file.sha256) return invalid('snapshot-corrupt', 'the snapshot cannot reproduce the shipped set; nothing was posted');
      const oid = gitWriteBlob(root, bytes);
      git(root, ['update-index', '--add', '--cacheinfo', `100644,${oid},${file.path}`], env);
    }
    const tree = git(root, ['write-tree'], env);
    return git(root, ['-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost', 'commit-tree', tree, '-m', `box bounty ${record.id}`], env);
  } finally { rmSync(work, { recursive: true, force: true }); }
}

function remoteGit(root: string, repository: string, args: readonly string[]): void {
  const result = gitOutcome(root, [...args.slice(0, 1), `https://github.com/${repository}.git`, ...args.slice(1)]);
  if (result.status !== 0 || result.error !== undefined) return invalid('github-git-failed', 'Git could not complete the GitHub operation; check signed-in Git and retry');
}

function issueNumber(value: unknown, repository: string) {
  if (!isObject(value)) return invalid('github-response-invalid', 'GitHub returned an unreadable issue');
  const n = number(value['number']);
  const url = `https://github.com/${repository}/issues/${n}`;
  if (value['html_url'] !== url) return invalid('github-response-invalid', 'GitHub returned an issue outside the project repository');
  return { number: n, url };
}

// Every bounty issue carries the `box-bounty` label so a reader can find them
// all. Missing is not an error — the label is created on the repository first.
function ensureLabel(root: string, repository: string): void {
  try { api(root, `repos/${repository}/labels/box-bounty`); return; }
  catch (error) {
    if (!(error instanceof BountyRefused) || error.reason !== 'github-command-failed') throw error;
  }
  api(root, `repos/${repository}/labels`, { name: 'box-bounty' });
}

function recoverIssue(root: string, publication: GitHubPublication) {
  const existing = pages(root, `repos/${publication.repository}/issues?state=all`);
  const found = existing.find(entry => isObject(entry) && entry['title'] === publication.title
    && typeof entry['body'] === 'string' && entry['body'].includes(`<!-- box-bounty:${publication.branch.slice('box-bounty/'.length)} -->`)
    && isObject(entry['user']) && entry['user']['login'] === publication.account);
  return found === undefined ? null : issueNumber(found, publication.repository);
}

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
const remoteUrl = (repository: string): string => `https://github.com/${repository}.git`;

// What the remote reports, never a possibly-stale local tracking name: the
// remote's heads and tags are fetched into a wave-named namespace and their
// tips are read back. Leftovers from a crashed run are dropped first so a
// deleted remote branch cannot linger as coverage the remote no longer has.
const scanRoot = (id: string): string => `refs/box-bt6a-scan/${id}`;

function dropScanRefs(root: string, id: string): void {
  const refs = gitOutcome(root, ['for-each-ref', '--format=%(refname)', scanRoot(id)]);
  if (refs.status !== 0) return;
  for (const ref of refs.stdout.split('\n')) {
    if (ref !== '') gitOutcome(root, ['update-ref', '-d', ref]);
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

// The sha the remote's bounty branch points at now, or null when it is gone.
function remoteBranchSha(root: string, repository: string, branch: string): string | null {
  const remote = gitOutcome(root, ['ls-remote', remoteUrl(repository), `refs/heads/${branch}`]);
  if (remote.status !== 0 || remote.error !== undefined) return invalid('github-git-failed', 'Git could not read the bounty branch; check signed-in Git and retry');
  const sha = remote.stdout.trim().split(/\s+/)[0] ?? '';
  return /^[a-f\d]{40}$/.test(sha) ? sha : null;
}

interface NamedStatus { readonly status: string; readonly path: string }

// `git diff --name-status -z --no-renames` output: STATUS and path as separate
// NUL fields. --no-renames everywhere so a rename's source is never folded away.
function parseNameStatus(output: string): NamedStatus[] {
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
function neverShipViolations(statuses: readonly NamedStatus[], rules: readonly NeverShipRule[]): { path: string; rule: string }[] {
  const violations: { path: string; rule: string }[] = [];
  for (const { path } of statuses) {
    const rule = rules.find(candidate => candidate.match(path.toLowerCase()));
    if (rule !== undefined) violations.push({ path, rule: rule.name });
  }
  return violations;
}

// The empty tree — what a root commit is diffed against, so every path it
// plants appears as 'A' in the scan instead of disappearing behind the failed
// `<sha>^` a root has no answer for.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// `git diff --name-status` of a commit against its first parent, or against
// the empty tree when it has none: every path a commit introduces shows up in
// its own diff, so a never-ship file cannot hide in a root commit or in the
// tree of a merge that drops it. A failed diff is a refusal, never "no paths".
function commitStatuses(root: string, sha: string, consequence: string): NamedStatus[] {
  const parents = gitOutcome(root, ['rev-list', '--parents', '-n', '1', sha]);
  if (parents.status !== 0) return invalid('github-git-failed', `Git could not read commit ${sha.slice(0, 12)}; ${consequence}`);
  const parent = parents.stdout.trim().split(/\s+/).slice(1)[0] ?? EMPTY_TREE;
  const diff = gitOutcome(root, ['diff', '--name-status', '-z', '--no-renames', parent, sha]);
  if (diff.status !== 0) return invalid('github-git-failed', `Git could not read commit ${sha.slice(0, 12)}; ${consequence}`);
  return parseNameStatus(diff.stdout);
}

// `git diff HEAD --name-status` — every change to tracked files, staged or
// not, as the working tree stands: M (modified), A (staged new), D (deleted),
// T (type change). Untracked files are invisible to it by design.
function trackedChanges(root: string): NamedStatus[] {
  const unmerged = ownerGitOutcome(root, ['ls-files', '-u', '-z']);
  if (unmerged.status === 0 && unmerged.stdout.split('\0').some(entry => entry !== '')) {
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
function buildWip(root: string, record: BountyRecord, tracked: readonly NamedStatus[], include: readonly string[]): WipBuild | null {
  const work = mkdtempSync(join(tmpdir(), `box-bt6a-${record.id}-wip-`));
  try {
    const env = { GIT_INDEX_FILE: join(work, 'index') };
    git(root, ['read-tree', 'HEAD'], env);
    // Modes the index already knows, so an executable file stays executable.
    const modes = new Map<string, string>();
    for (const entry of ownerGitOutcome(root, ['ls-files', '-s', '-z']).stdout.split('\0')) {
      const match = /^(\d+) [a-f\d]{40} 0\t(.+)$/.exec(entry);
      if (match !== null) modes.set(match[2]!, match[1]!);
    }
    const changed: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];
    // Every component the commit places is checked with lstat, links NOT
    // followed: a link or junction at the path — or at any directory above
    // it — resolves to bytes elsewhere, so publishing it would ship what the
    // path never named. Non-plain entries are refused, not recorded as link
    // blobs: the stricter of the two fixes, and the simpler.
    const place = (path: string): boolean => {
      const parts = path.split('/');
      let absolute = root;
      for (const [index, part] of parts.entries()) {
        absolute = join(absolute, part);
        const stat = lstatSync(absolute, { throwIfNoEntry: false });
        if (stat === undefined) {
          git(root, ['update-index', '--force-remove', '--', path], env);
          return false;
        }
        if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory()) || (index === parts.length - 1 && !stat.isFile())) {
          return invalid('github-non-plain-path', `the uncommitted state holds a link or other non-plain entry at ${path} — the tool publishes file contents, not links; nothing was posted`);
        }
      }
      const blob = gitWriteBlob(root, readFileSync(absolute));
      git(root, ['update-index', '--add', '--cacheinfo', `${modes.get(path) ?? '100644'},${blob},${path}`], env);
      return true;
    };
    for (const { status, path } of tracked) {
      if (status === 'D') {
        git(root, ['update-index', '--force-remove', '--', path], env);
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
    const tree = git(root, ['write-tree'], env);
    const headTree = git(root, ['rev-parse', 'HEAD^{tree}']);
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
  readonly wipCommit: string | null;
  readonly wip: { readonly changed: readonly string[]; readonly added: readonly string[]; readonly deleted: readonly string[] } | null;
  /** Tracked changes the agent said the task does not need — they stay home. */
  readonly leftHome: number;
  readonly untracked: number;
  readonly include: readonly string[];
  /** Never-ship-named paths already in the public history — facts, not
      refusals: this tool cannot take back what is already public. */
  readonly publicNeverShip: readonly string[];
  readonly licence: { readonly file: string | null; readonly declared: string | null };
}

const LICENCE_NAME = /^licen[cs]e([._ -].*)?$/i;
const PREVIEW_PUBLIC_NAMES = 20;

function neverShipRules(root: string): readonly NeverShipRule[] {
  const ownerList = loadOwnerList(root);
  return ownerList === null ? BUILTIN_RULES : [...BUILTIN_RULES, ownerList.rule];
}

function planGitHub(root: string, repository: string, record: BountyRecord, rules: readonly NeverShipRule[], choice: GitHubChoice): GitHubPlan {
  const head = gitOutcome(root, ['rev-parse', '--verify', '-q', 'HEAD']);
  const headSha = head.status === 0 ? head.stdout.trim() : '';
  if (!/^[a-f\d]{40}$/.test(headSha)) {
    return invalid('github-no-public-base', 'the current branch has no commits yet — there is nothing the GitHub repository can already have; a local folder is still available');
  }
  const tips = scanRemote(root, repository, record.id);
  try {
    if (tips.length === 0) {
      return invalid('github-no-public-base', 'the GitHub repository reports no branches or tags — there is nothing public to point solvers at; a local folder is still available');
    }
    // The commits on the current branch the remote lacks, newest first — read
    // from what the remote itself reports, never a local tracking name.
    const stdin = `HEAD\n${tips.map(sha => `^${sha}`).join('\n')}\n`;
    const unpushed = gitStdin(root, ['rev-list', '--stdin', '--topo-order'], stdin)
      .split('\n').map(line => line.trim()).filter(sha => /^[a-f\d]{40}$/.test(sha));
    const unpushedSet = new Set(unpushed);
    // The newest commit the repository already has: the first commit in
    // topological order on the current branch that is not in the unpushed set.
    const base = gitOutcome(root, ['rev-list', '--topo-order', 'HEAD']).stdout
      .split('\n').map(line => line.trim()).find(sha => sha !== '' && !unpushedSet.has(sha));
    if (base === undefined) {
      return invalid('github-no-public-base', 'the current branch shares no commit with the GitHub repository — there is nothing public to point solvers at; a local folder is still available');
    }
    // The tool's own records under .box/bounties/ are bookkeeping, not work —
    // they carry owner-only context (`job`, `why`) documented as never
    // shipped, so they can no more land on the bounty branch than a
    // never-ship file can.
    const tracked = trackedChanges(root).filter(change => !change.path.startsWith('.box/bounties/'));
    const untracked = untrackedEntries(root).filter(entry => !entry.startsWith('.box/bounties/'));
    const include = validateIncludes(root, choice.include, rules);
    const needsWip = (choice.withChanges && tracked.length > 0) || include.length > 0;
    const wip = needsWip ? buildWip(root, record, choice.withChanges ? tracked : [], include) : null;
    const tip = wip?.commit ?? headSha;
    const tipTree = wip?.tree ?? git(root, ['rev-parse', 'HEAD^{tree}']);
    // Never-ship on what is new only: every commit first published here,
    // judged by what it lands versus its first parent — a root commit versus
    // the empty tree, so a planted path cannot hide. A never-ship-named file
    // already in the public history is a fact, not a refusal — this tool
    // cannot take it back, so the preview says so instead.
    const violations: { path: string; rule: string }[] = [];
    for (const sha of unpushed) {
      violations.push(...neverShipViolations(commitStatuses(root, sha, 'nothing was posted'), rules));
    }
    if (wip !== null) {
      const statuses = parseNameStatus(gitOutcome(root, ['diff', '--name-status', '-z', '--no-renames', 'HEAD', wip.tree]).stdout);
      violations.push(...neverShipViolations(statuses, rules));
    }
    if (violations.length > 0) {
      const named = [...new Map(violations.map(v => [v.path, v])).values()];
      return invalid('github-never-ship', `a change being published for the first time touches never-ship paths — refused, nothing was posted: ${named.map(v => `${v.path} (rule '${v.rule}')`).join(', ')}`);
    }
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
    const packageJson = gitBlob(root, tipTree, 'package.json');
    if (packageJson !== null) {
      try {
        const pkg = JSON.parse(packageJson.toString('utf8')) as { license?: unknown };
        if (typeof pkg.license === 'string' && pkg.license.trim() !== '') declared = pkg.license.trim();
      } catch { /* an unreadable package.json leaves declared null — a fact, not an error */ }
    }
    const pushed = [...unpushed].reverse().map(sha => ({
      sha,
      subject: git(root, ['show', '-s', '--format=%s', sha])
    }));
    if (wip !== null) pushed.push({ sha: wip.commit, subject: `box bounty ${record.id}: work in progress` });
    return {
      base,
      head: headSha,
      tip,
      tipTree,
      pushed,
      wipCommit: wip?.commit ?? null,
      wip: wip === null ? null : { changed: wip.changed, added: wip.added, deleted: wip.deleted },
      leftHome: choice.withChanges ? 0 : tracked.length,
      untracked: untracked.length,
      include,
      publicNeverShip: publicNeverShip.sort(),
      licence: { file: licenceFile, declared }
    };
  } finally {
    dropScanRefs(root, record.id);
  }
}

// The listing a stranger reads: the task, what was tried, the branch to work
// from (with the base commit as context — never the bare commit to branch
// from, or a branch carrying work in progress would refuse the answer), how
// to answer, the stated reward and the licence fact. No snapshot, no files
// kept out — the code is the repository's real history.
function listingHistory(record: BountyRecord, repository: string, plan: GitHubPlan): { branch: string; title: string; body: string } {
  const { manifest } = boundFolder(record);
  // Generated folder notes describe the local snapshot, including work left home.
  // An authored --note is public by choice; automatic job context stays local.
  const note = record.noteSource === 'generated' ? null : manifest.note;
  const branch = `box-bounty/${record.id}`;
  const title = `[box bounty ${record.id}] ${manifest.title}`;
  const onTop = plan.pushed.length === 0
    ? `it points at that commit — nothing new was published`
    : `it carries the poster's work in progress — ${plan.pushed.length} commit(s) on top of that commit: ${plan.pushed.map(c => `\`${c.sha.slice(0, 12)}\` ${c.subject}`).join(', ')}`;
  const body = [
    `# Bounty: ${manifest.title}`,
    '',
    `id ${record.id} · created ${manifest.createdAt} by ${manifest.tool}`,
    '',
    '## What is wanted',
    '',
    manifest.task.text.trim(),
    '',
    '## What was already tried', '', note !== null ? note.text.trim() : 'No public note was supplied.', '',
    '## The code',
    '',
    `Branch from \`${branch}\` — it is the branch pull requests for this bounty target.`,
    `The branch is based on commit ${plan.base}, the newest commit this repository already had: ${onTop}.`,
    '',
    '## How to answer',
    '',
    `Fork this repository (or push a branch inside it), branch from \`${branch}\`, make the change, and open a pull request against \`${branch}\` in this repository. Collecting an answer runs nothing you wrote — the poster reads the change and decides.`,
    '',
    'Nobody is known to be watching these issues yet. Anyone can read this issue and the branch, and any account may answer.',
    '',
    'reward: $0',
    plan.licence.file !== null
      ? `licence: ${plan.licence.file}${plan.licence.declared !== null ? ` (package.json declares ${plan.licence.declared})` : ''}`
      : 'licence: no licence file was found at the branch root',
    '',
    `<!-- box-bounty:${record.id} -->`,
    ''
  ].join('\n');
  return { branch, title, body };
}

function renderPlanPreview(repository: string, record: BountyRecord, plan: GitHubPlan, text: { branch: string; title: string; body: string }): string {
  const lines: string[] = [];
  lines.push(`GitHub preview: ${repository}, public. Anyone can read the issue and branch.`);
  lines.push(`Branch: ${text.branch} → ${plan.tip}`);
  lines.push(`Base: commit ${plan.base} — the newest commit on the current branch the repository already has`);
  lines.push('What becomes public that was not:');
  if (plan.pushed.length === 0) {
    lines.push('  nothing new is published');
  } else {
    lines.push(`  commits published for the first time (${plan.pushed.length}):`);
    for (const commit of plan.pushed) {
      lines.push(`    ${commit.sha.slice(0, 12)} ${commit.subject}${commit.sha === plan.wipCommit ? ' — the tool\'s work-in-progress commit' : ''}`);
    }
    if (plan.wip !== null) {
      if (plan.wip.changed.length > 0) lines.push(`  files changed in the work-in-progress commit: ${plan.wip.changed.join(', ')}`);
      if (plan.wip.added.length > 0) lines.push(`  files added in the work-in-progress commit: ${plan.wip.added.join(', ')}`);
      if (plan.wip.deleted.length > 0) lines.push(`  files deleted in the work-in-progress commit: ${plan.wip.deleted.join(', ')}`);
    }
  }
  lines.push(`Uncommitted changes to tracked files: ${plan.wipCommit !== null ? 'included as one commit on the branch' : plan.leftHome > 0 ? `${plan.leftHome} file(s) stay home — the task was not said to need them` : 'none present'}`);
  lines.push(`Untracked: ${plan.untracked} entr${plan.untracked === 1 ? 'y' : 'ies'} stay home${plan.include.length > 0 ? `; published by name: ${plan.include.join(', ')}` : ''}`);
  if (plan.publicNeverShip.length > 0) {
    const named = plan.publicNeverShip.slice(0, PREVIEW_PUBLIC_NAMES);
    lines.push(`Already public — this tool cannot take it back: ${plan.publicNeverShip.length} never-ship-named path(s) exist in the public history: ${named.join(', ')}${plan.publicNeverShip.length > PREVIEW_PUBLIC_NAMES ? ` … and ${plan.publicNeverShip.length - PREVIEW_PUBLIC_NAMES} more` : ''}`);
  }
  lines.push(`Issue title: ${text.title}`);
  lines.push('Issue body:');
  lines.push(text.body);
  return lines.join('\n');
}

// `confirm <id> --to github`: compute the plan once and record it in
// githubApproval — base, tip, the first-published commits, the work-in-progress
// lists and the choices — so `post` publishes exactly what was approved.
export function approveGitHub(root: string, record: BountyRecord, choice: GitHubChoice) {
  const repository = publicRepository(root);
  const rules = neverShipRules(root);
  const plan = planGitHub(root, repository, record, rules, choice);
  const text = listingHistory(record, repository, plan);
  const preview = renderPlanPreview(repository, record, plan, text);
  return {
    repository,
    preview,
    base: plan.base,
    head: plan.head,
    tip: plan.tip,
    tipTree: plan.tipTree,
    title: text.title,
    body: text.body,
    pushed: plan.pushed,
    ...(plan.wipCommit !== null ? { wipCommit: plan.wipCommit } : {}),
    wip: plan.wip,
    include: choice.include,
    withChanges: choice.withChanges,
    leftHome: plan.leftHome,
    untracked: plan.untracked
  };
}

export function previewGitHub(root: string, id: string, choice: GitHubChoice = { withChanges: false, include: [] }): string {
  const record = loadRecord(root, id);
  return approveGitHub(root, record, choice).preview;
}

export function postGitHub(root: string, id: string): { record: BountyRecord; destination: string } {
  const record = loadRecord(root, id);
  if (record.stage !== 'confirmed' && !(record.github !== undefined && record.stage === 'posted')) return invalid('not-confirmed', `bounty ${id} must be confirmed before posting to GitHub`);
  if (!resolveLimits(root).allowedDestinations?.includes('github')) return invalid('destination-not-allowed', 'github is not named in the owner\'s allowedDestinations; nothing was posted');
  const repository = publicRepository(root);
  if (record.githubApproval === undefined) return invalid('github-preview-required', `confirm the GitHub preview first with box bounty confirm ${id} --to github`);
  if (record.githubApproval.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository approved at confirmation; nothing was posted');
  if (record.github !== undefined && record.github.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository approved for this bounty; nothing was posted');
  const account = signedAccount(root);
  if (record.github !== undefined && record.github.account !== account) return invalid('github-account-changed', 'sign in to the account that started this post before retrying; nothing was posted');
  if (record.github === undefined) {
    const approval = record.githubApproval;
    // A full plan, or none at all: approvals written before this wave carry
    // only repository and preview, and post the snapshot they approved. Some
    // fields present and others missing is a record no honest write produced —
    // falling back would publish the opposite of what was approved.
    const planFields = ['base', 'head', 'tip', 'tipTree', 'title', 'body', 'pushed', 'wip', 'include', 'withChanges', 'leftHome', 'untracked'] as const;
    const present = planFields.filter(field => approval[field] !== undefined);
    const fullPlan = (value: typeof approval): value is typeof approval & Required<Pick<typeof approval, (typeof planFields)[number]>> => planFields.every(field => value[field] !== undefined);
    let publication: GitHubPublication;
    if (fullPlan(approval)) {
      // Publish exactly what was approved: recompute the plan live and refuse
      // by name when the working state, the branch or the remote moved since
      // the preview — the preview and the push can never disagree.
      const plan = planGitHub(root, repository, record, neverShipRules(root), {
        withChanges: approval.withChanges === true,
        include: approval.include ?? []
      });
      if (plan.base !== approval.base) {
        return invalid('github-preview-stale', `what the GitHub repository has moved since the preview was approved — run box bounty confirm ${id} --to github again; nothing was posted`);
      }
      if (plan.head !== approval.head || plan.pushed.length !== (approval.pushed ?? []).length || plan.pushed.some((commit, index) => commit.sha !== approval.pushed![index]!.sha)) {
        return invalid('github-preview-stale', `the branch moved since the preview was approved — run box bounty confirm ${id} --to github again; nothing was posted`);
      }
      if (plan.tip !== approval.tip) {
        return invalid('github-preview-stale', `the uncommitted work or named files changed since the preview was approved — run box bounty confirm ${id} --to github again; nothing was posted`);
      }
      // Even work that stays home is part of what the owner was shown: if the
      // tracked or untracked leftovers changed since the preview, it is stale.
      if (plan.leftHome !== approval.leftHome || plan.untracked !== approval.untracked || plan.include.join('') !== (approval.include ?? []).join('')) {
        return invalid('github-preview-stale', `the working state changed since the preview was approved — run box bounty confirm ${id} --to github again; nothing was posted`);
      }
      publication = {
        repository,
        account,
        kind: 'history',
        branch: `box-bounty/${id}`,
        title: approval.title,
        body: approval.body,
        commit: approval.tip,
        base: approval.base,
        pushed: approval.pushed ?? [],
        ...(approval.wipCommit !== undefined ? { wipCommit: approval.wipCommit } : {}),
        wip: approval.wip ?? null,
        state: 'preparing',
        issue: null,
        pending: null
      };
    } else if (present.length === 0) {
      // An approval written before this wave: the snapshot post it approved.
      publication = { repository, account, ...listingSnapshot(record, repository), commit: shippedCommit(root, record), state: 'preparing', issue: null, pending: null };
    } else {
      return invalid('record-corrupt', `the recorded GitHub approval carries only some plan fields (${present.join(', ')}) — it is not a readable approval; nothing was posted`);
    }
    record.github = publication;
    git(root, ['update-ref', publicationRef(id), publication.commit]);
    persistRecord(root, record);
  }
  const branchTip = remoteBranchSha(root, repository, record.github.branch);
  if (branchTip !== null && branchTip !== record.github.commit) {
    return invalid('github-branch-changed', `${record.github.branch} on the remote is ${branchTip}, not the ${record.github.commit} this tool approved — it was changed outside the tool; nothing was posted`);
  }
  const publication = record.github;
  try {
    remoteGit(root, repository, ['push', `${publication.commit}:refs/heads/${publication.branch}`]);
    publication.state = 'branch-pushed';
    persistRecord(root, record);
    if (publication.issue === null) {
      publication.issue = recoverIssue(root, publication) ?? (() => {
        ensureLabel(root, repository);
        const created = api(root, `repos/${repository}/issues`, { title: publication.title, body: publication.body, labels: ['box-bounty'] });
        const labels = isObject(created) && Array.isArray(created['labels']) ? created['labels'] : [];
        if (!labels.some(entry => isObject(entry) && entry['name'] === 'box-bounty')) return invalid('github-response-invalid', 'the box-bounty label did not land on the issue');
        return issueNumber(created, repository);
      })();
    }
    publication.state = 'posted'; publication.pending = null;
    if (record.stage === 'confirmed') transitionTo(root, record, 'posted', { destination: publication.issue.url });
    else persistRecord(root, record);
    return { record, destination: publication.issue.url };
  } catch {
    publication.pending = `post-incomplete: ${publication.state}; issue ${publication.issue?.url ?? 'not recorded'}; retry box bounty post ${id} --to github or remove with box bounty withdraw ${id}`;
    persistRecord(root, record);
    return invalid('github-post-incomplete', publication.pending);
  }
}

export function listGitHubAnswers(root: string, id: string, record = loadRecord(root, id)): string {
  if (record.github === undefined) return invalid('not-github-posted', 'this bounty has no GitHub post; answer from a local folder');
  const { repository, branch } = record.github;
  const data = pages(root, `repos/${repository}/pulls?state=open&base=${branch}`);
  const lines = [`GitHub answers for ${id} against ${branch}:`];
  for (const entry of data) {
    if (!isObject(entry) || !isObject(entry['user'])) return invalid('github-response-invalid', 'GitHub returned an unreadable pull request');
    const n = number(entry['number']);
    if (!isObject(entry['head']) || typeof entry['head']['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(entry['head']['sha'])) return invalid('github-response-invalid', 'GitHub returned an unreadable solution commit');
    const commit = entry['head']['sha'];
    const seen = record.github.seenPullRequests?.find(entry => entry.n === n && entry.commit === commit);
    const files = pages(root, `repos/${repository}/pulls/${n}/files`);
    const names = files.map(file => isObject(file) && typeof file['filename'] === 'string' ? redact(quoteForeign(file['filename'])) : invalid('github-response-invalid', 'GitHub returned unreadable changed files'));
    const collected = record.attempts?.find(attempt => attempt.commit === commit);
    const next = collected === undefined ? `collect: box bounty answer ${id} --pr ${n}` : `collected as solution ${collected.n}; look: box bounty look ${id} ${collected.n}`;
    lines.push(`  #${n} by ${login(entry['user']['login'])}: ${names.join(', ')}; ${seen === undefined ? 'new' : `seen since ${seen.at}`}; ${next}`);
    if (seen === undefined) record.github.seenPullRequests = [...record.github.seenPullRequests ?? [], { n, commit, at: new Date().toISOString() }];
  }
  if (data.length === 0) lines.push('  none open; wait for an answer or withdraw the bounty');
  persistRecord(root, record);
  return lines.join('\n');
}

export function refreshGitHubStatus(root: string, record: BountyRecord): void {
  const publication = record.github;
  if (publication?.state !== 'posted' || publication.issue === null) return;
  try {
    const issue = api(root, `repos/${publication.repository}/issues/${publication.issue.number}`);
    if (!isObject(issue) || issue['state'] !== 'open' && issue['state'] !== 'closed') return invalid('github-response-invalid', 'GitHub returned an unreadable issue state');
    const answers = listGitHubAnswers(root, record.id, record);
    const comments = issueComments(root, record, issue); // the issue read above — status asks GitHub for it once
    const unnamed = comments.filter(comment => comment.author === null).length;
    publication.questions = { count: comments.length, latestAt: comments.map(comment => comment.at).sort().at(-1) ?? null, ...(unnamed > 0 ? { unnamed } : {}) };
    publication.outside = { at: new Date().toISOString(), issueState: issue['state'], answers };
    publication.unavailableAt = null;
  } catch {
    publication.unavailableAt = new Date().toISOString();
  }
  persistRecord(root, record);
}

// `author` is null when GitHub returned an account name the tool will not
// print: the comment still counts and is still shown, marked as such.
type IssueComment = { readonly author: string | null; readonly body: string; readonly at: string };

function boundIssue(root: string, record: BountyRecord, fetched?: unknown): { repository: string; number: number; account: string } {
  const publication = record.github;
  if (publication === undefined || publication.issue === null) return invalid('not-github-posted', `this bounty has no GitHub issue; next: box bounty status`);
  const issue = fetched ?? api(root, `repos/${publication.repository}/issues/${publication.issue.number}`);
  if (!isObject(issue) || issue['number'] !== publication.issue.number || typeof issue['body'] !== 'string' || !issue['body'].includes(`<!-- box-bounty:${record.id} -->`) || !isObject(issue['user']) || issue['user']['login'] !== publication.account) return invalid('github-issue-mismatch', `the issue is not this bounty's; no reply was posted; next: box bounty status`);
  return { repository: publication.repository, number: publication.issue.number, account: publication.account };
}

function issueComments(root: string, record: BountyRecord, fetched?: unknown): IssueComment[] {
  const issue = boundIssue(root, record, fetched);
  return pages(root, `repos/${issue.repository}/issues/${issue.number}/comments`).flatMap(entry => {
    if (!isObject(entry) || !isObject(entry['user']) || entry['user']['login'] === issue.account) return [];
    if (typeof entry['body'] !== 'string' || typeof entry['created_at'] !== 'string' || !Number.isFinite(Date.parse(entry['created_at']))) return invalid('github-response-invalid', 'GitHub returned an unreadable comment; next: box bounty status');
    const author = entry['user']['login'];
    return [{ author: typeof author === 'string' && READABLE_LOGIN.test(author) ? author : null, body: redact(entry['body']), at: entry['created_at'] }];
  });
}

export function questionsBounty(root: string, id: string): string {
  const record = loadRecord(root, id);
  const comments = issueComments(root, record);
  return [`${id}: ${comments.length} comment(s) written by others, not by the tool.`, ...comments.flatMap(comment => [`  ${comment.author === null ? 'an account whose name could not be read' : JSON.stringify(comment.author)} at ${comment.at}:`, ...comment.body.split('\n').map(line => `    other account | ${quoteForeign(line)}`)]), `next: box bounty reply ${id} --text "<your own words>"; or box bounty status ${id}`].join('\n');
}

export function replyBounty(root: string, id: string, text: string): BountyRecord {
  const record = loadRecord(root, id);
  const issue = boundIssue(root, record);
  if (signedAccount(root) !== issue.account) return invalid('github-account-changed', 'sign in as the owner who posted this bounty; next: box bounty status');
  if (text.trim() === '' || text.length > 65536) return invalid('reply-invalid', 'supply your own nonempty reply, at most 65536 characters; next: box bounty questions');
  const result = api(root, `repos/${issue.repository}/issues/${issue.number}/comments`, { body: text });
  if (!isObject(result) || result['body'] !== text || !isObject(result['user']) || result['user']['login'] !== issue.account) return invalid('github-response-invalid', 'GitHub did not confirm the reply; next: box bounty status');
  record.replies = [...record.replies ?? [], { at: new Date().toISOString(), issue: issue.number }];
  persistRecord(root, record);
  return record;
}

// A pull request's change on the real history: the diff against the bounty
// branch tip it descends from, classified changed/added/deleted.
function pullRequestChange(root: string, base: string, head: string): { changed: readonly string[]; added: readonly string[]; deleted: readonly string[] } {
  const diff = gitOutcome(root, ['diff', '--name-status', '-z', '--no-renames', base, head]);
  if (diff.status !== 0) return invalid('github-pr-unreadable', 'Git could not read the pull request change; nothing was collected');
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  for (const { status, path } of parseNameStatus(diff.stdout)) {
    if (status === 'A') added.push(path);
    else if (status === 'D') deleted.push(path);
    else changed.push(path);
  }
  return { changed: changed.sort(), added: added.sort(), deleted: deleted.sort() };
}

// Added/removed line counts across the pull request's commits — git's read of
// the delta against the bounty branch tip, numstat only (never patch text, so
// no foreign .gitattributes can select a diff driver).
function pullRequestCounts(root: string, base: string, head: string): { added: number; removed: number; binary: number } {
  const run = gitOutcome(root, ['diff', '--numstat', '-z', base, head]);
  let added = 0; let removed = 0; let binary = 0;
  for (const entry of run.stdout.split('\0')) {
    if (entry === '') continue;
    const [a, d] = entry.split('\t');
    if (a === '-') binary += 1;
    else { added += Number.parseInt(a ?? '0', 10) || 0; removed += Number.parseInt(d ?? '0', 10) || 0; }
  }
  return { added, removed, binary };
}

// The stated test-file rule, for the flag: a path counts as a test when a
// segment is `test`, `tests` or `__tests__`, or the basename matches
// `test_*`, `*_test.*`, `*.test.*` or `*.spec.*` — the same rule the folder
// path states.
const isTestPath = (path: string): boolean => {
  const segments = path.toLowerCase().split('/');
  if (segments.slice(0, -1).some(segment => segment === 'test' || segment === 'tests' || segment === '__tests__')) return true;
  const base = segments[segments.length - 1]!;
  return base.startsWith('test_') || /_test\.[^.]+$/.test(base) || /\.(?:test|spec)\.[^.]+$/.test(base);
};

// Flags are plain observations, deliberately eager — the same stated rules as
// the folder path's report. No flag blocks anything.
const LARGE_FILES = 20;
const LARGE_LINES = 400;
function pullRequestFlags(change: { changed: readonly string[]; added: readonly string[]; deleted: readonly string[] }, counts: { added: number; removed: number }): string[] {
  const flags: string[] = [];
  const touched = [...change.changed, ...change.added, ...change.deleted];
  const testLike = touched.filter(isTestPath);
  if (testLike.length > 0) flags.push(`the answer touches ${testLike.map(showPath).join(', ')}, marked as a test by the stated rule (a test/, tests/ or __tests__/ segment, or a test_*, *_test.*, *.test.* or *.spec.* basename)`);
  if (change.added.length > 0) flags.push(`the answer adds ${change.added.length} file(s)`);
  if (change.deleted.length > 0) flags.push(`the answer deletes ${change.deleted.length} file(s)`);
  if (touched.length > LARGE_FILES || counts.added + counts.removed > LARGE_LINES) {
    flags.push(`the change is above the stated size (${LARGE_FILES} files or ${LARGE_LINES} lines): ${touched.length} files, ${counts.added + counts.removed} lines`);
  }
  return flags;
}

function renderPullRequestReport(record: BountyRecord, n: number, at: string, author: string, commits: number, change: { changed: readonly string[]; added: readonly string[]; deleted: readonly string[] }, merge: DryMerge, counts: { added: number; removed: number; binary: number }): string[] {
  const lines: string[] = [];
  lines.push(`report — attempt ${n} for ${record.id}`);
  lines.push(`  from: GitHub account ${author} — arrived ${at}`);
  lines.push(`  change: ${commits} commit(s) on the bounty branch — ${change.changed.length} changed, ${change.added.length} added, ${change.deleted.length} deleted — ${counts.added} lines added, ${counts.removed} removed${counts.binary > 0 ? ` (${counts.binary} binary file(s))` : ''}`);
  if (merge.kind === 'clean') {
    lines.push('  current code: the answer would merge cleanly onto the current branch');
  } else if (merge.kind === 'conflict') {
    lines.push(`  current code: merging onto the current branch would conflict in ${merge.paths.map(showPath).join(', ')}`);
  } else {
    lines.push(`  current code: cannot tell — ${merge.detail}`);
  }
  const flags = pullRequestFlags(change, counts);
  if (flags.length === 0) lines.push('  flags: none');
  else for (const flag of flags) lines.push(`  flag: ${flag}`);
  lines.push(`  ${NOTHING_RUN}`);
  lines.push(`  next: box bounty apply ${record.id} ${n} — or box bounty look ${record.id} ${n} to read it in a copy first, or box bounty reject ${record.id} --reason "<why>"`);
  return lines;
}

export function answerGitHub(root: string, id: string, pr: number) {
  const record = loadRecord(root, id);
  if (record.github === undefined || record.github.state !== 'posted') return invalid('not-github-posted', 'this bounty is not posted to GitHub');
  if (!isOpenStage(record.stage)) return invalid('not-posted', `bounty ${id} is ${record.stage} — an answer can only come back to a bounty that is still open`);
  if (!Number.isSafeInteger(pr) || pr < 1) return invalid('github-pr-missing', 'name an existing pull request number');
  const publication = record.github;
  const { repository, branch } = publication;
  let data: unknown;
  try { data = api(root, `repos/${repository}/pulls/${pr}`); }
  catch { return invalid('github-pr-missing', 'that pull request cannot be read in the project repository; nothing was collected'); }
  if (!isObject(data) || !isObject(data['base']) || !isObject(data['base']['repo']) || data['base']['ref'] !== branch || data['base']['repo']['full_name'] !== repository) return invalid('github-pr-wrong-branch', 'the pull request targets another branch or repository; nothing was collected');
  if (!isObject(data['head']) || typeof data['head']['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(data['head']['sha']) || !isObject(data['user'])) return invalid('github-response-invalid', 'GitHub returned unreadable pull request facts');
  const author = login(data['user']['login']);
  const ref = `refs/box-bounty/${id}-pr-${pr}`;
  try {
    remoteGit(root, repository, ['fetch', '--no-tags', '--no-recurse-submodules', `refs/pull/${pr}/head:${ref}`]);
    const commit = git(root, ['rev-parse', ref]);
    if (commit !== data['head']['sha']) return invalid('github-pr-changed', 'the pull request changed during collection; retry to collect its current version');
    if (publication.kind !== 'history') return collectSnapshotPullRequest(root, record, id, commit, author);
    const result = collectHistoryPullRequest(root, record, publication, commit, author);
    if (publication.seenPullRequests?.some(entry => entry.n === pr && entry.commit === commit) !== true) {
      publication.seenPullRequests = [...publication.seenPullRequests ?? [], { n: pr, commit, at: result.record.attempts?.find(attempt => attempt.commit === commit)?.seenAt ?? new Date().toISOString() }];
      persistRecord(root, result.record);
    }
    return result;
  } finally {
    gitOutcome(root, ['update-ref', '-d', ref]);
  }
}

// The history path: the pull request's commits are the answer. Refusals, each
// changing nothing: its history does not descend from the bounty branch; its
// tree holds a link, a submodule or an unsafe name; a path it carries matches
// never-ship anywhere in its new history; it changes nothing at all.
function collectHistoryPullRequest(root: string, record: BountyRecord, publication: GitHubPublication, commit: string, author: string) {
  if (gitOutcome(root, ['merge-base', '--is-ancestor', publication.commit, commit]).status !== 0) {
    return invalid('github-pr-not-descended', `the pull request's history does not descend from ${publication.branch}, the bounty branch — there is nothing sound to compare it with; nothing was collected`);
  }
  const remoteTip = remoteBranchSha(root, publication.repository, publication.branch);
  if (remoteTip !== publication.commit) {
    return invalid('github-branch-changed', `${publication.branch} on the remote is ${remoteTip ?? 'gone'}, not the ${publication.commit} this tool posted — it was changed outside the tool; nothing was collected`);
  }
  const tree = gitOutcome(root, ['ls-tree', '-rz', commit]);
  if (tree.status !== 0) return invalid('github-pr-unreadable', 'Git could not read the pull request tree');
  for (const entry of tree.stdout.split('\0')) {
    if (entry === '') continue;
    const match = /^(100644|100755) blob ([a-f\d]{40})\t(.+)$/s.exec(entry);
    if (match === null || match[3] === undefined || match[3].split('/').some(segment => segment === '' || segment === '.' || segment === '..') || /[\\:\x00-\x1f]/.test(match[3])) return invalid('answer-unsafe-path', 'the pull request tree holds a link, a submodule or an unsafe path; nothing was collected');
    if (redact(match[3]) !== match[3]) return invalid('github-response-invalid', 'a pull request path contains credential-shaped text; nothing was collected');
  }
  // Never-ship on everything the pull request introduces: a path it touches
  // anywhere in its new history — added, changed or deleted — is refused,
  // so a file planted deep in the history and removed in the last commit
  // still cannot land.
  const rules = neverShipRules(root);
  const newCommits = gitOutcome(root, ['rev-list', '--topo-order', `${publication.commit}..${commit}`]).stdout
    .split('\n').map(line => line.trim()).filter(sha => /^[a-f\d]{40}$/.test(sha));
  const violations: { path: string; rule: string }[] = [];
  for (const sha of newCommits) {
    violations.push(...neverShipViolations(commitStatuses(root, sha, 'nothing was collected'), rules));
  }
  if (violations.length > 0) {
    const named = [...new Map(violations.map(v => [v.path, v])).values()];
    return invalid('answer-never-ship', `the pull request touches never-ship paths in its history — refused, nothing was collected: ${named.map(v => `${v.path} (rule '${v.rule}')`).join(', ')}`);
  }
  const change = pullRequestChange(root, publication.commit, commit);
  if (change.changed.length === 0 && change.added.length === 0 && change.deleted.length === 0) {
    return invalid('answer-empty', 'the pull request changes nothing against the bounty branch — a return that changes nothing is no answer');
  }
  const n = attemptsOf(record).length + 1;
  // Pin the attempt commit before recording anything — a crash between loses
  // nothing the record names.
  git(root, ['update-ref', attemptRefName(record.id, n), commit]);
  transitionTo(root, record, 'taken', { attempt: n, command: 'answer' });
  transitionTo(root, record, 'answered', { attempt: n });
  record.conflicts = null;

  const at = new Date().toISOString();
  const merge = dryMergeOnto(root, commit);
  const counts = pullRequestCounts(root, publication.commit, commit);
  const report = renderPullRequestReport(record, n, at, author, newCommits.length, change, merge, counts);
  const attempt: Attempt = {
    n,
    at,
    seenAt: publication.seenPullRequests?.find(entry => entry.commit === commit)?.at ?? at,
    author,
    commit,
    changed: change.changed,
    added: change.added,
    deleted: change.deleted,
    outcome: 'answered',
    conflicts: merge.kind === 'conflict' ? merge.paths : null,
    report
  };
  record.attempts = [...attemptsOf(record), attempt];
  persistRecord(root, record);
  return { record, outcome: 'answered' as const, attempt: n, report, ...(merge.kind === 'conflict' ? { conflicts: merge.paths } : {}) };
}

// The pre-BT6a path, kept for bounties posted as a snapshot: the pull request
// tree is materialized into an answer folder bound to the shipped manifest.
function collectSnapshotPullRequest(root: string, record: BountyRecord, id: string, commit: string, author: string) {
  const work = mkdtempSync(join(tmpdir(), `box-bt6-${id}-pr-`));
  try {
    mkdirSync(join(work, 'repo'));
    const { manifestBytes } = boundFolder(record);
    writeFileSync(join(work, 'bounty.json'), manifestBytes);
    const tree = gitOutcome(root, ['ls-tree', '-rz', commit]);
    if (tree.status !== 0) return invalid('github-pr-unreadable', 'Git could not read the pull request tree');
    for (const entry of tree.stdout.split('\0')) {
      if (entry === '') continue;
      const match = /^(100644|100755) blob ([a-f\d]{40})\t(.+)$/s.exec(entry);
      if (match === null || match[3] === undefined || match[3].split('/').some(segment => segment === '' || segment === '.' || segment === '..') || /[\\:\x00-\x1f]/.test(match[3])) return invalid('answer-unsafe-path', 'the pull request tree holds a link or unsafe path; nothing was collected');
      const path = match[3];
      if (redact(path) !== path) return invalid('github-response-invalid', 'a pull request path contains credential-shaped text; nothing was collected');
      const bytes = gitBlob(root, commit, path);
      if (bytes === null) return invalid('github-pr-unreadable', 'a pull request blob could not be read');
      const target = join(work, 'repo', ...path.split('/'));
      mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
    }
    // Any account may answer and any attempt may be applied — nothing a solver
    // wrote is ever run, so the author is recorded as a fact, not a barrier.
    return answerBounty(root, id, work, author);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Local decisions stand even when GitHub is unavailable. Retrying the same
// decision resumes here, using a stable comment marker to avoid duplicates.
export function syncGitHubDecision(root: string, record: BountyRecord): void {
  const publication = record.github;
  if (publication === undefined) return;
  const decisions = record.events.filter(entry => ['apply', 'reject', 'withdraw', 'undo'].includes(entry.command ?? ''));
  const event = decisions.at(-1);
  if (event === undefined) return;
  try {
    if (signedAccount(root) !== publication.account) return invalid('github-account-changed', 'sign in to the account that started this post to finish outside work');
    if (publication.issue === null) {
      publication.issue = recoverIssue(root, publication);
      persistRecord(root, record);
    }
    if (publication.issue !== null) {
      const endpoint = `repos/${publication.repository}/issues/${publication.issue.number}`;
      const comments = pages(root, `${endpoint}/comments`);
      for (const decision of decisions) {
        const marker = `<!-- box-bounty:${record.id}:${decision.command} -->`;
        const fact = decision.command === 'apply' ? `Applied as commit ${decision.merge}.` : decision.command === 'reject' ? `Rejected. Recorded reason: ${decision.reason}` : decision.command === 'undo' ? `Undo recorded as commit ${decision.merge}.` : 'Withdrawn.';
        const body = `${fact}\n\n${marker}`;
        if (!comments.some(entry => isObject(entry) && entry['body'] === body && isObject(entry['user']) && entry['user']['login'] === publication.account)) {
          const response = api(root, `${endpoint}/comments`, { body });
          if (!isObject(response) || response['body'] !== body || !isObject(response['user']) || response['user']['login'] !== publication.account) return invalid('github-response-invalid', 'GitHub did not confirm the decision comment');
          comments.push(response);
        }
      }
      // Before the branch goes, name what removing it loses: a history post's
      // branch can carry commits that exist nowhere else — the poster's
      // unpushed commits and the tool's work-in-progress commit. Their shas
      // stay reachable through the record, but a reader of the issue is owed
      // the names. The marker keeps a retry from naming them twice.
      const pushed = publication.pushed ?? [];
      if (publication.kind === 'history' && pushed.length > 0) {
        const marker = `<!-- box-bounty:${record.id}:branch-removed -->`;
        const body = `The bounty branch \`${publication.branch}\` is removed. It carried ${pushed.length} commit(s) that existed only there — their identifiers stay valid in any clone that fetched them: ${pushed.map(commit => `\`${commit.sha}\` ${commit.subject}`).join(', ')}.\n\n${marker}`;
        if (!comments.some(entry => isObject(entry) && entry['body'] === body && isObject(entry['user']) && entry['user']['login'] === publication.account)) {
          const response = api(root, `${endpoint}/comments`, { body });
          if (!isObject(response) || response['body'] !== body || !isObject(response['user']) || response['user']['login'] !== publication.account) return invalid('github-response-invalid', 'GitHub did not confirm the branch-removal comment');
        }
      }
      const closed = api(root, endpoint, { state: 'closed' }, 'PATCH');
      if (!isObject(closed) || closed['state'] !== 'closed') return invalid('github-response-invalid', 'GitHub did not confirm issue closure');
    }
    const tip = remoteBranchSha(root, publication.repository, publication.branch);
    if (tip !== null && tip !== publication.commit) {
      throw new BountyRefused('github-branch-changed', `${publication.branch} on the remote is ${tip}, not the ${publication.commit} this tool posted — it was changed outside the tool; removing it is not this tool's call`);
    }
    if (tip !== null) remoteGit(root, publication.repository, ['push', `:refs/heads/${publication.branch}`]);
    git(root, ['update-ref', '-d', publicationRef(record.id)]);
    publication.state = 'closed';
    if (publication.kind === 'history' && (publication.pushed?.length ?? 0) > 0) {
      publication.closedNote = `${publication.branch} carried ${publication.pushed!.length} commit(s) published only there — ${publication.pushed!.map(commit => `${commit.sha.slice(0, 12)} ${commit.subject}`).join(', ')} — and is now removed`;
    }
    publication.pending = null;
  } catch (error) {
    const detail = error instanceof BountyRefused ? ` (${error.reason}: ${error.message})` : '';
    publication.pending = `github-decision-pending${detail}: local ${event.command} stands; retry box bounty ${event.command} ${record.id}${event.command === 'reject' ? ' --reason "<recorded reason>"' : ''} to comment, close the issue and remove ${publication.branch}`;
  }
  persistRecord(root, record);
}
