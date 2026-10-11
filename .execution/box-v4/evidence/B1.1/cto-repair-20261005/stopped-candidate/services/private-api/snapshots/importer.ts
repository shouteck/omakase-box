import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { assertDistinctPaths, PortablePathSchema } from '../../../packages/contracts/paths.js';
import { byteHash, contentHash } from '../../../packages/contracts/hash.js';

const MAX_FILE_BYTES = 1048576;
const MAX_TOTAL_BYTES = 16777216;
const Paths = z.array(PortablePathSchema).min(1).max(256).superRefine((paths, context) => {
  try { assertDistinctPaths(paths); } catch { context.addIssue({ code: 'custom', message: 'Conflicting paths.' }); }
  if (paths.some(path => !/\.(?:ts|tsx|js|jsx|json|css|md|txt)$/i.test(path) || path.split('/').some(part => part.startsWith('.') || ['node_modules', 'dist', 'coverage', 'reference-solutions'].includes(part.toLowerCase())))) context.addIssue({ code: 'custom', message: 'Excluded snapshot content.' });
});
export interface SnapshotFile { readonly path: string; readonly bytes: number; readonly sha256: string; readonly content: string }
export interface PinnedSnapshot { readonly schemaVersion: 1; readonly snapshotHash: string; readonly files: readonly SnapshotFile[] }

async function inspectDirectories(directory: string): Promise<void> {
  const parent = dirname(directory);
  if (parent !== directory) await inspectDirectories(parent);
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('snapshot_invalid');
}
async function readSource(root: string, path: string): Promise<Buffer> {
  const absolute = join(root, ...path.split('/'));
  await inspectDirectories(dirname(absolute));
  const before = await lstat(absolute);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_FILE_BYTES) throw new Error('snapshot_invalid');
  const resolved = await realpath(absolute);
  const equivalent = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
  if (!equivalent(resolved, absolute)) throw new Error('snapshot_invalid');
  const file = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error('snapshot_invalid');
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const read = await file.read(bytes, size, bytes.length - size, size);
      if (read.bytesRead === 0) break;
      size += read.bytesRead;
    }
    const after = await file.stat();
    const current = await lstat(absolute);
    await inspectDirectories(dirname(absolute));
    if (size > MAX_FILE_BYTES || size !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || current.isSymbolicLink() || current.nlink !== 1 || current.dev !== opened.dev || current.ino !== opened.ino || !equivalent(await realpath(absolute), absolute)) throw new Error('snapshot_invalid');
    return bytes.subarray(0, size);
  } finally { await file.close(); }
}

export async function importPinnedSnapshot(operatorRoot: string, inputPaths: unknown): Promise<PinnedSnapshot> {
  try {
    const paths = Paths.parse(inputPaths).sort();
    if (typeof operatorRoot !== 'string' || !isAbsolute(operatorRoot)) throw new Error('snapshot_invalid');
    const root = resolve(operatorRoot);
    await inspectDirectories(root);
    const files: SnapshotFile[] = [];
    let total = 0;
    for (const path of paths) {
      const bytes = await readSource(root, path);
      total += bytes.length;
      if (total > MAX_TOTAL_BYTES) throw new Error('snapshot_invalid');
      const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (content.includes('\0')) throw new Error('snapshot_invalid');
      files.push(Object.freeze({ path, bytes: bytes.length, sha256: byteHash(bytes), content }));
    }
    const snapshotHash = contentHash({ schemaVersion: 1, files: files.map(({ content: _content, ...metadata }) => metadata) });
    return Object.freeze({ schemaVersion: 1, snapshotHash, files: Object.freeze(files) });
  } catch { throw new Error('snapshot_invalid'); }
}
