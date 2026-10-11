import { z } from 'zod';

export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const IdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
export const OpaqueIdSchema = z.uuid();
export const TextSchema = z.string().min(1).max(4096);
export const VersionSchema = z.number().int().positive().max(2147483647);
export const AssuranceSchema = z.enum(['proved', 'bounded', 'tested', 'unverified']);
export const EvaluationOutcomeSchema = z.enum(['contract_failure', 'integration_failure', 'package_defect', 'infrastructure_failure', 'passed', 'unverified']);
export const TimestampSchema = z.iso.datetime();
export const MoneySchema = z.strictObject({ currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });
export const RequirementSchema = z.strictObject({
  id: IdSchema,
  description: TextSchema,
  inputs: z.array(TextSchema).max(64),
  outputs: z.array(TextSchema).max(64),
  states: z.array(TextSchema).max(64),
  invalidCases: z.array(TextSchema).max(64),
  exclusions: z.array(TextSchema).max(64),
  examples: z.array(z.strictObject({ given: TextSchema, when: TextSchema, then: TextSchema })).min(1).max(64)
});
export type Requirement = z.infer<typeof RequirementSchema>;
