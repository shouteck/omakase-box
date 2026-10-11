import { spawnSync } from 'node:child_process';
import { banner } from '../packages/core/index.js';

// Guard: preexisting behavior that must stay green — the core banner text is
// stable and the CLI still exits 0 printing the banner text (styled or not).
const problems = [];
if (banner() !== 'a4 ok') problems.push('core banner text changed');
const run = spawnSync(process.execPath, ['packages/cli/bin.js'], { encoding: 'utf8' });
if (run.status !== 0) problems.push('cli exited nonzero');
else if (!run.stdout.includes('a4 ok')) problems.push('cli lost the banner text');
if (problems.length > 0) {
  console.log('GUARD FAIL ' + problems.join('; '));
  process.exit(1);
}
console.log('a4-multi-pkg guard: banner and cli intact');
