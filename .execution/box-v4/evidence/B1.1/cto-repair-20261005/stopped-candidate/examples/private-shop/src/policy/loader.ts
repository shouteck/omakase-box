import { z } from 'zod';
import { parseStrictJson } from './strict-json.js';

export const ResponsePolicySchema = z.strictObject({
  schemaVersion: z.literal(1), frameAncestors: z.enum(['none', 'self']), noSniff: z.boolean(),
  referrerPolicy: z.enum(['no-referrer', 'same-origin', 'strict-origin-when-cross-origin']),
  hsts: z.strictObject({ enabled: z.boolean(), maxAgeSeconds: z.number().int().min(0).max(31536000), includeSubDomains: z.boolean() })
});
export type ResponsePolicy = z.infer<typeof ResponsePolicySchema>;
export interface TrustedIngress { https: boolean; localhost: boolean; route: string }
export function loadResponsePolicy(source: string): ResponsePolicy {
  return ResponsePolicySchema.parse(parseStrictJson(source));
}
export function applyResponsePolicy(headers: Record<string, string>, policy: ResponsePolicy, ingress: TrustedIngress): Record<string, string> {
  const checked = ResponsePolicySchema.parse(policy);
  if (ingress.route === '/health') return { ...headers };
  const controlled = new Set(['content-security-policy', 'x-content-type-options', 'referrer-policy', 'strict-transport-security']);
  const result = Object.fromEntries(Object.entries(headers).filter(([key]) => !controlled.has(key.toLowerCase())));
  result['Content-Security-Policy'] = `frame-ancestors '${checked.frameAncestors}'`;
  result['Referrer-Policy'] = checked.referrerPolicy;
  if (checked.noSniff) result['X-Content-Type-Options'] = 'nosniff';
  if (checked.hsts.enabled && ingress.https && !ingress.localhost) result['Strict-Transport-Security'] = `max-age=${checked.hsts.maxAgeSeconds}${checked.hsts.includeSubDomains ? '; includeSubDomains' : ''}`;
  return result;
}
