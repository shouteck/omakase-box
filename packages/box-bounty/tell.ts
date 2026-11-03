import { attemptsOf, isOpenStage, listRecords } from './record.js';
import { ownerStatusLine } from './owner-text.js';
import { renderOpenLine } from './render.js';
import { instructionBlock, solvingAllowed } from './instructions.js';
import { readDecision, repoReward } from './settings.js';
import { boardAddress, readBoardNumbers } from './board.js';
import { solvingLines, solvingOf } from './solving.js';
import { DESCRIBE_LINES, describeModeLine, describeRewardLine, renderRulesBlock, SOLVING_LINES } from './wording.js';

/** Who decides posting and merging on this repository, from the owner's settings; never guessed. */
function postingMode(repoRoot: string | null): 'allowed' | 'ask' | 'off' | 'none' | 'no-repository' {
  if (repoRoot === null) return 'no-repository';
  try { return readDecision(repoRoot).decision ?? 'none'; } catch { return 'none'; }
}

export function renderDescribe(repoRoot: string | null): string {
  const { amount } = repoRoot === null ? { amount: 0 } : repoReward(repoRoot);
  // The reward sentence sits where the frozen text ended its thought — the
  // amount is generated from this repository's own entry, never hard-coded.
  const at = DESCRIBE_LINES.indexOf('available.');
  const lines: string[] = [...DESCRIBE_LINES.slice(0, at + 1), describeRewardLine(amount), ...DESCRIBE_LINES.slice(at + 1), describeModeLine(postingMode(repoRoot), solvingOf().mode), ''];
  // The standing explanation said once at allow and never repeated (BT17)
  // stays readable here permanently — ahead of the repository-gated facts.
  lines.push('the owner\'s answers live in the owner\'s own settings outside the repository — they stop accidents and record changes; they are not a lock against an agent that deliberately changes them.');
  if (repoRoot === null) {
    lines.push('the facts for choosing need a repository: run inside a checkout or pass --repo <path>.');
    return lines.join('\n');
  }
  const records = listRecords(repoRoot).flatMap(entry => entry.record === null ? [] : [entry.record]);
  const posted = records.filter(record => record.events.some(event => event.stage === 'posted'));
  const ended = posted.filter(record => !isOpenStage(record.stage));
  const merged = ended.filter(record => record.stage === 'applied');
  const waits = posted.flatMap(record => {
    const post = record.events.find(event => event.stage === 'posted');
    const first = [...attemptsOf(record).map(attempt => attempt.at), ...record.github?.seenPullRequests?.map(pr => pr.at) ?? []].sort()[0];
    if (post === undefined || first === undefined) return [];
    const hours = (Date.parse(first) - Date.parse(post.at)) / 3600000;
    return Number.isFinite(hours) && hours >= 0 ? [hours] : [];
  });
  lines.push('the facts for choosing, from this project\'s records:');
  lines.push(amount === 0
    ? '  cost: GitHub posting is public and free; every bounty states a reward of $0. Nothing promised. A draft is free; preparing and judging solutions takes your time.'
    : `  cost: GitHub posting is public and free; every bounty states a reward of $${amount} — the owner pays it, and posting an answer does not guarantee it. A draft is free; preparing and judging solutions takes your time.`);
  if (posted.length === 0) lines.push('  expected wait: unknown; no bounty history yet. Nobody is known to be watching these issues yet.');
  else lines.push(`  expected wait: ${waits.length === 0 ? 'no solution wait recorded yet' : `${Math.min(...waits).toFixed(1)} to ${Math.max(...waits).toFixed(1)} hours from posting to the first solution recorded, across ${waits.length} bounty/bounties`}; ${merged.length} of ${ended.length} ended posted bounties had a solution merged. Past waits do not predict the next answer.`);
  lines.push('  how a solution is treated: each one arrives as a numbered attempt; the report states facts about the change and runs nothing. Choosing is yours.');
  const owner = ownerStatusLine(repoRoot, true); // describe is the standing-explanation surface — the line always prints
  if (owner !== null) lines.push(`  ${owner}`);
  lines.push(renderOpenLine(repoRoot));
  lines.push('', 'next: box bounty create --task <file> --why "<one line>" or box bounty help for the whole journey');
  return lines.join('\n');
}

export function renderRules(repoRoot: string | null): string {
  return ['the tool keeps this fixed block in existing instruction files after box bounty config set instructions true:', '', repoRoot === null ? renderRulesBlock('idle', solvingAllowed()) : instructionBlock(repoRoot)].join('\n');
}

/** `describe --solving` (PF27): the solving half, then where this machine stands. It reads no repository. */
export function renderDescribeSolving(): string {
  const board = boardAddress();
  return [
    ...SOLVING_LINES,
    '',
    ...solvingLines(false),
    board === '' ? 'board: none named, so there is nothing to discover; the owner names one with box bounty config set board <address>' : `board: ${board} — discover reads its public feed`,
    ...(board === '' ? [] : [readBoardNumbers() ?? '']),
    '',
    solvingOf().mode === 'off'
      ? 'next: ask the owner to run box bounty config set solving allowed (or ask, to be asked before each bounty)'
      : 'next: box bounty discover --language <a language you work in>, then box bounty take <id>'
  ].join('\n');
}
