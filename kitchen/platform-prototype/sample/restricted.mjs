// What an anonymous visitor may never see, kept apart from sample.mjs so no
// page, component or client module can import it (check.test.mjs scans every
// file of the static export for these bytes, and every client source for an
// import of this file). Read only by the build (scripts/feed.mjs, which writes
// the prototype server's answers to server/grants.json) and by the checks.
//
// On the real board these never leave its server: a private repository is
// filtered out when GitHub is read, and an owner-only method is sent only in
// the answer to the signed-in account the rule allows (lib/facts.mjs,
// mayseeOwnerOnly).

// github: a private repository. The board never lists it, at any step.
export const privateRepositories = {
  'example-hidden/vault': { language: 'TypeScript', visibility: 'private', defaultBranch: 'main' },
};

export const privateBounties = [
  {
    id: 'bt-4b2d9f7c5e01', repository: 'example-hidden/vault', issue: 1, poster: 'example-orrin',
    title: 'PRIVATE SAMPLE: must never be listed',
    task: 'This bounty sits on a private repository.',
    createdAt: '2026-10-20T10:00:00Z', reward: 500, workCommit: '4b2d9f7c'.repeat(5), payment: null,
    approvedBy: 'owner-this-bounty', issueState: 'open',
    solutions: [], paid: [], receipt: [],
  },
];

// board: the values of methods their solvers marked "Only an owner who owes
// me". sample.mjs carries only how many each person has (`ownerOnly`).
export const ownerOnlyMethods = {
  'example-quill': [{ kind: 'wise', value: 'quill@example.invalid' }],
  'example-rook': [{ kind: 'wallet', value: '0x0000000000000000000000000000000000c0ffee', chain: 'Base (USDC)' }],
};
