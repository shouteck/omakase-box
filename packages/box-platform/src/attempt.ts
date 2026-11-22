import type { BountyRow } from './query.js';

export function attemptOf(row: Pick<BountyRow, 'id' | 'repository' | 'source' | 'default_branch' | 'issue_number'>) {
  const listed = row.source === 'listed';
  return {
    repository: row.repository,
    pull_request_base: listed ? row.default_branch ?? 'main' : `box-bounty/${row.id}`,
    body_must_include: listed ? `Fixes #${row.issue_number}` : null,
    take: 'Open a draft pull request in this repository against pull_request_base, including body_must_include in its body when set; the board polls GitHub and shows it as an attempt in progress.',
    reserves: false,
    submit: 'Mark the pull request ready for review on GitHub to submit the solution; the board polls its draft status. A draft reserves nothing.'
  };
}
