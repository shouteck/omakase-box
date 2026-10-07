import { lstatSync, unlinkSync } from 'node:fs';

export function removeFixtureLink(path: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return;
  if (!stat.isSymbolicLink()) throw new Error(`fixture link path holds a real entry: ${path}`);
  unlinkSync(path);
}
