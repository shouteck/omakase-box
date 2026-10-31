// Who may see a payee's owner-only methods, and on what. The rule lives here and
// nowhere else (PLATFORM-UX section 5, with D-2026-10-22-k43-decisions): only the
// poster of one bounty, on that bounty's page, while it owes this solver, or while
// the payee says that bounty's recorded payment has not arrived.
export type PaidEvent = { at: string; amount: number | null; withdrawn: number | null };
export type Receipt = { says: 'received' | 'not-received'; record_at: string; at: string };
export type Role = 'owner' | 'payee' | 'other';

const same = (a: string | null, b: string | null): boolean => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/** The latest `paid` event decides; a withdrawn one means no record stands. */
export function standingRecord(events: readonly PaidEvent[]): PaidEvent | null {
  const latest = [...events].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).at(-1);
  return latest === undefined || latest.withdrawn ? null : latest;
}

/** An answer about an earlier record says nothing about this one. */
export const currentReceipt = (record: PaidEvent | null, receipt: Receipt | null): Receipt | null =>
  record !== null && receipt !== null && receipt.record_at === record.at ? receipt : null;

export type PaymentFacts = {
  amount: number; poster: string;
  merged: readonly { number: number; author: string }[];
  record: PaidEvent | null;
  receipt: Receipt | null;
};

/** The one merged author of a rewarded bounty. More than one: the owner decides, and nobody is named. */
export const payeeOf = (facts: Pick<PaymentFacts, 'amount' | 'merged'>): string | null =>
  facts.amount > 0 && facts.merged.length === 1 ? facts.merged[0]!.author : null;

export function roleOf(facts: PaymentFacts, viewer: string | null): Role {
  if (same(viewer, facts.poster)) return 'owner';
  return same(viewer, payeeOf(facts)) ? 'payee' : 'other';
}

export function ownerOnlyAllowed(facts: PaymentFacts, viewer: string | null): boolean {
  if (payeeOf(facts) === null || !same(viewer, facts.poster)) return false;
  return facts.record === null || currentReceipt(facts.record, facts.receipt)?.says === 'not-received';
}
