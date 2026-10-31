// The part of D1 the board uses. The local shim (local-db.ts) implements the same
// shape on node:sqlite, so the same SQL runs in both places.
export interface Statement {
  bind(...values: readonly (string | number | null)[]): Statement;
  all<T>(): Promise<{ readonly results: readonly T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Db {
  prepare(sql: string): Statement;
}

export async function getMeta(db: Db, key: string): Promise<string | null> {
  return (await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null;
}
export async function setMeta(db: Db, key: string, value: string): Promise<void> {
  await db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, value).run();
}

const LOG_KEEP = 500;
/** The platform's own log. Never served. A private drop passes no issue: it names nothing. */
export async function log(db: Db, at: number, reason: string, issue: string | null): Promise<void> {
  await db.prepare('INSERT INTO log (at, reason, issue) VALUES (?, ?, ?)').bind(at, reason, issue).run();
  await db.prepare('DELETE FROM log WHERE rowid <= (SELECT MAX(rowid) FROM log) - ?').bind(LOG_KEEP).run();
}

const BOUNTY_TABLES = ['pull_requests', 'events', 'receipts', 'paid_clicks'];

/** Everything held about a repository that is no longer public. */
export async function purgeRepository(db: Db, name: string): Promise<void> {
  for (const table of BOUNTY_TABLES) {
    await db.prepare(`DELETE FROM ${table} WHERE bounty_id IN (SELECT id FROM bounties WHERE repository = ?)`).bind(name).run();
  }
  await db.prepare('DELETE FROM bounties WHERE repository = ?').bind(name).run();
  await db.prepare('DELETE FROM repositories WHERE name = ?').bind(name).run();
}

export async function removeBounty(db: Db, id: string): Promise<void> {
  for (const table of BOUNTY_TABLES) await db.prepare(`DELETE FROM ${table} WHERE bounty_id = ?`).bind(id).run();
  await db.prepare('DELETE FROM bounties WHERE id = ?').bind(id).run();
}
