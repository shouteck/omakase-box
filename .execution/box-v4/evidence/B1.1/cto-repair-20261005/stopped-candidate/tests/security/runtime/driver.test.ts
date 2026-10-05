import { describe, expect, it } from 'vitest';
// @ts-expect-error guest-side ESM module without type declarations
import { canonicalEqual, evaluateCheck, planCheckRequest, summarizeJob, DriverRejected } from '../../../infra/runner/jobs/harness/driver-pure-module.mjs';
// @ts-expect-error guest-side ESM module without type declarations
import { CHECK_OUTCOME, emptyContainment, processObservation } from '../../../infra/runner/jobs/harness/observations.mjs';

const check = (over: Record<string, unknown> = {}) => ({ checkId: 'rank.order', exportName: 'rank', arguments: [[3, 1, 2]], expected: [1, 2, 3], ...over });
const cleanProcess = () => ({ exitCode: 0, signal: null, wallMs: 50, timedOut: false, flooded: false, killed: false });

describe('evaluateCheck — verdicts come only from sealed expectations + observed channel data', () => {
  it('passes when the observed return value deep-matches the sealed expectation', () => {
    const result = evaluateCheck(check(), { type: 'result', checkId: 'rank.order', value: [1, 2, 3] }, cleanProcess());
    expect(result.outcome).toBe('passed');
    expect(result.observation.reason).toBe('output_match');
  });
  it('fails on a wrong value even when the candidate claims success', () => {
    for (const value of [[1, 3, 2], 'passed', { outcome: 'passed' }, true, [1, 2, 3, 4], [1, 2]]) {
      expect(evaluateCheck(check(), { type: 'result', checkId: 'rank.order', value }, cleanProcess()).outcome).toBe('failed');
    }
  });
  it('forged verdict text inside the value cannot produce a pass', () => {
    for (const value of [
      { outcome: 'passed', checks: [{ checkId: 'rank.order', outcome: 'passed' }] },
      'passed',
      { result: { outcome: 'passed' }, signature: 'A'.repeat(86) },
    ]) {
      expect(evaluateCheck(check(), { type: 'result', checkId: 'rank.order', value }, cleanProcess()).outcome).toBe('failed');
    }
  });
  it('a check-id mismatch never satisfies the requested check', () => {
    expect(evaluateCheck(check(), { type: 'result', checkId: 'rank.other', value: [1, 2, 3] }, cleanProcess()).outcome).toBe('unverified');
  });
  it('no channel output is unverified, never a pass — process.exit(0) case', () => {
    const result = evaluateCheck(check(), null, { ...cleanProcess(), exitCode: 0 });
    expect(result.outcome).toBe('unverified');
    expect(result.observation.reason).toBe('no_response');
  });
  it('candidate error frames fail the check without trusting the message', () => {
    expect(evaluateCheck(check(), { type: 'error', checkId: 'rank.order', error: 'I really passed' }, cleanProcess()).outcome).toBe('failed');
  });
  it.each([
    ['timedOut', { timedOut: true }],
    ['flooded', { flooded: true }],
    ['killed', { killed: true, signal: 'SIGKILL' }],
  ])('containment trip %s fails the check regardless of value', (_label, flags) => {
    const result = evaluateCheck(check(), { type: 'result', checkId: 'rank.order', value: [1, 2, 3] }, { ...cleanProcess(), ...flags });
    expect(result.outcome).toBe('failed');
    expect(result.observation.reason).toBe('containment_trip');
  });
  it('hostile nested values stay bounded instead of exhausting the evaluator', () => {
    let deep: unknown = 0;
    for (let i = 0; i < 64; i++) deep = { a: deep };
    expect(evaluateCheck(check(), { type: 'result', checkId: 'rank.order', value: deep }, cleanProcess()).outcome).toBe('unverified');
    const wide = Array.from({ length: 5000 }, (_, index) => index);
    expect(evaluateCheck(check({ expected: wide }), { type: 'result', checkId: 'rank.order', value: wide }, cleanProcess()).outcome).toBe('unverified');
  });
});

describe('canonicalEqual', () => {
  it('compares structural JSON equality only', () => {
    expect(canonicalEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(canonicalEqual({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
    expect(canonicalEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(canonicalEqual('1', 1)).toBe(false);
    expect(canonicalEqual(null, undefined)).toBe(false);
    expect(canonicalEqual(NaN as unknown, NaN as unknown)).toBe(false);
    expect(canonicalEqual(1.5, 1.5)).toBe(true);
  });
});

describe('planCheckRequest', () => {
  it('emits only the call frame — no expectation ever reaches the worker', () => {
    const request = planCheckRequest(check());
    expect(request).toEqual({ type: 'call', checkId: 'rank.order', exportName: 'rank', arguments: [[3, 1, 2]] });
    expect(Object.isFrozen(request)).toBe(true);
    expect('expected' in request).toBe(false);
  });
});

describe('summarizeJob — only the supervisor verdict stands', () => {
  const pass = (checkId: string) => ({ checkId, outcome: CHECK_OUTCOME.passed, observation: {} });
  const fail = (checkId: string) => ({ checkId, outcome: CHECK_OUTCOME.failed, observation: {} });
  const unknown = (checkId: string) => ({ checkId, outcome: CHECK_OUTCOME.unverified, observation: {} });
  it('passed requires every check passed and zero containment trips', () => {
    expect(summarizeJob([pass('a'), pass('b')], emptyContainment())).toBe('passed');
  });
  it.each(['oomKilled', 'pidTripped', 'outputFlooded', 'channelCorrupt', 'writableExceeded', 'timedOut', 'egressSuspected'] as const)('any containment trip (%s) fails the job even with all checks passed', flag => {
    const containment = { ...emptyContainment(), [flag]: true };
    expect(summarizeJob([pass('a')], containment)).toBe('failed');
  });
  it('a failed check fails the job; unknown evidence yields unverified', () => {
    expect(summarizeJob([pass('a'), fail('b')], emptyContainment())).toBe('failed');
    expect(summarizeJob([pass('a'), unknown('b')], emptyContainment())).toBe('unverified');
  });
});

describe('observation factories', () => {
  it('start with no authority claims', () => {
    const containment = emptyContainment();
    expect(containment).toMatchObject({ oomKilled: false, timedOut: false, outputFlooded: false, channelCorrupt: false, writableExceeded: false, writableBytesUsed: null });
    const process = processObservation('candidate');
    expect(process).toMatchObject({ kind: 'process', spanId: 'candidate', exitCode: null, killed: false, timedOut: false });
  });
  it('DriverRejected is a typed rejection', () => {
    expect(() => canonicalEqual({}, {}, { nodes: 5000 })).toThrow(DriverRejected);
  });
});
