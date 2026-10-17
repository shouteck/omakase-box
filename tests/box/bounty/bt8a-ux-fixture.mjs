// Offline built-CLI fixtures for fresh relay and config readers. A separate
// registry and matching marker own every disposable directory before cleanup.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
const cli = join(checkout, 'packages/box-cli/dist/cli.js');
const normal = path => resolve(path).replaceAll('\\', '/').toLowerCase();
function git(root, args) {
  const run = spawnSync('git', ['-c', 'safe.directory=C:/Users/shout/Desktop/Projects/private-task-mvp', '-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-c', 'user.name=BT8a-fixture', '-c', 'user.email=BT8a@test.invalid', '-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  if (run.status !== 0) throw new Error('fixture Git failed: ' + run.stderr);
  return run.stdout;
}
function invoke(fixture, args) {
  const run = spawnSync(process.execPath, [cli, 'bounty', ...args], { cwd: fixture.repo, encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, BOX_BOUNTY_SETTINGS_DIR: fixture.settings } });
  if (run.status !== 0) throw new Error(`CLI exit ${run.status}: ${run.stderr}`);
  return run.stdout;
}
function create() {
  if (!existsSync(cli)) throw new Error('build the CLI first');
  const root = mkdtempSync(join(tmpdir(), 'kitchen-BT8a-ux-'));
  const registry = root + '.registry.json';
  const owner = randomUUID();
  const fixtures = {};
  const record = { kind: 'BT8a-owned-fixtures', owner, root, registry, fixtures };
  writeFileSync(join(root, '.BT8a-owned.json'), JSON.stringify({ owner, registry }));
  writeFileSync(registry, JSON.stringify(record));
  for (const name of ['relay', 'config-stop', 'config-shop']) {
    const repo = join(root, name, 'repo'), settings = join(root, name, 'settings');
    mkdirSync(repo, { recursive: true });
    mkdirSync(settings, { recursive: true });
    const fixture = { repo, settings };
    fixtures[name] = fixture;
    git(repo, ['init', '-b', 'main', '-q']);
    git(repo, ['config', 'core.autocrlf', 'false']);
    git(repo, ['remote', 'add', 'origin', 'https://github.com/owner/project.git']);
    writeFileSync(join(repo, 'app.txt'), 'repair needed\n');
    writeFileSync(join(repo, 'TASK.md'), 'repair app.txt\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'BT8a fixture']);
    if (name === 'relay') {
      const created = invoke(fixture, ['create', '--task', 'TASK.md', '--why', 'need another pair of eyes']);
      const id = /bt-[a-f\d]{12}/.exec(created)?.[0];
      if (id === undefined) throw new Error('create did not name its bounty');
      fixture.id = id;
      writeFileSync(join(root, 'relay-output.txt'), invoke(fixture, ['post', id, '--to', 'github']));
    } else {
      invoke(fixture, ['allow']);
      writeFileSync(join(root, name + '-output.txt'), invoke(fixture, ['config']));
    }
    writeFileSync(registry, JSON.stringify(record, null, 2));
  }
  console.log(JSON.stringify({ registry, root, relay: join(root, 'relay-output.txt'), configStop: join(root, 'config-stop-output.txt'), configShop: join(root, 'config-shop-output.txt'), temporarySettings: Object.fromEntries(Object.entries(fixtures).map(([name, value]) => [name, value.settings])) }, null, 2));
}
function owned(path) {
  const registry = resolve(path);
  if (normal(dirname(registry)) !== normal(tmpdir()) || !basename(registry).startsWith('kitchen-BT8a-ux-') || !registry.endsWith('.registry.json') || lstatSync(registry).isSymbolicLink()) throw new Error('not a BT8a registry in the system temp directory');
  const record = JSON.parse(readFileSync(registry, 'utf8'));
  if (record.kind !== 'BT8a-owned-fixtures' || record.registry !== registry || normal(dirname(record.root)) !== normal(tmpdir()) || record.root + '.registry.json' !== registry) throw new Error('registry ownership mismatch');
  if (lstatSync(record.root).isSymbolicLink() || normal(realpathSync(record.root)) !== normal(record.root)) throw new Error('owned directory was replaced by a link');
  const marker = JSON.parse(readFileSync(join(record.root, '.BT8a-owned.json'), 'utf8'));
  if (marker.owner !== record.owner || marker.registry !== registry) throw new Error('directory ownership marker mismatch');
  return record;
}
const [mode, registry, name, ...args] = process.argv.slice(2);
if (mode === 'create') create();
else if (mode === 'cleanup') {
  const record = owned(registry);
  rmSync(record.root, { recursive: true, force: true });
  rmSync(record.registry);
  console.log('Removed registered BT8a fixtures and registry.');
} else if (mode === 'run') {
  const record = owned(registry);
  if (!['config-stop', 'config-shop'].includes(name)) throw new Error('run is limited to the two bare-config reader fixtures');
  const fixture = record.fixtures[name];
  if (normal(fixture.repo) !== normal(join(record.root, name, 'repo')) || normal(fixture.settings) !== normal(join(record.root, name, 'settings'))) throw new Error('fixture ownership mismatch');
  if (!['allow', 'deny', 'config', 'status'].includes(args[0]) || args.includes('--repo')) throw new Error('only allow, deny, config or status in the registered fixture');
  // A standalone script cannot import support.ts — this mirrors its
  // RECORDS_DIR_REL ('.box' + '/' + 'bounties') and is the only spelling here.
  const RECORDS_DIR = '.box/' + 'bounties';
  const records = join(fixture.repo, RECORDS_DIR);
  if (existsSync(records) && readdirSync(records).some(file => file.endsWith('.json'))) throw new Error('config reader fixture unexpectedly has a bounty; refusing a possible publication');
  console.log(invoke(fixture, args));
} else throw new Error('use create, run <registry> <config-stop|config-shop> <command> [arguments], or cleanup <registry>');
