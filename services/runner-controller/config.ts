import { z } from 'zod';
import { createPublicKey } from 'node:crypto';
import { PROFILE } from '../../packages/runner-protocol/index.js';
function dedicatedHostname(host: string) {
  if (/^[0-9.]+$/.test(host)) {
    const parts = host.split('.');
    if (parts.length !== 4 || parts.some(part => !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255)) return false;
    return !['0','127'].includes(parts[0]!) && !(parts[0] === '169' && parts[1] === '254');
  }
  if (host.split('.').every(part => /^(?:[0-9]+|0x[0-9a-f]+)$/i.test(part))) return false;
  return host.includes('.') && !host.toLowerCase().endsWith('.localhost') && host.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
}

export const RunnerConfigSchema = z.strictObject({ profile: z.literal(PROFILE), host: z.string().max(253).refine(dedicatedHostname), user: z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$/), identityFile: z.string().min(1).max(4096).regex(/^[^\r\n\0]+$/), knownHostsFile: z.string().min(1).max(4096).regex(/^[^\r\n\0]+$/), resultPublicKey: z.string().min(32).max(4096).refine(key => { try { return createPublicKey(key).asymmetricKeyType === 'ed25519'; } catch { return false; } }), baselineDigest: z.string().regex(/^[a-f0-9]{64}$/), brokerVersion: z.literal(1), operatorDedicatedHostAttested: z.literal(true) });
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;
export function runnerCapability(input?: unknown) {
  const configured = RunnerConfigSchema.safeParse(input).success;
  return { assurance: 'unverified', status: configured ? 'configured_not_validated' : 'needs_configuration', requiredProfile: PROFILE, hostExecutionAllowed: false, realValidation: 'unverified', fakeSatisfiesGate: false, reason: configured ? 'Dedicated host, baseline and isolation require live verification.' : 'Valid operator-owned dedicated KVM configuration is required.' } as const;
}
