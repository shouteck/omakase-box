// Who may see a payee's owner-only methods, and on what. The rule lives here and
// nowhere else (PLATFORM-UX section 5, with D-2026-10-22-k43-decisions): only the
// poster of one bounty, on that bounty's page, while it owes this solver, or while
// the payee says that bounty's recorded payment has not arrived.
export type PaidEvent = { at: string; amount: number | null; withdrawn: number | null; to?: string | null };
export type Receipt = { says: 'received' | 'not-received'; record_at: string; at: string };
export type Role = 'owner' | 'payee' | 'other';
/** Who is looking: the GitHub ID decides every role; the login is for showing a name (PF61). */
export type Viewer = { github_id: number; login: string };

/** Names only: matching a shown or recorded name. Never a permission: a login can change hands (PF61). */
export const same = (a: string | null, b: string | null): boolean => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/** The latest `paid` event or click decides; a withdrawn one means no record stands. */
export function standingRecord(events: readonly PaidEvent[]): PaidEvent | null {
  const latest = [...events].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).at(-1);
  return latest === undefined || latest.withdrawn ? null : latest;
}

/** An answer about an earlier record says nothing about this one. */
export const currentReceipt = (record: PaidEvent | null, receipt: Receipt | null): Receipt | null =>
  record !== null && receipt !== null && receipt.record_at === record.at ? receipt : null;

export type MergedAuthor = { number: number; author: string; author_id: number | null };
export type PaymentFacts = {
  amount: number; poster: string;
  /** PF61: the poster's GitHub ID as GitHub gave it; null on an older row, which then confirms nobody as owner. */
  poster_id: number | null;
  merged: readonly MergedAuthor[];
  record: PaidEvent | null;
  receipt: Receipt | null;
  /** PF32: a listed bounty, whose payee only a payment record names. */
  listed?: boolean;
};

/** The one merged author of a rewarded bounty. More than one: the owner decides, and nobody is named until a record names one
    of them (the record names a login among this bounty's own merged authors: a name match, not a permission). */
export function payeePull(facts: Pick<PaymentFacts, 'amount' | 'listed'> & { merged: readonly (Pick<MergedAuthor, 'number' | 'author'> & { author_id?: number | null })[]; record?: PaidEvent | null }) {
  if (facts.amount === 0) return null;
  if (facts.merged.length === 1 && facts.listed !== true) return facts.merged[0]!;
  return facts.merged.find(pull => same(pull.author, facts.record?.to ?? null)) ?? null;
}
export const payeeOf = (facts: Parameters<typeof payeePull>[0]): string | null => payeePull(facts)?.author ?? null;

/** PF61: by GitHub ID only. A row with no ID confirms nobody: the role is `other`, which hides and refuses (fails safe). */
export function roleOf(facts: PaymentFacts, viewer: Viewer | null): Role {
  if (viewer === null) return 'other';
  if (facts.poster_id !== null && viewer.github_id === facts.poster_id) return 'owner';
  const payee = payeePull(facts);
  return payee !== null && payee.author_id !== null && payee.author_id !== undefined && viewer.github_id === payee.author_id ? 'payee' : 'other';
}

export function ownerOnlyAllowed(facts: PaymentFacts, viewer: Viewer | null): boolean {
  if (payeePull(facts) === null || roleOf(facts, viewer) !== 'owner') return false;
  return facts.record === null || currentReceipt(facts.record, facts.receipt)?.says === 'not-received';
}
