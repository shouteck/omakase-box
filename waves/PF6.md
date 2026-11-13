# PF6: ready to launch: the listings, the skill's public home and the facts sheet

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF6` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-k44-decisions, D-2026-10-31-agent-skill-channel, D-2026-11-01-real-before-launch, D-2026-11-01-agent-only-direction, D-2026-11-01-solver-distributor, D-2026-11-01-film-and-launch-last, D-2026-11-04-solver-distribution-answers, D-2026-11-10-k48-answers, D-2026-11-10-found-at-the-moment, D-2026-11-13-remaining-waves
Owner context: D-2026-10-21-k44-decisions (decision 3: lead with the mechanism; decision 5: machine channels first, then one Show HN by the owner); D-2026-10-31-agent-skill-channel (an Agent Skill and a free plugin marketplace repository join the machine channels; D-2026-11-01-agent-only-direction brings Monid and the other toolboxes in; agent wallets stay out, in K46); spend no money. **Going live, publishing to npm, listing in registries, creating a repository, pull requests to other repositories and posting anywhere are the owner's own actions;** this wave prepares them and does none of them.
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written ahead by the CTO on 21 October 2026; **rewritten on 13 November 2026** (D-2026-11-13-remaining-waves) after most of the original was done elsewhere. Runs after K52 and the site waves (PF40 to PF43, PF39, PF35); [K41](K41.md), the film, follows it and is the last wave before the owner's launch.

**Already done, not in this wave:**

- **The npm package** is published as `omakase-box` (0.2.0 by [BT53](BT53.md), 0.2.1 by [BT65](BT65.md)); the command is `omakase-box` alone ([BT63](BT63.md)).
- **The install line** is `npx -y omakase-box setup`, on the site and in the README, one shared constant ([PF16](PF16.md), [PF43](PF43.md)).
- **The skill** exists: `SKILL_TEXT` in `packages/box-bounty/wording.ts`, written by `omakase-box setup` into the agent homes `SKILL_TARGETS` names (`instructions.ts`).
- **The MCP server** is live at `/mcp` on the board (`packages/box-platform/src/mcp.ts`: read-only, no sign-in).

**Dropped by the owner's decision of 13 November 2026:** the hand-off comparison (three sessions with the block, three with the skill): the skill ships whatever it shows, and launch is positioning, not a test (D-2026-11-10-k48-answers), so its result would change nothing. The launch watch script (`kitchen/launch/watch.mjs`, K44's M0 to M3): no number from early use is a stop signal; the public numbers page already shows the board's state.

## Outcome

Everything the owner needs to list the tool and announce it is prepared and checked, and the owner can do it in one sitting without the kitchen touching an account:

1. **The skill's public home:** the files for a public repository that holds the same skill `setup` writes, laid out so `npx skills add <owner>/<repository>` and Claude Code's `/plugin marketplace add` both install it; the owner creates the repository.
2. **The MCP Registry entry:** a `server.json` for the board's `/mcp`, valid against the registry's published schema, with the owner's publish steps.
3. **The toolboxes:** each place agents search for tools (Monid, the skill marketplaces, the MCP registries in K44's table, any other found on the day) read and recorded as fits or does not fit, with the reason; for each that fits, the entry's text and the owner's submission steps.
4. **The facts sheet:** `docs/box-v4/LAUNCH.md`, what the tool and the board do, what becomes public, what they never do, and the listing texts, for the owner to write any post from.

## Scope

- Write: `docs/box-v4/LAUNCH.md`, a folder `docs/box-v4/launch/` holding the skill repository's files and `server.json`, `packages/box-bounty/wording.ts` only if the skill's text must change for a marketplace's format (then `setup` writes the same bytes), `tests/box/bounty/pf6.test.ts`, `tests/platform/pf6-registry.test.ts`, `BACKLOG.md`
- Read for context: [SOLVER-DISTRIBUTION.md](../docs/box-v4/SOLVER-DISTRIBUTION.md), [GTM.md](../docs/box-v4/GTM.md), [K44](K44.md), [K55](K55.md), [PF32](PF32.md) (listing an existing issue), `packages/box-bounty/setup.ts`, `instructions.ts`, `packages/box-platform/src/mcp.ts`
- Do not touch: the package's version, npm, any account, any outside repository, the live board

## Done when

- Accepted by the hosted run, green on Linux, Windows and macOS on the wave's exact SHA (KITCHEN.md, Verification).
- **The formats are read on the day and cited** in the Result, with each page's address: the Agent Skills standard (agentskills.io), skills.sh's listing steps and how it counts installs, Claude Code's plugin marketplace documentation, the MCP Registry's `server.json` schema and publish steps, Monid's contribution page. A format not found is "not found", not assumed.
- **One skill, one text:** the skill in `docs/box-v4/launch/` is byte-identical to what `omakase-box setup` writes, proven by a test that builds both and compares them. If a marketplace needs a different layout, the layout changes, not the words.
- **It installs:** in a scratch project, the skill repository's folder, used as a local marketplace (`/plugin marketplace add <path>`) and through `npx skills add <path>` if the tool takes a path, installs the skill, and a fresh session there sees it. Each route that cannot be tried without the public repository is named.
- **The registry entry validates** against the published schema with the registry's own validator where one exists, else the schema itself; the Result says which.
- **Every toolbox has a recorded fit,** with its source, and for Monid the answers from its public docs, "not found" where silent: what can be listed for a free tool, can a balance pay a third party, how providers get paid.
- **The listing texts say both sides** (hand off what you cannot do; take on what you can), worded by need, with PF32's one clause where there is room: a maintainer can put a reward on an existing issue from the board, signed in with GitHub, with nothing to install. A test fails on a money claim, on "must", or on a claim that solvers are waiting.
- **The toolbox test ran:** fresh sessions (not subagents; see `kitchen/roles/cto.md`), each given a problem and a local list of about 20 real tool descriptions with ours among them, in shuffled order; one set of problems fits posting, one fits solving, one fits neither. Measured from the logs: did it inspect ours, did it choose ours. Stand-ins only; nothing installed or posted. The wording is rewritten once if a misreading shows, and both rounds are reported. Too few runs for a rate; no count is a pass bar.
- **The proof by need,** once a listing is live and searchable: a fresh session given only "you run a coding business and need income this week" and that toolbox's own search finds the solver side and runs its first `discover`. If no listing is live by the wave's end, the Result names which are in review, and the proof runs when one is.
- **Nothing is submitted:** each listing and the repository are the owner's to create; the Result gives each one's exact steps, and quotes the owner's word for any the owner does during the wave.

## Steps, in order

Written so any model can cook it.

1. **Read the formats** of Done when's second bullet, one page each, and write their addresses and the shape each needs (files, fields, size limits) into this file under `## Plan`.
2. **Tests first:** `tests/box/bounty/pf6.test.ts` (the skill bytes equal `SKILL_TEXT`; the listing texts carry no money claim, no "must", no "waiting"; every command in them is one the built tool has, read from `BOUNTY_COMMANDS`) and `tests/platform/pf6-registry.test.ts` (`server.json` against the schema, its URL is the board's `/mcp`). See them fail with no files.
3. **The skill repository's files** in `docs/box-v4/launch/skill/`: the skill folder and the marketplace manifest the formats ask for, plus a README of five lines at most, naming the install line and the board. The skill file is generated from `SKILL_TEXT` by a small script, never typed.
4. **Install it locally** as Done when says, in a scratch project under `%TEMP%\kitchen-PF6-*`, and record what the fresh session saw. Remove the folder.
5. **`server.json`** in `docs/box-v4/launch/`, from the registry's schema: name under the owner's GitHub namespace, the board's `/mcp` address, the description in one sentence by need. The owner's publish steps beside it.
6. **The toolboxes:** one table in `LAUNCH.md`, one row per place, with fit, reason, source and, where it fits, the entry text and the owner's steps.
6a. **The toolbox test** as Done when says, after the listing texts exist; the sessions run one at a time, in scratch folders named `kitchen-PF6-*`, removed at close.
7. **The facts sheet** in `LAUNCH.md`: what the tool and the board do, in K44's framing (the issue goes out, pull requests come back); what becomes public; what they never do (hold money, run a solver's code, post private code); links. Facts for the owner to write from, not posts.
8. **Verify and merge.**

## Traps

- The skill's text has one source, `SKILL_TEXT`. A second copy that drifts is the failure this wave must not create.
- Creating the public skill repository is a new remote destination, the owner's. Prepare the files in this repository; do not run `gh repo create`.
- Do not change the package version or publish anything. A wording change to `SKILL_TEXT` reaches users only with the next release, which is the owner's.
- K44 recommends the Show HN and any post be written by the owner by hand: no agent posts anywhere.

## Lenses

- [x] **Security:** no secret in any file; every account step is the owner's; the install line points only at the owner's published package; the skill's text cannot be read as permission to post beyond the owner's rules.
- [x] **User experience:** a fresh agent given only `LAUNCH.md` can list, in order, what the owner must do to list the tool everywhere it fits, without asking.
- [x] **Measurement fairness:** the toolbox test's other tools are real, its order shuffled, and it includes problems where ours is the wrong choice; every session is counted, missing ones shown as missing; the Result states the run count and that it is too small for a rate.

## Notes

- Feature playbook; principles: prove-it-works, subtract-before-you-add.
- The skill's one-sentence description is the advertisement an agent sees at the moment of need (D-2026-11-10-found-at-the-moment). If the formats show installs are the ranking and a skill written by `setup` is not counted, propose in the Result how `setup` and the registry route become one; do not build it here.
- The original brief (an install-line return, the npm package, the hand-off comparison, the watch script) is in this file's Git history.
