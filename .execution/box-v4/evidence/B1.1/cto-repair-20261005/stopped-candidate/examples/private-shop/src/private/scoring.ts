export const PRIVATE_SCORING_CANARY = 'SYNTHETIC_PRIVATE_SCORING_CANARY_M0';
export interface PrivateItem { id: string; usage: number; retainedMonths: number }
export function privateScore(item: PrivateItem): number {
  return item.usage * 7 + item.retainedMonths * 13;
}
