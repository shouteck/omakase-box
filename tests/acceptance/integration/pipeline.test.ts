import { describe, expect, it } from 'vitest';
import { trustedHarness } from '../../../packages/runner-protocol/index.js';
import { planEvaluationJobs, PlanRejected } from '../../../packages/evaluation/pipeline/jobs.js';
import { mapPatchToUnits, MappingRejected } from '../../../packages/evaluation/pipeline/patch-map.js';
import { buildCandidateDiff, DiffRejected } from '../../../packages/evaluation/pipeline/candidate-diff.js';
import { evaluatePrivateFit } from '../../../packages/evaluation/pipeline/fit.js';
import { advanceEvaluation, AdvanceRejected } from '../../../packages/evaluation/pipeline/advance.js';
import { composedSelection, completeSelectionEvidence, unpublishedPrivateRequirementEvidence } from '../contract-fit/fixtures.js';
import { descriptor, bindingFor, passedEvidence, failedEvidence, infraEvidence, DIGESTS, IDS } from './fixtures.js';

const planInput = () => ({
  ...IDS, taskVersion: 1, submissionHash: DIGESTS.submission, packageHash: DIGESTS.package,
  privateBaseRevision: DIGESTS.base, publicDescriptor: descriptor('public'), privateDescriptor: descriptor('private', 40),
  deadlineMs: 1791086200000,
});

describe('planEvaluationJobs — frozen public/private job pair', () => {
  it('derives a deterministic pair bound to the exact evaluation and descriptors', () => {
    const plan = planEvaluationJobs(planInput());
    const replay = planEvaluationJobs(planInput());
    expect(plan).toEqual(replay);
    expect(plan.jobs.map(job => job.jobKind).sort()).toEqual(['private', 'public']);
    for (const [job, kind] of [[plan.jobs[0], 'public'], [plan.jobs[1], 'private']] as const) {
      expect(job.jobKind).toBe(kind);
      expect(job.artifactHash).toBe((kind === 'public' ? planInput().publicDescriptor : planInput().privateDescriptor).descriptorDigest);
      expect(job.requiredCheckIds).toEqual(['selection_api_check', 'selection_http_check', 'selection_journey_check', 'selection_ui_check']);
      expect(job.harnessDigest).toBe(trustedHarness('composed/v1').digest);
    }
  });
  it('rejects binding mismatches and identical descriptors', () => {
    expect(() => planEvaluationJobs({ ...planInput(), submissionHash: 'f'.repeat(64) })).toThrowError(PlanRejected);
    expect(() => planEvaluationJobs({ ...planInput(), privateDescriptor: planInput().publicDescriptor })).toThrowError(/identical_descriptors/);
    expect(() => planEvaluationJobs({ ...planInput(), publicDescriptor: descriptor('private', 99) })).toThrowError(/descriptor_kind_mismatch/);
    expect(() => planEvaluationJobs({ ...planInput(), deadlineMs: 0 })).toThrowError(/invalid_deadline/);
  });
});

describe('mapPatchToUnits — template-specific ownership', () => {
  const units = [
    { unitId: 'selection_ui', editablePaths: ['src/ui/panel.tsx', 'src/ui/panel.css'] },
    { unitId: 'selection_api', editablePaths: ['src/api/select.ts', 'src/api/rank.ts'] },
    { unitId: 'response_policy', editablePaths: ['config/policy.json'] },
  ];
  it('maps every patch path to exactly one owning unit', () => {
    const mapping = mapPatchToUnits(units, ['src/api/select.ts', 'src/ui/panel.css', 'config/policy.json']);
    expect(mapping.unmappedPaths).toEqual([]);
    expect(Object.keys(mapping.units).sort()).toEqual(['response_policy', 'selection_api', 'selection_ui']);
    expect(mapping.units['selection_api']).toEqual(['src/api/select.ts']);
  });
  it('reports unmapped paths as contributor fault, never silently accepts them', () => {
    const mapping = mapPatchToUnits(units, ['src/api/select.ts', 'tests/hidden.test.ts']);
    expect(mapping.units['selection_api']).toEqual(['src/api/select.ts']);
    expect(mapping.unmappedPaths).toEqual(['tests/hidden.test.ts']);
  });
  it('rejects unsafe paths, unbounded patches and ownership conflicts', () => {
    expect(() => mapPatchToUnits(units, ['src/ok.ts', 'src/../escape.ts'])).toThrowError(MappingRejected);
    expect(() => mapPatchToUnits(units, Array.from({ length: 513 }, (_, i) => `src/${i}.ts`))).toThrowError(/patch_unbounded/);
    expect(() => mapPatchToUnits([{ unitId: 'a', editablePaths: ['src/x.ts'] }, { unitId: 'b', editablePaths: ['src/x.ts'] }], [])).toThrowError(/path_ownership_conflict/);
  });
});

describe('buildCandidateDiff — data-only diff against the exact base', () => {
  const mapping = mapPatchToUnits([{ unitId: 'a', editablePaths: ['src/a.ts'] }], ['src/a.ts']);
  it('produces a deterministic digest bound to base+submission+patch+mapping', () => {
    const diff = buildCandidateDiff({ privateBaseRevision: DIGESTS.base, submissionHash: DIGESTS.submission, patchDigest: DIGESTS.patch, mapping });
    const replay = buildCandidateDiff({ privateBaseRevision: DIGESTS.base, submissionHash: DIGESTS.submission, patchDigest: DIGESTS.patch, mapping });
    expect(diff.candidateDiffHash).toBe(replay.candidateDiffHash);
    expect(diff.candidateDiffHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('changes when any binding changes and rejects unmapped or empty diffs', () => {
    const base = buildCandidateDiff({ privateBaseRevision: DIGESTS.base, submissionHash: DIGESTS.submission, patchDigest: DIGESTS.patch, mapping });
    expect(buildCandidateDiff({ privateBaseRevision: 'e'.repeat(64), submissionHash: DIGESTS.submission, patchDigest: DIGESTS.patch, mapping }).candidateDiffHash).not.toBe(base.candidateDiffHash);
    expect(() => buildCandidateDiff({ privateBaseRevision: DIGESTS.base, submissionHash: DIGESTS.submission, patchDigest: DIGESTS.patch, mapping: { units: {}, unmappedPaths: ['x.ts'] } })).toThrowError(/unmapped_paths/);
    expect(() => buildCandidateDiff({ privateBaseRevision: DIGESTS.base, submissionHash: DIGESTS.submission, patchDigest: DIGESTS.patch, mapping: { units: {}, unmappedPaths: [] } })).toThrowError(/empty_diff/);
  });
});

describe('evaluatePrivateFit — policy loader plus whole-task fit', () => {
  it('a compatible patch passes fit; unpublished private expectations are package_defect', async () => {
    const partition = await composedSelection();
    expect(evaluatePrivateFit({ partition, observed: completeSelectionEvidence() }).outcome).toBe('passed');
    expect(evaluatePrivateFit({ partition, observed: unpublishedPrivateRequirementEvidence() }).outcome).toBe('package_defect');
  });
  it('a mismatch patch whose unit checks pass still fails whole-task fit', async () => {
    const partition = await composedSelection();
    const report = evaluatePrivateFit({ partition, observed: completeSelectionEvidence('mismatch') });
    expect(report.outcome).toBe('contract_failure');
    expect(report.packageDefectSuspected).toBe(false);
  });
  it('missing observations stay unverified, never passed or failed', async () => {
    const partition = await composedSelection();
    expect(evaluatePrivateFit({ partition }).outcome).toBe('unverified');
    expect(evaluatePrivateFit({ partition, observed: completeSelectionEvidence('units_passed_only') }).outcome).toBe('unverified');
  });
});

describe('advanceEvaluation — state machine over authoritative evidence', () => {
  const plan = planEvaluationJobs(planInput());
  const [publicJob, privateJob] = plan.jobs;
  const base = {
    evaluationId: IDS.evaluationId, attemptId: IDS.attemptId,
    submissionHash: DIGESTS.submission, packageHash: DIGESTS.package, privateBaseRevision: DIGESTS.base,
  };
  const jobs = (pub: { completed: boolean; evidence: ReturnType<typeof passedEvidence> | ReturnType<typeof infraEvidence> | null }, prv: typeof pub) => ([
    { jobKind: 'public' as const, ...pub }, { jobKind: 'private' as const, ...prv },
  ]);

  it('received + planned jobs → public_evaluating', () => {
    expect(advanceEvaluation({ ...base, state: 'received', jobs: jobs({ completed: false, evidence: null }, { completed: false, evidence: null }) }).nextState).toBe('public_evaluating');
  });
  it('public verified pass → private_evaluating; public fail → changes_required', () => {
    expect(advanceEvaluation({ ...base, state: 'public_evaluating', jobs: jobs({ completed: true, evidence: passedEvidence(publicJob) }, { completed: false, evidence: null }) }).nextState).toBe('private_evaluating');
    expect(advanceEvaluation({ ...base, state: 'public_evaluating', jobs: jobs({ completed: true, evidence: failedEvidence(publicJob) }, { completed: false, evidence: null }) }).nextState).toBe('changes_required');
  });
  it('public infrastructure or unverified evidence stays honest', () => {
    expect(advanceEvaluation({ ...base, state: 'public_evaluating', jobs: jobs({ completed: true, evidence: infraEvidence(publicJob) }, { completed: false, evidence: null }) }).nextState).toBe('infrastructure_failure');
    expect(advanceEvaluation({ ...base, state: 'public_evaluating', jobs: jobs({ completed: true, evidence: { ...passedEvidence(publicJob), evidenceClass: 'unverified' as const, outcome: 'unverified' as const, cause: 'stale_result' as const } }, { completed: false, evidence: null }) }).nextState).toBeNull();
  });
  it('full pass + fit → owner_review with schema-bound result and diff hash', async () => {
    const partition = await composedSelection();
    const fit = evaluatePrivateFit({ partition, observed: completeSelectionEvidence() });
    const diff = buildCandidateDiff({ privateBaseRevision: DIGESTS.base, submissionHash: DIGESTS.submission, patchDigest: DIGESTS.patch, mapping: mapPatchToUnits([{ unitId: 'a', editablePaths: ['src/a.ts'] }], ['src/a.ts']) });
    const decision = advanceEvaluation({ ...base, state: 'private_evaluating', jobs: jobs({ completed: true, evidence: passedEvidence(publicJob) }, { completed: true, evidence: passedEvidence(privateJob) }), fit, candidateDiff: diff });
    expect(decision.nextState).toBe('owner_review');
    const result = decision.result as { outcome: string; candidateDiffHash: string; evidence: { jobKind: string }[] };
    expect(result.outcome).toBe('passed');
    expect(result.candidateDiffHash).toBe(diff.candidateDiffHash);
    expect(new Set(result.evidence.map(item => item.jobKind))).toEqual(new Set(['public', 'private']));
  });
  it('integration/contract failures and package defects land on the right states', async () => {
    const partition = await composedSelection();
    const diff = buildCandidateDiff({ privateBaseRevision: DIGESTS.base, submissionHash: DIGESTS.submission, patchDigest: DIGESTS.patch, mapping: mapPatchToUnits([{ unitId: 'a', editablePaths: ['src/a.ts'] }], ['src/a.ts']) });
    const bothPassed = jobs({ completed: true, evidence: passedEvidence(publicJob) }, { completed: true, evidence: passedEvidence(privateJob) });
    expect(advanceEvaluation({ ...base, state: 'private_evaluating', jobs: bothPassed, fit: evaluatePrivateFit({ partition, observed: completeSelectionEvidence('mismatch') }), candidateDiff: diff }).nextState).toBe('changes_required');
    expect(advanceEvaluation({ ...base, state: 'private_evaluating', jobs: bothPassed, fit: evaluatePrivateFit({ partition, observed: unpublishedPrivateRequirementEvidence() }), candidateDiff: diff }).nextState).toBe('package_defect');
    expect(advanceEvaluation({ ...base, state: 'private_evaluating', jobs: jobs({ completed: true, evidence: passedEvidence(publicJob) }, { completed: true, evidence: infraEvidence(privateJob) }), fit: evaluatePrivateFit({ partition, observed: completeSelectionEvidence() }), candidateDiff: diff }).nextState).toBe('infrastructure_failure');
  });
  it('a mismatch patch passing unit checks fails whole-task fit — never reaches owner_review', async () => {
    const partition = await composedSelection();
    const diff = buildCandidateDiff({ privateBaseRevision: DIGESTS.base, submissionHash: DIGESTS.submission, patchDigest: DIGESTS.patch, mapping: mapPatchToUnits([{ unitId: 'a', editablePaths: ['src/a.ts'] }], ['src/a.ts']) });
    const decision = advanceEvaluation({ ...base, state: 'private_evaluating', jobs: jobs({ completed: true, evidence: passedEvidence(publicJob) }, { completed: true, evidence: passedEvidence(privateJob) }), fit: evaluatePrivateFit({ partition, observed: completeSelectionEvidence('mismatch') }), candidateDiff: diff });
    expect(decision.nextState).not.toBe('owner_review');
    expect(decision.result).toBeNull();
  });
  it('missing fit or diff inputs are rejected, not silently waived', () => {
    const bothPassed = jobs({ completed: true, evidence: passedEvidence(publicJob) }, { completed: true, evidence: passedEvidence(privateJob) });
    expect(() => advanceEvaluation({ ...base, state: 'private_evaluating', jobs: bothPassed })).toThrowError(AdvanceRejected);
    expect(() => advanceEvaluation({ ...base, state: 'private_evaluating', jobs: bothPassed, fit: { outcome: 'passed', fitStatus: 'fit', packageDefectSuspected: false, policy: 'absent', policyReason: null } })).toThrowError(/candidate_diff_required/);
  });
});
