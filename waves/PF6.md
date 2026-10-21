# PF6: ready to launch

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF6` · Timebox: 180 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-k44-decisions (decision 3: lead with the mechanism; decision 5: machine channels first, then one Show HN by the owner); spend no money. **Going live, publishing to npm, listing in registries and posting anywhere are the owner's own actions;** this wave prepares them and does none of them.

**Brief.** Written ahead by the CTO on 21 October 2026. **After PF1 to PF5 and BT42; before K41's final render.** Cook: medium; reviewer: high.

## Outcome

Everything the owner needs to launch at $0 is ready and checked:

- the deployment, as a list of steps the owner runs;
- the npm package;
- the install line's return;
- the registry listing;
- the launch facts.

The owner can go live, publish and announce in one sitting, without the kitchen touching an account.

## What it does

1. **Deployment recipe** in `packages/box-platform/DEPLOY.md`:
   - the free host K43 chose;
   - each account step the owner takes (host, database, GitHub OAuth app, optional GitHub app token for rate limits), each with its cost: $0, or flagged;
   - each environment variable and which secret goes where (set by the owner, never seen by an agent);
   - the deploy command;
   - a post-deploy check list: the board lists the sandbox's bounties; a private repository is absent; MCP and the feed answer.
2. **Production configuration:** the CLI's default platform address (PF5) is set to the deployment's free subdomain, as a constant the owner confirms before release.
3. **The install line returns.** BT12 held `npx box-bounty bounty help` out of the instruction block until the owner owns the name. This wave prepares the change on its branch, **merged only after the owner confirms the npm publish succeeded**. The pass checks the name resolves on npm to the owner's package.
4. **The package:**
   - `node packages/box-cli/pack.mjs` rebuilds the tarball;
   - the version is set to the first public version the owner chooses;
   - its README (`FIRST-FIVE-MINUTES.md`) names the board, the feed and the MCP server;
   - the one publish command is written for the owner.
5. **Registry listing:** the official MCP Registry's metadata (`server.json`) for the platform's MCP server, under the owner's GitHub namespace, with the owner's publish steps (GitHub login). Also a Claude Code plugin marketplace entry if K43 or PF2 shows it fits.
6. **Launch facts sheet** (`docs/box-v4/LAUNCH.md`):
   - what the tool and the platform do, in K44's winning framing: the issue goes out, pull requests come back;
   - what becomes public;
   - what it never does (holds money, runs solvers' code, posts private code);
   - links.

   **Facts for the owner to write from, not posts:** K44 recommends the Show HN and any post be written by the owner by hand, and no agent posts anywhere.
7. **What we watch after launch:** K44's measures M0 to M3, collected from public data only, as a script `kitchen/launch/watch.mjs` that reads the board's public API and GitHub search.

## Tests

- The packaging tests (BT12) pass on the rebuilt tarball.
- The `server.json` validates against the MCP Registry's published schema.
- `watch.mjs` runs against the stand-in.
- The install-line change: its test pins the published name.

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0; hosted CI green after merge.
- A fresh agent given only `DEPLOY.md` can list every step the owner must take, with each step's cost, without asking a question.

## Review lenses

- [x] **Security:** no secret in any file; every account step is the owner's; the install line points only at the owner's published package.
- [x] **User experience:** the pass follows `DEPLOY.md` against a local stand-in host as far as it can without an account.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook; principles: prove-it-works.
- Do not edit `waves/PF6.md` while a verify runs. Report at the timebox.
