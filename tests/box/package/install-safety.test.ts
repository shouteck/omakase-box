import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BoxManifestSchema, ExportFailed, runDeclaredCheck } from '../../../packages/box-package/index.js';
import type { CommandCheck, PnpmInvocation } from '../../../packages/box-package/index.js';
import { agreementFile, fixtureRepo, ROOT, runExport, runRoot } from './support.js';

// R3 blocker correction: every product-controlled install must reach the
// package manager with --ignore-scripts, no matter what the caller or the
// agreement asks for. fake-pnpm.mjs is a harmless generic stand-in that logs
// its argv and drops a sentinel file exactly when an install-like call arrives
// without the flag — what an upstream lifecycle script would have produced.

const FAKE_PNPM = join(ROOT, 'tests', 'box', 'package', 'fake-pnpm.mjs');

function fakePnpm(dir: string, extra: string[] = []): PnpmInvocation {
  process.env.FAKE_PNPM_DIR = dir;
  return { command: process.execPath, args: [FAKE_PNPM, ...extra] };
}
interface Call { cwd: string; argv: string[] }
function calls(dir: string): Call[] {
  const path = join(dir, 'calls.jsonl');
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Call) : [];
}
const sentinel = (dir: string): boolean => existsSync(join(dir, 'lifecycle-ran.sentinel'));

const check = (over: Partial<CommandCheck>): CommandCheck => ({
  name: 'probe', program: 'node', args: ['-e', 'process.exit(0)'], cwd: '.',
  context: 'owner', role: 'guard', timeoutMs: 30_000, ...over
});

// Declared commands are arbitrary owner-approved programs: the runner carries
// their argv verbatim with no verb gate and no lifecycle flag injection. The
// --ignore-scripts boundary applies only to installs the product itself spawns.
describe('install boundary: declared commands are owner authority', () => {
  it('runs a declared install-like command verbatim, flags and all', () => {
    for (const args of [
      [FAKE_PNPM, '--version'],
      [FAKE_PNPM, 'exec', 'tsc', '--noEmit'],
      [FAKE_PNPM, 'install', '--frozen-lockfile'],
      [FAKE_PNPM, 'install', '--frozen-lockfile', '--ignore-scripts']
    ]) {
      const dir = runRoot('decl-verbatim');
      process.env.FAKE_PNPM_DIR = dir;
      const record = runDeclaredCheck(check({ name: 'declared', args: [...args] }), dir);
      expect(record.result, args.join(' ')).toBe('pass');
      expect(record.argv, args.join(' ')).toEqual(args);
      expect(calls(dir).map(call => call.argv), args.join(' ')).toEqual([args.slice(1)]);
    }
  });

  it('does not inject lifecycle flags into a declared install — owner authority, by design', () => {
    const dir = runRoot('decl-authority');
    process.env.FAKE_PNPM_DIR = dir;
    const record = runDeclaredCheck(check({ name: 'owner-install', args: [FAKE_PNPM, 'install'] }), dir);
    expect(record.result).toBe('pass');
    expect(calls(dir).map(call => call.argv)).toEqual([['install']]);
    // What a real lifecycle script would have run is the sentinel's job to mark:
    // it proves the declared command executed unmodified.
    expect(sentinel(dir)).toBe(true);
  });
});

describe('install boundary: export installs', () => {
  it('runs the product-owned lockfile resolution with --ignore-scripts while declared commands pass verbatim', () => {
    const dir = runRoot('export-installs');
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.setup = [
          { name: 'owner-install', program: 'node', args: [FAKE_PNPM, 'install', '--frozen-lockfile', '--ignore-scripts'], cwd: '.', context: 'owner', timeoutMs: 30_000 }
        ];
        value.commands = [
          check({ name: 'owner-guard', args: [FAKE_PNPM, '--version'] }),
          check({ name: 'box-guard', args: [FAKE_PNPM, '--version'], context: 'recipient' }),
          check({ name: 'box-outcome', args: ['-e', 'process.exit(1)'], context: 'recipient', role: 'outcome' })
        ];
      }
    });
    const exported = runExport(agreement, fixtureRepo().repo, undefined, fakePnpm(dir));
    const manifest = BoxManifestSchema.parse(JSON.parse(readFileSync(join(exported.outDir, 'box.json'), 'utf8')));
    const installCalls = calls(dir).filter(call => call.argv.includes('install'));
    // Product lockfile resolution plus the owner-declared setup install — and
    // every install-like call that ran did carry --ignore-scripts (the declared
    // one carried it verbatim, by the owner's own declaration).
    expect(installCalls.length).toBe(2);
    for (const call of installCalls) expect(call.argv, call.argv.join(' ')).toContain('--ignore-scripts');
    expect(calls(dir).some(call => call.argv.includes('--lockfile-only'))).toBe(true);
    expect(sentinel(dir)).toBe(false);
    expect(manifest.baseChecks.map(record => `${record.role}:${record.name}:${record.result}`)).toEqual([
      'setup:owner-install:pass', 'guard:owner-guard:pass', 'guard:box-guard:pass', 'outcome:box-outcome:fail'
    ]);
  });

  it('refuses the whole export when the caller invocation carries a lifecycle-enabling flag', () => {
    const dir = runRoot('export-hostile');
    const agreement = agreementFile('request-a', {
      mutate: value => { value.commands = [check({ name: 'owner-guard', args: [FAKE_PNPM, '--version'] })]; }
    });
    expect(() => runExport(agreement, fixtureRepo().repo, undefined, fakePnpm(dir, ['--config.ignore-scripts=false']))).toThrowError(ExportFailed);
    expect(calls(dir).some(call => call.argv.includes('install'))).toBe(false);
    expect(sentinel(dir)).toBe(false);
  });
});
