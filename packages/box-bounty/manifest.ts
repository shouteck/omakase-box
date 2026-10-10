// bounty.json is the self-describing manifest inside every bounty folder: identity,
// the task and note, declared setup/check commands, the level, the snapshot
// identifier a later wave recreates the base from, every shipped file with its hash
// (so BT3 can seal and verify an answer), and the never-ship accounting — rule names
// and removal counts, never the removed files' names.
//
// This wave only writes the manifest, so it is a plain type: there is no zod schema
// here because box-bounty carries no package.json and resolves no dependencies.
// When a later wave reads bounty.json back it can add a schema on its own boundary.

export interface BountyCommand { readonly argv: readonly string[] }

export interface BountyCommandRun {
  readonly argv: readonly string[];
  readonly exit: number | null;
  readonly result: 'pass' | 'fail' | 'timeout' | 'error';
  readonly tail: string;
}

export interface BountyManifest {
  readonly schemaVersion: 1;
  readonly kind: 'box-bounty';
  readonly id: string; // bt-<12 hex>
  readonly title: string;
  readonly createdAt: string;
  readonly tool: string;
  readonly task: { readonly file: string; readonly text: string };
  readonly note: { readonly file: string; readonly text: string } | null;
  readonly setup: BountyCommand | null;
  readonly check: BountyCommand | null;
  /** A command the owner declared at `create --guard` as must-keep-passing —
      run again on the answer and reported as a fact. Bound by the manifest's
      sha256 like everything else in this file. Absent on manifests written
      before the flag existed. */
  readonly guard?: BountyCommand | null;
  readonly level: 'mechanical' | 'reviewed';
  readonly snapshot: {
    readonly commit: string;
    readonly tree: string;
    readonly baseCommit: string | null;
  };
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
  readonly counts: { readonly files: number; readonly bytes: number; readonly removed: number };
  readonly neverShip: readonly { readonly rule: string; readonly removed: number }[];
  readonly verification: { readonly setup: readonly BountyCommandRun[]; readonly check: BountyCommandRun | null; readonly guard?: BountyCommandRun | null } | null;
}
