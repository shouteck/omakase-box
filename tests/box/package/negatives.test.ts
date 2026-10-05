import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgreementInvalid, ExportFailed, PreparationGap } from '../../../packages/box-package/index.js';
import { agreementFile, fixtureCommit, fixtureRepo, materializeFixtureRepo, requirePnpmTooling, runExport, runRoot } from './support.js';

requirePnpmTooling();

describe('box export negatives', () => {
  it('fails naming a reachable-but-excluded protected module with its import chain', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.entrypoints = ['src/server.ts']; }
    });
    try {
      runExport(agreement);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      const gaps = (error as PreparationGap).gaps;
      const excluded = gaps.find(gap => gap.kind === 'reachable-excluded' && gap.detail === 'src/private/eligibility.ts');
      expect(excluded?.chain.join(' -> ')).toBe('src/server.ts -> src/selection/api.ts -> src/private/eligibility.ts');
      expect(error).not.toBeInstanceOf(ExportFailed);
    }
  });

  it('fails naming an undeclared dependency', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.entrypoints = ['src/server.ts']; }
    });
    try {
      runExport(agreement);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      const details = (error as PreparationGap).gaps.filter(gap => gap.kind === 'undeclared-dependency').map(gap => gap.detail);
      expect(details).toContain('fastify');
      expect(details).not.toContain('zod'); // declared
    }
  });

  it('fails on a wrong base commit', () => {
    const agreement = agreementFile('request-a', { baseCommit: '0'.repeat(40) });
    expect(() => runExport(agreement)).toThrowError(/wrong base commit/);
  });

  it('fails when the source tree differs from the base commit', () => {
    const repo = materializeFixtureRepo();
    writeFileSync(join(repo.repo, 'examples', 'private-shop', 'src', 'policy', 'strict-json.ts'), '// tampered\n');
    const agreement = agreementFile('request-a', { baseCommit: repo.baseCommit });
    expect(() => runExport(agreement, repo.repo)).toThrowError(/differs from the base commit/);
  });

  it('rejects an agreement carrying an unlisted field', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.extraField = 'surprise'; }
    });
    expect(() => runExport(agreement)).toThrowError(AgreementInvalid);
  });

  it('rejects an editable owner path escaping the source root', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.editable = [{ kind: 'copy', owner: '../outside.ts', box: 'src/outside.ts' }]; }
    });
    expect(() => runExport(agreement)).toThrowError(AgreementInvalid);
  });

  it('rejects an editable box path escaping the package', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.editable = [{ kind: 'copy', owner: 'config/response-security.json', box: '../escape.json' }]; }
    });
    expect(() => runExport(agreement)).toThrowError(AgreementInvalid);
  });

  it('rejects an editable file under an excluded prefix', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.editable = [{ kind: 'copy', owner: 'src/private/scoring.ts', box: 'src/private/scoring.ts' }]; }
    });
    try {
      runExport(agreement);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).gaps.some(gap => gap.kind === 'excluded-input' && gap.detail === 'src/private/scoring.ts')).toBe(true);
    }
  });

  it('rejects read context under an excluded prefix', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.readContext = ['src/private/eligibility.ts']; }
    });
    try {
      runExport(agreement);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).gaps.some(gap => gap.kind === 'excluded-input')).toBe(true);
    }
  });

  it('fails on an editable file that does not exist', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.editable = [{ kind: 'copy', owner: 'src/missing.ts', box: 'src/missing.ts' }]; }
    });
    try {
      runExport(agreement);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).gaps.some(gap => gap.kind === 'missing-editable')).toBe(true);
    }
  });

  it('rejects a path whose real location escapes the source root through a link', () => {
    const repo = materializeFixtureRepo();
    const outside = join(runRoot('outside'), 'secret');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'secret.ts'), 'export const secret = 1;\n');
    // A junction commits as a plain directory on Windows git; the working-tree path still
    // resolves outside the source root, which is the escape the exporter must refuse.
    symlinkSync(outside, join(repo.repo, 'examples', 'private-shop', 'src', 'vault'), 'junction');
    const baseCommit = fixtureCommit(repo.repo, 'linked-tree');
    const agreement = agreementFile('request-a', {
      baseCommit,
      mutate: value => { value.editable = [{ kind: 'copy', owner: 'src/vault/secret.ts', box: 'src/vault/secret.ts' }]; }
    });
    try {
      runExport(agreement, repo.repo);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).gaps.some(gap => gap.kind === 'escapes-root')).toBe(true);
    }
  });

  it('rejects an entrypoint that names an excluded file through a link inside the root', () => {
    const repo = materializeFixtureRepo();
    const src = join(repo.repo, 'examples', 'private-shop', 'src');
    symlinkSync(join(src, 'private'), join(src, 'policy', 'vault'), 'junction');
    const baseCommit = fixtureCommit(repo.repo, 'linked-private');
    const agreement = agreementFile('request-a', {
      baseCommit,
      mutate: value => { value.entrypoints = ['src/policy/vault/scoring.ts']; }
    });
    try {
      runExport(agreement, repo.repo);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).gaps.some(gap => gap.kind === 'excluded-input')).toBe(true);
    }
  });

  it('rejects a case-aliased editable input that resolves under an excluded prefix', () => {
    // On a case-insensitive filesystem 'SRC/PRIVATE/SCORING.TS' resolves to
    // src/private/scoring.ts; on a case-sensitive one it does not exist. Either way the
    // export must be a named gap, never a shipped file.
    const agreement = agreementFile('request-a', {
      mutate: value => { value.editable = [{ kind: 'copy', owner: 'SRC/PRIVATE/SCORING.TS', box: 'src/policy/alias.ts' }]; }
    });
    try {
      runExport(agreement);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
    }
  });

  it('fails on an unresolved import inside the closure', () => {
    const repo = materializeFixtureRepo();
    writeFileSync(join(repo.repo, 'examples', 'private-shop', 'src', 'policy', 'broken.ts'), "import { nothing } from './nowhere.js';\nexport const value = nothing;\n");
    const baseCommit = fixtureCommit(repo.repo, 'broken-import');
    const agreement = agreementFile('request-a', {
      baseCommit,
      mutate: value => { value.entrypoints = ['src/policy/broken.ts']; }
    });
    try {
      runExport(agreement, repo.repo);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).gaps.some(gap => gap.kind === 'unresolved-import' && gap.detail === './nowhere.js')).toBe(true);
    }
  });

  it('writes nothing to the out directory when selection has gaps', () => {
    const outDir = join(runRoot('blocked'), 'box');
    const agreement = agreementFile('request-a', {
      mutate: value => { value.entrypoints = ['src/server.ts']; }
    });
    expect(() => runExport(agreement, fixtureRepo().repo, outDir)).toThrowError(PreparationGap);
    expect(existsSync(outDir)).toBe(false);
  });
});
