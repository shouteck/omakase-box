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
  name: 'probe', tool: 'node', args: ['-e', 'process.exit(0)'], cwd: '.',
  context: 'owner', role: 'guard', timeoutMs: 30_000, ...over
});

// Declared pnpm checks may only RUN things: the six run-verb spellings pass
// verbatim, every other verb is refused before anything is spawned.
const RUN_VERBS = ['exec', 'e', 'run', 'run-script', 'test', 't'];
const REFUSED_VERBS = [
  'install', 'i', 'add', 'dedupe', 'it', 'install-test', 'ln', 'link', 'prune', 'deploy', 'rb', 'rebuild',
  'publish', 'setup', 'self-update', 'config', 'store', 'dlx', 'create', 'update', 'up', 'remove', 'rm',
  'import', 'fetch', 'patch-commit', 'totally-new-verb', 'shiny-installer'
];

function expectRefused(args: string[]): void {
  const label = args.join(' ');
  const dir = runRoot('decl-refused');
  const record = runDeclaredCheck(check({ tool: 'pnpm', args }), dir, fakePnpm(dir));
  expect(record.result, label).toBe('error');
  expect(record.exit, label).toBeNull();
  expect(record.argv, label).toEqual([]);
  expect(record.log, label).toContain('refused');
  expect(calls(dir), label).toEqual([]);
  expect(sentinel(dir), label).toBe(false);
}

describe('install boundary: declared pnpm checks', () => {
  it('refuses every verb outside the six run spellings before spawn, bare or behind --dir', () => {
    for (const verb of REFUSED_VERBS) {
      expect(RUN_VERBS, verb).not.toContain(verb);
      expectRefused([verb]);
      expectRefused(['--dir', '/tmp/pkg', verb]);
    }
  });

  it('refuses a declared install even when it already carries --ignore-scripts', () => {
    expectRefused(['install', '--frozen-lockfile']);
    expectRefused(['install', '--frozen-lockfile', '--ignore-scripts']);
    expectRefused(['--dir', '.', 'install']);
  });

  it('passes each of the six run spellings through verbatim', () => {
    for (const verb of RUN_VERBS) {
      for (const args of [[verb, 'tsc', '--noEmit'], ['--dir', '.', verb, 'tsc', '--noEmit']]) {
        const dir = runRoot(`decl-run-${verb}`);
        const pnpm = fakePnpm(dir);
        const record = runDeclaredCheck(check({ tool: 'pnpm', args }), dir, pnpm);
        expect(record.result, args.join(' ')).toBe('pass');
        expect(record.argv, args.join(' ')).toEqual([...pnpm.args, ...args]);
        expect(calls(dir).map(call => call.argv), args.join(' ')).toEqual([args]);
      }
    }
  });

  it('refuses, without spawning, a declared install that re-enables lifecycle scripts', () => {
    const unsafe: string[][] = [
      ['install', '--no-ignore-scripts'],
      ['install', '--ignore-scripts=false'],
      ['install', '--ignore-scripts', 'false'],
      ['install', '--config.ignore-scripts=false'],
      ['install', '--config=ignore-scripts=false'],
      ['install', '--config', 'ignore-scripts=false'],
      ['install', '--config.dangerously-allow-all-builds=true'],
      // A lifecycle override hides in a non-install command too.
      ['exec', 'tsc', '--config.ignore-scripts=false'],
      ['--config=ignore-scripts=false', 'exec', 'vitest']
    ];
    for (const args of unsafe) {
      const dir = runRoot('decl-unsafe');
      const record = runDeclaredCheck(check({ tool: 'pnpm', args }), dir, fakePnpm(dir));
      expect(record.result, args.join(' ')).toBe('error');
      expect(record.exit, args.join(' ')).toBeNull();
      expect(record.log, args.join(' ')).toContain('refused');
      expect(calls(dir), args.join(' ')).toEqual([]);
      expect(sentinel(dir), args.join(' ')).toBe(false);
    }
  });

  it('refuses an unknown or ambiguous leading option that could hide the verb', () => {
    for (const args of [['--future-opt', 'x', 'install'], ['--future-opt', 'exec', 'tsc'], ['--reporter', 'json', 'mystery']]) expectRefused(args);
  });
});

describe('install boundary: export installs', () => {
  it('runs lockfile resolution and base/recipient installs with --ignore-scripts, sentinel never written', () => {
    const dir = runRoot('export-installs');
    const agreement = agreementFile('request-a', {
      mutate: value => {
        value.commands = [
          check({ name: 'owner-guard', tool: 'pnpm', args: ['--version'] }),
          check({ name: 'box-guard', tool: 'pnpm', args: ['--version'], context: 'recipient' }),
          check({ name: 'box-outcome', args: ['-e', 'process.exit(1)'], context: 'recipient', role: 'outcome' })
        ];
      }
    });
    const exported = runExport(agreement, fixtureRepo().repo, undefined, fakePnpm(dir));
    const manifest = BoxManifestSchema.parse(JSON.parse(readFileSync(join(exported.outDir, 'box.json'), 'utf8')));
    const installCalls = calls(dir).filter(call => call.argv.includes('install'));
    expect(installCalls.length).toBeGreaterThanOrEqual(3); // lockfile-only + owner base + staged box
    for (const call of installCalls) expect(call.argv, call.argv.join(' ')).toContain('--ignore-scripts');
    expect(calls(dir).some(call => call.argv.includes('--lockfile-only'))).toBe(true);
    expect(sentinel(dir)).toBe(false);
    expect(manifest.baseChecks.map(record => `${record.name}:${record.result}`)).toEqual(['owner-guard:pass', 'box-guard:pass', 'box-outcome:fail']);
  });

  it('refuses the whole export when the caller invocation carries a lifecycle-enabling flag', () => {
    const dir = runRoot('export-hostile');
    const agreement = agreementFile('request-a', {
      mutate: value => { value.commands = [check({ name: 'owner-guard', tool: 'pnpm', args: ['--version'] })]; }
    });
    expect(() => runExport(agreement, fixtureRepo().repo, undefined, fakePnpm(dir, ['--config.ignore-scripts=false']))).toThrowError(ExportFailed);
    expect(calls(dir).some(call => call.argv.includes('install'))).toBe(false);
    expect(sentinel(dir)).toBe(false);
  });
});
