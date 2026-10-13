// The owner-facing command group (BT8): `box bounty owner <…>`, plainly
// named, never offered to an agent by the description. Only these commands
// write or widen the owner's decision; nothing on the agent's journey does.
//
//   owner setup    where things stand + the exact command for each step
//   owner allow    allow the tool — prints what it allows; nothing changes
//                  unless the command carries an explicit --yes
//   owner ask      ask me each time — every post and every outside close
//                  waits for `owner answer <id>`
//   owner off/on   turn the permission off (the answer stays on file marked
//                  off) and back on
//   owner answer   answer the one thing waiting for the owner — posts the
//                  held bounty, or finishes the held outside close
//   owner summary  what was done since a given time, from the record

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { BountyRefused } from './errors.js';
import { gitOutcome, gitProgram } from './git.js';
import { resolveProgram } from '../box-package/commands.js';
import { listRecords, loadRecord, postBounty } from './record.js';
import { syncGitHubDecision } from './github.js';
import { loadSettings, projectKey, readDecision, settingsFile, writeDecision } from './settings.js';
import type { DecisionRead } from './settings.js';

// What allowing means, in plain words — printed before anything is written.
// `owner allow` without --yes prints exactly this and changes nothing.
const ALLOW_DISCLOSURE: readonly string[] = [
  'allowing this tool means:',
  '- bounties are posted publicly under your GitHub account — anyone can read the issue and the branch.',
  '- a solution an agent chooses is merged into your code on the agent\'s judgement — the tool runs nothing from it, but your next build will.',
  '- the tool closes the bounty issue when it finds a solution merged.',
  '- once rewards exist, money is promised within what you set.',
  'it stops accidents and makes every change visible with a time; it is not a lock —',
  'an agent that sets out to edit files it can reach could post the same with its own Git.'
];

const levelOf = (all: boolean): 'project' | 'default' => all ? 'default' : 'project';

const where = (read: DecisionRead): string =>
  read.decision === null ? 'nothing written — never read as allowed'
    : `${read.decision} for ${read.level === 'project' ? 'this project' : 'all projects'} (changed ${read.at})`;

// Facts, never a failure: a missing or unsigned program is a step named, not
// a refusal — setup is where the owner learns what is left.
function programFacts(): { git: string; gh: string } {
  let git = 'missing — Git 2.40 or later is required (https://git-scm.com)';
  try {
    gitProgram();
    const version = gitOutcome('.', ['version']);
    git = version.status === 0 ? version.stdout.trim() : 'present but did not answer "git version"';
  } catch { /* missing */ }
  let gh = 'missing — needed for GitHub posting, gh 2.0 or later signed in (https://cli.github.com)';
  try {
    const program = resolveProgram('gh');
    const probe = spawnSync(program.path, ['version'], { encoding: 'utf8', windowsHide: true });
    const found = /gh version (\d+\.\d+\.\d+)/.exec(probe.stdout ?? '');
    const auth = spawnSync(program.path, ['auth', 'status', '--hostname', 'github.com'], { encoding: 'utf8', windowsHide: true });
    gh = `${found !== null ? `gh ${found[1]}` : 'present'}${auth.status === 0 ? ', signed in' : ', NOT signed in — sign in with your own gh: gh auth login'}`;
  } catch { /* missing */ }
  return { git, gh };
}

export function ownerSetup(repoRoot: string): string {
  const settings = loadSettings();
  const read = readDecision(repoRoot);
  const file = settingsFile();
  const { git, gh } = programFacts();
  const lines: string[] = [
    `the owner's settings: ${file} — ${existsSync(file) ? 'written' : 'nothing written yet'}`,
    `  this project (${projectKey(repoRoot)}): ${settings.projects[projectKey(repoRoot)] === undefined ? 'nothing written' : `${settings.projects[projectKey(repoRoot)]!.bounty} (changed ${settings.projects[projectKey(repoRoot)]!.at})`}`,
    `  all projects (default): ${settings.default === undefined ? 'nothing written' : `${settings.default.bounty} (changed ${settings.default.at})`}`,
    `  effective here: ${where(read)}`,
    `  git: ${git}`,
    `  gh: ${gh}`,
    '',
    'each remaining step is one command:'
  ];
  if (read.decision !== 'allowed') {
    lines.push('  allow the tool for this project only: box bounty owner allow --project --yes');
    lines.push('  allow it for all your projects:       box bounty owner allow --all --yes');
    lines.push('  or be asked each time:                box bounty owner ask --project');
  } else {
    lines.push('  be asked each time instead:           box bounty owner ask --project');
    lines.push('  turn the permission off:              box bounty owner off --project');
  }
  lines.push('  see what was done:                    box bounty owner summary');
  lines.push('  answer a waiting bounty:              box bounty owner answer <id>');
  return lines.join('\n');
}

export function ownerAllow(repoRoot: string, all: boolean, yes: boolean): string {
  const lines: string[] = [...ALLOW_DISCLOSURE];
  if (!yes) {
    lines.push('', 'nothing was written — it changes nothing unless the command carries an explicit yes:', '  box bounty owner allow --project --yes   (this project)', '  box bounty owner allow --all --yes       (all your projects)');
    return lines.join('\n');
  }
  const level = levelOf(all);
  const written = writeDecision(repoRoot, level, 'allowed');
  lines.push('', `allowed — written to ${written.path} at ${written.at} for ${level === 'project' ? `this project (${written.key})` : 'all projects'}.`);
  // A bounty that was waiting only for the decision goes out now — the
  // waiting state said the owner answers once. A bounty held by the
  // pre-publish scan or a named untracked file keeps waiting: those are the
  // owner's per-bounty call, answered with `owner answer <id>`.
  for (const entry of listRecords(repoRoot)) {
    const record = entry.record;
    if (record === null || record.stage !== 'waiting' || record.waiting?.for !== 'post' || record.waiting.to === undefined) continue;
    if (record.waiting.reason === 'secrets' || record.waiting.reason === 'untracked-file') {
      lines.push(`${record.id} — still waits: held by the pre-publish check, not the decision — answer it with box bounty owner answer ${record.id}`);
      continue;
    }
    try {
      const posted = postBounty(repoRoot, record.id, record.waiting.to, { ...(record.waiting.choice !== undefined ? { choice: record.waiting.choice } : {}) });
      lines.push(`${record.id} — the waiting bounty went out: ${posted.destination}`);
    } catch (error) {
      lines.push(`${record.id} — still waiting: ${error instanceof BountyRefused ? `${error.reason} — ${error.message}` : error instanceof Error ? error.message : String(error)}`);
    }
  }
  return lines.join('\n');
}

export function ownerAsk(repoRoot: string, all: boolean): string {
  const level = levelOf(all);
  const written = writeDecision(repoRoot, level, 'ask');
  return `ask — written to ${written.path} at ${written.at} for ${level === 'project' ? 'this project' : 'all projects'}.\nEach post and each outside close waits for you: the agent is told only that you decide. You answer one at a time with box bounty owner answer <id>.`;
}

export function ownerOff(repoRoot: string, all: boolean): string {
  const level = levelOf(all);
  const written = writeDecision(repoRoot, level, 'off');
  return `off — written to ${written.path} at ${written.at} for ${level === 'project' ? 'this project' : 'all projects'}.\nThe answer stays on file marked off; the tool asks each time, as if nothing were written. Back on: box bounty owner on ${all ? '--all' : '--project'} --yes.`;
}

// Turning it back on is allowing — same disclosure, same explicit yes.
export function ownerOn(repoRoot: string, all: boolean, yes: boolean): string {
  return ownerAllow(repoRoot, all, yes);
}

// The one command that answers a waiting state. It performs the held action
// — posts the held bounty or finishes the held outside close — and writes no
// standing decision. Answering when nothing is waiting is a named refusal.
export function ownerAnswer(repoRoot: string, id: string): string {
  const record = loadRecord(repoRoot, id);
  const waiting = record.waiting;
  if (waiting !== undefined && waiting.for === 'post' && record.stage === 'waiting') {
    const lines: string[] = [];
    if (waiting.hits !== undefined && waiting.hits.length > 0) {
      lines.push(`the pre-publish scan is holding ${waiting.hits.length} hit(s):`);
      for (const hit of waiting.hits) lines.push(`  ${hit.path}:${hit.line} — ${hit.rule}`);
      lines.push('answering posts it anyway, once — it allows nothing else and changes no standing rule.');
    }
    if (waiting.to === undefined) throw new BountyRefused('record-corrupt', `${id} waits for a post but names no destination — open the record by hand`);
    const posted = postBounty(repoRoot, id, waiting.to, { answered: true, ...(waiting.choice !== undefined ? { choice: waiting.choice } : {}) });
    lines.push(`${posted.record.id} — answered once — posted to ${posted.destination}`);
    return lines.join('\n');
  }
  if (waiting !== undefined && waiting.for === 'close' || record.github?.pending?.startsWith('waiting-owner:') === true) {
    syncGitHubDecision(repoRoot, record, { answered: true });
    const pending = record.github?.pending;
    if (pending !== null && pending !== undefined) {
      throw new BountyRefused('github-decision-pending', `${id} — the outside close could not finish: ${pending}`);
    }
    return `${id} — answered once — the tool commented, closed the issue and removed the bounty branch`;
  }
  throw new BountyRefused('owner-answer-not-waiting', `bounty ${id} is not waiting for an answer — nothing is held for the owner; box bounty status ${id} shows where it stands`);
}

// Facts from the record, since a given time: bounties posted, solutions
// merged, bounties closed with none, anything waiting. Default: all of it.
export function ownerSummary(repoRoot: string, since?: string): string {
  let from = '';
  if (since !== undefined) {
    if (!Number.isFinite(Date.parse(since))) throw new BountyRefused('summary-time-invalid', `--since ${since} is not a readable time — pass an ISO time like 2026-10-01 or 2026-10-01T00:00:00Z`);
    from = new Date(since).toISOString();
  }
  const posted: string[] = [];
  const merged: string[] = [];
  const closedNone: string[] = [];
  const waiting: string[] = [];
  for (const entry of listRecords(repoRoot)) {
    const record = entry.record;
    if (record === null) continue;
    for (const event of record.events) {
      if (event.at < from) continue;
      if (event.stage === 'posted') posted.push(`${record.id} at ${event.at} (${event.destination ?? 'unspecified destination'})`);
      else if (event.stage === 'applied') merged.push(`${record.id} at ${event.at} (merge ${event.merge ?? 'unnamed'}${event.command === 'merged' ? ', recognised from a merge made outside the tool' : ''})`);
      else if (event.stage === 'rejected' || event.stage === 'withdrawn' || event.stage === 'expired' || event.stage === 'undone') closedNone.push(`${record.id} ${event.stage} at ${event.at}`);
    }
    if (record.waiting !== undefined) waiting.push(`${record.id} — ${record.waiting.for === 'post' ? 'a post waits for you' : 'an outside close waits for you'} (${record.waiting.reason}, since ${record.waiting.at})`);
  }
  const line = (label: string, entries: readonly string[]): string =>
    `  ${label}: ${entries.length}${entries.length === 0 ? '' : ` — ${entries.join('; ')}`}`;
  return [
    `what was done since ${since === undefined ? 'the beginning' : from} — facts from the record:`,
    line('bounties posted', posted),
    line('solutions merged', merged),
    line('bounties closed with none', closedNone),
    line('waiting now', waiting),
    `the record lives at .box/bounties/ inside the repository; the owner's decision is ${where(readDecision(repoRoot))}`
  ].join('\n');
}
