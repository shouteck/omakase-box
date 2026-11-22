import { BountyRefused } from '../../box-bounty/errors.js';
import { type BountyFormat, MINIMUM_REWARD_USD } from '../../box-bounty/format.js';
import { ISSUE_BODY_MAX, ISSUE_TITLE_MAX, renderBountyIssue } from '../../box-bounty/issue.js';
import { agentJson, agentSlot } from './agent-input.js';
import { MAX_PATHS, refusedPaths, treePath } from './agent-branch.js';
import type { Env } from './github.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const bad = (why: string, refused?: unknown) => json(400, { error: `${why} Nothing was prepared. Next: send repository, commit, title, task, reward and all paths, with optional note and boxignore only.`, ...(refused === undefined ? {} : { refused }) });
const REQUIRED = ['repository', 'commit', 'title', 'task', 'reward', 'paths'];

export async function agentPrepareResponse(request: Request, env: Env, now: number): Promise<Response> {
  const body = await agentJson(request, 65536);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return bad('Send JSON of at most 64 KiB.');
  const sent = body as Record<string, unknown>;
  if (!REQUIRED.every(key => key in sent) || Object.keys(sent).some(key => ![...REQUIRED, 'note', 'boxignore'].includes(key))) return bad('The fields do not match.');
  const { repository, commit, title, task, note, reward, paths, boxignore } = sent;
  if (typeof repository !== 'string' || !/^[A-Za-z\d-]{1,39}\/[A-Za-z\d._-]{1,100}$/.test(repository)
    || typeof commit !== 'string' || !/^[a-f\d]{40}$/.test(commit)
    || typeof title !== 'string' || title.trim() === '' || /[\r\n]/.test(title) || title.length > ISSUE_TITLE_MAX
    || typeof task !== 'string' || task.trim() === ''
    || ('note' in sent && typeof note !== 'string') || ('boxignore' in sent && typeof boxignore !== 'string')
    || typeof reward !== 'number' || !Number.isSafeInteger(reward) || reward < MINIMUM_REWARD_USD || reward > 100000
    || !Array.isArray(paths) || paths.length > MAX_PATHS || !paths.every(treePath)) return bad('An input is invalid; send a 40-hex commit, whole USD 1–100000 and at most 2000 repository-relative paths.');
  if (!await agentSlot(env.DB, 'agent_prepare_slot', now, 10)) return json(429, { error: 'Too many prepares this minute. Nothing was prepared. Next: try again later.' });
  try {
    const refused = refusedPaths(paths as string[], typeof boxignore === 'string' ? boxignore : '');
    if (refused.length > 0) return bad('Never-ship paths were refused.', refused);
  } catch (error) {
    if (error instanceof BountyRefused) return bad(error.message);
    throw error;
  }
  const createdAt = new Date(now).toISOString();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${commit}\n${title}\n${createdAt}`)));
  const id = `bt-${[...digest.slice(0, 6)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  const branch = `box-bounty/${id}`;
  const format: BountyFormat = { schemaVersion: 2, kind: 'box-bounty', id, repository, workCommit: commit, branch, withChanges: false, createdAt, state: { kind: 'open' }, reward: { amount: reward, currency: 'USD' }, terms: 'merged-solution-earns-whole' };
  const issue = renderBountyIssue({ format, title, task, note: typeof note === 'string' ? note : null, board: new URL(request.url).origin,
    base: commit, pushed: [], licence: { file: (paths as string[]).find(path => /^licen[cs]e([._ -].*)?$/i.test(path)) ?? null, declared: null }, prepared: true });
  if ([...issue.title].length > ISSUE_TITLE_MAX || [...issue.body].length > ISSUE_BODY_MAX) return bad('The rendered issue exceeds GitHub title/body limits.');
  return json(200, { id, branch, issue: { title: issue.title, body: issue.body }, next: `Before pushing, supply/check all paths in the tip tree plus every path touched by commits not on the remote default branch, including deleted and merge-side paths. Push ${commit} to ${branch} in ${repository}, open an issue with exactly issue.title and issue.body, then POST /api/agents/import with its URL and reward ${reward}. Prepare checks only supplied paths, not file contents or completeness; after a public push the board cannot undo exposure. A human pays the reward.` });
}
