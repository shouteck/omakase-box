// Payment facts and track records (PF4): the rules as a table, then on the real
// routes against the stand-in, with disagreements and self-dealing seeded.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { type BountyPayment, notCounted, ownerRecord, paymentOf, solverRecord } from '../../packages/box-platform/src/payments.js';
import { type StandinIssue, type StandinPull } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, rig, type Rig, refreshUntilDone } from './support.js';

const ORIGIN = 'https://board.test';
const DAY = 86400000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const OWNER = 'example-mara';
const SOLVER = 'example-quill';

const merged = (over: Partial<BountyPayment['pulls'][number]> = {}) => ({ number: 1, author: SOLVER, merged_at: ago(6), association: 'NONE', on_default: 1, ...over });
const input = (over: Partial<BountyPayment> = {}): BountyPayment => ({ id: 'bt-000000000001', title: 't', repository: 'o/r', amount: 50, poster: OWNER, pulls: [merged()], chain: [], click: null, receipt: null, ...over });
const paid = (at: string, withdrawn = 0) => ({ at, amount: 50, withdrawn });
const says = (word: 'received' | 'not-received', record_at: string) => ({ says: word, record_at, at: ago(0), payee: SOLVER });

describe('one bounty\'s facts', () => {
  it('a merged rewarded bounty, nothing recorded: owed, since the merge', () => {
    expect(paymentOf(input())).toMatchObject({ state: 'owed', owed: { to: SOLVER, amount: 50, since: ago(6), source: 'github' }, recorded_paid: null, solver_says: null });
  });
  it('a merge whose head is not on the default branch owes nothing yet, and says so', () => {
    for (const on_default of [0, null]) {
      const payment = paymentOf(input({ pulls: [merged({ on_default })] }));
      expect(payment.state).toBe('merged-not-on-default');
      expect(payment.owed).toBeNull();
      expect(payment).toMatchObject({ note: expect.stringContaining('Nothing is owed yet') });
    }
  });
  it('the chain\'s paid event: recorded by the poster, dated by the event, the owner\'s word', () => {
    expect(paymentOf(input({ chain: [paid(ago(4))] }))).toMatchObject({ state: 'recorded', recorded_paid: { by: OWNER, at: ago(4), amount: 50, whose_word: 'the owner\'s', source: 'project-record' } });
  });
  it('the click is the board\'s record, attributed to who clicked', () => {
    expect(paymentOf(input({ click: { ...paid(ago(4)), to: SOLVER, by: OWNER } })).recorded_paid).toMatchObject({ by: OWNER, source: 'board' });
  });
  it('chain and click: the latest decides, in both orders', () => {
    const click = { ...paid(ago(2), 1), to: null, by: OWNER };
    expect(paymentOf(input({ chain: [paid(ago(4))], click })).state).toBe('owed');
    expect(paymentOf(input({ chain: [paid(ago(1))], click })).state).toBe('recorded');
  });
  it('owner says paid, solver silent: the owner\'s fact alone, no verdict', () => {
    const payment = paymentOf(input({ chain: [paid(ago(4))] }));
    expect(payment.solver_says).toBeNull();
    expect(JSON.stringify(payment)).not.toMatch(/verdict|correct|wrong|true|false/i);
  });
  it('they disagree: both facts, each attributed', () => {
    const at = ago(4);
    expect(paymentOf(input({ chain: [paid(at)], receipt: says('not-received', at) }))).toMatchObject({
      state: 'says-not-received', recorded_paid: { by: OWNER, whose_word: 'the owner\'s' }, solver_says: { by: SOLVER, word: 'not-received', whose_word: 'the solver\'s', source: 'board' }
    });
  });
  it('an answer about an earlier record does not carry over', () => {
    expect(paymentOf(input({ chain: [paid(ago(2))], receipt: says('received', ago(4)) })).state).toBe('recorded');
  });
  it('two merged: the owner decides; owed to nobody by name; a chain event settles nothing', () => {
    const pulls = [merged(), merged({ number: 2, author: 'example-rook', merged_at: ago(3) })];
    const payment = paymentOf(input({ pulls }));
    expect(payment).toMatchObject({ state: 'owner-decides', owed: { to: null, to_one_of: [SOLVER, 'example-rook'], since: ago(6) } });
    expect(paymentOf(input({ pulls, chain: [paid(ago(1))] })).state).toBe('owner-decides');
  });
  it('two merged: a click naming one settles it for them; one naming anyone else changes nothing', () => {
    const pulls = [merged(), merged({ number: 2, author: 'example-rook' })];
    expect(paymentOf(input({ pulls, click: { ...paid(ago(1)), to: 'example-rook', by: OWNER } }))).toMatchObject({ state: 'recorded', owed: { to: 'example-rook' }, recorded_paid: { chosen_by_owner_from: [SOLVER, 'example-rook'] } });
    expect(paymentOf(input({ pulls, click: { ...paid(ago(1)), to: 'example-pike', by: OWNER } })).state).toBe('owner-decides');
  });
  it('one merge landed of two: its author is the payee', () => {
    expect(paymentOf(input({ pulls: [merged(), merged({ number: 2, author: 'example-rook', on_default: 0 })] })).owed?.to).toBe(SOLVER);
  });
  it('a $0 bounty has no payment facts', () => {
    expect(paymentOf(input({ amount: 0, chain: [paid(ago(1))] }))).toMatchObject({ state: 'no-reward', owed: null, recorded_paid: null });
  });
  it('no merge: nothing owed, even with a paid event', () => {
    expect(paymentOf(input({ pulls: [], chain: [paid(ago(1))] }))).toMatchObject({ state: 'nothing-owed', owed: null, recorded_paid: null });
  });
});

describe('self-dealing', () => {
  it.each<[string, string, string | null, boolean]>([
    ['the poster', OWNER, 'NONE', true],
    ['the poster in another case', OWNER.toUpperCase(), 'NONE', true],
    ['listed as owner', SOLVER, 'OWNER', true],
    ['listed as member', SOLVER, 'MEMBER', true],
    ['listed as collaborator', SOLVER, 'COLLABORATOR', true],
    ['GitHub did not say', SOLVER, null, true],
    ['a contributor', SOLVER, 'CONTRIBUTOR', false],
    ['a first timer', SOLVER, 'FIRST_TIME_CONTRIBUTOR', false],
    ['no association', SOLVER, 'NONE', false]
  ])('%s', (_name, author, association, excluded) => {
    expect(notCounted({ author, association }, OWNER) !== null).toBe(excluded);
  });

  it.each<[string, { author?: string; association?: string }]>([['the poster', { author: OWNER }], ['listed as a collaborator', { association: 'COLLABORATOR' }]])('%s: shown on the bounty, counted nowhere', (_name, over) => {
    const at = ago(4);
    const self = input({ pulls: [merged(over)], chain: [paid(at)], receipt: { ...says('received', at), payee: over.author ?? SOLVER } });
    expect(paymentOf(self).excluded_from_counts).not.toBeNull();
    expect(ownerRecord([self], NOW)).toMatchObject({ has_history: false, merged: 0, recorded_paid: 0, confirmed_received: 0, from_solvers: 0, owed_now: 0 });
    expect(solverRecord(over.author ?? SOLVER, [self])).toEqual({ has_history: false, merged: 0, confirmed_received: 0 });
  });

  it('two merged: counted when one author has no association', () => {
    const pulls = [merged({ association: 'OWNER' }), merged({ number: 2, author: 'example-rook' })];
    expect(ownerRecord([input({ pulls })], NOW)).toMatchObject({ merged: 1, owed_now: 1 });
  });
});

describe('an owner\'s counts', () => {
  it('a new owner has the whole shape, no history and zeros, and a null median', () => {
    expect(ownerRecord([], NOW)).toEqual({ has_history: false, merged: 0, recorded_paid: 0, confirmed_received: 0, from_solvers: 0, owed_now: 0, oldest_owed_days: 0, says_not_received: 0, median_days_to_record_paid: null });
  });
  it('counts each kind, from seeded disagreements, worked out by hand', () => {
    const at = ago(3); // merged 6 days ago: recorded after 3 days
    const inputs = [
      input({ id: 'bt-1', pulls: [merged()] }),                                                                     // owed 6 days
      input({ id: 'bt-2', pulls: [merged({ merged_at: ago(40) })] }),                                               // owed 40 days
      input({ id: 'bt-3', chain: [paid(at)] }),                                                                     // recorded, 3 days
      input({ id: 'bt-4', chain: [paid(at)], receipt: says('received', at) }),                                      // confirmed, 3 days
      input({ id: 'bt-5', pulls: [merged({ merged_at: ago(11) })], chain: [paid(at)], receipt: says('not-received', at) }), // disputed, 8 days
      input({ id: 'bt-6', pulls: [merged({ author: 'example-rook' })], chain: [paid(at)], receipt: { ...says('received', at), payee: 'example-rook' } }), // confirmed, 3 days
      input({ id: 'bt-7', pulls: [merged({ author: OWNER })], chain: [paid(at)] }),                                 // self-dealing: nowhere
      input({ id: 'bt-8', amount: 0 }),                                                                             // no reward: nowhere
      input({ id: 'bt-9', pulls: [merged({ on_default: 0 })] })                                                     // not landed: nowhere
    ];
    expect(ownerRecord(inputs, NOW)).toEqual({ has_history: true, merged: 6, recorded_paid: 4, confirmed_received: 2, from_solvers: 2, owed_now: 2, oldest_owed_days: 40, says_not_received: 1, median_days_to_record_paid: 3 });
    expect(solverRecord(SOLVER, inputs)).toEqual({ has_history: true, merged: 6, confirmed_received: 1 });
    expect(solverRecord('example-rook', inputs)).toEqual({ has_history: true, merged: 1, confirmed_received: 1 });
  });
});

describe('on the real routes', () => {
  type Jar = Map<string, string>;
  let r: Rig;
  const env = () => ({ ...r.env, GITHUB_WEB: r.env.GITHUB_API, GITHUB_OAUTH_CLIENT_ID: r.standin.oauthClientId, GITHUB_OAUTH_CLIENT_SECRET: r.standin.oauthClientSecret });
  const ID = 'bt-aaaaaaaaaaa1';
  const TWO = 'bt-aaaaaaaaaaa2';
  const SELF = 'bt-aaaaaaaaaaa3';
  const LATE = 'bt-aaaaaaaaaaa4';
  const repository = 'example-tidepool/ledger-lite';
  const pull = (number: number, author: string, over: Partial<StandinPull> = {}): StandinPull => ({ number, author, state: 'closed', created_at: ago(9), merged_at: ago(6), ...over });
  const issue = (id: string, number: number, poster: string, pulls: StandinPull[], over: Partial<StandinIssue> = {}): StandinIssue => ({ id, repository, number, title: `Bounty ${number}`, task: 'Do it.', poster, amount: 50, createdAt: ago(10), pulls, ...over });

  async function send(jar: Jar | null, path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (jar !== null && jar.size > 0) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const response = await handle(new Request(`${ORIGIN}${path}`, { ...init, headers }), env());
    if (jar !== null) for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const at = pair!.indexOf('=');
      if (/Max-Age=0/.test(line)) jar.delete(pair!.slice(0, at)); else jar.set(pair!.slice(0, at), pair!.slice(at + 1));
    }
    return response;
  }
  async function signIn(login: string): Promise<Jar> {
    r.standin.signInAs = { id: login.length * 1000 + login.charCodeAt(8), login };
    const jar: Jar = new Map();
    const start = await send(jar, '/auth/github');
    const atGitHub = await fetch(start.headers.get('location')!, { redirect: 'manual' });
    const back = new URL(atGitHub.headers.get('location')!);
    await send(jar, `${back.pathname}${back.search}`);
    return jar;
  }
  const post = (jar: Jar | null, id: string, what: string, body: unknown, origin = ORIGIN) => send(jar, `/api/b/${id}/${what}`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  const facts = async (id: string) => (await (await send(null, `/bounties/${id}.json`)).json() as any).bounty.payment;
  const owner = async (login: string) => (await send(null, `/api/owner/${login}`)).json() as Promise<any>;
  const solver = async (login: string) => (await send(null, `/api/solver/${login}`)).json() as Promise<any>;
  const clicks = async () => (await r.env.DB.prepare('SELECT COUNT(*) AS n FROM paid_clicks').first<{ n: number }>())?.n;
  async function reread(): Promise<void> {
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
  }

  beforeEach(async () => {
    r = await rig('standin-read');
    r.standin.repositories.set(repository, { language: 'TypeScript', visibility: 'public' });
    r.standin.issues.push(
      issue(ID, 1, OWNER, [pull(11, SOLVER)]),
      issue(TWO, 2, OWNER, [pull(12, 'example-fern'), pull(13, 'example-rook')]),
      issue(SELF, 3, 'example-wren', [pull(14, 'example-wren')]),
      issue(LATE, 4, 'example-sol', [pull(15, 'example-fern', { association: 'COLLABORATOR' })]),
      issue('bt-aaaaaaaaaaa5', 5, 'example-new', [])
    );
    await refreshUntilDone(r);
  });
  afterEach(async () => { await r.close(); });

  it('reads GitHub\'s two facts: a head not on the default branch owes nothing, and a later yes changes that', async () => {
    const seeded = r.standin.issues.find(entry => entry.id === ID)!;
    seeded.pulls![0]!.landed = false;
    await r.env.DB.prepare('UPDATE pull_requests SET on_default = NULL WHERE bounty_id = ?').bind(ID).run();
    await reread();
    expect((await facts(ID)).state).toBe('merged-not-on-default');
    seeded.pulls![0]!.landed = true;
    await reread();
    expect((await facts(ID)).state).toBe('owed');
  });

  it('a compare GitHub will not answer stays unknown, and says nothing is confirmed', async () => {
    r.standin.issues.find(entry => entry.id === ID)!.pulls![0]!.landed = null;
    await r.env.DB.prepare('UPDATE pull_requests SET on_default = NULL WHERE bounty_id = ?').bind(ID).run();
    await reread();
    expect(await facts(ID)).toMatchObject({ state: 'merged-not-on-default', owed: null, note: expect.stringContaining('has not confirmed') });
  });

  it('many merged pull requests cannot spend a refresh: at most five compares a read', async () => {
    r.standin.issues.push(issue('bt-aaaaaaaaaaa7', 7, OWNER, Array.from({ length: 30 }, (_, i) => pull(100 + i, 'example-pike', { landed: false }))));
    await reread();
    const before = r.standin.requests.length;
    await reread();
    expect(r.standin.requests.slice(before).filter(path => path.includes('/compare/')).length).toBe(5);
  });

  it('keeps the association of the first read after the merge: a later invitation does not rewrite history', async () => {
    r.standin.issues.find(entry => entry.id === ID)!.pulls![0]!.association = 'COLLABORATOR';
    await reread();
    expect((await facts(ID)).excluded_from_counts).toBeNull();
  });

  it('the association read before the merge does not stick', async () => {
    const open = pull(21, 'example-pike', { state: 'open', association: 'NONE' });
    delete open.merged_at;
    r.standin.issues.push(issue('bt-aaaaaaaaaaa6', 6, OWNER, [open]));
    await reread();
    Object.assign(open, { state: 'closed', merged_at: ago(0), association: 'MEMBER' });
    await reread();
    expect((await facts('bt-aaaaaaaaaaa6')).excluded_from_counts).toMatchObject({ because: 'GitHub lists them as member of the repository' });
  });

  it('the paid button: refused to anyone but the issue\'s author, with nothing changed', async () => {
    for (const who of [SOLVER, 'example-pike']) {
      const refused = await post(await signIn(who), ID, 'paid', {});
      expect(refused.status).toBe(403);
      expect((await refused.json() as any).error).toContain('Nothing changed');
    }
    expect((await post(null, ID, 'paid', {})).status).toBe(401);
    expect((await post(await signIn(OWNER), ID, 'paid', {}, 'https://evil.test')).status).toBe(403);
    expect(await clicks()).toBe(0);
    expect((await facts(ID)).state).toBe('owed');
  });

  it('the poster records it: public, attributed, the amount the bounty\'s whatever is sent', async () => {
    const jar = await signIn(OWNER);
    const answer = await post(jar, ID, 'paid', { amount: 1 });
    expect(answer.status).toBe(200);
    expect(await facts(ID)).toMatchObject({ state: 'recorded', recorded_paid: { by: OWNER, amount: 50, source: 'board', whose_word: 'the owner\'s' } });
    expect((await owner(OWNER)).record).toMatchObject({ merged: 2, recorded_paid: 1, owed_now: 1 });
  });

  it('the same click twice changes nothing, so a solver\'s answer survives it', async () => {
    const jar = await signIn(OWNER);
    await post(jar, ID, 'paid', {});
    const before = (await facts(ID)).recorded_paid.at;
    expect((await post(await signIn(SOLVER), ID, 'receipt', { says: 'received' })).status).toBe(200);
    r.clock.at += MINUTE;
    expect((await post(jar, ID, 'paid', {})).status).toBe(200);
    expect(await facts(ID)).toMatchObject({ state: 'confirmed', recorded_paid: { at: before } });
  });

  it('the solver confirms, then withdraws: shown, then removed; counts follow', async () => {
    await post(await signIn(OWNER), ID, 'paid', {});
    const payee = await signIn(SOLVER);
    expect((await post(payee, ID, 'receipt', { says: 'received' })).status).toBe(200);
    expect((await facts(ID)).solver_says).toMatchObject({ by: SOLVER, word: 'received' });
    expect((await owner(OWNER)).record).toMatchObject({ confirmed_received: 1, from_solvers: 1 });
    expect((await solver(SOLVER)).record).toEqual({ has_history: true, merged: 1, confirmed_received: 1 });
    expect((await post(payee, ID, 'receipt', { says: null })).status).toBe(200);
    expect((await facts(ID)).solver_says).toBeNull();
    expect((await owner(OWNER)).record).toMatchObject({ confirmed_received: 0, from_solvers: 0 });
    expect((await solver(SOLVER)).record.confirmed_received).toBe(0);
  });

  it('a non-payee\'s answer changes nothing', async () => {
    await post(await signIn(OWNER), ID, 'paid', {});
    expect((await post(await signIn('example-pike'), ID, 'receipt', { says: 'received' })).status).toBe(403);
    expect((await facts(ID)).solver_says).toBeNull();
  });

  it('a dispute is public to anyone, in the page\'s answer and the feed\'s', async () => {
    await post(await signIn(OWNER), ID, 'paid', {});
    await post(await signIn(SOLVER), ID, 'receipt', { says: 'not-received' });
    expect(await (await send(null, `/api/b/${ID}/payment`)).json()).toMatchObject({ receipt: { says: 'not-received' }, payment: { state: 'says-not-received' } });
    expect((await owner(OWNER)).record.says_not_received).toBe(1);
  });

  it('withdrawing the record: owed again, and the solver\'s answer goes with it', async () => {
    const jar = await signIn(OWNER);
    await post(jar, ID, 'paid', {});
    await post(await signIn(SOLVER), ID, 'receipt', { says: 'received' });
    r.clock.at += MINUTE;
    expect((await post(jar, ID, 'paid', { withdraw: true })).status).toBe(200);
    expect(await facts(ID)).toMatchObject({ state: 'owed', recorded_paid: null, solver_says: null });
    expect((await post(jar, ID, 'paid', { withdraw: true })).status).toBe(200);
    r.clock.at += MINUTE;
    await post(jar, ID, 'paid', {});
    expect((await facts(ID)).solver_says).toBeNull();
  });

  it('a withdrawal outranks an older chain record; a newer chain record outranks the withdrawal', async () => {
    r.standin.issues.find(entry => entry.id === ID)!.events = [{ v: 1, type: 'paid', at: ago(1), amount: 50, by: OWNER, withdrawn: false }];
    await reread();
    expect((await facts(ID)).recorded_paid.source).toBe('project-record');
    await post(await signIn(OWNER), ID, 'paid', { withdraw: true });
    expect((await facts(ID)).state).toBe('owed');
    r.standin.issues.find(entry => entry.id === ID)!.events!.push({ v: 1, type: 'paid', at: new Date(r.clock.at + DAY).toISOString(), amount: 50, by: OWNER, withdrawn: false });
    await reread();
    expect((await facts(ID)).state).toBe('recorded');
  });

  it('two merged: nobody named until the owner names one; a name not merged is refused; then only they can answer', async () => {
    const jar = await signIn(OWNER);
    expect(await facts(TWO)).toMatchObject({ state: 'owner-decides', owed: { to: null, to_one_of: ['example-fern', 'example-rook'] } });
    expect((await post(jar, TWO, 'paid', {})).status).toBe(400);
    expect((await post(jar, TWO, 'paid', { to: 'example-pike' })).status).toBe(400);
    expect(await clicks()).toBe(0);
    expect((await post(await signIn('example-rook'), TWO, 'receipt', { says: 'received' })).status).toBe(403);
    expect((await post(jar, TWO, 'paid', { to: 'example-rook' })).status).toBe(200);
    expect(await facts(TWO)).toMatchObject({ state: 'recorded', owed: { to: 'example-rook' }, recorded_paid: { chosen_by_owner_from: ['example-fern', 'example-rook'] } });
    expect((await post(jar, TWO, 'paid', { to: 'example-fern' })).status).toBe(409);
    expect((await post(await signIn('example-fern'), TWO, 'receipt', { says: 'received' })).status).toBe(403);
    expect((await post(await signIn('example-rook'), TWO, 'receipt', { says: 'received' })).status).toBe(200);
  });

  it('self-dealing on the routes: facts shown, counted nowhere, named on the owner\'s page', async () => {
    await post(await signIn('example-wren'), SELF, 'paid', {});
    expect((await facts(SELF)).excluded_from_counts).toMatchObject({ solver: 'example-wren', because: 'the solver is the poster' });
    const wren = await owner('example-wren');
    expect(wren.record).toMatchObject({ has_history: false, merged: 0, recorded_paid: 0 });
    expect(wren.not_counted).toHaveLength(1);
    expect(wren.bounties[0]).toMatchObject({ id: SELF, payment_state: 'recorded', not_counted: true });
    expect((await owner(OWNER)).bounties.find((row: any) => row.id === ID)).toMatchObject({ payment_state: 'owed', not_counted: false });
    expect((await solver('example-wren')).record.merged).toBe(0);
    expect((await owner('example-sol')).not_counted[0]).toMatchObject({ solver: 'example-fern', because: 'GitHub lists them as collaborator of the repository' });
    expect((await solver('example-fern')).merged.find((row: any) => row.id === LATE).counted).toBe(false);
  });

  it('a private repository: the click goes with everything else', async () => {
    await post(await signIn(OWNER), ID, 'paid', {});
    r.standin.repositories.get(repository)!.visibility = 'private';
    r.clock.at += 6 * MINUTE;
    expect((await send(null, `/bounties/${ID}.json`)).status).toBe(404);
    expect(await clicks()).toBe(0);
    expect((await owner(OWNER)).record.has_history).toBe(false);
  });

  describe('the feed, MCP and the board filter', () => {
    const ids = async (query: string) => (await (await send(null, `/bounties.json?${query}`)).json() as any).bounties.map((entry: any) => entry.id);
    const openFor = (id: string, poster: string, number: number) => { r.standin.issues.push(issue(id, number, poster, [])); };

    beforeEach(async () => {
      openFor('bt-bbbbbbbbbbb1', OWNER, 31);
      openFor('bt-bbbbbbbbbbb2', 'example-sol', 32);
      await reread();
    });

    it('an entry carries the owner\'s record, the same on the feed and MCP', async () => {
      await post(await signIn(OWNER), ID, 'paid', {});
      await post(await signIn(SOLVER), ID, 'receipt', { says: 'received' });
      const page = await (await send(null, '/bounties.json')).json() as any;
      const entry = page.bounties.find((row: any) => row.id === 'bt-bbbbbbbbbbb1');
      expect(entry.owner.record).toMatchObject({ has_history: true, merged: 2, recorded_paid: 1, confirmed_received: 1, from_solvers: 1, owed_now: 1 });
      const called = await (await send(null, '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_bounties', arguments: { owner_record: 'confirmed-payments' } } }) })).json() as any;
      expect(called.result.structuredContent.bounties.map((row: any) => row.id)).toEqual(expect.arrayContaining(['bt-bbbbbbbbbbb1']));
      expect(called.result.structuredContent.bounties.find((row: any) => row.id === 'bt-bbbbbbbbbbb1').owner.record).toEqual(entry.owner.record);
    });

    it('owner_record: each value, against owners worked out by hand', async () => {
      // example-mara: owes on two, nothing confirmed. example-sol: only a merge not counted. example-new: nothing.
      expect(await ids('owner_record=confirmed-payments')).toEqual([]);
      expect(await ids('owner_record=no-history')).toEqual(expect.arrayContaining(['bt-bbbbbbbbbbb2', 'bt-aaaaaaaaaaa5']));
      expect(await ids('owner_record=no-history')).not.toContain('bt-bbbbbbbbbbb1');
      await post(await signIn(OWNER), ID, 'paid', {});
      await post(await signIn(SOLVER), ID, 'receipt', { says: 'received' });
      expect(await ids('owner_record=confirmed-payments')).toEqual(['bt-bbbbbbbbbbb1']);
      expect(await ids('owner_record=confirmed-none-late')).toEqual(['bt-bbbbbbbbbbb1']);
      r.clock.at += 20 * DAY; // the other bounty, still owed, passes 14 days
      expect(await ids('owner_record=confirmed-none-late')).toEqual([]);
      expect(await ids('owner_record=confirmed-payments')).toEqual(['bt-bbbbbbbbbbb1']);
    });

    it('confirmed-none-late drops an owner a solver disputes', async () => {
      await post(await signIn(OWNER), TWO, 'paid', { to: 'example-rook' });
      await post(await signIn('example-rook'), TWO, 'receipt', { says: 'received' });
      await post(await signIn(OWNER), ID, 'paid', {});
      await post(await signIn(SOLVER), ID, 'receipt', { says: 'not-received' });
      expect(await ids('owner_record=confirmed-payments')).toEqual(['bt-bbbbbbbbbbb1']);
      expect(await ids('owner_record=confirmed-none-late')).toEqual([]);
    });

    it('a value not allowed is refused and names the next step', async () => {
      const answer = await send(null, '/bounties.json?owner_record=good');
      expect(answer.status).toBe(400);
      expect((await answer.json() as any).error).toContain('Next: one of confirmed-payments, confirmed-none-late, no-history');
    });

    it('the board\'s own list takes the filter and gives each card the record', async () => {
      const body = await (await send(null, '/api/board?owner_record=no-history')).json() as any;
      expect(body.bounties.map((row: any) => row.id)).toEqual(expect.arrayContaining(['bt-bbbbbbbbbbb2']));
      expect(body.bounties.every((row: any) => row.record.has_history === false)).toBe(true);
    });
  });

  it('words: nothing on any payment surface says funded, guaranteed or escrow as a claim', async () => {
    await post(await signIn(OWNER), ID, 'paid', {});
    await post(await signIn(SOLVER), ID, 'receipt', { says: 'not-received' });
    const paths = [`/bounties/${ID}.json`, `/bounties/${TWO}.json`, `/api/b/${ID}/payment`, `/api/owner/${OWNER}`, `/api/solver/${SOLVER}`, '/bounties.json', '/api/board'];
    for (const path of paths) {
      const text = await (await send(null, path)).text();
      for (const sentence of text.split(/(?<=[.!?])\s+|"/)) if (/\b(funded|guarantee[sd]?|escrow)\b/i.test(sentence)) expect(sentence).toMatch(/\b(never|not|no)\b/i);
    }
  });
});
