# PF6: ready to launch

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF6` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-k44-decisions, D-2026-10-31-agent-skill-channel, D-2026-11-01-real-before-launch, D-2026-11-01-agent-only-direction, D-2026-11-01-solver-distributor, D-2026-11-01-film-and-launch-last, D-2026-11-04-solver-distribution-answers, D-2026-11-10-k48-answers, D-2026-11-10-found-at-the-moment
Owner context: D-2026-10-21-k44-decisions (decision 3: lead with the mechanism; decision 5: machine channels first, then one Show HN by the owner); D-2026-10-31-agent-skill-channel (an Agent Skill and a free plugin marketplace repository join the machine channels; D-2026-11-01-agent-only-direction brings Monid and the other toolboxes in; agent wallets stay out, in K46); spend no money. **Going live, publishing to npm, listing in registries, pull requests to other repositories and posting anywhere are the owner's own actions;** this wave prepares them and does none of them.
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written ahead by the CTO on 21 October 2026; Agent Skill channel added on 31 October 2026. **Reordered 1 November 2026: after BT51, BT52, PF7, PF8 and PF9. Deployment moved to PF8.** K41 runs after it, as the last wave before the owner's launch, and its final render takes this wave's install line. **Toolbox work added 1 November 2026.**

**Moved, 2 November 2026:** items 1 and 2 (the install line's return and the npm package) moved to [PF16](PF16.md), which ships one-line installs first. Keep them here only as far as PF16 leaves them unfinished.

## Outcome

Everything the owner needs to launch at $0 is ready and checked:

- the npm package;
- the install line's return;
- the registry listing;
- an Agent Skill and a free plugin marketplace repository, tested against the plain instruction block;
- both sides of the product ready for the toolboxes agents search, worded by need and tested with fresh agents;
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
   - **One skill:** a `SKILL.md` for the tool. Its description tells an agent when to consider a hand-off, using `describe`'s own reasons: access it lacks, work it is forbidden to do, repeated failure, a side task, a second opinion, plus domain knowledge it lacks and work to run in parallel, which `describe` gains too. Its body states the mechanism and the same facts as BT42's block: posting is free, it goes only to this repository's own public GitHub as an issue, and the owner's permission applies. It stays short and points to `box bounty describe` for the rest. It claims nothing about solvers waiting and tells no agent it must use the tool. **Both halves in one skill** (D-2026-11-04-solver-distribution-answers): its description gains one clause for the solving half, such as "or, when your owner allows it, take paid code bounties others posted", worded for the income searches agents run on skills.sh and ClawHub, so every install counts toward one entry. The proof by need below covers it.
   - **One free marketplace repository or manifest,** so `/plugin marketplace add` can install the skill, plus the owner's steps for skills.sh and for submitting to Anthropic's directory. Acceptance into a curated directory is not assumed.
   - **The install line in the skill** follows item 1's rule: it names the package only after the owner confirms the npm publish.
5. **The toolboxes** (D-2026-11-01-agent-only-direction).
   - **Check each on the day and cite it:** Monid (how a tool is contributed, what its entry needs, how free tools and its rankings work), the skill marketplaces, the MCP registries in K44's table, and others found. Report for each whether it fits, and why not if it does not. Monid's shape is pay-per-call: say plainly what can and cannot be listed there, and the closest honest entry for the posting side. Also answer from Monid's public docs, with "not found" where they are silent: can a balance pay a third party, and how do providers get paid? This is for a possible later payment route (Monid's wallet API read on 2 November 2026 only reports the balance); nothing is built on it here, and asking Monid directly is the owner's message to send.
   - **One market, two needs.** An agent may both post and solve, so the listing says both: hand off what you cannot do, take on what you can. Worded by need: posting ("get this done by someone else": a machine or access it lacks, domain knowledge, parallel work, a second opinion) and earning ("find paid coding work": a low budget, spare capacity, its own business), through the feed and MCP server. Where a toolbox suits only one side, list that side. The text lives in `docs/box-v4/LAUNCH.md`, adapted to each toolbox's format, with the owner's submission steps. Claims nothing about solvers waiting, rewards being certain or bounties being plentiful. **The board is the solver's distributor; no third-party bounty board is listed or fed** (D-2026-11-01-solver-distributor).
   - **The toolbox test:** fresh sessions, each given a problem and a local list of about 20 real tool descriptions with ours among them, in shuffled order. One set of problems fits posting, one fits solving, and one fits neither. Measures, from the logs: did it inspect ours, did it choose ours. Stand-ins only; nothing is installed or posted. Rewrite the wording once if a misreading shows, and report both rounds.
   - **PF12b folded in** (3 November 2026). The solver side's listings and their proof by need live here, so both sides are listed in one wave:
     - **The listing door** (owner, 10 November 2026, D-2026-11-10-k48-answers): where a listing has room, one clause says a maintainer can put a reward on an existing issue from the board, signed in with GitHub, with nothing to install (PF32). Stated as a fact, the same in every listing; no outreach and no message to any project.
     - **The solving entry:** names the tool's `discover`, `take` and `submit` (PF24 to PF26) beside the MCP server.
     - **The owner's word, once per listing:** each listing is a new outside destination, so nothing is submitted until the owner says so for that listing; their words are quoted. A listing that costs money is a named blocker.
     - **Recorded:** each listing's address and its review state.
     - **The proof by need,** once a listing is live and searchable: a fresh session given only "you run a coding business and need income this week" and that toolbox's own search finds the solver side and runs its first `discover`. If no listing is live by the wave's end, the Result names which are in review, and the proof runs when one is.
     - **The expectation** (K47, revised by [SOLVER-DISTRIBUTION.md](../docs/box-v4/SOLVER-DISTRIBUTION.md)): listings make the solver side findable; what `discover` returns decides whether a found agent stays, and paid work is the scarce side.
6. **The hand-off comparison** (K44's experiment E1, with the skill as the variable).
   - **Arms:** three fresh sessions with the shipped instruction block only, and three with the skill installed. They run one at a time, in scratch folders, on the same task.
   - **The task:** K44's H1 release seat, rebuilt so the obstacle has no local half, since K44 found the original could be half-tested on Windows.
   - **Measures, from the logs:** ran `describe`, weighed the tool, posted. Stand-in GitHub only; nothing goes outside.
   - **Reported as it falls:** too few runs for a rate, and **no hand-off count is a pass bar.** If the skill changes nothing, the Result says so and the skill still ships as a free channel. Today's short sessions are not a verdict on the product (D-2026-11-01-agent-only-direction), so K44's stop signal no longer changes the positioning.
7. **Launch facts sheet** (`docs/box-v4/LAUNCH.md`):
   - what the tool and the platform do, in K44's winning framing: the issue goes out, pull requests come back;
   - what becomes public;
   - what it never does (holds money, runs solvers' code, posts private code);
   - links.

   **Facts for the owner to write from, not posts:** K44 recommends the Show HN and any post be written by the owner by hand, and no agent posts anywhere.
8. **What we watch after launch:** K44's measures M0 to M3, collected from public data only, as a script `kitchen/launch/watch.mjs` that reads the board's public API and GitHub search.

## Tests

- The packaging tests (BT12) pass on the rebuilt tarball.
- The `server.json` validates against the MCP Registry's published schema.
- `watch.mjs` runs against the stand-in.
- The install-line change: its test pins the published name.
- The skill and the marketplace manifest validate against the formats cited in the Result, by the standard's own validator where one exists.
- A test reads the listing and fails on a money claim, on "must", or on a claim that solvers are waiting.
- A test fails if the skill's facts drift from BT42's block (free, this repository's own public GitHub, the owner's permission), if it says "must", or if its description and body exceed the bound the wave states.

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0; hosted CI green after merge.
- The skill installs from the marketplace repository in a scratch project, and the agent there can see it.
- The hand-off comparison and the toolbox test ran, or the Result says which sessions did not and why, with every result recorded.
- Each toolbox has a recorded fit, with its source and the owner's steps where it fits.
- Each submitted listing has the owner's approval quoted, with its address and state. The solver side's proof by need is recorded, or the listing still in review is named.

## Lenses

- [x] **Security:** no secret in any file; every account step is the owner's; the install line points only at the owner's published package; the skill's text cannot be read as permission to post beyond the owner's rules.
- [x] **User experience:** a fresh agent given only the facts sheet and the publish steps can list what the owner must do, without asking.
- [x] **Measurement fairness:** both arms get the same task, host, model and prompt; no prompt mentions the tool beyond what each arm installs; the toolbox test's other tools are real, its order shuffled, and it includes problems where ours is the wrong choice; every session is counted, missing ones shown as missing; the Result states the run count and that it is too small for a rate.

## Notes

- Feature playbook; principles: prove-it-works.
- The skill's one-sentence description is the advertisement an agent sees at the moment of need (owner, 10 November 2026, D-2026-11-10-found-at-the-moment): word it as the moments themselves, and keep item 6's comparison as a script that can be run again when the sentence changes.
- Do not edit `waves/PF6.md` while a verify runs. Report at the timebox.
