// BT28 — bounded agent memory. Five additions that keep what an agent
// sees constant at any N: the ended-overview cap, the hook-start/OPEN
// cap, the part-of relation field, the tracked-records notice, and
// purpose search (find). Every test names its behaviour and pins the
// small-N-preservation guarantee where the wave demands it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_DIST, git, makeRepo, write } from './support.js';

const box = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

// A record written straight to disk — no CLI, no Git. `at` sorts the
// ended overview and find's ended half newest-first.
const seed = (repo: string, n: number, stage: string, fields: Record<string, unknown> = {}) => {
  const id = `bt-${String(n).padStart(12, '0')}`;
  const at = `2025-06-${String(1 + n).padStart(2, '0')}T00:00:00.000Z`;
  const dir = join(repo, '.box', 'bounties');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({
    kind: 'box-bounty-record',
    id,
    stage,
    title: `seed ${n}`,
    createdAt: at,
    events: [{ stage, at }],
    ...fields
  }, null, 2) + '\n');
  return id;
};

// A whole searchable task blob, the shape asRecord accepts.
const taskContent = (text: string) => ({ task: { file: 'TASK.md', text }, note: null, tool: 'box-bounty' });

const create = (repo: string, extra: string[] = []) => {
  write(repo, 'TASK.md', '# task\n');
  return box(repo, ['create', '--task', 'TASK.md', '--why', 'because', ...extra]);
};

describe('1. the ended overview caps at five, newest first', () => {
  it('compact status shows five of seven ended with the total', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    for (let i = 1; i <= 7; i++) seed(repo, i, 'rejected');
    const run = box(repo, ['status']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('ended (7 total, 5 most recent):');
    expect(run.stdout).toContain('all 7: box bounty status --full');
    // Newest five are records 3..7 — records 1 and 2 are off the line.
    expect(run.stdout).toContain('seed 7');
    expect(run.stdout).not.toContain('seed 1');
    expect(run.stdout).not.toContain('seed 2');
  });

  it('--full lists every ended record the way it always did', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    for (let i = 1; i <= 7; i++) seed(repo, i, 'rejected');
    const run = box(repo, ['status', '--full']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('ended:');
    for (let i = 1; i <= 7; i++) expect(run.stdout).toContain(`seed ${i}`);
  });

  it('five or fewer ended records keeps the old ended: line', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    for (let i = 1; i <= 3; i++) seed(repo, i, 'rejected');
    const run = box(repo, ['status']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('ended:');
    expect(run.stdout).not.toContain('most recent');
  });
});

describe('2. hook start and OPEN cap at ten open records', () => {
  it('hook start --explain summarizes ten and counts the rest', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    for (let i = 1; i <= 12; i++) seed(repo, i, 'drafted');
    const run = box(repo, ['hook', 'start', '--explain']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('12 open bounties');
    expect(run.stdout).toContain('and 2 more');
    expect(run.stdout).toContain('see: box bounty status');
    expect(run.stdout).not.toContain('seed 12');
  });

  it('a record write rewrites OPEN with the same cap', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    for (let i = 1; i <= 11; i++) seed(repo, i, 'drafted');
    const run = create(repo);
    expect(run.status).toBe(0);
    const open = readFileSync(join(repo, '.box', 'bounties', 'OPEN'), 'utf8');
    expect(open).toContain('and 2 more (see: box bounty status)');
    expect(open).not.toContain('seed 11');
  });

  it('ten open records keeps the old line byte-identical', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    for (let i = 1; i <= 9; i++) seed(repo, i, 'drafted');
    const run = create(repo);
    expect(run.status).toBe(0);
    const open = readFileSync(join(repo, '.box', 'bounties', 'OPEN'), 'utf8');
    expect(open).not.toContain('more (see: box bounty status)');
    expect(open).toContain('seed 9');
  });
});

describe('3. --part-of records the bounty relation', () => {
  it('create --part-of stores it and status shows it', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    const run = create(repo, ['--part-of', 'parser-epic']);
    expect(run.status).toBe(0);
    const record = JSON.parse(readFileSync(join(repo, '.box', 'bounties', readdirSync(join(repo, '.box', 'bounties')).find(f => f.endsWith('.json'))!), 'utf8'));
    expect(record.partOf).toBe('parser-epic');
    const status = box(repo, ['status']);
    expect(status.stdout).toContain('(part of: parser-epic)');
    const statusJson = JSON.parse(box(repo, ['status', '--json']).stdout);
    expect(statusJson.bounties[0].job).toBe('parser-epic');
  });

  it('a blank --part-of is a refusal, never a stored record', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    const run = create(repo, ['--part-of', '']);
    expect(run.status).toBe(3);
    expect(run.stderr + run.stdout).toContain('missing-part-of');
    const dir = join(repo, '.box', 'bounties');
    expect(existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : []).toEqual([]);
  });

  it('a tampered partOf fails the record boundary', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    const run = create(repo, ['--part-of', 'epic']);
    expect(run.status).toBe(0);
    const file = join(repo, '.box', 'bounties', readdirSync(join(repo, '.box', 'bounties')).find(f => f.endsWith('.json'))!);
    const record = JSON.parse(readFileSync(file, 'utf8'));
    record.partOf = 'first line\nsecond line';
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    const status = box(repo, ['status']);
    expect(status.stdout).toContain('not a readable record');
  });

  it('--job stays retired', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    write(repo, 'TASK.md', '# task\n');
    const run = box(repo, ['create', '--task', 'TASK.md', '--why', 'x', '--job', 'a/b.md']);
    expect(run.status).toBe(3);
    expect(run.stderr + run.stdout).toContain('create-option-retired');
  });
});

describe('4. the tracked-records notice', () => {
  it('untracked records stay silent in compact status and bare config', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    seed(repo, 1, 'drafted');
    expect(box(repo, ['status']).stdout).not.toContain('records:');
    expect(box(repo, ['config']).stdout).not.toContain('records:');
  });

  it('untracked records say so under --full', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    seed(repo, 1, 'drafted');
    expect(box(repo, ['status', '--full']).stdout).toContain('records: .box/bounties/ is not tracked in Git (local to this checkout)');
    expect(box(repo, ['config', '--full']).stdout).toContain('records: .box/bounties/ is not tracked in Git (local to this checkout)');
  });

  it('tracked records warn on every form and in --json', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    seed(repo, 1, 'drafted');
    git(repo, ['add', '.box/bounties']);
    const warning = 'records: 1 file(s) in .box/bounties/ are tracked in Git';
    expect(box(repo, ['status']).stdout).toContain(warning);
    expect(box(repo, ['status', '--full']).stdout).toContain(warning);
    expect(box(repo, ['config']).stdout).toContain(warning);
    expect(box(repo, ['config', '--full']).stdout).toContain(warning);
    const statusJson = JSON.parse(box(repo, ['status', '--json']).stdout);
    expect(statusJson.records).toEqual({ tracked: true, trackedFiles: 1 });
    const configJson = JSON.parse(box(repo, ['config', '--json']).stdout);
    expect(configJson.records).toEqual({ tracked: true, trackedFiles: 1 });
  });

  it('status --json reports tracked:false when nothing is staged', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    seed(repo, 1, 'drafted');
    const statusJson = JSON.parse(box(repo, ['status', '--json']).stdout);
    expect(statusJson.records).toEqual({ tracked: false, trackedFiles: 0 });
  });
});

describe('5. find searches purpose across readable records', () => {
  it('finds open records first, then ended newest-first, naming matched fields', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    seed(repo, 1, 'rejected', { why: 'hunt the parser bug', title: 'ended old' });
    seed(repo, 2, 'rejected', { content: taskContent('fix the parser crash'), title: 'ended new' });
    seed(repo, 3, 'drafted', { partOf: 'parser-epic', title: 'open record' });
    const run = box(repo, ['find', 'parser']);
    expect(run.status).toBe(0);
    const lines = run.stdout.split('\n');
    const first = lines.findIndex(l => l.trimStart().startsWith('bt-'));
    expect(lines[first]).toContain('open record');
    expect(lines[first]).toContain('matched: part-of');
    expect(lines[first + 1]).toContain('ended new');
    expect(lines[first + 1]).toContain('matched: task');
    expect(lines[first + 2]).toContain('ended old');
    expect(lines[first + 2]).toContain('matched: why');
    expect(run.stdout).toContain('3 matches');
    expect(run.stdout).toContain('next:');
  });

  it('a missing or blank query refuses with missing-query', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    for (const args of [['find'], ['find', '   ']]) {
      const run = box(repo, args);
      expect(run.status).toBe(3);
      expect(run.stderr + run.stdout).toContain('missing-query');
    }
  });

  it('find --json returns the box-bounty/find@1 document', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    seed(repo, 1, 'drafted', { why: 'parser work', title: 'hit' });
    const run = box(repo, ['find', 'parser', '--json']);
    expect(run.status).toBe(0);
    const doc = JSON.parse(run.stdout);
    expect(doc.schema).toBe('box-bounty/find@1');
    expect(doc.query).toBe('parser');
    expect(doc.total).toBe(1);
    expect(doc.matches[0].id).toBe('bt-000000000001');
    expect(doc.matches[0].matched).toEqual(['why']);
  });

  it('no match says so instead of listing nothing unexplained', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    seed(repo, 1, 'drafted');
    const run = box(repo, ['find', 'nonexistent']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('no bounty record matches');
  });

  it('the list caps at twenty matches and reports the true total', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    for (let i = 1; i <= 25; i++) seed(repo, i, 'drafted', { why: 'parser work' });
    const run = box(repo, ['find', 'parser']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('25 matches, the first 20');
    expect(run.stdout).toContain('5 more match(es)');
    expect(run.stdout.split('\n').filter(l => l.trimStart().startsWith('bt-')).length).toBe(20);
  });
});

// BT29 — posted records stay bounded too. Mix C in kitchen/memory/measure.mjs
// measured compact status at ~100,000 characters for 995 ended posted records:
// one `compact status uses the cached last observation` line per ended record.
// The line is deleted; the fact is said once in help.
describe('6. ended posted records keep the overview under the bar', () => {
  const sha = (n: number) => n.toString(16).padStart(8, '0').repeat(5).slice(0, 40);
  // The github block `post` writes for a history post, plus one collected
  // attempt — the shape Mix C measures.
  const posted = (id: string, n: number, open: boolean) => ({
    github: {
      repository: 'owner/project', account: 'owner', branch: `box-bounty/${id}`,
      commit: sha(n + 1), title: `[box bounty ${id}] seed ${n}`, body: `# Bounty\n\n<!-- box-bounty:${id} -->\n`,
      issue: { number: n, url: `https://github.com/owner/project/issues/${n}` },
      state: open ? 'posted' : 'closed', kind: 'history', base: sha(n + 0x10000),
      pushed: [{ sha: sha(n + 1), subject: `box bounty ${id}: work in progress` }],
      wipCommit: null, wip: null,
      outside: { at: `2025-07-01T00:00:00.000Z`, issueState: open ? 'open' : 'closed', answers: `GitHub answers for ${id} against box-bounty/${id}:\n  none open; wait for one or close the bounty` },
      formatRead: 'matches-record', formatReadAt: '2025-07-01T00:00:00.000Z', pending: null
    },
    attempts: [{ n: 1, pullRequest: n, at: `2025-07-01T00:00:00.000Z`, seenAt: `2025-07-01T00:00:00.000Z`, author: 'solver-a', commit: sha(n + 0x20000), changed: ['app.txt'], added: [], deleted: [], outcome: 'answered', conflicts: null, report: [`report — attempt 1 for ${id}`] }]
  });

  it('62 posted records: compact status and the overview stay under 4,500 characters and help says the cached-vs-fresh fact once', () => {
    const repo = makeRepo({ 'app.txt': 'seed bytes\n' });
    // 60 ended posted + 2 open posted — past BT28's five-ended cap.
    for (let i = 1; i <= 60; i++) seed(repo, i, i % 2 === 0 ? 'applied' : 'rejected', posted(`bt-${String(i).padStart(12, '0')}`, i, false));
    for (let i = 61; i <= 62; i++) seed(repo, i, 'posted', posted(`bt-${String(i).padStart(12, '0')}`, i, true));
    // The bar: K25 measured ~4,000 characters for compact status in the
    // ended steady state; 4,500 gives headroom for the refresh-failure
    // lines the two open records add when gh is unreachable in tests.
    const BAR = 4500;
    const status = box(repo, ['status']);
    expect(status.status, status.stderr).toBe(0);
    expect(status.stdout.length).toBeLessThan(BAR);
    const overview = box(repo, []);
    expect(overview.status, overview.stderr).toBe(0);
    expect(overview.stdout.length).toBeLessThan(BAR);
    for (const output of [status.stdout, overview.stdout]) {
      expect(output).not.toContain('compact status uses the cached last observation');
      expect(output).toContain('ended (60 total, 5 most recent):');
    }
    const help = box(repo, ['help']);
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout.split('cached GitHub observation')).toHaveLength(2);
    expect(help.stdout).toContain('--full reads it fresh');
  });
});
