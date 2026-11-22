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
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return bad();
  const reader = request.body?.getReader();
  if (reader === undefined) return bad();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > BODY_BYTES_MAX) { await reader.cancel(); return bad(); }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  let body: unknown;
  try { body = JSON.parse(text); } catch { return bad(); }
  if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== 'issue,reward') return bad();
  const sent = body as { issue: unknown; reward: unknown };
  const saving = () => json(429, { error: 'The board is saving its GitHub reads. Nothing was listed. Next: try again later.' });
  if (budgetHalfSpent(env, await getMetas(env.DB, ['budget_hour', 'budget_used']), now)) return saving();
  const minute = String(Math.floor(now / 60000));
  // One atomic upsert, so concurrent requests cannot read the same count and all pass.
  const slot = await env.DB.prepare(`INSERT INTO meta (key, value) VALUES ('agent_import_slot', ? || ':1')
    ON CONFLICT (key) DO UPDATE SET value = CASE WHEN value LIKE ? || ':%' THEN ? || ':' || (CAST(substr(value, length(?) + 2) AS INTEGER) + 1) ELSE ? || ':1' END
    RETURNING value`).bind(minute, minute, minute, minute, minute).first<{ value: string }>();
  if (slot === null || Number(slot.value.slice(minute.length + 1)) > PER_MINUTE) return saving();
  const listing = await listIssue(env, null, sent.issue, sent.reward, now, undefined, true);
  if ('id' in listing) return json(200, {
    listed: listing.id, pending: true, approve_with: listing.approve_with, approve_on: typeof sent.issue === 'string' ? sent.issue.trim() : sent.issue,
    next: 'Post the exact approve_with line as a comment on the issue from an account that owns or can write to the repository; the board checks approvals about every 15 minutes, subject to its GitHub read budget. Until then it is not listed. A human still pays the reward.'
  });
  return json('status' in listing ? listing.status : 409, { error: 'error' in listing ? listing.error : 'Nothing was listed. Next: try again later.' });
}
