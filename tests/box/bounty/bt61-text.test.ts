// BT61: without --json, not one character of any command's output changes. The snapshot was recorded from the code as it stood
// before the wave (BT61_RECORD=1 writes it); this test runs the same commands on the same stand-in journey and compares
// standard output, standard error and the exit code, after replacing what differs between runs (ids, paths, hashes, times).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sharedFixture } from './github-fixture.js';
import { CLI_DIST } from './support.js';

const SNAPSHOT = fileURLToPath(new URL('./bt61-text.snapshot.json', import.meta.url));
const record = process.env['BT61_RECORD'] === '1';

interface Entry { readonly args: readonly string[]; readonly stdout: string; readonly stderr: string; readonly status: number | null }

describe('BT61: the text of every command is byte-identical to the snapshot', { timeout: 300000 }, () => {
  const world = sharedFixture();
  const { repo, id, scratch, pr } = world;
  const seen: Entry[] = [];
  const dirs = (): string[] => [repo, scratch].flatMap(path => [path, path.replaceAll('\\', '/'), path.replaceAll('/', '\\')]).sort((a, b) => b.length - a.length);
  const normalise = (text: string): string => {
    let out = text;
    for (const path of dirs()) out = out.split(path).join('<dir>');
    return out
      .replaceAll(id, '<id>')
      .replace(/bt-[a-f\d]{12}/g, '<id>')
      .replace(/\b[a-f\d]{40}\b/g, '<sha>')
      .replace(/\b[a-f\d]{12}\b/g, '<sha12>')
      .replace(/\b[a-f\d]{7,10}\b(?=[ .,;:)\]]|$)/gm, '<short>')
      .replace(/\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?Z?/g, '<time>')
      .replace(/\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/g, '<date>') // the issue body says "posted 12 Nov 2026": the day the run happens
      .replace(/box-bt1-[A-Za-z0-9-]+/g, '<tmp>')
      .replace(/127\.0\.0\.1:\d+/g, '<local>')
      .replace(/\r\n/g, '\n')
      .split(String.fromCharCode(92)).join('/'); // path separators: the snapshot reads the same on every system
  };
  const run = (args: string[]): void => {
    const ran = spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: repo, encoding: 'utf8', env: process.env, timeout: 60000 });
    seen.push({ args: args.map(arg => normalise(arg)), stdout: normalise(ran.stdout), stderr: normalise(ran.stderr), status: ran.status });
  };

  it('the journey, command by command', () => world.run(() => {
    run(['describe']);
    run(['help']);
    run(['status']);
    run(['config']);
    run(['find', 'repair']);
    run([id, '--help']);
    run(['post', id, '--preview']);
    writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
    run(['post', id]); // held: the owner has not allowed it (exit 0)
    run(['allow', 'owner/project', '--reward', '10', '--reward-limit', '30']);
    run(['post', id]);
    run(['status']);
    pr('solver-a');
    run(['status']);
    run(['look', id, '1']);
    run(['apply', id, '1']);
    run(['status']);
    run(['close', id]); // already ended
    run(['hook']);
    run(['deny', 'owner/project']);
    // a refusal and a usage error, so standard error and the exit codes are frozen too
    run(['look', 'bt-000000000000', '1']);
    run(['apply']);
    run(['status', '--nope']);
    if (record) {
      writeFileSync(SNAPSHOT, `${JSON.stringify(seen, null, 2)}\n`);
      return;
    }
    expect(existsSync(SNAPSHOT), 'the snapshot file').toBe(true);
    const expected = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Entry[];
    expect(seen.length).toBe(expected.length);
    // every difference together, so one run on each system shows them all
    const differences: string[] = [];
    for (const [index, entry] of expected.entries()) {
      const got = seen[index]!;
      for (const field of ['stdout', 'stderr', 'status'] as const) {
        if (got[field] !== entry[field]) differences.push(`step ${index} (${entry.args.join(' ')}) ${field}: expected ${JSON.stringify(entry[field]).slice(0, 400)} but got ${JSON.stringify(got[field]).slice(0, 400)}`);
      }
    }
    expect(differences).toEqual([]);
  }));
});
