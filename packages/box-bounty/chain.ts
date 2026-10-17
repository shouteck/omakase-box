// The shared bounty memory (BT32): one Git ref per bounty,
// `refs/box-bounty/<id>`, each event one commit whose tree holds a single
// blob `event.json`. The shape is git-bug's DAG entity as K28 designed it —
// append-only event commits, empty `merge` events joining diverged tips,
// fast-forward pushes only, fetched into `refs/remotes/origin/box-bounty/*`.
// Step 0 proved every operation on real GitHub (kitchen/memory/delegation/
// evidence/bt32-step0.txt).
//
// Trust (brief decision 2): only chains fetched from the configured remote
// count — a local ref under refs/box-bounty/ that never came from it is
// ignored, and every event off the remote is validated against the
// allow-list, its field types and the 8,000-character bound before it is
// imported. Writing never touches the working tree, the index or a branch:
// blob, tree and commit are objects only; the ref moves by update-ref.
//
// Events are built by allow-list projection — only the fields the event
// table names are copied out of the record. Every specified text field
// passes the same secret scan a publish does BEFORE the event object is
// written; a hit holds the event exactly as a publish hit holds a post.

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { git, gitOutcome, gitRefsWrite, gitStdin, gitWriteBlob } from './git.js';
import { isObject } from './gh.js';
import { emitMergeNotice } from './notice.js';
import type { Attempt, BountyRecord } from './record.js';
import { scanText } from './scan.js';
import { loadState, requireRepository, saveState } from './settings.js';
import { importShared, metaGet, metaKeys, metaSet } from './store.js';
import type { SharedRow } from './store.js';

export const CHAIN_NS = 'refs/box-bounty';
export const CHAIN_REMOTE_NS = 'refs/remotes/origin/box-bounty';
export const chainRef = (id: string): string => `${CHAIN_NS}/${id}`;
const remoteRef = (id: string): string => `${CHAIN_REMOTE_NS}/${id}`;
const FETCH_INTERVAL_MS = 60000;
const FIELD_LIMIT = 8000;
const PUSH_TRIES = 3;
// Only exact bounty ids take part in the namespace — `refs/box-bounty/<id>
// -github` and `<id>-answer-<n>` are local durability refs, never chains.
const CHAIN_ID = /^bt-[a-f\d]{12}$/;

// The shared event schema (v: 1). Every field outside this table — common
// plus the event's own — makes the event invalid on import, and a writer
// never emits one.
const EVENT_FIELDS: Record<string, readonly string[]> = {
  posted: ['id', 'title', 'task', 'why', 'partOf', 'followup', 'base', 'branch', 'issue', 'published', 'reward', 'allowedBy'],
  solution: ['n', 'pullRequest', 'author', 'commit', 'changed', 'added', 'deleted', 'payTo'],
  merged: ['n', 'mergeCommit', 'unasked'],
  closed: ['kind', 'reason', 'unasked'],
  paid: ['amount', 'by', 'withdrawn'],
  merge: []
};
const COMMON_FIELDS = ['v', 'type', 'at', 'actor'];
// The event's free-text fields, scanned for secret-shaped content before
// the object is written (the publish scan's own rules, one line at a time).
const SCANNED_FIELDS = ['title', 'task', 'why', 'partOf', 'followup', 'reason'];

// ---------------------------------------------------------------------------
// Event objects: building (allow-list projection) and validation.
// ---------------------------------------------------------------------------

type ChainEvent = Record<string, unknown>;

const scanHold = (fields: Record<string, string | null | undefined>): void => {
  const hits = Object.entries(fields).flatMap(([name, text]) =>
    text === undefined || text === null ? [] : scanText(`event ${name}`, text).map(hit => ({ name, ...hit })));
  if (hits.length === 0) return;
  throw new BountyRefused('publish-held', [
    `the shared bounty memory event was held — ${hits.length} secret-shaped hit(s) in its text:`,
    ...hits.map(hit => `  ${hit.name}:${hit.line} — ${hit.rule}`),
    'nothing was written to the chain and nothing was pushed. The scan is a stated pattern list, not proof of absence.'
  ].join('\n'));
};

// Validation of one parsed event.json off the remote: schema v1, a known
// type, only allow-listed fields, and every string under the bound. Types
// are per-field: strings, safe integers, string arrays, and posted's two
// nested fact objects.
function validEvent(value: unknown): value is ChainEvent {
  if (!isObject(value)) return false;
  if (value['v'] !== 1 || typeof value['type'] !== 'string' || EVENT_FIELDS[value['type']] === undefined) return false;
  if (value['type'] === 'merge') {
    // A merge commit carries {v, type} and nothing else.
    return Object.keys(value).every(key => key === 'v' || key === 'type');
  }
  const allowed = new Set([...COMMON_FIELDS, ...EVENT_FIELDS[value['type']]!]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) return false;
  if (typeof value['at'] !== 'string' || value['at'].length > 64) return false;
  if (value['actor'] !== undefined && (typeof value['actor'] !== 'string' || (value['actor'] as string).length > 64)) return false;
  const check = (item: unknown, depth: number): boolean => {
    if (item === null || item === undefined) return true;
    if (typeof item === 'string') return item.length <= FIELD_LIMIT;
    if (typeof item === 'number') return Number.isSafeInteger(item);
    if (typeof item === 'boolean') return true;
    if (depth > 2) return false;
    if (Array.isArray(item)) return item.length <= 1000 && item.every(entry => typeof entry === 'string' ? (entry as string).length <= FIELD_LIMIT : check(entry, depth + 1));
    if (isObject(item)) return Object.keys(item).length <= 40 && Object.values(item).every(entry => check(entry, depth + 1));
    return false;
  };
  return Object.values(value).every(entry => check(entry, 0));
}

// ---------------------------------------------------------------------------
// Chain plumbing: event commits by object writes alone.
// ---------------------------------------------------------------------------

const tipOf = (root: string, ref: string): string | null => {
  const found = gitOutcome(root, ['rev-parse', '-q', '--verify', ref]);
  const sha = found.stdout.trim();
  return found.status === 0 && /^[a-f\d]{40}$/.test(sha) ? sha : null;
};

// Does this commit look like one of ours — a tree carrying event.json?
const isChainCommit = (root: string, sha: string): boolean =>
  gitOutcome(root, ['cat-file', '-e', `${sha}:event.json`]).status === 0;

const IDENTITY = ['-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost'];

// Write one event commit: tree = {event.json: <blob>}, parents given; the
// local chain ref moves to it. Working tree, index and branches untouched.
function commitEvent(root: string, id: string, eventJson: string, parents: readonly string[]): string {
  const blob = gitWriteBlob(root, Buffer.from(eventJson, 'utf8'));
  const tree = gitStdin(root, ['mktree'], `100644 blob ${blob}\tevent.json\n`);
  const args = [...IDENTITY, 'commit-tree', tree, '-m', `box-bounty ${id} chain event`];
  for (const parent of parents) args.push('-p', parent);
  const commit = git(root, args);
  gitRefsWrite(root, [{ update: chainRef(id), sha: commit }]);
  return commit;
}

// Append a built event onto the local chain. The parent is the current tip
// only when it is itself a chain commit — an old `refs/box-bounty/<id>`
// snapshot pin (pre-BT24 records) is not chain history and never parents
// the first event.
export function appendEvent(root: string, id: string, event: ChainEvent): string {
  const tip = tipOf(root, chainRef(id));
  const parent = tip !== null && isChainCommit(root, tip) ? [tip] : [];
  return commitEvent(root, id, JSON.stringify(event) + '\n', parent);
}

// git-bug's merge of the remote-tracking tip into the local chain:
// identical/ahead do nothing, behind fast-forwards, diverged writes one
// empty merge event with both tips as parents.
function mergeRemoteTip(root: string, id: string): 'new' | 'identical' | 'ahead' | 'ff' | 'merged' | 'none' {
  const local = tipOf(root, chainRef(id));
  const remote = tipOf(root, remoteRef(id));
  if (remote === null) return 'none';
  if (local === null || !isChainCommit(root, local)) {
    gitRefsWrite(root, [{ update: chainRef(id), sha: remote }]);
    return 'new';
  }
  if (local === remote) return 'identical';
  if (gitOutcome(root, ['merge-base', '--is-ancestor', remote, local]).status === 0) return 'ahead';
  if (gitOutcome(root, ['merge-base', '--is-ancestor', local, remote]).status === 0) {
    gitRefsWrite(root, [{ update: chainRef(id), sha: remote }]);
    return 'ff';
  }
  commitEvent(root, id, JSON.stringify({ v: 1, type: 'merge' }) + '\n', [local, remote]);
  return 'merged';
}

// ---------------------------------------------------------------------------
// Pushing: fast-forward only, three tries, empty-merge resolution.
// ---------------------------------------------------------------------------

// The shared memory travels over the repository's own remote — the same
// trust surface the branch push uses (a URL, never a named remote the
// checkout could point elsewhere). An unsettled repository simply has
// nothing to sync: reads go on without a word.
const remoteUrl = (root: string): string | null => {
  try { return `https://github.com/${requireRepository(root)}.git`; } catch { return null; }
};

const pushOnce = (root: string, url: string, id: string): boolean =>
  gitOutcome(root, ['push', url, `${chainRef(id)}:${chainRef(id)}`]).status === 0;

const fetchOne = (root: string, url: string, id: string): void => {
  gitOutcome(root, ['fetch', '--no-tags', '--prune', url, `+${chainRef(id)}:${remoteRef(id)}`]);
};

export interface PushResult { readonly pushed: boolean; readonly reason?: string; readonly restored?: boolean }

// Push one chain. On a non-fast-forward answer: fetch the remote tip, fold
// it into the local chain (ff or an empty merge commit) and push again —
// at most PUSH_TRIES attempts before the push waits for the next command.
export function pushChain(root: string, id: string): PushResult {
  const url = remoteUrl(root);
  if (url === null) { metaSet(root, `chain_pending:${id}`, '1'); return { pushed: false, reason: 'the repository remote is not settled' }; }
  const pushedBefore = metaGet(root, `chain_pushed:${id}`) !== null;
  let restored = false;
  for (let attempt = 1; attempt <= PUSH_TRIES; attempt += 1) {
    if (pushOnce(root, url, id)) {
      const now = tipOf(root, remoteRef(id)) ?? tipOf(root, chainRef(id));
      if (now !== null) metaSet(root, `chain_pushed:${id}`, now);
      metaSet(root, `chain_pending:${id}`, null);
      return { pushed: true, restored };
    }
    fetchOne(root, url, id);
    const remote = tipOf(root, remoteRef(id));
    if (remote === null) {
      // The remote ref is gone while this machine pushed it before: the
      // next push attempt restores it (recovery), and the caller says so once.
      restored = restored || pushedBefore;
      continue;
    }
    mergeRemoteTip(root, id);
  }
  metaSet(root, `chain_pending:${id}`, '1');
  return { pushed: false, reason: 'the remote chain moved each time (non-fast-forward)' };
}

// ---------------------------------------------------------------------------
// Milestone events: build by allow-list projection, scan, append, push.
// ---------------------------------------------------------------------------

const actorOf = (record: BountyRecord): string => record.github?.account ?? 'unknown';

function share(root: string, record: BountyRecord, scanned: Record<string, string | null | undefined>, event: ChainEvent): PushResult | 'held' {
  // The scan runs before anything is built into an object or written: a hit
  // holds the whole event exactly as a publish hit holds a post.
  scanHold(scanned);
  appendEvent(root, record.id, event);
  const result = pushChain(root, record.id);
  if (!result.pushed) emitMergeNotice(`shared bounty memory not pushed yet (${result.reason}); it will be retried`);
  else if (result.restored === true) emitMergeNotice(`shared bounty memory for ${record.id} was gone from the remote — restored from this machine`);
  return result;
}

// `posted` — at a successful post. `task` is the text as published; `followup`
// is the --resume note (the larger job and where it stood).
export function sharePosted(root: string, record: BountyRecord, task: string): PushResult | 'held' {
  const publication = record.github;
  if (publication === undefined || publication.issue === null) return 'held';
  const followup = record.resume?.kind === 'recorded' ? record.resume.note : null;
  const event: ChainEvent = {
    v: 1, type: 'posted', at: new Date().toISOString(), actor: actorOf(record),
    id: record.id, title: record.title, task,
    ...(record.why !== undefined ? { why: record.why } : {}),
    ...(record.partOf !== undefined ? { partOf: record.partOf } : {}),
    ...(followup !== null && followup !== undefined ? { followup } : {}),
    base: publication.base ?? publication.commit,
    branch: publication.branch,
    issue: { number: publication.issue.number, url: publication.issue.url },
    published: {
      pushed: (publication.pushed ?? []).map(commit => ({ sha: commit.sha, subject: commit.subject })),
      ...(publication.wip !== undefined && publication.wip !== null ? { wip: publication.wip } : {})
    },
    ...(record.reward !== undefined ? { reward: { amount: record.reward.amount, currency: 'USD' } } : {}),
    ...(record.allowedBy !== undefined ? { allowedBy: { decision: record.allowedBy.decision, level: record.allowedBy.level } } : {})
  };
  return share(root, record, { title: record.title, task, why: record.why, partOf: record.partOf, followup }, event);
}

// `solution` — when a pull request is collected (look, apply, status refresh).
export function shareSolution(root: string, record: BountyRecord, attempt: Attempt): PushResult | 'held' {
  const event: ChainEvent = {
    v: 1, type: 'solution', at: new Date().toISOString(), actor: actorOf(record),
    n: attempt.n,
    ...(attempt.pullRequest !== undefined ? { pullRequest: attempt.pullRequest } : {}),
    ...(attempt.author !== undefined ? { author: attempt.author } : {}),
    commit: attempt.commit,
    changed: [...attempt.changed], added: [...attempt.added], deleted: [...attempt.deleted],
    // Only the parsed fact's kind leaves the machine — never the link text.
    ...(attempt.payTo !== undefined ? { payTo: { state: attempt.payTo.state } } : {})
  };
  return share(root, record, {}, event);
}

// `merged` — at apply or outside-merge recognition.
export function shareMerged(root: string, record: BountyRecord, n: number | undefined, mergeCommit: string, unasked: boolean): PushResult | 'held' {
  const event: ChainEvent = {
    v: 1, type: 'merged', at: new Date().toISOString(), actor: actorOf(record),
    ...(n !== undefined ? { n } : {}),
    mergeCommit,
    ...(unasked ? { unasked: true } : {})
  };
  return share(root, record, {}, event);
}

// `closed` — at close, for an ending with nothing merged.
export function shareClosed(root: string, record: BountyRecord, kind: 'rejected' | 'withdrawn', reason: string | undefined, unasked: boolean): PushResult | 'held' {
  const event: ChainEvent = {
    v: 1, type: 'closed', at: new Date().toISOString(), actor: actorOf(record),
    kind,
    ...(reason !== undefined && reason !== '' ? { reason } : {}),
    ...(unasked ? { unasked: true } : {})
  };
  return share(root, record, { reason }, event);
}

// ---------------------------------------------------------------------------
// Reading: throttled fetch, per-chain import into the shared table.
// ---------------------------------------------------------------------------

const stateKey = (root: string): string => {
  try { return realpathSync(root); } catch { return resolve(root); }
};

const loadChainState = (root: string): { fetchedAt?: string; error?: { at: string; reason: string } } =>
  loadState().chains?.[stateKey(root)] ?? {};

const writeChainState = (root: string, next: { fetchedAt?: string; error?: { at: string; reason: string } }): void => {
  const state = loadState();
  saveState({ ...state, chains: { ...state.chains, [stateKey(root)]: next } });
};

// The read side every fetching command calls: fetch the chains at most once
// a minute, fold remote tips into local chains, import what changed, and
// retry whatever push is still pending. A fetch failure answers from the
// cache and the notice is emitted once per spell.
export function syncChains(root: string, force = false): void {
  const url = remoteUrl(root);
  if (url === null) return;
  const prior = loadChainState(root);
  if (!force && prior.fetchedAt !== undefined && Date.now() - Date.parse(prior.fetchedAt) < FETCH_INTERVAL_MS) {
    retryPending(root, url);
    return;
  }
  const fetched = gitOutcome(root, ['fetch', '--no-tags', '--prune', url, `+${CHAIN_NS}/*:${CHAIN_REMOTE_NS}/*`]);
  if (fetched.status !== 0 || fetched.error !== undefined) {
    // Offline, throttled or refusing: answer from the cache, and say so once
    // per failing spell — a success below clears the recorded error.
    const reason = (fetched.stderr || fetched.error?.message || 'fetch failed').trim().split('\n')[0] ?? 'fetch failed';
    if (prior.error === undefined) emitMergeNotice(`shared bounty memory not refreshed (${reason}); showing what this machine last saw`);
    writeChainState(root, { fetchedAt: new Date().toISOString(), error: { at: new Date().toISOString(), reason } });
    return;
  }
  writeChainState(root, { fetchedAt: new Date().toISOString() });
  adoptAndImport(root);
  retryPending(root, url);
}

// The only commands allowed to touch the remote for memory (brief, reading):
// `box bounty`, `status`, `find`, `status --json` and `hook start` call this
// before they read records. Every other command works the imported cache.
// A failure never blocks the read — the cache answers and says so once.
export function refreshSharedMemory(root: string): void {
  try { syncChains(root); } catch { /* shared memory is a read cache — never a reason a read fails */ }
}

// Remote-tracking chains: adopt into local refs (merging diverged ones) and
// import the events of every chain whose tip moved since the last import.
function adoptAndImport(root: string): void {
  const remoteLines = gitOutcome(root, ['for-each-ref', '--format=%(refname) %(objectname)', CHAIN_REMOTE_NS]).stdout
    .split('\n').filter(line => line !== '');
  // Local tips in one listing: a chain already at the remote sha needs no
  // mergeRemoteTip probe — on a large shared memory that is two git starts
  // per unchanged bounty on every reading command, minutes at 1,000 chains.
  const localTips = new Map(
    // No remote-tracking refs means nothing to compare: skip the listing so
    // a plain read on an empty shared memory costs no extra git start (K14).
    (remoteLines.length === 0 ? { stdout: '' } :
    gitOutcome(root, ['for-each-ref', '--format=%(refname) %(objectname)', CHAIN_NS])).stdout
      .split('\n').filter(line => line !== '')
      .map(line => { const [ref, sha] = line.split(' '); return [ref!.slice(`${CHAIN_NS}/`.length), sha!] as const; })
  );
  const rows: SharedRow[] = [];
  for (const line of remoteLines) {
    const [ref, sha] = line.split(' ');
    const id = ref!.slice(`${CHAIN_REMOTE_NS}/`.length);
    if (!CHAIN_ID.test(id) || !/^[a-f\d]{40}$/.test(sha ?? '')) continue;
    if (localTips.get(id) !== sha) mergeRemoteTip(root, id);
    if (metaGet(root, `chain_tip:${id}`) === sha) continue; // this tip was already imported
    const record = importChain(root, id, sha!);
    metaSet(root, `chain_tip:${id}`, sha!);
    if (record !== null) rows.push(record);
  }
  if (rows.length > 0) importShared(root, rows);
}

// A chain this machine has that the remote does not reflect: a pending push
// retries here, and a remote-deleted chain restores from the local copy.
function retryPending(root: string, url?: string): void {
  // Every chain this machine knows leaves a chain_* meta key (pending,
  // pushed or imported tip) — without one the ref listing below can only
  // be empty, so skip its git start on reads with no shared memory (K14).
  if (metaKeys(root, 'chain_').length === 0) return;
  url ??= remoteUrl(root) ?? undefined;
  if (url === undefined) return;
  const localLines = gitOutcome(root, ['for-each-ref', '--format=%(refname) %(objectname)', CHAIN_NS]).stdout
    .split('\n').filter(line => line !== '');
  for (const line of localLines) {
    const [ref, local] = line.split(' ');
    const id = ref!.slice(`${CHAIN_NS}/`.length);
    if (!CHAIN_ID.test(id) || !/^[a-f\d]{40}$/.test(local ?? '')) continue;
    if (!isChainCommit(root, local!)) continue; // a legacy snapshot pin, not a chain
    const remote = tipOf(root, remoteRef(id));
    if (remote === local) continue;
    if (remote !== null && gitOutcome(root, ['merge-base', '--is-ancestor', local!, remote]).status === 0) {
      continue; // the remote is strictly ahead — adoptAndImport already folded it
    }
    const wasPushed = metaGet(root, `chain_pushed:${id}`) !== null;
    const result = pushChain(root, id);
    if (!result.pushed) emitMergeNotice(`shared bounty memory not pushed yet (${result.reason}); it will be retried`);
    else if (remote === null && wasPushed) emitMergeNotice(`shared bounty memory for ${id} was gone from the remote — restored from this machine`);
  }
}

// Walk one chain's commits parents-first and fold the valid events into a
// record-shaped shared row. An event that fails validation is skipped — the
// rest of its chain still shows. Returns null when nothing valid remains.
function importChain(root: string, id: string, tip: string): SharedRow | null {
  const listed = gitOutcome(root, ['rev-list', '--topo-order', '--reverse', tip]);
  if (listed.status !== 0) return null;
  const events: ChainEvent[] = [];
  for (const commit of listed.stdout.split('\n').map(line => line.trim()).filter(line => /^[a-f\d]{40}$/.test(line))) {
    const raw = gitOutcome(root, ['cat-file', 'blob', `${commit}:event.json`]);
    if (raw.status !== 0) continue;
    try {
      const parsed: unknown = JSON.parse(raw.stdout);
      if (validEvent(parsed) && parsed['type'] !== 'merge') events.push(parsed);
    } catch { /* an unreadable event is skipped, never fatal */ }
  }
  return foldEvents(id, events);
}

// Fold a chain's valid events into the record-shaped row the shared table
// stores — one synthetic record the ordinary readers render unchanged.
function foldEvents(id: string, events: readonly ChainEvent[]): SharedRow | null {
  const posted = events.find(event => event['type'] === 'posted');
  if (posted === undefined || typeof posted['id'] !== 'string' || posted['id'] !== id) return null;
  const issue = isObject(posted['issue']) ? posted['issue'] : {};
  const issueUrl = typeof issue['url'] === 'string' ? issue['url'] : '';
  const issueNumber = typeof issue['number'] === 'number' ? issue['number'] : 0;
  const repository = /^https:\/\/github\.com\/([A-Za-z\d_.-]+\/[A-Za-z\d_.-]+)\//.exec(issueUrl)?.[1] ?? 'unknown/unknown';
  const attempts: unknown[] = [];
  const history: { stage: string; at: string; destination?: string; reason?: string; attempt?: number; merge?: string; unasked?: true; command?: string }[] = [];
  let stage = 'posted';
  let endedAt: string | null = null;
  for (const event of events) {
    const at = typeof event['at'] === 'string' ? event['at'] : '';
    if (event['type'] === 'posted') {
      history.push({ stage: 'posted', at, destination: issueUrl });
    } else if (event['type'] === 'solution') {
      const n = typeof event['n'] === 'number' ? event['n'] : attempts.length + 1;
      if (!attempts.some(entry => isObject(entry) && entry['n'] === n)) {
        attempts.push({
          n,
          ...(typeof event['pullRequest'] === 'number' ? { pullRequest: event['pullRequest'] } : {}),
          at,
          ...(typeof event['author'] === 'string' ? { author: event['author'] } : {}),
          commit: typeof event['commit'] === 'string' ? event['commit'] : '',
          changed: Array.isArray(event['changed']) ? event['changed'] : [],
          added: Array.isArray(event['added']) ? event['added'] : [],
          deleted: Array.isArray(event['deleted']) ? event['deleted'] : [],
          outcome: 'answered', conflicts: null, report: [],
          ...(isObject(event['payTo']) ? { payTo: event['payTo'] } : {})
        });
      }
      history.push({ stage: 'answered', at, attempt: n });
      stage = 'answered';
    } else if (event['type'] === 'merged') {
      history.push({
        stage: 'applied', at, command: 'merged',
        ...(typeof event['n'] === 'number' ? { attempt: event['n'] } : {}),
        ...(typeof event['mergeCommit'] === 'string' ? { merge: event['mergeCommit'] } : {}),
        ...(event['unasked'] === true ? { unasked: true as const } : {})
      });
      stage = 'applied'; endedAt = at;
    } else if (event['type'] === 'closed') {
      const kind = event['kind'] === 'rejected' ? 'rejected' : 'withdrawn';
      history.push({ stage: kind, at, command: 'close', ...(typeof event['reason'] === 'string' ? { reason: event['reason'] } : {}), ...(event['unasked'] === true ? { unasked: true as const } : {}) });
      stage = kind; endedAt = at;
    }
  }
  const createdAt = typeof posted['at'] === 'string' ? posted['at'] : new Date(0).toISOString();
  const lastAt = history.at(-1)?.at ?? createdAt;
  const followup = typeof posted['followup'] === 'string' ? posted['followup'] : null;
  const title = typeof posted['title'] === 'string' ? posted['title'] : id;
  const task = typeof posted['task'] === 'string' ? posted['task'] : '';
  const record: Record<string, unknown> = {
    schemaVersion: 1,
    kind: 'box-bounty-record',
    id,
    title,
    ...(typeof posted['why'] === 'string' ? { why: posted['why'] } : {}),
    ...(typeof posted['partOf'] === 'string' ? { partOf: posted['partOf'] } : {}),
    noteSource: 'legacy',
    stage,
    content: { task: { file: '(shared)', text: task }, note: null, tool: 'box-bounty@0.1.0' },
    createdAt,
    resume: followup !== null
      ? { kind: 'recorded', branch: '(shared)', commit: typeof posted['base'] === 'string' ? posted['base'] : '', changed: [], note: followup }
      : { kind: 'not-recorded' },
    events: history,
    attempts,
    github: {
      repository,
      account: typeof posted['actor'] === 'string' ? posted['actor'] : 'unknown',
      kind: 'history',
      branch: typeof posted['branch'] === 'string' ? posted['branch'] : `box-bounty/${id}`,
      commit: typeof posted['base'] === 'string' ? posted['base'] : '',
      title,
      body: '',
      state: endedAt === null ? 'posted' : 'closed',
      issue: { number: issueNumber, url: issueUrl },
      pending: null
    },
    ...(isObject(posted['reward']) && typeof posted['reward']['amount'] === 'number' ? { reward: { amount: posted['reward']['amount'] } } : {}),
    ...(isObject(posted['allowedBy']) ? { allowedBy: { decision: posted['allowedBy']['decision'], level: posted['allowedBy']['level'], decisionAt: null, usedAt: createdAt } } : {}),
    shared: true
  };
  const searchText = [id, title, posted['why'] ?? '', posted['partOf'] ?? '', task, followup ?? ''].join('\n').toLowerCase();
  return {
    id, stage, open: endedAt === null,
    createdAt, updatedAt: lastAt, endedAt,
    record,
    searchText
  };
}

// The message shared-only actions carry — one place decides the wording.
export function sharedOnlyRefusal(record: BountyRecord): BountyRefused {
  const url = record.github?.issue?.url;
  return new BountyRefused('shared-only', `this bounty was posted from another machine${url !== undefined && url !== '' ? `; its issue is ${url}` : ''}; act on it from that machine, or on GitHub`);
}
