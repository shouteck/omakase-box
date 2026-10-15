// BT21 — the edges hold. A bounty the agent merged itself still closes up on
// GitHub whatever the owner's standing answer is, and says so once; an
// instruction file can never be pointed at Git's or the tool's own files; a
// clashing apply leaves the index usable for the agent's own merge; and the
// inside-project path walk is one shared implementation both callers keep
// their own reason names on.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { applyBounty, changeConfig, checkMergedSolutions, closeBounty, hookHost, hookOn, loadRecord, renderConfig, renderStatus, resolveRepoRoot, setMergeNoticeListener, settingsFile } from '../../../packages/box-bounty/index.js';
import { writeInstructions } from '../../../packages/box-bounty/settings.js';
import { postedFixture, refused } from './github-fixture.js';
import { git, makeRepo, runRoot, write } from './support.js';

const noticed: string[] = [];
setMergeNoticeListener(line => noticed.push(line));

// The agent's own merge of a solution commit — its own Git, its own settings.
const mergeSolution = (repo: string, sha: string): string => {
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'agent merged the solution', sha]);
  return git(repo, ['rev-parse', 'HEAD']);
};

// Write the fixture world's owner-list entry straight — the same shape the
// allow/deny commands persist (`bounty: null` is a dated deny).
const ownerLists = (scratch: string, bounty: string | null): void => {
  const path = join(scratch, 'settings', 'settings.json');
  const settings = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  settings['repositories'] = { 'owner/project': { bounty, at: '2026-10-01T00:00:00.000Z', changes: [] } };
  writeFileSync(path, JSON.stringify(settings));
};

const unasked = (): string[] => noticed.filter(line => line.includes('without asking'));

it('under allowed an agent-merged solution closes up on GitHub — quietly', () => postedFixture(({ repo, id, bare, waitingPr, state }) => {
  const merge = mergeSolution(repo, waitingPr);
  noticed.length = 0;
  checkMergedSolutions(repo);
  expect(loadRecord(repo, id).stage).toBe('applied');
  expect(loadRecord(repo, id).events.at(-1)?.merge).toBe(merge);
  expect(state().issues[0]!.state).toBe('closed');
  expect(state().comments.some(comment => comment.body.includes(`<!-- box-bounty:${id}:merged -->`))).toBe(true);
  expect(git(bare, ['show-ref'])).not.toContain(`box-bounty/${id}`);
  expect(unasked()).toEqual([]);
}, { collected: true }));

it('under deny the same close-up happens — and says so once, naming deny', () => postedFixture(({ repo, id, bare, waitingPr, state, scratch }) => {
  ownerLists(scratch, null);
  mergeSolution(repo, waitingPr);
  noticed.length = 0;
  checkMergedSolutions(repo);
  expect(state().issues[0]!.state).toBe('closed');
  expect(git(bare, ['show-ref'])).not.toContain(`box-bounty/${id}`);
  const lines = unasked();
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain(id);
  expect(lines[0]).toContain('closed up on GitHub without asking');
  expect(lines[0]).toContain('your standing answer here is deny');
  // Told once: a repeat that changes nothing on GitHub adds no line.
  noticed.length = 0;
  checkMergedSolutions(repo);
  renderStatus(repo);
  expect(closeBounty(repo, id).outcome).toBe('already-ended');
  expect(unasked()).toEqual([]);
}, { collected: true }));

it("under 'ask me each time' the same close-up happens — and says so once", () => postedFixture(({ repo, id, bare, waitingPr, state, scratch }) => {
  ownerLists(scratch, 'ask');
  mergeSolution(repo, waitingPr);
  noticed.length = 0;
  checkMergedSolutions(repo);
  expect(state().issues[0]!.state).toBe('closed');
  expect(git(bare, ['show-ref'])).not.toContain(`box-bounty/${id}`);
  const lines = unasked();
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('ask me each time');
}, { collected: true }));

it('instruction-file aimed at .git or .box is refused by name — bytes and settings untouched', () => {
  const repo = makeRepo({ 'a.txt': 'a\n' });
  mkdirSync(join(repo, '.box', 'bounties'), { recursive: true });
  writeFileSync(join(repo, '.box', 'bounties', 'x.json'), '{}');
  const gitConfig = readFileSync(join(repo, '.git', 'config'));
  const boxFile = readFileSync(join(repo, '.box', 'bounties', 'x.json'));
  for (const named of ['.git/config', '.box/bounties/x.json', '.GIT/config']) {
    refused(() => changeConfig(repo, 'set', 'instruction-file', named), 'instruction-file-tool-owned');
  }
  // A link spelling into .git reads the same refusal — judged on where it
  // lands, not on how it was spelled.
  symlinkSync(join(repo, '.git'), join(repo, 'guides'), 'junction');
  refused(() => changeConfig(repo, 'set', 'instruction-file', 'guides/config'), 'instruction-file-tool-owned');
  expect(readFileSync(join(repo, '.git', 'config'))).toEqual(gitConfig);
  expect(readFileSync(join(repo, '.box', 'bounties', 'x.json'))).toEqual(boxFile);
  expect(existsSync(settingsFile())).toBe(false);
});

it('a saved instruction-file inside .git is refused at sync, named in config, and Git keeps working', () => {
  const repo = makeRepo({ 'a.txt': 'a\n' });
  const gitConfig = readFileSync(join(repo, '.git', 'config'));
  // As if an older tool had saved the choice straight into the owner's
  // settings — the sync is where a stored bad value is caught now.
  writeInstructions(repo, { enabled: true, file: '.git/config', notices: [] });
  const out = changeConfig(repo, 'set', 'instructions', 'true');
  expect(out).toContain('.git/config');
  expect(out).toContain('instruction-file-tool-owned');
  const rendered = renderConfig(repo);
  expect(rendered).toContain('.git/config');
  expect(rendered).toContain('instruction-file-tool-owned');
  expect(readFileSync(join(repo, '.git', 'config'))).toEqual(gitConfig);
  expect(() => git(repo, ['status', '--porcelain'])).not.toThrow();
});

it('a clashing apply leaves the index usable — the agent merge reaches its conflict', () => postedFixture(({ repo, id, waitingPr }) => {
  write(repo, 'app.txt', 'owner moved on\n');
  git(repo, ['add', 'app.txt']);
  git(repo, ['commit', '-qm', 'owner moved app']);
  const pristine = git(repo, ['status', '--porcelain']);
  expect(applyBounty(repo, id, 1).outcome).toBe('conflict');
  // The agent then tries the same merge with its own Git. The refusal K15
  // saw was "not uptodate"/"needs update" from a stale index; the normal
  // outcome is the merge's own conflict state.
  const safe = `safe.directory=${repo.split('\\').join('/')}`;
  const own = spawnSync('git', ['-c', safe, '-c', 'user.name=bt-test', '-c', 'user.email=bt-test@test.invalid', '-C', repo, 'merge', '--no-commit', waitingPr], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  const detail = `${own.stdout}\n${own.stderr}`;
  expect(detail).not.toMatch(/not uptodate|needs update|would be overwritten|uncommitted changes/i);
  expect(detail).toContain('CONFLICT');
  expect(git(repo, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).not.toBe('');
  git(repo, ['merge', '--abort']);
  expect(git(repo, ['status', '--porcelain'])).toBe(pristine);
}, { collected: true }));

it('the shared path walk keeps each caller own reason names', () => {
  const repo = makeRepo({ 'a.txt': 'a\n', 'guide.md': 'guide\n' });
  mkdirSync(join(repo, 'sub'), { recursive: true });
  const outside = runRoot('bt21-outside');
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'note.md'), 'outside\n');
  // Instruction-file caller: a `..` escape and the project root itself are
  // outside-repo; a link mid-path is the link refusal — all its own names.
  refused(() => changeConfig(repo, 'set', 'instruction-file', '../outside.md'), 'instruction-file-outside-repo');
  refused(() => changeConfig(repo, 'set', 'instruction-file', '.'), 'instruction-file-outside-repo');
  symlinkSync(outside, join(repo, 'linked'), 'junction');
  refused(() => changeConfig(repo, 'set', 'instruction-file', 'linked/note.md'), 'instruction-file-link');
  // A `..` spelling that stays inside but lands on .git reads tool-owned.
  refused(() => changeConfig(repo, 'set', 'instruction-file', 'sub/../.git/config'), 'instruction-file-tool-owned');
  // Hook caller on the same shapes: a junctioned settings directory and a
  // leaf link escape; a file where a directory belongs is blocked.
  symlinkSync(outside, join(repo, '.claude'), 'junction');
  refused(() => hookOn(resolveRepoRoot(repo), hookHost('claude')), 'hook-settings-escape');
  expect(existsSync(join(outside, 'settings.json'))).toBe(false);
  writeFileSync(join(repo, '.devin'), 'not a directory');
  refused(() => hookOn(resolveRepoRoot(repo), hookHost('devin')), 'hook-settings-blocked');
});
