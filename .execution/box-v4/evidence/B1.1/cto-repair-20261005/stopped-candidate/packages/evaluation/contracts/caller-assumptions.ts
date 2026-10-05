export const CALLER_ASSUMPTIONS_ASSURANCE = 'bounded' as const;

export const CALLER_ASSUMPTIONS_LIMITS: readonly string[] = Object.freeze([
  'Declared caller assumptions are classified against registered stated bounds only; no semantic meaning of caller code is interpreted.',
  'Assumptions that are absent, malformed or unverifiable are reported explicitly and never assumed to hold.',
  'Behavioural declarations such as input immutability or determinism count as verified only when a passing bounded ranker check is supplied for the same probe.',
  'This module never imports, loads or executes analyzed, proposed or untrusted code.',
  'Assumption reports cannot authorize execution, transfer, release, disclosure or any privileged action.'
]);

export const CALLER_ASSUMPTIONS_DISCLAIMER =
  'Bounded assumption classification against stated bounds only; not a semantic confidentiality or correctness proof.';

export interface CallerBoundSet {
  readonly id: string;
  readonly maxItems: number;
  readonly idAlphabet: readonly string[];
  readonly scoreMin: number;
  readonly scoreMax: number;
}

export const CALLER_BOUND_SETS: Readonly<Record<string, CallerBoundSet>> = Object.freeze({
  ranker_bounded_v1: Object.freeze({ id: 'ranker_bounded_v1', maxItems: 4, idAlphabet: Object.freeze(['a', 'b', 'c', 'd']), scoreMin: 0, scoreMax: 2 })
});

export interface DeclaredCallerAssumptions {
  readonly caller: string;
  readonly boundSetId: string;
  readonly maxSuppliedItems: number | null;
  readonly idAlphabet: readonly string[] | null;
  readonly scoreMin: number | null;
  readonly scoreMax: number | null;
  readonly neverMutatesInput: boolean | null;
  readonly deterministic: boolean | null;
  readonly unscoredHandling: 'explicit_refusal' | 'silent_default' | null;
}

export type CallerAssumptionClass = 'within_bounds' | 'out_of_bounds' | 'unverifiable';

export interface CallerAssumptionCheck {
  readonly id: string;
  readonly assumption: string;
  readonly classification: CallerAssumptionClass;
  readonly detail: string;
}

export interface CallerVerification {
  readonly boundedRankerStatus: 'passed' | 'failed' | 'unverified';
}

export interface CallerAssumptionReport {
  readonly assurance: typeof CALLER_ASSUMPTIONS_ASSURANCE;
  readonly caller: string;
  readonly boundSetId: string;
  readonly declarationProblem: string | null;
  readonly checks: readonly CallerAssumptionCheck[];
  readonly outOfBounds: readonly CallerAssumptionCheck[];
  readonly unverifiable: readonly CallerAssumptionCheck[];
  readonly allWithinStatedBounds: boolean;
  readonly limits: readonly string[];
  readonly disclaimer: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
}

type FieldParse<T> = { readonly kind: 'absent'; readonly value: null } | { readonly kind: 'declared'; readonly value: T } | { readonly kind: 'malformed'; readonly detail: string };

function booleanField(record: Record<string, unknown>, key: string): FieldParse<boolean> {
  if (!Object.hasOwn(record, key)) return { kind: 'absent', value: null };
  const value = record[key];
  if (typeof value === 'boolean') return { kind: 'declared', value };
  return { kind: 'malformed', detail: `${key} must be a boolean or null when declared` };
}

function numberField(record: Record<string, unknown>, key: string): FieldParse<number> {
  if (!Object.hasOwn(record, key)) return { kind: 'absent', value: null };
  const value = record[key];
  if (value === null) return { kind: 'absent', value: null };
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'declared', value };
  return { kind: 'malformed', detail: `${key} must be a finite number or null when declared` };
}

function stringArrayField(record: Record<string, unknown>, key: string): FieldParse<readonly string[]> {
  if (!Object.hasOwn(record, key)) return { kind: 'absent', value: null };
  const value = record[key];
  if (value === null) return { kind: 'absent', value: null };
  if (Array.isArray(value) && value.every(entry => typeof entry === 'string' && entry.length > 0 && entry.length <= 8)) {
    return { kind: 'declared', value: Object.freeze([...value]) as readonly string[] };
  }
  return { kind: 'malformed', detail: `${key} must be an array of bounded non-empty strings or null when declared` };
}

function unscoredField(record: Record<string, unknown>, key: string): FieldParse<'explicit_refusal' | 'silent_default'> {
  if (!Object.hasOwn(record, key)) return { kind: 'absent', value: null };
  const value = record[key];
  if (value === null) return { kind: 'absent', value: null };
  if (value === 'explicit_refusal' || value === 'silent_default') return { kind: 'declared', value };
  return { kind: 'malformed', detail: `${key} must be explicit_refusal, silent_default or null when declared` };
}

function parseDeclared(value: unknown): { readonly declared: DeclaredCallerAssumptions } | { readonly problem: string } {
  if (!isPlainObject(value)) return { problem: 'declared caller assumptions must be a strict object' };
  const allowed = ['caller', 'boundSetId', 'maxSuppliedItems', 'idAlphabet', 'scoreMin', 'scoreMax', 'neverMutatesInput', 'deterministic', 'unscoredHandling'];
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) return { problem: `declared caller assumptions carry the unknown key ${key.slice(0, 32)}` };
  if (typeof record.caller !== 'string' || record.caller.length < 1 || record.caller.length > 256) return { problem: 'declared caller identity must be a bounded non-empty string' };
  if (typeof record.boundSetId !== 'string' || record.boundSetId.length < 1 || record.boundSetId.length > 64) return { problem: 'declared boundSetId must be a bounded non-empty string' };
  const maxSuppliedItems = numberField(record, 'maxSuppliedItems');
  if (maxSuppliedItems.kind === 'malformed') return { problem: maxSuppliedItems.detail };
  const idAlphabet = stringArrayField(record, 'idAlphabet');
  if (idAlphabet.kind === 'malformed') return { problem: idAlphabet.detail };
  const scoreMin = numberField(record, 'scoreMin');
  if (scoreMin.kind === 'malformed') return { problem: scoreMin.detail };
  const scoreMax = numberField(record, 'scoreMax');
  if (scoreMax.kind === 'malformed') return { problem: scoreMax.detail };
  const neverMutatesInput = booleanField(record, 'neverMutatesInput');
  if (neverMutatesInput.kind === 'malformed') return { problem: neverMutatesInput.detail };
  const deterministic = booleanField(record, 'deterministic');
  if (deterministic.kind === 'malformed') return { problem: deterministic.detail };
  const unscoredHandling = unscoredField(record, 'unscoredHandling');
  if (unscoredHandling.kind === 'malformed') return { problem: unscoredHandling.detail };
  return {
    declared: {
      caller: record.caller,
      boundSetId: record.boundSetId,
      maxSuppliedItems: maxSuppliedItems.kind === 'declared' ? maxSuppliedItems.value : null,
      idAlphabet: idAlphabet.kind === 'declared' ? idAlphabet.value : null,
      scoreMin: scoreMin.kind === 'declared' ? scoreMin.value : null,
      scoreMax: scoreMax.kind === 'declared' ? scoreMax.value : null,
      neverMutatesInput: neverMutatesInput.kind === 'declared' ? neverMutatesInput.value : null,
      deterministic: deterministic.kind === 'declared' ? deterministic.value : null,
      unscoredHandling: unscoredHandling.kind === 'declared' ? unscoredHandling.value : null
    }
  };
}

export function checkCallerAssumptions(declared: unknown, verification?: CallerVerification): CallerAssumptionReport {
  const parsed = parseDeclared(declared);
  const checks: CallerAssumptionCheck[] = [];
  let caller = '';
  let boundSetId = '';
  let declarationProblem: string | null = null;
  if ('problem' in parsed) {
    declarationProblem = parsed.problem;
    checks.push({ id: 'declaration_shape', assumption: 'the declared assumptions object is well-formed', classification: 'unverifiable', detail: parsed.problem });
  } else {
    const declaredAssumptions = parsed.declared;
    caller = declaredAssumptions.caller;
    boundSetId = declaredAssumptions.boundSetId;
    const boundSet = CALLER_BOUND_SETS[declaredAssumptions.boundSetId];
    if (boundSet === undefined) {
      checks.push({ id: 'bound_set', assumption: `bound set ${declaredAssumptions.boundSetId} is registered`, classification: 'unverifiable', detail: 'the declared bound set is not registered; no stated bounds apply to the remaining declarations' });
    }
    const maxItems = declaredAssumptions.maxSuppliedItems;
    if (maxItems === null) checks.push({ id: 'max_items', assumption: boundSet === undefined ? 'the declared maximum item count is within stated bounds' : `the caller supplies at most ${boundSet.maxItems} items`, classification: 'unverifiable', detail: 'the maximum supplied item count is not declared; reported, not assumed' });
    else if (!Number.isSafeInteger(maxItems) || maxItems < 0) checks.push({ id: 'max_items', assumption: 'the declared maximum item count is within stated bounds', classification: 'unverifiable', detail: 'the declared maximum item count is malformed' });
    else if (boundSet === undefined) checks.push({ id: 'max_items', assumption: 'the declared maximum item count is within stated bounds', classification: 'unverifiable', detail: `declared maximum ${maxItems} cannot be classified; no registered bound set applies` });
    else if (maxItems > boundSet.maxItems) checks.push({ id: 'max_items', assumption: `the caller supplies at most ${boundSet.maxItems} items`, classification: 'out_of_bounds', detail: `declared maximum ${maxItems} exceeds the stated bound ${boundSet.maxItems}` });
    else checks.push({ id: 'max_items', assumption: `the caller supplies at most ${boundSet.maxItems} items`, classification: 'within_bounds', detail: `declared maximum ${maxItems} is within the stated bound ${boundSet.maxItems}` });

    const idAlphabet = declaredAssumptions.idAlphabet;
    if (idAlphabet === null) checks.push({ id: 'id_alphabet', assumption: boundSet === undefined ? 'the declared id alphabet is within stated bounds' : `the caller supplies only ids ${boundSet.idAlphabet.join('')}`, classification: 'unverifiable', detail: 'the id alphabet is not declared; reported, not assumed' });
    else if (idAlphabet.length === 0) checks.push({ id: 'id_alphabet', assumption: 'the declared id alphabet is within stated bounds', classification: 'unverifiable', detail: 'the declared id alphabet is empty' });
    else if (boundSet === undefined) checks.push({ id: 'id_alphabet', assumption: 'the declared id alphabet is within stated bounds', classification: 'unverifiable', detail: `declared ids ${idAlphabet.join('')} cannot be classified; no registered bound set applies` });
    else {
      const outside = idAlphabet.filter(id => !(boundSet.idAlphabet as readonly string[]).includes(id));
      if (outside.length > 0) checks.push({ id: 'id_alphabet', assumption: `the caller supplies only ids ${boundSet.idAlphabet.join('')}`, classification: 'out_of_bounds', detail: `declared ids ${outside.join('')} are outside the stated alphabet ${boundSet.idAlphabet.join('')}` });
      else checks.push({ id: 'id_alphabet', assumption: `the caller supplies only ids ${boundSet.idAlphabet.join('')}`, classification: 'within_bounds', detail: 'the declared id alphabet is within the stated alphabet' });
    }

    const scoreMin = declaredAssumptions.scoreMin;
    if (scoreMin === null) checks.push({ id: 'score_min', assumption: boundSet === undefined ? 'the declared minimum score is within stated bounds' : `the caller supplies scores of at least ${boundSet.scoreMin}`, classification: 'unverifiable', detail: 'the minimum score is not declared; reported, not assumed' });
    else if (boundSet === undefined) checks.push({ id: 'score_min', assumption: 'the declared minimum score is within stated bounds', classification: 'unverifiable', detail: `declared minimum ${scoreMin} cannot be classified; no registered bound set applies` });
    else if (scoreMin < boundSet.scoreMin) checks.push({ id: 'score_min', assumption: `the caller supplies scores of at least ${boundSet.scoreMin}`, classification: 'out_of_bounds', detail: `declared minimum ${scoreMin} is below the stated bound ${boundSet.scoreMin}` });
    else checks.push({ id: 'score_min', assumption: `the caller supplies scores of at least ${boundSet.scoreMin}`, classification: 'within_bounds', detail: `declared minimum ${scoreMin} is within the stated bound ${boundSet.scoreMin}` });

    const scoreMax = declaredAssumptions.scoreMax;
    if (scoreMax === null) checks.push({ id: 'score_max', assumption: boundSet === undefined ? 'the declared maximum score is within stated bounds' : `the caller supplies scores of at most ${boundSet.scoreMax}`, classification: 'unverifiable', detail: 'the maximum score is not declared; reported, not assumed' });
    else if (boundSet === undefined) checks.push({ id: 'score_max', assumption: 'the declared maximum score is within stated bounds', classification: 'unverifiable', detail: `declared maximum ${scoreMax} cannot be classified; no registered bound set applies` });
    else if (scoreMax > boundSet.scoreMax) checks.push({ id: 'score_max', assumption: `the caller supplies scores of at most ${boundSet.scoreMax}`, classification: 'out_of_bounds', detail: `declared maximum ${scoreMax} exceeds the stated bound ${boundSet.scoreMax}` });
    else checks.push({ id: 'score_max', assumption: `the caller supplies scores of at most ${boundSet.scoreMax}`, classification: 'within_bounds', detail: `declared maximum ${scoreMax} is within the stated bound ${boundSet.scoreMax}` });

    if (scoreMin !== null && scoreMax !== null && scoreMin > scoreMax) {
      checks.push({ id: 'score_range', assumption: `the declared score range ${scoreMin}..${scoreMax} is non-empty`, classification: 'out_of_bounds', detail: 'the declared score range is empty' });
    }

    const verified = verification?.boundedRankerStatus === 'passed';
    const behaviourDetail = verified
      ? 'verified by a passing bounded ranker check in its stated bounds'
      : 'declared but not verified by a passing bounded ranker check; reported, not assumed';
    const neverMutates = declaredAssumptions.neverMutatesInput;
    if (neverMutates === null) checks.push({ id: 'never_mutates_input', assumption: 'the caller never mutates the supplied input', classification: 'unverifiable', detail: 'input immutability is not declared; reported, not assumed' });
    else if (neverMutates === false) checks.push({ id: 'never_mutates_input', assumption: 'the caller never mutates the supplied input', classification: 'out_of_bounds', detail: 'the caller declares that it may mutate inputs, which violates the published ranker contract' });
    else checks.push({ id: 'never_mutates_input', assumption: 'the caller never mutates the supplied input', classification: verified ? 'within_bounds' : 'unverifiable', detail: behaviourDetail });

    const deterministic = declaredAssumptions.deterministic;
    if (deterministic === null) checks.push({ id: 'deterministic', assumption: 'the caller is deterministic for identical inputs', classification: 'unverifiable', detail: 'determinism is not declared; reported, not assumed' });
    else if (deterministic === false) checks.push({ id: 'deterministic', assumption: 'the caller is deterministic for identical inputs', classification: 'out_of_bounds', detail: 'the caller declares non-deterministic behaviour, which violates the published ranker contract' });
    else checks.push({ id: 'deterministic', assumption: 'the caller is deterministic for identical inputs', classification: verified ? 'within_bounds' : 'unverifiable', detail: behaviourDetail });

    const unscored = declaredAssumptions.unscoredHandling;
    if (unscored === null) checks.push({ id: 'unscored_handling', assumption: 'unscored items are handled explicitly and never ranked silently', classification: 'unverifiable', detail: 'unscored handling is not declared; reported, not assumed' });
    else if (unscored === 'silent_default') checks.push({ id: 'unscored_handling', assumption: 'unscored items are handled explicitly and never ranked silently', classification: 'out_of_bounds', detail: 'the caller declares a silent default score for unscored items, which invents unpublished data' });
    else checks.push({ id: 'unscored_handling', assumption: 'unscored items are handled explicitly and never ranked silently', classification: 'within_bounds', detail: 'the caller declares explicit refusal for unscored items' });
  }

  const outOfBounds = checks.filter(check => check.classification === 'out_of_bounds');
  const unverifiable = checks.filter(check => check.classification === 'unverifiable');
  return {
    assurance: CALLER_ASSUMPTIONS_ASSURANCE,
    caller,
    boundSetId,
    declarationProblem,
    checks: Object.freeze(checks),
    outOfBounds: Object.freeze(outOfBounds),
    unverifiable: Object.freeze(unverifiable),
    allWithinStatedBounds: checks.length > 0 && checks.every(check => check.classification === 'within_bounds'),
    limits: CALLER_ASSUMPTIONS_LIMITS,
    disclaimer: CALLER_ASSUMPTIONS_DISCLAIMER
  };
}
