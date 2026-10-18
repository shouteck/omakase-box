import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { root, runNode } from './process.mjs';
import { selectCheckSuites } from './suite.mjs';

const mode = process.argv[2];
if (!['check', 'build'].includes(mode)) process.exit(2);
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const code = await runNode(tsc, ['--noEmit']);
if (code !== 0) process.exit(code);
// K29: scripts/boundaries.mjs went with the older platform — it walked only
// the external-facing workspaces (external-api, contributor-portal,
// contracts/public) that no longer exist.
if (mode === 'check') {
  // `--full` (or KITCHEN_CHECK_FULL=1 from verify.mjs) runs every check suite;
  // otherwise only the suites this branch's diff since master can reach.
  const plan = selectCheckSuites(root, { full: process.argv.includes('--full') || process.env.KITCHEN_CHECK_FULL === '1' });
  console.log(`check suites: ${plan.suites.length ? plan.suites.join(', ') : 'none'} (${plan.reason})`);
  for (const suite of plan.suites) {
    const result = await runNode(fileURLToPath(new URL('./suite.mjs', import.meta.url)), [suite]);
    if (result !== 0) process.exit(result);
  }
  process.exit(0);
}
// K29: the services, apps and examples builds went with the older platform;
// the workspace build is the CLI bundle alone.
await build({ root: fileURLToPath(new URL('../packages/box-cli/', import.meta.url)), build: { ssr: 'src/cli.ts', outDir: 'dist', emptyOutDir: true, sourcemap: false } });
