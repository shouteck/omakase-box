// K75 scanner, from the 23–24 November 2026 walkthrough (BT97): a Git call missing a defence. The defences (each Git call
// respects the ownership check, fetched objects are checked, …) are to be listed once, in docs/box-v4/GIT-DEFENCES.md, with
// a check on every call. Until BT97 writes that table, this scanner has nothing to read and says so. Mode: pending.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const id = 'git-defences';
export const mode = 'pending';
export const from = 'BT97: a Git call missing a defence';
export const switchesIn = 'BT97';
export const TABLE = 'docs/box-v4/GIT-DEFENCES.md';

/** Pending: no table, no rule to apply. BT97 replaces this with the check over every Git call. */
export function scan(_sources, root = '.') {
  return existsSync(join(root, TABLE))
    ? [{ file: TABLE, line: 1, fn: '(table)', detail: 'the table exists: BT97 must replace this pending scanner with its check' }]
    : [];
}
