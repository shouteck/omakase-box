import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, runNode } from './process.mjs';

const [suite, ...raw] = process.argv.slice(2);
const args = raw.filter(arg => arg !== '--');
const subgroupIndex = args.indexOf('--suite');
const subgroup = subgroupIndex >= 0 ? args[subgroupIndex + 1] : undefined;
if (subgroupIndex >= 0 && (!subgroup || !/^[a-z0-9-]+$/.test(subgroup))) process.exit(2);
const directory = join(root, 'tests', suite ?? '', subgroup ?? '');
function hasTests(path) {
  return existsSync(path) && readdirSync(path).some(name => {
    const item = join(path, name);
    return statSync(item).isDirectory() ? hasTests(item) : name.endsWith('.test.ts');
  });
}
if (!suite || !/^[a-z0-9-]+$/.test(suite) || args.includes('--real') || !hasTests(directory)) {
  console.log(JSON.stringify({ assurance: 'unverified', suite, subgroup, status: 'unavailable', reason: args.includes('--real') ? 'Real VM execution is not configured or implemented.' : 'This required suite has not been implemented.' }));
  process.exit(2);
}
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
process.exit(await runNode(vitest, ['run', directory, '--config', 'scripts/vitest.config.mjs'], { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(root, '.runtime', 'browsers') } }));
