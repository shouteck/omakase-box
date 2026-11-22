import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFormat } from '../../packages/box-bounty/format.js';
import { AGENT_PREPARE_MARKER, renderBountyIssue } from '../../packages/box-bounty/issue.js';
import { handle } from '../../packages/box-platform/src/api.js';
import { refresh } from '../../packages/box-platform/src/refresh.js';
import { metaStatement } from '../../packages/box-platform/src/store.js';
import { MINUTE, NOW, refreshUntilDone, rig, type Rig } from './support.js';

const ORIGIN = 'https://board.test';
const REPO = 'example-org/tools';
const COMMIT = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const BLOB = 'c'.repeat(40);
const AUTHOR = 'example-pike';
const DAY = 24 * 60 * MINUTE;
let r: Rig;
let head: any;
let tree: any;
let blob: any;
let branchStatus: number;
let branchReads: string[];
const input = () => ({ repository: REPO, commit: COMMIT, title: 'Fix parser <empty>', task: 'Keep the export order.\nDo not drop <empty>.', note: 'Tried a smaller parser.', reward: 50, paths: ['src/parser.ts', 'LICENSE'] });
const send = (path: string, init?: RequestInit) => handle(new Request(`${ORIGIN}${path}`, init), r.env);
const post = (path: string, body: unknown) => send(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://elsewhere.test', cookie: '__Host-board_session=ignored' }, body: JSON.stringify(body) });
const prepare = (body: unknown = input()) => post('/api/agents/prepare', body);
const importIssue = (reward = 50) => post('/api/agents/import', { issue: `https://github.com/${REPO}/issues/14`, reward });
const row = (id: string) => r.env.DB.prepare('SELECT * FROM bounties WHERE id = ?').bind(id).first<any>();
async function publish() {
  const response = await prepare();
  expect(response.status).toBe(200);
  const prepared = await response.json() as any;
  r.standin.issues.push({ id: prepared.id, repository: REPO, number: 14, title: prepared.issue.title, task: input().task, poster: AUTHOR,
    amount: 50, createdAt: new Date(NOW).toISOString(), rawBody: prepared.issue.body, comments: [], pulls: [] });
  return prepared;
}
async function imported() {
  const prepared = await publish();
  const response = await importIssue();
  expect(response.status).toBe(200);
  return { prepared, result: await response.json() as any };
}
async function tick() { r.clock.at += 20 * MINUTE; await refreshUntilDone(r); }
function comment(line: string, association: string) {
  r.standin.issues[0]!.comments!.push({ login: AUTHOR, body: line, association, created_at: new Date(r.clock.at + MINUTE).toISOString() });
}

beforeEach(async () => {
  r = await rig('standin-read');
  r.standin.repositories.set(REPO, { language: 'TypeScript', visibility: 'public' });
  r.standin.accountIds.set(AUTHOR, 7200);
  head = { sha: COMMIT, commit: { tree: { sha: TREE } } };
  tree = { truncated: false, tree: [{ path: 'src', mode: '040000', type: 'tree', sha: TREE }, { path: 'src/parser.ts', mode: '100644', type: 'blob', sha: BLOB }] };
  blob = { encoding: 'base64', content: Buffer.from('private/\n').toString('base64') };
  branchStatus = 200;
  branchReads = [];
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((request, init) => {
    const url = new URL(typeof request === 'string' || request instanceof URL ? request : request.url);
    if (url.origin === new URL(r.env.GITHUB_API).origin) {
      const branch = url.pathname.startsWith(`/repos/${REPO}/commits/box-bounty`);
      const recursive = url.pathname === `/repos/${REPO}/git/trees/${TREE}`;
      const ignore = url.pathname === `/repos/${REPO}/git/blobs/${BLOB}`;
      if (branch || recursive || ignore) {
        branchReads.push(url.pathname + url.search);
        return Promise.resolve(Response.json(branch ? head : recursive ? tree : blob, { status: branch ? branchStatus : 200 }));
      }
    }
    return realFetch(request, init);
  });
});
afterEach(async () => { vi.restoreAllMocks(); await r.close(); });

describe('PF53 prepare', () => {
  it('returns the CLI issue renderer and id scheme, with escaped task/note and a version-2 marker, without GitHub reads', async () => {
    const response = await prepare();
    expect(response.status).toBe(200);
    const prepared = await response.json() as any;
    const expectedId = `bt-${createHash('sha256').update(`${COMMIT}\n${input().title}\n${new Date(NOW).toISOString()}`).digest('hex').slice(0, 12)}`;
    expect(prepared.id).toBe(expectedId);
    expect(prepared.branch).toBe(`box-bounty/${expectedId}`);
    const read = readFormat(prepared.issue.body);
    expect(read.kind).toBe('present');
    if (read.kind !== 'present') throw new Error('missing CLI format');
    expect(read.value).toEqual({ schemaVersion: 2, kind: 'box-bounty', id: expectedId, repository: REPO, workCommit: COMMIT, branch: prepared.branch,
      withChanges: false, createdAt: new Date(NOW).toISOString(), state: { kind: 'open' }, reward: { amount: 50, currency: 'USD' }, terms: 'merged-solution-earns-whole' });
    const cli = renderBountyIssue({ format: read.value, title: input().title, task: input().task, note: input().note, board: ORIGIN, base: COMMIT, pushed: [], licence: { file: 'LICENSE', declared: null } });
    expect(prepared.issue.title).toBe(`[box bounty ${expectedId}] Fix parser &lt;empty>`);
    expect(prepared.issue.body.replace(`${AGENT_PREPARE_MARKER}\n`, '')).toBe(cli.body);
    expect(prepared.issue.body).toContain('## What was already tried\n\nTried a smaller parser.');
    expect(prepared.issue.body).toContain('Do not drop &lt;empty>.');
    expect(prepared.next).toContain('all paths in the tip tree plus every path touched by commits not on the remote default branch');
    expect(prepared.next).toContain('/api/agents/import');
    expect(r.standin.requests).toEqual([]);
    expect(branchReads).toEqual([]);
    expect(await row(prepared.id)).toBeNull();
  });

  it('accepts omitted optional text and inclusive reward bounds', async () => {
    for (const reward of [1, 100000]) {
      const { note: _note, ...body } = input();
      const response = await prepare({ ...body, reward });
      expect(response.status).toBe(200);
      expect((await response.json() as any).issue.body).not.toContain('## What was already tried');
    }
  });

  it.each(['.env', 'config/.env.example', 'secrets/x', 'id_rsa', '.box/bounties/record.json', '.еnv', '.e\u200bnv'])('refuses never-ship path %s without minting an id', async path => {
    const response = await prepare({ ...input(), paths: [path] });
    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.refused).toEqual([{ path, rule: expect.any(String) }]);
    expect(body.id).toBeUndefined();
    expect(branchReads).toEqual([]);
    expect(r.standin.requests).toEqual([]);
  });

  it('applies removal-only .boxignore supplied as text', async () => {
    const response = await prepare({ ...input(), paths: ['src/private.ts'], boxignore: '# owner\n/src/private.ts\n' });
    expect(response.status).toBe(400);
    expect((await response.json() as any).refused).toEqual([{ path: 'src/private.ts', rule: 'owner-list' }]);
    expect((await prepare({ ...input(), boxignore: '!.env' })).status).toBe(400);
  });

  it('finishes pathological owner globs through anonymous prepare in under 100 ms', async () => {
    const start = performance.now();
    const response = await prepare({ ...input(), paths: ['a'.repeat(60)], boxignore: '*a'.repeat(16) + 'b' });
    expect(response.status).toBe(200);
    expect(performance.now() - start).toBeLessThan(100);
    expect(r.standin.requests).toEqual([]);
  });

  it.each([
    null, [], {}, { ...input(), extra: true }, { ...input(), repository: 'private host/repo' }, { ...input(), commit: 'bad' },
    { ...input(), reward: 0 }, { ...input(), reward: 1.5 }, { ...input(), reward: 100001 }, { ...input(), reward: '50' },
    { ...input(), title: '' }, { ...input(), title: 'a'.repeat(256) }, { ...input(), title: 'line\nbreak' }, { ...input(), task: '' },
    { ...input(), note: null }, { ...input(), boxignore: [] }, { ...input(), paths: 'src' }, { ...input(), paths: [null] },
    { ...input(), paths: Array(2001).fill('src/a') }, { ...input(), paths: ['../outside'] }, { ...input(), paths: ['/absolute'] },
    { ...input(), paths: ['a\\.env'] }, { ...input(), paths: ['a//b'] }, { ...input(), paths: ['./a'] }, { ...input(), paths: ['C:/file'] },
    { ...input(), task: 'é'.repeat(33000) },
  ])('refuses invalid shape, size or field %#', async body => {
    const response = await prepare(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Nothing was prepared.') });
    expect(r.standin.requests).toEqual([]);
  });

  it('refuses malformed/non-JSON, missing body and streamed overflow', async () => {
    for (const init of [{ method: 'POST' }, { method: 'POST', body: '{}' }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' }]) {
      expect((await send('/api/agents/prepare', init)).status).toBe(400);
    }
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(' '.repeat(65537))); controller.close(); } });
    const response = await send('/api/agents/prepare', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '2' }, body: stream, duplex: 'half' } as RequestInit);
    expect(response.status).toBe(400);
  });

  it('allows 2000 paths within 64 KiB and atomically caps concurrent prepares independently of import', async () => {
    const replies = await Promise.all(Array.from({ length: 14 }, () => prepare({ ...input(), paths: Array.from({ length: 2000 }, (_, n) => `f${n}`) })));
    expect(replies.filter(reply => reply.status === 200)).toHaveLength(10);
    expect(replies.filter(reply => reply.status === 429)).toHaveLength(4);
    expect(r.standin.requests).toEqual([]);
    expect(branchReads).toEqual([]);
    expect(await r.env.DB.prepare("SELECT value FROM meta WHERE key = 'agent_import_slot'").first()).toBeNull();
    r.clock.at += MINUTE;
    expect((await prepare()).status).toBe(200);
  });
});

describe('PF53 branch import and approval', () => {
  it('stores a hidden pending posted bounty with pinned branch targeting and counted reads', async () => {
    const { prepared, result } = await imported();
    expect(result).toMatchObject({ listed: prepared.id, pending: true, approve_with: `omakase approve ${prepared.id} $50` });
    expect(r.standin.requests.length + branchReads.length).toBe(5);
    expect(branchReads).toEqual([`/repos/${REPO}/commits/${encodeURIComponent(prepared.branch)}`, `/repos/${REPO}/git/trees/${TREE}?recursive=1`]);
    expect(await row(prepared.id)).toMatchObject({ source: 'posted', approval: 'pending', listed_by_id: null, listed_by: null, work_commit: COMMIT, amount: 50, poster_id: 7200 });
    const site = await (await send(`/api/b/${prepared.id}`)).json() as any;
    expect(site.bounty).toMatchObject({ branch: prepared.branch, open_to_answers: false, approval: { state: 'pending' }, attempt: { pull_request_base: prepared.branch, reserves: false } });
    for (const path of ['/bounties.json', '/api/board']) expect((await (await send(path)).json() as any).bounties).toEqual([]);
    expect((await send(`/bounties/${prepared.id}.json`)).status).toBe(404);
    const mcp = await (await send('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_bounties', arguments: {} } }) })).json() as any;
    expect(mcp.result.structuredContent.bounties).toEqual([]);
  });

  it.each(['OWNER', 'COLLABORATOR'])('approves with association %s and retains posted answer/attempt fields', async association => {
    const { prepared, result } = await imported();
    comment(result.approve_with, association);
    await tick();
    expect(await row(prepared.id)).toMatchObject({ approval: 'comment', source: 'posted', work_commit: COMMIT, listed_by_id: null });
    const detail = await (await send(`/bounties/${prepared.id}.json`)).json() as any;
    expect(detail.bounty.answer).toEqual({ branch: prepared.branch, base_commit: COMMIT, pull_request_base: prepared.branch });
    expect(detail.bounty.attempt).toMatchObject({ pull_request_base: prepared.branch, body_must_include: null, reserves: false, submit: expect.stringContaining('ready for review') });
    expect((await (await send('/bounties.json')).json() as any).bounties.map((b: any) => b.id)).toContain(prepared.id);
  });

  it.each(['MEMBER', 'NONE', 'CONTRIBUTOR'])('rejects author-only approval with association %s', async association => {
    const { prepared, result } = await imported();
    comment(result.approve_with, association);
    await tick();
    expect(await row(prepared.id)).toMatchObject({ approval: 'pending' });
    expect((await (await send('/bounties.json')).json() as any).bounties).toEqual([]);
  });

  it.each([
    ['tip mismatch', () => { head.sha = 'd'.repeat(40); }, 'tip'],
    ['missing branch', () => { branchStatus = 404; }, 'tip'],
    ['missing tree SHA', () => { head.commit = {}; }, 'tree'],
    ['truncated tree', () => { tree.truncated = true; }, 'truncated'],
    ['missing truncated flag', () => { delete tree.truncated; }, 'truncated'],
    ['oversized tree', () => { tree.tree = Array(2001).fill(tree.tree[0]); }, '2000'],
    ['invalid tree path', () => { tree.tree[0].path = '../file'; }, 'invalid tree'],
    ['forbidden path', () => { tree.tree[0].path = '.env'; }, 'never-ship'],
    ['secrets directory', () => { tree.tree[0].path = 'secrets'; }, 'never-ship'],
    ['symlink', () => { tree.tree[1].mode = '120000'; }, 'symlink'],
    ['submodule', () => { tree.tree[1].mode = '160000'; tree.tree[1].type = 'commit'; }, 'submodule'],
  ] as const)('refuses %s before storing a pending row', async (_name, change, words) => {
    const prepared = await publish();
    change();
    const response = await importIssue();
    expect(response.status).toBe(409);
    expect((await response.json() as any).error).toContain(words);
    expect(await row(prepared.id)).toBeNull();
  });

  it('loads the immutable root .boxignore blob, including rules omitted from prepare', async () => {
    const prepared = await publish();
    tree.tree.push({ path: '.boxignore', mode: '100644', type: 'blob', sha: BLOB });
    blob.content = Buffer.from('/src/parser.ts\n').toString('base64');
    const response = await importIssue();
    expect(response.status).toBe(409);
    expect((await response.json() as any).error).toContain('src/parser.ts');
    expect(branchReads.at(-1)).toBe(`/repos/${REPO}/git/blobs/${BLOB}`);
    expect(r.standin.requests.length + branchReads.length).toBe(6);
    expect(await row(prepared.id)).toBeNull();
  });

  it.each(['!.env', 'not-base64', 'oversize'])('fails closed on invalid .boxignore %s', async content => {
    const prepared = await publish();
    tree.tree.push({ path: '.boxignore', mode: '100644', type: 'blob', sha: BLOB });
    blob.content = content === 'not-base64' ? '%%%' : Buffer.from(content === 'oversize' ? 'x'.repeat(65537) : content).toString('base64');
    expect((await importIssue()).status).toBe(409);
    expect(await row(prepared.id)).toBeNull();
  });

  it('accepts a safe .boxignore and executable regular files', async () => {
    const prepared = await publish();
    tree.tree.push({ path: '.boxignore', mode: '100644', type: 'blob', sha: BLOB });
    tree.tree[1].mode = '100755';
    expect((await importIssue()).status).toBe(200);
    expect(await row(prepared.id)).toMatchObject({ approval: 'pending' });
  });

  it('refuses reward mismatch, malformed prepared format and duplicate ids', async () => {
    const prepared = await publish();
    expect((await importIssue(51)).status).toBe(400);
    expect(await row(prepared.id)).toBeNull();
    const issue = r.standin.issues[0]!;
    issue.rawBody = prepared.issue.body.replace(AGENT_PREPARE_MARKER, '<!-- box-bounty-agent-prepare broken -->');
    expect((await importIssue()).status).toBe(400);
    issue.rawBody = prepared.issue.body;
    expect((await importIssue()).status).toBe(200);
    expect((await importIssue()).status).toBe(409);
  });

  it('refuses private repositories and exhausted budget without tree reads', async () => {
    const prepared = await publish();
    r.standin.repositories.get(REPO)!.visibility = 'private';
    expect((await importIssue()).status).toBe(409);
    expect(branchReads).toEqual([]);
    expect(await row(prepared.id)).toBeNull();
    await r.env.DB.batch([metaStatement(r.env.DB, 'budget_hour', String(Math.floor(NOW / 3600000))), metaStatement(r.env.DB, 'budget_used', '999999')]);
    const before = r.standin.requests.length;
    expect((await importIssue()).status).toBe(429);
    expect(r.standin.requests.length).toBe(before);
  });

  it('expires only unapproved sessionless rows at 14 days and cannot rediscover them', async () => {
    const { prepared } = await imported();
    r.clock.at = NOW + 14 * DAY - 1;
    await refresh(r.env);
    expect(await row(prepared.id)).not.toBeNull();
    r.clock.at = NOW + 14 * DAY;
    await refresh(r.env);
    expect(await row(prepared.id)).toBeNull();
    expect(await r.env.DB.prepare("SELECT reason FROM log WHERE reason = 'agent-import-expired'").first()).not.toBeNull();
    await tick();
    expect(await row(prepared.id)).toBeNull();
  });
});

describe('PF53 discovery admission', () => {
  it('does not list marked unimported issues through search or hint, but still lists ordinary CLI posts', async () => {
    const prepared = await publish();
    r.standin.issues.push({ id: 'bt-012345abcdef', repository: REPO, number: 15, title: 'Normal CLI bounty', task: 'Fix order.', poster: AUTHOR, amount: 50, createdAt: new Date(NOW).toISOString() });
    await refreshUntilDone(r);
    expect(r.standin.requests.some(path => path.includes('/search/issues'))).toBe(true);
    expect(await row(prepared.id)).toBeNull();
    expect(await row('bt-012345abcdef')).toMatchObject({ source: 'posted', approval: null });
    const response = await post('/api/hint', { repository: REPO, issue: 14, bounty: prepared.id, event: 'posted' });
    expect(response.status).toBe(202);
    expect(await row(prepared.id)).toBeNull();
    expect(branchReads).toEqual([]);
  });

  it('search and hints preserve a pending row without approving it or changing its commit/reward', async () => {
    const { prepared } = await imported();
    await tick();
    expect(await row(prepared.id)).toMatchObject({ approval: 'pending', work_commit: COMMIT, amount: 50 });
    const response = await post('/api/hint', { repository: REPO, issue: 14, bounty: prepared.id, event: 'posted' });
    expect(response.status).toBe(202);
    expect(await row(prepared.id)).toMatchObject({ approval: 'pending' });
  });

  it.each(['commit', 'reward', 'marker'])('does not overwrite admitted %s metadata through discovery', async changed => {
    const { prepared, result } = await imported();
    comment(result.approve_with, 'OWNER');
    await tick();
    const issue = r.standin.issues[0]!;
    issue.rawBody = changed === 'commit' ? prepared.issue.body.replaceAll(COMMIT, 'd'.repeat(40))
      : changed === 'reward' ? prepared.issue.body.replace('"amount":50', '"amount":99') : prepared.issue.body.replace(AGENT_PREPARE_MARKER, '');
    await tick();
    expect(await row(prepared.id)).toMatchObject({ approval: 'comment', work_commit: COMMIT, amount: 50 });
  });
});
