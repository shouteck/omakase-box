import { postToGitHub, allowGitHub, statusGitHub } from './github-solver.js';
import { linkSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changeConfig, closeBounty, finalizeBounty, loadRecord, planBounty, renderConfig, renderDescribe, renderRules, renderStatus } from '../../../packages/box-bounty/index.js';
import { discoverInstructions, INSTRUCTION_HOSTS, instructionBlock, syncInstructions } from '../../../packages/box-bounty/instructions.js';
import { fixture } from './github-fixture.js';
import { refreshGitHubStatus } from '../../../packages/box-bounty/github.js';
import { postBounty, scanText, settingsFile } from '../../../packages/box-bounty/index.js';
import { git, makeRepo, ROOT, runRoot, write, writeRecordRaw } from './support.js';

const bytes = (repo: string, name: string) => readFileSync(join(repo, name));
const setup = (files: Record<string, string>) => makeRepo({ 'TASK.md': 'Fix the sum.\n', ...files });
const draft = (repo: string) => finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), why: 'stuck', }));
const block = (repo: string, name: string) => /<!-- box-bounty -->[\s\S]*?<!-- \/box-bounty -->/.exec(bytes(repo, name).toString('utf8'))?.[0];

describe('instruction blocks', () => {
  it('round-trips arbitrary outside bytes and uses only four fixed-state changes', () => {
    const prefix = Buffer.from([0xff, 0x00, 0x0d, 0x0a]);
    const suffix = Buffer.from([0x0d, 0x00, 0xfe]);
    const repo = setup({ 'AGENTS.md': 'first\r\n', 'GEMINI.md': 'second\n' });
    writeFileSync(join(repo, 'AGENTS.md'), Buffer.concat([prefix, Buffer.from('<!-- box-bounty -->\r\nstale\n<!-- /box-bounty -->'), suffix]));
    expect(changeConfig(repo, 'set', 'instructions', 'true')).toContain('AGENTS.md');
    const idle = block(repo, 'AGENTS.md');
    expect(idle).toBe(block(repo, 'GEMINI.md'));
    expect(idle).not.toContain('open bounties: none');
    const { id } = draft(repo);
    const open = block(repo, 'AGENTS.md');
    expect(open).toContain('a bounty is open; `box bounty` shows more.');
    expect(open).not.toContain(id);
    expect(open).toBe(block(repo, 'GEMINI.md'));
    const record = loadRecord(repo, id);
    // An unmerged commit is a recorded solution, without running foreign code.
    const tree = git(repo, ['rev-parse', 'HEAD^{tree}']);
    const commit = git(repo, ['commit-tree', tree, '-m', 'outside change']);
    record.attempts = [{ n: 1, commit, at: '2026-10-01T00:00:00.000Z', outcome: 'answered', changed: [], added: [], deleted: [], report: [], conflicts: null }];
    writeRecordRaw(repo, id, JSON.stringify(record));
    syncInstructions(repo);
    expect(block(repo, 'AGENTS.md')).toContain('a bounty has a new solution; `box bounty` shows more.');
    expect(block(repo, 'AGENTS.md')).toBe(block(repo, 'GEMINI.md'));
    statusGitHub(repo);
    expect(block(repo, 'AGENTS.md')).toBe(open);
    expect(statusGitHub(repo)).toContain('seen and not decided');
    closeBounty(repo, id);
    expect(block(repo, 'AGENTS.md')).toBe(idle);
    const final = bytes(repo, 'AGENTS.md');
    expect(final.subarray(0, prefix.length)).toEqual(prefix);
    expect(final.subarray(-suffix.length)).toEqual(suffix);
  });

  it('adds once when one instruction file imports another, preserving all original bytes', () => {
    const repo = setup({ 'AGENTS.md': 'base\r\n', 'CLAUDE.md': '@AGENTS.md\r\nother instruction\r\n' });
    const before = bytes(repo, 'CLAUDE.md');
    expect(changeConfig(repo, 'set', 'instructions', 'true')).toContain('imports');
    expect(block(repo, 'AGENTS.md')).toBeDefined();
    expect(bytes(repo, 'CLAUDE.md')).toEqual(before);
  });

  it.each(['AGENTS.md', '.cursor/rules/plain.mdc', '.github/copilot-instructions.md', 'custom.txt'])('keeps a block in %s when @ text is not a documented import', name => {
    const repo = setup({ [name]: '@GEMINI.md\n', 'GEMINI.md': 'shared\n' });
    if (name === 'custom.txt') changeConfig(repo, 'set', 'instruction-file', name);
    const output = changeConfig(repo, 'set', 'instructions', 'true');
    expect(block(repo, name)).toBeDefined();
    expect(output).not.toContain(`${name}: imports`);
  });

  it.each(['CLAUDE.md', 'GEMINI.md'])('recognizes inline imports in %s and ignores code spans and fences with LF, CRLF or CR', name => {
    const repo = setup({ [name]: 'Read @AGENTS.md for shared instructions.\n', 'AGENTS.md': 'shared\n' });
    const original = bytes(repo, name);
    expect(changeConfig(repo, 'set', 'instructions', 'true')).toContain('imports AGENTS.md');
    expect(bytes(repo, name)).toEqual(original);
    for (const eol of ['\n', '\r\n', '\r']) {
      for (const example of ['`@AGENTS.md`\n', '```markdown\n@AGENTS.md\n```\n', '~~~\n@AGENTS.md\n~~~', '~~~\n@AGENTS.md', '    @AGENTS.md\n']) {
        const raw = example.replaceAll('\n', eol);
        write(repo, name, raw);
        changeConfig(repo, 'set', 'instructions', 'true');
        expect(block(repo, name)).toBeDefined();
        expect(bytes(repo, name).toString().replace(block(repo, name) ?? 'absent', '')).toBe(raw);
      }
    }
  });

  it('recognizes documented escaped spaces and preserves an importer when its leaf is unsafe', () => {
    const repo = setup({ 'CLAUDE.md': 'Use @team\\ guide.txt here.\n', 'team guide.txt': 'shared\n' });
    changeConfig(repo, 'set', 'instruction-file', 'team guide.txt');
    const original = bytes(repo, 'CLAUDE.md');
    changeConfig(repo, 'set', 'instructions', 'true');
    expect(bytes(repo, 'CLAUDE.md')).toEqual(original);
    expect(block(repo, 'team guide.txt')).toBeDefined();
    write(repo, 'CLAUDE.md', `${original.toString()}${block(repo, 'team guide.txt') ?? ''}`);
    const importer = bytes(repo, 'CLAUDE.md');
    write(repo, 'team guide.txt', '<!-- box-bounty -->\nbroken');
    expect(changeConfig(repo, 'set', 'instructions', 'true')).toContain('instruction-markers-damaged');
    expect(bytes(repo, 'CLAUDE.md')).toEqual(importer);
  });

  it('refuses damaged markers for one file and still updates safe files', () => {
    const repo = setup({ 'AGENTS.md': '<!-- box-bounty -->\nbroken\n', 'GEMINI.md': 'safe\n' });
    const before = bytes(repo, 'AGENTS.md');
    const out = changeConfig(repo, 'set', 'instructions', 'true');
    expect(out).toContain('instruction-markers-damaged');
    expect(bytes(repo, 'AGENTS.md')).toEqual(before);
    expect(block(repo, 'GEMINI.md')).toBeDefined();
  });

  it('finds only existing files, notices a new file once and waits for config', () => {
    const repo = setup({ 'AGENTS.md': 'base\n' });
    changeConfig(repo, 'set', 'instructions', 'true');
    write(repo, 'GEMINI.md', 'new\n');
    expect(renderConfig(repo)).toContain('GEMINI.md');
    expect(statusGitHub(repo)).toContain('box bounty config set instructions true');
    expect(statusGitHub(repo)).not.toContain('lacks the block');
    expect(bytes(repo, 'GEMINI.md').toString()).toBe('new\n');
    changeConfig(repo, 'set', 'instructions', 'true');
    expect(block(repo, 'GEMINI.md')).toBeDefined();
    expect(discoverInstructions(repo).map(file => file.path)).toHaveLength(2);
  });

  it('supports an arbitrary existing file but refuses outside, missing and linked choices unchanged', () => {
    const repo = setup({ 'team.txt': 'our instructions\n', 'AGENTS.md': 'base\n' });
    changeConfig(repo, 'set', 'instruction-file', 'team.txt');
    changeConfig(repo, 'set', 'instructions', 'true');
    expect(block(repo, 'team.txt')).toBeDefined();
    const settingsBefore = readFileSync(settingsFile());
    for (const path of ['../elsewhere.md', 'missing.md']) expect(() => changeConfig(repo, 'set', 'instruction-file', path)).toThrow();
    write(repo, 'broken.txt', '<!-- box-bounty --\nbroken');
    expect(() => changeConfig(repo, 'set', 'instruction-file', 'broken.txt')).toThrow('instruction-markers-damaged');
    const target = join(runRoot('bt8b-link'), 'real');
    write(target, 'team.txt', 'outside\n');
    symlinkSync(target, join(repo, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => changeConfig(repo, 'set', 'instruction-file', 'linked/team.txt')).toThrow('instruction-file-link');
    expect(readFileSync(join(target, 'team.txt'), 'utf8')).toBe('outside\n');
    expect(readFileSync(settingsFile())).toEqual(settingsBefore);
  });

  it('refuses a hard-linked instruction file without changing either name', () => {
    const repo = setup({ 'team.txt': 'linked bytes\n' });
    linkSync(join(repo, 'team.txt'), join(repo, 'AGENTS.md'));
    const before = bytes(repo, 'team.txt');
    expect(changeConfig(repo, 'set', 'instructions', 'true')).toContain('instruction-file-link');
    expect(bytes(repo, 'AGENTS.md')).toEqual(before);
    expect(bytes(repo, 'team.txt')).toEqual(before);
  });

  it('refuses instruction configuration through a linked settings file before any effects', () => {
    const repo = setup({ 'AGENTS.md': 'owner instructions\n' });
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
    linkSync(settingsFile(), join(repo, 'owner-settings.json'));
    const before = readFileSync(settingsFile());
    expect(() => changeConfig(repo, 'set', 'instructions', 'true')).toThrow('instruction-settings-link');
    expect(readFileSync(settingsFile())).toEqual(before);
    expect(bytes(repo, 'owner-settings.json')).toEqual(before);
    expect(bytes(repo, 'AGENTS.md').toString()).toBe('owner instructions\n');
  });

  it('refuses duplicate or damaged marker pairs and cyclic imports', () => {
    const repo = setup({ 'CLAUDE.md': '@GEMINI.md\n', 'GEMINI.md': '@CLAUDE.md\n' });
    expect(changeConfig(repo, 'set', 'instructions', 'true')).toContain('instruction-import-cycle');
    expect(bytes(repo, 'CLAUDE.md').toString()).toBe('@GEMINI.md\n');
    const broken = '<!-- box-bounty --\n<!-- /box-bounty --\n';
    write(repo, 'AGENTS.md', broken);
    expect(changeConfig(repo, 'set', 'instructions', 'true')).toContain('instruction-markers-damaged');
    expect(bytes(repo, 'AGENTS.md').toString()).toBe(broken);
  });

  it('keeps other blocks, front matter and mixed endings outside its block', () => {
    const raw = '---\r\nalwaysApply: true\n---\r\n<!-- other -->\nkeep\r<!-- /other -->\r\n';
    const repo = setup({ '.cursor/rules/tool.mdc': raw });
    changeConfig(repo, 'set', 'instructions', 'true');
    expect(bytes(repo, '.cursor/rules/tool.mdc').subarray(0, Buffer.byteLength(raw))).toEqual(Buffer.from(raw));
    const maintained = block(repo, '.cursor/rules/tool.mdc');
    expect(bytes(repo, '.cursor/rules/tool.mdc').toString().replace(maintained ?? 'absent', '')).toBe(raw);
  });

  it('first installation adds no bytes outside the block to a file with no final newline', () => {
    const raw = 'owner\r\nother\nodd\rfinal';
    const repo = setup({ 'AGENTS.md': raw });
    changeConfig(repo, 'set', 'instructions', 'true');
    const maintained = block(repo, 'AGENTS.md');
    expect(maintained).toBeDefined();
    expect(bytes(repo, 'AGENTS.md').toString().replace(maintained ?? 'absent', '')).toBe(raw);
  });
});

it('finding a GitHub solution changes the block to new; only showing it clears new', () => fixture(({ repo, id, pr }) => {
  write(repo, 'AGENTS.md', 'base\n');
  write(repo, 'GEMINI.md', 'second\n');
  changeConfig(repo, 'set', 'instructions', 'true');
  postBounty(repo, id, 'github');
  pr('solver');
  refreshGitHubStatus(repo, loadRecord(repo, id));
  expect(instructionBlock(repo)).toContain('a bounty has a new solution');
  expect(block(repo, 'AGENTS.md')).toBe(block(repo, 'GEMINI.md'));
  statusGitHub(repo);
  expect(instructionBlock(repo)).toContain('a bounty is open');
  expect(instructionBlock(repo)).not.toContain('new solution');
}));

it('host names occur in one product registry only', () => {
  const sources = readdirSync(join(ROOT, 'packages', 'box-bounty')).filter(name => name.endsWith('.ts') && name !== 'instructions.ts').map(name => readFileSync(join(ROOT, 'packages', 'box-bounty', name), 'utf8'));
  sources.push(readFileSync(join(ROOT, 'packages', 'box-cli', 'src', 'cli.ts'), 'utf8'));
  for (const host of INSTRUCTION_HOSTS) for (const source of sources) expect(source).not.toContain(host.host);
});

it('the tool scanner finds no secret-shaped literal in the added candidate diff', () => {
  for (const mode of [['master...HEAD'], [], ['--cached']]) {
    const result = spawnSync('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/').replace(/\/+$/, '')}`, 'diff', ...mode, '--no-ext-diff', '--no-textconv', '--unified=0'], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const added = result.stdout.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
    expect(scanText('BT8b-added-diff', added).map(hit => `${hit.line}: ${hit.rule}`)).toEqual([]);
  }
});

it('retires malformed limits without reading them and reports migration once', () => {
  const repo = setup({ '.box/limits.json': '{ broken\n' });
  const before = bytes(repo, '.box/limits.json');
  expect(renderDescribe(repo)).toContain('no bounty history yet');
  expect(renderDescribe(repo)).not.toContain('cost: not stated');
  expect(statusGitHub(repo)).toContain('no longer read');
  expect(statusGitHub(repo)).not.toContain('no longer read');
  const { id } = draft(repo);
  expect(() => postToGitHub(repo, id)).toThrow('waiting for the owner');
  expect(bytes(repo, '.box/limits.json')).toEqual(before);
  expect(renderRules(null)).not.toContain('open bounties: none');
});

it('describe reports observed waits and current terminal outcomes, with invalid dates unknown', () => {
  const repo = setup({});
  const { id } = draft(repo);
  const record = loadRecord(repo, id);
  record.stage = 'undone';
  record.events = [
    ...record.events,
    { stage: 'posted', at: '2026-10-01T00:00:00.000Z' },
    { stage: 'applied', at: '2026-10-02T00:00:00.000Z' },
    { stage: 'undone', at: '2026-10-03T00:00:00.000Z' }
  ];
  record.attempts = [{ n: 1, commit: git(repo, ['rev-parse', 'HEAD']), at: '2026-10-02T00:00:00.000Z', outcome: 'answered', changed: [], added: [], deleted: [], report: [], conflicts: null }];
  writeRecordRaw(repo, id, JSON.stringify(record));
  expect(renderDescribe(repo)).toContain('24.0 to 24.0 hours');
  expect(renderDescribe(repo)).toContain('0 of 1 ended posted bounties had a solution merged');
  record.events = record.events.map(event => event.stage === 'posted' ? { ...event, at: 'unusable' } : event);
  writeRecordRaw(repo, id, JSON.stringify(record));
  expect(renderDescribe(repo)).toContain('no solution wait recorded yet');
});
