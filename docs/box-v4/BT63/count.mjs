// Counts the old-name patterns by area, as lines. Usage: node bt63-count.mjs [list]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const AREAS = {
  'tool source': ['packages/box-bounty', 'packages/box-cli/src', 'packages/box-cli/pack.mjs'],
  tests: ['tests'],
  site: ['packages/box-platform/app', 'packages/box-platform/components', 'packages/box-platform/src', 'packages/box-platform/standin'],
  documents: ['FIRST-FIVE-MINUTES.md', 'README.md', 'AGENTS.md', 'docs/box-v4/BOUNTY.md', 'docs/box-v4/CONTRACTS.md', 'kitchen/demo']
};
const PATTERNS = {
  'box bounty': /(?<![\w\[-])box bounty(?![\w-])/,
  'box bounty (incl. title prefix)': /box bounty/,
  'box setup': /(?<![\w-])box setup/,
  'box.cmd': /(?<![\w-])box\.cmd/,
  'box --version': /(?<![\w-])box --version/,
  'box --help': /(?<![\w-])box --help/
};
const SKIP = /node_modules|[\\/]\.next[\\/]|[\\/]out[\\/]|[\\/]dist[\\/]|bt63\.test\.ts$/;
function* files(path) {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined || SKIP.test(path)) return;
  if (stat.isFile()) { if (/\.(ts|tsx|js|jsx|mjs|cjs|md|txt)$/.test(path)) yield path; return; }
  for (const name of readdirSync(path)) yield* files(join(path, name));
}
const list = process.argv[2] === 'list';
const rows = {};
for (const [area, paths] of Object.entries(AREAS)) {
  for (const path of paths) for (const file of files(path)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      for (const [name, pattern] of Object.entries(PATTERNS)) {
        if (!pattern.test(line)) continue;
        rows[name] ??= {};
        rows[name][area] = (rows[name][area] ?? 0) + 1;
        if (list && name !== 'box bounty (incl. title prefix)') console.log(`${name} | ${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
}
console.log('pattern | ' + Object.keys(AREAS).join(' | '));
for (const name of Object.keys(PATTERNS)) console.log(`${name} | ` + Object.keys(AREAS).map(area => rows[name]?.[area] ?? 0).join(' | '));
