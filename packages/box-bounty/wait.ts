import { setImmediate } from 'node:timers/promises';
import { BountyRefused } from './errors.js';
import { GitHubReadDeadlineReached } from './gh.js';
import { readOpenPullRequests } from './collect.js';
import { isOpenStage } from './record.js';
import { readStoredSnapshot } from './store.js';

export interface WaitSolution { readonly pullRequest: number; readonly commit: string; readonly url: string; readonly author: string }
export interface WaitOptions {
  readonly id: string;
  readonly timeoutSeconds: number;
  readonly pollSeconds?: number;
  readonly seen: readonly { readonly n: number; readonly commit: string }[];
}
export interface WaitDependencies {
  readonly now: () => number;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly read: () => readonly WaitSolution[];
  readonly signal: AbortSignal;
}
export interface WaitResult {
  readonly schema: 'box-bounty/status-wait@1';
  readonly id: string;
  readonly outcome: 'solution' | 'timeout' | 'cancelled';
  readonly timeoutSeconds: number;
  readonly pollSeconds: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly polls: number;
  readonly solutions: readonly WaitSolution[];
}

export async function waitForSolutions(options: WaitOptions, deps: WaitDependencies): Promise<WaitResult> {
  const start = deps.now();
  const deadline = start + options.timeoutSeconds * 1000;
  const pollSeconds = options.pollSeconds ?? 30;
  const seen = new Set(options.seen.map(pr => `${pr.n}:${pr.commit}`));
  let polls = 0;
  const finish = (outcome: WaitResult['outcome'], solutions: readonly WaitSolution[] = []): WaitResult => ({
    schema: 'box-bounty/status-wait@1', id: options.id, outcome, timeoutSeconds: options.timeoutSeconds, pollSeconds,
    startedAt: new Date(start).toISOString(), endedAt: new Date(deps.now()).toISOString(), polls, solutions
  });
  for (;;) {
    if (deps.signal.aborted) return finish('cancelled');
    if (deps.now() >= deadline) return finish('timeout');
    let solutions: readonly WaitSolution[];
    try { polls++; solutions = deps.read().filter(pr => !seen.has(`${pr.pullRequest}:${pr.commit}`)); }
    catch (error) {
      if (error instanceof GitHubReadDeadlineReached) return finish('timeout');
      if (error instanceof BountyRefused) throw error;
      throw new BountyRefused('wait-upstream-unreadable', 'the wait could not read solutions from GitHub; nothing changed; next: run the wait again');
    }
    await setImmediate();
    if (deps.signal.aborted) return finish('cancelled');
    if (solutions.length > 0) return finish('solution', solutions);
    const remaining = deadline - deps.now();
    if (remaining <= 0) return finish('timeout');
    await deps.sleep(Math.min(pollSeconds * 1000, remaining), deps.signal);
  }
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise(resolve => {
  if (signal.aborted) { resolve(); return; }
  const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
  const timer = setTimeout(done, ms);
  signal.addEventListener('abort', done, { once: true });
});

export async function waitBounty(root: string, id: string, timeoutSeconds: number, signal: AbortSignal): Promise<WaitResult> {
  const record = readStoredSnapshot(root, id);
  if (record === null) throw new BountyRefused('unknown-bounty', `no bounty ${id} — this project has no record for it; nothing changed; next: omakase-box status`);
  if (!isOpenStage(record.stage)) throw new BountyRefused('wait-bounty-ended', `${id} has ended; nothing changed; next: omakase-box status ${id}`);
  const publication = record.github;
  if (publication?.state !== 'posted' || publication.issue === null) throw new BountyRefused('wait-not-posted', `${id} has no posted bounty to wait for; nothing changed; next: omakase-box status ${id}`);
  const deadline = Date.now() + timeoutSeconds * 1000;
  const testMs = process.env['BOX_BOUNTY_WAIT_POLL_MS_FOR_TESTS'];
  const pollSeconds = testMs !== undefined && /^\d+$/.test(testMs) && Number(testMs) >= 1 && Number(testMs) < 30000 ? Number(testMs) / 1000 : 30;
  return waitForSolutions({ id, timeoutSeconds, pollSeconds, seen: publication.seenPullRequests ?? [] }, {
    now: Date.now, sleep, signal,
    read: () => readOpenPullRequests(root, publication, { readOnly: true, deadline }).map(pr => ({
      pullRequest: pr.n, commit: pr.commit, url: `https://github.com/${publication.repository}/pull/${pr.n}`, author: pr.author
    }))
  });
}

export function renderWait(result: WaitResult): string {
  if (result.outcome === 'solution') return [
    `${result.id} — solution`, ...result.solutions.map(pr => `#${pr.pullRequest} ${pr.commit.slice(0, 12)} ${pr.url}`),
    `next: omakase-box status ${result.id} shows them; omakase-box look ${result.id} <number> collects one`
  ].join('\n');
  if (result.outcome === 'cancelled') return `${result.id} — cancelled — nothing changed\nnext: run the wait again or omakase-box status ${result.id}`;
  return `${result.id} — timeout — no solution arrived within ${result.timeoutSeconds} s; nothing changed\nnext: run the wait again or omakase-box status ${result.id}`;
}
