#!/usr/bin/env node
// K76: which hosted jobs a push owes. node scripts/ci-select.mjs <before> <after>
// Reads the push's two-dot diff (GitHub's own path filter compares "the head and base SHAs directly" for a push to an existing
// branch) and prints each changed path with its class, then `full=true|false (<reason>)`. `full=false` means every changed path
// is read only by the kitchen suite, so the bounty, platform and install jobs can be skipped; the kitchen and audit jobs always
// run. The class is suite.mjs's stepReadsPath, the same rule verify's local reuse uses (K23), never a copied list. Every case
// the script cannot be sure of answers full=true, and it exits 0 whatever happens: a failure to decide is a full run, never a
// broken workflow. In CI it also writes `full=<value>` to $GITHUB_OUTPUT.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { stepReadsPath } from './suite.mjs';

const [before = '', after = ''] = process.argv.slice(2);
const MAX_COMMITS = 1000; // GitHub's filter always runs past this many commits; so do we.
const cwd = process.cwd();
const git = args => spawnSync('git', ['-c', `safe.directory=${cwd.replaceAll('\\', '/')}`, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });

function decide() {
  if (!/^[0-9a-f]{40}$/.test(after)) return { full: true, reason: 'no after commit given' };
  if (!/^[0-9a-f]{40}$/.test(before) || /^0+$/.test(before)) return { full: true, reason: 'a new branch: nothing to compare with' };
  if (git(['cat-file', '-e', `${before}^{commit}`]).status !== 0) return { full: true, reason: `the before commit ${before.slice(0, 7)} is not in this clone` };
  if (git(['merge-base', '--is-ancestor', before, after]).status !== 0) return { full: true, reason: 'a forced push: the before commit is not an ancestor' };
  const count = git(['rev-list', '--count', `${before}..${after}`]);
  if (count.status !== 0 || Number(count.stdout.trim()) > MAX_COMMITS) return { full: true, reason: `more than ${MAX_COMMITS} commits, or the count is unreadable` };
  const diff = git(['diff', '--name-only', '-z', '--no-renames', before, after]);
  if (diff.status !== 0) return { full: true, reason: 'the diff cannot be read' };
  const paths = diff.stdout.split('\0').filter(Boolean);
  if (paths.length === 0) return { full: true, reason: 'no changed paths: nothing to select on' };
  const heavy = paths.filter(path => stepReadsPath('test:box-bounty', path));
  for (const path of paths) console.log(`${heavy.includes(path) ? 'full   ' : 'kitchen'} ${path}`);
  return heavy.length > 0
    ? { full: true, reason: `${heavy.length} of ${paths.length} changed paths are read beyond the kitchen suite` }
    : { full: false, reason: `all ${paths.length} changed paths are read by the kitchen suite alone` };
}

let answer;
try { answer = decide(); } catch (error) { answer = { full: true, reason: `the selection failed (${error instanceof Error ? error.message : String(error)})` }; }
console.log(`full=${answer.full} (${answer.reason})`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `full=${answer.full}\n`);
