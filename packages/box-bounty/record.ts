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
}

export interface BountyRecord {
  readonly schemaVersion: 1;
  readonly kind: 'box-bounty-record';
  readonly id: string; // bt-<12 hex>, the same id bounty.json carries
  readonly title: string;
  readonly level: 'mechanical' | 'reviewed';
  stage: BountyStage; // the latest event's stage, denormalized for a one-glance read
  /** Absolute path of the bounty folder `create` wrote. The record lives on the
      machine that made the bounty, so an absolute path is honest. */
  readonly folder: string;
  readonly snapshot: { readonly commit: string; readonly tree: string; readonly baseCommit: string | null };
  readonly createdAt: string;
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
}

const refName = (id: string): string => `refs/box-bounty/${id}`;
export const recordDir = (repoRoot: string): string => join(repoRoot, '.box', 'bounties');
export const recordPath = (repoRoot: string, id: string): string => join(recordDir(repoRoot), `${id}.json`);

const saveRecord = (repoRoot: string, record: BountyRecord): void => {
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
    case 'posted': return 'wait for the solver — the answer comes back through this tool; check box bounty status again later';
    case 'taken': case 'answered': case 'verified': return 'answer return arrives in wave BT3 — leave the record for a later session';
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
  else lines.push(`ended: ${ended.map(entry => `${entry.record!.id} ${entry.record!.stage}`).join(', ')}`);
  for (const entry of corrupt) lines.push(`  ! ${entry.file} — not a readable record`);
  return lines.join('\n');
}

const transition = (repoRoot: string, record: BountyRecord, stage: BountyStage, destination?: string): void => {
  record.events.push({ stage, at: new Date().toISOString(), ...(destination !== undefined ? { destination } : {}) });
  record.stage = stage;
  saveRecord(repoRoot, record);
};

export function confirmBounty(repoRoot: string, id: string): BountyRecord {
  const record = loadRecord(repoRoot, id);
  if (record.stage !== 'drafted') {
    throw new BountyRefused('not-drafted', `bounty ${id} is ${record.stage}, not drafted — only a drafted bounty can be confirmed`);
  }
  transition(repoRoot, record, 'confirmed');
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
  transition(repoRoot, record, 'posted', destination);
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
  transition(repoRoot, record, 'withdrawn');
  // Best-effort: a missing ref is exactly the state we want left behind.
  gitOutcome(repoRoot, ['update-ref', '-d', refName(id)]);
  return { record, outcome: 'withdrawn' };
}
