// The box bounty commands that live one level above the store: post and
// close. They compose record writes and outside sync — nothing here is read
// by record.ts. Moved out of record.ts unchanged (BT25); postBounty stays
// the two-line forwarder to postGitHub it was. (retiredRoute and
// requireCurrentDelivery are record-reading predicates with callers in
// github.ts and four other modules — they stayed in record.ts per the
// brief's lower-level-module rule, since moving them here would have closed
// a github.ts <-> commands.ts import cycle.)

import { BountyRefused } from './errors.js';
import { boundAmount } from './format.js';
import { postGitHub } from './post.js';
import { syncGitHubDecision } from './github.js';
import { payNotice } from './pay.js';
import { dropDurabilityRefs, isOpenStage, loadRecord, settleScanFindings, transitionTo } from './record.js';
import type { BountyRecord } from './record.js';

export function postBounty(repoRoot: string, id: string, to = 'github', opts?: { answered?: boolean; choice?: import('./gh.js').GitHubChoice }): { record: BountyRecord; destination: string } {
  if (to !== 'github') throw new BountyRefused('folder-delivery-retired', 'folder delivery was retired; post to GitHub with box bounty post <id>. A private repository cannot be handed off with this tool');
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
    throw new BountyRefused('missing-reason', `close needs a nonempty reason or none — box bounty close ${id}, or box bounty close ${id} --reason "<why the bounty ended without a merge>"`);
  }
  const record = loadRecord(repoRoot, id);
  if (!isOpenStage(record.stage)) {
    if (record.github !== undefined) syncGitHubDecision(repoRoot, record);
    const retryPay = payNotice(record, boundAmount(record));
    return { record, outcome: 'already-ended', ...(retryPay === null ? {} : { payMessage: retryPay }) };
  }
  settleScanFindings(repoRoot, record, 'ended');
  if (text !== '') {
    transitionTo(repoRoot, record, 'rejected', { reason: text, command: 'close' });
  } else {
    transitionTo(repoRoot, record, 'withdrawn', { command: 'close' });
  }
  dropDurabilityRefs(repoRoot, record);
  syncGitHubDecision(repoRoot, record);
  const payMessage = payNotice(record, boundAmount(record));
  return { record, outcome: text !== '' ? 'rejected' : 'withdrawn', ...(payMessage === null ? {} : { payMessage }) };
}
