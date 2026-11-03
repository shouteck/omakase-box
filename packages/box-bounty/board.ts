// PF5 — the tool and the board. No command and no credential: after a change
// the tool says "look now" with identifiers only, and `status` and the pay
// message read the board's public answers. An empty address starts nothing,
// and nothing here can stop or fail a command: the board is never the record.
// A stranger can run a board, so every answer is checked before it is kept.

import { spawnSync } from 'node:child_process';
import { CHARGE_WORDS, PAYPAL_WORDS } from '../box-platform/src/charge-words.js';
import { acceptsShape, checkedAccepts, checkedWays, methodWords, paymentOf, type PayAccepts } from './pay.js';
import { isOpenStage, listRecords, type BountyRecord } from './record.js';
import { loadSettings } from './settings.js';
import { metaGet, metaKeys, metaSet, sharedEnded, sharedOpen } from './store.js';
import { solverAccount } from './untrusted.js';
import { quoteForeign } from './notice.js';

/** The public deployment's address. Settings choose another or none; no test run may reach it (boardAddress). */
export const BOARD_DEFAULT = 'https://open-bounty-board.box-platform.workers.dev';

const DEADLINE_MS = 2500;
const ANSWER_BYTES_MAX = 65536;
const HINTS_PER_COMMAND = 10;
const READS_PER_COMMAND = 5;
const ENDED_SHOWN = 5;
const READ_FRESH_MS = 300000; // The board itself says polling faster gains nothing.

const HINT_PREFIX = 'board_hint:';
const HINT_ERROR = 'board_hint_error';
const readKey = (id: string): string => `board_read:${id}`;

// Calls are off inside a hook: its time budget is stated (HOOK_GITHUB_BUDGET_MS).
let held = false;
export function holdBoardCalls(): void { held = true; }

export function boardAddress(): string {
  // Settings kept elsewhere mean a test or a trial: the live board is only ever named, not assumed.
  const fallback = process.env['BOX_BOARD_DEFAULT'] ?? (process.env['BOX_BOUNTY_SETTINGS_DIR'] === undefined ? BOARD_DEFAULT : '');
  try { return loadSettings().board ?? fallback; } catch { return ''; }
}
const boardOn = (): boolean => !held && boardAddress() !== '';

// ---- the one way out -------------------------------------------------------

type Call = { readonly path: string; readonly body?: string };
type Reply = { readonly status: number; readonly text: string } | { readonly failed: string };

// One child for a batch, like every other outside call here (gh, git): the
// library is synchronous. It gets no environment beyond what Windows needs for
// a socket, follows no redirect, and its answers are cut at a stated size.
const CHILD = `
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', async () => {
  const { calls, deadline, max } = JSON.parse(input);
  const end = Date.now() + deadline;
  const replies = [];
  for (const call of calls) {
    const left = end - Date.now();
    if (left <= 0) { replies.push({ failed: 'it took too long' }); continue; }
    try {
      const response = await fetch(call.url, {
        method: call.body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(left),
        headers: { accept: 'application/json', 'user-agent': 'box-bounty', ...(call.body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(call.body === undefined ? {} : { body: call.body })
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      replies.push(bytes.length > max ? { failed: 'its answer was too large' } : { status: response.status, text: new TextDecoder().decode(bytes) });
    } catch (error) {
      replies.push({ failed: error && error.name === 'TimeoutError' ? 'it took too long' : 'it could not be reached' });
    }
  }
  process.stdout.write(JSON.stringify(replies));
});
`;

function boardCalls(calls: readonly Call[], max = ANSWER_BYTES_MAX): readonly Reply[] {
  const origin = boardAddress();
  const unreachable = (): Reply[] => calls.map(() => ({ failed: 'it could not be reached' }));
  try {
    const run = spawnSync(process.execPath, ['-e', CHILD], {
      input: JSON.stringify({ calls: calls.map(call => ({ url: `${origin}${call.path}`, body: call.body })), deadline: DEADLINE_MS, max }),
      encoding: 'utf8', timeout: DEADLINE_MS + 1500, windowsHide: true, maxBuffer: max * (calls.length + 1) * 7,
      env: process.platform === 'win32' && process.env['SYSTEMROOT'] !== undefined ? { SYSTEMROOT: process.env['SYSTEMROOT'] } : {}
    });
    if (run.status !== 0) return unreachable();
    const replies: unknown = JSON.parse(run.stdout);
    return Array.isArray(replies) && replies.length === calls.length ? replies as Reply[] : unreachable();
  } catch { return unreachable(); }
}

const jsonOf = (reply: Reply): Record<string, unknown> | null => {
  if ('failed' in reply || reply.status !== 200) return null;
  try {
    const value: unknown = JSON.parse(reply.text);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
};

/** One page of the board's feed (PF24's discover): its answer, or why it was not read. A page is at most 100 KB, the board's own stated bound. */
const FEED_PAGE_BYTES_MAX = 100_000;
export function readFeedPage(query: string): { readonly page: Record<string, unknown> } | { readonly failed: string } {
  if (boardAddress() === '') return { failed: 'the board is off' };
  const reply = boardCalls([{ path: `/bounties.json?${query}` }], FEED_PAGE_BYTES_MAX)[0]!;
  if ('failed' in reply) return { failed: reply.failed };
  const page = jsonOf(reply);
  if (page !== null) return { page };
  if (reply.status === 400) {
    try { const error = (JSON.parse(reply.text) as { error?: unknown }).error; if (typeof error === 'string') return { failed: `the board refused: ${quoteForeign(error.slice(0, 200))}` }; } catch { /* unreadable: said below */ }
  }
  return { failed: reply.status !== 200 ? `the board answered ${reply.status}` : 'its answer was unreadable' };
}

// ---- hints -----------------------------------------------------------------

export type HintEvent = 'posted' | 'merged' | 'closed' | 'paid';
export interface Hint { readonly repository: string; readonly issue: number; readonly bounty: string; readonly event: HintEvent }

const ID = /^bt-[a-f\d]{12}$/;
const REPOSITORY = /^[A-Za-z\d-]{1,39}\/[A-Za-z\d._-]{1,100}$/;
const EVENTS: readonly unknown[] = ['posted', 'merged', 'closed', 'paid'];

// The whole of what a hint may say, field by field: this is the allow-list,
// and everything sent or kept passes through it.
export function hintOf(repository: unknown, issue: unknown, bounty: unknown, event: unknown): Hint | null {
  if (typeof repository !== 'string' || !REPOSITORY.test(repository)) return null;
  if (typeof issue !== 'number' || !Number.isSafeInteger(issue) || issue < 1) return null;
  if (typeof bounty !== 'string' || !ID.test(bounty) || !EVENTS.includes(event)) return null;
  return { repository, issue, bounty, event: event as HintEvent };
}

// Called where a change becomes shared (chain.ts). A repeat overwrites itself.
export function queueBoardHint(root: string, record: BountyRecord, event: HintEvent): void {
  if (boardAddress() === '') return;
  try {
    const hint = hintOf(record.github?.repository, record.github?.issue?.number, record.id, event);
    if (hint === null) return;
    metaSet(root, `${HINT_PREFIX}${hint.bounty}:${hint.event}`, JSON.stringify(hint));
    metaSet(root, readKey(hint.bounty), null); // what was read before this change is out of date
  } catch { /* the board is never a reason a command fails */ }
}

export interface BoardTold { readonly pending: number; readonly reason: string | null }

export function boardTold(root: string): BoardTold {
  try {
    const pending = boardAddress() === '' ? 0 : metaKeys(root, HINT_PREFIX).length;
    return { pending, reason: pending === 0 ? null : metaGet(root, HINT_ERROR) ?? 'it has not been tried yet' };
  } catch { return { pending: 0, reason: null }; }
}

// Sends what is queued. What the board took, or refused as unreadable, goes;
// everything else stays for the next command.
export function flushBoardHints(root: string): BoardTold {
  if (!boardOn()) return boardTold(root);
  try {
    const keys = metaKeys(root, HINT_PREFIX).slice(0, HINTS_PER_COMMAND);
    if (keys.length === 0) return boardTold(root);
    const sendable = keys.flatMap(key => {
      let stored: Record<string, unknown> = {};
      try { stored = JSON.parse(metaGet(root, key) ?? '{}') as Record<string, unknown>; } catch { /* not a hint: dropped below */ }
      const hint = hintOf(stored['repository'], stored['issue'], stored['bounty'], stored['event']);
      if (hint === null) { metaSet(root, key, null); return []; }
      return [{ key, hint }];
    });
    // One look reads the whole bounty, so one hint per bounty is enough: a
    // second would only be refused as too soon and stay queued.
    const once = sendable.filter(({ hint }, index) => sendable.findIndex(other => other.hint.bounty === hint.bounty) === index);
    if (once.length === 0) return boardTold(root);
    const replies = boardCalls(once.map(({ hint }) => ({ path: '/api/hint', body: JSON.stringify(hint) })));
    let reason: string | null = null;
    once.forEach(({ hint }, index) => {
      const reply = replies[index]!;
      if ('failed' in reply) reason = reason ?? reply.failed;
      else if (reply.status === 429) reason = reason ?? 'it asked the tool to wait';
      else if (reply.status >= 500) reason = reason ?? `it answered ${reply.status}`;
      else for (const { key } of sendable) if (key.startsWith(`${HINT_PREFIX}${hint.bounty}:`)) metaSet(root, key, null);
    });
    metaSet(root, HINT_ERROR, reason);
  } catch { /* the board is never a reason a command fails */ }
  return boardTold(root);
}

export const boardNotToldLine = (told: BoardTold): string | null =>
  told.pending === 0 ? null : `the board has not been told yet: ${told.reason}; next: any later command sends it again`;

// ---- what the board says about a person ------------------------------------

const LOGIN = /^[a-z\d][a-z\d-]{0,38}(?:\[bot\])?$/i;
const pagePath = (id: string): string => `/b/${id}/`;

function acceptsFrom(reply: Reply): PayAccepts | null {
  const profile = jsonOf(reply);
  if (profile === null) return null;
  const accepts = checkedAccepts(profile['methods'], profile['methods_more']);
  const ways = checkedWays(profile['ways_set_up'], profile['takes'], boardAddress());
  return accepts === null || ways === undefined ? accepts : { ...accepts, ways };
}

// The pay message's read, once, at close. Null: the board is off, and today's
// message stands. `unread` says it was not read, and where to look.
export function readPayAccepts(solver: string | null): PayAccepts | undefined {
  if (solver === null || !LOGIN.test(solver) || boardAddress() === '') return undefined;
  const page = `${boardAddress()}/solver/${solverAccount(solver)}/`;
  if (held) return { methods: [], more: 0, unreadAt: page };
  return acceptsFrom(boardCalls([{ path: `/api/solver/${encodeURIComponent(solver)}` }])[0]!) ?? { methods: [], more: 0, unreadAt: page };
}

// ---- pay on merge, as the board reports it (PF20) ----------------------------

const PAY_ON_MERGE_SHOWN = 10;

// The one step only the owner's signed-in page takes: its state, as the board
// says it, and the page. This tool reads it and never changes it.
export function payOnMergeLines(repositories: readonly string[]): string[] {
  const board = boardAddress();
  if (board === '' || repositories.length === 0) return [];
  const page = `${board}/me/#pay`;
  const shown = repositories.slice(0, PAY_ON_MERGE_SHOWN);
  const cannot = 'this tool cannot change it';
  const replies = held ? shown.map((): Reply => ({ failed: 'not read in this command' })) : boardCalls(shown.map(repository => ({ path: `/api/pay-on-merge?repository=${encodeURIComponent(repository)}` })));
  return shown.map((repository, index) => {
    const reply = replies[index]!;
    const answer = jsonOf(reply);
    if (answer === null || answer['repository'] !== repository || typeof answer['set_up'] !== 'boolean' || !Array.isArray(answer['on_for'])) {
      return `pay on merge on ${repository}: not read (${'failed' in reply ? reply.failed : reply.status !== 200 ? `the board answered ${reply.status}` : 'its answer was unreadable'}); see or turn it on at ${page}; ${cannot}`;
    }
    if (answer['set_up'] === false) return `pay on merge on ${repository}: not set up on this board; owners pay by hand or with one click`;
    const on = (answer['on_for'] as unknown[]).filter((login): login is string => typeof login === 'string' && LOGIN.test(login));
    return on.length === 0
      ? `pay on merge on ${repository}: off — only your signed-in page turns it on, with a saved card and the reward each bounty is paid: ${page}; ${cannot}`
      : `pay on merge on ${repository}: on for ${on.join(', ')} — when one solution lands, the board charges the saved card the reward approved there; change it at ${page}; ${cannot}`;
  });
}

// ---- what the board says about a bounty -------------------------------------

const PAYMENT_STATES = ['no-reward', 'nothing-owed', 'merged-not-on-default', 'owed', 'owner-decides', 'recorded', 'confirmed', 'says-not-received'] as const;
type PaymentState = typeof PAYMENT_STATES[number];

export type BoardFact =
  | { readonly kind: 'unreachable'; readonly at: string; readonly reason: string }
  | { readonly kind: 'not-listed'; readonly at: string }
  | {
    readonly kind: 'listed'; readonly at: string; readonly page: string; readonly solutions: number; readonly payment: PaymentState;
    readonly amount: number | null; readonly to: string | null; readonly toOneOf: readonly string[]; readonly since: string | null; readonly pullRequest: number | null;
    readonly recordedBy: string | null; readonly recordedAt: string | null; readonly solverBy: string | null; readonly solverSays: string | null; readonly solverAt: string | null;
    readonly accepts: PayAccepts | null; readonly charge?: string | null; readonly stripe?: boolean; readonly paypal?: boolean; readonly paypalCharge?: boolean;
  };

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const loginOr = (value: unknown): string | null => typeof value === 'string' && LOGIN.test(value) ? value : null;
const dayOr = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const countOr = (value: unknown): number | null => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;

// Only named fields, each checked; the address is built here, never taken from the answer.
function factFrom(id: string, detail: Record<string, unknown>, at: string): BoardFact | null {
  const bounty = detail['bounty'];
  if (!isObject(bounty) || bounty['id'] !== id || !isObject(bounty['solutions']) || !isObject(bounty['payment'])) return null;
  const solutions = countOr(bounty['solutions']['total']);
  const payment = bounty['payment'];
  const state = PAYMENT_STATES.find(entry => entry === payment['state']);
  if (solutions === null || state === undefined) return null;
  const owed = isObject(payment['owed']) ? payment['owed'] : {};
  const recorded = isObject(payment['recorded_paid']) ? payment['recorded_paid'] : {};
  const says = isObject(payment['solver_says']) ? payment['solver_says'] : {};
  const to = loginOr(owed['to']);
  const list = Array.isArray(bounty['solution_list']) ? bounty['solution_list'] as unknown[] : [];
  const pull = list.find(entry => isObject(entry) && to !== null && typeof entry['author'] === 'string' && entry['author'].toLowerCase() === to.toLowerCase() && typeof entry['merged_at'] === 'string');
  return {
    kind: 'listed', at, page: `${boardAddress()}${pagePath(id)}`, solutions, payment: state,
    amount: countOr(owed['amount']), to,
    toOneOf: Array.isArray(owed['to_one_of']) ? owed['to_one_of'].flatMap(name => loginOr(name) ?? []).slice(0, 10) : [],
    since: dayOr(owed['since']), pullRequest: isObject(pull) ? countOr(pull['number']) : null,
    recordedBy: loginOr(recorded['by']), recordedAt: dayOr(recorded['at']),
    solverBy: loginOr(says['by']), solverSays: says['word'] === 'received' || says['word'] === 'not-received' ? says['word'] : null, solverAt: dayOr(says['at']),
    accepts: null,
    // The tool's own words for a state it knows; anything else a board sends is left out.
    charge: isObject(payment['charge']) && typeof payment['charge']['state'] === 'string' && Object.hasOwn(CHARGE_WORDS, payment['charge']['state']) ? payment['charge']['state'] : null,
    stripe: recorded['source'] === 'stripe',
    paypal: recorded['source'] === 'paypal',
    paypalCharge: isObject(payment['charge']) && payment['charge']['whose_word'] === 'the board\'s, from PayPal\'s answer'
  };
}

function storedFact(root: string, id: string): BoardFact | null {
  try {
    const value: unknown = JSON.parse(metaGet(root, readKey(id)) ?? 'null');
    // A kept copy is read like an answer: a list of methods that fails its shape reads as not read.
    if (!isObject(value) || typeof value['kind'] !== 'string') return null;
    return value['accepts'] === undefined || value['accepts'] === null || acceptsShape(value['accepts']) ? value as unknown as BoardFact : null;
  } catch { return null; }
}

const postedOnGitHub = (record: BountyRecord): boolean => record.github !== undefined && record.github.issue !== null;

// Which bounties `status` speaks about: every open posted one, and the most
// recently merged rewarded ones. A stated bound on unasked text.
export function boardScope(root: string): readonly BountyRecord[] {
  const local = listRecords(root).flatMap(entry => entry.record === null ? [] : [entry.record]);
  const known = new Set(local.map(record => record.id));
  const all = [...local, ...sharedOpen(root), ...sharedEnded(root)].filter((record, index, list) => (record.shared !== true || !known.has(record.id)) && list.findIndex(other => other.id === record.id) === index);
  const open = all.filter(record => isOpenStage(record.stage) && postedOnGitHub(record));
  const merged = all.filter(record => paymentOf(record) !== null)
    .sort((a, b) => (b.events.at(-1)?.at ?? '').localeCompare(a.events.at(-1)?.at ?? ''))
    .slice(0, ENDED_SHOWN);
  return [...open, ...merged];
}

// Before `status` prints: reads what is not fresh, stalest first, and keeps
// checked facts for the renderer, which reads only what is kept.
export function readBoardFacts(root: string, onlyId?: string): void {
  if (!boardOn()) return;
  try {
    const now = Date.now();
    const stale = boardScope(root)
      .filter(record => onlyId === undefined || record.id === onlyId)
      .map(record => ({ id: record.id, fact: storedFact(root, record.id) }))
      .filter(({ fact }) => fact === null || fact.kind !== 'listed' || now - Date.parse(fact.at) >= READ_FRESH_MS)
      .sort((a, b) => (a.fact?.at ?? '').localeCompare(b.fact?.at ?? ''))
      .slice(0, READS_PER_COMMAND);
    if (stale.length === 0) return;
    const at = new Date(now).toISOString();
    const replies = boardCalls(stale.map(({ id }) => ({ path: `/bounties/${id}.json` })));
    const facts = stale.map(({ id }, index): { id: string; fact: BoardFact } => {
      const reply = replies[index]!;
      if ('failed' in reply) return { id, fact: { kind: 'unreachable', at, reason: reply.failed } };
      if (reply.status === 404) return { id, fact: { kind: 'not-listed', at } };
      const detail = jsonOf(reply);
      const fact = detail === null ? null : factFrom(id, detail, at);
      return { id, fact: fact ?? { kind: 'unreachable', at, reason: reply.status === 200 ? 'its answer could not be read' : `it answered ${reply.status}` } };
    });
    // Whom to pay and how, read once per person this command.
    const owedTo = [...new Set(facts.flatMap(({ fact }) => fact.kind === 'listed' && fact.payment === 'owed' && fact.to !== null ? [fact.to] : []))];
    const profiles = owedTo.length === 0 ? [] : boardCalls(owedTo.map(login => ({ path: `/api/solver/${encodeURIComponent(login)}` })));
    const accepts = new Map(owedTo.map((login, index) => [login, acceptsFrom(profiles[index]!)]));
    for (const { id, fact } of facts) {
      const whole = fact.kind === 'listed' && fact.to !== null ? { ...fact, accepts: accepts.get(fact.to) ?? null } : fact;
      metaSet(root, readKey(id), JSON.stringify(whole));
    }
  } catch { /* the board is never a reason a command fails */ }
}

export function boardFact(root: string, record: BountyRecord): BoardFact | null {
  if (boardAddress() === '') return null;
  try { return boardScope(root).some(entry => entry.id === record.id) ? storedFact(root, record.id) : null; } catch { return null; }
}

const day = (at: string | null): string => at?.slice(0, 10) ?? 'an unstated date';

// One line per bounty, K43's words. The board's facts are attributed; the
// tool says nothing of its own about them.
export function boardLine(root: string, record: BountyRecord): string | null {
  if (boardAddress() === '' || !boardScope(root).some(entry => entry.id === record.id)) return null;
  const fact = storedFact(root, record.id);
  if (fact === null) return `board: not read yet; next: box bounty status ${record.id}`;
  if (fact.kind === 'unreachable') return `board: not reachable (${fact.reason}); next: any command when online`;
  if (fact.kind === 'not-listed') return `board: not listed yet — it reads GitHub every 15 minutes; next: box bounty status ${record.id} later`;
  const name = (login: string | null): string => login === null ? 'an account whose name could not be read' : solverAccount(login);
  const record_it = record.shared === true ? '' : `; record it: box bounty config set paid ${record.id}`;
  const state = fact.charge as keyof typeof CHARGE_WORDS | null | undefined;
  const words = (state ?? null) === null ? undefined : (fact.paypalCharge === true ? PAYPAL_WORDS[state!] : undefined) ?? CHARGE_WORDS[state!];
  const chargeLine = words === undefined ? '' : `; payment: ${words}`;
  const provider = fact.stripe === true ? 'Stripe' : fact.paypal === true ? 'PayPal' : null;
  if (provider !== null) return `board: paid $${fact.amount ?? '?'} to ${name(fact.to)} through ${provider} on ${day(fact.recordedAt)}, ${provider}'s word${chargeLine} · ${fact.page}`;
  if (chargeLine !== '' && fact.payment !== 'confirmed') return `${boardCase(fact, name, record, record_it)}${chargeLine}`;
  return boardCase(fact, name, record, record_it);
}

function boardCase(fact: Extract<BoardFact, { kind: 'listed' }>, name: (login: string | null) => string, record: BountyRecord, record_it: string): string {
  switch (fact.payment) {
    case 'owed': {
      const accepts = fact.accepts;
      const methods = accepts === null ? 'accepts: not read' : accepts.methods.length === 0 && accepts.more === 0 ? 'accepts: none listed; ask them on the issue' : [
        ...(accepts.methods.length > 0 ? [`accepts: ${methodWords(accepts).join(', ')}`] : []),
        ...(accepts.more > 0 ? [`${accepts.more} more shown to you on the bounty page`] : [])
      ].join('; ');
      return `board: owed $${fact.amount ?? '?'} to ${name(fact.to)} since ${day(fact.since)}${fact.pullRequest === null ? '' : ` (merged PR #${fact.pullRequest})`}; ${methods}${record_it}`;
    }
    case 'owner-decides': return `board: owed $${fact.amount ?? '?'} to one of ${fact.toOneOf.map(name).join(', ')} since ${day(fact.since)}; the owner decides which${record_it}`;
    case 'merged-not-on-default': return `board: merged; not yet confirmed on the default branch, so not shown as owed · ${fact.page}`;
    case 'recorded': return `board: recorded paid $${fact.amount ?? '?'} by ${name(fact.recordedBy)} on ${day(fact.recordedAt)}, the owner's word; not confirmed by ${name(fact.to)} · ${fact.page}`;
    case 'confirmed': return `board: recorded paid $${fact.amount ?? '?'} on ${day(fact.recordedAt)}; confirmed received by ${name(fact.solverBy)} on ${day(fact.solverAt)}, the solver's word · ${fact.page}`;
    case 'says-not-received': return `board: recorded paid $${fact.amount ?? '?'} on ${day(fact.recordedAt)}; ${name(fact.solverBy)} says not received, on ${day(fact.solverAt)}; the board does not decide · ${fact.page}`;
    default: return `board: listed (${record.github?.repository ?? 'this repository'}, ${fact.solutions} solution(s)) · ${fact.page}`;
  }
}
