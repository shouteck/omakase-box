// BT22 — the owner's settings file holds only the owner's choices. The
// tool's own bookkeeping (what it said once, notices shown, migration and
// first-merge records, the retired shared reward) lives in state.json beside
// it. Both files are written atomically; a read command never rewrites
// settings.json, and a malformed state file is reset, never refused.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadState, saveState, settingsFile, stateFile } from '../../../packages/box-bounty/index.js';
import { fixture } from './github-fixture.js';
import { CLI_DIST, git, makeRepo } from './support.js';

const box = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

const LEVEL = { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [] };

function repo(address = 'owner/project'): string {
  const root = makeRepo({ 'app.txt': 'broken\n', 'TASK.md': 'repair it\n' });
  git(root, ['remote', 'add', 'origin', `https://github.com/${address}.git`]);
  return root;
}

describe('the owner\'s settings file holds only the owner\'s choices', () => {
  it('1: no command on the journey rewrites settings.json; the said-once records land in state.json', () => fixture(({ repo, id, scratch, pr }) => {
    const settings = join(scratch, 'settings', 'settings.json');
    const state = join(scratch, 'settings', 'state.json');
    writeFileSync(settings, JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
    const reads = (args: string[]) => {
      const before = readFileSync(settings, 'utf8');
      const run = box(repo, args);
      expect(run.status, `${args.join(' ')} exited ${run.status}: ${run.stderr}`).toBe(0);
      expect(readFileSync(settings, 'utf8'), `${args.join(' ')} rewrote the owner's settings`).toBe(before);
      return run;
    };
    // The journey's read commands, each for the first time.
    reads(['status']);
    reads(['status', '--full']);
    const held = reads(['post', id, '--to', 'github']);
    expect(held.stdout).toContain('waiting for the owner');
    // The owner's answer is the one command allowed to write the file.
    expect(box(repo, ['allow', 'owner/project', '--reward', '10', '--reward-limit', '30']).status).toBe(0);
    pr('solver');
    // `box bounty` — the overview. The reward's said-once explanation belongs
    // to the first read that renders the reward line, and it lands in state.json.
    const overview = reads([]);
    expect(overview.stdout).toContain('a promise in the owner\'s name, paid by hand');
    reads(['status']);
    reads(['status', '--full']);
    reads(['look', id, '1']);
    reads(['apply', id, '1']);
    reads(['status']);
    reads(['describe']);
    reads(['config']);
    // What the tool remembered for itself is all in state.json.
    const memory = JSON.parse(readFileSync(state, 'utf8'));
    expect(memory['kind']).toBe('box-tool-state');
    expect(memory['said']['*#settings-not-a-lock']).toEqual(expect.any(String));
    expect(memory['said'][`${realpathSync(repo)}#reward-is-a-promise`]).toEqual(expect.any(String));
    expect(memory['rewardNoticeAt']).toEqual(expect.any(String));
    expect(memory['firstMerges']['owner/project']['commit']).toEqual(expect.any(String));
    // And none of it is in the owner's file.
    const owners = JSON.parse(readFileSync(settings, 'utf8'));
    for (const key of ['said', 'firstMerges', 'migrations', 'retiredReward', 'rewardPromiseSaid', 'rewardNoticeAt', 'askMergeNoticeAt']) {
      expect(owners[key], `settings.json still carries ${key}`).toBeUndefined();
    }
  }));

  it('2: the said-once explanations are still said exactly once each', () => fixture(({ repo, scratch }) => {
    writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
    box(repo, ['allow', 'owner/project', '--reward', '10', '--reward-limit', '30']);
    const first = box(repo, ['status']);
    const second = box(repo, ['status']);
    expect(first.stdout).toContain('a promise in the owner\'s name, paid by hand');
    expect(second.stdout).not.toContain('a promise in the owner\'s name');
    expect(second.stdout).toContain('states $10');
  }));

  it('3: an old settings file hands its bookkeeping to state.json once, then neither file changes', () => {
    const root = repo();
    const moved = {
      said: { '*#settings-not-a-lock': '2026-10-14T00:00:00.000Z' },
      firstMerges: { 'owner/project': { commit: 'a'.repeat(40), at: '2026-10-14T00:00:00.000Z' } },
      migrations: [{ path: 'C:\\old\\checkout', at: '2026-10-14T00:00:00.000Z', repository: 'owner/project', detail: 'moved to owner/project' }],
      rewardNoticeAt: '2026-10-14T00:00:00.000Z'
    };
    const ownerKeys = { default: LEVEL, repositories: { 'owner/project': LEVEL } };
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', ...ownerKeys, ...moved }));
    expect(box(root, ['status']).status).toBe(0);
    const settings = JSON.parse(readFileSync(settingsFile(), 'utf8'));
    const state = JSON.parse(readFileSync(stateFile(), 'utf8'));
    // The owner's choices stand byte-for-byte in meaning; the tool's records moved out.
    expect({ kind: settings['kind'], default: settings['default'], repositories: settings['repositories'] })
      .toEqual({ kind: 'box-owner-settings', ...ownerKeys });
    for (const key of Object.keys(moved)) expect(settings[key]).toBeUndefined();
    for (const key of Object.keys(moved)) expect(state[key]).toEqual(moved[key as keyof typeof moved]);
    expect(state['kind']).toBe('box-tool-state');
    // Once: a second read writes neither file.
    const settingsBytes = readFileSync(settingsFile(), 'utf8');
    const stateBytes = readFileSync(stateFile(), 'utf8');
    expect(box(root, ['status']).status).toBe(0);
    expect(readFileSync(settingsFile(), 'utf8')).toBe(settingsBytes);
    expect(readFileSync(stateFile(), 'utf8')).toBe(stateBytes);
  });

  it('3b: state.json wins a clash with the moved keys, and a state file cannot grant authority', () => {
    const root = repo();
    writeFileSync(settingsFile(), JSON.stringify({
      kind: 'box-owner-settings', repositories: {}, said: { '*#settings-not-a-lock': '2026-10-14T00:00:00.000Z' }
    }));
    writeFileSync(stateFile(), JSON.stringify({ kind: 'box-tool-state', said: { '*#settings-not-a-lock': '2026-10-15T00:00:00.000Z' } }));
    expect(box(root, ['status']).status).toBe(0);
    expect(JSON.parse(readFileSync(stateFile(), 'utf8'))['said']['*#settings-not-a-lock']).toBe('2026-10-15T00:00:00.000Z');
    // A hand-edited state file claiming an owner answer changes nothing: the
    // key is not the tool's, the file is reset, and nothing was allowed.
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
    writeFileSync(stateFile(), JSON.stringify({
      kind: 'box-tool-state',
      repositories: { 'owner/project': LEVEL },
      mergeAnswers: { 'owner/project#bt-x': { n: 1, commit: 'a'.repeat(40), head: 'b'.repeat(40), at: '2026-10-14T00:00:00.000Z' } }
    }));
    const status = box(root, ['status']);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain('owner: nothing written');
    expect(JSON.parse(readFileSync(settingsFile(), 'utf8'))['repositories']).toEqual({});
  });

  it('4: a malformed state.json is reset with one line and never blocks the owner', () => {
    const root = repo();
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': LEVEL } }));
    writeFileSync(stateFile(), '{unreadable');
    const before = readFileSync(settingsFile(), 'utf8');
    const run = box(root, ['status']);
    expect(run.status).toBe(0);
    expect(run.stderr).toContain(`the tool's own state at ${stateFile()} was unreadable and was reset`);
    expect(run.stdout).toContain('box bounty status');
    expect(readFileSync(settingsFile(), 'utf8')).toBe(before);
    expect(JSON.parse(readFileSync(stateFile(), 'utf8'))['kind']).toBe('box-tool-state');
    // A file whose JSON parses but is not the tool's state resets the same way.
    writeFileSync(stateFile(), JSON.stringify({ kind: 'box-owner-settings' }));
    const again = box(root, ['status']);
    expect(again.status).toBe(0);
    expect(again.stderr).toContain('was unreadable and was reset');
  });

  it('5: a malformed settings.json still refuses settings-malformed', () => {
    const root = repo();
    writeFileSync(settingsFile(), '{unreadable');
    const run = box(root, ['status']);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('settings-malformed');
  });

  it('6: a write interrupted between temp file and rename leaves the target whole', () => {
    const root = repo();
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': LEVEL } }));
    writeFileSync(stateFile(), JSON.stringify({ kind: 'box-tool-state', said: { '*#earlier': '2026-10-14T00:00:00.000Z' } }));
    // The stale temp another process left behind is ignored: the intact
    // target still loads.
    const stale = `${stateFile()}.999999999.tmp`;
    writeFileSync(stale, 'half-written junk');
    const run = box(root, ['status']);
    expect(run.status).toBe(0);
    expect(loadState().said).toEqual({ '*#earlier': '2026-10-14T00:00:00.000Z' });
    // A later write reuses this process's own temp name over a stale file
    // and lands whole.
    const own = `${stateFile()}.${process.pid}.tmp`;
    writeFileSync(own, 'half-written junk');
    saveState({ ...loadState(), said: { '*#earlier': '2026-10-14T00:00:00.000Z', '*#later': '2026-10-15T00:00:00.000Z' } });
    expect(existsSync(own)).toBe(false);
    expect(loadState().said).toEqual({ '*#earlier': '2026-10-14T00:00:00.000Z', '*#later': '2026-10-15T00:00:00.000Z' });
    expect(dirname(stateFile())).toBe(dirname(settingsFile()));
  });

  it('7: config and config --full still show migration history and first merges, read from state', () => {
    const root = repo();
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'owner/project': LEVEL } }));
    saveState({
      migrations: [{ path: 'C:\\old\\checkout', at: '2026-10-14T00:00:00.000Z', repository: 'owner/project', detail: 'moved to owner/project' }],
      firstMerges: { 'owner/project': { commit: 'a'.repeat(40), at: '2026-10-14T00:00:00.000Z' } }
    });
    for (const args of [['config'], ['config', '--full']]) {
      const run = box(root, args);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('moved to owner/project');
      expect(run.stdout).toContain(`first outside solution merged in owner/project: commit ${'a'.repeat(40)}`);
    }
  });
});
