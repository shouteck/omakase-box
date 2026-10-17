// `box bounty find <query>` (BT28): recall by purpose. Nothing else finds a
// bounty by what it was for — `status --since` filters by time only and the
// record shape is the tool's own (asRecord migrates old shapes a grep would
// not survive). Case-insensitive substring over each readable record's id,
// title, why, part-of (or the retired job file), task text and saved-job
// note. Open matches list first, then ended newest first; the text view is
// bounded at FIND_RESULT_LIMIT and says the total either way.

import { BountyRefused } from './errors.js';
import { isOpenStage,noticeMergedOnce } from './record.js';
import { searchRecords } from './store.js';
import type { BountyRecord } from './record.js';

export const FIND_RESULT_LIMIT = 20;

export interface FindMatch {
  readonly record: BountyRecord;
  /** The record fields the query matched, in record order — named on the
      text line as `matched: title, why`. */
  readonly fields: readonly string[];
}

// The haystack per searchable field. partOf is today's relation name; the
// retired job file is the same fact on records old enough to carry it.
const haystacks = (record: BountyRecord): readonly (readonly [string, string | undefined])[] => [
  ['id', record.id],
  ['title', record.title],
  ['why', record.why],
  ['part-of', record.partOf ?? record.job?.file],
  ['task', record.content?.task.text],
  ['resume note', record.resume?.kind === 'recorded' ? record.resume.note ?? undefined : undefined]
];

export function findBounties(repoRoot: string, query: string): { readonly total: number; readonly matches: readonly FindMatch[] } {
  const needle = query.trim().toLowerCase();
  if (needle === '') throw new BountyRefused('missing-query', 'find needs words to look for — box bounty find "<words>"');
  // The merged-solution scan still runs first — a record read is the moment
  // an outside merge is recognised, and find is a record read. The matching
  // itself is the store's: one plain substring search, the same on every
  // Node — then the same per-field check names what matched, so `matched:`
  // reads as it always has.
  noticeMergedOnce(repoRoot);
  const candidates = searchRecords(repoRoot, needle);
  const matches: FindMatch[] = [];
  for (const record of candidates) {
    const fields = haystacks(record).filter(([, text]) => text?.toLowerCase().includes(needle)).map(([field]) => field);
    if (fields.length > 0) matches.push({ record, fields });
  }
  // Open work leads; ended records follow, most recently ended first.
  const endedAt = (record: BountyRecord): string => record.events.at(-1)?.at ?? record.createdAt;
  const open = matches.filter(match => isOpenStage(match.record.stage));
  const ended = matches.filter(match => !isOpenStage(match.record.stage)).sort((a, b) => endedAt(b.record).localeCompare(endedAt(a.record)) || b.record.id.localeCompare(a.record.id));
  return { total: matches.length, matches: [...open, ...ended] };
}

export function renderFind(repoRoot: string, query: string): string {
  const { total, matches } = findBounties(repoRoot, query);
  if (total === 0) {
    return [`find ${JSON.stringify(query)} — no bounty record matches`, 'next: box bounty status lists what this project knows'].join('\n');
  }
  const shown = matches.slice(0, FIND_RESULT_LIMIT);
  const lines = [`find ${JSON.stringify(query)} — ${total} ${total === 1 ? 'match' : 'matches'}${total > shown.length ? `, the first ${shown.length}` : ''}:`];
  for (const { record, fields } of shown) {
    lines.push(`  ${record.id}  ${record.stage}  ${JSON.stringify(record.title)} (matched: ${fields.join(', ')})`);
  }
  lines.push(`next: box bounty status <id> reads one record; box bounty status lists all${total > shown.length ? ` — ${total - shown.length} more match(es) under status --full` : ''}`);
  return lines.join('\n');
}

type JsonObject = Record<string, unknown>;

export function findDocument(repoRoot: string, query: string): JsonObject {
  const { total, matches } = findBounties(repoRoot, query);
  return {
    schema: 'box-bounty/find@1',
    query,
    total,
    matches: matches.map(({ record, fields }) => ({
      id: record.id,
      title: record.title,
      stage: record.stage,
      open: isOpenStage(record.stage),
      matched: [...fields],
      createdAt: record.createdAt,
      lastEventAt: record.events.at(-1)?.at ?? null
    }))
  };
}
