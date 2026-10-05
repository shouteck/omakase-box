import { createHash } from 'node:crypto';
import { canonical } from '../../runner-protocol/index.js';
import type { PatchMapping } from './patch-map.js';

const HASH = /^[a-f0-9]{64}$/;

export class DiffRejected extends Error {
  constructor(readonly code: string) { super(`Candidate diff rejected: ${code}.`); }
}

export interface CandidateDiff {
  readonly schemaVersion: 1;
  readonly privateBaseRevision: string;
  readonly submissionHash: string;
  readonly patchDigest: string;
  /** unitId → sorted paths the patch applies under that unit. */
  readonly units: Readonly<Record<string, readonly string[]>>;
  /** sha256 over the canonical record above — the acceptance binding. */
  readonly candidateDiffHash: string;
}

/**
 * Produce the private candidate diff as data against the exact pinned base:
 * a deterministic digest over {base revision, submission, patch, unit→path
 * mapping}. It is a record, never a merge or a deploy — the composed patch is
 * the only source of candidate bytes and stays hash-bound end to end.
 */
export function buildCandidateDiff(input: { privateBaseRevision: string; submissionHash: string; patchDigest: string; mapping: PatchMapping }): CandidateDiff {
  for (const field of ['privateBaseRevision', 'submissionHash', 'patchDigest'] as const) {
    if (typeof input[field] !== 'string' || !HASH.test(input[field])) throw new DiffRejected('invalid_diff');
  }
  if (input.mapping.unmappedPaths.length > 0) throw new DiffRejected('unmapped_paths');
  const units = Object.keys(input.mapping.units).sort().map(unitId => Object.freeze([unitId, input.mapping.units[unitId]!] as const));
  if (units.length === 0) throw new DiffRejected('empty_diff');
  const record = {
    schemaVersion: 1 as const,
    privateBaseRevision: input.privateBaseRevision,
    submissionHash: input.submissionHash,
    patchDigest: input.patchDigest,
    units: Object.freeze(Object.fromEntries(units)),
  };
  return Object.freeze({ ...record, candidateDiffHash: createHash('sha256').update(canonical(record)).digest('hex') });
}
