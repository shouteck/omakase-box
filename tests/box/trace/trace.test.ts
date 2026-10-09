// Wave C1: `box trace` records what a failing test ran. The c1-py-trace
// fixture's executed set is known by construction — the assertions compare
// the trace against exactly that set, no more and no less.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { trace, TraceRefused } from '../../../packages/box-trace/index.js';
import { CLI, FIXTURE, plainRun, readTrace, runCli, runRoot } from './support.js';

const silent = () => undefined;

// The fixture's whole executed-function set, known by construction:
// (path:start) -> label. The setter at cart.py's second `def total` and the
// never-called `unused_estimate` are deliberately absent.
const EXPECTED: Record<string, string> = {
  'shop/cart.py:1': 'priced',
  'shop/cart.py:5': 'priced.wrapper',
  'shop/cart.py:11': 'unit_price',
  'shop/cart.py:20': 'Cart',
  'shop/cart.py:21': 'Cart.__init__',
  'shop/cart.py:24': 'Cart.add',
  'shop/cart.py:25': 'Cart.add.line',
  'shop/cart.py:30': 'Cart.total',
  'tests/test_cart.py:11': 'CartTest',
  'tests/test_cart.py:12': 'CartTest.test_total',
  'worker.py:7': 'child_summary'
};

const EXPECTED_FILES: Record<string, string> = {
  'shop/__init__.py': 'source',
  'shop/cart.py': 'source',
  'tests/__init__.py': 'test',
  'tests/test_cart.py': 'test',
  'worker.py': 'source'
};

describe('box trace', () => {
  it('records exactly the functions the failing test ran, across processes', async () => {
    const outDir = join(runRoot('trace'), 'out');
    const result = await trace({ argv: ['python', '-m', 'unittest', 'tests.test_cart'], cwd: FIXTURE, outDir, onOutput: silent });
    expect(result.exitCode).toBe(1);
    expect(result.tracePath).toBe(join(outDir, 'trace.json'));
    const document = readTrace(outDir);

    expect(document.schemaVersion).toBe(1);
    expect(document.command.argv.slice(1)).toEqual(['-m', 'unittest', 'tests.test_cart']);
    expect(document.command.cwd).toBe(document.repository.root);
    expect(document.command.exitCode).toBe(1);
    expect(document.seconds).toBeGreaterThan(0);
    expect(document.seconds).toBeLessThan(30); // generous ceiling, not a measurement
    expect(document.repository.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(document.interpreters).toHaveLength(1);
    const pythonVersion = (spawnSync('python', ['--version'], { encoding: 'utf8' }).stdout ?? '').trim().replace('Python ', '');
    expect(document.interpreters[0]?.version).toBe(pythonVersion);
    expect(document.warnings).toEqual([]);
    expect(document.unseen).toEqual([]);

    // The child process's function is in the trace and the count is honest.
    expect(document.processes).toBe(2);
    expect(new Set(document.pids).size).toBe(2);
    expect(document.functions.find(fn => fn.label === 'child_summary')?.path).toBe('worker.py');

    // Exactly the known set: path + definition-start line -> label.
    const actual = Object.fromEntries(document.functions.map(fn => [`${fn.path}:${fn.start}`, fn.label]));
    expect(actual).toEqual(EXPECTED);
    for (const fn of document.functions) expect(fn.end).toBeGreaterThanOrEqual(fn.start);
    expect(document.functions.map(fn => fn.order).sort((a, b) => a - b)).toEqual(document.functions.map((_, i) => i + 1));

    // The property trap by name, not just by the set: the setter's own def
    // line is absent while the getter's is present.
    const cart = readFileSync(join(FIXTURE, 'shop', 'cart.py'), 'utf8').split('\n');
    const setterDecorated = cart.findIndex(line => line.includes('@total.setter'));
    const setterDef = cart.findIndex((line, index) => index > setterDecorated && line.includes('def total')) + 1;
    const getterDef = cart.findIndex((line, index) => index > cart.findIndex(l => l.includes('@property')) && line.includes('def total')) + 1;
    expect(setterDef).toBeGreaterThan(0);
    expect(document.functions.some(fn => fn.path === 'shop/cart.py' && fn.start === setterDef)).toBe(false);
    expect(document.functions.some(fn => fn.path === 'shop/cart.py' && fn.start === getterDef && fn.label === 'Cart.total')).toBe(true);
    // The class body is credited as a class, never silently as a function.
    expect(document.functions.find(fn => fn.label === 'Cart')?.kind).toBe('class');

    // Every loaded repository file is listed; tests are marked by the stated rule.
    expect(Object.fromEntries(document.files.map(file => [file.path, file.kind]))).toEqual(EXPECTED_FILES);
  });

  it('leaves a passing test alone: same exit code, output streamed', async () => {
    const outDir = join(runRoot('passing'), 'out');
    const chunks: string[] = [];
    const result = await trace({ argv: ['python', '-m', 'unittest', 'tests.test_smoke'], cwd: FIXTURE, outDir, onOutput: (_s, chunk) => chunks.push(chunk) });
    expect(result.exitCode).toBe(0);
    expect(chunks.join('')).toContain('OK');
    const document = readTrace(outDir);
    expect(document.command.exitCode).toBe(0);
    expect(document.functions.some(fn => fn.label === 'SmokeTest.test_passes')).toBe(true);
  });

  it('through the CLI: the failing test streams and its exit code comes through', async () => {
    const plain = plainRun(['-m', 'unittest', 'tests.test_cart']);
    expect(plain.status).toBe(1);
    const outDir = join(runRoot('cli'), 'out');
    const run = await runCli(['trace', '--out', outDir, '--', 'python', '-m', 'unittest', 'tests.test_cart']);
    expect(run.status).toBe(plain.status); // the traced run exits like the plain run
    expect(run.stderr).toContain('FAILED');  // unittest reports on its stderr, forwarded untouched
    expect(run.stdout).toContain('worker says 21');
    expect(run.stderr).toContain('box trace: 2 Python process(es)');
    const document = readTrace(outDir);
    expect(document.functions.some(fn => fn.label === 'child_summary')).toBe(true);
  });

  it('through the CLI: output arrives as it is produced, not after the run ends', async () => {
    const outDir = join(runRoot('stream'), 'out');
    const run = await runCli(['trace', '--out', outDir, '--', 'python', '-c',
      "import sys, time; print('early'); sys.stdout.flush(); time.sleep(1.5); print('late')"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('early');
    expect(run.stdout).toContain('late');
    expect(run.earlyAt).not.toBeNull();
    // If the wrapper buffered to the end, the first chunk would land at exit.
    expect(run.exitedAt - (run.earlyAt ?? run.exitedAt)).toBeGreaterThan(500);
    expect(readTrace(outDir).processes).toBe(1);
  });

  it('refuses clearly: program not found', async () => {
    await expect(trace({ argv: ['no-such-program-c1'], cwd: FIXTURE, outDir: join(runRoot('nf'), 'out'), onOutput: silent }))
      .rejects.toMatchObject({ name: 'TraceRefused', reason: 'program-not-found' });
    const run = await runCli(['trace', '--out', join(runRoot('nfcli'), 'out'), '--', 'no-such-program-c1']);
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/box trace: program 'no-such-program-c1' was not found/);
  });

  it('refuses clearly: the command starts no Python process', async () => {
    const outDir = join(runRoot('nopy'), 'out');
    await expect(trace({ argv: ['git', '--version'], cwd: FIXTURE, outDir, onOutput: silent }))
      .rejects.toMatchObject({ name: 'TraceRefused', reason: 'no-python-process' });
    expect(existsSync(join(outDir, 'trace.json'))).toBe(false);
  });

  it('refuses clearly: --out cannot be written', async () => {
    const blocker = join(runRoot('blocked'), 'a-file');
    writeFileSync(blocker, 'x');
    await expect(trace({ argv: ['python', '--version'], cwd: FIXTURE, outDir: join(blocker, 'under'), onOutput: silent }))
      .rejects.toMatchObject({ name: 'TraceRefused', reason: 'output-unwritable' });
  });

  it('refuses clearly: no command after --', async () => {
    const run = await runCli(['trace', '--out', join(runRoot('usage'), 'out')]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('box trace --out <dir>');
  });
});
