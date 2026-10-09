// box trace: run a test command and record every repository function it ran.
//
// Language-neutral core: a command, an output folder, and a language helper.
// The Python helper is `python/sitecustomize.py`, imported here as source and
// materialized on PYTHONPATH for the run — every Python process the command
// starts (children inherit the environment) writes one JSON record of the
// calls it saw under the repository root, and this module merges them into
// `trace.json`. The command's stdin/stdout/stderr pass straight through and
// its exit code is returned, never swallowed.
//
// Identity rule (from the lab's corrected instrument): a function is its
// file plus the line its definition starts on, resolved in the hook by AST —
// never by name, which once credited a property setter for its getter.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, relative, sep } from 'node:path';
import { ProgramLaunchUnsupported, ProgramUnavailable, resolveProgram } from '../box-package/index.js';
import hookSource from './python/sitecustomize.py?raw';

export const TRACE_FILE = 'trace.json';
export const TRACE_SCHEMA_VERSION = 1;
// box trace's own refusals exit 2 with a `box trace:` reason; the command's
// exit code is what a successful trace hands back.
export const REFUSAL_EXIT = 2;

export type RefusalReason = 'program-not-found' | 'command-file-unsupported' | 'output-unwritable' | 'no-python-process' | 'trace-unreadable';

export class TraceRefused extends Error {
  constructor(readonly reason: RefusalReason, message: string) {
    super(message);
    this.name = 'TraceRefused';
  }
}

export interface TraceOptions {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly outDir: string;
  // Where the command's output goes, chunk by chunk as it arrives. The CLI
  // leaves this unset so child stdout/stderr forward to our own streams live.
  readonly onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
}

export interface TraceResult {
  readonly exitCode: number | null;
  readonly seconds: number;
  readonly tracePath: string;
  readonly processes: number;
  readonly functions: number;
  readonly files: number;
}

interface ProcessRecord {
  readonly pid: number;
  readonly ppid: number;
  readonly started: number;
  readonly executable: string;
  readonly version: string;
  readonly functions: ReadonlyArray<{ file: string; start: number; end: number; label: string; kind: string; order: number }>;
  readonly files: readonly string[];
  readonly unseen: ReadonlyArray<{ file: string; reason: string }>;
}

const forward = (stream: 'stdout' | 'stderr', chunk: string): void => {
  (stream === 'stdout' ? process.stdout : process.stderr).write(chunk);
};

// The stated rule for marking a loaded file as a test: any path segment named
// `test` or `tests`, or a basename shaped like `test_*.py` / `*_test.py`.
function fileKind(relPath: string): 'test' | 'source' {
  const segments = relPath.split('/');
  const base = segments[segments.length - 1] ?? '';
  return segments.slice(0, -1).some(segment => segment === 'test' || segment === 'tests') || /^test_.*\.py$|_test\.py$/.test(base) ? 'test' : 'source';
}

function headCommit(cwd: string): string | null {
  // Read-only rev-parse; safe.directory=* is scoped to this one call so a
  // checkout owned by another account still reports its commit (same Git
  // invocation style as scripts/suite.mjs).
  const run = spawnSync('git', ['-c', 'safe.directory=*', '-C', cwd, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  const sha = run.status === 0 ? (run.stdout ?? '').trim() : '';
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
}

export async function trace(options: TraceOptions): Promise<TraceResult> {
  const [program, ...args] = options.argv;
  if (program === undefined || program === '') throw new TraceRefused('program-not-found', 'no command was given after --');
  const cwd = realpathSync(options.cwd);
  let resolved;
  try {
    resolved = resolveProgram(program);
  } catch (error) {
    if (error instanceof ProgramUnavailable) throw new TraceRefused('program-not-found', `program '${program}' was not found on PATH or as a path`);
    if (error instanceof ProgramLaunchUnsupported) throw new TraceRefused('command-file-unsupported', error.message);
    throw error;
  }
  if (resolved.kind === 'command-file') {
    // The .cmd/.bat quoting rule lives in box-package's declared-command
    // launch, which captures output instead of streaming it. Rather than copy
    // it, this wave refuses command files with a named reason.
    throw new TraceRefused('command-file-unsupported', `'${program}' resolves to ${resolved.path}, a Windows command file; invoke the program it wraps (e.g. python.exe) directly`);
  }
  try {
    mkdirSync(options.outDir, { recursive: true });
    const probe = join(options.outDir, `.box-trace-probe-${process.pid}`);
    writeFileSync(probe, '');
    rmSync(probe);
  } catch (error) {
    throw new TraceRefused('output-unwritable', `--out directory '${options.outDir}' cannot be written: ${error instanceof Error ? error.message : String(error)}`);
  }

  const work = mkdtempSync(join(tmpdir(), 'box-trace-'));
  try {
    const hookDir = join(work, 'hook');
    const recordsDir = join(work, 'procs');
    mkdirSync(hookDir, { recursive: true });
    mkdirSync(recordsDir, { recursive: true });
    writeFileSync(join(hookDir, 'sitecustomize.py'), hookSource);
    const env = {
      ...process.env,
      PYTHONPATH: process.env.PYTHONPATH ? hookDir + delimiter + process.env.PYTHONPATH : hookDir,
      BOX_TRACE_ROOT: cwd,
      BOX_TRACE_DIR: recordsDir
    };
    const onOutput = options.onOutput ?? forward;
    const began = Date.now();
    const exitCode = await new Promise<number | null>((resolveExit) => {
      const child = spawn(resolved.path, [...args], { cwd, env, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true });
      child.stdout?.on('data', (chunk: Buffer) => onOutput('stdout', chunk.toString('utf8')));
      child.stderr?.on('data', (chunk: Buffer) => onOutput('stderr', chunk.toString('utf8')));
      child.on('error', () => resolveExit(null));
      child.on('exit', code => resolveExit(code));
    });
    const seconds = (Date.now() - began) / 1000;

    const records: ProcessRecord[] = [];
    const warnings: string[] = [];
    for (const name of readdirSync(recordsDir).sort()) {
      const path = join(recordsDir, name);
      let record: ProcessRecord;
      try {
        record = JSON.parse(readFileSync(path, 'utf8')) as ProcessRecord;
      } catch {
        warnings.push(`unreadable process record '${name}' was skipped`);
        continue;
      }
      if ('error' in record) { warnings.push(`a traced process reported a hook error: ${(record as unknown as { error: string }).error}`); continue; }
      records.push(record);
    }
    if (records.length === 0) {
      throw new TraceRefused('no-python-process', `the command ran (exit ${exitCode ?? 'unknown'}) but no Python process reported a trace — the command may not start Python, or it was started with -S, -I or -E which disable the startup hook`);
    }

    const rel = (file: string): string | null => {
      const offset = relative(cwd, file);
      return offset === '' || offset.startsWith('..') || isAbsolute(offset) ? null : offset.split(sep).join('/');
    };
    records.sort((a, b) => a.started - b.started || a.pid - b.pid);
    const functions: Array<{ path: string; start: number; end: number; label: string; kind: string; order: number; pid: number }> = [];
    const seen = new Set<string>();
    for (const record of records) {
      for (const fn of record.functions ?? []) {
        const path = rel(fn.file);
        if (path === null) continue;
        const key = `${path}:${fn.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        functions.push({ path, start: fn.start, end: fn.end, label: fn.label, kind: fn.kind, order: functions.length + 1, pid: record.pid });
      }
    }
    const files = new Map<string, 'test' | 'source'>();
    for (const record of records) {
      for (const file of [...(record.files ?? []), ...(record.functions ?? []).map(fn => fn.file)]) {
        const path = rel(file);
        if (path !== null && !files.has(path)) files.set(path, fileKind(path));
      }
    }
    const interpreters = [...new Map(records.map(record => [`${record.executable} ${record.version}`, { executable: record.executable, version: record.version }])).values()];
    const unseen = new Set<string>();
    for (const record of records) for (const item of record.unseen ?? []) {
      const path = rel(item.file);
      unseen.add(path === null ? `${item.file}: ${item.reason}` : `${path}: ${item.reason}`);
    }

    const document = {
      schemaVersion: TRACE_SCHEMA_VERSION,
      command: { argv: [resolved.path, ...args], display: options.argv.join(' '), cwd, exitCode },
      seconds: Math.round(seconds * 1000) / 1000,
      repository: { root: cwd, commit: headCommit(cwd) },
      interpreters,
      processes: records.length,
      pids: records.map(record => record.pid),
      files: [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, kind]) => ({ path, kind })),
      functions,
      unseen: [...unseen].sort(),
      warnings
    };
    const tracePath = join(options.outDir, TRACE_FILE);
    writeFileSync(tracePath, JSON.stringify(document, null, 2) + '\n');
    return { exitCode, seconds, tracePath, processes: records.length, functions: functions.length, files: files.size };
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}
