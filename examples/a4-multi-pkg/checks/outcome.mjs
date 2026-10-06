import { spawnSync } from 'node:child_process';

// Outcome: the requested change — the CLI prints the core banner in green
// using the real picocolors dependency. Output is intentionally fixed text so
// owner-base and Box runs compare byte-wise.
const run = spawnSync(process.execPath, ['packages/cli/bin.js'], { encoding: 'utf8' });
const want = '\x1b[32ma4 ok\x1b[39m\n';
if (run.status !== 0 || run.stdout !== want) {
  console.log('OUTCOME FAIL packages/cli/bin.js did not print the green banner');
  process.exit(1);
}
console.log('a4-multi-pkg outcome: green banner printed');
