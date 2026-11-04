// `take` (PF25): a solver agent starts an attempt on a bounty safely, and says so to everyone.
// The owner's switch decides first (off refuses; "ask each time" waits for the owner's yes on this bounty).
// The bounty is read from the board's public detail and checked against the owner's guard rails. The repository is
// forked to the solver's account unless the solver can push to it, cloned into a throwaway folder outside every
// repository with Git's foreign mode (hooks, filters and merge drivers off for each call; no configuration written),
// and a draft pull request is opened at once from an empty commit. The tool never runs the poster's code: the agent
// runs tests in the workspace. What the tool cannot stop is stated: this machine stays signed in to GitHub.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBountyDetail } from './board.js';
import { BountyRefused } from './errors.js';
import { api, invalid, isObject, remoteGit, signedAccount } from './gh.js';
import { git } from './git.js';
import { repositoryAddress } from './repository.js';
import { loadSettings, saveSettings, settingsDir, writeToolFile } from './settings.js';
import { solvingOf } from './solving.js';

export type TakenStage = 'waiting' | 'taken' | 'submitted' | 'withdrawn';
export interface Taken {
  readonly id: string; readonly repository: string; readonly stage: TakenStage; readonly at: string;
  /** Where the work is pushed: the solver's fork, or the repository itself when the solver can push to it. */
  readonly target?: string; readonly branch?: string; readonly bountyBranch?: string; readonly baseCommit?: string;
  readonly workspace?: string; readonly pullRequest?: { readonly number: number; readonly url: string };
  readonly reward?: number; readonly ownBounty?: boolean;
}

const ID = /^bt-[a-f\d]{12}$/;
const takenDir = (): string => join(settingsDir(), 'taken');
const takenFile = (id: string): string => join(takenDir(), `${id}.json`);
export const saveTaken = (taken: Taken): void => writeToolFile(takenFile(taken.id), `${JSON.stringify({ kind: 'box-taken', ...taken }, null, 2)}\n`);

/** A taken bounty's record, or null. A file that does not read is named, never guessed at. */
export function loadTaken(id: string): Taken | null {
  if (!ID.test(id) || !existsSync(takenFile(id))) return null;
  try {
    const value = JSON.parse(readFileSync(takenFile(id), 'utf8')) as Record<string, unknown>;
    if (value['id'] !== id || typeof value['repository'] !== 'string' || !['waiting', 'taken', 'submitted', 'withdrawn'].includes(String(value['stage']))) throw new Error('shape');
    const { kind: _kind, ...rest } = value;
    return rest as unknown as Taken;
  } catch { throw new BountyRefused('taken-record-unreadable', `the record of ${id} at ${takenFile(id)} does not read; nothing changed; next: remove that file and take the bounty again`); }
}
export const takenIds = (): string[] => existsSync(takenDir()) ? readdirSync(takenDir()).flatMap(name => /^(bt-[a-f\d]{12})\.json$/.exec(name)?.[1] ?? []) : [];

interface Facts { readonly repository: string; readonly bountyBranch: string; readonly baseCommit: string; readonly reward: number; readonly paysOnMerge: boolean; readonly owner: string; readonly open: boolean;
  /** PF32: a bounty an owner listed from the board on an existing issue: answered against the default branch, the draft's description closing the issue. */
  readonly closesIssue: string | null }

function factsOf(id: string): Facts {
  const read = readBountyDetail(id);
  if ('failed' in read) throw new BountyRefused('board-unread', `${id} could not be read from the board: ${read.failed}; nothing was taken; next: check the id with box bounty discover`);
  const b = isObject(read.detail['bounty']) ? read.detail['bounty'] : {};
  const repository = isObject(b['repository']) && typeof b['repository']['name'] === 'string' ? repositoryAddress(b['repository']['name']) : null;
  const answer = isObject(b['answer']) ? b['answer'] : {};
  const reward = isObject(b['reward']) ? b['reward']['amount'] : undefined;
  const owner = isObject(b['owner']) ? b['owner']['login'] : undefined;
  const listed = b['way_in'] === 'listed' && typeof answer['closes_issue'] === 'string' && /^Fixes #\d{1,9}$/.test(answer['closes_issue']) && typeof answer['branch'] === 'string' && /^[\w./-]{1,255}$/.test(answer['branch']);
  if (b['id'] !== id || repository === null || (!listed && answer['branch'] !== `box-bounty/${id}`) || typeof answer['base_commit'] !== 'string' || !/^[a-f\d]{40}$/.test(answer['base_commit'])
    || typeof reward !== 'number' || !Number.isSafeInteger(reward) || reward < 0 || typeof b['pays_on_merge'] !== 'boolean' || typeof owner !== 'string') {
    throw new BountyRefused('board-unread', `the board's answer for ${id} did not read as a bounty; nothing was taken; next: check the id with box bounty discover`);
  }
  return { repository, bountyBranch: answer['branch'] as string, baseCommit: answer['base_commit'], reward, paysOnMerge: b['pays_on_merge'], owner, open: b['state'] === 'open' || b['state'] === 'solutions-waiting', closesIssue: listed ? answer['closes_issue'] as string : null };
}

export interface TakeOptions {
  /** A folder to clone into instead of a fresh one under the system's temporary folder. It must not exist yet. */
  readonly into?: string;
}
export type TakeResult = { readonly kind: 'waiting'; readonly lines: readonly string[] } | { readonly kind: 'taken'; readonly taken: Taken; readonly lines: readonly string[] };

/** Asks GitHub for the fork, then waits briefly for it to exist: GitHub makes forks asynchronously. */
function forkOf(root: string, repository: string, login: string): string {
  const made = api(root, `repos/${repository}/forks`, {});
  const name = isObject(made) && typeof made['full_name'] === 'string' ? repositoryAddress(made['full_name']) : null;
  if (name === null || name.split('/')[0]!.toLowerCase() !== login.toLowerCase()) return invalid('github-fork-failed', `GitHub did not answer with a fork of ${repository} under ${login}; nothing was taken; next: fork it on GitHub, then take the bounty again`);
  return name;
}

/** The draft's own words; submit replaces exactly these, and leaves anything the solver wrote. */
export const DRAFT_BODY = (id: string): string => `Started on bounty ${id}. A draft: work in progress, opened at once so other agents can see this attempt.`;

export function takeBounty(id: string, options: TakeOptions = {}): TakeResult {
  if (!ID.test(id)) throw new BountyRefused('bounty-id-invalid', `"${id.slice(0, 40)}" is not a bounty id; nothing was taken; next: an id from box bounty discover, such as bt-0123456789ab`);
  const limits = solvingOf();
  if (limits.mode === 'off') throw new BountyRefused('solving-off', 'solving is off — the owner has not allowed your agents to take bounties; nothing was taken; next: ask the owner to run box bounty config set solving allowed (or ask, to be asked before each one)');
  const existing = loadTaken(id);
  if (existing?.stage === 'taken' || existing?.stage === 'submitted') throw new BountyRefused('already-taken', `${id} is already taken, with its draft at ${existing.pullRequest?.url ?? 'its pull request'} and its workspace at ${existing.workspace ?? 'unknown'}; nothing changed; next: work there, or box bounty close ${id} to withdraw`);
  const facts = factsOf(id);
  if (!facts.open) throw new BountyRefused('bounty-not-open', `${id} is no longer open on the board; nothing was taken; next: box bounty discover for open ones`);
  const outside = [
    ...(facts.reward < limits.floor ? [`its $${facts.reward} reward is below the owner's $${limits.floor} floor`] : []),
    ...(limits.paysOnMergeOnly && !facts.paysOnMerge ? ['it does not pay on merge, and the owner takes only bounties that do'] : []),
    ...(limits.skip.includes(facts.repository) ? [`the owner never takes from ${facts.repository}`] : [])
  ];
  if (outside.length > 0) throw new BountyRefused('outside-owner-limits', `${id} is outside the owner's limits: ${outside.join('; ')}; nothing was taken; next: choose another bounty from box bounty discover`);
  // "Ask each time": the owner's yes on this one bounty, written by the owner's own command, is used once.
  if (limits.mode === 'ask' && !(limits.approved ?? []).includes(id)) {
    saveTaken({ id, repository: facts.repository, stage: 'waiting', at: new Date().toISOString(), reward: facts.reward });
    return { kind: 'waiting', lines: [
      `${id} waits on the owner — the owner asked to be asked before each bounty taken. Put this to them:`,
      `  Your agent wants to take ${id} on ${facts.repository} ($${facts.reward}, pays on merge: ${facts.paysOnMerge ? 'yes' : 'no'}). It would fork the repository to your GitHub account, run that repository's code in a throwaway folder, and open a draft pull request under your name.`,
      `  To allow this one bounty: box bounty allow ${id}`,
      `next: once the owner has answered, run box bounty take ${id} again`
    ] };
  }
  const root = options.into === undefined ? mkdtempSync(join(tmpdir(), `box-take-${id}-`)) : options.into;
  if (options.into !== undefined) {
    if (existsSync(options.into)) throw new BountyRefused('workspace-exists', `${options.into} already exists, and the workspace must be a new folder; nothing was taken; next: name a folder that does not exist, or leave --into out`);
    mkdirSync(options.into, { recursive: true });
  }
  const login = signedAccount(root);
  const info = api(root, `repos/${facts.repository}`);
  const canPush = isObject(info) && isObject(info['permissions']) && info['permissions']['push'] === true;
  const target = canPush ? facts.repository : forkOf(root, facts.repository, login);
  const workspace = join(root, 'work');
  // A public clone of the bounty branch only, in Git's foreign mode: no hook, filter or merge driver runs.
  git(root, ['clone', '--quiet', '--no-tags', '--single-branch', '--branch', facts.bountyBranch, `https://github.com/${facts.repository}.git`, workspace]);
  const head = git(workspace, ['rev-parse', 'HEAD']);
  if (facts.closesIssue === null && head !== facts.baseCommit) throw new BountyRefused('bounty-branch-moved', `${facts.bountyBranch} is at ${head.slice(0, 12)} on GitHub, not the ${facts.baseCommit.slice(0, 12)} the board lists; nothing was taken and the workspace at ${workspace} is left as it is; next: wait for the board to read the bounty again, then take it`);
  const branch = `box-solve/${id}`;
  git(workspace, ['switch', '--quiet', '-c', branch]);
  // The empty start commit carries the solver's GitHub login, so it never depends on a Git identity being set here.
  const identity = { name: login, email: `${login}@users.noreply.github.com` };
  git(workspace, ['commit', '--quiet', '--allow-empty', '-m', `Start on bounty ${id}`], { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email });
  // The push is the tool's, with the solver's own sign-in; a fork GitHub is still making is tried again briefly.
  for (let attempt = 1; ; attempt += 1) {
    try { remoteGit(workspace, target, ['push', `refs/heads/${branch}:refs/heads/${branch}`]); break; }
    catch (error) {
      if (attempt >= 5 || canPush) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    }
  }
  const opened = api(root, `repos/${facts.repository}/pulls`, {
    title: `Attempt on bounty ${id}`,
    head: canPush ? branch : `${target.split('/')[0]}:${branch}`,
    base: facts.bountyBranch,
    draft: true,
    // A listed bounty's draft closes its issue, so GitHub links it and the board reads it as this bounty's.
    body: facts.closesIssue === null ? DRAFT_BODY(id) : `${DRAFT_BODY(id)}\n\n${facts.closesIssue}`
  });
  const number = isObject(opened) ? opened['number'] : undefined;
  const url = isObject(opened) ? opened['html_url'] : undefined;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1 || typeof url !== 'string' || !url.startsWith('https://github.com/')) return invalid('github-response-invalid', `GitHub did not answer with the draft pull request; the branch ${branch} is on ${target}; next: open a draft pull request from it against ${facts.bountyBranch} on GitHub`);
  const ownBounty = facts.owner.toLowerCase() === login.toLowerCase();
  const taken: Taken = { id, repository: facts.repository, stage: 'taken', at: new Date().toISOString(), target, branch, bountyBranch: facts.bountyBranch, baseCommit: facts.baseCommit, workspace, pullRequest: { number, url }, reward: facts.reward, ownBounty };
  saveTaken(taken);
  // A yes from the owner covers one take.
  if (limits.approved?.includes(id)) saveSettings({ ...loadSettings(), solving: { ...limits, approved: limits.approved.filter(entry => entry !== id) } });
  return { kind: 'taken', taken, lines: [
    `${id} — taken: draft pull request #${number} ${url}, from ${target} ${branch}${canPush ? '' : ' (your fork)'}`,
    `workspace: ${workspace} — the bounty branch at ${facts.baseCommit.slice(0, 12)}, with an empty start commit`,
    'the tool ran nothing from this repository. Run its tests only here, and keep your credentials out of this folder. The tool pushed with your own gh sign-in, and this machine stays signed in to GitHub; it cannot stop an agent reaching that sign-in.',
    ...(ownBounty ? [`${id} was posted by ${login}, the account taking it: a merge here is not counted in the owner's record.`] : []),
    `next: work in ${workspace}, commit, and push to ${target} ${branch} — the draft updates as you push; box bounty submit ${id} once it is ready for review; box bounty close ${id} withdraws the attempt`
  ] };
}

/** The owner's yes on one bounty under "ask each time" (`box bounty allow <id>`). */
export function approveTake(id: string): string {
  const waiting = loadTaken(id);
  if (waiting?.stage !== 'waiting') throw new BountyRefused('not-waiting', `${id} is not waiting on you to be taken; nothing changed; next: box bounty config shows what is waiting`);
  const solving = solvingOf();
  saveSettings({ ...loadSettings(), solving: { ...solving, approved: [...new Set([...(solving.approved ?? []), id])], at: new Date().toISOString() } });
  return `${id} on ${waiting.repository}: allowed once — your agent may take this one bounty; written to the owner's settings. Other bounties still ask.`;
}

/** `close` on a taken bounty: the draft is closed and the attempt withdrawn. The fork and the workspace stay; they are the solver's. */
export function closeTaken(id: string): string {
  const taken = loadTaken(id);
  if (taken === null) throw new BountyRefused('not-taken', `${id} is not a bounty you took; nothing changed; next: box bounty close inside the checkout that posted it, if it is yours`);
  if (taken.stage === 'withdrawn') return `${id} — already withdrawn; nothing to do`;
  if (taken.stage === 'waiting') {
    saveTaken({ ...taken, stage: 'withdrawn', at: new Date().toISOString() });
    return `${id} — withdrawn before it was taken; nothing was on GitHub`;
  }
  const what = taken.stage === 'submitted' ? 'pull request' : 'draft';
  const closed = api(taken.workspace !== undefined && existsSync(taken.workspace) ? taken.workspace : tmpdir(), `repos/${taken.repository}/pulls/${taken.pullRequest!.number}`, { state: 'closed' }, 'PATCH');
  if (!isObject(closed) || closed['state'] !== 'closed') return invalid('github-response-invalid', `GitHub did not say ${what} #${taken.pullRequest!.number} is closed; the attempt stays taken; next: close it on GitHub at ${taken.pullRequest!.url}, then run box bounty close ${id} again`);
  saveTaken({ ...taken, stage: 'withdrawn', at: new Date().toISOString() });
  return `${id} — withdrawn: ${what} #${taken.pullRequest!.number} closed. The branch ${taken.branch} on ${taken.target} and the workspace at ${taken.workspace} are yours to keep or remove.`;
}
