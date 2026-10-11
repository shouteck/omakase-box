import { mkdtemp, mkdir, writeFile, readFile, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { importPinnedSnapshot } from '../../../services/private-api/snapshots/importer.js';

it.each(['../outside.ts', '/outside.ts', 'C:/outside.ts', '//server/share.ts', 'src\\outside.ts', 'src/file.ts:stream', 'src/CON.ts', 'src/file.ts.', 'src/file.ts ', '.env', '.git/config', 'node_modules/a.ts', 'reference-solutions/answer.ts', 'src/run.exe'])('rejects unsafe or excluded snapshot path %s with a fixed error', async path => {
  await expect(importPinnedSnapshot(join(tmpdir(), 'not-read-by-invalid-path-tests'), [path])).rejects.toThrow('snapshot_invalid');
});

it('rejects root/directory links and hardlinked files instead of following host aliases', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-snapshot-security-'));
  try {
    await mkdir(join(root, 'repo'));
    await mkdir(join(root, 'outside'));
    await writeFile(join(root, 'outside', 'private.ts'), 'synthetic-host-file-canary');
    await symlink(join(root, 'outside'), join(root, 'repo', 'linked'), 'junction');
    await symlink(join(root, 'repo'), join(root, 'root-alias'), 'junction');
    await expect(importPinnedSnapshot(join(root, 'repo'), ['linked/private.ts'])).rejects.toThrow('snapshot_invalid');
    await expect(importPinnedSnapshot(join(root, 'root-alias'), ['linked/private.ts'])).rejects.toThrow('snapshot_invalid');
    await link(join(root, 'outside', 'private.ts'), join(root, 'repo', 'hardlinked.ts'));
    await expect(importPinnedSnapshot(join(root, 'repo'), ['hardlinked.ts'])).rejects.toThrow('snapshot_invalid');
    expect(await readFile(join(root, 'outside', 'private.ts'), 'utf8')).toBe('synthetic-host-file-canary');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('accepts the file-size boundary but rejects the aggregate snapshot byte budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-snapshot-security-'));
  try {
    const bytes = Buffer.alloc(1048576, 65);
    const paths = Array.from({ length: 17 }, (_, index) => `source${index}.ts`);
    for (const path of paths) await writeFile(join(root, path), bytes);
    expect((await importPinnedSnapshot(root, [paths[0]!])).files[0]!.bytes).toBe(1048576);
    await expect(importPinnedSnapshot(root, paths)).rejects.toThrow('snapshot_invalid');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects oversized/binary/invalid UTF-8 inputs and does not leak source diagnostics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-snapshot-security-'));
  try {
    await writeFile(join(root, 'oversized.ts'), Buffer.alloc(1048577, 65));
    await writeFile(join(root, 'binary.ts'), Buffer.from([65, 0, 66]));
    await writeFile(join(root, 'invalid.ts'), Buffer.from([0xc3, 0x28]));
    for (const path of ['oversized.ts', 'binary.ts', 'invalid.ts', 'missing-canary.ts']) {
      try { await importPinnedSnapshot(root, [path]); throw new Error('Unexpected successful import.'); }
      catch (error) { expect(error).toBeInstanceOf(Error); expect((error as Error).message).toBe('snapshot_invalid'); expect((error as Error).message).not.toContain(root); }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
