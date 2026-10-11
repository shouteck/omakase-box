import { privateScore } from '../private/scoring.js';
import type { PrivateItem } from '../private/scoring.js';

export function rankPrivateItems(items: PrivateItem[]): PrivateItem[] {
  return items.sort((left, right) => privateScore(right) - privateScore(left));
}
