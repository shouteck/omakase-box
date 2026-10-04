import { expect, it } from 'vitest';
import {
  BOUNDED_RANKER_DISCLAIMER,
  BOUNDED_RANKER_ID_ALPHABET,
  BOUNDED_RANKER_LIMITS,
  BOUNDED_RANKER_MAX_ITEMS,
  BOUNDED_RANKER_SCORE_MAX,
  BOUNDED_RANKER_SCORE_MIN,
  BoundedRankerInvalidInput,
  boundedRankerInvalidCases,
  boundedRankerValidCases,
  checkBoundedRanker,
  rankBounded
} from '../../../packages/evaluation/contracts/bounded-ranker.js';
import type { BoundedRankerProbe } from '../../../packages/evaluation/contracts/bounded-ranker.js';

function independentReferenceRank(items: readonly { id: string; score: number }[]): readonly { id: string; score: number }[] {
  const copy = items.map(item => ({ ...item }));
  const ordered: { id: string; score: number }[] = [];
  const remaining = [...copy];
  while (remaining.length > 0) {
    let best = remaining[0]!;
    for (const candidate of remaining) {
      if (candidate.score > best.score) best = candidate;
      else if (candidate.score === best.score && candidate.id < best.id) best = candidate;
    }
    ordered.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }
  return ordered;
}

function probeOf(name: string, rank: (input: unknown) => readonly unknown[]): BoundedRankerProbe {
  return {
    name,
    observe: input => {
      try {
        return { observed: 'result' as const, output: rank(input) };
      } catch (error) {
        return { observed: 'refused' as const, reason: error instanceof Error ? error.message.slice(0, 160) : 'refused' };
      }
    }
  };
}

it('the valid bounded domain is exactly arrays of length 0..4 with ids a..d without repetition and integer scores 0..2', () => {
  const cases = boundedRankerValidCases();
  let expected = 0;
  for (let length = 0; length <= 4; length++) {
    let arrangements = 1;
    for (let index = 0; index < length; index++) arrangements *= 4 - index;
    expected += arrangements * 3 ** length;
  }
  expect(expected).toBe(2713);
  expect(cases).toHaveLength(2713);
  const seen = new Set<string>();
  for (const boundedCase of cases) {
    expect(seen.has(boundedCase.caseId)).toBe(false);
    seen.add(boundedCase.caseId);
    expect(boundedCase.input.length).toBeLessThanOrEqual(4);
    const ids = boundedCase.input.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of boundedCase.input) {
      expect(BOUNDED_RANKER_ID_ALPHABET).toContain(item.id);
      expect(item.score).toBeGreaterThanOrEqual(BOUNDED_RANKER_SCORE_MIN);
      expect(item.score).toBeLessThanOrEqual(BOUNDED_RANKER_SCORE_MAX);
      expect(Number.isInteger(item.score)).toBe(true);
    }
  }
});

it('the bounded ranker model matches an independently written reference over the whole 2713-case domain', () => {
  for (const boundedCase of boundedRankerValidCases()) {
    const expected = independentReferenceRank(boundedCase.input);
    expect(rankBounded(boundedCase.input)).toEqual(expected);
  }
});

it('the model ranks deterministically, returns all items once, and never mutates or aliases its input', () => {
  const input = [{ id: 'b', score: 2 }, { id: 'a', score: 2 }, { id: 'c', score: 0 }];
  const pinned = JSON.stringify(input);
  const first = rankBounded(input);
  const second = rankBounded(input);
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  expect(first.map(item => item.id)).toEqual(['a', 'b', 'c']);
  expect(JSON.stringify(input)).toBe(pinned);
  expect(first).not.toBe(input as never);
  expect(first[0]).not.toBe(input[1] as never);
  const frozen: readonly { id: 'a' | 'b' | 'c' | 'd'; score: 0 | 1 | 2 }[] = Object.freeze([{ id: 'd', score: 1 }, { id: 'a', score: 1 }]);
  expect(rankBounded(frozen).map(item => item.id)).toEqual(['a', 'd']);
  expect(rankBounded([])).toEqual([]);
});

it('the model refuses duplicate ids, nonfinite scores, out-of-range scores and out-of-alphabet ids explicitly', () => {
  const refusals: readonly [unknown, string][] = [
    [[{ id: 'a', score: 1 }, { id: 'a', score: 0 }], 'duplicate item id a'],
    [[{ id: 'b', score: 2 }, { id: 'b', score: 2 }], 'duplicate item id b'],
    [[{ id: 'a', score: Number.NaN }], 'score outside the bounded integer range'],
    [[{ id: 'a', score: Number.POSITIVE_INFINITY }], 'score outside the bounded integer range'],
    [[{ id: 'a', score: -1 }], 'score outside the bounded integer range'],
    [[{ id: 'a', score: 3 }], 'score outside the bounded integer range'],
    [[{ id: 'a', score: 0.5 }], 'score outside the bounded integer range'],
    [[{ id: 'e', score: 1 }], 'outside the bounded id alphabet']
  ];
  for (const [input, reason] of refusals) {
    try {
      rankBounded(input);
      throw new Error(`expected refusal for ${JSON.stringify(input)}`);
    } catch (error) {
      expect(error).toBeInstanceOf(BoundedRankerInvalidInput);
      expect((error as BoundedRankerInvalidInput).message).toContain('bounded_ranker_invalid_input');
      expect((error as BoundedRankerInvalidInput).message).toContain(reason);
    }
  }
});

it('unscored and unknown items are handled explicitly, never ranked with a default or dropped', () => {
  for (const input of [[{ id: 'a' }], [{ id: 'a', score: null }], [{ id: 'b', score: null }, { id: 'a', score: 1 }]]) {
    try {
      rankBounded(input);
      throw new Error('expected explicit unscored refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BoundedRankerInvalidInput);
      expect((error as BoundedRankerInvalidInput).message).toContain('unscored');
    }
  }
});

it('the model refuses beyond-bounds and malformed inputs instead of ranking them', () => {
  const refusals: readonly unknown[] = [
    [{ id: 'a', score: 0 }, { id: 'b', score: 1 }, { id: 'c', score: 2 }, { id: 'd', score: 0 }, { id: 'a', score: 1 }],
    [{ id: 'a', score: 0 }, { id: 'b', score: 1 }, { id: 'c', score: 2 }, { id: 'd', score: 0 }, { id: 'e', score: 1 }],
    [7],
    [null],
    [['a', 1]],
    [{ id: 'a', score: 1, weight: 9 }],
    [{ score: 1 }],
    'not-an-array',
    { a: 1 },
    null
  ];
  for (const input of refusals) {
    expect(() => rankBounded(input)).toThrow(BoundedRankerInvalidInput);
  }
});

it('the property checker accepts the reference model and a genuinely different insertion-sort implementation', () => {
  const insertionAlternative = (input: unknown): readonly unknown[] => {
    if (!Array.isArray(input)) throw new BoundedRankerInvalidInput('ranker input must be an array of scored items');
    if (input.length > 4) throw new BoundedRankerInvalidInput('ranker input of length over 4 exceeds the bounded maximum; beyond-bounds ranking is not verified');
    const seen = new Set<string>();
    const parsed = input.map(raw => {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new BoundedRankerInvalidInput('each ranked item must be a plain object with exactly id and score fields');
      const record = raw as Record<string, unknown>;
      if (Object.keys(record).sort().join(',') !== 'id,score') throw new BoundedRankerInvalidInput('each ranked item must carry exactly the id and score fields');
      const id = record.id;
      const score = record.score;
      if (typeof id !== 'string' || !['a', 'b', 'c', 'd'].includes(id)) throw new BoundedRankerInvalidInput('id outside the bounded alphabet');
      if (score === undefined || score === null) throw new BoundedRankerInvalidInput(`item ${id} is unscored; unscored items are handled explicitly`);
      if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 2) throw new BoundedRankerInvalidInput('score outside the bounded integer range');
      if (seen.has(id)) throw new BoundedRankerInvalidInput(`duplicate item id ${id}`);
      seen.add(id);
      return { id, score };
    });
    const result: { id: string; score: number }[] = [];
    for (const item of parsed) {
      let position = result.length;
      while (position > 0) {
        const prior = result[position - 1]!;
        if (prior.score > item.score || (prior.score === item.score && prior.id < item.id)) break;
        position -= 1;
      }
      result.splice(position, 0, { ...item });
    }
    return result;
  };
  const modelProbe = probeOf('reference-model', input => rankBounded(input));
  const alternativeProbe = probeOf('insertion-sort-alternative', insertionAlternative);
  const modelReport = checkBoundedRanker(modelProbe);
  const alternativeReport = checkBoundedRanker(alternativeProbe);
  expect(modelReport.status).toBe('passed');
  expect(alternativeReport.status).toBe('passed');
  expect(modelReport.caseCounts.validCases).toBe(2713);
  expect(alternativeReport.caseCounts.validCases).toBe(2713);
  expect(modelReport.failures).toEqual([]);
  expect(alternativeReport.failures).toEqual([]);
});

it('the property checker reports wrong order and wrong tie-breaks as failures, not as fit', () => {
  const ascending = probeOf('ascending-score', input => {
    const ranked = rankBounded(input);
    return [...ranked].reverse();
  });
  const ascendingReport = checkBoundedRanker(ascending);
  expect(ascendingReport.status).toBe('failed');
  expect(ascendingReport.failures.some(failure => failure.kind === 'wrong_order')).toBe(true);

  const tieBreakDescending = probeOf('tie-break-descending', input => {
    const items = (Array.isArray(input) ? input : []) as { id: string; score: number }[];
    if (items.length > 4) throw new BoundedRankerInvalidInput('beyond bounds');
    return items.slice().sort((left, right) => right.score - left.score || (left.id < right.id ? 1 : -1));
  });
  const tieBreakReport = checkBoundedRanker(tieBreakDescending);
  expect(tieBreakReport.status).toBe('failed');
  expect(tieBreakReport.failures.some(failure => failure.kind === 'wrong_order')).toBe(true);
});

it('the property checker detects input mutation as a failure', () => {
  const mutating = probeOf('in-place-mutating', input => {
    const items = (Array.isArray(input) ? input : []) as { id: string; score: number }[];
    if (items.length > 4 || !items.every(item => Number.isInteger(item.score) && item.score >= 0 && item.score <= 2)) {
      throw new BoundedRankerInvalidInput('invalid bounded input');
    }
    return items.sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : 1));
  });
  const report = checkBoundedRanker(mutating);
  expect(report.status).toBe('failed');
  expect(report.failures.some(failure => failure.kind === 'input_mutated')).toBe(true);
});

it('the property checker classifies unbounded ranking attempts as failures', () => {
  const unbounded = probeOf('unbounded', input => {
    const items = (Array.isArray(input) ? input : []) as { id: string; score: number }[];
    return items.slice().sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : 1));
  });
  const report = checkBoundedRanker(unbounded);
  expect(report.status).toBe('failed');
  expect(report.failures.some(failure => failure.kind === 'out_of_bounds_ranking_attempted')).toBe(true);
  expect(report.failures.some(failure => failure.caseId.startsWith('beyond-bounds:'))).toBe(true);
});

it('the property checker classifies silently ranked unscored items as failures', () => {
  const silentDefault = probeOf('silent-default-unscored', input => {
    const items = (Array.isArray(input) ? input : []) as { id: string; score?: number | null }[];
    const defaulted = items.map(item => ({ id: item.id, score: item.score ?? 0 }));
    return defaulted.slice().sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : 1));
  });
  const report = checkBoundedRanker(silentDefault);
  expect(report.status).toBe('failed');
  expect(report.failures.some(failure => failure.kind === 'unscored_item_ranked')).toBe(true);
  expect(report.failures.some(failure => failure.caseId.startsWith('unscored:'))).toBe(true);
});

it('unknown observations are reported explicitly and never counted as passing verification', () => {
  const partiallyUnknown: BoundedRankerProbe = {
    name: 'partially-unknown',
    observe: input => {
      if (Array.isArray(input) && input.length % 2 === 1) return { observed: 'unknown' as const, reason: 'probe observation unavailable' };
      return { observed: 'result' as const, output: rankBounded(input) };
    }
  };
  const report = checkBoundedRanker(partiallyUnknown);
  expect(report.status).toBe('unverified');
  expect(report.caseCounts.unknownObservations).toBeGreaterThan(0);
  expect(report.unknowns.length).toBe(report.caseCounts.unknownObservations);
  expect(report.failures).toEqual([]);
});

it('a probe that refuses valid bounded inputs is a failure, and refused invalid inputs are counted as refusals', () => {
  const refusing = probeOf('always-refusing', () => {
    throw new BoundedRankerInvalidInput('refused');
  });
  const report = checkBoundedRanker(refusing);
  expect(report.status).toBe('failed');
  expect(report.caseCounts.validCases).toBe(2713);
  expect(report.failures.filter(failure => failure.kind === 'valid_input_refused')).toHaveLength(2713);

  const modelProbe = checkBoundedRanker(probeOf('reference-model', input => rankBounded(input)));
  expect(modelProbe.caseCounts.refusalObservations).toBe(boundedRankerInvalidCases().length);
  expect(modelProbe.caseCounts.determinismRechecks).toBe(2713);
});

it('every bounded ranker report discloses its bounds, limits and the no-confidentiality/no-correctness disclaimer', () => {
  const report = checkBoundedRanker(probeOf('reference-model', input => rankBounded(input)));
  expect(report.assurance).toBe('bounded');
  expect(report.bounds).toEqual({ maxItems: BOUNDED_RANKER_MAX_ITEMS, idAlphabet: [...BOUNDED_RANKER_ID_ALPHABET], scoreMin: BOUNDED_RANKER_SCORE_MIN, scoreMax: BOUNDED_RANKER_SCORE_MAX });
  expect(report.limits).toEqual(BOUNDED_RANKER_LIMITS);
  expect(report.limits.join(' ')).toContain('not a proof for every possible input');
  expect(report.disclaimer).toBe(BOUNDED_RANKER_DISCLAIMER);
  expect(BOUNDED_RANKER_DISCLAIMER).toContain('not a semantic confidentiality or correctness proof');
  const serialized = JSON.stringify(report);
  expect(serialized).toContain('not a semantic confidentiality or correctness proof');
});
