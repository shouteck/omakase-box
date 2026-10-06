// Tells the lab whether the kitchen is running a heavy job right now, so the lab can wait its turn.
// Prints "busy" (exit 1) or "idle" (exit 0), with the reason. Reads only; never touches the kitchen.
// Signal: scripts/verify.mjs creates its run directory at start and writes summary.json at the end,
// so a recent run directory without a summary in the main checkout means a verify is in progress.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const kitchen = process.env.KITCHEN_CHECKOUT ?? 'C:/Users/shout/Desktop/Projects/private-task-mvp';
const windowMinutes = Number(process.env.KITCHEN_BUSY_WINDOW_MINUTES ?? 20);
const runs = join(kitchen, '.kitchen', 'runs');
if (!existsSync(runs)) { console.log(`idle (no run history at ${runs})`); process.exit(0); }

const now = Date.now();
const inProgress = readdirSync(runs)
  .map(name => join(runs, name))
  .filter(path => statSync(path).isDirectory() && !existsSync(join(path, 'summary.json')))
  .map(path => {
    // The newest file in the directory shows whether the run is still writing its logs.
    const newest = Math.max(statSync(path).mtimeMs, ...readdirSync(path).map(file => statSync(join(path, file)).mtimeMs));
    return { path, minutes: (now - newest) / 60000 };
  })
  .filter(run => run.minutes < windowMinutes)
  .sort((a, b) => a.minutes - b.minutes);

if (inProgress.length) {
  console.log(`busy (kitchen verify in progress: ${inProgress[0].path}, last wrote ${inProgress[0].minutes.toFixed(1)} min ago)`);
  process.exit(1);
}
console.log('idle (no kitchen verify in progress)');
