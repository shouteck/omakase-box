import { createHash } from 'node:crypto';
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BoxManifestSchema } from '../../../packages/box-package/index.js';
import { agreementFile, fixtureCommit, fixtureRepo, listFiles, materializeFixtureRepo, privateByteLeaks, requirePnpmTooling, runExport } from './support.js';

requirePnpmTooling();

function manifestOf(outDir: string) {
  return BoxManifestSchema.parse(JSON.parse(readFileSync(join(outDir, 'box.json'), 'utf8')));
}

describe('box export', () => {
  it('exports request A with exactly the declared runnable closure plus scaffold and evaluator', () => {
    const agreement = agreementFile('request-a');
    const result = runExport(agreement);
    expect(result.files).toEqual([
      'box.json',
      'evaluator/request-a.test.ts',
      'package.json',
      'pnpm-lock.yaml',
      'src/config/response-security.json',
      'src/policy/loader.ts',
      'src/policy/strict-json.ts',
      'tsconfig.json'
    ]);
    const manifest = manifestOf(result.outDir);
    expect(manifest.baseCommit).toBe(fixtureRepo().baseCommit);
    expect(manifest.agreementSha256).toBe(createHash('sha256').update(readFileSync(agreement)).digest('hex'));
    expect(manifest.editable).toEqual([{ box: 'src/config/response-security.json', owner: 'config/response-security.json' }]);
    expect(manifest.readContext).toEqual(['src/server.ts', 'src/selection/api.ts']);
    expect(manifest.checks).toEqual(['pnpm exec tsc --noEmit', 'pnpm exec vitest run evaluator/request-a.test.ts']);
    expect(manifest.disclosure).toEqual({ shippedOwnerFiles: 3, inventoryFiles: 15, share: 0.2 });
    expect(manifest.submission.editable).toEqual(manifest.editable);
    expect(manifest.files.map(file => `${file.origin}:${file.owner ?? '-'}->${file.box}`).sort()).toEqual([
      'editable:config/response-security.json->src/config/response-security.json',
      'runnable:src/policy/loader.ts->src/policy/loader.ts',
      'runnable:src/policy/strict-json.ts->src/policy/strict-json.ts'
    ]);
    for (const file of manifest.files) {
      expect(file.box).not.toContain(String.fromCharCode(92));
      expect(file.sha256).toBe(createHash('sha256').update(readFileSync(join(result.outDir, file.box))).digest('hex'));
    }
    expect(privateByteLeaks(result.outDir)).toEqual([]);
  });

  it('exports request B with the generated scaffold and zero owner source disclosed', () => {
    const result = runExport(agreementFile('request-b'));
    expect(result.files).toEqual([
      'box.json',
      'evaluator/request-b.test.ts',
      'package.json',
      'pnpm-lock.yaml',
      'src/ranking/rankItems.ts',
      'tsconfig.json'
    ]);
    const manifest = manifestOf(result.outDir);
    expect(manifest.baseCommit).toBe(fixtureRepo().baseCommit);
    expect(manifest.editable).toEqual([{ box: 'src/ranking/rankItems.ts', owner: 'src/ranking/rankItems.ts' }]);
    expect(manifest.files).toEqual([
      expect.objectContaining({ box: 'src/ranking/rankItems.ts', owner: 'src/ranking/rankItems.ts', origin: 'generated' })
    ]);
    expect(manifest.disclosure).toEqual({ shippedOwnerFiles: 0, inventoryFiles: 15, share: 0 });
    expect(manifest.declaredDependencies).toEqual({});
    const scaffold = readFileSync(join(result.outDir, 'src/ranking/rankItems.ts'), 'utf8');
    expect(scaffold).not.toMatch(/privateScore|private\/scoring/);
    expect(scaffold).toMatch(/export function rankItems/);
    expect(privateByteLeaks(result.outDir)).toEqual([]);
  });

  it('does not count a link inside the source root as an owner file', () => {
    const repo = materializeFixtureRepo();
    const src = join(repo.repo, 'examples', 'private-shop', 'src');
    symlinkSync(join(src, 'private'), join(src, 'policy', 'vault'), 'junction');
    const baseCommit = fixtureCommit(repo.repo, 'linked-tree');
    const result = runExport(agreementFile('request-a', { baseCommit }), repo.repo);
    // Still the 15 real owner files: the junction is not a file, and its target's bytes are
    // already counted at their real path under src/private/.
    expect(result.disclosure.inventoryFiles).toBe(15);
    expect(result.files).not.toContain('src/policy/vault/scoring.ts');
    expect(privateByteLeaks(result.outDir)).toEqual([]);
  });
});
