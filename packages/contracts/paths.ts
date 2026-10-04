import { z } from 'zod';

export function isPortablePath(value: string): boolean {
  if (!value || value.length > 240 || !/^[A-Za-z0-9_./-]+$/.test(value) || value.startsWith('/') || value.includes('\\')) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !part.endsWith('.') && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
}
export const PortablePathSchema = z.string().refine(isPortablePath, 'Unsafe portable relative path.');
export function assertDistinctPaths(paths: readonly string[]): void {
  const normalized = paths.map(path => PortablePathSchema.parse(path).toLowerCase());
  const seen = new Set<string>();
  for (const path of normalized) {
    if (seen.has(path)) throw new Error('Duplicate or case-folded path collision.');
    seen.add(path);
  }
  for (const path of normalized) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) if (seen.has(parts.slice(0, i).join('/'))) throw new Error('File/directory path collision.');
  }
}
export function isEditablePath(value: string): boolean {
  return isPortablePath(value) && !/(^|\/)(tests?|harness(?:es)?|node_modules|dist|coverage|\.git|\.github)(\/|$)/i.test(value) && !/(^|\/)(package\.json|(?:pnpm|package)-lock\.(?:yaml|json)|yarn\.lock|.*\.config\.[a-z]+|tsconfig[^/]*\.json|Dockerfile|.*\.map)$/i.test(value);
}
