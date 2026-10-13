import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const [command, target] = process.argv.slice(2);
if (command === 'cleanup') {
  if (!target) throw new Error('name the exact fixture directory');
  const root = realpathSync(target);
  if (resolve(root) !== resolve(target) || !basename(root).startsWith('kitchen-BT10-reader-') || resolve(join(root, '..')) !== resolve(realpathSync(tmpdir())) || readFileSync(join(root, 'owned-by-BT10'), 'utf8') !== 'BT10 reader fixture\n') throw new Error('not an owned BT10 fixture');
  rmSync(root, { recursive: true });
} else if (command === 'create') {
  const page = readFileSync(new URL('../../../docs/box-v4/BOUNTY-FORMAT.md', import.meta.url), 'utf8');
  const sample = /<!-- box-bounty-format\n(\{[^\n]+\})\n-->/.exec(page);
  if (!sample) throw new Error('page example missing');
  const first = JSON.parse(sample[1]);
  const issues = [first, { ...first, id: 'bt-fedcba987654', branch: 'box-bounty/bt-fedcba987654', workCommit: 'fedcba9876543210fedcba9876543210fedcba98', withChanges: true }].map((value, index) => ({ number: index + 1, title: `Offline bounty ${index + 1}`, state: 'open', labels: [{ name: 'box-bounty' }], repository_url: 'https://api.github.com/repos/owner/project', html_url: `https://github.com/owner/project/issues/${index + 1}`, body: `# Offline task ${index + 1}\n\n<!-- box-bounty-format\n${JSON.stringify(value)}\n-->\n` }));
  const root = mkdtempSync(join(tmpdir(), 'kitchen-BT10-reader-'));
  writeFileSync(join(root, 'owned-by-BT10'), 'BT10 reader fixture\n');
  writeFileSync(join(root, 'BOUNTY-FORMAT.md'), page);
  writeFileSync(join(root, 'search.json'), JSON.stringify({ total_count: 2, incomplete_results: false, items: issues }, null, 2));
  writeFileSync(join(root, 'repository.txt'), 'owner/project\n');
  process.stdout.write(root + '\n');
} else throw new Error('use create or cleanup <exact directory>');
