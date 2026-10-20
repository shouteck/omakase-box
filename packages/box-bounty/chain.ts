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
// imported. The same boundary gates WRITES: a local chain ref may be
// pushed only when its tip carries persisted per-id provenance — the exact
// sha the tool itself authored (`chain_authored:`/`chain_pending:`), the
// tip it previously pushed (`chain_pushed:`), or the remote tip it
// imported (`chain_tip:`). Namespace membership alone is never upload
// authorization: a planted ref, or one replaced with an unscanned
// descendant of a trusted tip, is ignored and its objects never leave.
// Writing never touches the working tree, the index or a branch:
// blob, tree and commit are objects only; the ref moves by update-ref.
//
// Events are built by allow-list projection — only the fields the event
// table names are copied out of the record. Every specified text field
// passes the same secret scan a publish does BEFORE the event object is
// written; a hit holds the event exactly as a publish hit holds a post.

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { git, gitNamedBlobs, gitOutcome, gitRefsWrite, gitStdin, gitWriteBlob } from './git.js';
import type { RefWrite } from './git.js';
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
    'nothing was written to the chain and nothing was pushed. The scan is a stated pattern list, not proof of absence.', `next: pass the owner block on in its words; the answer lands on the publish lists — box bounty config add safe-to-publish <path> or add never-publish <path>`
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

// Persisted per-id provenance (decision 2, write side). `chain_authored:` /
// `chain_pending:` record the exact tip this tool committed (pending also
// marks a push still owed); `chain_pushed:` the last tip this machine put
// on the remote; `chain_tip:` the remote tip it imported. A local tip is
// pushable only when it equals one of these — a planted ref, or a trusted
// ref swapped for an unscanned descendant, matches none.
const toolTip = (root: string, id: string, tip: string): boolean =>
  metaGet(root, `chain_authored:${id}`) === tip || metaGet(root, `chain_pending:${id}`) === tip;
const provenTip = (root: string, id: string, tip: string): boolean =>
  toolTip(root, id, tip) ||
  metaGet(root, `chain_pushed:${id}`) === tip ||
  metaGet(root, `chain_tip:${id}`) === tip;

// Write one event commit: tree = {event.json: <blob>}, parents given; the
// local chain ref moves to it. Working tree, index and branches untouched.
// The commit is recorded as this machine's authored tip — the provenance
// that later authorizes pushing it.
function commitEvent(root: string, id: string, eventJson: string, parents: readonly string[]): string {
  const blob = gitWriteBlob(root, Buffer.from(eventJson, 'utf8'));
  const tree = gitStdin(root, ['mktree'], `100644 blob ${blob}\tevent.json\n`);
  const args = [...IDENTITY, 'commit-tree', tree, '-m', `box-bounty ${id} chain event`];
  for (const parent of parents) args.push('-p', parent);
  const commit = git(root, args);
  gitRefsWrite(root, [{ update: chainRef(id), sha: commit }]);
  metaSet(root, `chain_authored:${id}`, commit);
  return commit;
}

// Append a built event onto the local chain. The parent is the current tip
// only when it is itself a chain commit AND carries proven provenance — an
// old `refs/box-bounty/<id>` snapshot pin (pre-BT24 records) is not chain
// history, and a planted or swapped local ref is never a parent either: a
// forged tip would otherwise launder its graph under a tool-authored event.
export function appendEvent(root: string, id: string, event: ChainEvent): string {
  const tip = tipOf(root, chainRef(id));
  const parent = tip !== null && provenTip(root, id, tip) && isChainCommit(root, tip) ? [tip] : [];
  const commit = commitEvent(root, id, JSON.stringify(event) + '\n', parent);
  // From this moment the authored tip is a pending push — a crash before
  // pushChain still retries it, bound to exactly this tip.
  metaSet(root, `chain_pending:${id}`, commit);
  return commit;
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
  if (!provenTip(root, id, local)) {
    // A diverged local tip with no provenance is foreign: never graft its
    // graph onto the remote chain under an authorized merge commit. Adopt
    // the remote tip and leave the planted objects unreferenced.
    gitRefsWrite(root, [{ update: chainRef(id), sha: remote }]);
    return 'ff';
  }
  const merge = commitEvent(root, id, JSON.stringify({ v: 1, type: 'merge' }) + '\n', [local, remote]);
  metaSet(root, `chain_pending:${id}`, merge);
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

// The pushed object is always the EXACT sha that was just proven — never the
// ref name, which git would re-resolve inside the push after a swap.
const pushOnce = (root: string, url: string, id: string, sha: string): boolean =>
  gitOutcome(root, ['push', url, `${sha}:${chainRef(id)}`]).status === 0;

const fetchOne = (root: string, url: string, id: string): void => {
  gitOutcome(root, ['fetch', '--no-tags', '--prune', url, `+${chainRef(id)}:${remoteRef(id)}`]);
};

export interface PushResult { readonly pushed: boolean; readonly reason?: string; readonly restored?: boolean }

// Push one chain. On a non-fast-forward answer: fetch the remote tip, fold
// it into the local chain (ff or an empty merge commit) and push again —
// at most PUSH_TRIES attempts before the push waits for the next command.
// `knownTip` lets the caller that just authored the tip skip one re-read.
export function pushChain(root: string, id: string, knownTip?: string): PushResult {
  const url = remoteUrl(root);
  const proven = (known?: string): string | null => {
    const tip = known ?? tipOf(root, chainRef(id));
    return tip !== null && provenTip(root, id, tip) ? tip : null;
  };
  const firstTip = proven(knownTip);
  if (firstTip === null) return { pushed: false, reason: 'the local chain tip has no tool-authored or remote provenance' };
  if (url === null) { metaSet(root, `chain_pending:${id}`, firstTip); return { pushed: false, reason: 'the repository remote is not settled' }; }
  const pushedBefore = metaGet(root, `chain_pushed:${id}`) !== null;
  let restored = false;
  for (let attempt = 1; attempt <= PUSH_TRIES; attempt += 1) {
    // Re-check provenance on every retry — and push the sha that check just
    // proved, never the mutable ref name. A swapped-in ref can therefore
    // neither be published nor laundered into `chain_pushed:`.
    // (Attempt 1 was just verified at entry.)
    const attemptTip = attempt === 1 ? firstTip : proven();
    if (attemptTip === null) {
      // The authored tip is still owed — keep the LAST PROVEN sha as pending
      // rather than blessing (or forgetting under) the replacement.
      metaSet(root, `chain_pending:${id}`, firstTip);
      return { pushed: false, reason: 'the local chain tip changed to a ref with no tool-authored or remote provenance' };
    }
    if (pushOnce(root, url, id, attemptTip)) {
      // Record exactly the sha this push put on the remote — reading the
      // local ref here would bless whatever a swap installed.
      metaSet(root, `chain_pushed:${id}`, attemptTip);
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
  const owed = proven();
  if (owed !== null) metaSet(root, `chain_pending:${id}`, owed);
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
  const tip = appendEvent(root, record.id, event);
  const result = pushChain(root, record.id, tip);
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

// `paid` — when the owner records a merged bounty's solver was paid, and
// again when a mistaken record is withdrawn (BT36). The event carries only
// the amount, whose word it is and the withdrawal mark — never the solver,
// never the payment link: payment stays private between owner and solver.
export function sharePaid(root: string, record: BountyRecord, amount: number, withdrawn: boolean): PushResult | 'held' {
  const event: ChainEvent = {
    v: 1, type: 'paid', at: new Date().toISOString(), actor: actorOf(record),
    amount, by: 'owner',
    ...(withdrawn ? { withdrawn: true } : {})
  };
  return share(root, record, {}, event);
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
    // Inside the throttle window the remote-tracking refs cannot have moved
    // since the fetch that set it — only pending pushes can still need work.
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
  const view = adoptAndImport(root);
  retryPending(root, url, view);
}

// The only commands allowed to touch the remote for memory (brief, reading):
// `box bounty`, `status`, `find`, `status --json` and `hook start` call this
// before they read records. Every other command works the imported cache.
// A failure never blocks the read — the cache answers and says so once.
export function refreshSharedMemory(root: string): void {
  try { syncChains(root); } catch { /* shared memory is a read cache — never a reason a read fails */ }
}

// ---------------------------------------------------------------------------
// The batched read view (scale gate): every fact the import needs comes from
// a fixed handful of Git processes — two ref listings, chunked `rev-list
// --parents` history walks, one `cat-file --batch` for the event blobs and
// one `update-ref --stdin` for adoptions — no matter how many chains exist.
// The previous shape (a rev-list plus one cat-file per event, plus per-chain
// merge probes) cost ~9 spawns a chain: ~7 minutes at 1,000 chains here.
// ---------------------------------------------------------------------------

interface ChainView {
  readonly remoteTips: ReadonlyMap<string, string>; // bounty id -> remote-tracking sha
  readonly localTips: ReadonlyMap<string, string>;  // bounty id -> local sha
  readonly parents: ReadonlyMap<string, readonly string[]>; // commit -> parents
  readonly chainCommits: ReadonlySet<string>;       // commits whose tree carries event.json
  readonly events: ReadonlyMap<string, string>;     // commit -> raw event.json text
  readonly ancestorsOf: (tip: string) => ReadonlySet<string>;
}

const refTips = (root: string, ns: string): ReadonlyMap<string, string> =>
  new Map(
    gitOutcome(root, ['for-each-ref', '--format=%(refname) %(objectname)', ns]).stdout
      .split('\n').filter(line => line !== '')
      .map(line => { const [ref, sha] = line.split(' '); return [ref!.slice(`${ns}/`.length), sha!] as const; })
      .filter(([id, sha]) => CHAIN_ID.test(id) && /^[a-f\d]{40}$/.test(sha))
  );

// Parent edges for the union of the given tips' histories — chunked so the
// argument list stays short, one process per chunk (never one per chain).
function revListParents(root: string, tips: ReadonlySet<string>): Map<string, readonly string[]> {
  const parents = new Map<string, readonly string[]>();
  const parse = (stdout: string): void => {
    for (const line of stdout.split('\n')) {
      const cols = line.trim().split(' ');
      if (!/^[a-f\d]{40}$/.test(cols[0] ?? '')) continue;
      parents.set(cols[0]!, cols.slice(1).filter(col => /^[a-f\d]{40}$/.test(col)));
    }
  };
  const all = [...tips];
  const CHUNK = 200;
  for (let i = 0; i < all.length; i += CHUNK) {
    const listed = gitOutcome(root, ['rev-list', '--parents', ...all.slice(i, i + CHUNK)]);
    if (listed.status === 0) { parse(listed.stdout); continue; }
    // A chunk fails whole when one tip will not walk (a ref moved mid-sync);
    // fall back to per-tip walks so the rest of the chunk still imports.
    for (const tip of all.slice(i, i + CHUNK)) {
      const single = gitOutcome(root, ['rev-list', '--parents', tip]);
      if (single.status === 0) parse(single.stdout);
    }
  }
  return parents;
}

// Parents before children, ties by commit id — git-bug's chain ordering,
// computed on the fetched parent edges (cycles, which the tool never
// writes, drop the cyclic remainder rather than loop).
function chainOrder(view: ChainView, tip: string): string[] {
  const member = view.ancestorsOf(tip);
  const unmet = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const commit of member) {
    const within = (view.parents.get(commit) ?? []).filter(parent => member.has(parent));
    unmet.set(commit, within.length);
    for (const parent of within) {
      const list = children.get(parent) ?? [];
      list.push(commit);
      children.set(parent, list);
    }
  }
  const ready = [...member].filter(commit => unmet.get(commit) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const commit = ready.shift()!;
    order.push(commit);
    for (const child of children.get(commit) ?? []) {
      unmet.set(child, unmet.get(child)! - 1);
      if (unmet.get(child) === 0) {
        let at = ready.length;
        while (at > 0 && ready[at - 1]! > child) at -= 1;
        ready.splice(at, 0, child);
      }
    }
  }
  return order;
}

// Remote-tracking chains: adopt into local refs (merging diverged ones) and
// import the events of every chain whose tip moved since the last import.
// Returns the collected view for retryPending — the post-fetch push pass
// reads the same listings instead of listing refs and probing tips again.
function adoptAndImport(root: string): ChainView {
  const remoteTips = refTips(root, CHAIN_REMOTE_NS);
  // A local listing is skipped only when nothing could be there to compare
  // or retry: no remote chains and no chain meta keys at all (K14: a plain
  // read on an empty shared memory costs no extra git start).
  const localTips = remoteTips.size === 0 && metaKeys(root, 'chain_').length === 0
    ? new Map<string, string>()
    : refTips(root, CHAIN_NS);

  // History walks only where a decision needs them: tips that differ, tips
  // not yet imported, and local-only chains (isChainCommit for the retry).
  const walk = new Set<string>();
  for (const [id, remote] of remoteTips) {
    const local = localTips.get(id);
    if (local !== remote || metaGet(root, `chain_tip:${id}`) !== remote) {
      walk.add(remote);
      if (local !== undefined && local !== remote) walk.add(local);
    }
  }
  for (const [id, local] of localTips) if (!remoteTips.has(id)) walk.add(local);
  const parents = revListParents(root, walk);

  const ancestorCache = new Map<string, Set<string>>();
  const ancestorsOf = (tip: string): ReadonlySet<string> => {
    const known = ancestorCache.get(tip);
    if (known !== undefined) return known;
    const seen = new Set<string>();
    const stack = [tip];
    while (stack.length > 0) {
      const commit = stack.pop()!;
      if (seen.has(commit)) continue;
      seen.add(commit);
      for (const parent of parents.get(commit) ?? []) stack.push(parent);
    }
    ancestorCache.set(tip, seen);
    return seen;
  };
  // One batch read for every event blob the decisions below can touch:
  // all commits of chains needing (re)import, plus each differing local tip
  // (the isChainCommit check — a legacy snapshot pin is not chain history).
  const need = new Set<string>();
  for (const [id, remote] of remoteTips) {
    if (metaGet(root, `chain_tip:${id}`) !== remote) for (const commit of ancestorsOf(remote)) need.add(commit);
  }
  // Every walked tip also gets probed — the isChainCommit check on local
  // tips reads the same event.json the import would.
  for (const sha of walk) need.add(sha);
  const blobs = gitNamedBlobs(root, [...need].map(sha => `${sha}:event.json`));
  const chainCommits = new Set<string>();
  const events = new Map<string, string>();
  for (const [name, blob] of blobs) {
    const sha = name.slice(0, name.indexOf(':'));
    if (blob === null) continue;
    chainCommits.add(sha);
    events.set(sha, blob.toString('utf8'));
  }
  const view: ChainView = { remoteTips, localTips, parents, chainCommits, events, ancestorsOf };

  // Merge decisions on the in-memory graph — one update-ref --stdin for
  // every 'new'/'ff' adoption; a genuinely diverged chain still merges by
  // its own commitEvent (rare: it takes two writers racing).
  const writes: RefWrite[] = [];
  for (const [id, remote] of remoteTips) {
    const local = localTips.get(id);
    if (local === remote) continue;
    if (local === undefined || !chainCommits.has(local)) {
      writes.push({ update: chainRef(id), sha: remote });
    } else if (ancestorsOf(local).has(remote)) {
      // local strictly ahead — pushChain's pending/retry side handles it,
      // and only when the tip has provenance; a planted descendant is
      // never uploaded.
    } else if (ancestorsOf(remote).has(local)) {
      writes.push({ update: chainRef(id), sha: remote }); // fast-forward
    } else if (provenTip(root, id, local)) {
      // A genuinely diverged chain this machine is entitled to publish:
      // join the tips under an empty merge event and owe the push.
      const merge = commitEvent(root, id, JSON.stringify({ v: 1, type: 'merge' }) + '\n', [local, remote]);
      metaSet(root, `chain_pending:${id}`, merge);
    } else {
      // A foreign diverged tip is never grafted onto the remote graph —
      // adopt the remote tip and leave its objects unreferenced.
      writes.push({ update: chainRef(id), sha: remote });
    }
  }
  gitRefsWrite(root, writes);

  const rows: SharedRow[] = [];
  for (const [id, remote] of remoteTips) {
    if (metaGet(root, `chain_tip:${id}`) === remote) continue; // this tip was already imported
    const valid: ChainEvent[] = [];
    for (const commit of chainOrder(view, remote)) {
      const raw = events.get(commit);
      if (raw === undefined) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (validEvent(parsed) && parsed['type'] !== 'merge') valid.push(parsed);
      } catch { /* an unreadable event is skipped, never fatal */ }
    }
    const record = foldEvents(id, valid);
    metaSet(root, `chain_tip:${id}`, remote);
    if (record !== null) rows.push(record);
  }
  if (rows.length > 0) importShared(root, rows);
  return view;
}

// A chain this machine has that the remote does not reflect — but only two
// provenance classes may ever drive a push: a persisted tool-authored
// pending tip (`chain_pending:` bound to the exact sha the tool committed,
// still the local tip) and validated deletion recovery (`chain_pushed:` —
// this machine pushed this tip before, the remote-tracking ref is now gone
// and the local tip is still exactly that pushed sha). Enumerating the
// local namespace is NOT authorization: a planted ref, or a trusted ref
// swapped for an unscanned descendant, matches neither record and its
// objects are never uploaded.
function retryPending(root: string, url?: string, view?: ChainView): void {
  // The view's listings are the post-fetch snapshot; where adoption may
  // have just moved a ref (a pending merge commit) the check falls back to
  // one fresh rev-parse for that id only — reads stay at a fixed handful of
  // Git starts on machines with no pending work.
  const localTip = (id: string): string | null =>
    view !== undefined ? view.localTips.get(id) ?? null : tipOf(root, chainRef(id));
  const remoteTip = (id: string): string | null =>
    view !== undefined ? view.remoteTips.get(id) ?? null : tipOf(root, remoteRef(id));
  const ids = new Set<string>();
  for (const key of metaKeys(root, 'chain_pending:')) {
    const id = key.slice('chain_pending:'.length);
    if (!CHAIN_ID.test(id)) continue;
    const expected = metaGet(root, key);
    if (expected === null) continue;
    // A replaced or foreign ref never matches the recorded tip. Where the
    // view's snapshot predates an adoption-time merge of this very chain,
    // one fresh read settles it — a rev-parse only for ids that actually
    // owe a push.
    const seen = localTip(id);
    const local = seen === expected ? seen : tipOf(root, chainRef(id));
    if (local !== expected) continue; // swapped-in tip: never pushed
    const remote = remoteTip(id);
    if (remote !== null && remote !== expected &&
        (view !== undefined ? view.ancestorsOf(remote).has(expected)
                            : gitOutcome(root, ['merge-base', '--is-ancestor', expected, remote]).status === 0)) {
      continue; // the remote already holds this tip — nothing is owed
    }
    ids.add(id);
  }
  // Deletion recovery is only visible after a fetch pruned the tracking
  // ref, so it is a post-fetch (view) check — inside the throttle window
  // the remote-tracking refs cannot have moved. Two anchors, both bound to
  // an exact sha: `chain_pushed:` (this machine published this tip before)
  // and `chain_tip:` (this machine imported this exact remote tip — an
  // import-only clone holds a validated copy and may restore it). A tip
  // that diverged from its anchor is never a recovery source.
  if (view !== undefined) for (const prefix of ['chain_pushed:', 'chain_tip:'] as const) {
    for (const key of metaKeys(root, prefix)) {
      const id = key.slice(prefix.length);
      if (!CHAIN_ID.test(id) || ids.has(id)) continue;
      const anchor = metaGet(root, key);
      if (anchor !== null && remoteTip(id) === null && localTip(id) === anchor) ids.add(id);
    }
  }
  if (ids.size === 0) return;
  url ??= remoteUrl(root) ?? undefined;
  if (url === undefined) return;
  for (const id of ids) {
    const hadCopy = metaGet(root, `chain_pushed:${id}`) !== null || metaGet(root, `chain_tip:${id}`) !== null;
    const remote = remoteTip(id);
    const result = pushChain(root, id);
    if (!result.pushed) emitMergeNotice(`shared bounty memory not pushed yet (${result.reason}); it will be retried`);
    else if (remote === null && hadCopy) emitMergeNotice(`shared bounty memory for ${id} was gone from the remote — restored from this machine`);
  }
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
  const history: { stage: string; at: string; destination?: string; reason?: string; attempt?: number; merge?: string; unasked?: true; command?: string; amount?: number; by?: string; withdrawn?: true }[] = [];
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
    } else if (event['type'] === 'paid') {
      // BT36: the paid fact is part of the outcome, so it rides the chain —
      // a fact on the record, never a stage: `stage`/`endedAt` do not move.
      history.push({
        stage: 'paid', at, command: 'config',
        ...(typeof event['amount'] === 'number' ? { amount: event['amount'] } : {}),
        ...(typeof event['by'] === 'string' ? { by: event['by'] } : {}),
        ...(event['withdrawn'] === true ? { withdrawn: true as const } : {})
      });
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
  return new BountyRefused('shared-only', `this bounty was posted from another machine${url !== undefined && url !== '' ? `; its issue is ${url}` : ''}; next: act on it from that machine, or on GitHub`);
}
