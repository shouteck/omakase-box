import { z } from 'zod';
import { HashSchema, IdSchema, MoneySchema, OpaqueIdSchema, TextSchema, VersionSchema } from '../common.js';
import { CompositionShape, validateComposition } from './composition.js';

export const TaskTermsSchema = z.strictObject({
  reservationDurationSeconds: z.number().int().positive().max(2592000),
  maxEvaluatedAttempts: z.number().int().positive().max(100),
  maxPatchBytes: z.number().int().positive().max(1048576),
  maxChangedLines: z.number().int().positive().max(10000),
  revisionPolicy: z.literal('preserve_original_expiry'),
  cancellationPolicy: TextSchema,
  packageDefectCompensation: MoneySchema,
  budgetExhaustionPolicy: TextSchema
});
export const ExternalTaskContractSchema = z.strictObject({
  schemaVersion: z.literal(1),
  taskId: OpaqueIdSchema,
  lineageId: OpaqueIdSchema,
  version: VersionSchema,
  title: z.string().min(1).max(160),
  purpose: TextSchema,
  ...CompositionShape,
  dependencies: z.array(z.strictObject({ name: z.string().regex(/^(?:@[a-z0-9_-]+\/)?[a-z0-9_.-]+$/), version: z.string().regex(/^\d+\.\d+\.\d+$/) })).max(64),
  template: z.strictObject({ id: IdSchema, version: VersionSchema, sha256: HashSchema }),
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  executionProfile: z.literal('dedicated-linux-kvm-fresh-vm'),
  acceptanceCategories: z.array(z.enum(['contract_failure', 'integration_failure', 'package_defect', 'infrastructure_failure', 'passed', 'unverified'])).min(6).max(6),
  terms: TaskTermsSchema,
  reward: MoneySchema,
  feedbackPolicyId: IdSchema
}).superRefine((task, context) => {
  validateComposition(task, context);
  if (new Set(task.acceptanceCategories).size !== 6) context.addIssue({ code: 'custom', message: 'All acceptance categories must be frozen exactly once.' });
  if (new Set(task.dependencies.map(dependency => dependency.name)).size !== task.dependencies.length) context.addIssue({ code: 'custom', message: 'Duplicate dependency.' });
  if (task.reward.currency !== task.terms.packageDefectCompensation.currency) context.addIssue({ code: 'custom', message: 'Compensation currency differs from reward.' });
});
export const PublicListingSchema = z.strictObject({
  schemaVersion: z.literal(1), taskId: OpaqueIdSchema, version: VersionSchema,
  title: z.string().min(1).max(160), purpose: TextSchema,
  disciplines: z.array(IdSchema).min(1).max(32), reward: MoneySchema,
  estimatedEffortMinutes: z.number().int().nonnegative().max(525600).nullable(),
  terms: TaskTermsSchema
});
export type ExternalTaskContract = z.infer<typeof ExternalTaskContractSchema>;
export type PublicListing = z.infer<typeof PublicListingSchema>;
export function projectPublicListing(contract: ExternalTaskContract, estimatedEffortMinutes: number | null): PublicListing {
  const checked = ExternalTaskContractSchema.parse(contract);
  return PublicListingSchema.parse({ schemaVersion: 1, taskId: checked.taskId, version: checked.version, title: checked.title, purpose: checked.purpose, disciplines: checked.disciplines, reward: checked.reward, estimatedEffortMinutes, terms: checked.terms });
}
