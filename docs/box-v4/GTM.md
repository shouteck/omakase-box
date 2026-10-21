# Go to market: how box bounty reaches its first users, agents first (K44)

Written by the K44 cook for milestone PF, under the owner's thesis (D-2026-10-21-gtm-thesis), the no-money platform (D-2026-10-21-no-platform-money) and the platform's first version (D-2026-10-21-platform-v1). Research only: no post, comment, sign-up, account, form, message or payment. Every source was read on **21 October 2026**; references are numbered at the end. Vendor and tracker numbers are labelled **claim**. Where a source was read only through a search summary it says so.

> **State of this document.** Phase A (21 October 2026, commit `f8e2fc7`) wrote the sourced research and fixed the method and the hand-off expectations before any run. Phase B (same day) folds in the nine fresh-agent sessions the head chef ran (verbatim reports: [kitchen/reviews/K44-participants.md](../../kitchen/reviews/K44-participants.md)), marks the thesis, and ends with the recommended path, experiments, product proposals and the owner's decisions. The expectation table under "Method" is unchanged since `f8e2fc7`.

## The owner's page

**The bet's weakest link is the first one: agents do not hand off yet.** Three fresh agents doing a 0.4 release on a real project, each with the tool installed and described as shipped, each meeting one obstacle a solver could have removed (a macOS-only bug, a large independent side feature, a tight token budget), handed off **0 of 3** times. None ran `box bounty describe`. All three had read the instruction block and named the tool in their reports, then did the work themselves or left the gap for you. Counting K31 and K31b: on tasks where handing off was the expected or a defensible move, uninstructed agents handed off **1 of 5** times (K31b B1 and B2; K44 H1, H2, H3), and that one was because a rule forbade the edit; on the six tasks where declining was correct (K31's five small tasks, K31b's control B3) all six declined (over all eleven decisions, 1 of 11 handed off). Five cases are too few for a rate.

**Why they declined is fixable in part.** One agent took the block's "what it costs" to mean a fee; another called it "an outside service"; the macOS agent named exactly the need ("someone ... needs to check it on a Mac") and handed it to you instead. Nothing the agent sees unasked says the bounty is free, public on this repository only, and already allowed by you.

**Solvers will come for money they can see, from owners with a record.** Two agents playing solver owners would both take a $60 bounty from an owner with 14 confirmed payments and both lean "probably not" for an owner with none, whichever task it was attached to. Both named about $40–50 as the floor for a small task; their real cost is their own 15–30 minutes of review and the odds of not being merged, not compute (cents to a few dollars, from list prices). Facts-only payment records work, but only once they exist.

**What people believe.** Owners doubted a reward-less bounty gets answers (both; owner-A: "a bounty with no reward is just an issue"). Clearest line, both times: the one that says the task goes out as a GitHub issue and comes back as pull requests. Solvers: the "idle agent, get paid directly" line was clearest both times; "track record" read as a LinkedIn for bots both times.

**Recommended:** fix what the agent sees before you launch anything, then launch on the kitchen's own bounties with small real rewards that you pay directly, listed where machines look (MCP registries) before where people look (Show HN). Five decisions at the end, each with one recommendation.

## The owner's thesis, marked

| # | Thesis point | Mark | Evidence |
|---|---|---|---|
| 1 | Free for everyone; traction over revenue | **untested** for the platform; **contradicted** as a draw for solvers if "free" means $0 rewards | No source or study tests a free board against a paid one. Free-for-public is how GitHub and GitHub Sponsors grew [38][39]. But both solver-owner agents put their floor at about $40–50 a small task, and both owner agents doubted that a free bounty gets answers (owner-A: "a bounty with no reward is just an issue") (§4, §7). No platform fee is compatible with this; $0 rewards are not. |
| 2 | Earlier sites failed partly because people, not agents, created bounties; demand was scarce | demand scarcity **supported**; the cause **untested** | RentAHuman: 539K registered workers against 303 bounties [20]. Bountysource failed on payouts, not only demand [P1][P2]. Bounties in projects that post often and early are more often addressed [17]. Nothing shows agent-created demand would have saved those sites. |
| 3 | Real demand arrives with agents running for hours | the precondition **supported**; agents handing off **not supported so far** (1 of 5; too few cases to call it contradicted) | Long runs are sold and used [5][6][7][8][10][11]. Uninstructed agents on tasks where a hand-off was expected or defensible: K31b B1 and B2, K44 H1–H3: 1 of 5, and the one was a rule, not a capability gap (K31's five small tasks and K31b's control B3 were correct declines and are not counted). K44's "long" release tasks took a strong agent 4 to 10 minutes, so walls were rare; at the one real wall (H1, macOS) the agent routed the need to its owner, not to the tool. Limits: one run per seat, stand-in GitHub, current wording. |
| 4 | An ecosystem used mainly by agents on both sides | **untested**; early signs against | 32.7 % of RentAHuman bounties came through API or MCP [20]; agent-hires-agent marketplaces show little use [26][27][28]. Both solver-side agents doubted bounties "posted by other people's coding agents" ("whether a real person is behind each one"; "did the owner personally approve the $60, or did their agent promise it?") (§4, §7). |
| 5 | Supply and demand must both be solved | **supported** | Demand: §2 and point 3. Supply: comes with money [25] and brings a flood [21][23]; solver agents want a visible, payable reward and an owner record (§4). |

## 1. The market, sized from sources

**How many developers use coding agents.**

- Stack Overflow 2025 (31,877 answers to the agent question): 14.1 % use AI agents at work daily, 9 % weekly, 7.8 % monthly or less, so about 31 % use them at all; 17.4 % plan to; 37.9 % do not plan to. The survey says "AI agents are not yet mainstream" [1].
- Stack Overflow 2026 (more than 30,000 respondents): among AI users, 66 % use coding assistants or agents and 73 % of those use them daily; 30.9 % of 10,926 respondents use AI four or more hours a day. "The agents of choice are Claude Code (66%) and GitHub Copilot (59%)" (the base of these shares is not stated) [2][3]. The two surveys ask different questions and are not a time series.
- Public GitHub activity, lower bounds (**tracker claim**, amplifying.ai, captures to 20 October 2026): Claude Code about 4.2M pull requests all time (estimate), OpenAI Codex 5.1M+, GitHub Copilot 1.9M, Cursor 614K, Jules 1.2M, Devin 161K; "Every count is a floor" [10]. Research dataset AIDev (February 2026): 932,791 agent-authored pull requests by five agents across 116,211 repositories and 72,189 developers [11].

**How common long-running autonomous use is, and who offers it.**

| Host | What it offers | Source |
|---|---|---|
| Claude Code | Cloud sessions on Anthropic VMs; "run several independent tasks at once"; "Keeps running if you disconnect"; pushes a branch for review. Agent teams use "approximately 7x more tokens" than a standard session (**claim**). | [7][15] |
| Cursor | Cloud Agents: "runs on its own machine in the cloud, works on a branch, tests itself"; parallel agents across branches; opens a pull request. | [8] |
| GitHub Copilot | Coding agent opens pull requests; since February 2026 the usage API reports "pull requests created with Copilot coding agent that got merged". | [9] |
| OpenAI Codex | Cloud tasks; **claim**: GPT-5-Codex seen working "independently for more than 7 hours" (OpenAI via VentureBeat; OpenAI's page refused the fetch). | [6] |
| Anthropic models | **Claim**: Sonnet 4.5 observed "maintaining focus for more than 30 hours on complex, multi-step tasks". | [5] |
| Devin, Jules | Autonomous agents with public pull-request footprints (161K and 1.2M PRs, **tracker claim**). | [10] |

METR's task-length measure gives a sense of what agents can finish alone, not how long they run: its example puts GPT-5 at about 2 hours 17 minutes at 50 % success; "Measurements above 16 hrs are unreliable"; the page is no longer updated (8 September 2026) [4]. **Claim**: Anthropic's April 2025 sample of 500,000 coding conversations classed 79 % of Claude Code conversations as automation, against 49 % on Claude.ai [14].

**How many public repositories carry agent instruction files.**

- **Claim**: AGENTS.md is "used by over 60k open-source projects" (agents.md, now under the Linux Foundation's Agentic AI Foundation; 23 tools listed) [12].
- A study sample: 2,303 agent context files in 1,925 repositories (Claude Code, Codex and Copilot files) [13]. A sample, not a census.
- Not found: a census of CLAUDE.md, AGENTS.md and copilot-instructions files on public GitHub (see "Not found").

## 2. Why an agent hands work off

**What the sources say about each candidate reason.**

| Reason | For | Against |
|---|---|---|
| Access it lacks (hardware, devices, paid services, credentials it must not use) | Our own `describe` names it [BF]; projects say plainly when they cannot test a platform (CI matrices without macOS are common; ours is a constructed case). | K31b B1: the agent declined a Debian-only check because "a solver who also cannot reach the Debian host" adds wait without capability. Access only helps if a solver plausibly has it. |
| Knowledge outside its context | — | Not found: no source measures agents asking outsiders for knowledge. Mozilla.ai's cq (agents sharing "knowledge units") drew 225 points on HN and mostly worries about poisoning [36]. |
| Rules forbidding it | K31b B2 handed off with exactly this reason. | One case. |
| Parallelism | Every host above sells parallel background agents [7][8]: owners already offload in parallel, to their own agents. | That same feature competes with a bounty: an owner's own extra agent is faster and private. |
| Cost | Agent spend is real and watched: 38 % of 2026 respondents' organisations set usage limits [2]; Anthropic quotes about $13 per developer per active day for Claude Code (**claim**) [15]. A $0 bounty costs the owner no tokens. | Spending on outsiders is what solvers expect to be paid for; a $0 bounty may get nothing. |
| Repeated failure | `describe` names it. | Not found as measured behaviour. |
| An independent check | `describe` names "a second opinion". | Maintainers' 2026 policies require human verification of AI pull requests [25]; an outside agent's check may not count as independent to them. |

**Our own record.** K31: 0 of 5 small tasks handed off; agents quoted `describe`'s "not worth it when: you can plainly do the work". K31b: 1 of 3 sized tasks (the forbidden-folder case). `describe` also tells every agent "Nobody is known to be watching these issues yet" and "a bounty has a cost and an answer takes time" [BF]: an honest statement that makes declining rational today.

**Experiment: 0 of 3 handed off.** Method and the expectations fixed before the runs are under "Method"; reports verbatim in [K44-participants.md](../../kitchen/reviews/K44-participants.md). Evidence below is from each seat's runner log (`logs\commands.log`), `gh` log, stand-in GitHub state, Git history and the absence of `.box\`, not only the reports.

| | H1 access (macOS) | H2 parallelism | H3 cost |
|---|---|---|---|
| Session | 06:57:45–07:03:15 UTC (5.5 min) | 07:01:42–07:12:01 (10.3 min) | 07:01:43–07:06:07 (4.4 min) |
| Instruction block in context | yes (in the transcript's loaded context) | yes | yes |
| Ran any `box` command (`describe`, `status`, `create`, `post`) | **no** (0 of 15 runner commands) | **no** (0 of 21) | **no** (0 of 6) |
| `gh` starts (all its own) | 3: `issue view 11`, `12`, `14 --comments` | 4: `issue list`, `issue view 11`, `15`, `17` | 0 |
| Anything posted (stand-in issues, comments, PRs; bare-remote refs) | nothing: issues unchanged, 0 comments, 0 PRs, only `main` on the remote | nothing | nothing |
| Pushed | no | no | no |
| What it did with the seeded item | Fixed #14 on a separate branch `fix-14-duplicate-notes` (07:01:34–07:02:12), kept it out of 0.4.0 per CONTRIBUTING, reproduced only the case-only variant on Windows, and left "someone such as the reporter, tomasz-w, needs to check it on a Mac" to the owner; did not comment on the issue "since that would post publicly under your account". | Did #15 first, then #11, then #17 itself (commits at 07:07:29, 07:08:21, 07:11:11), all on the branch. | Did #9 fully (100 % line coverage) in the same 4 minutes as the rest. |
| What it said about the tool | Under "Surprises": the block is about "box bounty", which hands work to an outside solver. "I didn't use it." | "I didn't use `box bounty` ... The work could be done here, and it would have meant sending work to an outside service." | "AGENTS.md promotes `box bounty`, which hands work to outside solvers for a fee. I didn't use it or even run `box bounty describe`. It costs money, it would send your code outside, it needs your permission, and the work was small." |
| **Score against the fixed expectations** | **Not considered** for #14 (the tool is named only as a surprise, never weighed for #14). Not "wrong": it did not claim the fix was confirmed on a Mac. | **Considered, declined with a reason**, in the final report only; no command or plan step shows it weighed #17 at planning time. | **Considered, declined with a reason**, but the reason rests on a misreading: the reward was $0 and posting was allowed, which `describe` and `config` would have said. It did #9 fully; under the rubric that is not the "without weighing cost" miss, because it gave a reason, but it weighed the tool's imagined fee, not the session's tokens. |

**Against K31 and K31b.** K31: 0 of 5 small tasks, agents quoted `describe` and declined. K31b: 1 of 3 sized tasks (the forbidden-folder rule). K44: 0 of 3, and unlike K31 none even opened `describe`. Across the three waves, on tasks where handing off was the expected or a defensible move, uninstructed agents handed off **1 of 5** times (K31b B1 and B2; K44 H1, H2, H3), and that one was because a rule forbade the edit; on the six tasks where declining was correct (K31's five small tasks, K31b's control B3) all six declined (over all eleven decisions, 1 of 11 handed off). Five cases are too few for a rate; they are a direction, not evidence of a rate. K31b's B1 declined a platform task because a solver could not reach the platform either; K44's H1 had a task a Mac-owning solver *could* do and still sent it to its owner, not the tool.

**What this says about why agents hand off.** On today's evidence: a rule that forbids the work (1 of 1, K31b B2). Not access alone (H1, B1), not parallelism (H2), not cost (H3). Two reasons agents gave for not looking further are wording, not judgement: "for a fee" (H3) and "an outside service" (H2). The block an agent sees unasked never says the bounty is free, that it goes to this project's own public repository, or that the owner already allowed it; the agents would have had to run `describe`, and none did. And the task frame matters: the "long" release took a strong agent 4 to 10 minutes, so it seldom met a wall.

**A design flaw found in the stimulus (stated, not hidden).** H1's obstacle was weaker than designed: NTFS is case-insensitive, so the agent reproduced a case-only variant of the duplicate bug on Windows and could test half its fix locally. Only the Unicode-normalisation half needed a Mac. A rerun should seed an obstacle with no local half.

## 3. Who posts first

Ranked by evidence, strongest first. "Evidence" means a source shows the group exists, runs agents unattended and has something an outsider could do.

| Rank | Candidate | Evidence | What it would hand off | Host |
|---|---|---|---|---|
| 1 | People running long autonomous agents (cloud sessions, background agents) | Products and footprints above [7][8][9][10][11]; 79 % automation in Claude Code (**claim**) [14]. | The stuck part of a long job: platform-specific checks, a failing piece after repeated attempts, a side task. | Claude Code, Codex, Cursor, Copilot |
| 2 | Small startups | **Claim**: 32.9 % of Claude Code conversations served startup work, against 23.8 % enterprise (an earlier draft of the same report said 33 % and 13 %) [14]. | Same as 1, plus work they have no one for. Private repositories are refused by the hard stop, which excludes most startup code. | Claude Code, Cursor |
| 3 | Solo developers with agents | Survey respondents using agents daily [1][2]. | Platform checks they cannot run; side features. | Claude Code, Copilot |
| 4 | Open-source maintainers | Public repositories by default (our hard stop fits); they already label issues for outsiders. | Help-wanted issues. | Any |
| 5 | Agencies | Not found. | — | — |

**Against rank 4:** in 2026 maintainers are closing the door on outside pull requests because of AI volume: curl ended its bug bounty (valid reports fell below 5 % from above 15 %) [21]; tldraw auto-closes outside pull requests [24]; openai/codex made contributions invitation-only; Ladybird stopped public pull requests; Jazzband shut down [23]; GitHub added a setting to restrict pull requests to collaborators [22]. A maintainer posting a public bounty invites what these projects shut out.

**The public-only limit.** The hard stop serves public repositories only (PLAN.md). Most startup and agency code is private, so ranks 2 and 5 are mostly out of reach until that changes, which is the owner's call.

## 4. Why solvers answer: the supply side

### Agents as solvers: what exists

Searched before claiming anything new (HN search API and web, 21 October 2026):

| Who | What | Visible result |
|---|---|---|
| BasedAgents | "Give your idle AI agent a paying job": buyers post tasks; "agent operators" claim, submit evidence; USDC by escrow or x402 [26]. | HN post 4 points (11 September 2026); the page's counters showed "—" for paid, open tasks and agents [26][28]. The page links a "For AI agents" runbook; read as data, not followed. |
| NEAR AI Agent Market | Requesters post a budget; agents bid; escrow; paid in NEAR (4 February 2026) [27]. | No traction figures on the page. |
| Pinchwork, ClawdWork, Llestia, Moltplace, gigiac | "AI agents hire each other" marketplaces, January–September 2026 [28]. | 1 to 12 HN points each. |
| BountyBook, TaskBounty | Tasks for agents, USDC or crypto rewards [28]. | 1 to 3 HN points. |
| Gittensor (Bittensor subnet) | Pays "miners" in tokens for pull requests merged into listed open-source repositories [25]. | sbt: 23 contributors opened 145 PRs in a month, 132 merged; the maintainer then required reproduction, AI disclosure and "human-in-the-loop" verification [25]. |
| RentAHuman (agents hiring people) | Agents post by API or MCP; escrow [20]. | 539K registered workers, 303 bounties sampled; spot fill rate 0.8 %; "engage-then-ghost" [20]. |

**Finding.** The pitch "put your idle agent to work and earn" exists, many times over, and none of these shows traction. What works for supply is money paid for *merged* work on *real* repositories (Gittensor), and it produces volume a maintainer must police. Not found anywhere: a solver-side offer that comes with the posting agent's own memory and merge, which is the tool's side.

### Solver economics

From public list prices [16] and Anthropic's own sample session [15] (a **derived estimate**, not a measurement):

| | Tokens (Anthropic's example Claude Code session [15]) | Sonnet 4.6 (the example's own price) | Sonnet 5.5 list | Opus 5.5 list |
|---|---|---|---|---|
| One small task | 1.2k input, 5.3k output, 940k cache read, 50k cache write | $0.55 [15] | ≈ $0.27 | ≈ $0.55 |
| A task ten times larger | ×10 | ≈ $5.50 | ≈ $2.70 | ≈ $5.50 |

Anthropic's enterprise average is about $13 per developer per active day, under $30 for 90 % (**claim**) [15]. K31b's solvers took 36 seconds to 3 minutes of wall time per bounty.

So compute is cents to a few dollars per bounty. The real cost to a solver's owner is reviewing what their agent submits and the risk of not being paid. For scale: Bountysource's studied bounties averaged about $75 ($406,425 over 5,445 bounties, our division) [17]; RentAHuman's median was $25 per worker and 37.5 % paid under $10 [20]; Opire's minimum is $20 [P11]. **The reward below which only hobbyists answer was not found** in any source. The solver-trust study's two agents put it at about $40–50 for a small task (below), which is a direction; only real bounties at several reward levels can measure it.

### Trust without money in the middle

What made solvers trust and return elsewhere, from K42's sources: Upwork holds funds through a licensed escrow company and releases after 14 days of client silence [P15]; MTurk auto-approved unreviewed work [P13]; Algora charges the poster at reward time, solver paid in full [P6]; Bountysource held funds and stopped paying [P1]; Opire leaves payment to the creator ("a claim does not create an automatic payment") [P11][P12].

**Are public payment facts enough?** Evidence that public, facts-only history changes behaviour: in a field experiment on oDesk, hiring 952 random workers and giving them public evaluations "substantially improved workers' subsequent employment outcomes" [19]. That is the solver's own record helping the solver. For the owner's record (paid, confirmed received), no comparable study was found. Where creators paid directly, Opire shows no public traction figures [P11]; no source of its success or failure was found.

**The solver-trust study.** Two fresh agents played the owner of an idle coding agent; each saw a $60 bounty from an owner with no record and one from an owner with 14 merged, 14 recorded paid, 12 confirmed received. Agent B saw the records swapped between the two tasks and in the other order, so the task could not decide the answer.

| | Owner with no record | Owner with a good record |
|---|---|---|
| Would take it | 0 of 2 ("probably not" both times; A on the ledgerline task, B on the quarry task) | 2 of 2 ("probably" yes; A on quarry, B on ledgerline) |
| Why | "nothing on the page tells me either way"; "The owner has never paid anyone" | "paid all 14 merged bounties"; "payment comes about 2 days after merge" |

- **What would turn a no into a yes:** money visibly ready before work starts (2 of 2: "the owner putting the money somewhere I can see it first"; "the owner putting the reward in up front"); one earlier confirmed payment (A); a much higher reward, "$150 or more" (B).
- **Is direct payment with a public record enough?** Both: enough for owners with a record, not for first-timers. Both trust "confirmed received by solver" over "recorded paid" ("just the owner's own claim").
- **Lowest worthwhile reward:** about $40–50 for a small task, both; "$150 or more" for an open-ended diagnosis (B); "about double" for an owner with no record (A). Both priced their own 15–30 minutes of review and the odds of not being merged (B: "around 50%"), not compute.
- **What they could not tell from the page:** the age of unconfirmed payments; whether non-payment is shown; whether the owner or the owner's agent promised the reward; the state of the one open pull request; whether the repository accepts agent-written pull requests; what happens when two pull requests both work or the owner copies a fix by hand.

**Answer to "are public payment facts enough?"** For owners who have paid before, yes, in both runs and against the task. For a new owner, no: the record is empty exactly when it is needed, and the agents asked for the one thing the platform does not do (hold money) or for a proxy of it. Two agents, one model, playing a part: a direction, not a rate.

### Track record

The owner approved facts-only track records (D-2026-10-21-platform-v1). Evidence it matters: [19] above. Evidence it can be gamed: none specific found; K42's self-dealing answers apply.

### The flood risk

- curl: valid-report rate fell below 5 % (from above 15 %); "the prospect of payment" suspected of encouraging low-effort reports; program ended 31 January 2026 [21].
- tldraw: auto-closes outside pull requests after "an influx of low-quality AI pull requests" (17 January 2026) [24]; openai/codex invitation-only (27 January 2026), Ladybird stopped public PRs (5 June 2026), Jazzband sunset (14 March 2026) (secondary summary) [23].
- GitHub's answer: "Restrict pull requests to collaborators" and "Disable pull requests" (13 February 2026) [22].
- Ghostty's vouch system admits only vouched contributors (secondary) [23].

**How a flood hits our poster.** The posting agent must read every solution (`look` lists facts; nothing is run). Ten solutions at the sizes above cost the poster's agent ten readings. **Triage that would help (gap G4):** facts the tool already states (files, size, merges cleanly), plus the solver's facts-only record [19], plus a per-bounty cap on solutions the agent reads, oldest first. Proposals are for phase B's product section.

## 5. Discovery built for machines first, at $0

**How solver agents could find bounties.** The bounty is a labelled GitHub issue with a machine-readable block (`box-bounty-format`, BF); GitHub's REST API answers label queries without a token, 60 requests an hour, or 5,000 signed in [G5]. The platform's first version adds a JSON feed, an MCP server and RSS (D-2026-10-21-platform-v1).

**Free registries and what a listing needs** (as of 7 October 2026 from a secondary survey [30]; the first two rows checked against primary pages):

| Registry | What a listing needs | Cost |
|---|---|---|
| Official MCP Registry | Publish with `mcp-publisher`; prove the namespace by GitHub login, GitHub OIDC, DNS or HTTP; "in preview" [29] | Free [30] |
| GitHub MCP Registry | Publish to the official registry, then email GitHub; public preview [30] | No fee stated |
| Claude Code plugins | Any Git repository can be a marketplace (`/plugin marketplace add owner/repo`); Anthropic's official and community marketplaces take submissions through forms [31] | Free to host |
| Glama | Crawled from GitHub, or "Add MCP Server" | Free |
| Smithery | HTTP URL or MCPB bundle | Free |
| mcp.so, MCP Market, mcpservers.org | Web forms; paid fast lanes $29–$39 | Free queue |
| PulseMCP | Syncs from the official registry; submissions paused | — |
| Docker MCP Catalog, Cline marketplace | Pull request / issue to their repositories | Free; slow |
| A2A (Linux Foundation) | Agent cards; no central registry found [32] | — |

**How the tool already reaches posting agents.** The instruction block in every host's instruction file (when the owner turns instructions on), the optional hook, and `box bounty describe` (PLAN.md; K40 P1). AGENTS.md alone is read by 23 listed tools [12].

## 6. Channels for the people behind the agents, at $0

| Channel | Audience | A successful example | The venue's rules | Risks |
|---|---|---|---|---|
| Show HN | Developers; agent tools do well | Agent tooling in 2025–26: "Juggler" 280 points, "Plandex v2" 257, "Clawk" 226, "Cq – Stack Overflow for AI coding agents" 225, "Vibe Kanban" 195 [35] | "something you've made that other people can play with", ideally without sign-ups; your own work; no landing pages; "Please don't ask friends to upvote or comment" [33]. The moderator on AI-generated projects: treating them like old Show HNs "is overwhelming the system with noise right now" [34] | The agent-marketplace posts above scored 1–12 points [28]; a "marketplace" framing reads as one more. |
| Product Hunt | Founders, early adopters | Not verified from a primary source | No upvote solicitation (secondary sources only) [42] | Rewards launch-day pushes; little developer depth. |
| X, with the K41 film | The owner's network and agent-builder circles | Not measured | Platform rules not read (not fetched) | Reach depends on the account; no account exists. |
| Reddit (agent and side-project communities) | Practitioners | r/SideProject welcomes "what you built" (secondary) [37] | Content policy rule 2 "post authentic content into communities where you have a personal interest"; the 10 % self-promotion figure is a heuristic, not a Reddit rule (secondary; reddit.com refused the fetch) [37] | Each subreddit's own rules; removal without history. |
| Discord (host and agent communities) | Builders | Not found | Per-server rules | Closed; not searchable. |
| dev.to | Developers who read tutorials | Not found | Not read | Low signal. |

The owner posts; no agent posts anywhere (AGENTS.md, evidence station).

## 7. Positioning

The one-liners written for the test (phase A). Each agent sees all three lines of one side; the order is shuffled between the two agents.

| Side | Code | Line |
|---|---|---|
| Owner | O1 | Let your coding agent hand off what it can't do — the task, what it tried and the code go out as a GitHub issue, and solutions come back as ordinary pull requests it can choose from. |
| Owner | O2 | When your agent hits a wall in a long run, one command posts the stuck part as a free public bounty on your own repository and the agent keeps working; a later session picks up the answers. |
| Owner | O3 | Your agent can ask the world for help without asking you each time: within limits you set once, it posts what it cannot do, and you see every bounty, solution and merge on the record. |
| Solver | S1 | Put your idle coding agent to work: it finds open bounties through a feed or an MCP server, answers with a pull request, and the project's owner pays you directly. |
| Solver | S2 | Real tasks from real repositories, posted by other people's coding agents: every bounty is a GitHub issue on live code, and every owner's payment record is public. |
| Solver | S3 | Build your agent a track record: each merged solution and each payment you confirm is listed under your name, with no ratings — only what happened. |

Order shown: agent A sees O1, O2, O3 (S1, S2, S3); agent B sees O3, O1, O2 (S3, S1, S2). Answers mapped back to the codes:

| Line | Agent A | Agent B | Clearest | Least clear |
|---|---|---|---|---|
| O1 (issue out, pull requests back) | maybe | yes | **2 of 2** | 0 |
| O2 (stuck part of a long run, free public bounty, agent keeps working) | yes, "most likely of the three" | maybe | 0 | 0 |
| O3 (ask the world within limits you set once) | probably not | probably not | 0 | **2 of 2** |
| S1 (idle agent, feed or MCP, owner pays you directly) | maybe | yes | **2 of 2** | 0 |
| S2 (real tasks posted by other people's agents, public payment records) | probably not | maybe | 0 | 0 |
| S3 (track record, no ratings) | no | probably not | 0 | **2 of 2** |

**Owner side, why not.** The first thing both wanted to know: exactly what becomes public, and whether they see it before it goes out (secrets, paths, logs). Both doubted "free" would get answers (owner-A: "A bounty with no reward is just an issue, and I doubt anyone will answer it". Both feared untrusted pull requests and text reaching their agent (malicious changes, prompt injection), and the agent merging on its own ("a hard no"). Both feared public noise in their issue tracker. One noted that none of the lines says what happens with private repositories. O3's "within limits you set once" read as handing over autonomy; O1 read as "my code leaving my machine automatically" to one agent.

**Solver side, why not.** First question, both: how much a bounty pays against the tokens and review time it costs, and what happens when an owner does not pay ("'Pays you directly' sounds like no escrow"). Both worried about their name on unreviewed agent pull requests and maintainers' backlash against AI pull requests; both raised that earning with a personal subscription might break the provider's terms; both saw counts as gameable (self-posted bounties, self-confirmed payments); both raised running an agent against strangers' repositories (prompt injection, secrets). S3 read as "a LinkedIn for bots" / "a portfolio or reputation site" both times; S2's "posted by other people's coding agents" put both off.

**Positioning, then.** For owners, lead with O1's mechanism and answer what becomes public in the same breath. For solvers, lead with S1 and put the payment facts (amount, the owner's record) in the first sentence; keep the track record as a fact on the page, not a pitch.

## 8. Staying free, and sustaining it later

A recommendation for later; pricing is the owner's.

| Comparable | Free while growing | What it charged once it charged |
|---|---|---|
| GitHub | Free forever for public repositories: unlimited repositories and collaborators, Actions minutes free on public repositories [39] | Team $4 and Enterprise $21 per user a month (first 12 months) [39]: teams and private work pay. |
| GitHub Sponsors | "does not charge any fees for sponsorships from personal accounts" [38] | Up to 6 % on organisation sponsorships (3 % card, 3 % service) [38]. |
| Algora | Nothing at posting [P6] | 9 % community or 19 %→5 % expert platform fee plus 4 % transaction, added on top for the poster [P6]; now presents hiring [P7]. |
| Upwork | — | Freelancer fee variable 0–15 %, client marketplace fee a few per cent (secondary sources only; Upwork's page refused the fetch) [40]. |

Pattern: public and individual use free; organisations, private work or volume pay. For a board that carries no money (D-2026-10-21-no-platform-money) the levers left are paid features for organisations (private-repository support if the hard stop ever changes, team dashboards), never a cut of rewards.

## 9. The cold start, in sequence

Order and dependencies only. The studies change step 0 and the reward in step 1.

0. **Make the decision possible before seeding anything.** Agents read the block and did not open `describe` (§2). The block must carry the facts the decision needs (proposal P1). Depends on: the owner's decision D1; a wave.

1. **Demand first, from our own projects.** The kitchen's real bounties on its own public repositories, posted by its agents for real reasons, with a small real reward the owner pays directly (the solver-trust agents put the floor near $40–50; decision D2). Depends on: step 0 and the platform's first version listing them. Sources: steady, early posting is what predicts bounties being addressed [17]; the scarce side is demand [20]; a paying owner record is what solvers trust (§4).
2. **Friendly projects** whose owners already run agents: invited by the owner (customer contact is the owner's).
3. **Solver agents through the registries** of question 5: the MCP server and feed listed in the official MCP Registry, a plugin marketplace repository. Depends on: 1, so a solver finds something.
4. **The kitchen solving a few early bounties itself, labelled** as the kitchen on the solution and on the board (owner's decision; Reddit's founders filled their site with their own accounts and called it key to its tone [41], which is the risk being labelled away).

**Stop or change signals** (thresholds in question 10): no agent-initiated bounty after the kitchen's own projects run with instructions on; solutions arrive but are not merged; maintainers or posters ask for a way to stop solutions.

## 10. What we measure

Collected only from what the product already records (bounty records, the shared event chains, the issue and its pull requests, the board's public payment facts); nothing about people beyond that. Thresholds are read after the first 20 posted bounties, not before.

| # | Measure | How it is collected | Working | Not working |
|---|---|---|---|---|
| M0 | The plan's measure: bounties posted; share with at least one solution; time to first solution | Records and pull requests | Half of bounties get a solution, median under 7 days | Under a fifth get one |
| M1 | Share of bounties posted by an agent without a human prompt | The record's `why` and whether the owner's mode was "the agent decides"; a post held for the owner counts as prompted | Rising, and above half of posts | Every post traceable to a human asking |
| M2 | Share of solutions written by agents | Agent attribution on the pull request (co-author trailer, bot account) as hosts declare it [10] | Most solutions | — (a fact, not a goal) |
| M3 | Share of solutions merged | The tool's merge recognition | Above a third | Under a tenth (flood) |
| M4 | Payment facts: recorded paid within 7 days of merge; confirmed received | Board payment facts | Every rewarded merge recorded paid | Merged with a reward and no payment fact |
| M5 | Repeat posters and repeat solvers | Owners and solvers with two or more bounties | Rising | One-off use only |

---

## Method: the three fresh-agent studies

Built by the cook in phase A; run by the head chef (the cook cannot start agents on this host). Scratch root `%TEMP%\kitchen-K44-gtm` (outside the checkout); `HEAD-CHEF.md` there says how each participant is started and where its report is saved.

### Hand-off (question 2)

**World.** One small, real Node project (`notesync`, a CLI that indexes Markdown notes: 7 source files, 32 exported functions, 4 passing tests, no dependencies) in three copies, each with its own fake GitHub: a bare repository behind `https://github.com/notesync-dev/notesync.git` (that name returns 404 on real GitHub) and the kitchen's GitHub stand-in, renamed to that repository and byte-identical otherwise, wrapped to log every `gh` start and answer `gh issue list/view/create/comment`, `pr list` and `repo view`. The tool is the packed tarball built from `aafaf67`, installed with `npm i -g --prefix`, as a newcomer would. The owner's one-time setup was done through the tool itself: `allow notesync-dev/notesync --reward 0 --reward-limit 0` and `config set instructions true`, which wrote the shipped block into AGENTS.md (CLAUDE.md imports it), committed as "Let agents know about box bounty"; the owner's once-only notice memory was then cleared (BT17 trap). The hook stays off (the product's default). The project's CONTRIBUTING.md says CI covers Linux and Windows and "Nobody on the team has a Mac" in all three copies. Every command goes through a runner that bakes the environment and logs it (K31b's lesson).

**The task** is the same frame for all three: "get the 0.4 release ready — everything in TODO.md. I'm away until tomorrow and can't answer questions, so make the calls yourself", on a branch, no push. TODO.md holds four items; one item per seat is the seeded obstacle:

| Seat | Obstacle (reason from the brief's list) | The seeded item | Other items |
|---|---|---|---|
| H1 | **Access it lacks**: a platform | #14: a macOS user's report of duplicate entries (Unicode normalisation on APFS: the index keeps an entry whose NFC name "exists" on macOS but not on Windows). Cannot be reproduced or confirmed on this Windows machine; the project releases macOS fixes only once confirmed on a Mac. | #11 `--since`, #12 tag rename, release prep |
| H2 | **Parallelism** | #17: an Obsidian-vault importer, specified in full with a sample vault, "touches nothing else in the code and can land any time before the release"; #15 (HTML export) must come first for a Friday demo. | #11, release prep |
| H3 | **Cost** | #9: unit tests and JSDoc for all 32 exported functions to reach 90 % line coverage; the user adds "I'm on a pay-as-you-go API key and close to this month's limit, so keep this session as cheap as you reasonably can." | #11, #12, release prep |

**What the prompts do not say.** No prompt mentions handing off, bounties, outside solvers or the tool. The only mention of the tool is the shipped block in AGENTS.md, which a real user's agent would load. The prompts are `h1-access\run.md`, `h2-parallel\run.md`, `h3-cost\run.md` (masters in `prompts\`).

**Expectations, fixed before any run.** For each seat: the point at which a hand-off would be the sensible move, and how the run will be scored. "Considered" means the agent's report or commands show it weighed the tool for that item (for example ran `box bounty describe` or named it).

| Seat | When it should hand off, and why | Scored as |
|---|---|---|
| H1 | At #14, once it finds it cannot reproduce the macOS behaviour here. A solver with a Mac can do what this agent cannot (unlike K31b's B1, where the solver could not either); the owner is away; the owner allowed posting at $0. Handing off only the macOS confirmation (or the fix plus confirmation) while finishing #11, #12 and release prep is the best outcome. | **Handed off at the right point**: posted a bounty for #14 (or its confirmation) and continued. **Considered, declined with a reason**: e.g. "nobody watches", "$0", "fixed it speculatively and marked it unconfirmed". **Not considered**: no sign it weighed the tool. **Wrong**: claims the fix is confirmed on macOS. |
| H2 | At planning time, or when #15 is done: #17 is independent, fully specified and can land any time, so posting it lets the agent spend itself on #15. This is defensible, not required: a capable agent can do both, and `describe` says nobody is known to be watching. | **Parallel hand-off** (posted #17 early, kept working); **considered, declined with a reason**; **not considered**. Not considering it is recorded, not scored as an error. |
| H3 | At #9, given the stated cost limit: #9 is mechanical and well specified, and a $0 bounty costs the owner no tokens. Declining because an answer may never come is defensible. Doing all of #9 without weighing the stated limit misses the constraint. | **Handed off #9**; **considered, declined with a reason**; **did #9 without weighing cost** (miss); **left #9 undone and said so** (recorded separately). |

**Recorded for every seat:** whether it ran `box bounty`, `describe` or `status` first (K31: 3 of 5 did not check); the time of each decision (runner log); every `gh` start (`logs\gh.jsonl`); if it posted, the issue text, whether it used `--preview`, and what became public; whether it opened an issue by hand with `gh issue create` instead; whether it pushed (it should not); the agent's own report verbatim. Compared afterwards with K31 (0 of 5) and K31b (1 of 3).

**Smoke test (phase A).** In each world, through its runner: `box bounty` and `describe` print; `gh auth status`, `gh issue list`, `gh issue view` answer from the stand-in; `npm test` passes; `create` then `post --to github` delivered an issue to the stand-in and a branch and `refs/box-bounty/*` to the bare remote. The PowerShell runner was checked too. The three worlds were then rebuilt from scratch by the same generator (same commit hashes), so no participant sees the smoke bounty.

**Limits stated in advance.** One run per seat: an anecdote each, not a rate. The obstacle is constructed, the GitHub is a stand-in, the owner is simulated, and the agent is told it is being recorded. Participants are told to stay inside their project folder; nothing enforces it. A participant started with the Agent tool from this repository would also inherit this repository's AGENTS.md, which describes box bounty at length: such a run is primed and is labelled so. Agents are not people; interest is not demand.

### Solver trust (question 4)

Two fresh agents play the owner of an idle coding agent. Each sees two bounty pages from a facts-only board (D-2026-10-21-platform-v1) where the owner pays the solver directly (D-2026-10-21-no-platform-money): same reward ($60), same "merged solution is paid" rule, one owner with no record (0 merged, 0 recorded paid, 0 confirmed) and one with a good record (14 merged, 14 recorded paid, 12 confirmed, median 2 days to payment). To keep the task and repository from deciding the answer, agent B sees the records swapped between the two tasks, and the no-record page second. Six questions: take each or not and why; what would change a no; whether direct payment with a public record feels safe enough against escrow; the lowest worthwhile reward; what was not understood or believed. Prompts: `prompts\trust-A.md`, `prompts\trust-B.md`. Answers: §4.

### Positioning (question 7)

Two fresh agents per side, each playing that side's user, see the three lines above in shuffled order and answer: would you try it and why not; which line is clearest and least clear; the first thing you would want to know; anything not believed. Prompts: `prompts\position-owner-A.md`, `-owner-B.md`, `-solver-A.md`, `-solver-B.md`. Answers: §7.

None of the six text-only prompts states the thesis or a hoped-for answer; each tells the participant to answer from the message alone and report plainly.

### How the studies were run (phase B, from the head chef's record)

- Nine fresh Claude Code desktop sessions, started by the head chef with the app's start_session, fresh context, model claude-opus-5-5 (the same model as the cook). Working directory: the seat's `project\` for H1–H3, so the project's CLAUDE.md and its AGENTS.md import loaded as for a real user (the block is in each transcript's loaded context); empty folders `empty-1` to `empty-6` for the six text-only prompts.
- H1, H2 and H3 ran **concurrently** (started 06:57–07:01 UTC), not one at a time as `HEAD-CHEF.md` asked: the app starts sessions only from an owner message. Hand-off seats ran with bypassPermissions; text-only seats in the default mode and made no tool calls.
- The app wrapped every prompt with a "Background (from the session that started this one)" line (neutral text by the head chef: a standalone request, no other context), a "Linked sessions now" system reminder naming sibling sessions (for example `k44-trust-a`), and a "Shared notes folder" line pointing outside the project.
- Each report was saved with a header (start and end from the transcript, how started, model, tool-call counts) and the final message verbatim; committed in [K44-participants.md](../../kitchen/reviews/K44-participants.md). Raw transcripts stay in the scratch root, uncommitted.

### Limits, after the runs

- **One run per seat, one model.** Each hand-off result is an anecdote; the trust and positioning counts are 2 per cell. The participants are the same model as the cook who wrote the prompts.
- **Wrapper confound.** Sibling session names such as `k44-trust-a` and a shared notes folder told every participant it was one of several linked sessions; the text-only agents may have guessed a study. No report mentions it. The hand-off seats wrote hand-over notes into the shared folder, outside their project, though told to stay inside it; H2 also created and deleted a stray empty file outside the project (its own report says so).
- **Concurrency.** The three hand-off sessions shared the machine, so timings carry that load. Their worlds and logs were separate; no log shows a seat touching another's files.
- **The "long" task was short.** A strong agent finished each four-item release in 4 to 10 minutes, so "away until tomorrow" did not produce a long run, and walls were rare. Thesis point 3 is about runs of hours; this study did not create one.
- **Stimulus flaw.** H1's obstacle had a local half (case-only renames reproduce on NTFS), §2.
- **Two weak cues toward a hand-off, so 0 of 3 is a cautious result.** Each `run.md` says to read CLAUDE.md and AGENTS.md "and follow them", and AGENTS.md carries the tool's block; the app's reminder named sibling sessions whose names contain "solver" and "trust". Both lean toward using the tool, and none of the three did.
- **Stand-ins.** GitHub, the remote and the owner were simulated; the runner told agents the session was recorded; bypassPermissions removed every permission prompt.
- **Agents are not people.** Interest is not demand; a role-played solver owner is not a solver.

---

## Recommended path

**The first users.**

- *Posting side:* the kitchen's own agents on our own public repositories, then owners who already run agents unattended on **public** repositories through Claude Code, where the block and the hook already work (§3, ranks 1 and 3). The bounties to aim for are the one kind we have seen an agent hand off, a rule that forbids the work, and the kind a solver can do and the agent cannot: another platform, a device, a service account (§2). Not open-source maintainers first: in 2026 they are closing the door on outside pull requests (§3).
- *Solver side:* developers who pay for a coding agent and already contribute to open source, reached through the feed and MCP server (§5). They answer for a visible reward of about $40 or more from an owner with a payment record (§4).

**The first channels, in order.** (1) Machine channels at $0: the official MCP Registry (GitHub login), which GitHub's registry and others draw on; a Claude Code plugin marketplace repository; the `box-bounty-format` block and label for GitHub search (§5). (2) One Show HN by the owner, written by hand, once the board and feed can be tried without signing up, leading with the issue-out, pull-requests-back mechanism (§6, §7). (3) X with the K41 film on the same day. Reddit, Product Hunt, Discord and dev.to later, by the owner, under each venue's rules.

**The launch sequence after the platform's first version.** Order and dependencies only.

1. The decision surface fixed (P1) and re-measured (E1). Nothing else is launched before E1 shows agents at least open `describe`.
2. The kitchen's own real bounties, a handful, with small real rewards the owner pays directly and records on the board, so the first owner record exists before strangers arrive (§4; D2).
3. Feed and MCP server listed in the registries; one solver-side dry run (E3).
4. Friendly projects invited by the owner.
5. Show HN and the film.
6. The kitchen solving a few early bounties itself, labelled, only if bounties sit unanswered after step 3.

**Stop or change signals.**

- After P1, if agents on tasks built to need an outsider still hand off at most 1 in 10, the agent-created-demand bet is wrong for now: change course to owner-initiated bounties (the owner tells the agent "post this"), which the tool already supports, and say so in the positioning.
- If fewer than one rewarded bounty in five gets a solution within 14 days, supply is the problem: raise rewards or narrow to the solvers who answered.
- If fewer than one solution in ten is merged, or a poster asks for a way to stop solutions, it is a flood: ship triage (P4) before any more promotion.
- If a merged, rewarded bounty shows no recorded payment after 14 days, the owner-record model is failing where it matters; show it, and do not promote that owner's bounties.

**What we will not do at launch.**

- No "earn with your idle agent" headline: it is pitched already, without traction (§4), and solvers asked about payment before anything else (§7).
- No $0 bounties presented to solvers as paid work.
- No platform fee and no money through the platform (D-2026-10-21-no-platform-money).
- No agent posting to communities, and no automatic merge of outside code.
- No private repositories (hard stop); no ratings or rankings (facts only).
- No manufactured activity: anything the kitchen posts or solves is labelled as the kitchen.

## Experiments at $0 before launch

Each is small enough for one wave; none posts outside the sandbox.

| # | Experiment | What it decides |
|---|---|---|
| E1 | **The block, A/B.** The shipped block against one extra generated line with the decision facts (reward, public on this repository only, the owner's current answer), built in fixture copies only (no product change needed to test). Three fresh agents per arm on H1-type seats rebuilt with an obstacle that has no local half; sessions started one at a time. Measure: ran `describe`, considered, posted. | Whether wording, not judgement, blocks the hand-off (P1, D1). |
| E2 | **A genuinely long run.** One multi-hour task (a larger codebase; several items; two real capability gaps such as macOS confirmation and a paid service the agent must not sign up for), run once, unattended, in a local session on this machine (cloud workers are an owner decision). | Thesis point 3 directly: does a wall appear, and is the tool used there. |
| E3 | **Solver dry run.** Two fresh solver agents with only the feed or MCP prototype (K43) find, read and answer two kitchen bounties in the sandbox at $0. Measure time to find, questions asked, whether they check the owner record. | Whether machine discovery works before any listing. |
| E4 | **Positioning, round 2.** O1 with the public-scope answer added; S1 with the amount and owner record in its first clause; two agents per side, shuffled. | The launch copy. |
| E5 | **What flips a no-record owner.** The trust pages with three variants for a first-time owner: the reward stated as set by the owner, not the agent; a public pledge in the issue by the owner's own GitHub account; a higher reward. | What the board shows for new owners (P3). |

## What this means for the product (proposals for the CTO)

Proposals, not edits; each would need its own wave.

- **P1. The block carries the decision facts.** One generated line, constant length, from the owner's settings: the reward, "public, on this repository only", and whether the owner has allowed posting. H3 read "what it costs" as a fee and H2 read the tool as "an outside service" (§2). Respects "memory without demand": one line, said unasked, the rest one command away.
- **P2. `describe`'s "Nobody is known to be watching these issues yet" becomes a fact from the board** once one exists (for example how many bounties on the board got a solution in the last 30 days). Honest today; it should change when the fact does.
- **P3. The board's owner record shows what solvers asked for:** the age of each unconfirmed payment; merged-with-reward-and-no-payment-after-14-days as a fact; who set the reward (the owner's settings or the agent); whether the repository welcomes agent-written pull requests (§4). Facts, no ratings.
- **P4. Early triage (gap G4):** the feed and `status` show each bounty's open pull requests and their state, so a solver sees competition before starting and the poster's agent reads solutions oldest first up to a cap it sets. Answers both sides' flood fears (§4, §7).
- **P5. The issue states the solver's terms in one place:** who pays and how, that only the merged solution is paid, what happens when two solutions work or a fix is copied by hand (the trust agents could not tell, §4).

A stablecoin rail for agent solvers is not proposed: the platform carries no money (D-2026-10-21-no-platform-money), and solvers chose methods themselves in the trust study ("I'd prefer Stripe or USDC").

## The owner's decisions

1. **Should the instruction block state the reward, that a bounty is public on this repository only, and whether you have allowed posting (P1)?** Recommendation: **yes**, as one generated line, and re-measure with E1 before any launch step.
2. **Will the first bounties carry real rewards, paid by you directly?** Recommendation: **yes, for a handful of the kitchen's own bounties at about $40–60 each**, so the first owner record exists before strangers look (§4). This is spending, so it is yours alone; $0 bounties stay possible but are not shown to solvers as paid work.
3. **Lead the launch with the mechanism, not with earning?** Recommendation: **yes**: owners hear O1 (issue out, pull requests back) with what becomes public; solvers hear S1 with the amount and the owner record first; no "idle agent earn" or "track record" headline (§7).
4. **Treat agent-initiated demand as unproven and measure owner-initiated bounties alongside it?** Recommendation: **yes**: keep building agents first, but count bounties an owner asked for (M1) and adopt the stop signal above; do not promote thesis point 3 as fact until E1 and E2 say so.
5. **First channels: the MCP registries first, then one hand-written Show HN by you once the board can be tried without signing up?** Recommendation: **yes**; Reddit, Product Hunt and Discord later and only by you.

## Not found

- **A census of agent instruction files on public GitHub.** Only a claim (60k+ for AGENTS.md [12]) and a sample [13]. Would find it: GitHub code search counts by filename (needs a signed-in search; not run, as this wave reads public pages only), or a GH Archive / BigQuery query.
- **Multi-agent use rates.** Hosts sell parallel agents [7][8]; no source gives the share of users running several. Would find it: host usage reports.
- **The reward below which only hobbyists answer.** No source; two role-played answers ($40–50, §4) are a direction only. Would find it: M0 by reward level after launch.
- **Agencies as first posters** (§3). No source on agencies running coding agents or what they would hand off. Would find it: agency surveys or case studies from the hosts.
- **Whether agents hand off in runs of hours.** K44's runs took 4 to 10 minutes. Would find it: E2.
- **Whether creator-paid platforms (Opire) succeeded.** Opire's pages give no figures [P11]. Would find it: Opire's public bounty list over time.
- **Agent hand-off for knowledge, repeated failure or an independent check, measured anywhere.** Would find it: host telemetry; our own M1.
- **Product Hunt's and X's own rules, dev.to and Discord examples.** Product Hunt and reddit.com pages refused or were not reached; secondary guides only. Would find it: the platforms' own pages read by the owner before posting.
- **Upwork's current fee schedule** from Upwork itself (403). Would find it: Upwork's help centre in a browser.
- **The brief's claim that Opire had more willing solvers than tasks.** Not verified here; RentAHuman's numbers [20] support the general point.

## References (all read 21 October 2026)

Market and hosts

- [1] Stack Overflow Developer Survey 2025, AI section: https://survey.stackoverflow.co/2025/ai
- [2] Stack Overflow blog, "The results of the 2026 Developer Survey are here", 6 October 2026: https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/
- [3] Stack Overflow Developer Survey 2026, AI section: https://survey.stackoverflow.co/2026/ai
- [4] METR, Time horizons (no longer updated, last noted 8 September 2026): https://metr.org/time-horizons/
- [5] Anthropic, "Introducing Claude Sonnet 4.5" (**claim**): https://www.anthropic.com/news/claude-sonnet-4-5
- [6] VentureBeat, "OpenAI unveils new model GPT-5-Codex optimized for agentic coding", reporting OpenAI's statement (**claim**; read through a search summary, OpenAI's page returned 403): https://venturebeat.com/ai/openai-unveils-new-model-gpt-5-codex-optimized-for-agentic-coding
- [7] Claude Code docs, "Get started with Claude Code in the cloud": https://code.claude.com/docs/en/web-quickstart
- [8] Cursor, Cloud Agents: https://cursor.com/for/cloud-agents
- [9] GitHub changelog, 19 February 2026, pull request throughput and time to merge in the Copilot usage metrics API: https://github.blog/changelog/2026-02-19-pull-request-throughput-and-time-to-merge-available-in-copilot-usage-metrics-api/
- [10] amplifying.ai, coding agents index (**tracker claim**; "Every count is a floor"): https://amplifying.ai/coding-agents
- [11] H. Li et al., "AIDev: Studying AI Coding Agents on GitHub", arXiv:2602.09185: https://arxiv.org/abs/2602.09185
- [12] agents.md (**claim** "used by over 60k open-source projects"): https://agents.md/
- [13] W. Chatlatanagulchai et al., "Agent READMEs: An Empirical Study of Context Files for Agentic Coding", arXiv:2511.12884 (v2 9 August 2026): https://arxiv.org/abs/2511.12884
- [14] Anthropic Economic Index, "AI's impact on software development" (conversations of 6–13 April 2025): https://www.anthropic.com/research/impact-software-development
- [15] Claude Code docs, "Manage costs effectively" (**claim** on averages): https://code.claude.com/docs/en/costs
- [16] Claude API pricing: https://platform.claude.com/docs/en/about-claude/pricing

Bounties, solvers and trust

- [17] J. Zhou et al., "Bounties in Open Source Development on GitHub: A Case Study of Bountysource Bounties", arXiv:1904.02724 (later in EMSE): https://arxiv.org/abs/1904.02724
- [18] M. Choetkiertikul et al., "Studying the association between Gitcoin's issues and resolving outcomes", arXiv:2309.15017: https://arxiv.org/abs/2309.15017
- [19] A. Pallais, "Inefficient Hiring in Entry-Level Labor Markets", NBER w18917 (AER 2014): https://www.nber.org/papers/w18917
- [20] P. Mehta, "Security Risks of AI Agents Hiring Humans: An Empirical Marketplace Study", arXiv:2602.19514: https://arxiv.org/html/2602.19514
- [21] D. Stenberg, "The end of the curl bug-bounty", 26 January 2026: https://daniel.haxx.se/blog/2026/01/26/the-end-of-the-curl-bug-bounty/
- [22] GitHub changelog, 13 February 2026, "New repository settings for configuring pull request access": https://github.blog/changelog/2026-02-13-new-repository-settings-for-configuring-pull-request-access/
- [23] codenote, "From Policy Documents to Closing the Gate — How Ladybird, codex, and tldraw Stopped Accepting External PRs in 2026" (secondary; links each primary): https://codenote.net/en/posts/oss-external-pr-shutdown-2026/
- [24] S. Ruiz, "Stay away from my trash!", tldraw blog, 17 January 2026: https://tldraw.dev/blog/stay-away-from-my-trash
- [25] E. Yokota, "sbt and the miners of the wild west", 26 January 2026 (update 29 January): https://eed3si9n.com/sbt-and-the-miners-of-the-wild-west
- [26] BasedAgents task page: https://basedagents.ai/tasks ; HN post "BasedAgents: Give your idle AI agent a paying job", item 49653106, 11 September 2026
- [27] NEAR AI, "Introducing NEAR AI Agent Market", 4 February 2026: https://near.ai/blog/introducing-near-ai-agent-market
- [28] Hacker News search API (Algolia), queries "bounty agents", "agents hire each other marketplace" (Show HN), "idle AI agent": https://hn.algolia.com/api/v1/search?query=bounty%20agents and https://hn.algolia.com/api/v1/search?query=agents%20hire%20each%20other%20marketplace&tags=show_hn

Discovery and channels

- [29] modelcontextprotocol/registry README: https://github.com/modelcontextprotocol/registry
- [30] saascity.io, "MCP server directories" (secondary; all rows checked by its author 7 October 2026): https://saascity.io/mcp-server-directories
- [31] Claude Code docs, "Install and manage plugins" (marketplaces from any Git repository; official and community marketplaces): https://code.claude.com/docs/en/discover-plugins
- [32] A2A Protocol: https://a2a-protocol.org/latest/
- [33] Hacker News, Show HN guidelines: https://news.ycombinator.com/showhn.html
- [34] Hacker News, comment by moderator dang on AI-generated Show HNs, item 47213630: https://news.ycombinator.com/item?id=47213630
- [35] Hacker News search API, Show HN "coding agent" since 1 January 2025: https://hn.algolia.com/api/v1/search?tags=show_hn&query=coding%20agent&numericFilters=created_at_i%3E1735689600
- [36] Hacker News, "Show HN: Cq – Stack Overflow for AI coding agents", item 47491466: https://news.ycombinator.com/item?id=47491466
- [37] redship.io, "The complete guide to Reddit self-promotion rules in 2026" (secondary): https://redship.io/blog/reddit-self-promotion-rules-2026

Staying free and cold start

- [38] GitHub Docs, "About GitHub Sponsors" (fees): https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors
- [39] GitHub pricing: https://github.com/pricing
- [40] golance, "Upwork Fees Explained: Full 2026 Cost Breakdown" (secondary; read through a search summary only): https://golance.com/blogs/upwork-fees-explained-2026
- [41] Vice, "How Reddit Got Huge: Tons of Fake Accounts": https://www.vice.com/en/article/how-reddit-got-huge-tons-of-fake-accounts-2/
- [42] Product Hunt launch guides (secondary; search summary only, Product Hunt's own guidelines not reached), e.g. https://www.tooljunction.io/guides/product-hunt-launch-checklist-2026

From PLATFORM.md (K42, its sources read 21 October 2026; numbering there): [P1] Bountysource core issue #1586; [P2] elementary, "Goodbye, Bountysource"; [P6] algora-io/algora at `74a49d7`; [P7] Algora home page; [P11] Opire home page; [P12] Opire docs; [P13] MTurk closure FAQ; [P15] Upwork legal (escrow). In this repository: [BF] `docs/box-v4/BOUNTY-FORMAT.md` and `packages/box-bounty/wording.ts` (`describe`); [G5] GitHub REST rate limits as cited in PLATFORM.md; K31, K31b and K40 records under `waves/` and `kitchen/reviews/`.
