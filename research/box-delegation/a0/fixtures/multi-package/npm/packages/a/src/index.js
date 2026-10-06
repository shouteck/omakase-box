import { cents } from '@fx/b';

export function total(items) {
  return items.reduce((sum, item) => sum + cents(item.price), 0);
}
