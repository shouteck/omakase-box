// BT59 (K51 H10): the test stand-in's answers against real GitHub's, read-only, for the reads the tool makes.
// For each call: real GitHub through the tool's own token transport (gh-direct.ts), and the fixture's gh stand-in
// (STANDIN in tests/box/bounty/github-fixture.ts) over a state shaped like the same repository. It compares the status and
// the shape of the answer (field paths and types, arrays by their elements) and prints shapes only: no value of a real
// answer is printed or saved, and the token is read from GH_TOKEN and passed only to the transport.
//   GH_TOKEN="$(gh auth token)" node_modules/.bin/tsx kitchen/demo/bt59-standin-check.mts <owner/repo> <issue> <pull>
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directRequest } from '../../packages/box-bounty/gh-direct.ts';
import { splitResponse } from '../../packages/box-bounty/gh.ts';

const [repository, issueArg, pullArg] = process.argv.slice(2);
const token = process.env['GH_TOKEN'];
if (repository === undefined || issueArg === undefined || pullArg === undefined || token === undefined) {
  console.error('usage: GH_TOKEN=<token> tsx kitchen/demo/bt59-standin-check.mts <owner/repo> <issue> <pull>');
  process.exit(2);
}
const issue = Number(issueArg);
const pull = Number(pullArg);
const root = fileURLToPath(new URL('../../', import.meta.url));

// The stand-in's own source, as the fixture writes it.
const fixture = readFileSync(join(root, 'tests', 'box', 'bounty', 'github-fixture.ts'), 'utf8');
const start = fixture.indexOf('export const STANDIN = String.raw`') + 'export const STANDIN = String.raw`'.length;
const source = fixture.slice(start, fixture.indexOf('\n`;', start));
const work = mkdtempSync(join(tmpdir(), 'kitchen-BT59-h10-'));
const standin = join(work, 'standin.cjs');
writeFileSync(standin, source);
const [owner] = repository.split('/');
const state = {
  visibility: 'public', private: false, auth: true, account: owner, repository,
  issues: [{ number: issue, html_url: `https://github.com/${repository}/issues/${issue}`, title: 't', body: 'b', state: 'closed', labels: [{ name: 'box-bounty' }], user: { login: owner } }],
  comments: [{ body: 'c', user: { login: owner }, created_at: '2026-11-13T00:00:00Z' }],
  prs: [{ number: pull, user: { login: owner }, base: { ref: 'main', repo: { full_name: repository } }, head: { sha: '0'.repeat(40) }, files: [{ filename: 'f.txt' }], merged: true, merged_at: '2026-11-13T00:00:00Z' }],
  labels: [{ name: 'box-bounty' }], calls: []
};
const stateFile = join(work, 'state.json');
writeFileSync(stateFile, JSON.stringify(state));

// The tool's own query, with its one interpolation (${SHOWN}, the page size) filled in as the tool fills it.
const attempt = readFileSync(join(root, 'packages', 'box-bounty', 'attempt.ts'), 'utf8');
const shown = /const SHOWN = (\d+);/.exec(attempt)![1]!;
const QUERY = /const QUERY = `([^`]+)`/.exec(attempt)![1]!.replaceAll('${SHOWN}', shown);
const input = join(work, 'query.json');
writeFileSync(input, JSON.stringify({ query: QUERY, variables: { owner, name: repository.split('/')[1], number: pull } }));
const R = `repos/${repository}`;
const CALLS: string[][] = [
  ['user'], [R], [`${R}/issues/${issue}`], [`${R}/issues?state=all&per_page=100&page=1`], [`${R}/issues/${issue}/comments?per_page=100&page=1`],
  [`${R}/pulls/${pull}`], [`${R}/pulls/${pull}/files?per_page=100&page=1`], [`${R}/pulls?state=all&per_page=100&page=1`],
  [`${R}/labels/box-bounty`], ['rate_limit'], ['graphql', '--method', 'POST', '--input', input]
];

const typeOf = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const shape = (value: unknown, path = '', out = new Map<string, Set<string>>()) => {
  if (Array.isArray(value)) { for (const element of value.slice(0, 5)) { add(out, `${path}[]`, typeOf(element)); shape(element, `${path}[]`, out); } return out; }
  if (value !== null && typeof value === 'object') for (const [key, element] of Object.entries(value)) { const at = path === '' ? key : `${path}.${key}`; add(out, at, typeOf(element)); shape(element, at, out); }
  return out;
};
const add = (map: Map<string, Set<string>>, key: string, type: string) => { map.set(key, (map.get(key) ?? new Set()).add(type)); };
const parse = (text: string): unknown => { try { return JSON.parse(text); } catch { return undefined; } };

const rows: string[] = [];
for (const call of CALLS) {
  const args = ['api', '--hostname', 'github.com', call[0]!, '--include', ...call.slice(1)];
  const real = splitResponse(directRequest(token, args, 30000).stdout ?? '');
  const ran = spawnSync(process.execPath, [standin, ...args], { encoding: 'utf8', env: { PATH: process.env['PATH'], SYSTEMROOT: process.env['SYSTEMROOT'], BT6_GH_STATE: stateFile } });
  const fake = splitResponse(ran.stdout ?? '');
  const realShape = shape(parse(real.body));
  const fakeShape = shape(parse(fake.body));
  const missing: string[] = [];
  const typed: string[] = [];
  for (const [path, types] of fakeShape) {
    const have = realShape.get(path);
    if (have === undefined) missing.push(path);
    else if ([...types].some(type => !have.has(type))) typed.push(`${path} stand-in ${[...types].join('|')} real ${[...have].join('|')}`);
  }
  rows.push(`${call[0]!.replace(repository, '<repo>').split('?')[0]} | real ${real.status ?? 'none'} | stand-in exit ${ran.status} | stand-in fields absent from real: ${missing.length === 0 ? 'none' : missing.join(', ')} | type differs: ${typed.length === 0 ? 'none' : typed.join('; ')}`);
}
rmSync(work, { recursive: true, force: true });
console.log(rows.join('\n'));
