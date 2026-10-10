// Telling the agent — the three switchable pieces of wave BT4:
//
//   describe         the canonical description (wording.ts) plus the facts an
//                    agent needs to choose: cost, expected wait, the limits and
//                    open bounties, read from .box/limits.json and live state.
//                    Works outside a checkout too — outside one it prints the
//                    description and says the live facts need a repository.
//   describe --rules the block an owner pastes into a project's rules file,
//                    markers included, with the current open-bounties line.
//   remind           the one line a harness can surface at a moment of
//                    difficulty — off unless the limits file switches it on.
//
// None of them ever prints nothing: facts that are not set say so, an absent
// limits file means defaults, and a broken one is a named refusal.

import { renderOpenLine, resolveLimits } from './record.js';
import { DESCRIBE_LINES, REMINDER_OFF, REMINDER_ON, renderRulesBlock } from './wording.js';

export function renderDescribe(repoRoot: string | null): string {
  const lines: string[] = [...DESCRIBE_LINES, ''];
  if (repoRoot === null) {
    lines.push('the facts for choosing — cost, expected wait, the owner\'s limits and open bounties — need a repository: they live in .box/. Run inside a checkout or pass --repo <path> to see them.');
    return lines.join('\n');
  }
  const limits = resolveLimits(repoRoot);
  lines.push('the facts for choosing — .box/limits.json and the live records:');
  lines.push(`  cost: ${limits.cost ?? 'not stated — the owner sets "cost" in .box/limits.json'}`);
  lines.push(`  expected wait: ${limits.expectedAnswer ?? 'not stated — the owner sets "expectedAnswer" in .box/limits.json'}`);
  lines.push('  how an answer is judged: the level stated in the listing — mechanical: the check declared on it must exit 0; reviewed: a person reads it. The tool reports facts about an answer, never a verdict.');
  lines.push(`  where post --to may deliver: ${limits.allowedDestinations === null ? 'any local folder — the owner can restrict it with "allowedDestinations"' : `only inside ${limits.allowedDestinations.join(', ')}`}`);
  lines.push(`  reminders at moments of difficulty: ${limits.reminders}`);
  lines.push(renderOpenLine(repoRoot));
  lines.push('');
  lines.push('next: box bounty create --task <file> --why "<one line>" — or box bounty help for the whole journey');
  return lines.join('\n');
}

export function renderRules(repoRoot: string | null): string {
  // Outside a checkout the block still prints, as a template — the tool
  // rewrites the open-bounties line (and the whole marked block) on every
  // record change once it is pasted and .box/limits.json names the file.
  if (repoRoot !== null) resolveLimits(repoRoot); // the limits file is still a boundary — a broken one is a named refusal here too
  const openLine = repoRoot === null ? 'open bounties: none' : renderOpenLine(repoRoot);
  return [
    'paste this block into the project\'s rules file — the tool keeps what sits between the markers current on every record change:',
    '',
    renderRulesBlock(openLine)
  ].join('\n');
}

// The switch the harness reads: off by default, on only when the limits file
// says "reminders": "on". Either way it prints exactly one line — the trigger
// moment (a failed attempt, budget running low) belongs to the harness.
export function renderRemind(repoRoot: string): string {
  return resolveLimits(repoRoot).reminders === 'on' ? REMINDER_ON : REMINDER_OFF;
}
