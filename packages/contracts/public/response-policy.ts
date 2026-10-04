import { z } from 'zod';
import { HashSchema, IdSchema } from '../common.js';
import { contentHash } from '../hash.js';

export const ResponsePolicySchema = z.strictObject({
  schemaVersion: z.literal(1), frameAncestors: z.enum(['none', 'self']), noSniff: z.boolean(),
  referrerPolicy: z.enum(['no-referrer', 'same-origin', 'strict-origin-when-cross-origin']),
  hsts: z.strictObject({ enabled: z.boolean(), maxAgeSeconds: z.number().int().min(0).max(31536000), includeSubDomains: z.boolean() })
});
export type ResponsePolicy = z.infer<typeof ResponsePolicySchema>;
export const PolicySpecificationSchema = z.strictObject({
  schemaVersion: z.literal(1), editablePath: z.literal('config/response-security.json'), allowedPolicies: z.array(ResponsePolicySchema).min(1).max(16),
  excludedRoutes: z.tuple([z.literal('/health')]), ingressPolicy: z.literal('trusted_https_non_localhost'), overridePolicy: z.literal('strip_candidate_controlled_headers')
}).superRefine((value, context) => {
  if (new Set(value.allowedPolicies.map(policy => contentHash(policy))).size !== value.allowedPolicies.length) context.addIssue({ code: 'custom', message: 'Duplicate allowed policy.' });
});
export type PolicySpecification = z.infer<typeof PolicySpecificationSchema>;
export const PolicyCandidateSchema = z.strictObject({ path: z.literal('config/response-security.json'), source: z.string().max(65536), sha256: HashSchema });
export const PolicyCapabilityCandidatesSchema = z.array(z.strictObject({ id: IdSchema, disciplines: z.array(IdSchema).min(1).max(32), capability: IdSchema })).max(256);
export const PolicyIngressSchema = z.strictObject({ https: z.boolean(), localhost: z.boolean(), route: z.enum(['/selection', '/health']) });
export const PolicyHeadersSchema = z.record(z.string().regex(/^[A-Za-z0-9-]{1,128}$/), z.string().max(8192).refine(value => !/[\r\n\u0000]/.test(value)));
