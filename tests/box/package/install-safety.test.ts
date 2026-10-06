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

describe('install boundary: declared pnpm checks', () => {
  it('forces --ignore-scripts onto a declared install and proves it in the recorded argv', () => {
    const dir = runRoot('decl-install');
    const record = runDeclaredCheck(check({ tool: 'pnpm', args: ['install', '--frozen-lockfile'] }), dir, fakePnpm(dir));
    expect(record.result).toBe('pass');
    expect(record.argv).toContain('--ignore-scripts');
    expect(calls(dir).at(-1)?.argv).toContain('--ignore-scripts');
    expect(sentinel(dir)).toBe(false);
  });

  it('leaves a declared install already carrying --ignore-scripts untouched', () => {
    const dir = runRoot('decl-ok');
    const record = runDeclaredCheck(check({ tool: 'pnpm', args: ['install', '--frozen-lockfile', '--ignore-scripts'] }), dir, fakePnpm(dir));
    expect(record.result).toBe('pass');
    expect(record.argv.filter(arg => arg === '--ignore-scripts')).toHaveLength(1);
  });

  it('treats an install verb hidden behind flags as install-like', () => {
    const dir = runRoot('decl-dir-install');
    const record = runDeclaredCheck(check({ tool: 'pnpm', args: ['--dir', '.', 'install'] }), dir, fakePnpm(dir));
    expect(record.result).toBe('pass');
    expect(record.argv).toContain('--ignore-scripts');
    expect(sentinel(dir)).toBe(false);
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

  it('forces --ignore-scripts onto every install-like verb, including aliases and dedupe', () => {
    for (const verb of ['dedupe', 'it', 'install-test', 'ln', 'link', 'prune', 'deploy', 'rb', 'rebuild', 'add', 'dlx']) {
      const dir = runRoot(`decl-verb-${verb}`);
      const record = runDeclaredCheck(check({ tool: 'pnpm', args: ['--dir', '.', verb] }), dir, fakePnpm(dir));
      expect(record.result, verb).toBe('pass');
      expect(record.argv, verb).toContain('--ignore-scripts');
      expect(calls(dir).at(-1)?.argv, verb).toContain('--ignore-scripts');
      expect(sentinel(dir), verb).toBe(false);
    }
  });

  it('refuses an install-like verb hidden behind a valued leading option', () => {
    const dir = runRoot('decl-hidden-dedupe');
    const record = runDeclaredCheck(check({ tool: 'pnpm', args: ['--dir', '/tmp/pkg', 'dedupe'] }), dir, fakePnpm(dir));
    expect(record.result).toBe('pass');
    expect(record.argv).toContain('--ignore-scripts');
    expect(sentinel(dir)).toBe(false);
  });

  it('refuses unknown pnpm verbs before spawn instead of passing them through', () => {
    for (const args of [['totally-new-verb'], ['shiny-installer'], ['--future-opt', 'x', 'install'], ['--reporter', 'json', 'mystery']]) {
      const dir = runRoot('decl-unknown');
      const record = runDeclaredCheck(check({ tool: 'pnpm', args }), dir, fakePnpm(dir));
      expect(record.result, args.join(' ')).toBe('error');
      expect(record.exit, args.join(' ')).toBeNull();
      expect(record.log, args.join(' ')).toContain('refused');
      expect(calls(dir), args.join(' ')).toEqual([]);
      expect(sentinel(dir), args.join(' ')).toBe(false);
    }
  });

  it('does not touch non-install pnpm commands', () => {
    const dir = runRoot('decl-other');
    const record = runDeclaredCheck(check({ tool: 'pnpm', args: ['exec', 'tsc', '--noEmit'] }), dir, fakePnpm(dir));
    expect(record.result).toBe('pass');
    expect(record.argv).not.toContain('--ignore-scripts');
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
