export const withinBoundsCallerAssumptions = {
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

export const verifiedCallerRun = { boundedRankerStatus: 'passed' as const };
