// Telling the agent — the two switchable pieces of wave BT4:
//
//   describe         the canonical description (wording.ts) plus the facts an
//                    agent needs to choose: cost, expected wait, the limits and
//                    open bounties, read from .box/limits.json and live state.
//                    Works outside a checkout too — outside one it prints the
//                    description and says the live facts need a repository.
//   describe --rules the block an owner pastes into a project's rules file,
//                    markers included, with the current open-bounties line.
//
// Neither ever prints nothing: facts that are not set say so, an absent
// limits file means defaults, and a broken one is a named refusal.

import { LEGACY_GITHUB_NOTE, ownerStatusLine, renderOpenLine, resolveLimits } from './record.js';
import { DESCRIBE_LINES, renderRulesBlock } from './wording.js';

export function renderDescribe(repoRoot: string | null): string {
  const lines: string[] = [...DESCRIBE_LINES, ''];
  if (repoRoot === null) {
    lines.push('the facts for choosing — cost, expected wait, the owner\'s limits and open bounties — need a repository: they live in .box/. Run inside a checkout or pass --repo <path> to see them.');
    return lines.join('\n');
  }
  const limits = resolveLimits(repoRoot);
  lines.push('the facts for choosing — .box/limits.json and the live records:');
  lines.push('  GitHub cost: nothing; public repositories only. Expected wait: unknown; nobody is known to be watching these issues yet.');
  lines.push(`  cost: ${limits.cost ?? 'not stated — the owner sets "cost" in .box/limits.json'}`);
  lines.push(`  expected wait: ${limits.expectedAnswer ?? 'not stated — the owner sets "expectedAnswer" in .box/limits.json'}`);
  lines.push('  how a solution is treated: each one arrives as a numbered attempt; the report states facts about the change and runs nothing — choosing is yours.');
  // An empty list still means what it means — no destination is allowed — so
  // it says so plainly rather than dangling "only inside" with nothing after.
  // "github" is not a folder: a leftover entry is a legacy allowance, named
  // once and never a yes — the decision moved to the owner's own settings.
  const folders = (limits.allowedDestinations ?? []).filter(dir => dir !== 'github');
  const destinations = limits.allowedDestinations === null
    ? 'any local folder — the owner can restrict it with "allowedDestinations"'
    : folders.length === 0
      ? 'nowhere — the owner\'s "allowedDestinations" names no folder'
      : `only inside ${folders.join(', ')}`;
  lines.push(`  where post --to <dir> may deliver: ${destinations}`);
  lines.push(`  ${ownerStatusLine(repoRoot)}`);
  if (limits.legacyGithubDestination) lines.push(`  ${LEGACY_GITHUB_NOTE}`);
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
