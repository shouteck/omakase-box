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
// Environment-first verification profile may override the browser cache to the
// reviewed in-image /ms-playwright path. Only the exact named profile plus the
// exact '/ms-playwright' value activates the override; every other value, and the
// default (no profile), keep the original .runtime/browsers behavior and the
// unavailable-suite/--real semantics above.
const verificationProfile = process.env.BOX_VERIFICATION_PROFILE === 'w002-b11-environment-first-r4';
const browserOverride = verificationProfile && process.env.BOX_VERIFICATION_BROWSER_PATH === '/ms-playwright'
  ? '/ms-playwright'
  : null;
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
// Native ESM loading avoids Vite's bundled-config write into read-only dependencies.
// Installed Vitest forwards this supported option to Vite; default runs retain
// their original loader and argv.
const configLoader = verificationProfile ? ['--configLoader', 'native'] : [];
process.exit(await runNode(vitest, ['run', directory, '--config', 'scripts/vitest.config.mjs', ...configLoader], { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserOverride ?? join(root, '.runtime', 'browsers') } }));
