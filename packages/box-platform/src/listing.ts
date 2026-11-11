// PF32: an owner lists an existing GitHub issue as a bounty from the board. Two fields, the issue's address and the reward;
// everything else is read from GitHub. Each refusal says why, that nothing was listed, and what to do next. The issue is
// never edited: the bounty is the board's record that its owner put a reward on it.
import { type Env, GitHub, GitHubUnavailable, BudgetSpent } from './github.js';
import { readRepository, unlisted } from './refresh.js';
import { MINIMUM_REWARD_USD } from '../../box-bounty/format.js';
import { removeBounty } from './store.js';

export type Lister = { github_id: number; login: string };
export type Listing = { id: string } | { error: string; status: number } | { needs_permission: true };

const ISSUE = /^https:\/\/github\.com\/([A-Za-z\d-]{1,39}\/[A-Za-z\d._-]{1,100})\/issues\/(\d{1,9})\/?$/;
const REWARD_MAX = 100000;
const TITLE_MAX = 300;
const TASK_MAX = 65536;
const nothing = 'Nothing was listed.';
const refuse = (status: number, words: string): Listing => ({ error: `${words}`, status });
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The bounty's id: from GitHub's own id for the issue, so one issue has one id, in the tool's shape, never a tool's random one. */
async function idFor(nodeId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`listed:${nodeId}`)));
  return `bt-${[...digest.slice(0, 6)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Who may list (rule 3, ordered so its undocumented part never blocks): the issue's author; the owner of a personal
 * repository; anyone else only with a token from a fresh sign-in, used once here for the repository's permissions.
 */
async function mayList(env: Env, lister: Lister, repository: string, issue: Record<string, unknown>, repo: Record<string, unknown>, token: string | undefined): Promise<boolean | 'ask'> {
  const author = record(issue['user']) ? issue['user'] : {};
  if (author['id'] === lister.github_id) return true;
  const owner = record(repo['owner']) ? repo['owner'] : {};
  if (owner['type'] === 'User' && owner['id'] === lister.github_id) return true;
  if (token === undefined) return 'ask';
  const answer = await fetch(`${env.GITHUB_API ?? 'https://api.github.com'}/repos/${repository}`, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-bounty-board', authorization: `Bearer ${token}` } });
  if (!answer.ok) return false;
  const permissions = (await answer.json() as { permissions?: Record<string, unknown> }).permissions;
  return record(permissions) && (permissions['push'] === true || permissions['maintain'] === true || permissions['admin'] === true);
}

export async function listIssue(env: Env, lister: Lister, address: unknown, reward: unknown, now: number, token?: string): Promise<Listing> {
  const found = typeof address === 'string' ? ISSUE.exec(address.trim()) : null;
  if (found === null) return refuse(400, `That is not a GitHub issue's address. ${nothing} Next: paste it as https://github.com/owner/repository/issues/12.`);
  if (typeof reward !== 'number' || !Number.isSafeInteger(reward) || reward < MINIMUM_REWARD_USD || reward > REWARD_MAX) return refuse(400, `The reward must be whole US dollars from ${MINIMUM_REWARD_USD} to ${REWARD_MAX}. ${nothing} Next: type the amount.`);
  const repository = found[1]!;
  const number = Number(found[2]);
  if (unlisted(env, repository)) return refuse(409, `This board does not list ${repository}. ${nothing}`);
  const github = new GitHub(env, false);
  try {
    if (!await readRepository(env, github, repository, now)) return refuse(409, `${repository} is not a public repository GitHub shows to everyone, so the board cannot list its issues. ${nothing}`);
    const repo = await github.get(`/repos/${repository}`);
    const answer = await github.get(`/repos/${repository}/issues/${number}`);
    if (answer.status !== 200 || !record(answer.json) || !record(repo.json)) return refuse(404, `GitHub has no issue #${number} in ${repository}. ${nothing} Next: check the address.`);
    const issue = answer.json;
    if ('pull_request' in issue) return refuse(409, `#${number} in ${repository} is a pull request, not an issue. ${nothing} Next: paste the issue it fixes.`);
    if (issue['state'] !== 'open') return refuse(409, `Issue #${number} in ${repository} is closed. ${nothing} Next: reopen it on GitHub first.`);
    const held = await env.DB.prepare('SELECT id FROM bounties WHERE repository = ? COLLATE NOCASE AND issue_number = ?').bind(repository, number).first<{ id: string }>();
    if (held !== null) return refuse(409, `Issue #${number} in ${repository} is already a bounty on this board, ${held.id}. ${nothing}`);
    const allowed = await mayList(env, lister, repository, issue, repo.json, token);
    if (allowed === 'ask') return { needs_permission: true };
    if (!allowed) return refuse(403, `You did not open this issue and cannot write to ${repository}, so you cannot list it. ${nothing} Next: ask the issue's author or the repository's owner to list it.`);
    if (typeof issue['node_id'] !== 'string' || typeof issue['title'] !== 'string' || !record(issue['user'])) return refuse(502, `GitHub's answer for this issue could not be read. ${nothing} Next: try again.`);
    const id = await idFor(issue['node_id']);
    if (await env.DB.prepare('SELECT 1 AS yes FROM bounties WHERE id = ?').bind(id).first() !== null) return refuse(409, `This issue's bounty id is already taken on the board. ${nothing}`);
    const branch = typeof repo.json['default_branch'] === 'string' ? repo.json['default_branch'] : 'main';
    const head = await github.get(`/repos/${repository}/commits/${encodeURIComponent(branch)}`);
    const commit = record(head.json) && typeof head.json['sha'] === 'string' && /^[a-f\d]{40}$/.test(head.json['sha']) ? head.json['sha'] : '0'.repeat(40);
    await env.DB.prepare(`INSERT INTO bounties (id, repository, issue_number, title, task, poster, poster_id, issue_state, closed_at, amount, created_at, work_commit, seen_at, listed_seq, source, listed_by_id, listed_by, issue_author)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, ?, ?, ?, (SELECT COALESCE(MAX(listed_seq), 0) + 1 FROM bounties), 'listed', ?, ?, ?)`)
      .bind(id, repository, number, issue['title'].slice(0, TITLE_MAX), (typeof issue['body'] === 'string' ? issue['body'] : '').trim().slice(0, TASK_MAX), lister.login, lister.github_id,
        reward, new Date(now).toISOString(), commit, now, lister.github_id, lister.login, typeof issue['user']['login'] === 'string' ? issue['user']['login'] : null).run();
    return { id };
  } catch (error) {
    if (error instanceof GitHubUnavailable || error instanceof BudgetSpent) return refuse(503, `GitHub could not be read just now. ${nothing} Next: try again in a few minutes.`);
    throw error;
  } finally {
    await github.settle();
  }
}

/** Removing a listed bounty: its owner, only before any merge or payment; it leaves every surface (rule: Remove and Withdraw never both). */
export async function removeListed(env: Env, lister: Lister, id: string): Promise<{ removed: true } | { error: string; status: number }> {
  const row = await env.DB.prepare('SELECT source, poster_id FROM bounties WHERE id = ?').bind(id).first<{ source: string; poster_id: number | null }>();
  if (row === null) return { error: 'This bounty is not on the board. Nothing changed.', status: 404 };
  if (row.source !== 'listed') return { error: 'Only a bounty listed from the board can be removed here. A bounty the tool posted ends when its issue closes. Nothing changed.', status: 409 };
  if (row.poster_id !== lister.github_id) return { error: 'Only the person who listed this bounty can remove it. Nothing changed.', status: 403 };
  const merged = await env.DB.prepare(`SELECT 1 AS yes FROM pull_requests WHERE bounty_id = ? AND state = 'merged'`).bind(id).first();
  if (merged !== null) return { error: 'A linked pull request is merged, so this bounty stays on the board as a fact. Nothing changed. Next: pay whom you choose, or leave it.', status: 409 };
  const paid = await env.DB.prepare(`SELECT 1 AS yes FROM paid_clicks WHERE bounty_id = ? AND withdrawn = 0 UNION SELECT 1 FROM charges WHERE bounty_id = ? AND state = 'paid'`).bind(id, id).first();
  if (paid !== null) return { error: 'A payment is recorded on this bounty, so it stays. Nothing changed. Next: withdraw a record made by hand first.', status: 409 };
  await removeBounty(env.DB, id);
  return { removed: true };
}
