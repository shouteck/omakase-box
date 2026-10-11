import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { importPinnedSnapshot } from '../../../services/private-api/snapshots/importer.js';

it('pins actual source bytes in deterministic path order without running lifecycle hooks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-snapshot-test-'));
  try {
    await mkdir(join(root, 'src'));
    const code = 'export const value = 1;\r\n';
    await writeFile(join(root, 'src', 'value.ts'), code);
    const manifest = JSON.stringify({ scripts: { preinstall: 'node -e "require(\'fs\').writeFileSync(\'executed.txt\',\'unsafe\')"' } });
    await writeFile(join(root, 'package.json'), manifest);
    const first = await importPinnedSnapshot(root, ['src/value.ts', 'package.json']);
    const reordered = await importPinnedSnapshot(root, ['package.json', 'src/value.ts']);
    expect(first).toEqual(reordered);
    expect(first.files.map(file => file.path)).toEqual(['package.json', 'src/value.ts']);
    expect(first.files[1]).toEqual({ path: 'src/value.ts', bytes: Buffer.byteLength(code), sha256: createHash('sha256').update(code).digest('hex'), content: code });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.files)).toBe(true);
    expect(Object.isFrozen(first.files[1])).toBe(true);
    await expect(readFile(join(root, 'executed.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(join(root, 'src', 'value.ts'), 'export const value = 2;\r\n');
    expect((await importPinnedSnapshot(root, ['src/value.ts', 'package.json'])).snapshotHash).not.toBe(first.snapshotHash);
    expect(first.files[1]!.content).toBe(code);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('requires an absolute operator-selected root and a nonempty bounded explicit path set', async () => {
  await expect(importPinnedSnapshot('.', ['src/value.ts'])).rejects.toThrow('snapshot_invalid');
  const root = await mkdtemp(join(tmpdir(), 'private-snapshot-test-'));
  try {
    for (const paths of [[], ['same.ts', 'same.ts'], ['same.ts', 'SAME.ts'], Array.from({ length: 257 }, (_, index) => `f${index}.ts`), 'src/value.ts']) {
      await expect(importPinnedSnapshot(root, paths)).rejects.toThrow('snapshot_invalid');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
