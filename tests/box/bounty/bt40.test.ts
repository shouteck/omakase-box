// BT40 — every refusal the tool can print carries a true `next:` step, and a
// parser-based guard fails on any new refusal without one. The walker mirrors
// the CTO's master scan: `new BountyRefused(a, b)` and `invalid(a, b)` calls
// in packages/box-bounty and packages/box-cli/src, excluding `invalid`'s own
// forwarding definition (gh.ts) and the one `command-removed` throw whose
// message is the removed-name table lookup (bounty.ts) — the table's values
// are checked directly through the built CLI instead. getText() proves the
// message text contains `next:`; it does not prove the step is true — the
// review reads sites for that.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { allowRepository, createBounty } from '../../../packages/box-bounty/index.js';
import { sharedPostedFixture } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, runRoot } from './support.js';

const cli = (cwd: string, args: readonly string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

const ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['packages/box-bounty', 'packages/box-cli/src'];
// The dispatcher's real branches in packages/box-cli/src/bounty.ts — a `next:`
// that names a `box bounty <word>` outside this list sends the reader to a
// command that does not exist.
const COMMANDS = new Set(['allow', 'apply', 'close', 'config', 'create', 'deny', 'describe', 'find', 'help', 'hook', 'look', 'post', 'status']);

interface Site { file: string; line: number; reason: string; message: string; excepted: boolean }

const collectSites = (): Site[] => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(join(dir, entry.name));
    }
  };
  SCAN_DIRS.forEach(walk);
  const sites: Site[] = [];
  for (const file of files) {
    const rel = file.split(sep).join('/');
    const sf = ts.createSourceFile(rel, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      let args: ts.NodeArray<ts.Expression> | undefined;
      if (ts.isNewExpression(node) && node.expression.getText(sf) === 'BountyRefused' && node.arguments !== undefined && node.arguments.length >= 2) args = node.arguments;
      if (ts.isCallExpression(node) && node.expression.getText(sf) === 'invalid' && node.arguments !== undefined && node.arguments.length >= 2) args = node.arguments;
      if (args !== undefined) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const reason = args[0]!.getText(sf);
        const message = args[1]!.getText(sf);
        // Exclusions: `invalid`'s own forwarding body (reason, message) and the
        // removed-command table lookup — tested through the CLI below.
        const excepted = (reason === 'reason' && message === 'message') || message === 'removed[subcommand!]!';
        sites.push({ file: rel, line: line + 1, reason, message, excepted });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
};

describe('BT40 every refusal names its next step', () => {
  it('guard: every BountyRefused/invalid message argument contains literal `next: `', () => {
    const sites = collectSites();
    const guarded = sites.filter(site => !site.excepted);
    const missing = guarded.filter(site => !site.message.includes('next: '));
    expect(
      missing.map(site => `${site.file}:${site.line} ${site.reason}`).join('\n'),
      'refusal sites without `next: `').toBe('');
    // The count is asserted so a walker that finds nothing cannot pass.
    expect(sites.length, 'the scan found far fewer refusal sites than the CTO count — the walker is broken').toBeGreaterThanOrEqual(240);
    expect(sites.filter(site => site.excepted).length, 'expected exactly the forwarding definition and the removed-table lookup').toBe(2);
  });

  it('removed command names still answer with a next step through the built CLI', () => {
    const repo = makeRepo({ 'TASK.md': 'Fix the sum.\n' });
    const removed: readonly (readonly string[])[] = [
      ['answer'], ['questions'], ['reply'], ['undo'], ['reject'], ['withdraw'], ['remind'], ['confirm'], ['owner', 'setup'],
    ];
    for (const args of removed) {
      const result = cli(repo, args);
      const out = `${result.stdout}\n${result.stderr}`;
      expect(result.status, `box bounty ${args.join(' ')} exited ${result.status} —\n${out}`).toBe(3);
      expect(out, `box bounty ${args.join(' ')} —\n${out}`).toContain('(command-removed)');
      expect(out, `box bounty ${args.join(' ')} names no next step —\n${out}`).toContain('next: ');
    }
  });

  it('every `box bounty <word>` written after `next:` is a real command', () => {
    const bad: string[] = [];
    for (const site of collectSites()) {
      if (site.excepted) continue;
      let from = site.message.indexOf('next: ');
      while (from !== -1) {
        const tail = site.message.slice(from).split('\n')[0]!;
        for (const match of tail.matchAll(/box bounty ([a-z][a-z-]*)/g)) {
          if (!COMMANDS.has(match[1]!)) bad.push(`${site.file}:${site.line} ${site.reason} names 'box bounty ${match[1]}'`);
        }
        from = site.message.indexOf('next: ', from + 1);
      }
    }
    expect(bad.join('\n'), 'a next step names a command that does not exist').toBe('');
  });

  it('one refusal per family runs through the built CLI and prints its reason and next step', { timeout: 180000 }, () => {
    const repo = makeRepo({ 'TASK.md': 'Fix the sum.\n', 'secrets/TASK2.md': 'hidden\n' });
    const draft = createBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'stuck' });
    const notARepo = runRoot('bt40-norepo');
    // Family: needs the owner's authority — two allowed remotes cannot be told apart.
    const repoTwoRemotes = makeRepo({ 'TASK.md': 'Fix the sum.\n' });
    git(repoTwoRemotes, ['remote', 'add', 'origin', 'git@github.com:a/one.git']);
    git(repoTwoRemotes, ['remote', 'add', 'upstream', 'git@github.com:b/two.git']);
    allowRepository(repoTwoRemotes, 'a/one');
    allowRepository(repoTwoRemotes, 'b/two');
    const draftTwo = createBounty({ repoPath: repoTwoRemotes, taskPath: join(repoTwoRemotes, 'TASK.md'), why: 'stuck' });
    const cases: readonly { family: string; cwd: string; args: readonly string[]; reason: string }[] = [
      // Each of the eight families in the brief, with the reason asserted by name.
      { family: 'files and settings', cwd: repo, args: ['config', 'set', 'no-such-setting', '1'], reason: 'settings-unknown-name' },
      { family: 'missing tool or sign-in', cwd: notARepo, args: ['create', '--task', join(repo, 'TASK.md'), '--why', 'x'], reason: 'not-a-repository' },
      { family: 'hard stop', cwd: repo, args: ['create', '--task', join(repo, 'secrets', 'TASK2.md'), '--why', 'x'], reason: 'never-ship-input' },
      { family: 'owner authority', cwd: repoTwoRemotes, args: ['post', draftTwo.id], reason: 'repository-several-allowed' },
      { family: 'wrong state', cwd: repo, args: ['allow', draft.id], reason: 'owner-answer-not-waiting' },
      { family: 'retired or removed', cwd: repo, args: ['undo'], reason: 'command-removed' },
      { family: 'wrong or missing argument', cwd: repo, args: ['find'], reason: 'missing-query' },
    ];
    for (const entry of cases) {
      const result = cli(entry.cwd, entry.args);
      const out = `${result.stdout}\n${result.stderr}`;
      expect(result.status, `${entry.family}: box bounty ${entry.args.join(' ')} exited ${result.status} —\n${out}`).toBe(3);
      expect(out, `${entry.family}: expected ${entry.reason} —\n${out}`).toContain(`(${entry.reason})`);
      expect(out, `${entry.family}: refusal names no next step —\n${out}`).toContain('next: ');
    }
    // Family: GitHub or Git answered badly — the posted world names a pull
    // request that does not exist on the fake remote.
    const world = sharedPostedFixture();
    world.run(() => {
      const result = cli(world.repo, ['look', world.id, '999']);
      const out = `${result.stdout}\n${result.stderr}`;
      expect(result.status, `github family: ${out}`).toBe(3);
      expect(out).toContain('(github-pr-missing)');
      expect(out).toContain('next: ');
    });
    // Held: a fresh draft in the posted world waits for the owner (exit 0).
    world.run(() => {
      const second = createBounty({ repoPath: world.repo, taskPath: join(world.repo, 'TASK.md'), why: 'a second hand-off', title: 'Second task' });
      const result = cli(world.repo, ['post', second.id]);
      const out = `${result.stdout}\n${result.stderr}`;
      expect(result.status, `held post exited ${result.status} —\n${out}`).toBe(0);
      expect(out, `held post carries no owner block —\n${out}`).toContain('owner');
      expect(out, `held post names no next step —\n${out}`).toContain('next: ');
    });
  });
});
