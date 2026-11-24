// BT101 stage 2: the door's checks, run when an owed effect is sent, never when it is owed. Each reads the record as
// folded now and the owner's settings as they are now, so a forged row, a forged owed event or a word the owner has
// since withdrawn sends nothing. A refusal here is final for that row: the command that owes it again re-arms it.
import { adoptedWithoutPermission } from './adopt.js';
import { BountyRefused } from './errors.js';
import { shipRules } from './never-ship.js';
import { checkOutbound } from './publish-sink.js';
import { isOpenStage, type BountyRecord } from './record.js';
import { hitPlace, scanText } from './scan.js';
import { readDecision } from './settings.js';
import type { Owed } from './store.js';

/** A refusal by the door: the row is settled `refused` under this reason, and nothing of it was sent. */
export class DoorRefused extends BountyRefused {}

const refuse = (reason: string, message: string): never => { throw new DoorRefused(reason, message); };

// The owner's word for an issue: the standing answer that allowed the post still stands, or the owner's own one-bounty
// answer allowed it. A `deny` on this repository since withdraws both.
function ownerWordForIssue(root: string, record: BountyRecord): void {
  let read: ReturnType<typeof readDecision>;
  try { read = readDecision(root); }
  catch { return refuse('owner-word-withdrawn', `${record.id}: the owner's word for this repository cannot be read now; nothing was posted; next: omakase-box config shows it`); }
  if (read.denied === true || read.decision === null && record.allowedBy?.decision !== 'once') {
    refuse('owner-word-withdrawn', `${record.id}: the owner's permission for this repository was withdrawn after this post was planned; nothing was posted; next: ask the owner — omakase-box allow <owner/name> gives it again, then omakase-box post ${record.id}`);
  }
}

// Text about to be published is scanned as it goes out; a hit names where, never the value.
export function scanOutgoing(id: string, fields: readonly (readonly [string, string])[]): void {
  const hits = fields.flatMap(([label, text]) => scanText(label, text));
  if (hits.length > 0) refuse('publish-held', `${id}: ${hits.length} secret-shaped hit(s) in what was about to go out — ${hits.map(hit => `${hitPlace(hit)} — ${hit.rule}`).join('; ')}; nothing of it was sent; next: pass this on to the owner; the local record stands`);
}

/** The door for an issue: the owner's word, the scan of its title and body, then BT69's never-ship sink over what the
    push would send. Returns the one commit the push may name. */
export function checkedForIssue(root: string, record: BountyRecord): string {
  const publication = record.github;
  if (publication === undefined) return refuse('nothing-owed', `${record.id} has no publication to send; nothing was posted`);
  // An ending supersedes a post still owed: a closed bounty is never posted (its decision row closes up what went out).
  if (!isOpenStage(record.stage)) return refuse('bounty-ended', `${record.id} is ${record.stage}; an ended bounty is not posted; nothing was posted`);
  ownerWordForIssue(root, record);
  scanOutgoing(record.id, [['(issue title)', publication.title], ['(issue body)', publication.body]]);
  return checkOutbound(root, publication.repository, publication.commit, shipRules(root), record.id);
}

/** The door for a decision: a bounty picked up from another machine writes nothing to GitHub until this machine's owner
    gave permission, unless the owed event carries the owner's answer (an `apply` past the merge gate). */
export function decisionGranted(root: string, record: BountyRecord, owed: Owed): boolean {
  return owed.authorised === true || record.github?.state === 'closed' || !adoptedWithoutPermission(root, record);
}
