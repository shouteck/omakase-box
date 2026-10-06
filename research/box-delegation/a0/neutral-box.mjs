// THROWAWAY (wave A0 prototype). The neutral loop: files, commands, exit codes, a patch.
// Nothing in this file names a language, a package manager or a test runner.
// The only external program it calls on its own account is `git apply`, to apply the patch.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function run(box, command) {
  const started = Date.now();
  const result = spawnSync(command.program, command.args, {
    cwd: join(box, command.cwd ?? '.'), shell: false, encoding: 'utf8', timeout: 120_000, windowsHide: true
  });
  return {
    name: command.name, role: command.role, program: command.program, args: command.args, cwd: command.cwd ?? '.',
    exit: result.status, // from the process; null when it never ran or was killed
    spawnError: result.error ? `${result.error.code}: ${result.error.message}` : null,
    ms: Date.now() - started,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  };
}

const green = records => records.length > 0 && records.every(record => record.exit === 0);
// Red means the program ran and said no. A command that never started is not a red check.
const red = records => records.length > 0 && records.every(record => Number.isInteger(record.exit) && record.exit !== 0);

// declaration: { name, sourceRoot, files[], setup[{program,args,cwd}], checks[{name,role,program,args,cwd}] }
// patch: path to a unified diff, or null for a do-nothing submission.
export function neutralLoop(declaration, patch) {
  const box = join(tmpdir(), `kitchen-A0-${declaration.name}-${patch ? 'edit' : 'nothing'}`);
  rmSync(box, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  mkdirSync(box);
  try {
    let bytes = 0;
    for (const file of declaration.files) {
      const from = join(declaration.sourceRoot, file);
      bytes += statSync(from).size;
      mkdirSync(dirname(join(box, file)), { recursive: true });
      cpSync(from, join(box, file));
    }
    const setup = declaration.setup.map(command => run(box, { ...command, role: 'setup' }));
    const base = declaration.checks.map(check => run(box, check));
    const applied = patch ? run(box, { name: 'apply-patch', role: 'apply', program: 'git', args: ['apply', '--whitespace=nowarn', resolve(patch)] }) : null;
    const after = declaration.checks.map(check => run(box, check));

    const guards = records => records.filter(record => record.role === 'guard');
    const outcomes = records => records.filter(record => record.role === 'outcome');
    const setupOk = setup.every(record => record.exit === 0);
    const baseValid = setupOk && green(guards(base)) && red(outcomes(base));
    const done = (applied === null || applied.exit === 0) && green(guards(after)) && green(outcomes(after));
    return {
      name: declaration.name, candidate: patch ? 'edit' : 'nothing', files: declaration.files.length, bytes,
      setup, base, applied, after, setupOk, baseValid,
      verdict: !baseValid ? 'invalid-base' : done ? 'done' : 'not-done'
    };
  } finally {
    rmSync(box, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const declaration = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(neutralLoop(declaration, process.argv[3] ?? null), null, 2));
}
