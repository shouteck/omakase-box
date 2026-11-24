// BT101 stage 2: the one step that sends what a bounty owes outside. A command owes an effect (store.ts `owe`: an `owed`
// event and its outbox row in one transaction), then calls reconcile for its bounty. Each pending row is checked through
// the door (outbound.ts) and sent by its one sender, from the record as folded now, never from text on the row; then it
// is settled `sent` or `refused`. GitHub takes no idempotency key, so the senders keep their markers and recoverIssue:
// the outbox decides when to send, the markers decide whether it already went.
import { pushChain } from './chain.js';
import { syncGitHubDecision } from './close.js';
import { BountyRefused } from './errors.js';
import { api, ensureLabel, invalid, isObject, issueNumber, namesGitHubCause, recoverIssue, remoteGit } from './gh.js';
import { emitMergeNotice, emitSentEarlier, inRead } from './notice.js';
import { checkedForIssue, decisionGranted, DoorRefused } from './outbound.js';
import { persistRecord, type BountyRecord } from './record.js';
import { outboxRows, owe, owedBehind, pendingOwed, readStored, settleOwed, type Owed, type OutboxRow } from './store.js';

export interface Sent {
  readonly key: string;
  readonly kind: string;
  /** `sent` and `refused` settle the row; `pending` means the send failed and the row is still owed. */
  readonly outcome: 'sent' | 'refused' | 'pending';
  readonly reason?: string;
  readonly detail: string;
  /** The refusal the command that owed this row raises in its own name. */
  readonly error?: unknown;
}

const folded = (root: string, id: string): BountyRecord | null => readStored(root, id).record;

// The branch push and the issue: BT69's checked commit is the one object pushed, then the issue is found by its marker
// or created. A failure leaves the publication's pending line for `post` to name.
function sendIssue(root: string, id: string): string {
  const record = folded(root, id);
  if (record === null) throw new DoorRefused('nothing-owed', `${id} has no record; nothing was posted`);
  const checked = checkedForIssue(root, record);
  const publication = record.github!;
  const repository = publication.repository;
  try {
    remoteGit(root, repository, ['push', `${checked}:refs/heads/${publication.branch}`]);
    publication.state = 'branch-pushed';
    persistRecord(root, record);
    if (publication.issue === null) {
      publication.issue = recoverIssue(root, publication) ?? (() => {
        ensureLabel(root, repository);
        const created = api(root, `repos/${repository}/issues`, { title: publication.title, body: publication.body, labels: ['box-bounty'] });
        const labels = isObject(created) && Array.isArray(created['labels']) ? created['labels'] : [];
        if (!labels.some(entry => isObject(entry) && entry['name'] === 'box-bounty')) return invalid('github-response-invalid', 'the box-bounty label did not land on the issue; next: check the issue on GitHub; omakase-box status shows what was recorded');
        return issueNumber(created, repository);
      })();
    }
    publication.state = 'posted'; publication.pending = null;
    persistRecord(root, record);
    return `issue ${publication.issue.url}`;
  } catch (error) {
    publication.pending = `post-incomplete: ${publication.state}; issue ${publication.issue?.url ?? 'not recorded'}; retry omakase-box post ${id} or remove with omakase-box close ${id}`;
    persistRecord(root, record);
    // A named GitHub cause travels with the refusal (BT50); its own next step is dropped, since this one says how to
    // resume the post.
    const cause = namesGitHubCause(error) ? `; ${error.reason}: ${error.message.split('; next:')[0]}` : '';
    return invalid('github-post-incomplete', `${publication.pending}${cause}; next: retry omakase-box post ${id} or remove it with omakase-box close ${id}`);
  }
}

// The decision comments, the issue's state and the branch's removal. Done when the publication reads closed with
// nothing pending; a pending line left by the sender keeps the row owed.
function sendDecisionRow(root: string, id: string, owed: Owed): string | null {
  const record = folded(root, id);
  const publication = record?.github;
  if (record === null || publication === undefined) return 'nothing to send';
  if (!decisionGranted(root, record, owed)) {
    publication.pending = `github-decision-pending (owner-permission-needed): this machine's owner has given no permission for this repository, so GitHub was not touched; next: ask the owner — omakase-box allow <owner/name>, then omakase-box close ${record.id}`;
    persistRecord(root, record);
    throw new DoorRefused('owner-permission-needed', publication.pending);
  }
  syncGitHubDecision(root, record);
  const after = folded(root, id)?.github;
  return after === undefined || after.state === 'closed' && after.pending === null || !record.events.some(event => ['apply', 'reject', 'withdraw', 'undo', 'merged', 'close'].includes(event.command ?? ''))
    ? 'decision comments and issue state'
    : null;
}

function sendOne(root: string, row: OutboxRow): Sent {
  const base = { key: row.key, kind: row.kind };
  const owed = owedBehind(root, row);
  const settle = (outcome: 'sent' | 'refused' | 'failed', result: { reason?: string; detail: string }, error?: unknown): Sent => {
    settleOwed(root, row, outcome, result);
    return { ...base, outcome: outcome === 'failed' ? 'pending' : outcome, ...result, ...(error === undefined ? {} : { error }) };
  };
  if (owed === null) return settle('refused', { reason: 'not-owed', detail: `${row.key}: no owed event stands behind this row; nothing was sent` });
  try {
    if (owed.kind === 'issue') return settle('sent', { detail: sendIssue(root, row.bountyId) });
    if (owed.kind === 'decision') {
      const done = sendDecisionRow(root, row.bountyId, owed);
      return done === null
        ? settle('failed', { detail: folded(root, row.bountyId)?.github?.pending ?? 'the decision is still owed' })
        : settle('sent', { detail: done });
    }
    if (owed.kind === 'chain') {
      // The push names the exact commit the owed event names, the one its scan passed, never the ref, which could have
      // been swapped since.
      const pushed = pushChain(root, row.bountyId, owed.tip);
      if (!pushed.pushed) emitMergeNotice(`shared bounty memory not pushed yet (${pushed.reason}); it will be retried`);
      else if (pushed.restored === true) emitMergeNotice(`shared bounty memory for ${row.bountyId} was gone from the remote — restored from this machine`);
      return pushed.pushed ? { ...base, outcome: 'sent', detail: 'chain pushed' } : { ...base, outcome: 'pending', detail: pushed.reason ?? 'chain push still owed' };
    }
    return settle('refused', { reason: 'not-owed', detail: `${row.key}: no sender for this kind; nothing was sent` });
  } catch (error) {
    if (error instanceof DoorRefused) return settle('refused', { reason: error.reason, detail: error.message }, error);
    if (error instanceof BountyRefused) return settle('failed', { reason: error.reason, detail: error.message }, error);
    throw error;
  }
}

// BT101 stage 3: a read only observes (notice.ts keeps the flag, below every module that asks it). Inside a read,
// reconcile sends nothing.
export { asRead, inRead, readOnlyProcess } from './notice.js';

/** Send what one bounty owes, oldest row first; each outcome is returned for the command to name. */
export function reconcile(root: string, id: string): Sent[] {
  if (inRead()) return [];
  return outboxRows(root, id).filter(row => row.state === 'pending').map(row => {
    const owedAt = owedBehind(root, row)?.at;
    const sent = sendOne(root, row);
    if (sent.outcome === 'sent') emitSentEarlier(sent.key, sent.detail, owedAt);
    return sent;
  });
}

/** An ending owes its decision outside, then reconcile sends it. The record as it now stands is returned, since the send
    wrote its own copy. `authorised` is the owner's answer an `apply` passed the merge gate with (BT52). */
export function sendDecision(root: string, id: string, grant?: { readonly authorised: true }): BountyRecord {
  // A decision already owed (by a read that noticed a hand merge, or a send that failed) keeps the event that owed it,
  // unless this command adds the owner's answer to it.
  const pending = pendingOwed(root, `decision:${id}`);
  if (pending === null || grant?.authorised === true && pending.authorised !== true) owe(root, id, 'decision', grant ?? {});
  reconcile(root, id);
  const record = folded(root, id);
  if (record === null) throw new BountyRefused('record-corrupt', `the record of ${id} could not be read after its decision was sent; next: omakase-box status ${id}`);
  return record;
}
