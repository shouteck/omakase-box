import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PreparationGap } from '../../../packages/box-package/index.js';
import { agreementFile, fixtureCommit, materializeFixtureRepo, privateByteLeaks, requirePnpmTooling, runExport } from './support.js';

requirePnpmTooling();

// D2.1 pass (reviewer) probes: excludedPrefix checks run on the declared/normalized logical
// path, never on the canonical real path. These two inputs bypass the exclusion and ship
// src/private/* bytes. Both must produce a PreparationGap, never a folder.
describe('exclusion bypass probes (added by the D2.1 pass)', () => {
  it('rejects a declared entrypoint that reaches an excluded file through a case alias', () => {
    // On a case-insensitive filesystem 'SRC/PRIVATE/SCORING.TS' resolves to
    // src/private/scoring.ts; on a case-sensitive one it is simply unresolved. Either way
    // the export must be a named gap, never a shipped file.
    const agreement = agreementFile('request-a', {
      mutate: value => { value.entrypoints = ['SRC/PRIVATE/SCORING.TS']; }
    });
    expect(() => runExport(agreement)).toThrowError(PreparationGap);
  });

  it('rejects an import that reaches an excluded directory through a link inside the source root', () => {
    const repo = materializeFixtureRepo();
    const src = join(repo.repo, 'examples', 'private-shop', 'src');
    symlinkSync(join(src, 'private'), join(src, 'policy', 'vault'), 'junction');
    writeFileSync(join(src, 'policy', 'trojan.ts'), "import { PRIVATE_SCORING_CANARY } from './vault/scoring.js';\nexport const leaked = PRIVATE_SCORING_CANARY;\n");
    const baseCommit = fixtureCommit(repo.repo, 'linked-private');
    const agreement = agreementFile('request-a', {
      baseCommit,
      mutate: value => { value.entrypoints = ['src/policy/trojan.ts']; }
    });
    let leaks: string[] | undefined;
    try {
      leaks = privateByteLeaks(runExport(agreement, repo.repo).outDir);
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      return;
    }
    expect(leaks, 'export of a link into src/private shipped protected bytes').toEqual([]);
    expect.unreachable('export should have failed as a preparation gap');
  });
});
