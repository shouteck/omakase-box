import { existsSync, realpathSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';

// Safe lookup of the programs the tool itself launches — `git`, `gh`,
// `cmd.exe`. Copied from the older platform's commands.ts `resolveProgram`
// and paths.ts `toPosix` (BT34): the bounty tool keeps its own so the
// platform's removal touches nothing here. The function body, the
// constants and the error names and messages are the original bytes; the
// classes extend Error where the originals extended the platform's
// ExportFailed — every catch around this in the bounty tool is a bare
// catch, so nothing can tell the two apart.

// Path spellings cross files and process boundaries only in POSIX form.
export function toPosix(path: string): string {
  return path.split(sep).join('/');
}

export class ProgramUnavailable extends Error {
  constructor(readonly program: string) {
    super(`declared program '${program}' is not available: it is not on PATH and not an existing path`);
    this.name = 'ProgramUnavailable';
  }
}

export class ProgramLaunchUnsupported extends Error {
  constructor(detail: string) {
    super(`declared program cannot be launched safely: ${detail}`);
    this.name = 'ProgramLaunchUnsupported';
  }
}

export interface ResolvedProgram { readonly path: string; readonly kind: 'executable' | 'command-file' }
const COMMAND_FILE = /\.(cmd|bat)$/i;
const pathExtensions = (): string[] => (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map(ext => ext.toLowerCase()).filter(ext => ext !== '');

export function resolveProgram(program: string, root?: string): ResolvedProgram {
  const candidates: string[] = [];
  const push = (base: string): void => {
    candidates.push(base);
    if (process.platform === 'win32' && !/\.[^\\/]+$/.test(base)) {
      for (const ext of pathExtensions()) candidates.push(base + ext);
    }
  };
  if (isAbsolute(program)) push(resolve(program));
  else if (program.includes('/') || program.includes('\\')) push(resolve(root ?? process.cwd(), program));
  else for (const dir of (process.env.PATH ?? '').split(delimiter)) { if (dir !== '') push(join(dir, program)); }
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      if (root !== undefined && !isAbsolute(program) && (program.includes('/') || program.includes('\\'))) {
        const canonicalRoot = realpathSync(root);
        const offset = relative(canonicalRoot, realpathSync(candidate));
        if (offset === '' || offset.startsWith('..') || isAbsolute(offset)) {
          throw new ProgramLaunchUnsupported(`declared program path '${program}' resolves outside the context root`);
        }
      }
      return { path: candidate, kind: COMMAND_FILE.test(candidate) ? 'command-file' : 'executable' };
    }
  }
  throw new ProgramUnavailable(program);
}
