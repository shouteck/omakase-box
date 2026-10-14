// K16 — the demo recorder. A --standin run reaches no network and no
// credential yet must still produce the video, one still per step and per
// page line, the transcript and the index — and the index must cover every
// step the replay printed. No address outside the sandbox kind may ever be
// visited; in stand-in every PAGE line is off-sandbox and must read refused.
// K17 adds: no displayed line may carry a path under a home folder, a wave
// name, or a command with a full interpreter path; the tool's settings come
// only from the run's own folder, so a settings file the run was launched
// under stays byte-for-byte the same; a run ends with no branch of its own
// left; and the recorder refuses a build older than the sources.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { allowedAddress, buildIsStale, pageUrlOf } from '../../kitchen/demo/record.mjs';

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
  it('produces the video, stills, transcript, screen and index; covers every step; visits nothing; touches nothing of the owner\'s', () => {
    // A settings file the run is launched under stands in for the owner's:
    // the tool must only ever see the run's own folder, so this file must be
    // byte-for-byte the same after a run.
    const ownerSettings = join(temp(), 'box');
    mkdirSync(ownerSettings, { recursive: true });
    const settingsFile = join(ownerSettings, 'settings.json');
    const settingsBefore = '{\n  "kind": "box-owner-settings",\n  "repositories": {}\n}\n';
    writeFileSync(settingsFile, settingsBefore);

    const out = join(temp(), 'standin-run');
    const run = spawnSync(process.execPath, [record, '--standin', '--pause', '0.05', '--per-line', '0.005', '--max-pause', '0.3', '--url-pause', '0.1', '--out', out], { encoding: 'utf8', timeout: 280000, env: { ...process.env, BOX_BOUNTY_SETTINGS_DIR: ownerSettings } });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(readFileSync(settingsFile, 'utf8')).toBe(settingsBefore);

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
    expect(transcript).toContain('box bounty — an agent hands a task to outside solvers');
    expect(transcript).toContain('mode: stand-in');
    // The transcript keeps the replay's last line — a dropped tail would hide
    // what the run left behind.
    expect(transcript.trimEnd().split('\n').pop()).toBe('nothing ever left this machine; removing the scratch folder.');

    // What a viewer saw, line for line. No home-folder path, no wave name,
    // no command shown with a full interpreter path.
    const screen = readFileSync(join(out, 'screen.txt'), 'utf8');
    for (const line of screen.split('\n')) {
      expect(line).not.toMatch(/[A-Z]:[\\/]Users[\\/]/i);
      expect(line).not.toMatch(/\b(bt11b|bt-11b?|k-?1[0-9]|wave|kitchen)\b/i);
      if (line.startsWith('$ ')) expect(line).not.toMatch(/node(\.exe)?\b|cli\.js|gh-standin/);
    }
    // Every tool command is shown as `box bounty …`; the transcript keeps the
    // full command beside it, paths shortened.
    const shownCommands = screen.split('\n').filter(line => line.startsWith('$ box '));
    expect(shownCommands.length).toBeGreaterThanOrEqual(6);
    for (const line of shownCommands) expect(line).toMatch(/^\$ box bounty /);
    expect(transcript).toContain('cli.js bounty create');
    expect(transcript).toContain('<tool>');
    // The tool's settings lived in the run's own folder, seen in `allow`'s
    // own output — and a run ends with no branch of its own left.
    expect(transcript).toContain('<settings>');
    expect(transcript).toContain('no branch of this run remains on the stand-in remote');
  }, 290000);
});

describe('the recorder refuses a stale build', () => {
  it('names the package whose sources postdate its dist', () => {
    const packagesDir = join(temp(), 'packages');
    const src = join(packagesDir, 'box-cli', 'src');
    const dist = join(packagesDir, 'box-cli', 'dist');
    mkdirSync(src, { recursive: true });
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'cli.js'), 'built\n');
    writeFileSync(join(src, 'cli.ts'), 'edited after the build\n');
    utimesSync(join(dist, 'cli.js'), new Date('2020-01-01'), new Date('2020-01-01'));
    expect(buildIsStale(packagesDir)).toBe('box-cli');
    utimesSync(join(src, 'cli.ts'), new Date('2020-01-01'), new Date('2020-01-01'));
    expect(buildIsStale(packagesDir)).toBeNull();
    rmSync(dist, { recursive: true, force: true });
    expect(buildIsStale(packagesDir)).toBe('box-cli');
  });
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
