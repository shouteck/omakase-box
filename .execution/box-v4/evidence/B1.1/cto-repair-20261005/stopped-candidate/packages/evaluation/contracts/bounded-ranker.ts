export const BOUNDED_RANKER_ASSURANCE = 'bounded' as const;
export const BOUNDED_RANKER_MAX_ITEMS = 4;
export const BOUNDED_RANKER_ID_ALPHABET: readonly string[] = Object.freeze(['a', 'b', 'c', 'd']);
export const BOUNDED_RANKER_SCORE_MIN = 0;
export const BOUNDED_RANKER_SCORE_MAX = 2;

export const BOUNDED_RANKER_LIMITS: readonly string[] = Object.freeze([
  'The bounded ranker model is exhaustively checked only for arrays of length 0..4 with IDs a..d without repetition and integer scores 0..2; behaviour beyond these bounds is neither checked nor claimed.',
  'The exhaustive bounded check is not a proof for every possible input or TypeScript runtime behaviour; invalid inputs are tested separately and beyond-bounds behaviour is reported as unknown.',
  'Observed results come from an injected probe adapter; this module never imports, loads or executes analyzed, proposed or untrusted code on this host.',
  'Unknown, refused, malformed or timed-out observations are reported explicitly and never counted as passing evidence.',
  'The bounded ranking is not a semantic confidentiality or correctness proof and cannot authorize acceptance, publication or payment.'
]);

export const BOUNDED_RANKER_DISCLAIMER =
  'Bounded behavioural checking over a synthetic domain only; not a semantic confidentiality or correctness proof.';

export type BoundedRankId = 'a' | 'b' | 'c' | 'd';
export type BoundedRankScore = 0 | 1 | 2;

export interface BoundedRankItem {
  readonly id: BoundedRankId;
  readonly score: BoundedRankScore;
}

export class BoundedRankerInvalidInput extends Error {
  constructor(readonly reason: string) {
    super(`bounded_ranker_invalid_input: ${reason}`);
    this.name = 'BoundedRankerInvalidInput';
  }
}

function isBoundedId(value: unknown): value is BoundedRankId {
  return typeof value === 'string' && (BOUNDED_RANKER_ID_ALPHABET as readonly string[]).includes(value);
}

function isBoundedScore(value: unknown): value is BoundedRankScore {
  return typeof value === 'number' && Number.isInteger(value) && value >= BOUNDED_RANKER_SCORE_MIN && value <= BOUNDED_RANKER_SCORE_MAX;
}

function parseRankItem(raw: unknown): BoundedRankItem {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BoundedRankerInvalidInput('each ranked item must be a plain object with exactly id and score fields');
  }
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'id' || keys[1] !== 'score') {
    if (keys.length === 1 && keys[0] === 'id' && isBoundedId(record.id)) {
      throw new BoundedRankerInvalidInput(`item ${record.id} is unscored; unscored items are never ranked silently and must be handled explicitly`);
    }
    throw new BoundedRankerInvalidInput('each ranked item must carry exactly the id and score fields');
  }
  const id = record.id;
  if (!isBoundedId(id)) {
    throw new BoundedRankerInvalidInput(`item id ${typeof id === 'string' ? id.slice(0, 8) : 'non-string'} is outside the bounded id alphabet`);
  }
  const score = record.score;
  if (score === undefined || score === null) {
    throw new BoundedRankerInvalidInput(`item ${id} is unscored; unscored items are never ranked silently and must be handled explicitly`);
  }
  if (!isBoundedScore(score)) {
    throw new BoundedRankerInvalidInput(`item ${id} carries a score outside the bounded integer range ${BOUNDED_RANKER_SCORE_MIN}..${BOUNDED_RANKER_SCORE_MAX}`);
  }
  return { id, score };
}

function compareBoundedItems(left: BoundedRankItem, right: BoundedRankItem): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

export function rankBounded(items: unknown): readonly BoundedRankItem[] {
  if (!Array.isArray(items)) throw new BoundedRankerInvalidInput('ranker input must be an array of scored items');
  if (items.length > BOUNDED_RANKER_MAX_ITEMS) {
    throw new BoundedRankerInvalidInput(`ranker input of length ${items.length} exceeds the bounded maximum of ${BOUNDED_RANKER_MAX_ITEMS} items; beyond-bounds ranking is not verified`);
  }
  const parsed: BoundedRankItem[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const item = parseRankItem(raw);
    if (seen.has(item.id)) throw new BoundedRankerInvalidInput(`duplicate item id ${item.id}`);
    seen.add(item.id);
    parsed.push(item);
  }
  return parsed.slice().sort(compareBoundedItems).map(item => ({ id: item.id, score: item.score }));
}

export interface RankerObservation {
  readonly observed: 'result' | 'refused' | 'unknown';
  readonly output?: readonly unknown[];
  readonly reason?: string;
}

export interface BoundedRankerProbe {
  readonly name: string;
  observe(input: unknown): RankerObservation;
}

export interface BoundedRankerBounds {
  readonly maxItems: number;
  readonly idAlphabet: readonly string[];
  readonly scoreMin: number;
  readonly scoreMax: number;
}

export interface BoundedRankerCaseCounts {
  readonly validCases: number;
  readonly invalidCases: number;
  readonly determinismRechecks: number;
  readonly refusalObservations: number;
  readonly unknownObservations: number;
}

export type BoundedRankerFailureKind =
  | 'valid_input_refused'
  | 'wrong_order'
  | 'dropped_or_duplicated_item'
  | 'input_mutated'
  | 'non_deterministic'
  | 'out_of_bounds_ranking_attempted'
  | 'unscored_item_ranked'
  | 'invalid_input_accepted'
  | 'malformed_observation';

export interface BoundedRankerFailureRecord {
  readonly kind: BoundedRankerFailureKind;
  readonly caseId: string;
  readonly detail: string;
}

export interface BoundedRankerUnknownRecord {
  readonly caseId: string;
  readonly reason: string;
}

export interface BoundedRankerCheckReport {
  readonly assurance: typeof BOUNDED_RANKER_ASSURANCE;
  readonly status: 'passed' | 'failed' | 'unverified';
  readonly probe: string;
  readonly bounds: BoundedRankerBounds;
  readonly caseCounts: BoundedRankerCaseCounts;
  readonly failures: readonly BoundedRankerFailureRecord[];
  readonly unknowns: readonly BoundedRankerUnknownRecord[];
  readonly limits: readonly string[];
  readonly disclaimer: string;
}

export interface BoundedRankerValidCase {
  readonly caseId: string;
  readonly input: readonly BoundedRankItem[];
}

function orderedDistinctSequences(alphabet: readonly string[], length: number): readonly (readonly string[])[] {
  if (length === 0) return [[]];
  const results: string[][] = [];
  const build = (prefix: readonly string[], remaining: readonly string[]): void => {
    if (prefix.length === length) {
      results.push([...prefix]);
      return;
    }
    for (const id of remaining) build([...prefix, id], remaining.filter(value => value !== id));
  };
  build([], [...alphabet]);
  return results;
}

function scoreTuples(length: number): readonly (readonly number[])[] {
  if (length === 0) return [[]];
  let results: readonly number[][] = [[]];
  for (let index = 0; index < length; index++) {
    const next: number[][] = [];
    for (const tuple of results) for (const score of [BOUNDED_RANKER_SCORE_MIN, 1, BOUNDED_RANKER_SCORE_MAX]) next.push([...tuple, score]);
    results = next;
  }
  return results;
}

export function boundedRankerValidCases(): readonly BoundedRankerValidCase[] {
  const cases: BoundedRankerValidCase[] = [];
  for (let length = 0; length <= BOUNDED_RANKER_MAX_ITEMS; length++) {
    for (const ids of orderedDistinctSequences(BOUNDED_RANKER_ID_ALPHABET, length)) {
      for (const scores of scoreTuples(length)) {
        const items = ids.map((id, index) => ({ id: id as BoundedRankId, score: scores[index] as BoundedRankScore }));
        const parts = ['valid', `L${length}`, ids.join(''), scores.join('')].filter(part => part !== '');
        cases.push({ caseId: parts.join(':'), input: items });
      }
    }
  }
  return cases;
}

interface InvalidCase {
  readonly caseId: string;
  readonly input: unknown;
  readonly expectedFailureKind: BoundedRankerFailureKind;
  readonly detail: string;
}

export function boundedRankerInvalidCases(): readonly InvalidCase[] {
  const beyond = (ids: readonly string[], scores: readonly number[]): readonly unknown[] =>
    ids.map((id, index) => ({ id, score: scores[index] }));
  return Object.freeze([
    { caseId: 'beyond-bounds:duplicate-id-five', input: beyond(['a', 'b', 'c', 'd', 'a'], [0, 1, 2, 0, 1]), expectedFailureKind: 'out_of_bounds_ranking_attempted', detail: 'five items exceed the bounded maximum and repeat an id' },
    { caseId: 'beyond-bounds:unknown-id-five', input: beyond(['a', 'b', 'c', 'd', 'e'], [0, 1, 2, 0, 1]), expectedFailureKind: 'out_of_bounds_ranking_attempted', detail: 'five items exceed the bounded maximum and use an id outside the alphabet' },
    { caseId: 'duplicate:aa', input: beyond(['a', 'a'], [0, 1]), expectedFailureKind: 'invalid_input_accepted', detail: 'duplicate ids within the bounded length' },
    { caseId: 'duplicate:bb', input: beyond(['b', 'b'], [2, 0]), expectedFailureKind: 'invalid_input_accepted', detail: 'duplicate ids within the bounded length' },
    { caseId: 'nonfinite:nan', input: [{ id: 'a', score: Number.NaN }], expectedFailureKind: 'invalid_input_accepted', detail: 'NaN score' },
    { caseId: 'nonfinite:positive-infinity', input: [{ id: 'a', score: Number.POSITIVE_INFINITY }], expectedFailureKind: 'invalid_input_accepted', detail: 'positive Infinity score' },
    { caseId: 'nonfinite:negative-infinity', input: [{ id: 'a', score: Number.NEGATIVE_INFINITY }], expectedFailureKind: 'invalid_input_accepted', detail: 'negative Infinity score' },
    { caseId: 'out-of-range:below', input: [{ id: 'a', score: -1 }], expectedFailureKind: 'invalid_input_accepted', detail: 'score below the bounded range' },
    { caseId: 'out-of-range:above', input: [{ id: 'a', score: 3 }], expectedFailureKind: 'invalid_input_accepted', detail: 'score above the bounded range' },
    { caseId: 'out-of-range:fraction', input: [{ id: 'a', score: 0.5 }], expectedFailureKind: 'invalid_input_accepted', detail: 'non-integer score' },
    { caseId: 'out-of-alphabet:single', input: [{ id: 'e', score: 1 }], expectedFailureKind: 'invalid_input_accepted', detail: 'id outside the bounded alphabet' },
    { caseId: 'unscored:missing-field', input: [{ id: 'a' }], expectedFailureKind: 'unscored_item_ranked', detail: 'item without a score field' },
    { caseId: 'unscored:null-score', input: [{ id: 'a', score: null }], expectedFailureKind: 'unscored_item_ranked', detail: 'item with a null score' },
    { caseId: 'malformed:scalar-item', input: [7], expectedFailureKind: 'invalid_input_accepted', detail: 'scalar item' },
    { caseId: 'malformed:null-item', input: [null], expectedFailureKind: 'invalid_input_accepted', detail: 'null item' },
    { caseId: 'malformed:array-item', input: [['a', 1]], expectedFailureKind: 'invalid_input_accepted', detail: 'array item' },
    { caseId: 'malformed:extra-keys', input: [{ id: 'a', score: 1, weight: 9 }], expectedFailureKind: 'invalid_input_accepted', detail: 'item with extra keys' },
    { caseId: 'malformed:missing-id', input: [{ score: 1 }], expectedFailureKind: 'invalid_input_accepted', detail: 'item without an id' },
    { caseId: 'non-array:string', input: 'not-an-array', expectedFailureKind: 'invalid_input_accepted', detail: 'string instead of an array' },
    { caseId: 'non-array:object', input: { a: 1 }, expectedFailureKind: 'invalid_input_accepted', detail: 'plain object instead of an array' },
    { caseId: 'non-array:null', input: null, expectedFailureKind: 'invalid_input_accepted', detail: 'null instead of an array' }
  ]);
}

function safeStringify(value: unknown): string | null {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? null : text;
  } catch {
    return null;
  }
}

function observeSafely(probe: BoundedRankerProbe, input: unknown): RankerObservation {
  try {
    const observation = probe.observe(input);
    if (typeof observation !== 'object' || observation === null) return { observed: 'unknown', reason: 'the probe returned a non-object observation' };
    if (observation.observed !== 'result' && observation.observed !== 'refused' && observation.observed !== 'unknown') {
      return { observed: 'unknown', reason: 'the probe returned an unknown observation channel' };
    }
    return observation;
  } catch (error) {
    return { observed: 'unknown', reason: `the probe threw outside its observation contract: ${error instanceof Error ? error.message.slice(0, 120) : 'unknown error'}` };
  }
}

function assessRanking(caseId: string, expected: readonly BoundedRankItem[], output: readonly unknown[] | undefined): readonly BoundedRankerFailureRecord[] {
  if (!Array.isArray(output)) return [{ kind: 'malformed_observation', caseId, detail: 'the observed result is not an array' }];
  if (output.length !== expected.length) {
    return [{ kind: 'dropped_or_duplicated_item', caseId, detail: `expected ${expected.length} items, observed ${output.length}` }];
  }
  const parsed: BoundedRankItem[] = [];
  for (const entry of output) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return [{ kind: 'malformed_observation', caseId, detail: 'an observed output item is not a plain object' }];
    }
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length !== 2 || keys[0] !== 'id' || keys[1] !== 'score') {
      return [{ kind: 'malformed_observation', caseId, detail: 'an observed output item does not carry exactly id and score' }];
    }
    if (!isBoundedId(record.id) || !isBoundedScore(record.score)) {
      return [{ kind: 'malformed_observation', caseId, detail: 'an observed output item carries an out-of-bounds id or score' }];
    }
    parsed.push({ id: record.id, score: record.score });
  }
  const counts = new Map<string, number>();
  for (const item of parsed) {
    const key = `${item.id}:${item.score}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const item of expected) {
    const key = `${item.id}:${item.score}`;
    if (counts.get(key) !== 1) return [{ kind: 'dropped_or_duplicated_item', caseId, detail: `item ${key} is not returned exactly once` }];
  }
  for (let index = 0; index < parsed.length - 1; index++) {
    const left = parsed[index]!;
    const right = parsed[index + 1]!;
    const ordered = left.score > right.score || (left.score === right.score && left.id < right.id);
    if (!ordered) return [{ kind: 'wrong_order', caseId, detail: `items ${left.id}@${left.score} and ${right.id}@${right.score} are in the wrong order` }];
  }
  return [];
}

export function checkBoundedRanker(probe: BoundedRankerProbe): BoundedRankerCheckReport {
  const failures: BoundedRankerFailureRecord[] = [];
  const unknowns: BoundedRankerUnknownRecord[] = [];
  let validCases = 0;
  let determinismRechecks = 0;
  let refusalObservations = 0;
  for (const validCase of boundedRankerValidCases()) {
    validCases += 1;
    const pinnedInput = safeStringify(validCase.input);
    const inputCopy: unknown[] = validCase.input.map(item => ({ id: item.id, score: item.score }));
    const first = observeSafely(probe, inputCopy);
    if (first.observed === 'unknown') {
      unknowns.push({ caseId: validCase.caseId, reason: first.reason ?? 'observation unavailable' });
      continue;
    }
    if (first.observed === 'refused') {
      refusalObservations += 1;
      failures.push({ kind: 'valid_input_refused', caseId: validCase.caseId, detail: `a valid bounded input was refused: ${first.reason ?? 'refused'}` });
      continue;
    }
    if (pinnedInput !== null && safeStringify(inputCopy) !== pinnedInput) {
      failures.push({ kind: 'input_mutated', caseId: validCase.caseId, detail: 'the observed input array changed during the first observation' });
      continue;
    }
    failures.push(...assessRanking(validCase.caseId, validCase.input, first.output));
    determinismRechecks += 1;
    const second = observeSafely(probe, inputCopy);
    if (second.observed === 'unknown') unknowns.push({ caseId: validCase.caseId, reason: `determinism recheck unavailable: ${second.reason ?? 'unknown'}` });
    else if (second.observed === 'refused') failures.push({ kind: 'non_deterministic', caseId: validCase.caseId, detail: 'the same valid input was refused on recheck' });
    else if (safeStringify(second.output ?? null) !== safeStringify(first.output ?? null)) {
      failures.push({ kind: 'non_deterministic', caseId: validCase.caseId, detail: 'repeated observation of the same input produced a different ranking' });
    }
  }
  let invalidCases = 0;
  for (const invalidCase of boundedRankerInvalidCases()) {
    invalidCases += 1;
    const pinnedInput = safeStringify(invalidCase.input);
    const observation = observeSafely(probe, invalidCase.input);
    if (observation.observed === 'unknown') {
      unknowns.push({ caseId: invalidCase.caseId, reason: observation.reason ?? 'observation unavailable' });
      continue;
    }
    if (observation.observed === 'refused') {
      refusalObservations += 1;
      if (pinnedInput !== null && safeStringify(invalidCase.input) !== pinnedInput) {
        failures.push({ kind: 'input_mutated', caseId: invalidCase.caseId, detail: 'the refused input was mutated during observation' });
      }
      continue;
    }
    failures.push({ kind: invalidCase.expectedFailureKind, caseId: invalidCase.caseId, detail: `the implementation did not refuse: ${invalidCase.detail}` });
  }
  const status = failures.length > 0 ? 'failed' : unknowns.length > 0 ? 'unverified' : 'passed';
  return {
    assurance: BOUNDED_RANKER_ASSURANCE,
    status,
    probe: probe.name,
    bounds: { maxItems: BOUNDED_RANKER_MAX_ITEMS, idAlphabet: BOUNDED_RANKER_ID_ALPHABET, scoreMin: BOUNDED_RANKER_SCORE_MIN, scoreMax: BOUNDED_RANKER_SCORE_MAX },
    caseCounts: { validCases, invalidCases, determinismRechecks, refusalObservations, unknownObservations: unknowns.length },
    failures: Object.freeze(failures),
    unknowns: Object.freeze(unknowns),
    limits: BOUNDED_RANKER_LIMITS,
    disclaimer: BOUNDED_RANKER_DISCLAIMER
  };
}
