import { expect, it } from 'vitest';
import {
  CALLER_ASSUMPTIONS_DISCLAIMER,
  CALLER_ASSUMPTIONS_LIMITS,
  CALLER_BOUND_SETS,
  checkCallerAssumptions
} from '../../../packages/evaluation/contracts/caller-assumptions.js';

const withinBounds = {
  caller: 'src/private/scoring-adapter.ts',
  boundSetId: 'ranker_bounded_v1',
  maxSuppliedItems: 4,
  idAlphabet: ['a', 'b', 'c', 'd'],
  scoreMin: 0,
  scoreMax: 2,
  neverMutatesInput: true,
  deterministic: true,
  unscoredHandling: 'explicit_refusal' as const
};

const verified = { boundedRankerStatus: 'passed' as const };

it('a fully declared caller whose assumptions sit inside the stated bounds and are verified is accepted', () => {
  const report = checkCallerAssumptions(withinBounds, verified);
  expect(report.assurance).toBe('bounded');
  expect(report.boundSetId).toBe('ranker_bounded_v1');
  expect(report.declarationProblem).toBeNull();
  expect(report.checks).toHaveLength(7);
  expect(report.outOfBounds).toEqual([]);
  expect(report.unverifiable).toEqual([]);
  expect(report.allWithinStatedBounds).toBe(true);
  for (const check of report.checks) {
    expect(check.classification).toBe('within_bounds');
    expect(check.detail.length).toBeGreaterThan(0);
  }
  expect(report.checks.filter(check => check.id === 'never_mutates_input' || check.id === 'deterministic').every(check => check.detail.includes('verified by a passing bounded ranker check'))).toBe(true);
});

it('a declared maximum above the stated item bound is out of bounds and blocks fit', () => {
  const report = checkCallerAssumptions({ ...withinBounds, maxSuppliedItems: 100 }, verified);
  expect(report.allWithinStatedBounds).toBe(false);
  expect(report.outOfBounds).toHaveLength(1);
  expect(report.outOfBounds[0]!.id).toBe('max_items');
  expect(report.outOfBounds[0]!.detail).toContain('declared maximum 100 exceeds the stated bound 4');
});

it('a declared id alphabet outside the stated alphabet is out of bounds', () => {
  const report = checkCallerAssumptions({ ...withinBounds, idAlphabet: ['a', 'e'] }, verified);
  expect(report.outOfBounds[0]!.id).toBe('id_alphabet');
  expect(report.outOfBounds[0]!.detail).toContain('e are outside the stated alphabet abcd');
});

it('a declared score range outside the stated bounds is out of bounds', () => {
  const above = checkCallerAssumptions({ ...withinBounds, scoreMax: 5 }, verified);
  expect(above.outOfBounds[0]!.id).toBe('score_max');
  expect(above.outOfBounds[0]!.detail).toContain('declared maximum 5 exceeds the stated bound 2');

  const below = checkCallerAssumptions({ ...withinBounds, scoreMin: -3 }, verified);
  expect(below.outOfBounds[0]!.id).toBe('score_min');
  expect(below.outOfBounds[0]!.detail).toContain('declared minimum -3 is below the stated bound 0');

  const empty = checkCallerAssumptions({ ...withinBounds, scoreMin: 2, scoreMax: 0 }, verified);
  expect(empty.outOfBounds.some(check => check.id === 'score_range')).toBe(true);
});

it('behavioural declarations without a passing bounded ranker check are unverifiable, never assumed', () => {
  const unverified = checkCallerAssumptions(withinBounds);
  expect(unverified.allWithinStatedBounds).toBe(false);
  expect(unverified.outOfBounds).toEqual([]);
  const unverifiableIds = unverified.unverifiable.map(check => check.id);
  expect(unverifiableIds).toEqual(['never_mutates_input', 'deterministic']);
  expect(unverified.unverifiable[0]!.detail).toContain('reported, not assumed');
});

it('a failed bounded ranker verification does not verify behavioural declarations', () => {
  const failed = checkCallerAssumptions(withinBounds, { boundedRankerStatus: 'failed' });
  expect(failed.allWithinStatedBounds).toBe(false);
  expect(failed.unverifiable.map(check => check.id)).toEqual(['never_mutates_input', 'deterministic']);
  const partial = checkCallerAssumptions(withinBounds, { boundedRankerStatus: 'unverified' });
  expect(partial.allWithinStatedBounds).toBe(false);
});

it('absent declarations are reported as unverifiable rather than assumed', () => {
  const report = checkCallerAssumptions({ caller: 'src/private/scoring-adapter.ts', boundSetId: 'ranker_bounded_v1' });
  expect(report.declarationProblem).toBeNull();
  expect(report.allWithinStatedBounds).toBe(false);
  const ids = report.unverifiable.map(check => check.id);
  expect(ids).toEqual(['max_items', 'id_alphabet', 'score_min', 'score_max', 'never_mutates_input', 'deterministic', 'unscored_handling']);
});

it('an unknown bound set leaves every declaration unverifiable', () => {
  const report = checkCallerAssumptions({ ...withinBounds, boundSetId: 'unbounded_claims_v99' }, verified);
  expect(report.declarationProblem).toBeNull();
  expect(report.allWithinStatedBounds).toBe(false);
  expect(report.unverifiable.some(check => check.id === 'bound_set')).toBe(true);
  expect(report.unverifiable.some(check => check.id === 'max_items')).toBe(true);
});

it('malformed declarations are reported, not guessed', () => {
  const scalar = checkCallerAssumptions('not-an-object');
  expect(scalar.declarationProblem).toContain('must be a strict object');
  expect(scalar.allWithinStatedBounds).toBe(false);
  const extraKeys = checkCallerAssumptions({ ...withinBounds, extraField: true });
  expect(extraKeys.declarationProblem).toContain('unknown key extraField');
  const wrongType = checkCallerAssumptions({ ...withinBounds, maxSuppliedItems: 'four' });
  expect(wrongTypes(wrongType.declarationProblem)).toBe(true);

  function wrongTypes(problem: string | null): boolean {
    return problem !== null && problem.includes('maxSuppliedItems');
  }
});

it('a silent default for unscored items is out of bounds', () => {
  const report = checkCallerAssumptions({ ...withinBounds, unscoredHandling: 'silent_default' }, verified);
  expect(report.outOfBounds[0]!.id).toBe('unscored_handling');
  expect(report.outOfBounds[0]!.detail).toContain('silent default score');
});

it('declared mutation or non-determinism contradict the published ranker contract', () => {
  const mutating = checkCallerAssumptions({ ...withinBounds, neverMutatesInput: false }, verified);
  expect(mutating.outOfBounds.some(check => check.id === 'never_mutates_input')).toBe(true);
  const nondeterministic = checkCallerAssumptions({ ...withinBounds, deterministic: false }, verified);
  expect(nondeterministic.outOfBounds.some(check => check.id === 'deterministic')).toBe(true);
});

it('every caller assumption report discloses limits, the disclaimer and the registered bound set values', () => {
  const report = checkCallerAssumptions(withinBounds, verified);
  expect(report.limits).toEqual(CALLER_ASSUMPTIONS_LIMITS);
  expect(CALLER_ASSUMPTIONS_LIMITS.join(' ')).toContain('reported explicitly and never assumed');
  expect(report.disclaimer).toBe(CALLER_ASSUMPTIONS_DISCLAIMER);
  expect(CALLER_ASSUMPTIONS_DISCLAIMER).toContain('not a semantic confidentiality or correctness proof');
  const boundSet = CALLER_BOUND_SETS['ranker_bounded_v1']!;
  expect(boundSet).toEqual({ id: 'ranker_bounded_v1', maxItems: 4, idAlphabet: ['a', 'b', 'c', 'd'], scoreMin: 0, scoreMax: 2 });
});
