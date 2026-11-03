# The solver side, taken apart (K47)

Written by the CTO on 3 November 2026, before PF12 is built, at the owner's request: find what is conceptually wrong with [PF12](../../waves/PF12.md) and [PF12b](../../waves/PF12b.md), and bring ideas. The frame is the owner's (D-2026-11-03-solver-side-by-need): judge for agents that run for days, keep budgets and run businesses, not for today's sessions. Nothing here edits PF12; the last section says how I would re-brief it, and what only the owner can decide.

Outside pages were read on 3 November 2026 unless dated otherwise. Our own numbers come from [GTM.md](GTM.md) (K44, read 21 October 2026) and [K46](../../waves/K46.md); each carries its denominator and whether it is a claim or a measurement.

## The short version

PF12 gets the direction right and the mechanism wrong in four places.

Right: pay on merge first; facts and never a verdict; needs and capabilities marked as each side's own word; pull with a cursor; the "agents welcome" line and the self-dealing exclusion that already ship. Those hold up, and the first of them is the whole reason an autonomous solver could ever trust this board.

Wrong, in order of how much it would cost to find out on the branch:

1. **The tune-in is in the wrong place.** PF12 stores the subscription on the board and pushes to a webhook. Agents that run for days are not listeners; they are durable identities that their own host wakes on a schedule, an API call, a GitHub event or an email (Cloudflare Agents, Claude Code scheduled tasks, Copilot). The solver's filter and cursor belong in the solver, and the only thing the board has to be is a stable feed of what is new since a cursor. We already have most of that.
2. **Broadcast plus winner-takes-all does not add up for machines.** Every agent that hears of a bounty at the same instant and starts work is paid only if merged, and only one is. Expected value falls as one over the number of attempts. PF12 has no answer to contention. The honest, mechanical answer already exists on GitHub: a draft pull request opened at once, counted and aged as a fact.
3. **The solver's identity is undefined, and the payment path assumes a person.** Pay on merge pays "the account tied to the merged pull request's author" (PAY-ON-MERGE, outline step 4), which means a GitHub user who signed in to the board. An agent working under a GitHub App identity (`name[bot]`) cannot sign in. GitHub's terms allow one free machine account per person. So the one identity that scales to many agents is exactly the one the board cannot pay.
4. **Needs and capabilities as matched sets is a taxonomy the posting agent will not fill and the solving agent does not need.** The posting agents in K44 did not run `describe`; they will not curate a needs list. A language model reading a 40 KB fact card judges fit better than a set comparison on free words. What a solver does need is cheap: the hard requirements that gate whether it can test at all, and the facts that make expected value computable.

The recommendation at the end is to re-brief PF12 as a solver skill, a since-cursor feed and four new facts, with no subscription store and no webhook, and to make the installed posting base the first supply by adding one line to the owner's standing rules. The owner has three decisions to make, listed last.

## 1. The wake: where "tune in once" really lives

**PF12 assumes** the board keeps a subscription (capabilities, filter, route) and delivers each match once, by push to an address the solver gave, with signed bodies, delivery ids and retries after GitHub's webhook convention, or by pull since a cursor.

**Found.** How the hosts that run agents for days actually wake them:

| Host | What exists | Read |
|---|---|---|
| Cloudflare Agents | "Agents are durable identities, not always-on processes." A hibernated agent is woken by an HTTP request ("a webhook from GitHub" is their example), a WebSocket, an RPC, a scheduled alarm or an inbound email, and is evicted after about 70 to 140 idle seconds. Schedules live in SQLite and survive restarts. | developers.cloudflare.com/agents, long-running agents and schedule tasks pages |
| Claude Code cloud scheduled tasks | A saved prompt, repositories and connectors, run on a schedule, on an HTTP POST to the task's own endpoint with a bearer token, or on GitHub pull request and release events (issue events too, per one secondary guide) on repositories where the Claude GitHub App is installed. Local scheduled tasks fire only while the app is open. | code.claude.com/docs/en/routines |
| GitHub Copilot coding agent | Assigning an issue starts a session that opens a draft pull request at once and pushes commits to it; it reads the issue only at assignment time. | docs.github.com, "Kick off a task with Copilot agents" |
| Monid (the owner's model for the posting side) | A skill (`set up https://monid.ai/SKILL.md`), a remote MCP server or a CLI, all pull: `discover`, inspect, `run`. Nothing in Monid pushes to an agent. | monid.ai, docs.monid.ai |
| MCP itself | The 2026-07-28 revision makes the protocol stateless and removes sessions; server-to-client change notifications arrive only on the response stream of a `subscriptions/listen` request the client holds open. A stateless Streamable HTTP server, which ours is, cannot reach a client that is not connected. | modelcontextprotocol.io changelog and subscriptions pages |

**What it means.** The thing that wakes a long-running agent is its own host's trigger. Our push would be one more wake source among several, and the solver would still have to build the receiving end (an endpoint, a bearer token, a handler) before it could "turn to other work". The thing every one of those hosts can do with no new infrastructure is poll on a schedule: `scheduleEvery(900, "checkBoard")`, a cron scheduled task, a GitHub Actions cron. Polling a feed that answers `304 Not Modified` costs the board nothing it does not already pay (feed.ts already says "Polling more than every 5 minutes gains nothing; send If-None-Match").

So "tune in once" is real, but it is the solver writing its filter and cursor into its own memory and scheduling its own check. The posting side already keeps its memory the same way, in the agent's instruction files and the owner's settings, not in a service. The symmetric design keeps the solver's memory in the solver.

What the board must then guarantee is narrow: a feed ordered by a stable key, a cursor that never skips or repeats a bounty across pages and restarts, and an entry that carries every fact needed to decide without a second call. The first two mostly exist (`findBounties` with `cursor`, newest first, `If-None-Match`); the cursor today pages backwards from newest, so the one thing to add is a forward "new since" read.

**Alternatives for push, if the owner still wants work delivered.**

- *GitHub as the bus.* The solver names a repository it owns as its inbox; the board, through a GitHub App the solver installs on that one repository, opens an issue there per match. GitHub then does what PF12's push would have to build: signing, retries, redelivery, a public log, and it already wakes Copilot (assign), Claude Code scheduled tasks (issue events) and any Actions workflow. The board writes one issue per match per subscriber, which is the same subrequest count as a webhook, but with no address validation, no private-network checks, no signature scheme of our own and no replay surface. Cost: a GitHub App owned by the board, and the solver's inbox is public unless the repository is private, which is fine, since bounties are public.
- *Email.* Cloudflare agents wake on inbound email; AgentMail sells agent inboxes (listed on Monid). Universal, slow, and the board would need a sender. Second choice.
- *Raw signed webhooks,* as PF12 has them. Third choice: the most code, the most security checks (PF12's own list: `https` only, no private networks, no slow servers, forged and replayed bodies), and it serves only solvers that already run a server.

Whichever route, delivery is at least once with an idempotency key (the bounty id), as GitHub's own webhooks are. PF12's test "reaches the solver exactly once" is not a guarantee a push system can make; the receiver dedupes on the id. Write the test that way.

## 2. Contention: many agents, one reward

**PF12 assumes** each new match reaches every matching subscriber. PLAN.md: "The merged solution earns the reward, all of it."

**Found.**

- GTM §4: the two solver-side agents priced their own 15 to 30 minutes of review and "around 50 %" odds of not being merged, not compute (two agents, one model, playing a part). The flood evidence is the other side of the same coin: curl's valid-report rate fell under 5 % and the program closed; tldraw auto-closes outside pull requests; GitHub added "restrict pull requests to collaborators" (all 2026, GTM §4 sources [21] to [24]).
- Algora's convention: `/attempt #n` as an issue comment to say you are working on it ("It does not reserve the bounty, but it is expected etiquette"), and `/claim #n` in the pull request. Algora's founder on Hacker News, 2022: "We're actually not a fan of having multiple developers compete for the same reward"; their issue page shows who started a solution and when.
- Copilot's convention: a draft pull request within seconds of assignment, before any code.
- Our board already counts open pull requests per bounty and offers `solutions: none | some` as a filter (mcp.ts).

**What it means.** For a person, taking a bounty five others are on is a judgement call made once. For a fleet of agents woken by the same event at the same second, it is the default outcome, and the expected value of each attempt is reward times merge odds divided by attempts. A 24/7 solver that cannot see attempts cannot price its work, and one that can will stop answering bounties that already have a draft, which is what we want: fewer, better-timed attempts, less flood for the poster.

The board must not pick a solver (it rates nobody). But it can state facts about attempts, and the convention that makes attempts visible without new state of ours is Copilot's: open a draft pull request first. The board then reports, per bounty, `in_progress: [{ author, draft: true, opened_at }]` beside the open and all-time counts. A solver skill tells the solver agent to do the same, so its own attempt is visible to the next agent.

**Alternatives.**

- *A claim with an expiry on the board* (first to claim gets a stated window). Mechanical, but it is state the board holds and defends (squatting, expiry, disputes), and it leans towards a verdict ("this one is assigned"). The draft convention gives most of the value with none of the state.
- *Staggered delivery* (deliver to one solver, widen after a delay). This is the board choosing, which the product rules forbid.
- *The poster's own agent sets an attempts cap* in the issue. Possible later; it is a poster-side feature and belongs in a poster-side wave if real use asks.

## 3. Identity: who the solver is, who gets paid, where the card attaches

**PF12 assumes** a solver that signs in, states capabilities, receives work, opens pull requests, has a record "computed from what GitHub records" and is paid on merge.

**Found.**

- The board's payee for pay on merge: "only the account tied to the merged pull request's author, never anything in a solver's text" (PAY-ON-MERGE.md, outline step 4, and the finding that Stripe paid whichever connected account it was handed). The board's sign-in is GitHub OAuth, which only a user account can complete.
- GitHub's terms: a machine account is set up by a person who is responsible for it; "You may maintain no more than one free machine account in addition to your free personal account." GitHub Apps are unlimited and each gets a `name[bot]` identity that authors commits and opens pull requests; Apps authenticate with short-lived installation tokens (two 2026 write-ups quoting the terms and the App docs; the terms page itself read today).
- The feed already excludes from an owner's record any merge where "the solver is the poster, or GitHub lists them as an owner, member or collaborator of the repository" (feed.ts, `owner.record`).
- BACKLOG, from PF18: a solver's existing Stripe account cannot be linked; each solver gets a new one.
- GTM §4 and §7: both solver-side agents asked "whether a real person is behind each one"; both posters feared "unreviewed agent pull requests".

**What it means.** A business running many agents has three choices for the pull request's author: its owner's personal account (one identity for every agent; the record is the business's, which is probably what it wants), its one machine account, or one App per agent. Only the first two can sign in and be paid. PF12's "capability card" per solver would attach to whichever GitHub login opened the pull request; for an App that is a login that can never hold a card. For agent fleets, the card attaches to nothing.

The underlying question PF12 skipped is: *what is a solver?* The answer that makes payment, record and identity line up is **a payee**: a GitHub user account that signed in to the board and connected a way to be paid. Agents are not solvers; they work for a payee. A pull request opened by `acme-agent[bot]` names its payee in one fixed line of its body (BT11b had exactly this convention, for the payment link); the board shows "authored by acme-agent[bot], for @acme", pays @acme if merged, and counts the merge on @acme's card. A pull request whose author is a signed-in user needs no line. A pull request from a bot with no payee line is a fact too: "no payee named".

This also answers the posters' fear honestly: the record and the money always point at an account a person accepted GitHub's terms for.

**Alternatives.**

- *Leave it as PF12 has it* and accept that only user-authored pull requests can be paid. Cheapest, and it quietly excludes the fleets the owner is building for.
- *The board issues its own solver identities.* No: a second identity system beside GitHub's, and the product rule says GitHub is the identity.

## 4. The match: needs and capabilities

**PF12 assumes** a bounty states needs from "a short fixed list plus free words", a solver states capabilities from the same list, and "a match is a bounty whose needs are all among the solver's capabilities".

**Found.**

- GTM §2: the three reasons agents hand off are access (a platform, a device, a service), parallel capacity and domain knowledge. K44's three posting agents did not run `describe` at all (0 of 3; 0 of 15, 0 of 21 and 0 of 6 runner commands were `box`), so a posting agent that must stop and classify its need is unlikely to.
- A2A's Agent Card, the nearest published convention for "what an agent can do": `skills` with `id`, `name`, `description`, `tags` and `examples`, which the spec calls "largely a descriptive concept". Nobody matches on it as a set; clients read it.
- Monid's discovery is a ranked search by job description, price and health, not a tag intersection.
- Our bounties already carry the repository's primary language from GitHub, and the issue already carries the task, what was tried and the one line of why.

**What it means.** Of the three reasons, only access is a hard gate: a solver without a Mac cannot test a macOS fix however well it reads. Capacity is a property of the solver (it is idle or not). Knowledge is what a language model reading the task judges in one pass; a "domain: payments" tag is a worse signal than the task text, and free words do not intersect ("macOS", "mac", "darwin", "Apple silicon"). Set matching is a taxonomy the poster will not curate and the solver does not need.

What a solver paying per wake does need is to avoid wakes it cannot act on. So:

- Keep `needs`, but as **hard requirements only**: platform, device, paid service or credential class, from a fixed list with no free words, and optional. The posting tool offers it; an agent's `--why` text often already contains it ("needs to check it on a Mac", K44 H1), but the tool does not infer it, since inference is a judgement.
- Drop solver-side capability storage. The solver's filter (needs it can meet, minimum reward, pays on merge only, languages, repositories) is its own tool arguments and its own memory, exactly as `find_bounties` takes them today.
- Let the fact card do the rest. The solver's model reads title, task size, needs, language and the money facts, and decides. That is the match.

A test for this wave should still hold: a bounty that needs `macos` never reaches a solver whose filter excludes it. The filter is the solver's; the test is that the board honours it.

## 5. The facts a machine needs to compute expected value

**PF12 lists** pays on merge, reward, needs, solutions and their state, the owner's payment record, task size in files and lines, age.

**Found.** The feed already carries reward, `pays_on_merge` ("a fact about the setting; it is not a promise of payment"), `how_it_pays`, the owner's record with `median_days_to_record_paid`, `owed_now` and `says_not_received`, open and all-time pull request counts, language, `age_days` and `approved_by` (feed.ts). The solver-trust study's two agents asked for: money visibly ready before work; the age of unconfirmed payments; whether the owner or the owner's agent promised the reward; the state of the open pull request; what happens when two pull requests both work (GTM §4, two agents, one model).

**What it means.** PF12's list holds up. This is the piece of the brief I would keep as written. Four facts are missing for an agent that computes rather than feels:

1. **The remaining pay-on-merge limit, as a number.** "Pays on merge: true" is a setting; "limit remaining: $120 of $200" is the nearest thing to money visibly ready that a board holding no money can state. It is already known to the board (the reward must be "within their limit, as of this read").
2. **The owner's time to a decision.** Median days from first pull request to merge or close, over this owner's bounties. An autonomous solver's capital is locked until the poster's agent decides; today's record only says how fast they pay once merged.
3. **Attempts in progress**, from section 2: draft pull requests with their age.
4. **Whether the solution's author is also the poster** is already excluded from the record; say it on the bounty too when it happens ("the only open pull request is the poster's own"), since a solver should not compete with the poster's own agent without knowing.

And one word to remove: "task size in files and lines" is a fact about the snapshot, not the work. Keep it, but do not put it before the money.

None of these is a verdict. Each is a count or a date.

## 6. The budget: Workers Free, measured today

**PF12 assumes** push may be capped and "the plan measures both on Workers Free's limits".

**Found** (developers.cloudflare.com, limits and pricing pages, read 3 November 2026; the D1 pricing page is dated 30 October 2026):

| Limit | Workers Free |
|---|---|
| Requests | 100,000 a day |
| CPU per invocation | 10 ms |
| Subrequests per invocation (fetch, D1, KV) | 50 |
| Cron triggers per account | 5 |
| Queues | 10,000 operations a day on Free; the Queues product page lists them under the Paid plan's billing |
| D1 rows written | 100,000 a day |
| D1 rows read | 5 million a day |
| D1 queries per invocation | 50 |

**What it means.** Push from a cron tick can do at most about 50 sends per invocation, each counting one subrequest, with D1 reads and writes inside the same 50. With 5 cron triggers a day-long fan-out to, say, 500 subscribers for 10 new bounties is 5,000 sends: a hundred invocations, several hours of cron ticks, each delivery state written to D1. It fits, barely, and every retry doubles it. The cap PF12 would have to state is small (tens of subscribers, not hundreds), which is honest but is also a reason not to build it first.

Pull costs the board one request per solver per poll, served from D1 with an `ETag`. 500 solvers polling every 15 minutes is 48,000 requests a day, inside the 100,000, with zero writes. The 5-minute floor the feed already states should become 15 for scheduled solvers, and `304` answers should be counted in the measurement.

A real measurement, not an estimate, belongs in the build wave; the numbers above are the ceilings it measures against.

## 7. Supply: where the first solvers come from

**PF12 and PF12b assume** solvers arrive through a tool listed where agents search, found by their own need (income, idle capacity).

**Found.**

- GTM §4: every "put your idle agent to work" offer found (BasedAgents, NEAR Agent Market, Pinchwork, ClawdWork and others) showed no traction; the one supply that moved was Gittensor paying tokens for merged pull requests on real repositories (23 contributors, 145 pull requests, 132 merged in a month at one project; then the maintainer required human verification). Both solver-side agents named money and the owner's record as the first facts.
- Monid lists tools agents *pay* per call ("Pay per call, $0.0013, debited from one balance"); the category "a tool that pays the agent" does not exist in its catalogue. Listing is a connector pull request, so it is possible; whether an agent ever searches "earn income" is unknown, and GTM found no such searches.
- D-2026-11-01-solver-distributor: one market; an agent may both post and solve.
- The posting tool is already installed, with instructions, in every repository whose owner allowed it, and the owner's standing rules are where permission lives (PLAN, "Who controls it").

**What it means.** PF12b's listings are cheap and should be done, but they will not bring supply in the first year, because no agent has an income goal yet; the registries serve spending. The supply that exists today is the installed posting base: agents that already have the tool, already have their owner's standing rules, and are idle between jobs. The symmetric lever is one line in those rules: *my agents may take bounties* (off by default), with the same shape as posting's permission: which repositories or languages, the minimum reward, pays on merge only, a budget per attempt that the host enforces. The posting skill gains a solving half; `describe` tells an idle agent when taking a bounty is worth it, in the same voice that tells it when handing off is. That is distribution at zero cost, and it is the one place where "the owner is involved once" already holds.

Self-dealing (an owner's agent solving its own bounties for pay to itself) is already excluded from the record by the feed; the same rule reaches the card.

The second supply is friendly projects the owner invites (GTM §9, step 2), which is the owner's. The third is the registries. In that order.

## 8. The solver's risk: what it runs

**PF12 treats** hostile text as a field-marking problem: poster text stays data, each field says whose word it is.

**Found.** The posting side's rule is that the tool never runs anything a solver wrote. The mirror image is that a solver *must* run what the poster wrote: it clones a stranger's repository, installs its dependencies and runs its tests, on a machine that may hold the solver owner's credentials. Both solver-side agents in GTM §7 raised exactly this ("running an agent against strangers' repositories (prompt injection, secrets)"). Claude Code's own GitHub Action refuses bot actors and non-write users by default for this reason.

**What it means.** The board cannot make a repository safe and must not say it is. It can state facts a solver's rule can filter on: the repository's creation date, the owner's account age (BACKLOG, PF4), the owner's counted merges, and one constant line: "The board has not read or run this repository's code." The solver skill says the rest: work in a disposable environment, never with the owner's credentials in reach. That is guidance in the same register as `describe`, which already says when a bounty is not worth it.

## What holds up as written

So that this is a reading and not a demolition: PF12 step 4 (the facts, with the additions in section 5), the pull route with RSS, "both are each side's own word", "the board verifies neither", "no score, ranking or advice", pays on merge first, and the reuse rule for `find_bounties` and `get_bounty` all stand. The security list in PF12's lenses is right for the push it describes; if push goes, most of that list goes with it, which is the point.

## Recommendation: how to re-brief PF12

One wave, smaller than the current 360 minutes, and no new store:

1. **A solver skill** (`SKILL.md`, the posting side's convention since D-2026-10-31): how to set a filter and a cursor in the agent's own memory, how to schedule a check on its own host (cron, scheduled task, `scheduleEvery`), what the facts mean, open a draft pull request first, name the payee in the fixed line, work in a disposable environment, and when a bounty is not worth it. Tested the way the posting block was: fresh agents, scratch folders.
2. **A "new since" read** on the feed and `find_bounties`: forward from a cursor, stable across pages and restarts, `ETag` on every answer, 15-minute floor stated.
3. **Four facts** on every entry: remaining pay-on-merge limit, median days to decision, attempts in progress with age, and the poster-is-author flag.
4. **The payee line** in the issue's "how to answer" and in `get_bounty`, read by the board from the merged pull request's body; the card attaches to the payee. The card itself can wait for a later wave, since it is read from the same facts.
5. **`needs` as hard requirements only**, fixed list, optional, a repeatable flag on `create`, a new format version with the old one still parsed. No capability storage.
6. **The standing rule for earning**, off by default, in the owner's settings beside posting's, and the solving half of `describe`. This is the supply decision and needs the owner's word.

Not built: a subscription store, webhooks, push caps, address validation, signatures of our own, exactly-once delivery tests. If the owner wants delivery, GitHub-as-inbox (section 1) is the next wave, on a real request from a real solver.

PF12b stays as written, after this, with one expectation changed: it lists the channel; it does not bring the first solvers.

## For the owner: three decisions

1. **Where the tune-in lives.** In the solver (a skill and a cursor; the board stores nothing) or on the board (a subscription and push)? Recommendation: the solver, with GitHub-as-inbox as the later push if asked for.
2. **What a solver is.** A payee (a signed-in GitHub user; agents work for it and name it), or the pull request's author whatever it is? Recommendation: a payee. It is the only answer under which an agent fleet can be paid and have a record.
3. **Whether the installed base may earn.** One line in the owner's standing rules, off by default. Recommendation: yes, because it is the only supply that exists this year and it costs nothing to offer.

## Sources

Outside pages, read 3 November 2026: monid.ai, docs.monid.ai and github.com/monid-ai/monid; a2a-protocol.org specification (AgentCard, AgentSkill); docs.github.com "Kick off a task with Copilot agents" and the GitHub blog on the coding agent; modelcontextprotocol.io Streamable HTTP, Resources, Subscriptions and the 2026-07-28 changelog; developers.cloudflare.com Agents (long-running agents, schedule tasks, webhooks, lifecycle), Workers limits and pricing, D1 limits and pricing (page dated 30 October 2026); docs.github.com Terms of Service, with two 2026 write-ups on GitHub Apps as agent identities (vitruviansoftware.dev, zylos.ai) quoting the machine-account clause; Algora's claim and attempt conventions (deepwiki.com/algora-io/algora, a 2026 BountyOS guide, Algora's founder on Hacker News, 2022); docs.cdp.coinbase.com and github.com/x402-foundation/x402 for x402 (read; not relied on above, since the board carries no money).

Our own: [GTM.md](GTM.md) §2, §4, §7, §9 (K44, 21 October 2026); [K46](../../waves/K46.md) and [PAY-ON-MERGE.md](PAY-ON-MERGE.md); `packages/box-platform/src/mcp.ts` and `feed.ts` at `4485ee4e`; [PLAN.md](../../PLAN.md); [DECISIONS.md](DECISIONS.md); [BACKLOG.md](../../BACKLOG.md).
