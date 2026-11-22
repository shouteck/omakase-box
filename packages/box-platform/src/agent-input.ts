import type { Db } from './store.js';

export async function agentJson(request: Request, max: number): Promise<unknown> {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return undefined;
  const reader = request.body?.getReader();
  if (reader === undefined) return undefined;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) { await reader.cancel(); return undefined; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch { return undefined; }
}

export async function agentSlot(db: Db, key: string, now: number, max: number): Promise<boolean> {
  const minute = String(Math.floor(now / 60000));
  const slot = await db.prepare(`INSERT INTO meta (key, value) VALUES (?, ? || ':1')
    ON CONFLICT (key) DO UPDATE SET value = CASE WHEN value LIKE ? || ':%' THEN ? || ':' || (CAST(substr(value, length(?) + 2) AS INTEGER) + 1) ELSE ? || ':1' END
    RETURNING value`).bind(key, minute, minute, minute, minute, minute).first<{ value: string }>();
  return slot !== null && Number(slot.value.slice(minute.length + 1)) <= max;
}
