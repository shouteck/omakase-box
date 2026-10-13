// K16 — the demo recorder. A --standin run reaches no network and no
// credential yet must still produce the video, one still per step and per
// page line, the transcript and the index — and the index must cover every
// step the replay printed. No address outside the sandbox kind may ever be
// visited; in stand-in every PAGE line is off-sandbox and must read refused.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { allowedAddress, pageUrlOf } from '../../kitchen/demo/record.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const record = join(root, 'kitchen', 'demo', 'record.mjs');
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k16-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); });

describe('the PAGE allowlist — the only address the recorder may open', () => {
  it('admits only sandbox-repository addresses, and only in a real run', () => {
    for (const path of ['issues/4', 'pull/5', 'pull/6/files']) {
      expect(allowedAddress(`https://github.com/shouteck/box-bounty-sandbox/${path}`, true)).toBe(true);
    }
    for (const hostile of [
      'https://github.com/owner/project/issues/1',
      'https://github.com/shouteck/omakase-box/issues/1',
      'https://github.com/shouteck/box-bounty-sandbox.evil.invalid/x',
      'http://github.com/shouteck/box-bounty-sandbox/issues/4',
      'https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00',
      'https://github.com/shouteck/box-bounty-sandbox/../secrets',
      'not a url at all',
      '',
    ]) {
      expect(allowedAddress(hostile, true), hostile).toBe(false);
    }
    expect(allowedAddress('https://github.com/shouteck/box-bounty-sandbox/issues/1', false)).toBe(false);
  });
  it('reads the address from a PAGE line as the replay prints it', () => {
    expect(pageUrlOf('PAGE https://github.com/x/y/issues/1 — the issue')).toBe('https://github.com/x/y/issues/1');
    expect(pageUrlOf('PAGE https://github.com/x/y/pull/2')).toBe('https://github.com/x/y/pull/2');
  });
});

describe('a stand-in run', () => {
  it('produces the video, stills, transcript and index; covers every step; visits nothing', () => {
    const out = join(temp(), 'standin-run');
    const run = spawnSync(process.execPath, [record, '--standin', '--pause', '0.05', '--url-pause', '0.1', '--out', out], { encoding: 'utf8', timeout: 280000 });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);

    const video = join(out, 'demo.webm');
    expect(existsSync(video)).toBe(true);
    expect(statSync(video).size).toBeGreaterThan(10000);

    const transcript = readFileSync(join(out, 'transcript.txt'), 'utf8');
    const index = readFileSync(join(out, 'index.md'), 'utf8');
    const steps = transcript.split('\n').filter(line => line.startsWith('=== step '));
    const pages = transcript.split('\n').filter(line => line.startsWith('PAGE '));
    expect(steps.length).toBeGreaterThanOrEqual(10);
    expect(pages.length).toBeGreaterThanOrEqual(4);

    // One index row per step and per PAGE line — the index covers the run.
    const rows = index.split('\n').filter(line => line.startsWith('| ')).slice(1);
    const stepRows = rows.filter(row => !row.includes('card') && !row.includes('PAGE'));
    expect(rows.length).toBe(steps.length + pages.length + 2);
    expect(stepRows.length).toBe(steps.length);
    for (const step of steps) {
      const who = step.replace(/^=== step \d+ — /, '');
      expect(index).toContain(who);
    }
    // Every PAGE line is off-sandbox in a stand-in: refused, never visited.
    expect(transcript).not.toContain('[recorder] visiting');
    const refused = transcript.split('\n').filter(line => line.includes('[recorder] not visiting'));
    expect(refused.length).toBe(pages.length);
    expect(index.match(/refused: https/g)?.length).toBe(pages.length);

    // A still at every step and at every page line, plus the two cards.
    const stills = readdirSync(join(out, 'stills'));
    expect(stills.filter(name => name.startsWith('step-')).length).toBe(steps.length);
    expect(stills.filter(name => name.startsWith('page-')).length).toBe(pages.length);
    expect(stills).toContain('card-title.png');
    expect(stills).toContain('card-end.png');
    // The transcript is the replay's own output, annotated only by [recorder] lines.
    expect(transcript).toContain('box bounty — the solver');
    expect(transcript).toContain('mode: stand-in');
    // The transcript keeps the replay's last line — a dropped tail would hide
    // what the run left behind.
    expect(transcript.trimEnd().split('\n').pop()).toBe('stand-in run — nothing ever left this machine; removing the scratch folder.');
  }, 290000);
});

describe('the named refusals', () => {
  it('refuses an output folder that already exists and is not this command\'s', () => {
    const out = temp();
    writeFileSync(join(out, 'someone-elses.txt'), 'not the recorder\'s\n');
    const run = spawnSync(process.execPath, [record, '--standin', '--out', out], { encoding: 'utf8', timeout: 30000 });
    expect(run.status).toBe(2);
    expect(run.stdout).toContain('record refused');
    expect(run.stdout).toContain('already exists');
  });
});
