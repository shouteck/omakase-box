// Rerunnable R1 preparation driver. Reproduces the exported Box for wave R1:
// pins agreement.json to the current HEAD, then runs the real box CLI export
// into a named directory OUTSIDE this checkout (default ../r1-box-kitchen-stats,
// override with --out <dir>). It writes the pinned agreement beside the box and
// prints the exact commands the recipient and the owner verify step use.
//   node research/box-delegation/r1/driver.mjs [--out <dir>]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const safe = ['-c', 'safe.directory=' + repo.replaceAll('\\', '/')];

const outFlag = process.argv.indexOf('--out');
const outDir = resolve(outFlag === -1 ? join(repo, '..', 'r1-box-kitchen-stats') : process.argv[outFlag + 1]);
if (outDir.startsWith(repo)) { console.error('--out must be outside the checkout'); process.exit(2); }
if (existsSync(outDir) && readdirSync(outDir).length > 0) {
  console.log('removing previous export at ' + outDir);
  rmSync(outDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

const baseCommit = execFileSync('git', [...safe, 'rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', [...safe, 'status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
if (dirty.trim() !== '') { console.error('checkout is not clean; commit before exporting:\n' + dirty); process.exit(2); }

const tsxDir = readdirSync(join(repo, 'node_modules', '.pnpm')).find(name => /^tsx@/.test(name));
const tsx = tsxDir === undefined ? '' : join(repo, 'node_modules', '.pnpm', tsxDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
if (!existsSync(tsx)) { console.error('repository-local tsx not found under node_modules/.pnpm'); process.exit(2); }

const agreement = JSON.parse(readFileSync(join(here, 'agreement.json'), 'utf8'));
agreement.baseCommit = baseCommit;
const pinnedPath = join(dirname(outDir), 'r1-agreement.pinned.json');
writeFileSync(pinnedPath, JSON.stringify(agreement, null, 2) + '\n');

console.log('base commit: ' + baseCommit);
console.log('pinned agreement: ' + pinnedPath);
const run = spawnSync(process.execPath, [tsx, join(repo, 'packages', 'box-cli', 'src', 'cli.ts'), 'export', pinnedPath, '--repo', repo, '--out', outDir], { cwd: repo, stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status ?? 1);

console.log('');
console.log('Box exported to: ' + outDir);
console.log('Recipient commands (run inside the box folder):');
console.log('  pnpm install --frozen-lockfile');
console.log('  pnpm exec tsc --noEmit');
console.log('  pnpm exec vitest run evaluator/kitchen-stats-no-usage.test.ts');
console.log('  node box/submit.mjs');
console.log('Owner verify (phase 3):');
console.log('  node ' + tsx + ' packages/box-cli/src/cli.ts verify <submission.json> --agreement ' + pinnedPath + ' --repo ' + repo);
