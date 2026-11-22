import { agentJson, agentSlot } from './agent-input.js';
import type { Env } from './github.js';
import { budgetHalfSpent } from './hint.js';
import { listIssue } from './listing.js';
import { getMetas } from './store.js';

const BODY_BYTES_MAX = 1024;
const PER_MINUTE = 10;
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const bad = () => json(400, { error: 'Send only issue and reward as JSON, at most 1024 bytes. Nothing was listed. Next: send a public GitHub issue URL and a reward in whole US dollars.' });

export async function agentImportResponse(request: Request, env: Env, now: number): Promise<Response> {
  const body = await agentJson(request, BODY_BYTES_MAX);
  if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== 'issue,reward') return bad();
  const sent = body as { issue: unknown; reward: unknown };
  const saving = () => json(429, { error: 'The board is saving its GitHub reads. Nothing was listed. Next: try again later.' });
  if (budgetHalfSpent(env, await getMetas(env.DB, ['budget_hour', 'budget_used']), now)) return saving();
  if (!await agentSlot(env.DB, 'agent_import_slot', now, PER_MINUTE)) return saving();
  const listing = await listIssue(env, null, sent.issue, sent.reward, now, undefined, true);
  if ('id' in listing) return json(200, {
    listed: listing.id, pending: true, approve_with: listing.approve_with, approve_on: typeof sent.issue === 'string' ? sent.issue.trim() : sent.issue,
    next: 'Post the exact approve_with line as a comment on the issue from an account that owns or can write to the repository; the board checks approvals about every 15 minutes, subject to its GitHub read budget. Until then it is not listed. A human still pays the reward.'
  });
  return json('status' in listing ? listing.status : 409, { error: 'error' in listing ? listing.error : 'Nothing was listed. Next: try again later.' });
}
