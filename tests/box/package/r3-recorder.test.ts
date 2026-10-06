import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './support.js';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain-JS research tool, no declaration file
import { runDeclaration, sealDeclaration } from '../../../research/box-delegation/r3/recorder/run-recorder.mjs';
import { runRoot } from './support.js';

const RECORDER = join(ROOT, 'research', 'box-delegation', 'r3', 'recorder', 'run-recorder.mjs');

// R3 correction: the reusable run recorder must prove exact exits, UTC bounds,
// sealed pre-run declarations and safe output handling. Fixtures are generic:
// node -e one-liners only, no third-party code.

const SEALED = (dir: string, commands: unknown[], runId = 'kitchen-r3-fix-test'): string => {
  const path = join(dir, 'declaration.json');
  writeFileSync(path, JSON.stringify({ runId, commands }));
  sealDeclaration(path);
  return path;
};
const NODE = (code: string, over: Record<string, unknown> = {}) => ({ name: `c${Math.abs(code.length) % 100}`, argv: [process.execPath, '-e', code], ...over });
const state = (out: string) => JSON.parse(readFileSync(join(out, 'run.json'), 'utf8'));

describe('r3 run recorder: sealed declaration boundary', () => {
  it('refuses to run without a seal, after edits, or with a mismatched identity', () => {
    const dir = runRoot('rec-decl');
    const path = join(dir, 'd.json');
    writeFileSync(path, JSON.stringify({ runId: 'kitchen-r3-fix-a', commands: [NODE('process.exit(0)')] }));
    expect(() => runDeclaration(path, join(dir, 'out1'))).toThrowError(/no seal/);
    expect(existsSync(join(dir, 'out1'))).toBe(false);

    sealDeclaration(path);
    writeFileSync(path, JSON.stringify({ runId: 'kitchen-r3-fix-a', commands: [NODE('process.exit(1)')] }));
    expect(() => runDeclaration(path, join(dir, 'out2'))).toThrowError(/changed after sealing/);
    expect(existsSync(join(dir, 'out2'))).toBe(false);

    writeFileSync(path, JSON.stringify({ runId: 'kitchen-r3-fix-b', commands: [NODE('process.exit(0)')] }));
    expect(() => runDeclaration(path, join(dir, 'out3'))).toThrowError();
    expect(existsSync(join(dir, 'out3'))).toBe(false);
  });

  it('refuses a populated or incomplete output dir and leaves its bytes untouched', () => {
    const dir = runRoot('rec-out');
    const path = SEALED(dir, [NODE('process.exit(0)')]);
    const populated = join(dir, 'populated');
    mkdirSync(populated, { recursive: true });
    writeFileSync(join(populated, 'keep.txt'), '');
    expect(() => runDeclaration(path, populated)).toThrowError(/not empty/);
    expect(readFileSync(join(populated, 'keep.txt'), 'utf8')).toBe('');
  });

  it('refuses to seal the same declaration twice', () => {
    const dir = runRoot('rec-reseal');
    const path = SEALED(dir, [NODE('process.exit(0)')]);
    expect(() => sealDeclaration(path)).toThrowError(/already exists/);
  });

  it('runs a sealed declaration exactly once — a second out dir is refused', () => {
    const dir = runRoot('rec-once');
    const path = SEALED(dir, [NODE('process.exit(0)')]);
    expect(runDeclaration(path, join(dir, 'run-a')).status).toBe('complete');
    expect(() => runDeclaration(path, join(dir, 'run-b'))).toThrowError(/already claimed/);
    expect(existsSync(join(dir, 'run-b'))).toBe(false);
  });

  it('refuses a symlink output dir', () => {
    const dir = runRoot('rec-symlink');
    const path = SEALED(dir, [NODE('process.exit(0)')]);
    symlinkSync(dir, join(dir, 'linked'), 'junction');
    expect(() => runDeclaration(path, join(dir, 'linked'))).toThrowError(/link/);
    // The failed attempt must not burn the single-use claim.
    expect(runDeclaration(path, join(dir, 'run')).status).toBe('complete');
  });

  it('CLI exits nonzero when any recorded command fails, even if a later one passes', () => {
    const dir = runRoot('rec-cli');
    const path = SEALED(dir, [
      { name: 'fails', argv: [process.execPath, '-e', 'process.exit(7)'] },
      { name: 'formats', argv: [process.execPath, '-e', 'process.exit(0)'] }
    ]);
    const run = spawnSync(process.execPath, [RECORDER, 'run', '--declaration', path, '--out', join(dir, 'run')], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('fails:fail:7');
  });
});

describe('r3 run recorder: execution records', () => {
  it('keeps exit 7 failed when a later command exits 0, with UTC bounds and verbatim argv', () => {
    const dir = runRoot('rec-run');
    const path = SEALED(dir, [
      { name: 'fails', argv: [process.execPath, '-e', 'process.exit(7)'] },
      { name: 'formats', argv: [process.execPath, '-e', 'console.log("ok")'] }
    ]);
    const out = join(dir, 'run');
    const result = runDeclaration(path, out);
    expect(result.status).toBe('complete');
    const records = result.records;
    expect(records[0].result).toBe('fail');
    expect(records[0].exit).toBe(7);
    expect(records[1].result).toBe('pass');
    expect(records[1].exit).toBe(0);
    expect(records[0].executable).toBe(process.execPath);
    expect(records[0].argv).toEqual(['-e', 'process.exit(7)']);
    expect(Number.isNaN(Date.parse(records[0].startedAt))).toBe(false);
    expect(Date.parse(records[0].startedAt)).toBeLessThanOrEqual(Date.parse(records[0].endedAt));
    expect(records[0].invocationId).toContain('fails');
    expect(state(out).records).toHaveLength(2);
  });

  it('records timeout and spawn failure, never as pass', () => {
    const dir = runRoot('rec-neg');
    const path = SEALED(dir, [
      { name: 'slow', argv: [process.execPath, '-e', 'setTimeout(() => {}, 30000)'], timeoutMs: 300 },
      { name: 'ghost', argv: [join(dir, 'definitely-not-a-real-binary-xyz')] }
    ]);
    const result = runDeclaration(path, join(dir, 'run'));
    expect(result.records[0].result).toBe('timeout');
    expect(result.records[0].exit).toBeNull();
    expect(result.records[1].result).toBe('error');
    expect(result.records[1].exit).toBeNull();
    expect(result.records[1].error).toBeTruthy();
    expect(result.records.every((record: { result: string }) => record.result !== 'pass')).toBe(true);
  });

  it('bounds captured output', () => {
    const dir = runRoot('rec-bound');
    const path = SEALED(dir, [{ name: 'loud', argv: [process.execPath, '-e', 'console.log("x".repeat(20000))'] }]);
    const result = runDeclaration(path, join(dir, 'run'));
    expect(result.records[0].result).toBe('pass');
    expect(result.records[0].stdout.length).toBeLessThanOrEqual(8192);
  });
});
