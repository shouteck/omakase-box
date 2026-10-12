import { sep } from 'node:path';

// Path spellings cross files and process boundaries only in POSIX form —
// one leaf helper so importers of this spelling (commands.ts among them)
// never drag the selection walk's compiler dependency into a command path.
export function toPosix(path: string): string {
  return path.split(sep).join('/');
}
