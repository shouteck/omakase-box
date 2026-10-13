import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { resolveProgram } from '../box-package/commands.js';
import { answerBounty, NOTHING_RUN, quoteForeign, readAnswerFolder, showPath } from './answer.js';
import { renderListing } from './create.js';
import { BountyRefused } from './errors.js';
import { dryMergeOnto, git, gitBlob, gitBlobs, gitFilteredBlob, gitIndexWrite, gitOutcome, gitProgram, gitRefsWrite, mergeBase, ownerGitOutcome } from './git.js';
import type { DryMerge, IndexChange } from './git.js';
import { BUILTIN_RULES, loadOwnerList } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import { allowedByFor, attemptRefName, attemptsOf, isOpenStage, loadRecord, ownerGate, persistRecord, resolveLimits, transitionTo, waitForOwner } from './record.js';
import type { Attempt, BountyRecord } from './record.js';
import { requireRepository } from './repository.js';

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
  seenPullRequests?: { readonly n: number; readonly commit: string; readonly at: string; readonly author?: string }[];
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

// The agent's two publication choices, named on `post <id> --to github`
// (before BT8 they were made at `confirm`). Records carrying a githubApproval
// from then still post exactly what was approved.
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

// The least GitHub CLI the tool runs on — every GitHub call is `gh api` or
// `gh auth status`, carried verbatim; the tool is only proven against gh
// 2.x. The probe is one `version` spawn per program per process, paid only
// by commands that reach GitHub — `gh` output is the only place its own
// version exists.
export const GH_LEAST = '2.0';
const probedGh = new Set<string>();

// Never include gh/git diagnostics here: signed-in programs can print credentials.
function gh(root: string, args: readonly string[]): string {
  let program: ReturnType<typeof resolveProgram>;
  try { program = resolveProgram('gh'); }
  catch { return invalid('github-cli-missing', `GitHub CLI gh ${GH_LEAST} or later is required for GitHub bounties — none was found on PATH (https://cli.github.com). A local folder is still available`); }
  if (!probedGh.has(program.path)) {
    // `gh version`, never `gh --version`: a gh.exe that is a wrapped program
    // may see the double-dash flag eaten by its own runtime before the
    // subcommand ever runs — a wrapped `gh` has no such flag of its own.
    const probe = launch(program, root, ['version']);
    const found = /gh version (\d+)\.(\d+)/.exec(probe.stdout ?? '');
    if (probe.error !== undefined || probe.status !== 0 || found === null) {
      return invalid('github-cli-missing', `GitHub CLI gh ${GH_LEAST} or later is required for GitHub bounties — the program at ${program.path} did not answer 'gh version' (https://cli.github.com). A local folder is still available`);
    }
    if (Number(found[1]) < 2) {
      return invalid('github-cli-too-old', `GitHub CLI gh ${GH_LEAST} or later is required — found gh ${found[1]}.${found[2]} (https://cli.github.com). A local folder is still available`);
    }
    probedGh.add(program.path);
  }
  const result = launch(program, root, args);
  if (result.error !== undefined || result.status !== 0) return invalid('github-command-failed', 'GitHub CLI could not complete the requested operation; check gh sign-in and access, then retry');
  return result.stdout ?? '';
}

function launch(program: ReturnType<typeof resolveProgram>, root: string, args: readonly string[]) {
  if (program.kind === 'command-file') {
    for (const token of [program.path, ...args]) {
      if (/["%!\r\n]/.test(token) || /\\$/.test(token)) throw new BountyRefused('github-cli-unsafe', 'this gh command file cannot carry these arguments safely; use the gh executable');
    }
    const line = `"${[program.path, ...args].map(token => `"${token}"`).join(' ')}"`;
    let interpreter: string;
    try { interpreter = resolveProgram('cmd.exe').path; }
    catch { throw new BountyRefused('github-cli-missing', 'the command-file interpreter is missing; use the gh executable'); }
    return spawnSync(interpreter, ['/d', '/s', '/c', line], { cwd: root, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  }
  return spawnSync(program.path, [...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
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
  return requireRepository(root);

}

function publicRepository(root: string): string {
  const repository = ownRepository(root);
  try { gh(root, ['auth', 'status', '--hostname', 'github.com']); }
  catch (error) {
    // CLI presence/version refusals keep their own names — only the auth
    // call's failure means not-signed-in.
    if (error instanceof BountyRefused && error.reason.startsWith('github-cli-')) throw error;
    return invalid('github-not-signed-in', `GitHub CLI gh ${GH_LEAST} or later, signed in, is required for GitHub bounties — gh is present but not signed in to GitHub (https://cli.github.com). A local folder is still available`);
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
  // One ls-tree names each shipped blob's own object id and one cat-file
  // --batch reads every blob for the digest check — the ids the snapshot
  // recorded are placed verbatim, so no per-file hash-object round trips.
  const listing = gitOutcome(root, ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', '--format=%(objectname) %(path)', record.snapshot.commit]);
  if (listing.status !== 0) return invalid('snapshot-corrupt', 'the snapshot cannot reproduce the shipped set; nothing was posted');
  const objectIds = new Map<string, string>();
  for (const entry of listing.stdout.split('\0')) {
    const space = entry.indexOf(' ');
    if (space !== -1) objectIds.set(entry.slice(space + 1), entry.slice(0, space));
  }
  const blobs = gitBlobs(root, record.snapshot.commit, manifest.files.map(file => file.path));
  const changes: IndexChange[] = [];
  for (const file of manifest.files) {
    const bytes = blobs.get(file.path);
    const oid = objectIds.get(file.path);
    if (bytes === null || bytes === undefined || oid === undefined || digest(bytes) !== file.sha256) return invalid('snapshot-corrupt', 'the snapshot cannot reproduce the shipped set; nothing was posted');
    changes.push({ mode: '100644', sha: oid, path: file.path });
  }
  const work = mkdtempSync(join(tmpdir(), 'box-bt6-index-'));
  try {
    gitIndexWrite(root, join(work, 'index'), changes);
    const env = { GIT_INDEX_FILE: join(work, 'index') };
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
  // like name: `name = "value"` or `name: "value"`. Long enough and mixed
  // enough that ordinary code mentioning such names does not match — a
  // short token, a getter call or a plain-words value is not a hit.
  { name: 'assigned-secret', pattern: /\b(?:[a-z0-9_.[\]-]*?(?:secret|token|passw(?:or)?d|api[-_]?key|access[-_]?key|private[-_]?key|client[-_]?secret|auth[-_]?token)[a-z0-9_.[\]-]*)\s*[:=]\s*['"]([A-Za-z0-9+/=_.~-]{20,})['"]/i }
];

// "Long random": at least two character classes among lower, upper, digit —
// "application/octet-stream" or a sentence is not a secret.
const randomEnough = (value: string): boolean =>
  [/[a-z]/, /[A-Z]/, /[0-9]/].filter(re => re.test(value)).length >= 2;

export interface ScanHit { readonly path: string; readonly line: number; readonly rule: string }

// Scan one line's text. The assigned-secret rule checks its captured value
// for the mixed classes — the pattern alone cannot say "random".
function scanLine(path: string, lineNo: number, text: string, hits: ScanHit[]): void {
  for (const rule of SECRET_RULES) {
    const found = rule.pattern.exec(text);
    if (found === null) continue;
    if (rule.name === 'assigned-secret' && !randomEnough(found[1] ?? '')) continue;
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

// The empty tree — what a root commit is diffed against, so every path it
// plants appears as 'A' in the scan instead of disappearing behind the failed
// `<sha>^` a root has no answer for.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// `git diff --name-status` of a commit against its first parent, or against
// the empty tree when it has none: every path a commit introduces shows up in
// its own diff, so a never-ship file cannot hide in a root commit or in the
// tree of a merge that drops it. A failed diff is a refusal, never "no paths".
// `firstParent` is the commit's first parent when the caller's own rev-list
// --parents already printed it — the per-commit `rev-list --parents -n 1`
// question is then asked zero extra times. null means "read it", the empty
// tree covers the no-parent case a present map produces.
function commitStatuses(root: string, sha: string, consequence: string, knownParent?: string): NamedStatus[] {
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
  readonly wipCommit: string | null;
  readonly wip: { readonly changed: readonly string[]; readonly added: readonly string[]; readonly deleted: readonly string[] } | null;
  /** Tracked changes the agent said the task does not need — they stay home. */
  readonly leftHome: number;
  readonly untracked: number;
  readonly include: readonly string[];
  /** The pre-publish scan over first-published bytes: added lines of each
      first-published commit's diff, the work-in-progress diff and every
      named include file. File and line named, never the value. */
  readonly scan: { readonly hits: readonly ScanHit[]; readonly commitsScanned: number };
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
  // One rev-parse answers both HEAD questions the plan asks: the branch tip
  // and its tree — used for the no-commits refusal, the wip comparison and
  // the plan's head/tipTree fields.
  const headLines = gitOutcome(root, ['rev-parse', 'HEAD', 'HEAD^{tree}']).stdout.split('\n').map(line => line.trim());
  const headSha = headLines[0] ?? '';
  const headTree = headLines[1] ?? '';
  if (!/^[a-f\d]{40}$/.test(headSha) || !/^[a-f\d]{40}$/.test(headTree)) {
    return invalid('github-no-public-base', 'the current branch has no commits yet — there is nothing the GitHub repository can already have; a local folder is still available');
  }
  const tips = scanRemote(root, repository, record.id);
  try {
    if (tips.length === 0) {
      return invalid('github-no-public-base', 'the GitHub repository reports no branches or tags — there is nothing public to point solvers at; a local folder is still available');
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
      return invalid('github-no-public-base', 'the current branch shares no commit with the GitHub repository — there is nothing public to point solvers at; a local folder is still available');
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
    for (const sha of unpushed) {
      violations.push(...neverShipViolations(commitStatuses(root, sha, 'nothing was posted', firstParents.get(sha) ?? EMPTY_TREE), rules));
    }
    if (wip !== null) {
      const statuses = parseNameStatus(gitOutcome(root, ['diff', '--name-status', '-z', '--no-renames', 'HEAD', wip.tree]).stdout);
      violations.push(...neverShipViolations(statuses, rules));
    }
    if (violations.length > 0) {
      const named = [...new Map(violations.map(v => [v.path, v])).values()];
      return invalid('github-never-ship', `a change being published for the first time touches never-ship paths — refused, nothing was posted: ${named.map(v => `${v.path} (rule '${v.rule}')`).join(', ')}`);
    }
    // The pre-publish scan: the added lines of every commit published for
    // the first time, of the work-in-progress diff, and of each named
    // untracked file — the same diffs the never-ship read already walks, one
    // extra git read per first-published commit.
    const hits: ScanHit[] = [];
    for (const sha of unpushed) {
      const patch = gitOutcome(root, ['diff', '-p', '--no-renames', firstParents.get(sha) ?? EMPTY_TREE, sha]);
      if (patch.status !== 0) return invalid('github-git-failed', `Git could not read commit ${sha.slice(0, 12)} for the pre-publish scan; nothing was posted`);
      hits.push(...scanPatch(patch.stdout));
    }
    if (wip !== null) {
      const patch = gitOutcome(root, ['diff', '-p', '--no-renames', 'HEAD', wip.tree]);
      if (patch.status !== 0) return invalid('github-git-failed', 'Git could not read the work-in-progress diff for the pre-publish scan; nothing was posted');
      hits.push(...scanPatch(patch.stdout));
    }
    for (const offset of include) {
      try { hits.push(...scanText(offset, readFileSync(join(root, ...offset.split('/')), 'utf8'))); }
      catch { return invalid('github-include-missing', `--include ${offset} could not be read for the pre-publish scan; nothing was posted`); }
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
      wipCommit: wip?.commit ?? null,
      wip: wip === null ? null : { changed: wip.changed, added: wip.added, deleted: wip.deleted },
      leftHome: choice.withChanges ? 0 : tracked.length,
      untracked: untracked.length,
      include,
      scan: { hits, commitsScanned: unpushed.length + (wip === null ? 0 : 1) },
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
  if (plan.scan.hits.length === 0) {
    lines.push(`Pre-publish scan: clean — ${plan.scan.commitsScanned} first-published commit(s) read${plan.include.length > 0 ? ` plus ${plan.include.length} named file(s)` : ''}`);
  } else {
    lines.push(`Pre-publish scan: ${plan.scan.hits.length} secret-shaped hit(s) — a post would wait for the owner:`);
    for (const hit of plan.scan.hits) lines.push(`    ${hit.path}:${hit.line} — ${hit.rule}`);
  }
  lines.push(`Issue title: ${text.title}`);
  lines.push('Issue body:');
  lines.push(text.body);
  return lines.join('\n');
}

// `--preview` (and, before BT8, `confirm <id> --to github`): compute the plan
// once — base, tip, the first-published commits, the work-in-progress lists,
// the choices and the pre-publish scan — so the printed preview is exactly
// what a post would publish.
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

export function postGitHub(root: string, id: string, opts?: { answered?: boolean; choice?: GitHubChoice }): { record: BountyRecord; destination: string } {
  const record = loadRecord(root, id);
  const resumable = record.github !== undefined && record.stage === 'posted';
  if (record.stage !== 'confirmed' && record.stage !== 'drafted' && record.stage !== 'waiting' && !resumable) {
    return invalid('not-postable', `bounty ${id} is ${record.stage} — only a drafted or confirmed bounty can be posted`);
  }
  // Read local permission before any gh probe. A waiting post publishes
  // nothing; visibility remains a hard stop once permission permits a call.
  if (record.stage !== 'confirmed' && opts?.answered !== true && record.github === undefined && record.githubApproval === undefined) {
    ownerGate(root, record, { for: 'post', to: 'github', choice: opts?.choice ?? { withChanges: false, include: [] } });
  }
  const repository = publicRepository(root);
  if (record.githubApproval !== undefined && record.githubApproval.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository the recorded approval was made for; nothing was posted');
  if (record.github !== undefined && record.github.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository approved for this bounty; nothing was posted');
  const account = signedAccount(root);
  if (record.github !== undefined && record.github.account !== account) return invalid('github-account-changed', 'sign in to the account that started this post before retrying; nothing was posted');
  if (record.github === undefined && record.githubApproval === undefined) {
    // The standing-decision path (BT8): no per-bounty approval exists or is
    // needed. The owner's written answer gates the post; the pre-publish
    // scan holds what it finds; a named untracked file always holds.
    const choice = opts?.choice ?? { withChanges: false, include: [] };
    const priorWait = record.waiting;
    const legacyConfirmed = record.stage === 'confirmed';
    const plan = planGitHub(root, repository, record, neverShipRules(root), choice);
    // An owner answer clears only what the recorded wait named: a post held
    // for the decision alone can still carry scan hits the owner never saw —
    // those hold again, listing them. Rerunning `post` is never an answer.
    const seen = opts?.answered === true ? priorWait?.reason : undefined;
    if (plan.scan.hits.length > 0 && seen !== 'secrets') {
      waitForOwner(root, record, { for: 'post', reason: 'secrets', at: new Date().toISOString(), to: 'github', choice, hits: plan.scan.hits });
      return invalid('publish-held', [
        `${id} — the pre-publish scan found ${plan.scan.hits.length} secret-shaped hit(s); this bounty waits for the owner:`,
        ...plan.scan.hits.map(hit => `  ${hit.path}:${hit.line} — ${hit.rule}`),
        `the owner allows it once with box bounty allow ${id}, adds the path to never-ship, or ends it with box bounty close ${id}`,
        'nothing else is held up. The scan is a stated pattern list, not proof of absence.'
      ].join('\n'));
    }
    if (plan.include.length > 0 && seen !== 'secrets' && seen !== 'untracked-file') {
      waitForOwner(root, record, { for: 'post', reason: 'untracked-file', at: new Date().toISOString(), to: 'github', choice });
      return invalid('publish-held', [
        `${id} — an untracked file is named for publishing (${plan.include.join(', ')}); this bounty waits for the owner`,
        `the owner allows it once with box bounty allow ${id}, or ends it with box bounty close ${id}`
      ].join('\n'));
    }
    record.allowedBy = allowedByFor(root, record, opts?.answered === true, legacyConfirmed);
    const text = listingHistory(record, repository, plan);
    const publication: GitHubPublication = {
      repository,
      account,
      kind: 'history',
      branch: `box-bounty/${id}`,
      title: text.title,
      body: text.body,
      commit: plan.tip,
      base: plan.base,
      pushed: plan.pushed,
      ...(plan.wipCommit !== null ? { wipCommit: plan.wipCommit } : {}),
      wip: plan.wip,
      state: 'preparing',
      issue: null,
      pending: null
    };
    record.github = publication;
    git(root, ['update-ref', publicationRef(id), publication.commit]);
    persistRecord(root, record);
  }
  if (record.github === undefined) {
    const approval = record.githubApproval!;
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
      // The pre-wave approval cannot be refreshed — the command that recorded
      // it is removed — so a stale one ends the bounty rather than guess.
      const staleNext = `the approval recorded before the decision moved to the owner's settings can no longer be refreshed; end this bounty with box bounty close ${id} and create a new one — nothing was posted`;
      if (plan.base !== approval.base) {
        return invalid('github-preview-stale', `what the GitHub repository has moved since the preview was approved — ${staleNext}`);
      }
      if (plan.head !== approval.head || plan.pushed.length !== (approval.pushed ?? []).length || plan.pushed.some((commit, index) => commit.sha !== approval.pushed![index]!.sha)) {
        return invalid('github-preview-stale', `the branch moved since the preview was approved — ${staleNext}`);
      }
      if (plan.tip !== approval.tip) {
        return invalid('github-preview-stale', `the uncommitted work or named files changed since the preview was approved — ${staleNext}`);
      }
      // Even work that stays home is part of what the owner was shown: if the
      // tracked or untracked leftovers changed since the preview, it is stale.
      if (plan.leftHome !== approval.leftHome || plan.untracked !== approval.untracked || plan.include.join('') !== (approval.include ?? []).join('')) {
        return invalid('github-preview-stale', `the working state changed since the preview was approved — ${staleNext}`);
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
    // The recorded approval was the owner's own written yes — kept as the
    // answer that allowed this post.
    record.allowedBy = allowedByFor(root, record, opts?.answered === true, true);
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
    if (record.stage !== 'posted') transitionTo(root, record, 'posted', { destination: publication.issue.url });
    else persistRecord(root, record);
    return { record, destination: publication.issue.url };
  } catch {
    publication.pending = `post-incomplete: ${publication.state}; issue ${publication.issue?.url ?? 'not recorded'}; retry box bounty post ${id} --to github or remove with box bounty close ${id}`;
    persistRecord(root, record);
    return invalid('github-post-incomplete', publication.pending);
  }
}

export function listGitHubAnswers(root: string, id: string, record = loadRecord(root, id)): string {
  if (record.github === undefined) return invalid('not-github-posted', `this bounty has no GitHub post; collect a returned folder with box bounty look ${id} --from <dir> or box bounty apply ${id} --from <dir>`);
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
    const next = collected === undefined ? `collect: box bounty look ${id} ${n} or box bounty apply ${id} ${n}` : `collected as solution ${collected.n}; look: box bounty look ${id} ${collected.n}`;
    lines.push(`  #${n} by ${login(entry['user']['login'])}: ${names.join(', ')}; ${seen === undefined ? 'new' : `seen since ${seen.at}`}; ${next}`);
    if (seen === undefined) record.github.seenPullRequests = [...record.github.seenPullRequests ?? [], { n, commit, at: new Date().toISOString(), author: login(entry['user']['login']) }];
  }
  if (data.length === 0) lines.push('  none open; wait for one or close the bounty');
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
export type IssueComment = { readonly author: string | null; readonly body: string; readonly at: string };

function boundIssue(root: string, record: BountyRecord, fetched?: unknown): { repository: string; number: number; account: string } {
  const publication = record.github;
  if (publication === undefined || publication.issue === null) return invalid('not-github-posted', `this bounty has no GitHub issue; next: box bounty status`);
  const issue = fetched ?? api(root, `repos/${publication.repository}/issues/${publication.issue.number}`);
  if (!isObject(issue) || issue['number'] !== publication.issue.number || typeof issue['body'] !== 'string' || !issue['body'].includes(`<!-- box-bounty:${record.id} -->`) || !isObject(issue['user']) || issue['user']['login'] !== publication.account) return invalid('github-issue-mismatch', `the issue is not this bounty's; nothing was read from it; next: box bounty status`);
  return { repository: publication.repository, number: publication.issue.number, account: publication.account };
}

export function issueComments(root: string, record: BountyRecord, fetched?: unknown): IssueComment[] {
  const issue = boundIssue(root, record, fetched);
  return pages(root, `repos/${issue.repository}/issues/${issue.number}/comments`).flatMap(entry => {
    if (!isObject(entry) || !isObject(entry['user']) || entry['user']['login'] === issue.account) return [];
    if (typeof entry['body'] !== 'string' || typeof entry['created_at'] !== 'string' || !Number.isFinite(Date.parse(entry['created_at']))) return invalid('github-response-invalid', 'GitHub returned an unreadable comment; next: box bounty status');
    const author = entry['user']['login'];
    return [{ author: typeof author === 'string' && READABLE_LOGIN.test(author) ? author : null, body: redact(entry['body']), at: entry['created_at'] }];
  });
}

// Reading what other accounts wrote is folded into `status --comments` —
// issueComments above is what it renders, bound to this bounty's own issue
// first, so a record pointed at the wrong issue refuses by name.

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
  if (testLike.length > 0) flags.push(`the solution touches ${testLike.map(showPath).join(', ')}, marked as a test by the stated rule (a test/, tests/ or __tests__/ segment, or a test_*, *_test.*, *.test.* or *.spec.* basename)`);
  if (change.added.length > 0) flags.push(`the solution adds ${change.added.length} file(s)`);
  if (change.deleted.length > 0) flags.push(`the solution deletes ${change.deleted.length} file(s)`);
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
    lines.push('  current code: the solution would merge cleanly onto the current branch');
  } else if (merge.kind === 'conflict') {
    lines.push(`  current code: merging onto the current branch would conflict in ${merge.paths.map(showPath).join(', ')}`);
  } else {
    lines.push(`  current code: cannot tell — ${merge.detail}`);
  }
  const flags = pullRequestFlags(change, counts);
  if (flags.length === 0) lines.push('  flags: none');
  else for (const flag of flags) lines.push(`  flag: ${flag}`);
  lines.push(`  ${NOTHING_RUN}`);
  lines.push(`  next: box bounty look ${record.id} ${n} to read the change; box bounty apply ${record.id} ${n} to merge it; or box bounty close ${record.id} --reason "<why>"`);
  return lines;
}

// Collecting a pull request: the checks the old `answer` command enforced,
// run before anything is written — the same gate `look <id> <n>` and `apply
// <id> <n>` pass through for a number no recorded attempt carries. `via` is
// the driving command's name for the recorded event.
export function answerGitHub(root: string, id: string, pr: number, via?: 'look' | 'apply') {
  const record = loadRecord(root, id);
  if (record.github === undefined || record.github.state !== 'posted') return invalid('not-github-posted', 'this bounty is not posted to GitHub');
  if (!isOpenStage(record.stage)) return invalid('not-posted', `bounty ${id} is ${record.stage} — a solution can only come back to a bounty that is still open`);
  if (!Number.isSafeInteger(pr) || pr < 1) return invalid('github-pr-missing', 'name an existing pull request number');
  const publication = record.github;
  const { repository, branch } = publication;
  let data: unknown;
  try { data = api(root, `repos/${repository}/pulls/${pr}`); }
  catch { return invalid('github-pr-missing', 'that pull request cannot be read in the project repository; nothing was collected'); }
  if (!isObject(data) || !isObject(data['base']) || !isObject(data['base']['repo']) || data['base']['ref'] !== branch || data['base']['repo']['full_name'] !== repository) return invalid('github-pr-wrong-branch', 'the pull request targets another branch or repository; nothing was collected');
  if (!isObject(data['head']) || typeof data['head']['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(data['head']['sha']) || !isObject(data['user'])) return invalid('github-response-invalid', 'GitHub returned unreadable pull request facts');
  const author = login(data['user']['login']);
  // The pull request's head lands on FETCH_HEAD alone — no scratch ref to
  // create and delete around the read.
  remoteGit(root, repository, ['fetch', '--no-tags', '--no-recurse-submodules', `refs/pull/${pr}/head`]);
  const commit = git(root, ['rev-parse', 'FETCH_HEAD']);
  if (commit !== data['head']['sha']) return invalid('github-pr-changed', 'the pull request changed during collection; retry to collect its current version');
  if (publication.kind !== 'history') return collectSnapshotPullRequest(root, record, id, commit, author, pr, via);
  const result = collectHistoryPullRequest(root, record, publication, commit, author, pr, via);
  if (publication.seenPullRequests?.some(entry => entry.n === pr && entry.commit === commit) !== true) {
    publication.seenPullRequests = [...publication.seenPullRequests ?? [], { n: pr, commit, at: result.record.attempts?.find(attempt => attempt.commit === commit)?.seenAt ?? new Date().toISOString() }];
    persistRecord(root, result.record);
  }
  return result;
}

// `look <id> <n>` and `apply <id> <n>` accept a pull request's number
// directly: when no recorded attempt carries n and the bounty is posted on
// GitHub, the number collects the pull request first — every check above —
// and the attempt it lands is the one the command proceeds with. `via` is
// the command's own name for the recorded event.
export function resolveAttempt(root: string, record: BountyRecord, n: number, via: 'look' | 'apply'): { record: BountyRecord; attempt: Attempt; collected: boolean } {
  const found = attemptsOf(record).find(candidate => candidate.n === n);
  if (found !== undefined) return { record, attempt: found, collected: false };
  if (record.github?.state === 'posted' && isOpenStage(record.stage)) {
    const collected = answerGitHub(root, record.id, n, via);
    const attempt = attemptsOf(collected.record).find(candidate => candidate.n === collected.attempt);
    if (attempt !== undefined) return { record: collected.record, attempt, collected: true };
  }
  const known = attemptsOf(record).map(candidate => `#${candidate.n}`).join(', ') || 'none yet';
  const way = record.github === undefined
    ? `name one of them, or collect a returned folder first: box bounty ${via} ${record.id} --from <dir>`
    : `name one of them or a pull request number — the pull request collects itself`;
  return invalid('unknown-attempt', `solution ${n} does not exist on ${record.id} — the bounty knows ${known}; ${way}`);
}

// The history path: the pull request's commits are the answer. Refusals, each
// changing nothing: its history does not descend from the bounty branch; its
// tree holds a link, a submodule or an unsafe name; a path it carries matches
// never-ship anywhere in its new history; it changes nothing at all.
function collectHistoryPullRequest(root: string, record: BountyRecord, publication: GitHubPublication, commit: string, author: string, pr: number, via?: string) {
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
  // --parents rides the same walk: each new commit's first parent comes back
  // in the same line, so no per-commit `rev-list --parents` is needed.
  const firstParents = new Map<string, string>();
  const newCommits = gitOutcome(root, ['rev-list', '--topo-order', '--parents', `${publication.commit}..${commit}`]).stdout
    .split('\n').map(line => line.trim().split(/\s+/)).filter(fields => /^[a-f\d]{40}$/.test(fields[0] ?? ''))
    .map(fields => {
      if (fields[1] !== undefined) firstParents.set(fields[0]!, fields[1]!);
      return fields[0]!;
    });
  const violations: { path: string; rule: string }[] = [];
  for (const sha of newCommits) {
    violations.push(...neverShipViolations(commitStatuses(root, sha, 'nothing was collected', firstParents.get(sha) ?? EMPTY_TREE), rules));
  }
  if (violations.length > 0) {
    const named = [...new Map(violations.map(v => [v.path, v])).values()];
    return invalid('answer-never-ship', `the pull request touches never-ship paths in its history — refused, nothing was collected: ${named.map(v => `${v.path} (rule '${v.rule}')`).join(', ')}`);
  }
  const change = pullRequestChange(root, publication.commit, commit);
  if (change.changed.length === 0 && change.added.length === 0 && change.deleted.length === 0) {
    return invalid('answer-empty', 'the pull request changes nothing against the bounty branch — a return that changes nothing is no solution');
  }
  // A pull request keeps its own number as its solution number — the outside
  // listing and `look`/`apply <id> <n>` name the same thing. A number already
  // carried by an attempt (this pull request collected before, or a returned
  // folder that took it) falls back to the next free number.
  const n = attemptsOf(record).some(attempt => attempt.n === pr)
    ? attemptsOf(record).reduce((max, attempt) => Math.max(max, attempt.n), 0) + 1
    : pr;
  // Pin the attempt commit before recording anything — a crash between loses
  // nothing the record names.
  git(root, ['update-ref', attemptRefName(record.id, n), commit]);
  transitionTo(root, record, 'taken', { attempt: n, ...(via !== undefined ? { command: via } : {}) });
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
function collectSnapshotPullRequest(root: string, record: BountyRecord, id: string, commit: string, author: string, pr: number, via?: string) {
  const work = mkdtempSync(join(tmpdir(), `box-bt6-${id}-pr-`));
  try {
    mkdirSync(join(work, 'repo'));
    const { manifestBytes } = boundFolder(record);
    writeFileSync(join(work, 'bounty.json'), manifestBytes);
    const tree = gitOutcome(root, ['ls-tree', '-rz', commit]);
    if (tree.status !== 0) return invalid('github-pr-unreadable', 'Git could not read the pull request tree');
    const paths: string[] = [];
    for (const entry of tree.stdout.split('\0')) {
      if (entry === '') continue;
      const match = /^(100644|100755) blob ([a-f\d]{40})\t(.+)$/s.exec(entry);
      if (match === null || match[3] === undefined || match[3].split('/').some(segment => segment === '' || segment === '.' || segment === '..') || /[\\:\x00-\x1f]/.test(match[3])) return invalid('answer-unsafe-path', 'the pull request tree holds a link or unsafe path; nothing was collected');
      const path = match[3];
      if (redact(path) !== path) return invalid('github-response-invalid', 'a pull request path contains credential-shaped text; nothing was collected');
      paths.push(path);
    }
    // One cat-file --batch reads every blob the tree named.
    const blobs = gitBlobs(root, commit, paths);
    for (const path of paths) {
      const bytes = blobs.get(path);
      if (bytes === null || bytes === undefined) return invalid('github-pr-unreadable', 'a pull request blob could not be read');
      const target = join(work, 'repo', ...path.split('/'));
      mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
    }
    // Any account may answer and any attempt may be applied — nothing a solver
    // wrote is ever run, so the author is recorded as a fact, not a barrier.
    return answerBounty(root, id, work, author, { attemptN: pr, ...(via !== undefined ? { via } : {}) });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Local decisions stand even when GitHub is unavailable. Retrying the same
// decision resumes here, using a stable comment marker to avoid duplicates.
// The owner's "ask me each time" (and "off", and nothing written) makes each
// outside close a named waiting state: the local decision is recorded as a
// fact, and the comment, issue close and branch removal wait for the owner's
// one command — `box bounty allow <id>`, which re-enters here with
// answered set.
export function syncGitHubDecision(root: string, record: BountyRecord, opts?: { answered?: boolean }): void {
  const publication = record.github;
  if (publication === undefined) return;
  // 'reject', 'withdraw' and 'undo' stay in the list for records written
  // while those commands existed; 'close' carries the same work now.
  const decisions = record.events.filter(entry => ['apply', 'reject', 'withdraw', 'undo', 'merged', 'close'].includes(entry.command ?? ''));
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
        const fact = decision.command === 'merged' ? `Solution${decision.attempt !== undefined ? ` #${decision.attempt}` : ''} is merged on the bounty's branch as commit ${decision.merge} (${decision.reason ?? decision.merge}).`
          : decision.stage === 'applied' ? `Applied as commit ${decision.merge}.`
          : decision.stage === 'rejected' ? `Rejected. Recorded reason: ${decision.reason}`
          : decision.stage === 'undone' ? `Undo recorded as commit ${decision.merge}.`
          : 'Withdrawn.';
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
    delete record.waiting; // the held outside close is done
  } catch (error) {
    const detail = error instanceof BountyRefused ? ` (${error.reason}: ${error.message})` : '';
    // The retry is `close` whatever the local decision was — on an ended
    // record it retries exactly this outside work. The local word names the
    // recorded decision with today's vocabulary.
    const local = ({ undo: 'revert', reject: 'close', withdraw: 'close' } as Record<string, string>)[event.command ?? ''] ?? event.command;
    publication.pending = `github-decision-pending${detail}: local ${local} stands; retry box bounty close ${record.id} to comment, close the issue and remove ${publication.branch}`;
  }
  persistRecord(root, record);
}
