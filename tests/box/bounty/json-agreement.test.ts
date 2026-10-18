// BT26 — the JSON view cannot fall behind the text view. At each step of
// the standard journey (bt19's stand-in world) the three --full text views
// print labelled lines — `next:`, `github:`, `pay-to:` — and each label is
// either a fact the matching --json document carries or a named non-fact.
// The LABELS table below is the agreement: a label the text prints that
// the table does not list fails, and so does a mapped pointer missing
// from the document at a step where the text printed it. Built by
// listing every label the journey prints, never by parsing the text.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, describe } from 'vitest';
import { sharedFixture } from './github-fixture.js';
import { CLI_DIST } from './support.js';

const box = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

// A label is the text before the first `: ` on a line, trimmed, when it is
// 1 to 4 lowercase words — the brief's own definition.
const LABEL_RE = /^\s*([a-z][a-z' -]{0,40}):\s/;
const labelsOf = (text: string): string[] => {
  const found = new Set<string>();
  for (const line of text.split('\n')) {
    const match = LABEL_RE.exec(line);
    if (match !== null && match[1]!.trim().split(' ').length <= 4) found.add(match[1]!.trim());
  }
  return [...found];
};

// The agreement. Every label a --full text view can print, mapped to the
// JSON pointer that carries the same fact in the matching --json document,
// or to null — with the reason standing in NOT_FACT — when the label is not
// a fact the document owes (a suggestion, a heading).
const LABELS: Record<string, Record<string, string | null>> = {
  'status --full': {
    'owner': '/owner/decision',
    'reward': '/owner/reward',
    'next': '/bounties/0/next',
    'branch': '/bounties/0/resume/branch',
    'changed files': '/bounties/0/resume/changed',
    'history': '/bounties/0/events',
    'ended': '/bounties',
    'comments from other accounts': '/bounties/0/github/comments',
    'github': '/bounties/0/github/repository',
    'allowed by': '/bounties/0/allowedBy',
    'from': '/bounties/0/solutions/0/author',
    'pay-to': '/bounties/0/solutions/0/payTo',
    'change': '/bounties/0/solutions/0/changed',
    'current code': '/bounties/0/solutions/0/conflicts',
    'flags': '/bounties/0/solutions/0/report',
    'current code now': '/bounties/0/mergeNow',
    'pay': '/bounties/0/github/pay',
    'payment': '/bounties/0/payment',
    'records': '/records/tracked'
  },
  'look --full': {
    'pay-to': '/payTo',
    'next': null
  },
  'config --full': {
    'the owner\'s settings': '/settingsFile',
    'this repository': '/thisRepository',
    'all-projects': '/allProjects',
    'repositories': '/repositories',
    'not decided yet': '/decision',
    'allow this repository': null,
    'this one bounty only': null,
    'never publish': '/publishLists/neverPublish',
    'safe to publish': '/publishLists/safeToPublish',
    'instructions': '/instructions/enabled',
    'instruction-file': '/instructions/file',
    'instruction files found': '/instructions/found',
    'waiting actions': '/waiting',
    'owner/project': '/repositories/owner~1project',
    'records': '/records/tracked'
  }
};
const NOT_FACT: Record<string, Record<string, string>> = {
  'look --full': {
    'next': 'the command\'s own next-step suggestion — the document carries facts, not the tool\'s guidance'
  },
  'config --full': {
    'allow this repository': 'a suggested owner command — the document carries the decision, not the suggestion',
    'this one bounty only': 'a suggested owner command — the document carries the wait as facts under /waiting, not the suggestion'
  }
};

// A JSON pointer into a document: /-separated keys, ~1 for / and ~0 for ~.
// Presence means the key exists — an absent fact is null by contract, so a
// null value still counts as carried.
const has = (document: unknown, pointer: string): boolean => {
  let node = document;
  for (const raw of pointer.split('/').slice(1)) {
    const part = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (node === null || typeof node !== 'object') return false;
    if (Array.isArray(node)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) return false;
      node = node[index];
    } else {
      if (!Object.prototype.hasOwnProperty.call(node, part)) return false;
      node = (node as Record<string, unknown>)[part];
    }
  }
  return true;
};

describe('every label a --full text view prints is a document fact or a named non-fact', () => {
  // One world, consecutive steps — the journey's six checkpoints were a
  // single `it` past half the suite's limit (K24). Same checks, same order.
  const world = sharedFixture();
  const { repo, id, scratch, pr } = world;
  const failures: string[] = [];
  const documentOf = (args: string[]): Record<string, unknown> => {
    const run = box(repo, args);
    expect(run.status, `${args.join(' ')}: ${run.stderr}`).toBe(0);
    return JSON.parse(run.stdout) as Record<string, unknown>;
  };
  const check = (step: string, command: string, textArgs: string[], jsonArgs: string[]) => {
    const text = box(repo, textArgs);
    expect(text.status, `${command} at ${step}: ${text.stderr}`).toBe(0);
    const doc = documentOf(jsonArgs);
    for (const label of labelsOf(text.stdout)) {
      const entry = LABELS[command]?.[label];
      if (entry === undefined) failures.push(`${step}: ${command} prints label '${label}' the LABELS table does not list`);
      else if (entry !== null && !has(doc, entry)) failures.push(`${step}: ${command} label '${label}' maps to '${entry}' which is missing from the ${jsonArgs.join(' ')} document`);
    }
  };
  const step = (name: string, look: boolean) => {
    check(name, 'status --full', ['status', '--full'], ['status', '--json']);
    check(name, 'config --full', ['config', '--full'], ['config', '--json']);
    if (look) check(name, 'look --full', ['look', id, '1', '--full'], ['look', id, '1', '--json']);
  };
  it('the drafted view, the held post and the waiting view', () => world.run(() => {
  step('drafted', false);
  writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', repositories: {} }));
  box(repo, ['post', id]);
  step('waiting', false);
  }));

  it('the allowed and pull-request-seen views', () => world.run(() => {
  box(repo, ['allow', 'owner/project', '--reward', '10', '--reward-limit', '30']);
  step('posted', false);
  pr('solver-a');
  step('pr-seen', false);
  }));

  it('the collected and applied views', () => world.run(() => {
  box(repo, ['look', id, '1']);
  step('answered', true);
  box(repo, ['apply', id, '1']);
  step('applied', true);
  expect(failures).toEqual([]);
  }));
});
