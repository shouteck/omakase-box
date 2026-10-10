// The bounty record: a small JSON file per bounty at `.box/bounties/<id>.json`
// inside the repository, so any later agent — in a later session, on any host —
// can see where each bounty is in its journey and what to do next. The tool
// writes the file; committing it is the agent's normal flow.
//
// The record is a state machine over the journey's stages, not scattered
// booleans: `stage` is the current state and `events` appends one entry per
// transition, so history is never rewritten. This wave's commands only ever
// reach `posted`/`withdrawn`, but the stage set is the whole journey's so BT3
// extends the same record rather than redesigning it.
//
// Durability: `bounty create` also pins `refs/box-bounty/<id>` at the snapshot
// commit, so `git gc --prune=now` cannot take the bytes the identifier names.
// `withdraw` removes the ref.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { git, gitOutcome } from './git.js';

export type OpenStage = 'drafted' | 'confirmed' | 'posted' | 'taken' | 'answered' | 'verified';
export type EndedStage = 'applied' | 'rejected' | 'withdrawn' | 'expired';
export type BountyStage = OpenStage | EndedStage;

const OPEN_STAGES: ReadonlySet<BountyStage> = new Set(['drafted', 'confirmed', 'posted', 'taken', 'answered', 'verified']);
export const isOpenStage = (stage: BountyStage): stage is OpenStage => OPEN_STAGES.has(stage);

export interface StageEvent {
  readonly stage: BountyStage;
  readonly at: string;
  readonly destination?: string; // recorded on the `posted` event
  readonly reason?: string; // recorded on `rejected`: the named failure class plus the check's exit and output tail
}

export interface AnswerSpec {
  /** A commit parented on snapshot.baseCommit whose tree is the base plus the
      solver's extracted change — built on a temporary index, merged by `apply`.
      Pinned at refs/box-bounty/<id>-answer while the bounty is open. */
  readonly commit: string;
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
}

export interface BountyRecord {
  readonly schemaVersion: 1;
  readonly kind: 'box-bounty-record';
  readonly id: string; // bt-<12 hex>, the same id bounty.json carries
  readonly title: string;
  readonly level: 'mechanical' | 'reviewed';
  /** Owner context from `create --job`: lives only in this record — never in
      bounty.json, the listing or the shipped folder. */
  readonly job?: { readonly file: string; readonly text: string } | null;
  /** sha256 of the exact bounty.json bytes `create` wrote: the answer's manifest
      must come back byte-identical, which is what binds it to this bounty. */
  readonly manifestSha256?: string;
  stage: BountyStage; // the latest event's stage, denormalized for a one-glance read
  /** Absolute path of the bounty folder `create` wrote. The record lives on the
      machine that made the bounty, so an absolute path is honest. */
  readonly folder: string;
  readonly snapshot: { readonly commit: string; readonly tree: string; readonly baseCommit: string | null };
  readonly createdAt: string;
  /** The extracted answer once one has landed (`answered`/`verified`/`applied`
      stages). Null until then. */
  answer?: AnswerSpec | null;
  /** Set when a merge onto current code conflicted and was aborted clean; the
      record stays `verified`/`answered` and these paths are the next step.
      Cleared when a later apply lands. */
  conflicts?: { readonly paths: readonly string[]; readonly at: string } | null;
  events: StageEvent[];
}

export interface ListedBounty {
  /** Null when the file exists but cannot be read as a record — status still
      names it rather than silently dropping it. */
  readonly record: BountyRecord | null;
  readonly file: string;
}

export interface RecordSeed {
  readonly id: string;
  readonly title: string;
  readonly level: 'mechanical' | 'reviewed';
  readonly snapshot: { readonly commit: string; readonly tree: string; readonly baseCommit: string | null };
  readonly folder: string;
  readonly createdAt: string;
  readonly job?: { readonly file: string; readonly text: string } | null;
  readonly manifestSha256?: string;
}

export const refName = (id: string): string => `refs/box-bounty/${id}`;

// An open bounty can pin two commits: the snapshot at <id> and, once an answer
// has been built, the answer commit at <id>-answer (its parent is the base
// commit, so it does not keep the snapshot alive on its own). Every end stage
// deletes both. Best-effort: a missing ref is exactly the state left behind.
export function dropDurabilityRefs(repoRoot: string, id: string): void {
  gitOutcome(repoRoot, ['update-ref', '-d', refName(id)]);
  gitOutcome(repoRoot, ['update-ref', '-d', `${refName(id)}-answer`]);
}
export const recordDir = (repoRoot: string): string => join(repoRoot, '.box', 'bounties');
export const recordPath = (repoRoot: string, id: string): string => join(recordDir(repoRoot), `${id}.json`);

export const persistRecord = (repoRoot: string, record: BountyRecord): void => {
  writeFileSync(recordPath(repoRoot, record.id), JSON.stringify(record, null, 2) + '\n');
};

const asRecord = (parsed: unknown): BountyRecord | null => {
  const record = parsed as BountyRecord;
  if (record === null || typeof record !== 'object') return null;
  if (record.kind !== 'box-bounty-record' || typeof record.id !== 'string') return null;
  if (typeof record.stage !== 'string' || !Array.isArray(record.events) || typeof record.folder !== 'string') return null;
  return record;
};

export function loadRecord(repoRoot: string, id: string): BountyRecord {
  const path = recordPath(repoRoot, id);
  if (!existsSync(path)) {
    throw new BountyRefused('unknown-bounty', `no bounty ${id} — .box/bounties/${id}.json does not exist. Run box bounty status to list the bounties this project knows`);
  }
  let record: BountyRecord | null = null;
  try {
    record = asRecord(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    record = null;
  }
  if (record === null) {
    throw new BountyRefused('record-corrupt', `${path} is not a readable bounty record — open it by hand, or remove it and run box bounty status again`);
  }
  return record;
}

// `bounty create` calls this after the folder is in place: pin the snapshot
// commit under refs/box-bounty/<id> so gc cannot prune it, then write the
// record at stage `drafted`. A Git failure here is operational (exit 1) — the
// folder already exists and the error says so.
export function writeNewRecord(repoRoot: string, seed: RecordSeed): { record: BountyRecord; path: string } {
  const record: BountyRecord = {
    schemaVersion: 1,
    kind: 'box-bounty-record',
    id: seed.id,
    title: seed.title,
    level: seed.level,
    ...(seed.job !== undefined ? { job: seed.job } : {}),
    ...(seed.manifestSha256 !== undefined ? { manifestSha256: seed.manifestSha256 } : {}),
    stage: 'drafted',
    folder: seed.folder,
    snapshot: { ...seed.snapshot },
    createdAt: seed.createdAt,
    events: [{ stage: 'drafted', at: seed.createdAt }]
  };
  git(repoRoot, ['update-ref', refName(seed.id), seed.snapshot.commit]);
  const path = recordPath(repoRoot, seed.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n');
  return { record, path };
}

export function listRecords(repoRoot: string): ListedBounty[] {
  const dir = recordDir(repoRoot);
  if (!existsSync(dir)) return [];
  const listed: ListedBounty[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    let record: BountyRecord | null = null;
    try {
      record = asRecord(JSON.parse(readFileSync(join(dir, entry), 'utf8')));
    } catch {
      record = null;
    }
    listed.push({ record, file: entry });
  }
  listed.sort((a, b) => (a.record?.createdAt ?? a.file).localeCompare(b.record?.createdAt ?? b.file));
  return listed;
}

const nextStep = (record: BountyRecord): string => {
  switch (record.stage) {
    case 'drafted': return `the owner's yes comes first — run box bounty confirm ${record.id} once they approve the preview`;
    case 'confirmed': return `deliver it — run box bounty post ${record.id} --to <dir>`;
    case 'posted': return `wait for the solver — when the bounty folder comes back, run box bounty answer ${record.id} --from <dir>`;
    case 'taken': return 'an answer is being verified against the snapshot it was made for — run box bounty status again in a moment';
    case 'answered': return `a person reads the answer — run box bounty apply ${record.id} to land it on the current code, or box bounty reject ${record.id} --reason "<why>"`;
    case 'verified':
      return record.conflicts !== null && record.conflicts !== undefined
        ? `the merge onto current code conflicts in ${record.conflicts.paths.join(', ')} — it was aborted and nothing changed. Resolve those paths and commit, then box bounty apply ${record.id} retries; or end it with box bounty reject ${record.id} --reason "<why>"`
        : `the check passed on the snapshot the answer was made for — run box bounty apply ${record.id} to merge it onto the current code`;
    default: return 'ended — nothing to do';
  }
};

// Cold-read surface for a fresh agent: every open bounty with id, stage and the
// next step; ended bounties one compact line; an empty project says so and says
// what to do. Never prints nothing.
export function renderStatus(repoRoot: string): string {
  const listed = listRecords(repoRoot);
  const open = listed.filter(entry => entry.record !== null && isOpenStage(entry.record.stage));
  const ended = listed.filter(entry => entry.record !== null && !isOpenStage(entry.record.stage));
  const corrupt = listed.filter(entry => entry.record === null);
  const lines: string[] = [];
  if (open.length === 0) {
    lines.push(`box bounty status — no open bounties in ${repoRoot}`);
    lines.push('next: create one with box bounty create --title "<one line>" --task <file> --out <dir>');
  } else {
    lines.push(`box bounty status — ${open.length} open ${open.length === 1 ? 'bounty' : 'bounties'} in ${repoRoot}`);
    for (const entry of open) {
      const record = entry.record!;
      lines.push(`  ${record.id}  ${record.stage}  "${record.title}"`);
      lines.push(`      next: ${nextStep(record)}`);
    }
  }
  if (ended.length === 0) lines.push('ended: none');
  else lines.push(`ended: ${ended.map(entry => {
    const record = entry.record!;
    // applied/rejected name the job the bounty came from, so the record alone
    // says which piece of work is unblocked — falling back to the title.
    if (record.stage === 'applied' || record.stage === 'rejected') return `${record.id} ${record.stage} (job: ${record.job?.file ?? record.title})`;
    return `${record.id} ${record.stage}`;
  }).join(', ')}`);
  for (const entry of corrupt) lines.push(`  ! ${entry.file} — not a readable record`);
  return lines.join('\n');
}

// Appends one stage event and persists — history is appended, never rewritten.
// `reason` records why a `rejected` transition happened (failure class plus the
// check's exit and output tail); `destination` records where `posted` went.
export const transitionTo = (repoRoot: string, record: BountyRecord, stage: BountyStage, extra?: { destination?: string; reason?: string }): void => {
  record.events.push({
    stage,
    at: new Date().toISOString(),
    ...(extra?.destination !== undefined ? { destination: extra.destination } : {}),
    ...(extra?.reason !== undefined ? { reason: extra.reason } : {})
  });
  record.stage = stage;
  persistRecord(repoRoot, record);
};

export function confirmBounty(repoRoot: string, id: string): BountyRecord {
  const record = loadRecord(repoRoot, id);
  if (record.stage !== 'drafted') {
    throw new BountyRefused('not-drafted', `bounty ${id} is ${record.stage}, not drafted — only a drafted bounty can be confirmed`);
  }
  transitionTo(repoRoot, record, 'confirmed');
  return record;
}

const toPosix = (path: string): string => path.split('\\').join('/');

export function postBounty(repoRoot: string, id: string, toDir: string): { record: BountyRecord; destination: string } {
  const record = loadRecord(repoRoot, id);
  // The confirmed gate is the owner's-yes boundary: nothing is delivered before it.
  if (record.stage !== 'confirmed') {
    throw new BountyRefused('not-confirmed', `bounty ${id} is ${record.stage} — only a confirmed bounty may be posted. The owner's yes (box bounty confirm ${id}) is the boundary nothing crosses without`);
  }
  if (!existsSync(record.folder) || !statSync(record.folder).isDirectory()) {
    throw new BountyRefused('folder-missing', `the recorded bounty folder ${record.folder} is gone — recreate it with box bounty create, or run box bounty withdraw ${id} to end this bounty`);
  }
  let manifestId: string | null = null;
  try {
    const parsed = JSON.parse(readFileSync(join(record.folder, 'bounty.json'), 'utf8')) as { id?: unknown };
    manifestId = typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    manifestId = null;
  }
  if (manifestId !== id) {
    throw new BountyRefused('folder-mismatch', `${join(record.folder, 'bounty.json')} does not name bounty ${id} — the recorded folder is not the bounty it should deliver`);
  }
  const dest = resolve(toDir);
  const destReal = existsSync(dest) ? realpathSync(dest) : dest;
  if (existsSync(destReal) && !statSync(destReal).isDirectory()) {
    throw new BountyRefused('destination-exists', `--to ${toDir} resolves to ${destReal}, which exists and is not a directory — point --to at a directory the bounty can be copied into`);
  }
  const destination = join(destReal, id);
  // The delivered copy must never sit inside the repository: it would ship
  // inside the next bounty. realpath the --to dir so a junction spelling
  // pointing back into the checkout cannot slip past the containment check.
  const rootKey = `${toPosix(realpathSync(repoRoot)).toLowerCase()}/`;
  const destKey = `${toPosix(destination).toLowerCase()}/`;
  if (destKey.startsWith(rootKey)) {
    throw new BountyRefused('destination-inside-repo', `--to ${toDir} would put ${destination} inside the repository — a delivered copy there would ship inside the next bounty. Point --to outside the checkout`);
  }
  if (existsSync(destination)) {
    throw new BountyRefused('destination-exists', `${destination} already exists — a delivered copy is never overwritten. Remove it or pick another --to`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(record.folder, destination, { recursive: true }); // copy, not move — the recorded folder stays
  transitionTo(repoRoot, record, 'posted', { destination });
  return { record, destination };
}

export interface WithdrawOutcome {
  readonly record: BountyRecord;
  readonly outcome: 'withdrawn' | 'already-withdrawn';
}

export function withdrawBounty(repoRoot: string, id: string): WithdrawOutcome {
  const record = loadRecord(repoRoot, id);
  if (record.stage === 'withdrawn') return { record, outcome: 'already-withdrawn' };
  if (!isOpenStage(record.stage)) {
    throw new BountyRefused('already-ended', `bounty ${id} already ended (${record.stage}) — withdraw only ends an open bounty`);
  }
  transitionTo(repoRoot, record, 'withdrawn');
  dropDurabilityRefs(repoRoot, id);
  return { record, outcome: 'withdrawn' };
}

// `reject` ends a bounty an answer can have reached — posted onward — with the
// reason kept on the event. Earlier stages end through `withdraw` instead.
const REJECTABLE: ReadonlySet<BountyStage> = new Set(['posted', 'taken', 'answered', 'verified']);

export function rejectBounty(repoRoot: string, id: string, reason: string): BountyRecord {
  const text = reason.trim();
  if (text === '') {
    throw new BountyRefused('missing-reason', `reject needs a reason — box bounty reject ${id} --reason "<why this answer did not land>"`);
  }
  const record = loadRecord(repoRoot, id);
  if (!isOpenStage(record.stage)) {
    throw new BountyRefused('already-ended', `bounty ${id} already ended (${record.stage}) — there is nothing left to reject`);
  }
  if (!REJECTABLE.has(record.stage)) {
    throw new BountyRefused('wrong-stage', `bounty ${id} is ${record.stage} — reject ends a bounty once it is posted; to end it before that run box bounty withdraw ${id}`);
  }
  transitionTo(repoRoot, record, 'rejected', { reason: text });
  dropDurabilityRefs(repoRoot, id);
  return record;
}
