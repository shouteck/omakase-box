import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MANDATORY_KINDS, READINESS_KINDS, classifySolveOutcome, evaluatePublishGate, validateReadinessRecord, ReadinessInvalid } from '../../../services/private-api/readiness/model.js';
import type { ReadinessRecord } from '../../../services/private-api/readiness/model.js';

const hex = (seed: number) => seed.toString(16).padStart(64, '0').slice(0, 64);
const actor = randomUUID();
const taskId = randomUUID();

const record = (kind: ReadinessRecord['kind'], status: ReadinessRecord['status'], over: Record<string, unknown> = {}): ReadinessRecord => validateReadinessRecord({
  recordId: randomUUID(), taskId, taskVersion: 2, packageDigest: hex(10), kind, status,
  reasonCode: status === 'passed' ? null : 'synthetic_reason', classifiedOutcome: null,
  detailsDigest: null, assurance: 'tested', recordedBy: actor, recordedAt: '2026-10-04T00:00:00.000Z', ...over,
});

const mandatory = () => (MANDATORY_KINDS as readonly string[]).map(kind => record(kind as ReadinessRecord['kind'], 'passed'));
const gate = (records: ReadinessRecord[], over: Record<string, unknown> = {}) => evaluatePublishGate({ taskId, taskVersion: 2, packageDigest: hex(10), releaseApproved: true, records, ...over });

describe('validateReadinessRecord — strict bounded records', () => {
  it('accepts a well-formed record for every declared kind', () => {
    for (const kind of READINESS_KINDS) expect(record(kind, 'passed').kind).toBe(kind);
  });
  it('rejects unknown fields, bad digests and malformed ids', () => {
    expect(() => validateReadinessRecord({ ...record('fresh_build', 'passed'), extra: 1 })).toThrowError(ReadinessInvalid);
    expect(() => validateReadinessRecord({ ...record('fresh_build', 'passed'), packageDigest: 'zzz' })).toThrowError(ReadinessInvalid);
    expect(() => validateReadinessRecord({ ...record('fresh_build', 'passed'), taskVersion: 0 })).toThrowError(ReadinessInvalid);
  });
  it('rejects contradictory status/reason shapes', () => {
    expect(() => record('fresh_build', 'passed', { reasonCode: 'oops' })).toThrowError(ReadinessInvalid);
    expect(() => record('fresh_build', 'failed', { reasonCode: null })).toThrowError(ReadinessInvalid);
  });
  it('a failed external solve must carry a classified outcome', () => {
    expect(() => record('external_solve', 'failed', { reasonCode: 'solve_failed', classifiedOutcome: null })).toThrowError(/solve_unclassified/);
    expect(record('external_solve', 'failed', { reasonCode: 'solve_failed', classifiedOutcome: 'infrastructure' }).classifiedOutcome).toBe('infrastructure');
  });
  it('script-like classification values are never accepted', () => {
    expect(() => record('external_solve', 'failed', { reasonCode: 'x', classifiedOutcome: 'ambiguity' })).toThrowError(ReadinessInvalid);
    expect(() => record('external_solve', 'failed', { reasonCode: 'x', classifiedOutcome: 'human_difficulty' })).toThrowError(ReadinessInvalid);
  });
});

describe('classifySolveOutcome — bounded failure classes, never ambiguity', () => {
  it('maps only the four declared classes', () => {
    expect(classifySolveOutcome('infrastructure')).toBe('infrastructure');
    expect(classifySolveOutcome('specification')).toBe('specification');
    expect(classifySolveOutcome('implementation')).toBe('implementation');
    for (const value of ['ambiguity', 'human_difficulty', 'too_hard', {}, null, 'infrastructure ']) {
      expect(classifySolveOutcome(value)).toBe('other');
    }
  });
});

describe('evaluatePublishGate — missing or pending evidence blocks publication', () => {
  it('passes only with approval, all mandatory records passed and a passed solve', () => {
    const result = gate([...mandatory(), record('external_solve', 'passed')]);
    expect(result).toMatchObject({ decision: 'publishable', reasons: [] });
  });
  it('any missing mandatory record blocks', () => {
    for (const kind of MANDATORY_KINDS) {
      const result = gate([...mandatory().filter(item => item.kind !== kind), record('external_solve', 'passed')]);
      expect(result.decision).toBe('blocked');
      expect(result.reasons).toContainEqual({ code: 'missing_readiness', kind });
    }
  });
  it('missing release approval blocks even with full evidence', () => {
    expect(gate([...mandatory(), record('external_solve', 'passed')], { releaseApproved: false }).reasons).toContainEqual({ code: 'missing_approval', kind: null });
  });
  it('unverified records are pending, not completed — they block', () => {
    const result = gate([...mandatory().map(item => item.kind === 'fresh_build' ? { ...item, status: 'unverified' as const, reasonCode: 'pending' } : item), record('external_solve', 'passed')]);
    expect(result.reasons).toContainEqual({ code: 'readiness_unverified', kind: 'fresh_build' });
  });
  it('failed mandatory records block', () => {
    const result = gate([...mandatory().map(item => item.kind === 'traceability' ? { ...item, status: 'failed' as const, reasonCode: 'trace_gap' } : item), record('external_solve', 'passed')]);
    expect(result.reasons).toContainEqual({ code: 'readiness_failure', kind: 'traceability' });
  });
  it('records bound to a different package digest are a binding mismatch', () => {
    const foreign = [...mandatory(), record('external_solve', 'passed')].map(item => ({ ...item, packageDigest: hex(99) }));
    expect(gate(foreign).reasons).toContainEqual({ code: 'binding_mismatch', kind: 'fresh_build' });
  });
  it('a failed solve requires a passed human review — classified, not ambiguous', () => {
    const failedSolve = record('external_solve', 'failed', { reasonCode: 'solve_failed', classifiedOutcome: 'implementation' });
    expect(gate([...mandatory(), failedSolve]).reasons).toContainEqual({ code: 'human_review_required', kind: 'external_solve' });
    const withReview = gate([...mandatory(), failedSolve, record('human_review', 'passed')]);
    expect(withReview.decision).toBe('publishable');
  });
  it('an absent solve also requires the human readiness review alternative', () => {
    expect(gate(mandatory()).reasons).toContainEqual({ code: 'human_review_required', kind: 'external_solve' });
  });
  it('an unverified solve is pending evidence — blocked, not completed', () => {
    expect(gate([...mandatory(), record('external_solve', 'unverified', { reasonCode: 'pending' }), record('human_review', 'passed')]).reasons).toContainEqual({ code: 'readiness_unverified', kind: 'external_solve' });
  });
  it('a failed human review cannot substitute for itself', () => {
    const result = gate([...mandatory(), record('external_solve', 'failed', { reasonCode: 'x', classifiedOutcome: 'other' }), record('human_review', 'failed', { reasonCode: 'insufficient' })]);
    expect(result.decision).toBe('blocked');
    expect(result.reasons.some(reason => reason.code === 'human_review_required' || reason.code === 'readiness_failure')).toBe(true);
  });
});
