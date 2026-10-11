import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveProgram } from '../box-package/commands.js';
import { answerBounty, readAnswerFolder } from './answer.js';
import { renderListing } from './create.js';
import { BountyRefused } from './errors.js';
import { git, gitBlob, gitOutcome, gitWriteBlob } from './git.js';
import { loadRecord, persistRecord, resolveLimits, transitionTo } from './record.js';
import type { BountyRecord } from './record.js';

export interface GitHubPublication {
  readonly repository: string;
  readonly account: string;
  readonly branch: string;
  readonly commit: string;
  readonly title: string;
  readonly body: string;
  state: 'preparing' | 'branch-pushed' | 'posted' | 'closed';
  issue: { readonly number: number; readonly url: string } | null;
  pending: string | null;
  outside?: { readonly at: string; readonly issueState: 'open' | 'closed'; readonly answers: string };
  unavailableAt?: string | null;
}

const PUBLIC_ONLY = 'posting outside would publish the code, so GitHub posting is only for repositories already public; a local folder is still available';
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const redact = (text: string): string => text.replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+)/g, '[credential redacted]');
const invalid = (reason: string, message: string): never => { throw new BountyRefused(reason, message); };
const publicationRef = (id: string): string => `refs/box-bounty/${id}-github`;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const login = (value: unknown): string => typeof value === 'string' && /^[a-z\d][a-z\d-]{0,38}(?:\[bot\])?$/i.test(value) ? value : invalid('github-response-invalid', 'GitHub returned an unreadable account name; nothing was executed');
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
    result = spawnSync('cmd.exe', ['/d', '/s', '/c', line], { cwd: root, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
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

function listing(record: BountyRecord, repository: string) {
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

export function previewGitHub(root: string, id: string): string {
  const record = loadRecord(root, id);
  return approveGitHub(root, record).preview;
}

export function approveGitHub(root: string, record: BountyRecord) {
  const repository = publicRepository(root);
  const preview = listing(record, repository);
  return { repository, preview: `GitHub preview: ${repository}, public. Anyone can read the issue and branch.\nBranch: ${preview.branch}\nIssue title: ${preview.title}\nIssue body:\n${preview.body}` };
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

export function postGitHub(root: string, id: string): { record: BountyRecord; destination: string } {
  const record = loadRecord(root, id);
  if (record.stage !== 'confirmed' && !(record.github !== undefined && record.stage === 'posted')) return invalid('not-confirmed', `bounty ${id} must be confirmed before posting to GitHub`);
  if (!resolveLimits(root).allowedDestinations?.includes('github')) return invalid('destination-not-allowed', 'github is not named in the owner\'s allowedDestinations; nothing was posted');
  const repository = publicRepository(root);
  if (record.githubApproval === undefined) return invalid('github-preview-required', `confirm the GitHub preview first with box bounty confirm ${id} --to github`);
  if (record.githubApproval.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository approved at confirmation; nothing was posted');
  if (record.github !== undefined && record.github.repository !== repository) return invalid('github-repository-changed', 'origin no longer names the repository approved for this bounty; nothing was posted');
  const text = listing(record, repository);
  const account = signedAccount(root);
  if (record.github !== undefined && record.github.account !== account) return invalid('github-account-changed', 'sign in to the account that started this post before retrying; nothing was posted');
  if (record.github === undefined) {
    record.github = { repository, account, ...text, commit: shippedCommit(root, record), state: 'preparing', issue: null, pending: null };
    git(root, ['update-ref', publicationRef(id), record.github.commit]);
    persistRecord(root, record);
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

export function listGitHubAnswers(root: string, id: string): string {
  const record = loadRecord(root, id);
  if (record.github === undefined) return invalid('not-github-posted', 'this bounty has no GitHub post; answer from a local folder');
  const { repository, branch } = record.github;
  const data = pages(root, `repos/${repository}/pulls?state=open&base=${branch}`);
  const lines = [`GitHub answers for ${id} against ${branch}:`];
  for (const entry of data) {
    if (!isObject(entry) || !isObject(entry['user'])) return invalid('github-response-invalid', 'GitHub returned an unreadable pull request');
    const n = number(entry['number']);
    const files = pages(root, `repos/${repository}/pulls/${n}/files`);
    const names = files.map(file => isObject(file) && typeof file['filename'] === 'string' ? redact(JSON.stringify(file['filename'])) : invalid('github-response-invalid', 'GitHub returned unreadable changed files'));
    lines.push(`  #${n} by ${login(entry['user']['login'])}: ${names.join(', ')}`);
  }
  if (data.length === 0) lines.push('  none open; wait for an answer or withdraw the bounty');
  return lines.join('\n');
}

export function refreshGitHubStatus(root: string, record: BountyRecord): void {
  const publication = record.github;
  if (publication?.state !== 'posted' || publication.issue === null) return;
  try {
    const issue = api(root, `repos/${publication.repository}/issues/${publication.issue.number}`);
    if (!isObject(issue) || issue['state'] !== 'open' && issue['state'] !== 'closed') return invalid('github-response-invalid', 'GitHub returned an unreadable issue state');
    const answers = listGitHubAnswers(root, record.id);
    publication.outside = { at: new Date().toISOString(), issueState: issue['state'], answers };
    publication.unavailableAt = null;
  } catch {
    publication.unavailableAt = new Date().toISOString();
  }
  persistRecord(root, record);
}

export function answerGitHub(root: string, id: string, pr: number) {
  const record = loadRecord(root, id);
  if (record.github === undefined || record.github.state !== 'posted') return invalid('not-github-posted', 'this bounty is not posted to GitHub');
  if (!Number.isSafeInteger(pr) || pr < 1) return invalid('github-pr-missing', 'name an existing pull request number');
  const { repository, branch } = record.github;
  let data: unknown;
  try { data = api(root, `repos/${repository}/pulls/${pr}`); }
  catch { return invalid('github-pr-missing', 'that pull request cannot be read in the project repository; nothing was collected'); }
  if (!isObject(data) || !isObject(data['base']) || !isObject(data['base']['repo']) || data['base']['ref'] !== branch || data['base']['repo']['full_name'] !== repository) return invalid('github-pr-wrong-branch', 'the pull request targets another branch or repository; nothing was collected');
  if (!isObject(data['head']) || typeof data['head']['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(data['head']['sha']) || !isObject(data['user'])) return invalid('github-response-invalid', 'GitHub returned unreadable pull request facts');
  const author = login(data['user']['login']);
  const work = mkdtempSync(join(tmpdir(), `box-bt6-${id}-pr-`));
  const ref = `refs/box-bounty/${id}-pr-${pr}`;
  try {
    remoteGit(root, repository, ['fetch', '--no-tags', '--no-recurse-submodules', `refs/pull/${pr}/head:${ref}`]);
    const commit = git(root, ['rev-parse', ref]);
    if (commit !== data['head']['sha']) return invalid('github-pr-changed', 'the pull request changed during collection; retry to collect its current version');
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
    gitOutcome(root, ['update-ref', '-d', ref]);
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
      const closed = api(root, endpoint, { state: 'closed' }, 'PATCH');
      if (!isObject(closed) || closed['state'] !== 'closed') return invalid('github-response-invalid', 'GitHub did not confirm issue closure');
    }
    const exists = gitOutcome(root, ['ls-remote', `https://github.com/${publication.repository}.git`, `refs/heads/${publication.branch}`]);
    if (exists.status !== 0) return invalid('github-git-failed', 'Git could not read the bounty branch');
    if (exists.stdout.trim() !== '') remoteGit(root, publication.repository, ['push', `:refs/heads/${publication.branch}`]);
    git(root, ['update-ref', '-d', publicationRef(record.id)]);
    publication.state = 'closed';
    publication.pending = null;
  } catch {
    publication.pending = `github-decision-pending: local ${event.command} stands; retry box bounty ${event.command} ${record.id}${event.command === 'reject' ? ' --reason "<recorded reason>"' : ''} to comment, close the issue and remove ${publication.branch}`;
  }
  persistRecord(root, record);
}
