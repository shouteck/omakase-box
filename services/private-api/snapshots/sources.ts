import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { SnapshotSourceSchema } from '../requests/types.js';

export async function loadSnapshotSources(path: string | undefined) {
  if (!path) return [];
  if (!isAbsolute(path)) throw new Error('invalid_snapshot_configuration');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 65536) throw new Error('invalid_snapshot_configuration');
  return z.array(SnapshotSourceSchema).max(32).parse(JSON.parse(await readFile(path, 'utf8')));
}
