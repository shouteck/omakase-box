import { fileURLToPath } from 'node:url';
import type { Env } from '../../packages/box-platform/src/github.js';
import { localDb } from '../../packages/box-platform/src/local-db.js';
import { refresh } from '../../packages/box-platform/src/refresh.js';
import { Standin } from '../../packages/box-platform/standin/standin.js';

export const SCHEMA = fileURLToPath(new URL('../../packages/box-platform/schema.sql', import.meta.url));
export const NOW = Date.parse('2026-10-31T12:00:00.000Z');
export const MINUTE = 60000;

export type Rig = { standin: Standin; env: Env & { GITHUB_API: string }; clock: { at: number }; close(): Promise<void> };

export async function rig(token?: string): Promise<Rig> {
  const standin = new Standin();
  const url = await standin.start();
  const db = localDb(SCHEMA);
  const clock = { at: NOW };
  return {
    standin, clock,
    env: { DB: db, GITHUB_API: url, now: () => clock.at, ...(token === undefined ? {} : { GITHUB_TOKEN: token }) },
    close: async () => { db.close(); await standin.stop(); }
  };
}

/**
 * Refreshes, moving the clock a tick each time, until every bounty's details
 * have been read once. With more bounties than a tick's budget a refresh may
 * never report "done": the board is always reading its stalest few.
 */
export async function refreshUntilDone(r: Rig): Promise<number> {
  for (let ticks = 1; ticks < 500; ticks++) {
    const { state } = await refresh(r.env);
    const unread = await r.env.DB.prepare('SELECT COUNT(*) AS n FROM bounties WHERE details_read_at = 0 OR events_read_at = 0').first<{ n: number }>();
    if (state === 'done' || (state === 'budget-spent' && unread?.n === 0)) return ticks;
    r.clock.at += 15 * MINUTE;
  }
  throw new Error('refresh never finished');
}

export const askJson = async (r: Rig, handle: (request: Request, env: Env) => Promise<Response>, path: string): Promise<{ status: number; body: any }> => {
  const response = await handle(new Request(`http://board.test${path}`), r.env);
  return { status: response.status, body: await response.json() };
};
