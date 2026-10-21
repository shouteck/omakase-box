# Go to market: how box bounty reaches its first users, agents first (K44)

Written by the K44 cook for milestone PF, under the owner's thesis (D-2026-10-21-gtm-thesis), the no-money platform (D-2026-10-21-no-platform-money) and the platform's first version (D-2026-10-21-platform-v1). Research only: no post, comment, sign-up, account, form, message or payment. Every source was read on **21 October 2026**; references are numbered at the end. Vendor and tracker numbers are labelled **claim**. Where a source was read only through a search summary it says so.

> **State of this document: phase A.** The sourced research (questions 1, 3, 4, 5, 6, 8, 9, 10) and the method of the three fresh-agent studies are written. The studies themselves (question 2's hand-off experiment, question 4's solver-trust test, question 7's positioning test) are **pending — run by the head chef**; their expectations are fixed below *before* any run. The thesis marks, the recommended path, the experiments, the product proposals and the owner's decisions are written in phase B, after the runs.

## The owner's page

*Pending — written in phase B.* What phase A already shows, in four lines:

- **Coding agents are mainstream and getting longer-running; hand-off is not yet observed.** 31 % of 2025 survey respondents used agents at work [1]; in 2026 the share of AI users living in coding agents was 66 % [2]. Vendors claim 7 to 30+ hours of autonomous work [5][6]. But in our own runs agents declined to hand off 7 of 8 times (K31, K31b).
- **Supply is not the scarce side; good supply and demand are.** A 2026 agent-to-human marketplace had 539K registered workers and 303 bounties [20]. Paying for merged pull requests brings contributors fast (sbt: 145 PRs in a month from a crypto bounty scheme [25]) and also floods maintainers: curl ended its bug bounty, tldraw, Ladybird and openai/codex closed outside pull requests in 2026 [21][23][24].
- **"Put your idle agent to work" is already pitched**, by at least BasedAgents, NEAR AI Agent Market, Pinchwork, ClawdWork, BountyBook and TaskBounty, with almost no visible traction [26][27][28]. It is not new; nothing found combines it with the posting agent's own tool, memory and merge.
- **Machines find things through registries that cost nothing**: the official MCP Registry (preview, free, GitHub login) feeds GitHub's and other directories; a Claude Code plugin marketplace is any public Git repository [29][30][31].

## The owner's thesis, marked

*Final marks in phase B.* Provisional marks from sources only:

| # | Thesis point | Provisional mark | Evidence so far |
|---|---|---|---|
| 1 | Free for everyone; traction over revenue | untested | No source tests free versus paid for a bounty board. Free-for-public is how GitHub and GitHub Sponsors grew [38][39]; Algora charges 9 % + 4 % and now sells hiring [P6][P7]. A free bounty also removes the money that brought curl its slop [21], and the money that brought sbt its contributors [25]. |
| 2 | Earlier sites failed partly because people, not agents, created bounties; demand was scarce | demand scarcity **supported**; the cause **untested** | RentAHuman: 539K registered workers against 303 bounties in the study's sample [20]. Bountysource failed on payouts, not only demand [P1][P2]. Bounties are more often addressed in projects that post them often and early [17]: steady posting matters, which agents could supply. Nothing shows agent-created demand would have saved them. |
| 3 | Real demand arrives with agents running for hours | precondition **supported**; hand-off **contradicted so far** | Long runs are sold and used [5][6][7][8][10][11]. Hand-off observed: K31 0 of 5, K31b 1 of 3 (only the rules case). Question 2's study tests it on long tasks. |
| 4 | An ecosystem used mainly by agents on both sides | **untested**; early signs weak | 32.7 % of RentAHuman bounties came through API or MCP [20]; agent-hires-agent marketplaces exist but show little use [26][27][28]. |
| 5 | Supply and demand must both be solved | **supported** | Supply arrives with money and brings a flood [21][23][25]; demand is the scarce side [20]. Solvers need a reason, and posters need protection from volume. |

## 1. The market, sized from sources

**How many developers use coding agents.**

- Stack Overflow 2025 (31,877 answers to the agent question): 14.1 % use AI agents at work daily, 9 % weekly, 7.8 % monthly or less, so about 31 % use them at all; 17.4 % plan to; 37.9 % do not plan to. The survey says "AI agents are not yet mainstream" [1].
- Stack Overflow 2026 (more than 30,000 respondents): among AI users, 66 % use coding assistants or agents and 73 % of those use them daily; 30.9 % of 10,926 respondents use AI four or more hours a day. "The agents of choice are Claude Code (66%) and GitHub Copilot (59%)" (the base of these shares is not stated) [2][3]. The two surveys ask different questions and are not a time series.
- Public GitHub activity, lower bounds (**tracker claim**, amplifying.ai, captures to 20 October 2026): Claude Code about 4.2M pull requests all time (estimate), OpenAI Codex 5.1M+, GitHub Copilot 1.9M, Cursor 614K, Jules 1.2M, Devin 161K; "Every count is a floor" [10]. Research dataset AIDev (February 2026): 932,791 agent-authored pull requests by five agents across 116,211 repositories and 72,189 developers [11].

**How common long-running autonomous use is, and who offers it.**

| Host | What it offers | Source |
|---|---|---|
| Claude Code | Cloud sessions on Anthropic VMs; "run several independent tasks at once"; "Keeps running if you disconnect"; pushes a branch for review. Agent teams use "approximately 7x more tokens" than a standard session. | [7][15] |
| Cursor | Cloud Agents: "runs on its own machine in the cloud, works on a branch, tests itself"; parallel agents across branches; opens a pull request. | [8] |
| GitHub Copilot | Coding agent opens pull requests; since February 2026 the usage API reports "pull requests created with Copilot coding agent that got merged". | [9] |
| OpenAI Codex | Cloud tasks; **claim**: GPT-5-Codex seen working "independently for more than 7 hours" (OpenAI via VentureBeat; OpenAI's page refused the fetch). | [6] |
| Anthropic models | **Claim**: Sonnet 4.5 observed "maintaining focus for more than 30 hours on complex, multi-step tasks". | [5] |
| Devin, Jules | Autonomous agents with public pull-request footprints (161K and 1.2M PRs, **tracker claim**). | [10] |

METR's task-length measure gives a sense of what agents can finish alone, not how long they run: its example puts GPT-5 at about 2 hours 17 minutes at 50 % success; "Measurements above 16 hrs are unreliable"; the page is no longer updated (8 September 2026) [4]. Anthropic's April 2025 sample of 500,000 coding conversations classed 79 % of Claude Code conversations as automation, against 49 % on Claude.ai [14].

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

**Experiment:** *pending — run by the head chef.* Method and the expectations fixed in advance are under "Method" below.

## 3. Who posts first

Ranked by evidence, strongest first. "Evidence" means a source shows the group exists, runs agents unattended and has something an outsider could do.

| Rank | Candidate | Evidence | What it would hand off | Host |
|---|---|---|---|---|
| 1 | People running long autonomous agents (cloud sessions, background agents) | Products and footprints above [7][8][9][10][11]; 79 % automation in Claude Code [14]. | The stuck part of a long job: platform-specific checks, a failing piece after repeated attempts, a side task. | Claude Code, Codex, Cursor, Copilot |
| 2 | Small startups | 32.9 % of Claude Code conversations served startup work, against 23.8 % enterprise (an earlier draft of the same report said 33 % and 13 %) [14]. | Same as 1, plus work they have no one for. Private repositories are refused by the hard stop, which excludes most startup code. | Claude Code, Cursor |
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

So compute is cents to a few dollars per bounty. The real cost to a solver's owner is reviewing what their agent submits and the risk of not being paid. For scale: Bountysource's studied bounties averaged about $75 ($406,425 over 5,445 bounties, our division) [17]; RentAHuman's median was $25 per worker and 37.5 % paid under $10 [20]; Opire's minimum is $20 [P11]. **The reward below which only hobbyists answer was not found** in any source; the solver-trust study asks it, and real data must answer it.

### Trust without money in the middle

What made solvers trust and return elsewhere, from K42's sources: Upwork holds funds through a licensed escrow company and releases after 14 days of client silence [P15]; MTurk auto-approved unreviewed work [P13]; Algora charges the poster at reward time, solver paid in full [P6]; Bountysource held funds and stopped paying [P1]; Opire leaves payment to the creator ("a claim does not create an automatic payment") [P11][P12].

**Are public payment facts enough?** Evidence that public, facts-only history changes behaviour: in a field experiment on oDesk, hiring 952 random workers and giving them public evaluations "substantially improved workers' subsequent employment outcomes" [19]. That is the solver's own record helping the solver. For the owner's record (paid, confirmed received), no comparable study was found. Where creators paid directly, Opire shows no public traction figures [P11]; no source of its success or failure was found. **The solver-trust study tests it** (pending).

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

Order shown: agent A sees O1, O2, O3 (S1, S2, S3); agent B sees O3, O1, O2 (S3, S1, S2). Answers: *pending — run by the head chef.*

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

*Draft from sources; finalised in phase B with the study results.* Order and dependencies only.

1. **Demand first, from our own projects.** The kitchen's real bounties on its own public repositories, posted by its agents for real reasons. Depends on: the platform's first version listing them. Sources: steady, early posting is what predicts bounties being addressed [17]; the scarce side is demand [20].
2. **Friendly projects** whose owners already run agents: invited by the owner (customer contact is the owner's).
3. **Solver agents through the registries** of question 5: the MCP server and feed listed in the official MCP Registry, a plugin marketplace repository. Depends on: 1, so a solver finds something.
4. **The kitchen solving a few early bounties itself, labelled** as the kitchen on the solution and on the board (owner's decision; Reddit's founders filled their site with their own accounts and called it key to its tone [41], which is the risk being labelled away).

**Stop or change signals** (thresholds in question 10): no agent-initiated bounty after the kitchen's own projects run with instructions on; solutions arrive but are not merged; maintainers or posters ask for a way to stop solutions.

## 10. What we measure

Collected only from what the product already records (bounty records, the shared event chains, the issue and its pull requests, the board's public payment facts); nothing about people beyond that. *Thresholds are a phase A draft; phase B fixes them.*

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

Two fresh agents play the owner of an idle coding agent. Each sees two bounty pages from a facts-only board (D-2026-10-21-platform-v1) where the owner pays the solver directly (D-2026-10-21-no-platform-money): same reward ($60), same "merged solution is paid" rule, one owner with no record (0 merged, 0 recorded paid, 0 confirmed) and one with a good record (14 merged, 14 recorded paid, 12 confirmed, median 2 days to payment). To keep the task and repository from deciding the answer, agent B sees the records swapped between the two tasks, and the no-record page second. Six questions: take each or not and why; what would change a no; whether direct payment with a public record feels safe enough against escrow; the lowest worthwhile reward; what was not understood or believed. Prompts: `prompts\trust-A.md`, `prompts\trust-B.md`. Answers: *pending.*

### Positioning (question 7)

Two fresh agents per side, each playing that side's user, see the three lines above in shuffled order and answer: would you try it and why not; which line is clearest and least clear; the first thing you would want to know; anything not believed. Prompts: `prompts\position-owner-A.md`, `-owner-B.md`, `-solver-A.md`, `-solver-B.md`. Answers: *pending.*

None of the six text-only prompts states the thesis or a hoped-for answer; each tells the participant to answer from the message alone and report plainly.

---

## Recommended path

*Pending — phase B.* (First users on each side; first channels; launch sequence after the platform's first version; stop or change signals; what we will not do at launch.)

## Experiments at $0 before launch

*Pending — phase B.*

## What this means for the product (proposals for the CTO)

*Pending — phase B.*

## The owner's decisions

*Pending — phase B.*

## Not found

- **A census of agent instruction files on public GitHub.** Only a claim (60k+ for AGENTS.md [12]) and a sample [13]. Would find it: GitHub code search counts by filename (needs a signed-in search; not run, as this wave reads public pages only), or a GH Archive / BigQuery query.
- **Multi-agent use rates.** Hosts sell parallel agents [7][8]; no source gives the share of users running several. Would find it: host usage reports.
- **The reward below which only hobbyists answer.** No source. Would find it: the solver-trust study (direction only) and, after launch, M0 by reward level.
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
