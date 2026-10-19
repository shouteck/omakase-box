// BT17 — the output-budget guard. Every command's NORMAL output on the
// standard journey is held to a stated budget in lines and characters: one
// line saying what happened, only facts needing attention now, one `next:`
// line. Detail lives behind --full; explanations are said once and kept in
// help and describe. Raising a budget is a reviewed change with a reason.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, sharedFixture } from './github-fixture.js';
import { CLI_DIST, write } from './support.js';

const box = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

const visible = (text: string) => text.split('\n').filter(line => line.trim() !== '');

// One budget per command, measured on the wave's standard journey and given
// headroom for path lengths and timestamps — never for another paragraph.
interface Budget { readonly lines: number; readonly characters: number }
const BUDGETS: Record<string, Budget> = {
  'create':            { lines: 6,  characters: 700 },
  'status (drafted)':  { lines: 14, characters: 1000 },
  'post (held)':       { lines: 20, characters: 1500 },
  'allow':             { lines: 18, characters: 2200 },
  'bounty (overview)': { lines: 22, characters: 2000 },
  'status (posted)':   { lines: 24, characters: 2200 },
  'status --comments': { lines: 18, characters: 1800 },
  'look':              { lines: 16, characters: 1200 },
  'apply':             { lines: 20, characters: 1800 },
  'status (ended)':    { lines: 22, characters: 1600 },
  'close':             { lines: 5,  characters: 400 },
  'config':            { lines: 18, characters: 2400 },
  'deny':              { lines: 6,  characters: 600 },
  'help':              { lines: 32, characters: 4200 },
  // BT37: the not-worth-it list gained the "a solver could not do it either"
  // clause — measured 2,085 characters on the standard journey (+85).
  'describe':          { lines: 28, characters: 2085 },
  'describe --rules':  { lines: 10, characters: 600 },
};

function budget(label: string, run: ReturnType<typeof box>): string {
  const text = `${run.stdout ?? ''}${run.status !== 0 ? run.stderr ?? '' : ''}`;
  const limit = BUDGETS[label];
  expect(limit, `no BT17 budget named ${label}`).toBeDefined();
  expect(run.status, `${label} exited ${run.status}: ${text}`).toBe(0);
  const lines = visible(text).length;
  expect(lines, `${label} printed ${lines} non-empty lines over its budget of ${limit!.lines}:\n${text}`).toBeLessThanOrEqual(limit!.lines);
  expect(text.length, `${label} printed ${text.length} characters over its budget of ${limit!.characters}:\n${text}`).toBeLessThanOrEqual(limit!.characters);
  return text;
}

describe('every normal output on the journey stays inside its budget', () => {
  // One world for the whole journey, split into consecutive steps (K24):
  // the single budget `it` ran past half its limit. Same budgets, same
  // order — each leg its own `it` against the shared world.
  const journey = sharedFixture();
  const { repo, id, scratch, pr } = journey;

  it('the posting and collecting journey, command by command — the draft, the held post and the owner answer', () => journey.run(() => {
    // Nothing allowed yet: draft, read the wait, then the owner answers and
    // `allow` releases the held post — the posting journey in one world.
    writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
    const created = budget('create', box(repo, ['create', '--task', 'TASK.md', '--why', 'beyond this agent']));
    // The contract: the first line says what happened and names the bounty.
    expect(visible(created)[0]).toMatch(/^bt-[a-f\d]{12} — drafted/);
    expect(created).toContain('next: box bounty post');
    budget('status (drafted)', box(repo, ['status']));
    const held = budget('post (held)', box(repo, ['post', id]));
    // The owner's block still relays every fact (BT13): permission, scope,
    // merge, money and the question.
    expect(held).toContain('for the owner');
    expect(held).toContain('Do you allow this?');
    const allowed = budget('allow', box(repo, ['allow', 'owner/project']));
    expect(allowed).toContain('allowed: owner/project');
    expect(allowed).toContain('the waiting bounty went out');
  }));

  it('the posting and collecting journey, command by command — the pull request, look and apply', () => journey.run(() => {
    // The collecting journey: one pull request waiting.
    pr('solver-a');
    budget('bounty (overview)', box(repo, []));
    const status = budget('status (posted)', box(repo, ['status']));
    expect(status).toContain(id);
    budget('status --comments', box(repo, ['status', id, '--comments']));
    const look = budget('look', box(repo, ['look', id, '1']));
    // The stranger-text label is never shortened away.
    expect(look).toContain('solver change |');
    const applied = budget('apply', box(repo, ['apply', id, '1']));
    expect(applied).toContain('applied');
    budget('status (ended)', box(repo, ['status']));
  }));

  it('the posting and collecting journey, command by command — the second draft, close and the reference commands', () => journey.run(() => {
    // The second draft ends with a reason — `close` stays at two lines.
    write(repo, 'TASK2.md', 'Something else.\n');
    const second = box(repo, ['create', '--task', 'TASK2.md', '--why', 'a second handoff']);
    const id2 = /bt-[a-f\d]{12}/.exec(second.stdout)?.[0];
    expect(id2, `second create named no bounty: ${second.stdout}${second.stderr}`).toBeDefined();
    budget('close', box(repo, ['close', id2!, '--reason', 'no longer needed']));
    budget('config', box(repo, ['config']));
    budget('deny', box(repo, ['deny', 'owner/project']));
    budget('help', box(repo, ['help']));
    budget('describe', box(repo, ['describe']));
    budget('describe --rules', box(repo, ['describe', '--rules']));
  }));

  it('the "said once" record keeps a standing explanation off the second call', () => fixture(({ repo, scratch }) => {
    // A reward-bearing allow states the promise's explanation once; the next
    // status carries the fact only.
    writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
    box(repo, ['allow', 'owner/project', '--reward', '10', '--reward-limit', '30']);
    const first = box(repo, ['status']);
    const second = box(repo, ['status']);
    expect(first.stdout).toContain('a promise in the owner\'s name, paid by hand');
    expect(second.stdout).not.toContain('a promise in the owner\'s name');
    expect(second.stdout).toContain('states $10');
  }));
});
