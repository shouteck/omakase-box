// PF29: the CLI says what the board now states. `discover` gives each bounty's merge odds and what GitHub's checks say
// on its attempts; `describe` says who decides each step, from the owner's own settings.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allowRepository, changeConfig, discover, renderDescribe, renderDescribeSolving, renderDiscover } from '../../../packages/box-bounty/index.js';
import { git, makeRepo, runRoot } from './support.js';

const STANDIN = fileURLToPath(new URL('./board-standin.cjs', import.meta.url));
let folder: string;
let board: string;
let server: ChildProcess;
const routes = (next: Record<string, { status: number; body: unknown }>) => writeFileSync(join(folder, 'routes.json'), JSON.stringify(next));

beforeAll(async () => {
  folder = runRoot('pf29-board');
  mkdirSync(folder, { recursive: true });
  server = spawn(process.execPath, [STANDIN, folder], { stdio: ['ignore', 'pipe', 'inherit'] });
  board = await new Promise<string>(done => server.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { server.kill(); });
beforeEach(() => { writeFileSync(join(folder, 'requests.jsonl'), ''); routes({}); });

const draft = (state: string | null) => ({ author: 'example-fern', opened_at: '2026-11-01T00:00:00Z', last_activity_at: null, checks: state === null ? null : { state, head: 'b'.repeat(40), read_at: '2026-11-01T00:00:00Z' } });
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'bt-0000000000a1', poster_says: { title: 'Fix the parser' }, reward: { amount: 45, currency: 'USD', paid: 'on merge' }, pays_on_merge: true, how_it_pays: { ways: ['on-merge'] }, agents_welcome: true,
  owner: { login: 'example-mara', record: { has_history: true, merged: 3, recorded_paid: 3, confirmed_received: 2, from_solvers: 2, owed_now: 0, oldest_owed_days: 0, says_not_received: 0, median_days_to_record_paid: 1 }, decisions: { count: 4, median_days: 2 }, pull_requests: { merged: 3, closed: 5, open: 2 } },
  repository: { name: 'example-org/ledger', language: 'TypeScript', url: 'https://github.com/example-org/ledger' },
  state: 'open', solutions: { open: 3, total: 3, open_all_by_poster: false }, attempts_in_progress: { count: 3, drafts: [draft('failing'), draft('passing'), draft(null)] },
  posted_at: '2026-10-30T00:00:00Z', age_days: 3, approved_by: null,
  answer: { branch: 'box-bounty/bt-0000000000a1', base_commit: 'a'.repeat(40), pull_request_base: 'box-bounty/bt-0000000000a1' },
  links: { page: `${board}/b/bt-0000000000a1/`, issue: 'https://github.com/example-org/ledger/issues/1', detail: `${board}/bounties/bt-0000000000a1.json` },
  ...over
});
const listing = (bounties: unknown[]) => ({ status: 200, body: { board: 'Open bounty board', since_next: 'B1', next_cursor: null, count: bounties.length, bounties } });

describe('discover states the new facts', () => {
  it('the owner\'s merge odds, what GitHub\'s checks say on the attempts, and what pays on merge means', () => {
    changeConfig(null, 'set', 'board', board);
    changeConfig(null, 'set', 'solving', 'allowed');
    routes({ '/bounties.json?since=start&limit=10': listing([entry()]) });
    const result = discover({});
    expect(result.bounties[0]).toMatchObject({ pullRequests: { merged: 3, closed: 5, open: 2 }, checks: { failing: 1, passing: 1, pending: 0, none: 0, unread: 0 } });
    const lines = renderDiscover(result).join('\n');
    expect(lines).toContain('pays on merge: yes (the reward is within the owner\'s approved limit, with a saved card)');
    expect(lines).toContain('attempts in progress: 3 (GitHub\'s checks: 1 failing, 1 passing)');
    expect(lines).toContain('others\' pull requests: 3 merged, 5 closed without a merge, 2 open');
  });

  it('a board without the new facts says nothing of them, never zeros it did not read', () => {
    changeConfig(null, 'set', 'board', board);
    changeConfig(null, 'set', 'solving', 'allowed');
    const old = entry();
    delete (old.owner as Record<string, unknown>)['pull_requests'];
    routes({ '/bounties.json?since=start&limit=10': listing([{ ...old, attempts_in_progress: { count: 1, drafts: [{ author: 'example-fern', opened_at: '2026-11-01T00:00:00Z', last_activity_at: null }] } }]) });
    const lines = renderDiscover(discover({})).join('\n');
    expect(lines).not.toContain('others\' pull requests');
    expect(lines).not.toContain('GitHub\'s checks');
  });
});

describe('the board in one line', () => {
  const numbers = { board: 'Open bounty board', bounties: { listed: 9, open: 4, open_with_reward: 3, base: 'x' }, rewards: { stated_on_open_bounties_usd: 120, pays_on_merge: { bounties: 2, usd: 90 }, no_attempt_yet: { bounties: 1, usd: 30 }, base: 'x' }, payments: { merged_with_reward: 5, recorded_paid: 4, confirmed_received: 3, says_not_received: 0, owed_now: { bounties: 1, usd: 25, oldest_days: 2 }, base: 'x' }, last_30_days: { posted: 6, merged: 2, base: 'x' } };
  it('discover and describe --solving state it from the board\'s public numbers, with where to read more', () => {
    changeConfig(null, 'set', 'board', board);
    changeConfig(null, 'set', 'solving', 'allowed');
    routes({ '/bounties.json?since=start&limit=10': listing([]), '/numbers.json': { status: 200, body: numbers } });
    const line = `board numbers: 4 of 5 merged rewarded bounties recorded paid; 1 owed now ($25); 3 open with a reward, 2 paying on merge, 1 with no attempt yet; 6 posted and 2 merged in the last 30 days · ${board}/numbers/`;
    expect(renderDiscover(discover({}))).toContain(line);
    expect(renderDescribeSolving().split('\n')).toContain(line);
  });

  it('a board that does not answer is said to, never shown as zeros', () => {
    changeConfig(null, 'set', 'board', board);
    changeConfig(null, 'set', 'solving', 'allowed');
    routes({ '/bounties.json?since=start&limit=10': listing([]) });
    const lines = renderDiscover(discover({})).join('\n');
    expect(lines).toContain(`board numbers: not read (the board answered 404) · ${board}/numbers/`);
    expect(lines).not.toContain('0 of 0');
  });
});

describe('describe names who decides each step', () => {
  it('posting and merging from this repository\'s answer, solving from the owner\'s; outside a checkout it says it needs one', () => {
    changeConfig(null, 'set', 'solving', 'off');
    expect(renderDescribe(null)).toContain('modes: posting and merging: needs a repository to say; taking others\' bounties: off (box bounty describe --solving).');
    const repo = makeRepo({ 'README.md': 'pf29\n' });
    git(repo, ['remote', 'add', 'origin', 'https://github.com/example-org/pf29.git']);
    expect(renderDescribe(repo)).toContain('modes: posting and merging: not allowed yet;');
    allowRepository(repo, 'example-org/pf29', true);
    changeConfig(null, 'set', 'solving', 'ask');
    expect(renderDescribe(repo)).toContain('modes: posting and merging: the owner is asked each time; taking others\' bounties: the owner is asked each time (box bounty describe --solving).');
    allowRepository(repo, 'example-org/pf29', false);
    changeConfig(null, 'set', 'solving', 'allowed');
    expect(renderDescribe(repo)).toContain('modes: posting and merging: the agent decides; taking others\' bounties: the agent decides');
  });
});
