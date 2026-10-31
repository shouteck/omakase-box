# PF6: ready to launch

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF6` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-k44-decisions, D-2026-10-31-agent-skill-channel, D-2026-11-01-real-before-launch
Owner context: D-2026-10-21-k44-decisions (decision 3: lead with the mechanism; decision 5: machine channels first, then one Show HN by the owner); D-2026-10-31-agent-skill-channel (an Agent Skill and a free plugin marketplace repository join the machine channels; Monid and agent wallets are not part of this wave); spend no money. **Going live, publishing to npm, listing in registries and posting anywhere are the owner's own actions;** this wave prepares them and does none of them.
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written ahead by the CTO on 21 October 2026; Agent Skill channel added on 31 October 2026. **Reordered 1 November 2026: after BT51, BT52, PF7, PF8 and PF9. Deployment moved to PF8.** K41 runs alongside or before it; its final render takes this wave's install line.

## Outcome

Everything the owner needs to launch at $0 is ready and checked:

- the npm package;
- the install line's return;
- the registry listing;
- an Agent Skill and a free plugin marketplace repository, tested against the plain instruction block;
- the launch facts.

The board is already live (PF8). The owner can publish and announce in one sitting, without the kitchen touching an account.

## What it does

1. **The install line returns.** BT12 held `npx box-bounty bounty help` out of the instruction block until the owner owns the name. This wave prepares the change on its branch, **merged only after the owner confirms the npm publish succeeded**. The CTO checks the name resolves on npm to the owner's package.
2. **The package:**
   - `node packages/box-cli/pack.mjs` rebuilds the tarball;
   - the version is set to the first public version the owner chooses;
   - its README (`FIRST-FIVE-MINUTES.md`) names the board, the feed and the MCP server;
   - the one publish command is written for the owner.
3. **Registry listing:** the official MCP Registry's metadata (`server.json`) for the platform's MCP server, under the owner's GitHub namespace, with the owner's publish steps (GitHub login).
4. **The Agent Skill and the marketplace.**
   - **Check the formats first:** read the Agent Skills standard (agentskills.io), Claude Code's plugin marketplace documentation and skills.sh's listing steps on the day, and cite them in the Result. Their shapes are not assumed here.
   - **One skill:** a `SKILL.md` for the tool. Its description tells an agent when to consider a hand-off, using `describe`'s own reasons: access it lacks, work it is forbidden to do, repeated failure, a side task, a second opinion. Its body states the mechanism and the same facts as BT42's block: posting is free, it goes only to this repository's own public GitHub as an issue, and the owner's permission applies. It stays short and points to `box bounty describe` for the rest. It claims nothing about solvers waiting and tells no agent it must use the tool.
   - **One free marketplace repository or manifest,** so `/plugin marketplace add` can install the skill, plus the owner's steps for skills.sh and for submitting to Anthropic's directory. Acceptance into a curated directory is not assumed.
   - **The install line in the skill** follows item 1's rule: it names the package only after the owner confirms the npm publish.
5. **The hand-off comparison** (K44's experiment E1, with the skill as the variable).
   - **Arms:** three fresh sessions with the shipped instruction block only, and three with the skill installed. They run one at a time, in scratch folders, on the same task.
   - **The task:** K44's H1 release seat, rebuilt so the obstacle has no local half, since K44 found the original could be half-tested on Windows.
   - **Measures, from the logs:** ran `describe`, weighed the tool, posted. Stand-in GitHub only; nothing goes outside.
   - **Reported as it falls:** too few runs for a rate, and **no hand-off count is a pass bar.** If the skill changes nothing, the Result says so and the skill still ships as a free channel. The Result then names K44's stop signal: if agents still hand off at most 1 in 10, position the tool as "you tell your agent to post this".
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
- The skill and the marketplace manifest validate against the formats cited in the Result, by the standard's own validator where one exists.
- A test fails if the skill's facts drift from BT42's block (free, this repository's own public GitHub, the owner's permission), if it says "must", or if its description and body exceed the bound the wave states.

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0; hosted CI green after merge.
- The skill installs from the marketplace repository in a scratch project, and the agent there can see it.
- The hand-off comparison ran, or the Result says which sessions did not and why, with both arms' results recorded.

## Lenses

- [x] **Security:** no secret in any file; every account step is the owner's; the install line points only at the owner's published package; the skill's text cannot be read as permission to post beyond the owner's rules.
- [x] **User experience:** a fresh agent given only the facts sheet and the publish steps can list what the owner must do, without asking.
- [x] **Measurement fairness:** both arms get the same task, host, model and prompt; no prompt mentions the tool beyond what each arm installs; every session is counted, missing ones shown as missing; the Result states the run count and that it is too small for a rate.

## Notes

- Feature playbook; principles: prove-it-works.
- Do not edit `waves/PF6.md` while a verify runs. Report at the timebox.
