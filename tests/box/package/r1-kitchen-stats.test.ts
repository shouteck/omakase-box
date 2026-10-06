// R1 preparation proof: the committed R1 agreement exports a working Box of the
// real .mjs kitchen-stats closure — no engine widening — and its generated
// evaluator is the delegated contract: green on the integrated script, failing
// on a variant that still prints Usage and on a blanked editable.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveSelection, generate, ownerCheck, parseAgreement } from '../../../packages/box-package/index.js';
import { fixtureCommit, fixtureGit, PNPM_CJS, requirePnpmTooling, ROOT, runExport, runRoot } from './support.js';

requirePnpmTooling();

const HEAVY = 600_000;
const AGREEMENT = join(ROOT, 'research', 'box-delegation', 'r1', 'agreement.json');
const EVALUATOR_FILE = 'evaluator/kitchen-stats-no-usage.test.ts';
const EDITABLE_BOX = 'src/scripts/kitchen-stats.mjs';

// The smallest owner repo that can carry this Box: the real scripts plus a
// committable tree, at sourceRoot '.', exactly like the real checkout.
function miniOwnerRepo(): { repo: string; baseCommit: string } {
  const repo = join(runRoot('r1-repo'), 'owner-repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  cpSync(join(ROOT, 'scripts', 'kitchen-stats.mjs'), join(repo, 'scripts', 'kitchen-stats.mjs'));
  cpSync(join(ROOT, 'scripts', 'process.mjs'), join(repo, 'scripts', 'process.mjs'));
  fixtureGit(repo, ['init', '-b', 'main']);
  return { repo, baseCommit: fixtureCommit(repo, 'r1-mini-owner') };
}

function r1Agreement(repo: string, baseCommit: string): string {
  const agreement = JSON.parse(readFileSync(AGREEMENT, 'utf8')) as Record<string, unknown>;
  agreement.baseCommit = baseCommit;
  const path = join(runRoot('r1-agreement'), 'agreement.json');
  writeFileSync(path, JSON.stringify(agreement, null, 2));
  return path;
}

describe('R1 kitchen-stats-no-usage box', () => {
  it('selects the .mjs closure with the existing engine — no gaps, both scripts', () => {
    const { repo } = miniOwnerRepo();
    const agreement = parseAgreement(JSON.parse(readFileSync(AGREEMENT, 'utf8')));
    const selection = deriveSelection(agreement, repo);
    expect(selection.gaps).toEqual([]);
    expect(selection.files.map(file => `${file.owner}->${file.box}:${file.origin}`)).toEqual([
      'scripts/kitchen-stats.mjs->src/scripts/kitchen-stats.mjs:editable',
      'scripts/process.mjs->src/scripts/process.mjs:runnable'
    ]);
  });

  it('generates the evaluator and registers the owner check for the generator id', () => {
    expect(generate('kitchen-stats-no-usage')).toContain('kitchen-stats.mjs');
    const check = ownerCheck('kitchen-stats-no-usage', '.');
    expect(check?.file).toBe('tests/box-owner-checks/kitchen-stats-no-usage.test.ts');
    expect(check?.source).toContain('kitchen-stats.mjs');
  });

  it('exports the real Box; its evaluator passes the integrated script and fails Usage-printing and blank variants', { timeout: HEAVY }, () => {
    const { repo, baseCommit } = miniOwnerRepo();
    const exported = runExport(r1Agreement(repo, baseCommit), repo);
    expect(exported.files).toContain(EDITABLE_BOX);
    expect(exported.files).toContain('src/scripts/process.mjs');
    expect(exported.files).toContain(EVALUATOR_FILE);
    // The mini owner repo contains only the closure, so share is 1 here; the
    // real-repo disclosure is recorded by the driver run in notes.md.
    expect(exported.disclosure.shippedOwnerFiles).toBe(2);

    // One install in the clean directory, then the variants reuse it.
    const dest = join(runRoot('r1-clean'), 'box');
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(exported.outDir)) cpSync(join(exported.outDir, entry), join(dest, entry), { recursive: true });
    const pnpm = (args: string[]) => spawnSync(process.execPath, [PNPM_CJS, ...args], { cwd: dest, encoding: 'utf8', timeout: HEAVY });
    expect(pnpm(['install', '--frozen-lockfile']).status).toBe(0);
    expect(pnpm(['exec', 'tsc', '--noEmit']).status).toBe(0);

    const integrated = pnpm(['exec', 'vitest', 'run', EVALUATOR_FILE]);
    expect(integrated.status, `${integrated.stdout}${integrated.stderr}`).toBe(0);

    // A variant that still prints the obsolete section must fail — the phase-1
    // reproduction ran this exact negative against the pre-change script.
    const original = readFileSync(join(dest, EDITABLE_BOX), 'utf8');
    writeFileSync(join(dest, EDITABLE_BOX), original + "\nconsole.log('Usage per wave (obsolete section)');\n");
    const regressed = pnpm(['exec', 'vitest', 'run', EVALUATOR_FILE]);
    expect(regressed.status).not.toBe(0);
    expect(`${regressed.stdout}${regressed.stderr}`).toMatch(/usage/i);

    writeFileSync(join(dest, EDITABLE_BOX), '');
    const blanked = pnpm(['exec', 'vitest', 'run', EVALUATOR_FILE]);
    expect(blanked.status).not.toBe(0);
  });
});
