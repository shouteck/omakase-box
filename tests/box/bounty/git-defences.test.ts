// BT97: the Git defence table is a contract, not documentation by memory.
// The harness reads the table, then compares the arguments and environment of
// real calls captured at the product's Git seam.
import childProcess, { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { changeConfig, finalizeBounty, lookBounty, planBounty, postBounty, takeBounty } from '../../../packages/box-bounty/index.js';
import { fixture, postedFixture } from './github-fixture.js';
import { git, makeRepo, runRoot } from './support.js';

interface CapturedCall {
  readonly args: string[];
  readonly env: NodeJS.ProcessEnv | undefined;
}

function captureGit<T>(run: () => T): { result: T; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const previous = childProcess.spawnSync;
  const capture = new Proxy(previous, {
    apply(target, receiver, args) {
      if (/(?:^|[\\/])git(?:\.exe)?$/i.test(String(args[0])) && Array.isArray(args[1])) {
        calls.push({ args: args[1].map(String), env: (args[2] as { env?: NodeJS.ProcessEnv } | undefined)?.env });
      }
      return Reflect.apply(target, receiver, args);
    }
  });
  childProcess.spawnSync = capture;
  syncBuiltinESMExports();
  try { return { result: run(), calls }; }
  finally {
    childProcess.spawnSync = previous;
    syncBuiltinESMExports();
  }
}

function operationOf(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '-c' || args[index] === '-C') { index += 1; continue; }
    return args[index];
  }
  return undefined;
}

const pair = (call: CapturedCall, setting: string): boolean => call.args.some((arg, index) => arg === '-c' && call.args[index + 1] === setting);
const product = (call: CapturedCall): boolean => pair(call, 'core.hooksPath=/dev/null');

type Row = { readonly id: string; readonly stops: string; readonly flag: string; readonly calls: string };
function defenceRows(): ReadonlyMap<string, Row> {
  const text = readFileSync(new URL('../../../docs/box-v4/GIT-DEFENCES.md', import.meta.url), 'utf8');
  const rows = new Map<string, Row>();
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('| id ') || line.startsWith('|---')) continue;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length < 4) continue;
    rows.set(cells[0]!, { id: cells[0]!, stops: cells[1]!, flag: cells[2]!, calls: cells[3]! });
  }
  return rows;
}

const BOARD_STANDIN = fileURLToPath(new URL('./board-standin.cjs', import.meta.url));
let boardFolder: string;
let board: string;
let boardServer: ChildProcess;
const boardRoutes = (next: Record<string, { status: number; body: unknown }>) => writeFileSync(join(boardFolder, 'routes.json'), JSON.stringify(next));

beforeAll(async () => {
  boardFolder = runRoot('git-defences-board');
  mkdirSync(boardFolder, { recursive: true });
  boardServer = spawn(process.execPath, [BOARD_STANDIN, boardFolder], { stdio: ['ignore', 'pipe', 'inherit'] });
  board = await new Promise<string>(done => boardServer.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { boardServer.kill(); });
beforeEach(() => { writeFileSync(join(boardFolder, 'requests.jsonl'), ''); boardRoutes({}); });

describe('BT97 Git defence pins', { timeout: 120000 }, () => {
  // @guards R1
  it('compares the table with captured create, solution-intake and take calls', () => {
    const rows = defenceRows();
    for (const id of ['ownership-respected', 'hooks-off', 'fsmonitor-off', 'signing-programs-off', 'submodule-recursion-off', 'background-maintenance-off', 'external-diff-off', 'textconv-off', 'foreign-attributes-inert', 'optional-locks-off', 'git-environment-scrubbed', 'snapshot-index-isolated', 'literal-pathspecs', 'terminal-prompt-off', 'tokens-scoped', 'solution-objects-checked', 'take-objects-checked', 'take-protocol-https', 'old-git-named']) {
      expect(rows.has(id), `GIT-DEFENCES.md row ${id}`).toBe(true);
    }

    const repo = makeRepo({ 'app.txt': 'fixed\n', 'TASK.md': 'Pin the Git boundary.\n' });
    const created = captureGit(() => finalizeBounty(planBounty({ repoPath: repo, why: 'defence capture', taskPath: join(repo, 'TASK.md') })));
    const calls = [...created.calls];

    fixture(context => {
      calls.push(...captureGit(() => postBounty(context.repo, context.id, 'github')).calls);
      context.pr('solver');
      calls.push(...captureGit(() => lookBounty(context.repo, context.id, 1)).calls);
    });

    postedFixture(({ bare, id }) => {
      changeConfig(null, 'set', 'board', board);
      changeConfig(null, 'set', 'solving', 'allowed');
      // The stand-in board answers the branch head as it stands in the bare remote.
      const head = git(bare, ['rev-parse', `refs/heads/box-bounty/${id}`]);
      boardRoutes({ [`/bounties/${id}.json`]: { status: 200, body: { bounty: { id, state: 'open', reward: { amount: 45 }, pays_on_merge: true, owner: { login: 'owner' }, repository: { name: 'owner/project' }, answer: { branch: `box-bounty/${id}`, base_commit: head } } } } });
      calls.push(...captureGit(() => takeBounty(id)).calls);
    });

    const callsInScope = calls.filter(product);
    expect(callsInScope.length).toBeGreaterThan(0);
    const failures: string[] = [];
    const fail = (row: string, detail: string) => failures.push(`${row}: ${detail}`);

    const configAtoms = (row: string): string[] => [...(rows.get(row)?.flag ?? '').matchAll(/`-c\s+([^`]+?)`/g)].map(match => match[1]!.trim());
    const universalRows = ['hooks-off', 'fsmonitor-off', 'signing-programs-off', 'submodule-recursion-off', 'background-maintenance-off', 'external-diff-off'] as const;
    for (const row of universalRows) expect(configAtoms(row).length, `${row} has no -c atom in GIT-DEFENCES.md`).toBeGreaterThan(0);

    for (const call of callsInScope) {
      for (const row of universalRows) {
        for (const setting of configAtoms(row)) {
          if (!pair(call, setting)) fail(row, `missing -c ${setting} in ${call.args.join(' ')}`);
        }
      }
      if (call.args.some(arg => arg.startsWith('safe.directory='))) fail('ownership-respected', `product argument carries ${call.args.find(arg => arg.startsWith('safe.directory='))}`);
      if (call.env?.['GIT_OPTIONAL_LOCKS'] !== '0') fail('optional-locks-off', `GIT_OPTIONAL_LOCKS is ${String(call.env?.['GIT_OPTIONAL_LOCKS'])} in ${call.args.join(' ')}`);
      for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE']) if (call.env?.[key] !== undefined) fail('git-environment-scrubbed', `${key} leaked into ${call.args.join(' ')}`);
      for (const key of ['GH_TOKEN', 'GITHUB_TOKEN']) if (call.env?.[key] !== undefined) fail('tokens-scoped', `${key} reached Git in ${call.args.join(' ')}`);

      const operation = operationOf(call.args);
      if (operation === 'diff') {
        for (const [row, flag] of [['external-diff-off', '--no-ext-diff'], ['textconv-off', '--no-textconv']] as const) {
          if (!call.args.includes(flag)) fail(row, `diff lacks ${flag}: ${call.args.join(' ')}`);
        }
      }
      if ((operation === 'merge-tree' || operation === 'merge') && call.env?.['GIT_ATTR_SOURCE'] === undefined) fail('foreign-attributes-inert', `${operation} has no GIT_ATTR_SOURCE`);
      if (operation === 'add' && call.args.includes('--pathspec-from-file=-') && call.env?.['GIT_LITERAL_PATHSPECS'] !== '1') fail('literal-pathspecs', 'snapshot pathspec add lacks GIT_LITERAL_PATHSPECS=1');
      if (call.args.some(arg => arg.startsWith('https://github.com/')) && call.env?.['GIT_TERMINAL_PROMPT'] !== '0') fail('terminal-prompt-off', `GitHub call lacks GIT_TERMINAL_PROMPT=0: ${call.args.join(' ')}`);
    }

    const solutionFetch = callsInScope.find(call => operationOf(call.args) === 'fetch' && call.args.some(arg => arg.startsWith('refs/pull/')));
    if (solutionFetch === undefined) fail('solution-objects-checked', 'no solution pull-request fetch was captured');
    else if (!pair(solutionFetch, 'fetch.fsckObjects=true')) fail('solution-objects-checked', 'solution fetch lacks -c fetch.fsckObjects=true');

    const takeClone = callsInScope.find(call => operationOf(call.args) === 'clone');
    if (takeClone === undefined) fail('take-objects-checked', 'no take clone was captured');
    else {
      if (!pair(takeClone, 'transfer.fsckObjects=true')) fail('take-objects-checked', 'take clone lacks -c transfer.fsckObjects=true');
      if (takeClone.env?.['GIT_ALLOW_PROTOCOL'] !== 'https') fail('take-protocol-https', 'take clone lacks GIT_ALLOW_PROTOCOL=https');
    }

    const versionProbe = calls.find(call => operationOf(call.args) === 'version' || call.args.length === 1 && call.args[0] === 'version');
    if (versionProbe === undefined) fail('old-git-named', 'no git version probe was captured');

    expect(failures).toEqual([]);
  });
});
