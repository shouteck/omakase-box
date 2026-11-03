// PF22: the board answers "new since", with the facts an agent needs to weigh a bounty.
// Each filter or ordering claim first shows the bounty it is about is really on the board.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { idOf, seed120, type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, refreshUntilDone, rig, type Rig } from './support.js';

const ORIGIN = 'http://board.test';
const askJson = async (r: Rig, path: string): Promise<any> => (await handle(new Request(`${ORIGIN}${path}`), r.env)).json();
const ask = (r: Rig, path: string) => handle(new Request(`${ORIGIN}${path}`), r.env);
const DAY = 86400000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const issue = (n: number, over: Partial<StandinIssue> = {}): StandinIssue => ({ id: idOf(0xe000 + n), repository: 'example-org/pf22', number: 8000 + n, title: `PF22 ${n}`, task: `Task ${n}.`, poster: 'pf22-poster', amount: 40, createdAt: ago(1), pulls: [], events: [], ...over });

let r: Rig;
/** Read the board again, as its cron would 15 minutes later. */
const reread = async () => { r.clock.at += 15 * MINUTE; await refreshUntilDone(r); };
/** The board reaches this bounty again in its rotation: its pull requests are read afresh. */
const rereadBounty = async (id: string) => { await r.env.DB.prepare('UPDATE bounties SET details_read_at = 0 WHERE id = ?').bind(id).run(); await reread(); };
/** Every open bounty, through the ordinary newest-first cursor. */
const listed = async (): Promise<string[]> => {
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page: any = await askJson(r, `/bounties.json?limit=25${cursor === null ? '' : `&cursor=${cursor}`}`);
    seen.push(...page.bounties.map((b: { id: string }) => b.id));
    cursor = page.next_cursor;
  } while (cursor !== null);
  return seen;
};
/** Every bounty "new since" a bookmark, page after page; returns them and the bookmark to keep. */
const since = async (from: string, limit = 7): Promise<{ ids: string[]; next: string }> => {
  const ids: string[] = [];
  let at = from;
  for (;;) {
    const page: any = await askJson(r, `/bounties.json?since=${at}&limit=${limit}`);
    expect(page.next_cursor).toBeNull();
    ids.push(...page.bounties.map((b: { id: string }) => b.id));
    at = page.since_next;
    if (page.bounties.length < limit) return { ids, next: at };
  }
};

beforeEach(async () => {
  r = await rig('not-a-real-token');
  seed120(r.standin, NOW);
  r.standin.repositories.set('example-org/pf22', { language: 'TypeScript', visibility: 'public' });
  await refreshUntilDone(r);
}, 120000);
afterEach(() => r.close());

describe('new since', () => {
  it('from the start: every open bounty once, across pages; then only what is new, and a re-read repeats nothing', async () => {
    const all = await listed();
    expect(all.length).toBeGreaterThan(20);
    const first = await since('start');
    expect(new Set(first.ids).size).toBe(first.ids.length);
    expect([...first.ids].sort()).toEqual([...all].sort());
    // The board reads everything again: no bounty is listed anew.
    await reread();
    expect((await since(first.next)).ids).toEqual([]);
    // One new bounty: it, and only it.
    r.standin.issues.push(issue(1));
    await reread();
    expect(await listed()).toContain(idOf(0xe000 + 1));
    const second = await since(first.next);
    expect(second.ids).toEqual([idOf(0xe000 + 1)]);
    expect((await since(second.next)).ids).toEqual([]);
  });

  it('a bounty the board reads late, posted before others it already listed, still arrives', async () => {
    const { next } = await since('start');
    // Posted long ago, read only now: by posting date it sits among the oldest.
    r.standin.issues.push(issue(2, { createdAt: ago(300) }));
    await reread();
    const all = await listed();
    expect(all).toContain(idOf(0xe000 + 2));
    expect(all.indexOf(idOf(0xe000 + 2))).toBe(all.length - 1);
    expect((await since(next)).ids).toEqual([idOf(0xe000 + 2)]);
  });

  it('a bounty listed while a solver is part-way through the pages comes once: in this walk or the next', async () => {
    const page: any = await askJson(r, '/bounties.json?since=start&limit=5');
    expect(page.bounties).toHaveLength(5);
    r.standin.issues.push(issue(3));
    await reread();
    const rest = await since(page.since_next);
    const later = await since(rest.next);
    const seen = [...page.bounties.map((b: { id: string }) => b.id), ...rest.ids, ...later.ids];
    expect(seen.filter(id => id === idOf(0xe000 + 3))).toHaveLength(1);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('since=now gives a bookmark and nothing; filters still apply; a crafted bookmark, or one with cursor or sort, is refused by name', async () => {
    const now: any = await askJson(r, '/bounties.json?since=now');
    expect(now.bounties).toEqual([]);
    expect(typeof now.since_next).toBe('string');
    // Two new bounties, one in another language: the filter is the solver's own, and the board honours it.
    r.standin.repositories.set('example-org/pf22-go', { language: 'Go', visibility: 'public' });
    r.standin.issues.push(issue(4), issue(5, { repository: 'example-org/pf22-go', number: 8105 }));
    await reread();
    expect(await listed()).toEqual(expect.arrayContaining([idOf(0xe000 + 4), idOf(0xe000 + 5)]));
    const go: any = await askJson(r, `/bounties.json?since=${now.since_next}&language=Go`);
    expect(go.bounties.map((b: { id: string }) => b.id)).toEqual([idOf(0xe000 + 5)]);
    for (const bad of ['WyJzaW5jZSIsLTFd', 'not-a-bookmark', btoa(JSON.stringify(['newest', 1, 'x', 'y'])), '']) {
      const answer = await ask(r, `/bounties.json?since=${encodeURIComponent(bad)}`);
      expect(answer.status, bad).toBe(400);
      expect((await answer.json() as any).error).toMatch(/^since: not a bookmark this board gave/);
    }
    for (const both of ['&cursor=x', '&sort=reward']) {
      const answer = await ask(r, `/bounties.json?since=start${both}`);
      expect(answer.status).toBe(400);
      expect((await answer.json() as any).error).toMatch(/^since: not with cursor or sort/);
    }
  });

  it('a repository that turns private leaves "new since" too', async () => {
    const { next } = await since('start');
    r.standin.issues.push(issue(6));
    await reread();
    r.standin.repositories.get('example-org/pf22')!.visibility = 'private';
    await reread();
    expect(await listed()).not.toContain(idOf(0xe000 + 6));
    expect((await since(next)).ids).not.toContain(idOf(0xe000 + 6));
  });

  it('MCP: find_bounties takes since and gives since_next', async () => {
    const call = async (args: Record<string, unknown>) => {
      const response = await handle(new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_bounties', arguments: args } }) }), r.env);
      return ((await response.json()) as any).result.structuredContent;
    };
    const now = await call({ since: 'now' });
    r.standin.issues.push(issue(7));
    await reread();
    expect((await call({ since: now.since_next })).bounties.map((b: { id: string }) => b.id)).toEqual([idOf(0xe000 + 7)]);
  });
});

describe('the facts to weigh a bounty', () => {
  const entry = async (id: string) => (await askJson(r, `/bounties/${id}.json`)).bounty;

  it('attempts in progress: open drafts, with author and last activity; a draft made ready leaves the count', async () => {
    const pull = (number: number, author: string, draft: boolean) => ({ number, author, state: 'open' as const, created_at: ago(1), draft, updated_at: ago(0.5) });
    r.standin.issues.push(issue(10, { pulls: [pull(1, 'agent-a', true), pull(2, 'agent-b', true), pull(3, 'agent-c', false)] }));
    await reread();
    expect(await listed()).toContain(idOf(0xe000 + 10));
    const one = await entry(idOf(0xe000 + 10));
    expect(one.attempts_in_progress).toEqual({ count: 2, drafts: [{ author: 'agent-a', opened_at: ago(1), last_activity_at: ago(0.5) }, { author: 'agent-b', opened_at: ago(1), last_activity_at: ago(0.5) }] });
    expect(one.solutions).toMatchObject({ open: 3 });
    // The same fact, in the list.
    const page: any = await askJson(r, '/bounties.json?repository=example-org/pf22');
    expect(page.bounties.find((b: { id: string }) => b.id === idOf(0xe000 + 10)).attempts_in_progress.count).toBe(2);
    r.standin.issues.find(entry => entry.id === idOf(0xe000 + 10))!.pulls![0]!.draft = false;
    await rereadBounty(idOf(0xe000 + 10));
    expect((await entry(idOf(0xe000 + 10))).attempts_in_progress.count).toBe(1);
  });

  it('the poster answering its own bounty is said; another author makes it false', async () => {
    const own = { number: 1, author: 'pf22-poster', state: 'open' as const, created_at: ago(1) };
    r.standin.issues.push(issue(11, { pulls: [own] }), issue(12));
    await reread();
    expect((await entry(idOf(0xe000 + 11))).solutions.open_all_by_poster).toBe(true);
    expect((await entry(idOf(0xe000 + 12))).solutions.open_all_by_poster).toBe(false);
    r.standin.issues.find(entry => entry.id === idOf(0xe000 + 11))!.pulls!.push({ number: 2, author: 'someone-else', state: 'open', created_at: ago(1) });
    await rereadBounty(idOf(0xe000 + 11));
    expect((await entry(idOf(0xe000 + 11))).solutions.open_all_by_poster).toBe(false);
  });

  it('how fast the owner decides: median days from the first pull request to a merge or a close, on every bounty of theirs', async () => {
    // Decided in 3 days (merged), and in 5 days (closed with nothing merged); one still undecided.
    r.standin.issues.push(
      issue(20, { state: 'closed', closedAt: ago(7), pulls: [{ number: 1, author: 'agent-a', state: 'closed', created_at: ago(10), merged_at: ago(7) }] }),
      issue(21, { state: 'closed', closedAt: ago(3), pulls: [{ number: 1, author: 'agent-b', state: 'closed', created_at: ago(8) }] }),
      issue(22, { pulls: [{ number: 1, author: 'agent-c', state: 'open', created_at: ago(2) }] }),
      issue(23)
    );
    await reread();
    expect(await listed()).toContain(idOf(0xe000 + 23));
    const open = await entry(idOf(0xe000 + 23));
    expect(open.owner.decisions).toEqual({ count: 2, median_days: 4 });
    // Another owner with no decided bounty says so.
    expect((await entry(idOf(1))).owner.decisions).toEqual({ count: 0, median_days: null });
  });

  it('pays_on_merge says the reward must equal the approved one, never "within their limit"', async () => {
    const page: any = await askJson(r, '/bounties.json');
    expect(page.legend.pays_on_merge).toContain('equals the reward they approved');
    expect(JSON.stringify(page.legend)).not.toContain('within their limit');
  });
});

describe('the budget on Workers Free', () => {
  it('500 solvers checking every 15 minutes: requests a day, queries per check, and the index the check uses', async () => {
    const { next } = await since('start');
    let queries = 0;
    const seen: string[] = [];
    const prepare = r.env.DB.prepare.bind(r.env.DB);
    r.env.DB.prepare = ((sql: string) => { queries += 1; seen.push(sql); return prepare(sql); }) as typeof r.env.DB.prepare;
    const empty = await ask(r, `/bounties.json?since=${next}`);
    expect(empty.status).toBe(200);
    const perCheck = queries;
    // A repeat with the tag answers 304, with no body.
    const again = await handle(new Request(`${ORIGIN}/bounties.json?since=${next}`, { headers: { 'if-none-match': empty.headers.get('etag')! } }), r.env);
    expect(again.status).toBe(304);
    r.env.DB.prepare = prepare;
    const checksADay = 500 * (24 * 60 / 15);
    console.log(`PF22 budget: ${checksADay} checks a day against 100000 requests; ${perCheck} queries per empty check (limit 50 per request)`);
    expect(checksADay).toBeLessThan(100_000);
    expect(perCheck).toBeLessThanOrEqual(10);
    // Rows read: each query that walks the list reads only bounties new since the bookmark, by bounties_listed,
    // even on a database without statistics, where SQLite would otherwise walk every open bounty.
    const plain = new DatabaseSync(':memory:');
    plain.exec(readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '../../packages/box-platform/schema.sql'), 'utf8'));
    const walks = seen.filter(sql => sql.includes('b.listed_seq > ?'));
    expect(walks.length).toBeGreaterThan(0);
    for (const sql of walks) {
      const plan = (plain.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...Array.from({ length: (sql.match(/\?/g) ?? []).length }, () => 0)) as { detail: string }[]).map(row => row.detail);
      expect(plan.some(step => step.includes('bounties_listed')), plan.join('; ')).toBe(true);
      expect(plan.some(step => step.includes('bounties_board')), plan.join('; ')).toBe(false);
    }
    plain.close();
  });
});

describe('the live database', () => {
  const read = (name: string) => readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '../../packages/box-platform', name), 'utf8');
  const columns = (db: DatabaseSync, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(row => row.name).sort();
  it('a board from before PF22, migrated: same columns as a new one, and its bounties ordered as posted', () => {
    const schema = read('schema.sql');
    const old = schema.replace(/,\r?\n\s*-- PF22[^\n]*\r?\n\s*listed_seq INTEGER/, '').replace(/\r?\n\s*-- PF22[^\n]*\r?\n\s*draft INTEGER,\r?\n\s*updated_at TEXT,/, '').replace(/^CREATE INDEX IF NOT EXISTS bounties_listed[^\n]*\r?\n/m, '');
    expect(old).not.toContain('listed_seq');
    expect(old).not.toContain('draft INTEGER');
    const existing = new DatabaseSync(':memory:');
    existing.exec(old);
    const add = existing.prepare(`INSERT INTO bounties (id, repository, issue_number, title, task, poster, issue_state, amount, created_at, work_commit, seen_at) VALUES (?, 'o/r', ?, 't', 't', 'p', 'open', 1, ?, 'c', 0)`);
    add.run('bt-00000000000b', 2, '2026-10-02T00:00:00Z');
    add.run('bt-00000000000a', 1, '2026-10-01T00:00:00Z');
    add.run('bt-00000000000c', 3, '2026-10-02T00:00:00Z');
    existing.exec(read('migrations/pf22.sql'));
    existing.exec(schema);
    const fresh = new DatabaseSync(':memory:');
    fresh.exec(schema);
    for (const table of ['bounties', 'pull_requests']) expect(columns(existing, table)).toEqual(columns(fresh, table));
    expect(existing.prepare('SELECT id FROM bounties ORDER BY listed_seq').all().map(row => (row as { id: string }).id)).toEqual(['bt-00000000000a', 'bt-00000000000b', 'bt-00000000000c']);
    existing.close();
    fresh.close();
  });
});
