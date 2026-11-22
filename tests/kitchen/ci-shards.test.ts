// reads: scripts/suite.mjs, .github/workflows/verify.yml
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

it('CI shards refuse missing, malformed, duplicate and out-of-range values before running tests', () => {
  for (const args of [[], ['0/4'], ['5/4'], ['1/0'], ['1'], ['1.5/4'], ['1/4/5'], ['1/9007199254740992'], ['1/4', '--shard', '2/4']]) {
    const run = spawnSync(process.execPath, ['scripts/suite.mjs', 'box', '--suite', 'bounty', '--shard', ...args], { cwd: root, encoding: 'utf8' });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('Invalid --shard');
    expect(run.stdout).not.toContain('Test Files');
  }
});

it('CI keeps every OS in independent bounty, kitchen and platform jobs with complete shard indices', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/verify.yml', import.meta.url), 'utf8');
  const bounty = workflow.slice(workflow.indexOf('  bounty:'), workflow.indexOf('  kitchen:'));
  for (const [os, count] of [['windows-2025', 4], ['macos-15', 2], ['ubuntu-24.04', 2]] as const) {
    const rows = [...bounty.matchAll(new RegExp(`os: ${os}, shard: (\\d+), shards: (\\d+)`, 'g'))];
    expect(rows.map(row => Number(row[1]))).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(rows.map(row => Number(row[2]))).toEqual(Array(count).fill(count));
  }
  expect(bounty).toContain('box --suite bounty --shard ${{ matrix.shard }}/${{ matrix.shards }}');
  expect(bounty).not.toContain('playwright install');
  expect(bounty).toContain('actions/setup-python@');
  for (const name of ['kitchen', 'platform']) {
    const at = workflow.indexOf(`  ${name}:`);
    const job = workflow.slice(at, workflow.indexOf('\n  # K50: the production', at) === -1 ? undefined : workflow.indexOf('\n  # K50: the production', at));
    expect(job).toContain('os: [ubuntu-24.04, windows-2025, macos-15]');
    expect(job).toContain('playwright install chromium');
  }
  expect(workflow).toContain('node scripts/verify.mjs --full test:kitchen');
  expect(workflow).toContain('node scripts/suite.mjs platform');
});
