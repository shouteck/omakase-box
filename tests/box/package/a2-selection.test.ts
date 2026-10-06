import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BoxManifestSchema, ExportFailed, PreparationGap, parseAgreement, proposeSelection } from '../../../packages/box-package/index.js';
import { agreementFile, fixtureCommit, fixtureGit, fixtureRepo, privateByteLeaks, runExport, runRoot } from './support.js';

function neutralRepo(): { repo: string; baseCommit: string } {
  const repo = join(runRoot('a2-repo'), 'owner-repo');
  const write = (rel: string, content: string) => {
    const path = join(repo, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  write('src/feature.mjs', "export const feature = input => 'WRONG:' + input;\n");
  write('src/outcome.mjs', [
    "import { readFileSync } from 'node:fs';",
    "const pad = 'Z'.repeat(6000);",
    "let mod;",
    "try { mod = await import('./feature.mjs'); }",
    "catch (error) { console.log('LOAD-FAILED ' + error.message + '\\n' + pad); process.exit(7); }",
    "const out = mod.feature(readFileSync('data/input.txt', 'utf8').trim());",
    "if (out !== 'seed') { console.log('DEFECT feature=' + JSON.stringify(out) + '\\n' + pad); process.exit(7); }",
    "console.log('outcome-met');"
  ].join('\n') + '\n');
  write('src/streams.mjs', [
    "import { existsSync } from 'node:fs';",
    "const tag = 'SIGNAL\\n' + 'Z'.repeat(6000);",
    "if (existsSync('config/stream-flag.txt')) process.stdout.write(tag);",
    "else process.stderr.write(tag);",
    "process.exit(7);"
  ].join('\n') + '\n');
  write('config/stream-flag.txt', 'on\n');
  write('src/check.mjs', [
    "import { existsSync } from 'node:fs';",
    "const missing = ['data/input.txt', 'config/flag.txt'].filter(path => !existsSync(path));",
    "if (missing.length) { console.log('MISSING ' + missing.join(',')); process.exit(2); }",
    "console.log('layout-ok');"
  ].join('\n') + '\n');
  write('data/input.txt', 'seed\n');
  write('config/flag.txt', 'off\n');
  write('package.json', '{"name":"neutral-owner","private":true,"type":"module"}\n');
  write('deps/locks.txt', 'dep-a==1.0.0\ndep-b==2.0.0\n');
  fixtureGit(repo, ['init', '-b', 'main']);
  return { repo, baseCommit: fixtureCommit(repo, 'a2-neutral-base') };
}

function neutralAgreement(baseCommit: string, over: Record<string, unknown> = {}): string {
  const agreement = {
    schemaVersion: 1,
    box: { id: 'a2-neutral', name: 'extension-neutral fixture', version: 1 },
    outcome: 'feature must echo the seed input',
    baseCommit,
    sourceRoot: '.',
    files: [
      { owner: 'src/feature.mjs' },
      { owner: 'src/outcome.mjs' },
      { owner: 'src/check.mjs' },
      { owner: 'data/input.txt' },
      { owner: 'package.json' },
      { owner: 'deps/locks.txt' }
    ],
    editable: [{ kind: 'copy', owner: 'config/flag.txt', box: 'config/flag.txt' }],
    readContext: [],
    declaredDependencies: {},
    excludedPrefixes: ['node_modules/', 'dist/', '.git/', 'private/'],
    checks: ['feature echoes seed input'],
    requires: [{ program: 'node' }],
    setup: [],
    evaluator: [],
    commands: [
      { name: 'layout-guard', program: 'node', args: ['src/check.mjs'], cwd: '.', context: 'recipient', role: 'guard', timeoutMs: 30000 },
      { name: 'feature-outcome', program: 'node', args: ['src/outcome.mjs'], cwd: '.', context: 'recipient', role: 'outcome', timeoutMs: 30000 }
    ],
    submission: { format: 'editable-overlay', instructions: 'edit config/flag.txt only' },
    ...over
  };
  const path = join(runRoot('a2-agreement'), 'agreement.json');
  writeFileSync(path, JSON.stringify(agreement, null, 2));
  return path;
}

function manifestOf(outDir: string) {
  return BoxManifestSchema.parse(JSON.parse(readFileSync(join(outDir, 'box.json'), 'utf8')));
}

describe('a2 explicit selection', () => {
  it('exports an extension-neutral project using only the declared files plus generated artifacts', () => {
    const { repo, baseCommit } = neutralRepo();
    const result = runExport(neutralAgreement(baseCommit), repo);
    for (const file of ['src/feature.mjs', 'src/outcome.mjs', 'src/check.mjs', 'data/input.txt', 'package.json', 'deps/locks.txt', 'config/flag.txt', 'box/submit.mjs', 'box.json']) {
      expect(result.files, file).toContain(file);
    }
    expect(result.files.filter(file => file === 'package.json')).toHaveLength(1);
    expect(readFileSync(join(result.outDir, 'package.json'))).toEqual(readFileSync(join(repo, 'package.json')));
    expect(readFileSync(join(result.outDir, 'deps/locks.txt'))).toEqual(readFileSync(join(repo, 'deps/locks.txt')));
    const manifest = manifestOf(result.outDir);
    const locks = manifest.files.find(file => file.owner === 'deps/locks.txt');
    expect(locks?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pairs base and box observations for declared recipient commands', () => {
    const { repo, baseCommit } = neutralRepo();
    const manifest = manifestOf(runExport(neutralAgreement(baseCommit), repo).outDir);
    expect(manifest.paired.map(pair => pair.name)).toEqual(['layout-guard', 'feature-outcome']);
    for (const pair of manifest.paired) {
      expect(pair.owner.exit).toEqual(pair.box.exit);
      expect(pair.owner.result).toEqual(pair.box.result);
    }
    expect(manifest.paired[1]?.box.result).toBe('fail');
    expect(manifest.paired[1]?.box.exit).toBe(7);
    for (const pair of manifest.paired) {
      expect(pair.owner.outputSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(pair.owner.outputSha256).toEqual(pair.box.outputSha256);
    }
    expect(manifest.baseChecks.filter(record => record.context === 'owner')).toEqual([]);
    expect(manifest.baseChecks.filter(record => record.context === 'recipient').map(record => record.name)).toEqual(['layout-guard', 'feature-outcome']);
  });

  it('refuses export when a guard passes in the base but fails on an omitted file', () => {
    const { repo, baseCommit } = neutralRepo();
    const outDir = join(runRoot('a2-guard'), 'out');
    const agreement = neutralAgreement(baseCommit, {
      files: [
        { owner: 'src/feature.mjs' },
        { owner: 'src/outcome.mjs' },
        { owner: 'src/check.mjs' },
        { owner: 'package.json' },
        { owner: 'deps/locks.txt' }
      ]
    });
    try {
      runExport(agreement, repo, outDir);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ExportFailed);
      expect((error as ExportFailed).message).toMatch(/layout-guard/);
    }
    expect(existsSync(outDir)).toBe(false);
    expect(fixtureGit(repo, ['status', '--porcelain']).trim()).toBe('');
  });

  it('refuses export when the box fails with the same exit for a different reason', () => {
    const { repo, baseCommit } = neutralRepo();
    const outDir = join(runRoot('a2-missing'), 'out');
    const agreement = neutralAgreement(baseCommit, {
      files: [
        { owner: 'src/outcome.mjs' },
        { owner: 'src/check.mjs' },
        { owner: 'data/input.txt' },
        { owner: 'package.json' },
        { owner: 'deps/locks.txt' }
      ]
    });
    try {
      runExport(agreement, repo, outDir);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ExportFailed);
      expect((error as ExportFailed).message).toMatch(/feature-outcome/);
      expect((error as ExportFailed).message).toMatch(/diagnostic|differ/);
    }
    expect(existsSync(outDir)).toBe(false);
    expect(fixtureGit(repo, ['status', '--porcelain']).trim()).toBe('');
  });

  it('refuses export when the box emits identical bytes on a different stream', () => {
    const { repo, baseCommit } = neutralRepo();
    const outDir = join(runRoot('a2-stream'), 'out');
    const agreement = neutralAgreement(baseCommit, {
      files: [{ owner: 'src/streams.mjs' }],
      commands: [
        { name: 'stream-check', program: 'node', args: ['src/streams.mjs'], cwd: '.', context: 'recipient', role: 'outcome', timeoutMs: 30000 }
      ]
    });
    try {
      runExport(agreement, repo, outDir);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ExportFailed);
      expect((error as ExportFailed).message).toMatch(/stream-check/);
      expect((error as ExportFailed).message).toMatch(/differently/);
    }
    expect(existsSync(outDir)).toBe(false);
    expect(fixtureGit(repo, ['status', '--porcelain']).trim()).toBe('');
  });

  it('accepts true matching long output and records the comparison digest', () => {
    const { repo, baseCommit } = neutralRepo();
    const manifest = manifestOf(runExport(neutralAgreement(baseCommit), repo).outDir);
    const outcome = manifest.paired.find(pair => pair.name === 'feature-outcome');
    expect(outcome?.owner.log.length).toBeGreaterThan(3000);
    expect(outcome?.owner.outputSha256).toBe(outcome?.box.outputSha256);
  });

  it('recovers identical paired results once the omitted file is restored', () => {
    const { repo, baseCommit } = neutralRepo();
    const first = manifestOf(runExport(neutralAgreement(baseCommit), repo).outDir);
    const second = manifestOf(runExport(neutralAgreement(baseCommit), repo).outDir);
    const project = (paired: typeof first.paired) => paired.map(pair => ({
      name: pair.name,
      owner: { exit: pair.owner.exit, result: pair.owner.result, log: pair.owner.log },
      box: { exit: pair.box.exit, result: pair.box.result, log: pair.box.log }
    }));
    expect(project(second.paired)).toEqual(project(first.paired));
  });

  it('keeps a declared dependency manifest byte-identical instead of generating one', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => {
        (value.files as { owner: string }[]).push({ owner: 'package.json' });
      }
    });
    const result = runExport(agreement);
    const ownerManifest = readFileSync(join(fixtureRepo().repo, 'examples', 'private-shop', 'package.json'));
    expect(readFileSync(join(result.outDir, 'package.json'))).toEqual(ownerManifest);
    expect(result.files).toContain('pnpm-lock.yaml');
  });

  it('does not ship proposal-only entrypoint closures in the neutral path', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { value.entrypoints = ['src/server.ts']; }
    });
    const result = runExport(agreement);
    expect(result.files).not.toContain('src/server.ts');
    expect(result.files).not.toContain('src/selection/api.ts');
    expect(result.files).not.toContain('src/selection/text.ts');
    expect(privateByteLeaks(result.outDir)).toEqual([]);
  });

  it('still lets the proposal helper flag an excluded transitive import', () => {
    const path = agreementFile('request-a', {
      mutate: value => { value.entrypoints = ['src/server.ts']; }
    });
    const agreement = parseAgreement(JSON.parse(readFileSync(path, 'utf8')) as unknown);
    const proposal = proposeSelection(agreement, join(fixtureRepo().repo, 'examples', 'private-shop'));
    expect(proposal.gaps.some(gap => gap.kind === 'reachable-excluded')).toBe(true);
    expect(proposal.files.some(file => file.owner === 'src/selection/api.ts')).toBe(true);
  });

  it('names a preparation gap for duplicate box destinations', () => {
    const agreement = agreementFile('request-a', {
      mutate: value => { (value.files as unknown[]).push({ owner: 'src/policy/strict-json.ts', box: 'src/policy/loader.ts' }); }
    });
    try {
      runExport(agreement);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PreparationGap);
      expect((error as PreparationGap).message).toMatch(/same package path/);
    }
  });
});
