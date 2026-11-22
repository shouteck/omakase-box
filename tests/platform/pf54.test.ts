import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { lookNow, refresh } from '../../packages/box-platform/src/refresh.js';
import { idOf, type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { replayReads } from '../../packages/box-platform/standin/replay.js';
import { MINUTE, NOW, refreshUntilDone, rig, type Rig } from './support.js';

const REPO = 'example-org/ledger';
const ID = idOf(0x5401);
const BRANCH = `/repos/${REPO}/branches/${encodeURIComponent(`box-bounty/${ID}`)}`;
let r: Rig;
let branchStatus: number;
let branchReads: string[];
let issue: StandinIssue;

beforeEach(async () => {
  r = await rig('standin-read');
  r.standin.repositories.set(REPO, { language: 'TypeScript', visibility: 'public' });
  issue = { id: ID, repository: REPO, number: 54, title: 'Keep the parser stable', task: 'Preserve exports.', poster: 'example-mara', amount: 50, createdAt: new Date(NOW).toISOString(), pulls: [], events: [] };
  r.standin.issues.push(issue);
  branchStatus = 200;
  branchReads = [];
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((request, init) => {
    const url = new URL(typeof request === 'string' || request instanceof URL ? request : request.url);
    if (url.origin === r.env.GITHUB_API && url.pathname.startsWith(`/repos/${REPO}/branches/`)) {
      branchReads.push(url.pathname);
      return Promise.resolve(Response.json(branchStatus === 200 ? { name: `box-bounty/${ID}`, commit: { sha: 'a'.repeat(40) } } : { message: 'Unavailable' }, { status: branchStatus }));
    }
    return original(request, init);
  });
});
afterEach(async () => { vi.restoreAllMocks(); await r.close(); });

const row = () => r.env.DB.prepare('SELECT title FROM bounties WHERE id = ?').bind(ID).first<{ title: string }>();
const reasons = async () => (await r.env.DB.prepare('SELECT reason FROM log').all<{ reason: string }>()).results.map(one => one.reason);
async function discover(mode: string) {
  if (mode === 'search') { await refreshUntilDone(r); return; }
  const response = await handle(new Request('https://board.test/api/hint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repository: REPO, issue: 54, bounty: ID, event: 'posted' }) }), r.env);
  expect(response.status).toBe(202);
}

for (const mode of ['search', 'hint']) describe(`PF54 ${mode} CLI authority`, () => {
  it.each(['OWNER', 'COLLABORATOR', 'MEMBER', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR', 'FIRST_TIMER', 'MANNEQUIN', 'NONE', null])('admits only authorized new issue association %s', async association => {
    issue.association = association;
    await discover(mode);
    const allowed = association === 'OWNER' || association === 'COLLABORATOR' || association === 'MEMBER';
    expect(await row()).toEqual(allowed ? { title: issue.title } : null);
    expect(branchReads).toEqual(association === 'MEMBER' ? [BRANCH] : []);
    if (!allowed) expect(await reasons()).toContain('poster-lacks-repository-authority');
    const feed = await (await handle(new Request('https://board.test/bounties.json'), r.env)).json() as any;
    expect(feed.bounties.map((one: { id: string }) => one.id)).toEqual(allowed ? [ID] : []);
    const budget = await r.env.DB.prepare("SELECT value FROM meta WHERE key = 'budget_used'").first<{ value: string }>();
    expect(Number(budget?.value)).toBe(r.standin.requests.length + branchReads.length);
  });

  it.each([404, 403, 500])('holds MEMBER admission when branch proof answers %s, and retries later', async status => {
    issue.association = 'MEMBER';
    branchStatus = status;
    if (mode === 'search') await refresh(r.env);
    else await discover(mode);
    expect(await row()).toBeNull();
    expect(branchReads).toEqual([BRANCH]);
    branchStatus = 200;
    r.clock.at += 80 * MINUTE;
    await discover(mode);
    expect(await row()).toEqual({ title: issue.title });
    expect(branchReads).toEqual([BRANCH, BRANCH]);
  });

  it('checks a MEMBER branch once, then refreshes an already-held row without rechecking authority', async () => {
    issue.association = 'MEMBER';
    await discover(mode);
    expect(await row()).not.toBeNull();
    branchStatus = 404;
    issue.title = 'Updated while still a MEMBER';
    r.clock.at += 20 * MINUTE;
    await discover(mode);
    expect(await row()).toEqual({ title: issue.title });
    expect(branchReads).toEqual([BRANCH]);
    issue.association = 'NONE';
    issue.title = 'Updated by the existing poster';
    r.clock.at += 20 * MINUTE;
    await discover(mode);
    expect(await row()).toEqual({ title: issue.title });
    expect(branchReads).toEqual([BRANCH]);
    expect(await reasons()).not.toContain('poster-lacks-repository-authority');
  });

  it('waits for a budgeted branch proof instead of listing MEMBER on the two-read budget', async () => {
    issue.association = 'MEMBER';
    if (mode === 'search') await refresh({ ...r.env, tickReads: 2 });
    else expect(await lookNow({ ...r.env, tickReads: 2 }, REPO, 54, ID, r.clock.at)).toBe('budget-spent');
    expect(await row()).toBeNull();
    expect(branchReads).toEqual([]);
    r.clock.at += 20 * MINUTE;
    await discover(mode);
    expect(await row()).toEqual({ title: issue.title });
    expect(branchReads).toEqual([BRANCH]);
  });

  it('keeps an ordinary CLI owner post unchanged with no branch proof read', async () => {
    branchStatus = 404;
    await discover(mode);
    expect(await row()).toEqual({ title: issue.title });
    expect(branchReads).toEqual([]);
  });
});

it('PF54 search persists MEMBER proofs across a page that exceeds the two-read budget', async () => {
  issue.association = 'MEMBER';
  const second = { ...issue, id: idOf(0x5402), number: 55 };
  r.standin.issues.push(second);
  for (let tick = 0; tick < 3; tick += 1) {
    await refresh({ ...r.env, tickReads: 2 });
    r.clock.at += 20 * MINUTE;
  }
  expect((await r.env.DB.prepare('SELECT id FROM bounties ORDER BY listed_seq').all<{ id: string }>()).results.map(one => one.id)).toEqual([ID, second.id]);
  expect(branchReads).toEqual([BRANCH, `/repos/${REPO}/branches/${encodeURIComponent(`box-bounty/${second.id}`)}`]);
});

it('PF54 local CLI replay represents its repository owner, not strangers, as OWNER', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kitchen-PF54-replay-'));
  try {
    writeFileSync(join(directory, 'state.json'), JSON.stringify({ issues: [{ number: 1, state: 'open', user: { login: 'owner' } }, { number: 2, state: 'open', user: { login: 'stranger' } }], prs: [] }));
    expect(replayReads(directory).issues().map(one => one.author_association)).toEqual(['OWNER', 'NONE']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('PF54 search keeps an OWNER after a missing MEMBER when a later MEMBER exhausts two reads', async () => {
  issue.association = 'MEMBER';
  branchStatus = 404;
  const owner = { ...issue, id: idOf(0x5402), number: 55, association: 'OWNER' };
  const later = { ...issue, id: idOf(0x5403), number: 56 };
  r.standin.issues.push(owner, later);
  for (let tick = 0; tick < 2; tick += 1) {
    await refresh({ ...r.env, tickReads: 2 });
    r.clock.at += 20 * MINUTE;
  }
  expect((await r.env.DB.prepare('SELECT id FROM bounties ORDER BY listed_seq').all<{ id: string }>()).results).toEqual([{ id: owner.id }]);
  expect(branchReads).toEqual([BRANCH]);
  await refresh({ ...r.env, tickReads: 2 });
  expect(branchReads.filter(path => path === BRANCH)).toHaveLength(1);
  expect(branchReads).toHaveLength(2);
});

for (const mode of ['search', 'hint']) it(`PF54 ${mode} remembers a branch miss for an hour, then admits a later push`, async () => {
  issue.association = 'MEMBER';
  branchStatus = 404;
  await discover(mode);
  expect(await row()).toBeNull();
  expect(branchReads).toEqual([BRANCH]);
  branchStatus = 200;
  r.clock.at += 20 * MINUTE;
  await discover(mode);
  expect(await row()).toBeNull();
  expect(branchReads).toEqual([BRANCH]);
  r.clock.at += 60 * MINUTE;
  await discover(mode);
  expect(await row()).toEqual({ title: issue.title });
  expect(branchReads).toEqual([BRANCH, BRANCH]);
});
