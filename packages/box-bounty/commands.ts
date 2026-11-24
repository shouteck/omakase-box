// The omakase-box commands that live one level above the store: post and
// close. They compose record writes and outside sync — nothing here is read
// by record.ts. Moved out of record.ts unchanged (BT25); postBounty stays
// the two-line forwarder to postGitHub it was. (retiredRoute and
// requireCurrentDelivery are record-reading predicates with callers in
// github.ts and four other modules — they stayed in record.ts per the
// brief's lower-level-module rule, since moving them here would have closed
// a github.ts <-> commands.ts import cycle.)

import { adoptedWithoutPermission,syncBeforeAction } from './adopt.js';
import { BountyRefused } from './errors.js';
import { boundAmount } from './format.js';
import { postGitHub } from './post.js';
import { sendDecision } from './reconcile.js';
import { payNotice } from './pay.js';
import { dropDurabilityRefs,isOpenStage,loadRecord,settleScanFindings,transitionTo } from './record.js';
import { shareClosed } from './chain.js';
import type { BountyRecord } from './record.js';

export function postBounty(repoRoot: string, id: string, to = 'github', opts?: { answered?: boolean; choice?: import('./gh.js').GitHubChoice }): { record: BountyRecord; destination: string } {
  if (to !== 'github') throw new BountyRefused('folder-delivery-retired', 'folder delivery was retired; next: post to GitHub with omakase-box post <id>. A private repository cannot be handed off with this tool');
  return postGitHub(repoRoot, id, opts);
}

export interface CloseOutcome {
  /** A bounty with a reward that closed on a merge carries the message for
      the owner — whom to pay and where (BT11b). */
  readonly payMessage?: readonly string[];
  readonly record: BountyRecord;
  readonly outcome: 'rejected' | 'withdrawn' | 'already-ended';
}

// `close` is the one command that ends a bounty with nothing merged. On any
// open stage it works: with `--reason` the record lands `rejected` and keeps
// the reason on the event (what `reject` alone could do); without one it
// lands `withdrawn` (what `withdraw` did, including on a draft). On an ended
// bounty it retries any outside work the ending still owes — the resync each
// old ending offered its own stage — and reports the ended state by name.
export function closeBounty(repoRoot: string, id: string, reason?: string): CloseOutcome {
  const text = reason?.trim() ?? '';
  if (reason !== undefined && text === '') {
    throw new BountyRefused('missing-reason', `close needs a nonempty reason or none; next: omakase-box close ${id}, or omakase-box close ${id} --reason "<why the bounty ended without a merge>"`);
  }
  syncBeforeAction(repoRoot, id);
  const record = loadRecord(repoRoot, id);
  if (isOpenStage(record.stage) && adoptedWithoutPermission(repoRoot, record)) {
    throw new BountyRefused('owner-permission-needed', `${id} was posted from another machine, and this machine's owner has given no permission for this repository; a shared record grants none; nothing changed; next: ask the owner — omakase-box allow <owner/name> gives it`);
  }
  if (!isOpenStage(record.stage)) {
    const settled = record.github === undefined ? record : sendDecision(repoRoot, id);
    const retryPay = payNotice(settled, boundAmount(settled));
    return { record: settled, outcome: 'already-ended', ...(retryPay === null ? {} : { payMessage: retryPay }) };
  }
  settleScanFindings(repoRoot, record, 'ended');
  if (text !== '') {
    transitionTo(repoRoot, record, 'rejected', { reason: text, command: 'close' });
  } else {
    transitionTo(repoRoot, record, 'withdrawn', { command: 'close' });
  }
  dropDurabilityRefs(repoRoot, record);
  const ended = record.github === undefined ? record : sendDecision(repoRoot, id);
  // BT32: a posted bounty ending is a shared chain event (a draft's close
  // is not — the draft never left the machine, so its ending does not either).
  if (ended.github?.issue !== undefined && ended.github?.issue !== null) {
    shareClosed(repoRoot, ended, text !== '' ? 'rejected' : 'withdrawn', text !== '' ? text : undefined, false);
  }
  const payMessage = payNotice(ended, boundAmount(ended));
  return { record: ended, outcome: text !== '' ? 'rejected' : 'withdrawn', ...(payMessage === null ? {} : { payMessage }) };
}
