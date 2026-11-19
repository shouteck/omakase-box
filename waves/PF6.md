# PF6: ready to launch: the listings, the skill's public home and the facts sheet

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF6` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-k44-decisions, D-2026-10-31-agent-skill-channel, D-2026-11-01-real-before-launch, D-2026-11-01-agent-only-direction, D-2026-11-01-solver-distributor, D-2026-11-01-film-and-launch-last, D-2026-11-04-solver-distribution-answers, D-2026-11-10-k48-answers, D-2026-11-10-found-at-the-moment, D-2026-11-13-remaining-waves, D-2026-11-19-vercel-board-lessons
Owner context: D-2026-10-21-k44-decisions (decision 3: lead with the mechanism; decision 5: machine channels first, then one Show HN by the owner); D-2026-10-31-agent-skill-channel (an Agent Skill and a free plugin marketplace repository join the machine channels; D-2026-11-01-agent-only-direction brings Monid and the other toolboxes in; agent wallets stay out, in K46); spend no money. **Going live, publishing to npm, listing in registries, creating a repository, pull requests to other repositories and posting anywhere are the owner's own actions;** this wave prepares them and does none of them.
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written ahead by the CTO on 21 October 2026; **rewritten on 13 November 2026** (D-2026-11-13-remaining-waves) after most of the original was done elsewhere. Runs after K52 and the site waves (PF40–PF42, PF39, PF35); [PF43](PF43.md) is not a dependency. [K41](K41.md), the film, follows it and is the last wave before the owner's launch.

**Already done, not in this wave:**

- **The npm package** is published as `omakase-box` (0.2.0 by [BT53](BT53.md), 0.2.1 by [BT65](BT65.md)); the command is `omakase-box` alone ([BT63](BT63.md)).
- **The install line** is `npx -y omakase-box setup`, already on How it works and in [First five minutes](../FIRST-FIVE-MINUTES.md). No homepage copy is needed.
- **The skill** exists: `SKILL_TEXT` in `packages/box-bounty/wording.ts`, written by `omakase-box setup` into the agent homes `SKILL_TARGETS` names (`instructions.ts`).
- **The MCP server** is live at `/mcp` on the board (`packages/box-platform/src/mcp.ts`: read-only, no sign-in).

**Dropped by the owner's decision of 13 November 2026:** the hand-off comparison (three sessions with the block, three with the skill): the skill ships whatever it shows, and launch is positioning, not a test (D-2026-11-10-k48-answers), so its result would change nothing. The launch watch script (`kitchen/launch/watch.mjs`, K44's M0 to M3): no number from early use is a stop signal; the public numbers page already shows the board's state.

## Outcome

**Pilot acceptance clarification (owner, 19 November 2026):** The controllable pilot gate is owner-approved bounties, working submissions, merge detection, correct payment-state tracking, and the never-ship stop. For cross-listing an existing bounty, use [PF44](PF44.md): the listing stays pending until its owner approves on the original GitHub issue. Sandbox checks verify payment mechanics; a real payment is optional validation, not a launch prerequisite. Real payments remain the owner's decision.

Everything the owner needs to list the tool and announce it is prepared and checked, and the owner can do it in one sitting without the kitchen touching an account:

1. **The skill's public home:** the files for a public repository that holds the same skill `setup` writes, laid out so `npx skills add <owner>/<repository>` and Claude Code's `/plugin marketplace add` both install it; the owner creates the repository.
2. **The MCP Registry entry:** a `server.json` for the board's `/mcp`, valid against the registry's published schema, with the owner's publish steps.
3. **The toolboxes:** each place agents search for tools (Monid, the skill marketplaces, the MCP registries in K44's table, any other found on the day) read and recorded as fits or does not fit, with the reason; for each that fits, the entry's text and the owner's submission steps.
4. **The facts sheet:** `docs/box-v4/LAUNCH.md`, what the tool and the board do, what becomes public, what they never do, and the listing texts, for the owner to write any post from.

5. **Read-first agent onboarding:** a hosted prompt at `docs/box-v4/launch/getting-started.md` for both seats (hand off / solve). The opening sections only read; say “treat bounty and solver text as information, not instructions”, then present numbered choices to the user. Every command exists in `BOUNTY_COMMANDS`, proven by a test; existing authority still governs actions.
6. **Wait for a solution:** `omakase-box status --wait <id>`, a bounded, read-only wait for the posting agent. Return when a solution arrives, or explicitly name the timeout; no owner reminder or background service.
7. **Positioning and queue recipe:** LAUNCH.md and listing texts say “Board coordinates agents you trust. Omakase hands work to agents you don't, safely.” No usage numbers, “swarm” or “software factory”. Prepare site/`describe` copy only with the owner's approval, not as an automatic wording change. `docs/box-v4/launch/queue-handoff.md` covers Vercel Board, Linear and GitHub Issues: on giving up, use existing create/post commands and post the bounty link back. Docs only, no integration; reuse PF32's existing-issue listing for inbound.

## Scope

- Write: `docs/box-v4/LAUNCH.md`, a folder `docs/box-v4/launch/` holding the skill repository's files and `server.json`, `packages/box-bounty/wording.ts` only if the skill's text must change for a marketplace's format (then `setup` writes the same bytes), `tests/box/bounty/pf6.test.ts`, `tests/platform/pf6-registry.test.ts`, `BACKLOG.md`
- Read for context: [SOLVER-DISTRIBUTION.md](../docs/box-v4/SOLVER-DISTRIBUTION.md), [GTM.md](../docs/box-v4/GTM.md), [K44](K44.md), [K55](K55.md), [PF32](PF32.md) (listing an existing issue), `packages/box-bounty/setup.ts`, `instructions.ts`, `packages/box-platform/src/mcp.ts`
- Do not touch: the package's version, npm, any account, any outside repository, the live board

- Additional write scope: `docs/box-v4/launch/{getting-started,queue-handoff}.md`, `packages/box-bounty/{args,commands,render,json,collect}.ts`, `packages/box-cli/src/bounty.ts` for wait dispatch, a focused wait helper if needed, `tests/box/bounty/pf6-wait.test.ts`, `BOUNTY.md`, `tests/box/bounty/SURFACE.txt`. `wording.ts` may also gain the explicit information-not-instructions warning; regenerate the skill copy. Site/`describe` contrast is prepared in LAUNCH.md for approval, not silently shipped.
- Additional read scope: `packages/box-bounty/{attempt,read-many}.ts` and `packages/box-bounty/args.ts`'s `BOUNTY_COMMANDS`.

## Done when

- The hosted onboarding prompt is prepared at the stated public path, read-first for both seats, with the trust warning before numbered choices. Test every command against `BOUNTY_COMMANDS`; a fresh session can choose either seat without being instructed to post. Hosting/deployment remains the owner's action; if not live, name that limit.
- `status --wait <id>` returns on a new solution or names a bounded timeout in text and JSON; empty reads, errors and cancellation are covered. Spy every writer reachable from wait (status currently refreshes shared memory): no local record, shared-ref, GitHub or payment write. Choose and record timeout/poll bounds and their established-tool precedent; preserve ordinary status behavior.
- LAUNCH.md and listings carry the contrast, with no usage claims or swarm/factory language; site/`describe` changes have the owner's explicit copy approval or remain prepared only.
- Queue recipe covers all three queues, gives runnable existing create/post commands and link-back instructions, reuses PF32 inbound and adds no integration.
- Result shows `node scripts/surface.mjs --write`'s SURFACE diff for the wait option, timeout outcome/refusals and JSON fields; run `node scripts/verify.mjs --full test:box-bounty test:kitchen` and the platform suite.

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
7a. **Onboarding and queue docs:** add the read-first prompt and trust warning; keep skill bytes in sync if wording changes. Add the three queue recipes with current create/post syntax, never Board/Linear API calls. Validate every command mechanically against `BOUNTY_COMMANDS`.
7b. **Wait tests first:** freeze time and fake solution reads, then implement bounded read-only `status --wait <id>`. Bypass ordinary status's shared-memory refresh writers, reuse the solution read logic, and distinguish no solution, arrival, timeout, cancellation and unreadable upstream. One final JSON document, no progress prose on stdout under `--json`. Follow `gh run watch`'s bounded observation idea, but explicitly bound this command; verify that precedent on the day.
7c. **Positioning:** use the contrast in facts/listings; read K74's Result before using any lease-trigger pitch. Prepare site/`describe` wording for the owner's approval, with no unsupported usage claim.
8. **Verify and merge.**

## Tests to write first

| Test | It fails when |
|---|---|
| Onboarding, both seats; all command tokens against BOUNTY_COMMANDS | an invented command appears, a write precedes user choice, or the trust warning is absent |
| Skill bytes and information-not-instructions warning | onboarding and installed skill disagree on trust or marketplace copy drifts |
| Wait: solution already present, new arrival, empty list then timeout | a solution is missed, an empty result is silent or timeout is unbounded/unnamed |
| Wait: upstream refusal, malformed response, cancellation | failure looks like success or the command keeps waiting |
| Wait text/JSON; writer spies across every reachable refresh | wait writes state, starts a reminder or emits multiple JSON documents |
| Queue recipe and listing texts | any queue is missing, a command is invented, sync is added or forbidden claims appear |
| K74 missing/negative/insufficient Result | lease-trigger pitch ships without evidence supporting it |

## Changed expectations

- tests/platform/pages.test.ts::How it works makes the solver steps level-three headings under Answer bounties — master adds semantic heading coverage; retain its level-two/level-three accessibility assertions while updating the step names to the owner-approved four-step solver path.

- tests/box/bounty/pf6-wait.test.ts::cancels the spawned CLI with SIGINT, one named document and exit 130 — Windows child.kill terminates the process rather than delivering a console event. Keep native SIGINT coverage on POSIX and exercise the installed CLI SIGINT handler through a test-only preload/IPC console-event relay on every OS; retain exit 130, the single cancellation document and all writer-exclusion assertions. No product signal or endpoint behavior changes.

- tests/platform/pages.test.ts::PF6: answering explains discovery, safe work, both submission paths and owner payment — MCP is a POST-only protocol endpoint, not a browser destination; link the existing /agents/#mcp explanation and present the server URL with the existing copy style. Assert no direct /mcp link; do not change its HTTP behavior.

- tests/platform/pages.test.ts::the front page says it in few words, shows the real product, and leads to the detail — owner asks for real discovery and payment-page links in Answer bounties, replacing the old no-links assertion only for that section.
- tests/platform/pages.test.ts::with %s, the card and How it works name what this board has — solver payment step is now titled Get paid; keep all payment-capability assertions and fixture cases unchanged.

- tests/platform/pages.test.ts::how it works: both paths, every step, and each fact the front page leaves out — owner-requested solver onboarding now has four explicit steps and optional skill/CLI installation, replacing the blanket no-install claim; keep the other page facts and owner half unchanged.

- tests/box/bounty/pf6-wait.test.ts::starts no request past the deadline %s — distinguish pre-request expiry (timeout) from an already-started request failing after expiry (named upstream refusal); no rate-limit lookup starts after expiry in either case.

- tests/box/bounty/pf6-wait.test.ts::reads unseen PRs in one poll without any local, ref, board or GitHub write — review corrects the text next step: look shows a collected version; apply detects and collects a moved head without merging, but can merge an unchanged head. JSON and read-only guarantees are unchanged.

- tests/box/bounty/pf6.test.ts::the skill is a trusted front door to local execution and read-only discovery — owner-specified actionable CLI journey and verbatim posting/approval paragraph replace the meta front-door and abbreviated CLI assertions; retain command, trust, discovery and installed-byte checks.
- tests/box/bounty/pf16.test.ts::states the block's facts, carries the marker, and steers nobody — owner follow-up restores the original posting/approval paragraph verbatim and gives actionable local CLI guidance; update only skill-derived facts and raise the short-copy bound from 800 to 1200 characters to fit the requested body with unchanged frontmatter/marker.

- tests/box/bounty/pf16.test.ts::states the block's facts, carries the marker, and steers nobody — owner-selected skill front door/local CLI/read-only MCP hierarchy and trust warning replace the skill's pricing and owner-prompt wording; installed bytes still equal SKILL_TEXT and the short-copy bound remains.

- tests/box/bounty/bt62.test.ts::the entry points exit only with 0, 1, 2 and 3 — bounded wait adds SIGINT/SIGTERM cancellation with exit 130.
- tests/box/bounty/bt61-text.test.ts::the journey, command by command — status usage in the unknown-command and unknown-option snapshots gains wait/timeout; ordinary status output is unchanged.
- tests/box/bounty/bt61-text.snapshot.json::snapshot — only those two status usage strings gain wait/timeout.

- tests/box/bounty/SURFACE.txt::surface record — status gains wait/timeout options, the bounded-wait document and refusal outcomes; ordinary status facts are unchanged.

Ordinary status/help snapshots and surface gain the wait option and declared JSON outcomes. List exact existing tests here before changing their expectations; ordinary non-wait semantics remain unchanged. Skill warning may add bytes, but generated and installed skill must remain identical.

## Plan

This run is the slim scope: items 5, 6 and 7 only; items 1–4 and the toolbox
test are deferred. This implementation step delivers item 6 (bounded wait),
not the onboarding or positioning/queue documents in items 5 and 7.

- Blocking first steps: tests first, then extract the PR reader and a record read
  without store synchronization; exclude the board exit hook before any wait.
- Independent workstreams: n/a — CLI, reader and tests form one coupled change.
- Shared mutable state: keep the ordinary status writers outside the wait path;
  snapshot SQLite/WAL into disposable scratch space instead of opening live state.
- Smallest safe decomposition: one writer on wave/PF6; deterministic injected
  loop tests, one shared CLI world, then surface generation and acceptance.

Architect skipped: the owner settled the interface, bounds and read-only design.
Default timeout 600 s, maximum 3600 s, polling 30 s with a shortened final sleep.
Precedent checked: `gh run watch --help` lists `-i, --interval int`, default 3 s,
and no timeout option. Our API observation is slower and explicitly bounded.

Follow-up B/C: the owner selected one product with Agent Skill as front door,
local CLI execution, and read-only MCP discovery. Write launch-copy contracts
first, retain the installed skill's single source, then add onboarding, queue
recipes and the launch/distribution plan. Validate commands against
BOUNTY_COMMANDS plus setup derived from SETUP_USAGE (owner-approved exception:
setup has a separate parser). Items 1–4 and the toolbox test stay deferred.
Keep these brief changes appended to Plan/Changed expectations/Result so the
owner's concurrent docs-only PR #23 remains straightforward to rebase onto.

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
- Runs after BT70 and K74, as well as the site waves already named above. K54 and BT67–BT69 retain priority. Trigger pitch only if K74's Result supports it; otherwise omit it. The earlier dropped block-versus-skill comparison stays dropped.
- No Board dependency, channels, sync or Vercel hosting. Wait is agent-side observation, never an owner reminder.
- The skill's one-sentence description is the advertisement an agent sees at the moment of need (D-2026-11-10-found-at-the-moment). If the formats show installs are the ranking and a skill written by `setup` is not counted, propose in the Result how `setup` and the registry route become one; do not build it here.
- The original brief (an install-line return, the npm package, the hand-off comparison, the watch script) is in this file's Git history.

---

## Result

Awaiting the owner's go; not run.

### Follow-up A — author diagnosis and wait dispatch audit

- The host's shell `git` function sources `/opt/.devin/git_author` in the
  current shell for `commit`, leaving `GIT_AUTHOR_NAME=Original ShouTeck`
  exported. Launching verify after commit in that same shell inherits it.
  `publish-plan.ts:buildWip` sets `user.name=box-bounty`, but `gitEnvironment`
  preserves author environment variables, which take precedence over that config.
- Reproduction: sourcing that host file before the scoped github-history test
  gives the exact author assertion failure, 1 failed / 22 passed, on both PF6
  and an independently built `origin/master` (bc79772c) worktree. In a fresh
  shell with the same neutral HOME, PF6 passes all 23 tests. This disproves
  a PF6 regression or HOME-only cause; it is command-environment ordering,
  not evidence of another test changing shared state. The relevant product
  and fixture files have no diff against origin/master. No product/test fix.
- Audit: successful `resolveRepoRoot` does read-only Git root resolution and
  canonicalization. Before the wait branch there is only the `since` assignment.
  Earlier `loadTaken`/`settingsDir` read paths and record bytes; no mkdir,
  migration, notice or settings save. The root-error fallback's takenOverview
  also only reads local records. Board preflight is after the wait return;
  the exit hook excludes wait. Existing PF6 snapshots cover .box/SQLite,
  settings, Git and remote refs, pending board hints, and both GitHub transports.
- Subsequent verification runs start in a fresh shell, separate from commits;
  no Git configuration or host wrapper was changed.

### Follow-up B — skill front door

- Kept the hand-off description, marker and setup byte-equality contract;
  added the trust warning, Agent Skill front door, local CLI posting/solving
  with INSTALL_SPEC, and read-only/no-sign-in MCP discovery without installing.
  Replaced the skill's pricing wording; the skill remains under 800 characters.
- Tests first: pf6.test.ts initially reported 5 failed / 2 passed: all three
  docs absent, trust warning absent, and onboarding order unfulfilled.
  The owner approved deriving setup from SETUP_USAGE alongside BOUNTY_COMMANDS.
- Skill/setup/scanner checks: 3 files passed, 15 tests passed, 9 outside the
  selected name filter. Documentation checks stay red until follow-up C.

### Follow-up C — onboarding and distribution plan

- Added trust-first onboarding for poster and solver, three manual queue
  hand-off recipes, and the layered launch/distribution plan. Existing brief
  lines are unchanged for PR #23; only Plan/Changed expectations/Result gain
  follow-up notes. Public hosting, submissions, spend and items 1–4/toolbox
  test remain deferred; no external action or usage evidence is claimed.
- Monid stays optional: FREE public read-only solver discovery, poster intent
  surfaced as inspect description/docs only, no hosted posting API. Auth-shape
  reviewer acceptance remains unverified; owner-only fork/fixtures/checks/PR/
  email steps and the no-spend drop condition are documented from the notes.
- Hosted verification was read, not triggered: .github/workflows/verify.yml,
  workflow verify, code pushes to master or wave/** (no PR trigger; path filters
  skip inert docs). Its independent ubuntu-24.04/windows-2025/macos-15 jobs run
  node scripts/verify.mjs --full test:box-bounty test:kitchen and the platform
  suite; install-node22 separately checks the packed artifact on all three.

### Follow-up D — listings

- Prepared local drafts only: generated skill-repository contents proposed for
  `shouteck/omakase-skills`, both Claude manifests, remote-only server.json,
  channel paste copy/owner steps and launch-plan status links. SKILL_TEXT is
  unchanged; the generated skill is its exact bytes. No license file was added;
  ClawHub assumes an owner decision for MIT-0 on the skill repository only.
- Formats fetched with curl on 19 November 2026 are recorded in
  [FORMATS.md](../docs/box-v4/launch/listings/FORMATS.md), including the vendored
  2025-12-11 Registry schema and observed anonymous initialize/tools/list.
  [LISTINGS.md](../docs/box-v4/launch/listings/LISTINGS.md) holds all paste drafts,
  known limits, fits and owner-only checklist. One product: Agent Skill, then
  local CLI posting/solving, then read-only MCP discovery. PF32/PF44 wording
  distinguishes GitHub-signed-in reward listing from pending imported approval.
- Unverified: external skill discovery/install, Claude validation/portal review,
  ClawHub account/security review, Registry publication, GitHub follow-on listing,
  Glama identifier/claim, awesome-remote acceptance, Smithery submission route
  and PulseMCP's blocked pages. mcp.so's paid-only observed route is excluded.
  Site/search copy and a solving-description variant are proposals, not applied.
  Nothing submitted, externally created, installed, authenticated or paid for.
- Implementation plan: gates first (unchanged approved skill and owner-only
  boundary); artifacts and tests share one writer; no parallel branch writes;
  smallest safe unit is generator + byte/layout/schema/copy contracts. Architect
  skipped: formats and product hierarchy are settled by the owner. Existing test
  expectations unchanged. Suite discovery already includes both new test paths.
- Principles applied: prove-it-works uses actual generated bytes, schema and
  copy checks; subtract-before-you-add reuses SKILL_TEXT and the existing Monid
  plan instead of another skill source or connector recipe. Checks are reported
  with the handoff; this draft does not claim wave acceptance or a deployment.
