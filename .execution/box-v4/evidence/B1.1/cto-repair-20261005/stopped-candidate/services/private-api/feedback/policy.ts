import { z } from 'zod';
import { PublicFeedbackSchema } from '../../../packages/contracts/public/submission.js';
import { IdSchema } from '../../../packages/contracts/common.js';

/**
 * Approved public-feedback vocabulary (M7.2). The frozen release policy
 * document declares this exact closed vocabulary; the renderer admits only
 * the allowlisted schema, so private diagnostics, canary values, stack
 * traces and private scores can never be projected outward — the output
 * shape simply has no field for them.
 */

export const FEEDBACK_CATEGORIES = ['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired'] as const;
export const FEEDBACK_MESSAGE_CODES = ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'] as const;

export const FeedbackPolicySchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: IdSchema,
  categories: z.array(PublicFeedbackSchema.shape.category).length(8),
  messageCodes: z.array(z.enum(FEEDBACK_MESSAGE_CODES)).length(4),
  privateDiagnostics: z.literal('none'),
  publicDetails: z.literal('approved_public_checks_only'),
}).superRefine((policy, context) => {
  if (new Set(policy.categories).size !== FEEDBACK_CATEGORIES.length || new Set(policy.messageCodes).size !== FEEDBACK_MESSAGE_CODES.length) {
    context.addIssue({ code: 'custom', message: 'Feedback vocabulary must be complete and unique.' });
  }
});
export type FeedbackPolicy = z.infer<typeof FeedbackPolicySchema>;

export class FeedbackRejected extends Error {
  constructor(readonly code: string) { super(`Public feedback rejected: ${code}.`); }
}

export interface PublicCheckDetail {
  readonly checkId: string;
  readonly outcome: 'passed' | 'failed' | 'unverified';
}

const MESSAGE_BY_OUTCOME = { passed: 'passed', failed: 'requirement_not_met', unverified: 'check_unavailable' } as const;

/**
 * Render one allowlisted public feedback event. Inputs are trusted private
 * values (evaluation binding, approved policy, authoritative public-check
 * outcomes); every output field is schema-checked, so nothing else can
 * cross the boundary — including caller-supplied extras, which fail strict
 * parsing rather than being forwarded.
 */
export function renderPublicFeedback(input: {
  publicId: string;
  category: (typeof FEEDBACK_CATEGORIES)[number];
  releasePolicyVersion: number;
  publicCheckOutcomes: readonly PublicCheckDetail[];
}): z.infer<typeof PublicFeedbackSchema> {
  let parsed: z.infer<typeof PublicFeedbackSchema>;
  try {
    parsed = PublicFeedbackSchema.parse({
      schemaVersion: 1,
      publicId: input.publicId,
      category: input.category,
      releasePolicyVersion: input.releasePolicyVersion,
      publicCheckDetails: input.publicCheckOutcomes.map(check => ({
        checkId: check.checkId,
        jobKind: 'public' as const,
        outcome: check.outcome,
        messageCode: MESSAGE_BY_OUTCOME[check.outcome],
      })),
    });
  } catch {
    throw new FeedbackRejected('invalid_feedback');
  }
  return Object.freeze(parsed);
}

/** The feedback event category an evaluation state may project. Terminal states only are rendered by acceptance paths. */
export function feedbackCategoryFor(state: string): (typeof FEEDBACK_CATEGORIES)[number] {
  switch (state) {
    case 'received': return 'received';
    case 'public_evaluating': case 'private_evaluating': return 'processing';
    case 'owner_review': return 'owner_review';
    case 'accepted': return 'accepted';
    case 'changes_required': return 'changes_required';
    case 'package_defect': return 'package_defect';
    case 'infrastructure_failure': return 'infrastructure_issue';
    default: throw new FeedbackRejected('invalid_feedback');
  }
}
