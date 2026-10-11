import { byteHash } from '../../../packages/contracts/hash.js';
import { assertDistinctPaths, isEditablePath, isPortablePath } from '../../../packages/contracts/paths.js';

export const PATCH_LIMITS = {
  maxBytes: 1_048_576,
  maxChangedLines: 10_000,
  maxFiles: 256,
} as const;

export class PatchRejected extends Error {
  constructor(
    readonly code:
      | 'patch_too_large'
      | 'patch_not_utf8'
      | 'patch_malformed'
      | 'patch_binary'
      | 'patch_mode_change'
      | 'patch_rename'
      | 'patch_copy'
      | 'patch_submodule'
      | 'patch_symlink'
      | 'path_unsafe'
      | 'path_not_editable'
      | 'path_outside_allowlist'
      | 'path_collision'
      | 'path_mismatch'
      | 'too_many_changed_lines'
      | 'too_many_files'
      | 'patch_empty',
  ) {
    super(code);
    this.name = 'PatchRejected';
  }
}

export interface PatchFileEdit {
  readonly path: string;
  readonly addedLines: number;
  readonly removedLines: number;
}

export interface ValidatedPatch {
  readonly hash: string;
  readonly files: readonly PatchFileEdit[];
  readonly changedLines: number;
  readonly text: string;
}

const DIFF_GIT = /^diff --git a\/(\S+) b\/(\S+)$/;
const HUNK = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@(?: .*)?$/;
const HUNK_COUNTS = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const MODE_LINE = /^(old mode|new mode|new file mode|deleted file mode)\b/;
const RENAME_LINE = /^(rename from|rename to|copy from|copy to|similarity index|dissimilarity index)\b/;
const BINARY_LINE = /^(Binary files|GIT binary patch|Binary patch)/;
const SYMLINK_MODE = /^index [0-9a-f]+\.\.[0-9a-f]+ 120000/;
const SUBMODULE_MODE = /^index [0-9a-f]+\.\.[0-9a-f]+ 160000/;

function gitPath(raw: string): string {
  return raw.startsWith('a/') || raw.startsWith('b/') ? raw.slice(2) : raw;
}

/**
 * Strict unified-patch validator. No candidate byte is executed; the patch is
 * treated purely as text and must satisfy the bounded editable-surface policy
 * before any permit is issued. Line endings are normalized for parsing only.
 */
export function validatePatch(input: { bytes: Uint8Array; editablePaths: readonly string[] }): ValidatedPatch {
  const { bytes, editablePaths } = input;
  if (bytes.length === 0) throw new PatchRejected('patch_empty');
  if (bytes.length > PATCH_LIMITS.maxBytes) throw new PatchRejected('patch_too_large');
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new PatchRejected('patch_not_utf8');
  }
  if (raw.includes(String.fromCharCode(0))) throw new PatchRejected('patch_not_utf8');
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const editable = new Set(editablePaths.map(path => path.toLowerCase()));
  const files: PatchFileEdit[] = [];
  const seenPaths: string[] = [];
  let changedLines = 0;
  let i = 0;
  while (i < lines.length) {
    const git = DIFF_GIT.exec(lines[i]!);
    if (!git) {
      if (BINARY_LINE.test(lines[i]!)) throw new PatchRejected('patch_binary');
      throw new PatchRejected('patch_malformed');
    }
    const path = gitPath(git[1]!);
    if (path !== gitPath(git[2]!)) throw new PatchRejected('path_mismatch');
    if (!isPortablePath(path)) throw new PatchRejected('path_unsafe');
    if (!isEditablePath(path)) throw new PatchRejected('path_not_editable');
    if (!editable.has(path.toLowerCase())) throw new PatchRejected('path_outside_allowlist');
    seenPaths.push(path);
    i += 1;
    let added = 0;
    let removed = 0;
    let sawHunk = false;
    while (i < lines.length && !lines[i]!.startsWith('diff --git ')) {
      const meta = lines[i]!;
      if (BINARY_LINE.test(meta)) throw new PatchRejected('patch_binary');
      if (MODE_LINE.test(meta)) throw new PatchRejected('patch_mode_change');
      if (RENAME_LINE.test(meta)) throw new PatchRejected('patch_rename');
      if (SUBMODULE_MODE.test(meta) || meta.startsWith('Subproject commit')) throw new PatchRejected('patch_submodule');
      if (SYMLINK_MODE.test(meta)) throw new PatchRejected('patch_symlink');
      if (meta.startsWith('index ')) {
        i += 1;
        continue;
      }
      if (meta.startsWith('--- ')) {
        const from = gitPath(meta.slice(4).split('\t')[0]!.trim());
        const next = lines[i + 1];
        if (!next || !next.startsWith('+++ ')) throw new PatchRejected('patch_malformed');
        const to = gitPath(next.slice(4).split('\t')[0]!.trim());
        if (from === '/dev/null' || to === '/dev/null') throw new PatchRejected('patch_mode_change');
        if (from !== path || to !== path) throw new PatchRejected('path_mismatch');
        i += 2;
        continue;
      }
      const hunk = HUNK_COUNTS.exec(meta);
      if (hunk) {
        sawHunk = true;
        let oldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
        let newRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
        i += 1;
        while (i < lines.length && (oldRemaining > 0 || newRemaining > 0)) {
          const body = lines[i]!;
          if (body.startsWith('+')) {
            newRemaining -= 1;
            added += 1;
            changedLines += 1;
          } else if (body.startsWith('-')) {
            oldRemaining -= 1;
            removed += 1;
            changedLines += 1;
          } else if (body.startsWith(' ') || body === '') {
            oldRemaining -= 1;
            newRemaining -= 1;
          } else if (body.startsWith('\\')) {
            // "\ No newline at end of file"
          } else {
            throw new PatchRejected('patch_malformed');
          }
          if (oldRemaining < 0 || newRemaining < 0) throw new PatchRejected('patch_malformed');
          i += 1;
        }
        if (oldRemaining !== 0 || newRemaining !== 0) throw new PatchRejected('patch_malformed');
        if (changedLines > PATCH_LIMITS.maxChangedLines) throw new PatchRejected('too_many_changed_lines');
        continue;
      }
      throw new PatchRejected('patch_malformed');
    }
    if (!sawHunk) throw new PatchRejected('patch_malformed');
    files.push({ path, addedLines: added, removedLines: removed });
    if (files.length > PATCH_LIMITS.maxFiles) throw new PatchRejected('too_many_files');
  }
  if (files.length === 0) throw new PatchRejected('patch_empty');
  try {
    assertDistinctPaths(seenPaths);
  } catch {
    throw new PatchRejected('path_collision');
  }
  return { hash: byteHash(bytes), files, changedLines, text };
}
