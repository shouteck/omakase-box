export class InvalidInput extends Error {}
export interface PublicItem { id: string; score: number }
export function rankItems(items: readonly PublicItem[]): PublicItem[] {
  if (!Array.isArray(items) || items.length > 1000 || items.some(item => !item || typeof item.id !== 'string' || !/^[\x00-\x7f]*$/.test(item.id) || !Number.isFinite(item.score)) || new Set(items.map(item => item.id)).size !== items.length) throw new InvalidInput('Invalid input.');
  return [...items].sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
