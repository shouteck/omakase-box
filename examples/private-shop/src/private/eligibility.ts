export const PRIVATE_ELIGIBILITY_CANARY = 'SYNTHETIC_PRIVATE_ELIGIBILITY_CANARY_M0';
export interface SyntheticSubject { id: string; tier: 'basic' | 'verified'; region: 'north' | 'south' }
export function derivePrivateOptions(subject: SyntheticSubject) {
  const regionalAdjustment = subject.region === 'north' ? 125 : 0;
  return [
    { id: 'basic', displayName: 'Basic', monthlyPriceCents: 2000 + regionalAdjustment, available: true, disabledReason: '' },
    { id: 'pro', displayName: 'Pro', monthlyPriceCents: 4500 + regionalAdjustment, available: subject.tier === 'verified', disabledReason: subject.tier === 'verified' ? '' : 'Not available for this synthetic scenario.' }
  ];
}
