import { type BountyFormat, publicText, renderFormat } from './format.js';
import { showPath } from './notice.js';

export const ISSUE_BODY_MAX = 65_536;
export const ISSUE_TITLE_MAX = 256;
export const AGENT_PREPARE_MARKER = '<!-- box-bounty-agent-prepare -->';
export const hasPrepareMarker = (body: string): boolean => body.includes('<!-- box-bounty-agent-prepare');
export const bountyIssueTitle = (id: string, title: string): string => `[box bounty ${id}] ${publicText(title)}`;

export function renderBountyIssue(input: {
  format: BountyFormat; title: string; task: string; note: string | null; board: string; base: string;
  pushed: readonly { sha: string; subject: string }[]; licence: { file: string | null; declared: string | null }; prepared?: boolean;
}): { branch: string; title: string; body: string } {
  const { format, title, task, note, board, base, pushed, licence, prepared = false } = input;
  const branch = format.branch;
  const reward = format.reward.amount;
  const posted = new Date(format.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const short = base.slice(0, 12);
  const work = pushed.length === 0 ? [] : [publicText(`   It also carries the poster's work in progress, ${pushed.length} commit(s): ${pushed.map(c => `\`${c.sha.slice(0, 12)}\` ${showPath(c.subject)}`).join(', ')}.`)];
  const body = [
    `# Bounty: ${publicText(title)}`,
    '',
    `${reward > 0 ? `$${reward} for the merged solution` : 'No reward'} · ${format.id} · posted ${posted}`,
    // Markdown joins lines with no blank line between, so each fact below is its own paragraph.
    ...(board === '' ? [] : ['', `On the board: ${board}/b/${format.id}/`]),
    '',
    '## What is wanted',
    '',
    publicText(task.trim()),
    '',
    // The issue and the create preview agree on the note (BT14, F4): a generated note stays local, so the section is
    // there only when the poster wrote one.
    ...(note !== null ? ['## What was already tried', '', publicText(note.trim()), ''] : []),
    '## How to answer',
    '',
    `1. Fork this repository (or push a branch inside it) and start from \`${branch}\` (commit ${short}). It holds the code as the poster left it.`,
    ...work,
    `2. Make the change and open a pull request against \`${branch}\`, not against the default branch.`,
    '3. The poster reads the change and decides. The tool never runs anything you wrote.',
    '',
    `Agents: \`omakase-box take ${format.id}\` does steps 1 and 2 (npm i -g omakase-box).`,
    '',
    '## Reward',
    '',
    ...(reward > 0 ? [
      `${reward} for the merged solution, paid by the poster directly. Other solutions and parts used by hand earn nothing.`,
      '',
      board === '' ? 'To be paid: say how in your pull request description.' : `To be paid: sign in with your GitHub account at ${board}/me/ and set up how you get paid there.`,
      '',
      board === '' ? 'Posting an answer doesn\'t guarantee payment.' : 'Posting an answer doesn\'t guarantee payment; the poster\'s payment record is on the board.'
    ] : ['No reward is stated.']),
    '',
    // The licence file's name and package.json's declared licence are read from the branch root, where an applied
    // solution can have put them: both quoted (BT43 correction 5).
    licence.file !== null
      ? publicText(`Licence: ${showPath(licence.file)}${licence.declared !== null ? ` (package.json declares ${showPath(licence.declared)})` : ''}`)
      : 'Licence: no licence file was found at the branch root.',
    '',
    `<!-- box-bounty:${format.id} -->`,
    ...(prepared ? [AGENT_PREPARE_MARKER] : []),
    ''
  ].join('\n');
  return { branch, title: bountyIssueTitle(format.id, title), body: body + renderFormat(format) };
}
