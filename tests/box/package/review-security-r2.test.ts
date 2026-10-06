import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgreementInvalid, ExportFailed, parseAgreement, PreparationGap, proposeSelection } from '../../../packages/box-package/index.js';
import { agreementFile, fixtureCommit, materializeFixtureRepo, privateByteLeaks, requirePnpmTooling, runExport } from './support.js';

requirePnpmTooling();

// D2.1 pass, round 2: the fix decides containment and exclusion on the canonical real path.
// These probes attack sites the round-1 review did not cover: a case-aliased *import
// specifier* inside shipped source, links into deeper excluded subtrees and through '..',
// a mixed-case prefix declared in the agreement itself, an editable copy under a case
// alias, a box destination under an excluded prefix, and schema-level '.'/'..' spellings.
describe('exclusion bypass probes, round 2 (added by the D2.1 pass)', () => {
  it('names an import specifier that reaches an excluded file through a case alias', () => {
    // The alias lives in owner source, not in the agreement: on a case-insensitive
    // filesystem '../PRIVATE/scoring.js' resolves to src/private/scoring.ts.
    const repo = materializeFixtureRepo();
    const src = join(repo.repo, 'examples', 'private-shop', 'src');
    writeFileSync(join(src, 'policy', 'trojan.ts'), "import { PRIVATE_SCORING_CANARY } from '../PRIVATE/scoring.js';\nexport const leaked = PRIVATE_SCORING_CANARY;\n");
    const baseCommit = fixtureCommit(repo.repo, 'case-aliased-import');
    const path = agreementFile('request-a', {
      baseCommit,
      mutate: value => { value.entrypoints = ['src/policy/trojan.ts']; }
    });
    const agreement = parseAgreement(JSON.parse(readFileSync(path, 'utf8')) as unknown);
    const selection = proposeSelection(agreement, join(repo.repo, 'examples', 'private-shop'));
    expect(selection.gaps.some(gap => gap.kind === 'reachable-excluded' && gap.detail.toLowerCase() === 'src/private/scoring.ts')).toBe(true);
    expect(selection.files.some(file => file.owner.startsWith('src/private/'))).toBe(false);
  });

  it('rejects an entrypoint naming an excluded file through a link two levels down', () => {
    const repo = materializeFixtureRepo();
    const src = join(repo.repo, 'examples', 'private-shop', 'src');
    mkdirSync(join(src, 'private', 'deep'), { recursive: true });
    writeFileSync(join(src, 'private', 'deep', 'secret.ts'), "export const PRIVATE_DEEP_CANARY = 'SYNTHETIC_PRIVATE_DEEP_CANARY';\n");
    symlinkSync(join(src, 'private', 'deep'), join(src, 'policy', 'vault'), 'junction');
    const baseCommit = fixtureCommit(repo.repo, 'linked-deep-private');
    const agreement = agreementFile('request-a', {
      baseCommit,
      mutate: value => { value.files = [{ owner: 'src/policy/vault/secret.ts' }]; }
    });
    try {
      runExport(agreement, repo.repo);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).gaps.some(gap => gap.kind === 'excluded-input')).toBe(true);
    }
  });

  it('rejects an editable copy naming an excluded file through a link', () => {
    const repo = materializeFixtureRepo();
    const src = join(repo.repo, 'examples', 'private-shop', 'src');
    mkdirSync(join(src, 'private', 'deep'), { recursive: true });
    writeFileSync(join(src, 'private', 'deep', 'secret.ts'), "export const PRIVATE_DEEP_CANARY = 'SYNTHETIC_PRIVATE_DEEP_CANARY';\n");
    symlinkSync(join(src, 'private', 'deep'), join(src, 'policy', 'vault'), 'junction');
    const baseCommit = fixtureCommit(repo.repo, 'linked-deep-private-editable');
    const agreement = agreementFile('request-a', {
      baseCommit,
      mutate: value => { (value.editable as unknown[]).push({ kind: 'copy', owner: 'src/policy/vault/secret.ts', box: 'src/policy/vault-secret.ts' }); }
    });
    try {
      runExport(agreement, repo.repo);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
    }
  });

  it('emits the canonical owner path for a committed link to a non-excluded dir', () => {
    // A committed junction to a sibling dir resolves to the canonical owner path: the
    // emitted box path is src/policy/loader.ts, never the link spelling src/selection/up/*.
    const repo = materializeFixtureRepo();
    const src = join(repo.repo, 'examples', 'private-shop', 'src');
    symlinkSync(join(src, 'policy'), join(src, 'selection', 'up'), 'junction');
    const baseCommit = fixtureCommit(repo.repo, 'linked-sibling');
    const agreement = agreementFile('request-a', {
      baseCommit,
      mutate: value => { value.files = [{ owner: 'src/selection/up/loader.ts' }]; }
    });
    const result = runExport(agreement, repo.repo);
    expect(result.files).toContain('src/policy/loader.ts');
    expect(result.files.some(file => file.includes('selection/up'))).toBe(false);
    expect(privateByteLeaks(result.outDir)).toEqual([]);
  });

  it('fails closed on a link created inside the source root after the base commit', () => {
    // A junction the base commit does not know about makes the tree dirty: the export
    // refuses before selection ever runs.
    const repo = materializeFixtureRepo();
    const src = join(repo.repo, 'examples', 'private-shop', 'src');
    symlinkSync(join(src, 'private'), join(src, 'policy', 'vault'), 'junction');
    const agreement = agreementFile('request-a', {
      baseCommit: repo.baseCommit,
      mutate: value => { value.entrypoints = ['src/policy/vault/scoring.ts']; }
    });
    expect(() => runExport(agreement, repo.repo)).toThrowError(ExportFailed);
  });

  it('still excludes when the agreement declares the prefix in mixed case', () => {
    // The fold must run on both sides: 'SRC/PRIVATE/' declared in the agreement must still
    // exclude src/private/*.
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.excludedPrefixes = ['SRC/PRIVATE/', 'REFERENCE-SOLUTIONS/', 'NODE_MODULES/', 'DIST/'];
        value.files = [{ owner: 'src/private/scoring.ts' }];
      }
    });
    try {
      runExport(agreement);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).gaps.some(gap => gap.kind === 'excluded-input')).toBe(true);
    }
  });

  it('rejects an editable copy spelled under a case alias', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { (value.editable as unknown[]).push({ kind: 'copy', owner: 'src/Private/Scoring.ts', box: 'src/policy/alias.ts' }); }
    });
    try {
      runExport(agreement);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
    }
  });

  it('rejects an editable copy whose box destination sits under an excluded prefix', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { (value.editable as unknown[]).push({ kind: 'copy', owner: 'src/policy/strict-json.ts', box: 'src/private/strict-json.ts' }); }
    });
    try {
      runExport(agreement);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).gaps.some(gap => gap.kind === 'excluded-input')).toBe(true);
    }
  });

  it('rejects a read-context entry naming an excluded file through a link', () => {
    const repo = materializeFixtureRepo();
    const src = join(repo.repo, 'examples', 'private-shop', 'src');
    symlinkSync(join(src, 'private'), join(src, 'policy', 'vault'), 'junction');
    const baseCommit = fixtureCommit(repo.repo, 'linked-private-context');
    const agreement = agreementFile('request-a', {
      baseCommit,
      mutate: value => { value.readContext = ['src/policy/vault/scoring.ts']; }
    });
    try {
      runExport(agreement, repo.repo);
      expect.unreachable('export should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
    }
  });

  it('fails closed on agreement spellings the schema cannot normalize', () => {
    for (const spelling of ['src/./policy/loader.ts', 'src/policy/../server.ts', 'src//policy//loader.ts', 'src/PRIVAT~1/scoring.ts', 'src/private/scoring.ts:stream']) {
      const agreement = agreementFile('request-a', { mutate: value => { value.files = [{ owner: spelling }]; } });
      expect(() => runExport(agreement), `spelling ${spelling}`).toThrowError(AgreementInvalid);
    }
  });

  it('still exports request A bytes when a non-excluded entrypoint is spelled under a case alias', () => {
    // Alias spellings are not rejected wholesale and cannot smuggle excluded bytes: the
    // real loader.ts/strict-json.ts ship, the share stays 3/15, and nothing private leaks.
    const agreement = agreementFile('request-a', { mutate: value => { value.files = [{ owner: 'SRC/POLICY/LOADER.TS' }, { owner: 'src/policy/strict-json.ts' }]; } });
    const result = runExport(agreement);
    expect(result.files.some(file => file.toLowerCase().endsWith('policy/loader.ts'))).toBe(true);
    expect(result.disclosure.shippedOwnerFiles).toBe(3);
    expect(result.disclosure.inventoryFiles).toBe(15);
    expect(privateByteLeaks(result.outDir)).toEqual([]);
  });
});
