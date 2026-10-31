// "Look now" from the tool: no sign-in, identifiers only. A hint moves one read
// earlier and carries no fact: everything stored comes from GitHub (lookNow).
import { type Env, LIMITS } from './github.js';
import { lookNow } from './refresh.js';
import { getMeta, setMeta } from './store.js';

const BODY_BYTES_MAX = 512;
const PER_MINUTE = 30;
const BOUNTY_GAP_MS = 60000;
const MINUTE = 60000;
const HOUR = 3600000;
const FIELDS = ['bounty', 'event', 'issue', 'repository'];
const EVENTS: readonly unknown[] = ['posted', 'merged', 'closed', 'paid'];

const answer = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});
const BAD = 'That is not a hint this board reads. Nothing changed. Next: send repository, issue, bounty and event, and nothing else.';
const LATER = (why: string) => answer(429, { error: `${why} Nothing changed. Next: the board also reads GitHub every 15 minutes.` });

type Hint = { repository: string; issue: number; bounty: string };

function parse(text: string): Hint | null {
  if (new TextEncoder().encode(text).length > BODY_BYTES_MAX) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const sent = value as Record<string, unknown>;
  if (Object.keys(sent).sort().join() !== FIELDS.join()) return null;
  const { repository, issue, bounty, event } = sent;
  if (typeof repository !== 'string' || !/^[A-Za-z\d-]{1,39}\/[A-Za-z\d._-]{1,100}$/.test(repository)) return null;
  if (typeof issue !== 'number' || !Number.isSafeInteger(issue) || issue < 1) return null;
  if (typeof bounty !== 'string' || !/^bt-[a-f\d]{12}$/.test(bounty) || !EVENTS.includes(event)) return null;
  return { repository, issue, bounty };
}

/** So hints can never spend the hour's GitHub budget the scheduled refresh needs. */
async function budgetHalfSpent(env: Env, now: number): Promise<boolean> {
  if (await getMeta(env.DB, 'budget_hour') !== String(Math.floor(now / HOUR))) return false;
  const limit = env.GITHUB_TOKEN === undefined ? LIMITS.anonymous : LIMITS.token;
  return Number(await getMeta(env.DB, 'budget_used') ?? 0) >= limit.hour / 2;
}

export async function hintResponse(request: Request, env: Env, now: number): Promise<Response> {
  const hint = parse(await request.text());
  if (hint === null) return answer(400, { error: BAD });
  const db = env.DB;
  const minute = String(Math.floor(now / MINUTE));
  const count = await getMeta(db, 'hint_minute') === minute ? Number(await getMeta(db, 'hint_count') ?? 0) : 0;
  if (count >= PER_MINUTE) return LATER('Too many hints this minute.');
  await setMeta(db, 'hint_minute', minute);
  await setMeta(db, 'hint_count', String(count + 1));
  await db.prepare('DELETE FROM hints WHERE at <= ?').bind(now - BOUNTY_GAP_MS).run();
  if (await db.prepare('SELECT at FROM hints WHERE bounty_id = ?').bind(hint.bounty).first() !== null) return LATER('This bounty was looked at in the last minute.');
  if (await budgetHalfSpent(env, now)) return LATER('The board is saving its GitHub reads this hour.');
  await db.prepare('INSERT INTO hints (bounty_id, at) VALUES (?, ?)').bind(hint.bounty, now).run();
  const look = lookNow(env, hint.repository, hint.issue, hint.bounty, now);
  if (env.defer !== undefined) {
    env.defer(look);
    return answer(202, { looked: 'started' });
  }
  return answer(202, { looked: await look });
}
