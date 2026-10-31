import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProgram } from './program.js';
import { BountyRefused } from './errors.js';
import { gitOutcome } from './git.js';
import { requireRepository } from './settings.js';
import { type PayOutcome,type PayToFact } from './pay.js';

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
  seenPullRequests?: { readonly n: number; readonly commit: string; readonly at: string; readonly author?: string; readonly payTo?: PayToFact }[];
  availablePullRequests?: { readonly n: number; readonly commit: string; readonly at: string; readonly author?: string; readonly payTo?: PayToFact }[];
  /** Recorded at close when a bounty with a reward ended on a merged
      solution: whom to pay and where, for `status` and the hook's finish
      slot — a record, not a reminder (BT11b). */
  pay?: PayOutcome;
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
  /** Files Git treated as binary in the first-published set — the scan had
      nothing to read in them. Recorded so the post output and `status` can
      say they were not scanned; never a hold. */
  scanBinary?: readonly string[];
  outside?: { readonly at: string; readonly issueState: 'open' | 'closed'; readonly answers: string };
  /** The fact set the recorded `outside.answers` was listed from (BT39): a
      matching key means the stored listing is still exact and the
      per-request file reads do not have to run again. */
  answersKey?: string;
  unavailableAt?: string | null;
  /** The last refresh failure's own reason name — 'github-command-failed',
      'github-issue-mismatch', ... — so status can say what failed (F6). */
  unavailableReason?: string | null;
  formatRead?: 'absent' | 'invalid' | 'matches-record' | 'differs-from-record';
  formatReadAt?: string;
  formatUnavailableAt?: string | null;
  formatRepair?: 'updated' | 'preserved-invalid' | 'update-failed';
}

// The agent's two publication choices, named on `post <id>`
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

const PUBLIC_ONLY = 'posting outside would publish the code, so GitHub posting is only for repositories already public';
export const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
export const redact = (text: string): string => text.replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+)/g, '[credential redacted]');
export const invalid = (reason: string, message: string): never => { throw new BountyRefused(reason, message); };
export const publicationRef = (id: string): string => `refs/box-bounty/${id}-github`;
export const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const READABLE_LOGIN = /^[a-z\d][a-z\d-]{0,38}(?:\[bot\])?$/i;
export const login = (value: unknown): string => typeof value === 'string' && READABLE_LOGIN.test(value) ? value : invalid('github-response-invalid', 'GitHub returned an unreadable account name; nothing was executed; next: check gh and rerun the same command');
export const number = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid('github-response-invalid', 'GitHub returned an unreadable number; next: check gh and rerun the same command');

// The least GitHub CLI the tool runs on — every GitHub call is `gh api` or
// `gh auth status`, carried verbatim; the tool is only proven against gh
// 2.x. The probe is one `version` spawn per program per process, paid only
// by commands that reach GitHub — `gh` output is the only place its own
// version exists.
export const GH_LEAST = '2.0';
const probedGh = new Set<string>();

// Never include gh/git diagnostics here: signed-in programs can print credentials.
function gh(root: string, args: readonly string[]): string {
  // The run-level budget a bounded caller (the hook) sets: a call count so
  // endless pagination cannot loop forever, and a deadline so a run of hung
  // calls stays inside its bound. Ordinary commands leave both unbounded.
  if (ghCallBudget <= 0 || Date.now() >= ghDeadline) return invalid('github-call-budget', 'the GitHub budget for this run is spent — the run stays inside its bound and the next one can ask again; next: rerun the command — a new run gets a fresh budget');
  ghCallBudget -= 1;
  let program: ReturnType<typeof resolveProgram>;
  try { program = resolveProgram('gh'); }
  catch { return invalid('github-cli-missing', `GitHub CLI gh ${GH_LEAST} or later is required for GitHub bounties — none was found on PATH (https://cli.github.com); next: install gh from https://cli.github.com, then rerun the same command`); }
  if (!probedGh.has(program.path)) {
    // `gh version`, never `gh --version`: a gh.exe that is a wrapped program
    // may see the double-dash flag eaten by its own runtime before the
    // subcommand ever runs — a wrapped `gh` has no such flag of its own.
    const probe = launch(program, root, ['version']);
    const found = /gh version (\d+)\.(\d+)/.exec(probe.stdout ?? '');
    if (probe.error !== undefined || probe.status !== 0 || found === null) {
      return invalid('github-cli-missing', `GitHub CLI gh ${GH_LEAST} or later is required for GitHub bounties — the program at ${program.path} did not answer 'gh version' (https://cli.github.com); next: install gh from https://cli.github.com, then rerun the same command`);
    }
    if (Number(found[1]) < 2) {
      return invalid('github-cli-too-old', `GitHub CLI gh ${GH_LEAST} or later is required — found gh ${found[1]}.${found[2]} (https://cli.github.com); next: upgrade gh from https://cli.github.com, then rerun the same command`);
    }
    probedGh.add(program.path);
  }
  // The probe itself can burn a whole call's cap — check the run deadline
  // again before the real call so the worst case is the deadline plus one
  // in-flight call.
  if (Date.now() >= ghDeadline) return invalid('github-call-budget', 'the GitHub budget for this run is spent — the run stays inside its bound and the next one can ask again; next: rerun the command — a new run gets a fresh budget');
  const result = launch(program, root, args);
  if (result.error !== undefined || result.status !== 0) {
    throw classifyGitHubFailure(result, () => {
      // GET /rate_limit is free, asked at most once per failure, and still a
      // call: it spends the run's budget and never outlives its deadline.
      if (ghCallBudget <= 0 || Date.now() >= ghDeadline) return null;
      ghCallBudget -= 1;
      const limits = launch(program, root, ['api', '--hostname', 'github.com', 'rate_limit']);
      if (limits.error !== undefined || limits.status !== 0) return null;
      try {
        const data: unknown = JSON.parse(limits.stdout ?? '');
        const core = isObject(data) && isObject(data['resources']) ? data['resources']['core'] : null;
        return isObject(core) && typeof core['reset'] === 'number' ? core['reset'] * 1000 : null;
      } catch { return null; }
    });
  }
  return result.stdout ?? '';
}

// `gh api --include` puts the status line and headers before the body, on
// success and on failure alike. A response without them is all body.
export function splitResponse(stdout: string): { readonly status: number | null; readonly headers: ReadonlyMap<string, string>; readonly body: string } {
  const first = /^HTTP\/[\d.]+ (\d{3})\b/.exec(stdout);
  const end = /\r?\n\r?\n/.exec(stdout);
  if (first === null) return { status: null, headers: new Map(), body: stdout };
  const block = end === null ? stdout : stdout.slice(0, end.index);
  const headers = new Map<string, string>();
  for (const line of block.split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return { status: Number(first[1]), headers, body: end === null ? '' : stdout.slice(end.index + end[0].length) };
}

// When a rate limit lifts, from the response alone: Retry-After (seconds or a
// date), then X-RateLimit-Reset (epoch seconds). Only a parsed number leaves.
function rateLimitEnd(headers: ReadonlyMap<string, string>, now: number): number | null {
  const after = headers.get('retry-after');
  if (after !== undefined) {
    if (/^\d+$/.test(after)) return now + Number(after) * 1000;
    const date = Date.parse(after);
    if (!Number.isNaN(date)) return date;
  }
  const reset = headers.get('x-ratelimit-reset');
  return reset !== undefined && /^\d+$/.test(reset) ? Number(reset) * 1000 : null;
}

const RATE_MARKER = /rate limit|secondary rate|abuse/i;
const NETWORK_MARKER = /could not resolve host|no such host|dial tcp|connection (?:refused|reset|timed out)|i\/o timeout|network is unreachable|tls handshake|unexpected eof/i;

// The one place a gh failure gets its name (BT50). It reads gh's diagnostics
// and prints none of them: they can carry credentials and stranger text, so
// every message below is the tool's own and the only value taken from the
// failure is a parsed time. An unrecognised failure stays github-command-failed.
export function classifyGitHubFailure(result: { readonly error?: Error | undefined; readonly status: number | null; readonly stdout?: string | null; readonly stderr?: string | null }, readLimitEnd: () => number | null = () => null, now = Date.now()): BountyRefused {
  if (result.error !== undefined) return new BountyRefused('github-unreachable', 'GitHub could not be reached or did not answer in time; next: check the connection, then rerun the same command');
  const stderr = result.stderr ?? '';
  const response = splitResponse(result.stdout ?? '');
  const code = response.status ?? Number(/\bHTTP (\d{3})\b/.exec(stderr)?.[1] ?? 0);
  const limited = code === 429 || RATE_MARKER.test(stderr) || code === 403 && (response.headers.has('retry-after') || response.headers.get('x-ratelimit-remaining') === '0');
  if (limited) {
    const end = rateLimitEnd(response.headers, now) ?? readLimitEnd();
    return end === null
      ? new BountyRefused('github-rate-limited', 'GitHub\'s rate limit stops this account for now and did not say until when; next: wait a few minutes, then rerun the same command')
      : new BountyRefused('github-rate-limited', `GitHub's rate limit stops this account until ${new Date(end).toISOString()}; next: wait until then, then rerun the same command`);
  }
  if (code === 401 || result.status === 4 || stderr.includes('gh auth login')) return new BountyRefused('github-not-signed-in', 'GitHub does not accept this sign-in: gh is not signed in or its token has expired; next: sign in with gh auth login, then rerun the same command');
  if (code === 403) return new BountyRefused('github-permission-denied', 'GitHub says this account may not do this here; next: sign in with gh auth login to an account that can, or ask the owner, then rerun the same command');
  if (code === 404) return new BountyRefused('github-repository-missing', 'GitHub says this does not exist, or this account cannot see it; next: check the remote with git remote -v and the account with gh auth status, then rerun the same command');
  if (code >= 500 && code <= 599) return new BountyRefused('github-unavailable', 'GitHub answered with a server error; next: rerun the same command later');
  if (NETWORK_MARKER.test(stderr)) return new BountyRefused('github-unreachable', 'GitHub could not be reached or did not answer in time; next: check the connection, then rerun the same command');
  return new BountyRefused('github-command-failed', 'GitHub CLI could not complete the requested operation; next: check gh sign-in and access, then rerun the same command');
}

// A failure whose cause says more than the step that met it: a caller's own
// "could not read X" must not hide it. A 404 is not here — "missing" is what
// several callers legitimately ask, so each decides for itself.
export const namesGitHubCause = (error: unknown): error is BountyRefused => error instanceof BountyRefused
  && ['github-rate-limited', 'github-not-signed-in', 'github-permission-denied', 'github-unavailable', 'github-unreachable'].includes(error.reason);

// One retry, about a second later, for a read that met a server error or the
// network; never for a write, where a retry can duplicate. It spends the run's
// budget and is skipped when the budget or the deadline cannot pay for it.
const RETRY_WAIT_MS = 1000;
function readGitHub(root: string, args: readonly string[]): string {
  try { return gh(root, args); }
  catch (error) {
    if (!(error instanceof BountyRefused) || error.reason !== 'github-unavailable' && error.reason !== 'github-unreachable') throw error;
    if (ghCallBudget <= 0 || Date.now() + RETRY_WAIT_MS >= ghDeadline) throw error;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_WAIT_MS);
    return gh(root, args);
  }
}

// The per-call limit every gh spawn runs under. Commands pay 60 seconds;
// the hook tightens it for the length of its run (it must never stall a
// session) — one process runs one command, so the module-level value is the
// command's own.
let ghCallLimit = 60000;
let ghCallBudget = Infinity;
let ghDeadline = Infinity;
export function limitGitHubCalls(ms: number, calls = Infinity, deadline = Infinity): void {
  ghCallLimit = ms;
  ghCallBudget = calls;
  ghDeadline = deadline;
}

function launch(program: ReturnType<typeof resolveProgram>, root: string, args: readonly string[]) {
  if (program.kind === 'command-file') {
    for (const token of [program.path, ...args]) {
      if (/["%!\r\n]/.test(token) || /\\$/.test(token)) throw new BountyRefused('github-cli-unsafe', 'this gh command file cannot carry these arguments safely; next: put the real gh executable on PATH');
    }
    const line = `"${[program.path, ...args].map(token => `"${token}"`).join(' ')}"`;
    let interpreter: string;
    try { interpreter = resolveProgram('cmd.exe').path; }
    catch { throw new BountyRefused('github-cli-missing', 'the command-file interpreter is missing; next: put the real gh executable on PATH'); }
    return spawnSync(interpreter, ['/d', '/s', '/c', line], { cwd: root, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: ghCallLimit, maxBuffer: 16 * 1024 * 1024 });
  }
  return spawnSync(program.path, [...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: ghCallLimit, maxBuffer: 16 * 1024 * 1024 });
}

export function api(root: string, endpoint: string, payload?: object, method?: string): unknown {
  const work = mkdtempSync(join(tmpdir(), 'box-bt6-gh-'));
  try {
    const args = ['api', '--hostname', 'github.com', endpoint, '--include'];
    if (payload !== undefined) {
      const path = join(work, 'input.json');
      writeFileSync(path, JSON.stringify(payload));
      args.push('--method', method ?? 'POST', '--input', path);
    }
    const output = splitResponse(payload === undefined ? readGitHub(root, args) : gh(root, args)).body;
    try { return JSON.parse(output); }
    catch { return invalid('github-response-invalid', 'GitHub returned unreadable data; next: check gh and rerun the same command'); }
  } finally { rmSync(work, { recursive: true, force: true }); }
}

export function pages(root: string, endpoint: string): unknown[] {
  const entries: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const data = api(root, `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(data)) return invalid('github-response-invalid', 'GitHub returned an unreadable list; next: check gh and rerun the same command');
    entries.push(...data);
    if (data.length < 100) return entries;
  }
}

export function signedAccount(root: string): string {
  const account = api(root, 'user');
  if (!isObject(account)) return invalid('github-response-invalid', 'the signed-in account could not be read; next: run gh auth status, then rerun the same command');
  return login(account['login']);
}

function ownRepository(root: string): string {
  return requireRepository(root);

}

export function publicRepository(root: string): string {
  const repository = ownRepository(root);
  try { gh(root, ['auth', 'status', '--hostname', 'github.com']); }
  catch (error) {
    // CLI presence/version refusals keep their own names — only the auth
    // call's failure means not-signed-in.
    if (error instanceof BountyRefused && (error.reason.startsWith('github-cli-') || error.reason === 'github-unreachable')) throw error;
    return invalid('github-not-signed-in', `GitHub CLI gh ${GH_LEAST} or later, signed in, is required for GitHub bounties — gh is present but not signed in to GitHub (https://cli.github.com); next: sign in with gh auth login, then rerun the same command`);
  }
  let info: unknown;
  try { info = api(root, `repos/${repository}`); }
  catch (error) {
    if (namesGitHubCause(error) || error instanceof BountyRefused && error.reason === 'github-repository-missing') throw error;
    return invalid('github-visibility-unreadable', `${PUBLIC_ONLY}; next: check gh access to the repository, then rerun the same command`);
  }
  if (!isObject(info) || typeof info['full_name'] !== 'string' || info['full_name'].toLowerCase() !== repository.toLowerCase() || typeof info['private'] !== 'boolean' || info['visibility'] !== 'public' && info['visibility'] !== 'private' && info['visibility'] !== 'internal') return invalid('github-visibility-unreadable', `${PUBLIC_ONLY}; next: check gh access to the repository, then rerun the same command`);
  if (info['private'] !== false || info['visibility'] !== 'public') return invalid('github-private-repository', `${PUBLIC_ONLY}; next: ask the owner — only a public repository can be posted`);
  // Push access is checked before any branch push or issue (BT16 rule 9):
  // the bounty branch goes to this repository, so a sign-in that cannot push
  // is named now rather than halfway through the post.
  const permissions = isObject(info['permissions']) ? info['permissions'] : {};
  if (permissions['push'] !== true) return invalid('github-push-denied', `your GitHub sign-in cannot push to ${repository}, and the bounty branch goes there; nothing was posted; next: sign in with gh auth login to an account that can push to ${repository}, then rerun the same command`);
  return info['full_name'];
}

export function remoteGit(root: string, repository: string, args: readonly string[]): void {
  const result = gitOutcome(root, [...args.slice(0, 1), `https://github.com/${repository}.git`, ...args.slice(1)]);
  if (result.status !== 0 || result.error !== undefined) return invalid('github-git-failed', 'Git could not complete the GitHub operation; next: check signed-in Git and rerun the same command');
}

export function issueNumber(value: unknown, repository: string) {
  if (!isObject(value)) return invalid('github-response-invalid', 'GitHub returned an unreadable issue; next: check gh and rerun the same command');
  const n = number(value['number']);
  const url = `https://github.com/${repository}/issues/${n}`;
  if (value['html_url'] !== url) return invalid('github-response-invalid', 'GitHub returned an issue outside the project repository; next: check the repository on GitHub, then rerun the same command');
  return { number: n, url };
}

// Every bounty issue carries the `box-bounty` label so a reader can find them
// all. Missing is not an error — the label is created on the repository first.
export function ensureLabel(root: string, repository: string): void {
  try { api(root, `repos/${repository}/labels/box-bounty`); return; }
  catch (error) {
    if (!(error instanceof BountyRefused) || error.reason !== 'github-repository-missing' && error.reason !== 'github-command-failed') throw error;
  }
  api(root, `repos/${repository}/labels`, { name: 'box-bounty' });
}

export function recoverIssue(root: string, publication: GitHubPublication) {
  const existing = pages(root, `repos/${publication.repository}/issues?state=all`);
  const found = existing.find(entry => isObject(entry) && entry['title'] === publication.title
    && typeof entry['body'] === 'string' && entry['body'].includes(`<!-- box-bounty:${publication.branch.slice('box-bounty/'.length)} -->`)
    && isObject(entry['user']) && entry['user']['login'] === publication.account);
  return found === undefined ? null : issueNumber(found, publication.repository);
}
export const remoteUrl = (repository: string): string => `https://github.com/${repository}.git`;

// The sha the remote's bounty branch points at now, or null when it is gone.
export function remoteBranchSha(root: string, repository: string, branch: string): string | null {
  const remote = gitOutcome(root, ['ls-remote', remoteUrl(repository), `refs/heads/${branch}`]);
  if (remote.status !== 0 || remote.error !== undefined) return invalid('github-git-failed', 'Git could not read the bounty branch; next: check signed-in Git and rerun the same command');
  const sha = remote.stdout.trim().split(/\s+/)[0] ?? '';
  return /^[a-f\d]{40}$/.test(sha) ? sha : null;
}
