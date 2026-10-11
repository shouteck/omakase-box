// bounty.json is the self-describing manifest inside every bounty folder: identity,
// the task and note, the snapshot identifier a later wave recreates the base from,
// every shipped file with its hash (so an answer can be bound to this bounty), the
// licence fact, and the never-ship accounting — rule names and removal counts,
// never the removed files' names.
//
// It carries no command. Checks were removed on 11 October 2026: a bounty is the
// task, the note, the why and the code, and nothing a solver wrote is ever run.
// Manifests written before that day keep their setup/check/guard/level keys on
// disk — readers ignore the extra keys, and the answer's binding still holds.
//
// This wave only writes the manifest, so it is a plain type: there is no zod schema
// here because box-bounty carries no package.json and resolves no dependencies.
// When a later wave reads bounty.json back it can add a schema on its own boundary.

export interface BountyManifest {
  readonly schemaVersion: 1;
  readonly kind: 'box-bounty';
  readonly id: string; // bt-<12 hex>
  readonly title: string;
  readonly createdAt: string;
  readonly tool: string;
  readonly task: { readonly file: string; readonly text: string };
  readonly note: { readonly file: string; readonly text: string } | null;
  /** The licence fact the listing states: whether the shipped set carries a
      licence file at the repository root and its name (`file`, null when none),
      plus the licence a shipped package.json declares (`declared`, null when
      absent). A stated fact, never a promise. Absent on manifests written
      before this wave — `licenceOf` derives `file` from the file list then. */
  readonly licence?: { readonly file: string | null; readonly declared: string | null };
  readonly snapshot: {
    readonly commit: string;
    readonly tree: string;
    readonly baseCommit: string | null;
  };
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
  readonly counts: { readonly files: number; readonly bytes: number; readonly removed: number };
  readonly neverShip: readonly { readonly rule: string; readonly removed: number }[];
}
