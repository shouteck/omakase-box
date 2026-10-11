import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderPublicFeedback, feedbackCategoryFor, FeedbackRejected, FeedbackPolicySchema, FEEDBACK_CATEGORIES } from '../../../services/private-api/feedback/policy.js';
import { deriveAcceptanceId, deriveEventId, deriveFeedbackPublicId } from '../../../services/private-api/ledger/acceptance-transaction/record.js';

const publicId = randomUUID();
const details = [
  { checkId: 'selection_ui_check', outcome: 'passed' as const },
  { checkId: 'selection_api_check', outcome: 'failed' as const },
  { checkId: 'selection_e2e_check', outcome: 'unverified' as const },
];

describe('renderPublicFeedback — allowlisted public diagnostics only', () => {
  it('renders the strict public feedback schema with derived message codes', () => {
    const payload = renderPublicFeedback({ publicId, category: 'changes_required', releasePolicyVersion: 3, publicCheckOutcomes: details });
    expect(payload).toEqual({
      schemaVersion: 1, publicId, category: 'changes_required', releasePolicyVersion: 3,
      publicCheckDetails: [
        { checkId: 'selection_ui_check', jobKind: 'public', outcome: 'passed', messageCode: 'passed' },
        { checkId: 'selection_api_check', jobKind: 'public', outcome: 'failed', messageCode: 'requirement_not_met' },
        { checkId: 'selection_e2e_check', jobKind: 'public', outcome: 'unverified', messageCode: 'check_unavailable' },
      ],
    });
    expect(Object.isFrozen(payload)).toBe(true);
  });

  it('carries no field through which private data could leak', () => {
    const payload = renderPublicFeedback({ publicId, category: 'accepted', releasePolicyVersion: 1, publicCheckOutcomes: [] });
    const keys = Object.keys(payload).sort();
    expect(keys).toEqual(['category', 'publicCheckDetails', 'publicId', 'releasePolicyVersion', 'schemaVersion']);
    const serialized = JSON.stringify(payload);
    for (const marker of ['canary', 'stack', 'score', 'privateBase', 'logDigest', 'internal']) expect(serialized).not.toContain(marker);
  });

  it('rejects malformed input rather than rendering partial feedback', () => {
    expect(() => renderPublicFeedback({ publicId: 'not-a-uuid', category: 'accepted', releasePolicyVersion: 1, publicCheckOutcomes: [] })).toThrowError(FeedbackRejected);
    expect(() => renderPublicFeedback({ publicId, category: 'classified_secret' as never, releasePolicyVersion: 1, publicCheckOutcomes: [] })).toThrowError(FeedbackRejected);
    expect(() => renderPublicFeedback({ publicId, category: 'accepted', releasePolicyVersion: 0, publicCheckOutcomes: [] })).toThrowError(FeedbackRejected);
    expect(() => renderPublicFeedback({ publicId, category: 'accepted', releasePolicyVersion: 1, publicCheckOutcomes: [{ checkId: 'x'.repeat(81), outcome: 'passed' }] })).toThrowError(FeedbackRejected);
  });

  it('maps evaluation states to categories; unknown states throw', () => {
    expect(feedbackCategoryFor('accepted')).toBe('accepted');
    expect(feedbackCategoryFor('package_defect')).toBe('package_defect');
    expect(feedbackCategoryFor('infrastructure_failure')).toBe('infrastructure_issue');
    expect(feedbackCategoryFor('changes_required')).toBe('changes_required');
    expect(() => feedbackCategoryFor('unverified_internal_state')).toThrowError(FeedbackRejected);
  });
});

describe('FeedbackPolicySchema — frozen vocabulary document', () => {
  const valid = {
    schemaVersion: 1, id: 'feedback-standard',
    categories: [...FEEDBACK_CATEGORIES],
    messageCodes: ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'],
    privateDiagnostics: 'none', publicDetails: 'approved_public_checks_only',
  };
  it('accepts the complete policy', () => {
    expect(FeedbackPolicySchema.parse(valid).id).toBe('feedback-standard');
  });
  it('rejects private diagnostics or incomplete vocabulary', () => {
    expect(() => FeedbackPolicySchema.parse({ ...valid, privateDiagnostics: 'full' })).toThrow();
    expect(() => FeedbackPolicySchema.parse({ ...valid, categories: ['accepted'] })).toThrow();
    expect(() => FeedbackPolicySchema.parse({ ...valid, extraField: true })).toThrow();
  });
});

describe('derived event identities — deterministic, collision-free scopes', () => {
  const evaluationId = randomUUID();
  it('derives stable UUIDs per decision scope', () => {
    const first = deriveEventId(evaluationId, 'accept');
    expect(deriveEventId(evaluationId, 'accept')).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deriveEventId(evaluationId, 'reject')).not.toBe(first);
    expect(deriveAcceptanceId(evaluationId)).not.toBe(first);
    expect(deriveFeedbackPublicId(evaluationId)).not.toBe(first);
    const other = deriveEventId(randomUUID(), 'accept');
    expect(other).not.toBe(first);
  });
});
