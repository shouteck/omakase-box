// Frozen, offline real-CLI fixtures for the independent BT8b readers.
// Run after building a clean candidate. Cleanup accepts only this helper's
// own exact root with its ownership marker, never a wildcard.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
const marker = 'BT8b offline reader fixtures, owned by bt8b-fixtures.mjs\n';
const markerName = 'BT8b-owned.txt';
function cleanup(named) {
  const root = realpathSync(named);
  if (dirname(root) !== realpathSync(tmpdir()) || !root.split(/[\\/]/).at(-1)?.startsWith('box-BT8b-readers-') || readFileSync(join(root, markerName), 'utf8') !== marker) throw new Error('refusing cleanup of an unowned root');
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}
if (process.argv[2] === 'cleanup') {
  if (process.argv[3] === undefined) throw new Error('cleanup needs an exact owned root');
  cleanup(process.argv[3]);
} else {
  const env = { ...process.env };
  delete env.NO_COLOR;
  const git = (repo, args) => {
    const run = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/').replace(/\/+$/, '')}`, '-c', 'user.name=BT8b-fixture', '-c', 'user.email=BT8b@fixture.invalid', '-C', repo, ...args], { encoding: 'utf8', env });
    if (run.status !== 0) throw new Error(run.stderr);
    return run.stdout.trim();
  };
  if (git(checkout, ['status', '--porcelain']) !== '') throw new Error('fixtures require a clean committed candidate');
  const sha = git(checkout, ['rev-parse', 'HEAD']);
  const root = mkdtempSync(join(tmpdir(), 'box-BT8b-readers-'));
  writeFileSync(join(root, markerName), marker);
  const built = join(checkout, 'packages', 'box-cli', 'dist');
  if (!existsSync(join(built, 'cli.js'))) throw new Error('build the candidate first');
  cpSync(built, join(root, 'cli'), { recursive: true });
  const cli = join(root, 'cli', 'cli.js');
  // The built CLI is ESM; a disposable manifest preserves that outside the repo.
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
  const captures = [];
  function run(repo, settings, args) {
    const result = spawnSync(process.execPath, [cli, 'bounty', ...args], { cwd: repo, encoding: 'utf8', env: { ...env, BOX_BOUNTY_SETTINGS_DIR: settings }, timeout: 120000 });
    captures.push({ repo, args, exit: result.status, stdout: result.stdout, stderr: result.stderr });
    if (result.status !== 0) throw new Error(`${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  }
  function create(label, state, second = false) {
    const repo = join(root, label, 'repo'), settings = join(root, label, 'settings');
    mkdirSync(repo, { recursive: true });
    mkdirSync(settings, { recursive: true });
    writeFileSync(join(repo, 'confirmation.txt'), 'Thank you. Your reciept will arrive by email.\n');
    writeFileSync(join(repo, 'AGENTS.md'), 'Complete the requested file edit and verify it.\n');
    if (second) writeFileSync(join(repo, 'CLAUDE.md'), 'Complete the requested file edit and verify it.\n');
    writeFileSync(join(repo, 'TASK.md'), 'Independent fixture task\n\nA separate task is awaiting an outside opinion.\n');
    git(repo, ['init', '-b', 'main', '-q']);
    git(repo, ['config', 'core.autocrlf', 'false']);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'fixture base']);
    if (state !== 'none') run(repo, settings, ['config', 'set', 'instructions', 'true']);
    if (state === 'open') run(repo, settings, ['create', '--task', 'TASK.md', '--why', 'an outside opinion']);
    const instructions = readFileSync(join(repo, 'AGENTS.md'), 'utf8');
    const block = /<!-- box-bounty -->[\s\S]*?<!-- \/box-bounty -->/.exec(instructions)?.[0] ?? null;
    if (second && !readFileSync(join(repo, 'CLAUDE.md'), 'utf8').includes(block ?? 'absent')) throw new Error('the two maintained blocks differ');
    return { repo, settings, state, block, alternateFile: second ? join(repo, 'CLAUDE.md') : null };
  }
  try {
    const cases = {};
    for (const state of ['none', 'idle', 'open']) for (const n of [1, 2]) cases[`${state}-${n}`] = create(`${state}-${n}`, state);
    const startup = create('startup', 'open', true);
    // Capture the real cold overview from an independent fixture so readers
    // start with untouched settings and records in each measured condition.
    const capture = create('capture', 'open', true);
    run(capture.repo, capture.settings, []);
    run(capture.repo, capture.settings, ['describe', '--rules']);
    const registry = { kind: 'BT8b-offline-fixtures', root, sha, cli, task: 'Correct reciept to receipt, preserve the rest, verify, and report.', cases, startup };
    writeFileSync(join(root, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');
    writeFileSync(join(root, 'captures.json'), JSON.stringify(captures, null, 2) + '\n');
    console.log(JSON.stringify({ root, registry: join(root, 'registry.json'), captures: join(root, 'captures.json'), sha }));
  } catch (error) { cleanup(root); throw error; }
}
