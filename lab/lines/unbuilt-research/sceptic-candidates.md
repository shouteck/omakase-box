# Sceptic review: candidates.md and related-work.md

Line E, session 1, 7 October 2026. Reviewer: a fresh agent, Claude Code host, model Opus 5.5 (`claude-opus-5-5`). Presumably the same model family as the lead; fresh context, no shared conversation. This is not model diversity and is not claimed as such. Zero cost: web search and open pages only. No Git changes; no file edited other than this one.

**Standing in one line.** "One survives, weakly" does not stand. On what I opened, the honest answer is **none**, with the transaction layer as the nearest miss. The paper's headline numbers were quoted against the wrong baseline and from a superseded version, and the "no product found" claim falls to a crowd of small tools plus three backup vendors and several shipped framework features.

## How things were read

`[F]` full text read by me: nothing. I had no way to read a paper end to end; every page went through the summarising fetch tool. `[A]` fetched through the summarising tool, with targeted questions and verbatim quotes requested; numbers are from those answers and could be mis-transcribed by the tool. `[S]` search-result summary only.

Opened `[A]`: arXiv 2602.14849 abstract page, v1 HTML (two passes), v2 HTML (two passes); ICLR virtual page 10016322; `github.com/mpi-dsg/atomix`; arXiv 2606.17573 (abstract and HTML); arXiv 2603.20625 (abstract and HTML); arXiv 2609.29095 (abstract); arXiv 2504.04715, 2606.04193, 2606.17929, 2608.24957 (abstracts); `github.com/rsh1k/revoco`; `github.com/revert-labs`; HN item 47294291 (SafeAgent); aion.to blog; Veeam "what is AI rollback" page; groundy.com on Cloudflare Workflows rollbacks; beri.net on Rubrik Agent Cloud (28 April 2026); two engineering round-ups (agentmarketcap.ai, digitalapplied.com).

Failed to open: PyPI pages for `pherix`, `agent-tx`, `once-agent-sdk` (page would not load); Rubrik's own Agent Rewind page (403). Those stay `[S]`.

About 30 searches. The lead recorded no search queries, so its search cannot be rerun; that is the first finding under "reproduce".

## Task 1. Existing products and tools for the survivor

**Small open-source tools doing the same thing (none popular, none funded that I could see).**

| Tool | What it does | Size / date | Read |
|---|---|---|---|
| Revoco (`rsh1k/revoco`, PyPI) | "Undo for AI agent actions". Plans the inverse before the action runs; sorts actions into idempotent / reversible / compensable / irreversible / unknown; policies can demand a reversibility floor; inverse registry for 91 operations over eight surfaces (SAP, Workday, AWS, identity, DevOps, database, SaaS, workstation); hash-chained ledger. Only the workstation surface is said to be validated. | 0 stars, 98 commits, Apache-2.0, PyPI up to 0.5.0 | `[A]` |
| Revert Labs (`revert-labs`) | "git for AI agent actions". Event-sourced action ledger with before-image and idempotency key, tiered undo engine. A private `revert-enterprise` repo is described as a control plane with cross-service compensation, i.e. someone intends to sell exactly this. | 0 stars, v0.1 in progress, last update 3 Oct 2026 | `[A]` |
| Pherix (PyPI) | "Transactional resource runtime for AI agents": wraps the tool-call layer, one append-only journal, commit / rollback, atomicity, isolation, capability enforcement. | unknown | `[S]` |
| `agent-tx` (PyPI) | Compensating undo plus write-ahead log for tool calls. | unknown | `[S]` |
| SafeAgent | Exactly-once guard for tool side effects (request id plus durable receipt). | Show HN about March 2026: 3 points, 2 comments; a commenter says it is a Postgres unique constraint | `[A]` |
| OnceOnly SDK / `once-agent-sdk` | "Exactly-once execution + runtime safety + agent control plane" between agent and world. | unknown | `[S]` |
| Atomix itself | The paper's code. | 7 stars, 0 forks, 1 commit, alpha | `[A]` |

Seven independent attempts in about eight months, none with users I could see. That cuts both ways: no popular tool exists (filter 7's letter), and the idea is obvious enough that many people built it in a weekend and nobody adopted any of them (filters 4 and 8).

**Vendors.**

- **Rubrik Agent Rewind / Agent Cloud.** Announced August 2025 `[S]`. A 28 April 2026 article on Rubrik Agent Cloud for Gemini Enterprise `[A]` says pricing and general availability dates were not disclosed and no named customer exists. The same article lists "database writes, file operations, API calls to third-party systems, money movement, email sends" as what Rewind handles, and describes a policy engine (SAGE) applying "real-time guardrails" on intent. That contradicts the lead's "nothing read says it can take back an email or a payment". It is a secondary source of unknown quality and I could not open Rubrik's page; treat as unresolved, not as "restores backups only".
- **Veeam Agent Commander.** Announced 24 February 2026, private preview from end of March 2026 `[S]`. Veeam's own page `[A]`: "see what they're doing, contain what they can touch, and roll back the actions that go wrong", and "High-risk or hard-to-reverse actions pause for human approval before they run." That is gate-irreversible plus rollback, from a second large backup vendor. **Missed by the lead.**
- **Cohesity Agent Resilience** (2026) `[S]`: snapshot and recovery of agent memory, configuration and the data agents touch. Missed by the lead. A search summary also names Commvault and Druva as pursuing agent rollback; not opened.
- **Cloudflare Workflows saga rollbacks**, shipped 5 June 2026 `[A]`: a `rollback` handler per `step.do()`, run in reverse order on terminal failure. Not agent-specific and no idempotency enforcement or gating; but Cloudflare's Agents SDK separately has `waitForApproval()` `[S]`. Missed by the lead.
- **Workflow engines.** Temporal (official OpenAI Agents SDK and Vercel AI SDK integrations, activities as tools), Restate, DBOS, Inngest `[S]`. DBOS documentation is reported to checkpoint MCP tools automatically (`durableMCPTools`) and use the tool-call id as idempotency key `[S]`. The lead's description (step not repeated; no reversibility sorting) holds on what I saw. A Restate docs issue (#410) says a step can re-run if the process dies before the result is journaled `[S]`.
- **Frameworks.** LangChain human-in-the-loop middleware (approve / edit / reject per tool) and LangGraph durable execution with tasks `[S]`; Google ADK Tool Confirmation and session Rewind `[S]`; a Pydantic-AI proposal for "agentic two-phase commits" (issue #4679) `[S]`.
- **MCP gateways.** TrueFoundry's gateway holds a matching tool call before the side effect, with pending / approved / denied / expired / executed states `[S]`. Gravitee publishes design pages on rollback and approval gates `[S]`; I did not confirm a shipped feature.
- AWS Bedrock AgentCore Gateway: nothing on idempotency or undo found `[S]`. Composio, Arcade: Arcade has a documentation pattern page on idempotent operations `[S]`; no product feature found. Microsoft Agent Framework: no compensation feature found in one search.
- No funded startup found whose whole product is this. Three searches including two extended ones; still a weak absence.

**A paper the lead missed that bears directly on the case.** "Where Does Exactly-Once Live?" arXiv:2609.29095, 24 September 2026 `[A]` (abstract): 25,930 episodes, nine models, three production harnesses. Frontier models told to act once almost never duplicate when they can verify (0.5%), but duplicate in 56% and 74% of episodes when a request is in flight or the transport delivers twice; offering an idempotency key on the tool lowers duplicates from 28% to 4%. Reading: the duplicate problem is real, and most of the fix is a tool-contract feature the tool owner adds, not a new layer.

**Verdicts.**

- **Filter 7: fails in substance, passes only on its narrowest letter.** No single funded product or popular open-source tool does all four things. But two public-scale backup vendors sell "undo for agents" with approval gating (one missed), a third sells recovery, Cloudflare shipped saga rollback, gateways hold irreversible calls, and at least six open-source projects implement the same design. The market has found it; what it has not done is make anyone popular.
- **Filter 4: fails.** Each of the four parts is shipped standard practice in a named product (idempotency keys, saga compensation, approval gates, step journals). The only part not standard is the paper's per-resource frontier for concurrent agents, which is not what the candidate proposes to sell.
- **Filter 2: weaker than stated** (see Task 2). The paper does not show the layer beats plain checkpoint-and-retry on task success.
- **Test 9 (the model is not the moat), which the programme makes the first test, is not applied anywhere in candidates.md.** On 2609.29095 the picture is mixed: better models do not fix in-flight duplicates, but agent vendors and tool owners have every reason to build this themselves.

## Task 2. Scholarship

**Atomix, arXiv:2602.14849.** v1 16 February 2026, v2 29 May 2026 `[A]`. I could not read full text; both versions were queried twice through the summarising tool.

1. **Venue is overstated.** The ICLR page lists it as a **workshop** paper ("Agents in the Wild: Safety, Security, and Beyond"), not the ICLR 2026 main conference `[A]`.
2. **The quoted numbers are from v1 and are absent from v2.** 57.2 / 3.3 / 37.0 / 0.0 / 53.5 / 41.0 / 1,200 / 1,351 / "<0.01%" all appear in v1. The tool found none of them in v2, which reports a redesigned evaluation.
3. **The lead quoted the weak baseline.** v1 Table 1 as returned: WebArena at 30% faults: Tx-Full 57.2% ±6.7, **Checkpoint-Rollback 53.2% ±4.3**, No-Tx 3.3%. OSWorld: Tx-Full 37.0% ±8.8, **Checkpoint-Rollback 37.1% ±5.1**, No-Tx 0.0%. Against the obvious existing method the gain on the two headline benchmarks is nil within error. "57% against 3%" compares against an agent with no recovery at all. Only on τ-bench does v1 show a gap (53.5 ±7.7 against 41.0 ±6.9; overlapping intervals, n=30).
4. **v2 says so itself.** Quote returned from v2: "Checkpoint-Replay is statistically tied on RQ1 (53%, 16/30 vs. Tx-Full's 17/30, Fisher p=1.0; the tie also holds at the full N=114 task pool, p≈0.50, Appendix C.1)". Task success in v2: τ-bench retail, GPT-4.1, 30% faults, 57% (17/30) for Atomix.
5. **Without fault injection there is no result.** v1 Table 8: all modes 100% at zero faults, which the paper presents as showing "differences stem from fault handling". At 5% faults v1 reports Tx-Full 60% WebArena and 71% OSWorld against 0% for No-Tx, but the tool returned no checkpoint-rollback figure at 5%, so the only low-rate comparison is again against no recovery. The paper's task-success claim does not survive at realistic fault rates against a real baseline; the lead's own "strongest argument against" guessed this, but the table above already shows it at 30%.
6. **Irreversible emails.** v1: "Tx-Full leaks zero irreversible effects (0 of 1,200 emails), while No-Tx leaks all 1,200 and CR leaks 1,351 due to retry-induced duplicates" (151 duplicates). The lead's "sent 1,351 duplicates" is wrong: 1,351 is total leaked, 151 are duplicates. v2 restates this as 0/500 for Atomix against 200/500 for checkpoint-replay, 400/500 for saga compensation and 500/500 for no transactions; **two ordinary baselines (TCC-Confirm and Mutex+WAL+Rollback) also leak 0/500**. Holding an irreversible send until commit is what prevents the leak, and standard techniques do it equally.
7. **Overhead.** v1: 7.7 µs per step against 0.8 µs, "<0.01% of wall-clock time" (the lead wrote "of tool latency"; minor). v1 also reports coordination throughput 14,209 tx/s against 1,182,535 tx/s for No-Tx, which the lead did not mention. v2 says only "microsecond-scale wrapper overhead relative to tool latency".
8. **Run counts.** n=30 tasks per benchmark, single runs, bootstrap intervals; no seeds stated. Thin.
9. **Limitations.** The lead's list matches v1 (in-memory deduplication, single process, hand-written adapters, gating only). v2 adds, and the lead omits: "We do not claim semantic validation, distributed deployment, or full crash-safe exactly-once" (crash-safe deduplication tested only by unit tests); wrong adapter metadata is unsafe ("too-narrow scopes commit 66/200 invariant violations and a wrong effect class leaks 17/200 irreversibles"); two or more gated irreversibles can leave a partial commit; calls that bypass adapters are outside the guarantee. "Never sends the same payment or email twice" in candidates.md is therefore stronger than the authors claim.
10. Repository: 7 stars, 0 forks, 1 commit, Apache-2.0, "alpha research implementation". Matches.

**Cordon, arXiv:2606.17573** `[A]` (HTML). Affiliations Tsinghua, Shanghai Jiao Tong, Renmin, AetherHeart Tech: matches "Tsinghua and others". 45 of 45 intercepted before commit; existing-defence adapters stop 14 before commit, miss 26, detect 5 after: matches. **Mismatch:** "24 to 28% less task time and tokens" is wrong: tokens fall 23.6 to 28.4%; task time falls 7.5% (25.55 s to 23.64 s) in reject-on-risk mode. Rollback median 4.17 ms over 15 trials: matches. τ-bench success 87.5% to 90.0%. No code mentioned: matches. The 45 cases are the authors' own risk workflows.

**ACRFence, arXiv:2603.20625** `[A]` (HTML). The lead's summary is accurate but leaves out the decisive limit: "Our evaluation validates the attacks but does not yet include an implementation of ACRFence itself". The fix is a proposal. The maintainer acknowledgement is a LangGraph issue (#6208).

**Consequence.** candidates.md says "Two further 2026 papers from other groups report the same shape of result." One of the two reports no result for its mitigation, and the other's cases are self-built. Weaken to: one further paper reports a similar result on its own cases; one documents the problem.

**Who would pay.** The CSA / Token Security survey (21 April 2026, 418 respondents) is real `[S]`, but search summaries give 65% as "experienced AI agent-related incidents in the past year", not "an agent acted outside its scope". Not opened by either of us; soften.

## Task 3. The deaths

Checked seven; all seven kills hold, with two wording fixes.

| Area | Checked | Result |
|---|---|---|
| Security outside the model | Microsoft devblog "FIDES", dated 20 May 2026 `[S]` | Real. But it "ships in agent-framework-core as an **experimental** feature behind `agent_framework.security`". "Shipped" should say experimental. Kill holds given the other products, which I did not re-check. |
| Replay of screen tasks | Skyvern code-caching docs, Stagehand caching docs `[S]`; PreAct abstract `[A]` | Real. Skyvern replays cached code with no model calls and falls back on failure; Stagehand has a self-healing cache. PreAct: single author, 16 June 2026, 8.5 to 13 times faster. Kill holds. |
| Tool-description quality | Glama score pages `[S]` | Real: Tool Definition Quality Score, six dimensions, run over about 228,000 tools. `mcplint` and the "within two months" timing not verified. Kill holds on Glama alone. |
| Model you paid for | arXiv:2504.04715 abstract `[A]` | The phrase is reported present: software-only methods are "fundamentally unreliable". But the paper then proposes trusted execution environments as a working answer. The filter-2 kill is right for outside-only checking; the write-up should say the paper's own fix needs the provider's hardware and cooperation (a filter 8 problem, like receipts). |
| Receipts | arXiv:2606.04193 abstract `[A]` | Lists "suppression attack, service collusion, and the adoption-incentive problem". Single author. Kill holds. "Which the paper itself calls unsolved" is slightly strong: it lists it as a limitation. |
| Undo neighbour | Rubrik, see Task 1 | Real, but not generally available as of April 2026 by one source, and its scope is disputed. |
| Observability from outside | not re-opened | Not checked. |

**Killed wrongly?** I found no narrower version of any dead area that passes all filters. The closest is tool-call data minimisation (below), which belongs to the security area and dies the same way.

## Task 4. What the lead missed

Twelve areas the lead's table does not list, one or two searches each: speculative tool execution; building-code compliance checking; spreadsheet auditing; web accessibility repair; entity resolution and data cleaning; privacy minimisation of tool-call arguments; tariff-code classification; synthetic survey respondents; generating connectors from API documentation; computer-use help for blind users; data extraction for meta-analysis; incident root-cause analysis.

**None passes.** The three nearest, all `[S]` unless marked:

1. **Minimising private data in tool-call arguments.** ToolMinimize, arXiv:2608.24957, 25 August 2026 `[A]` (abstract): 81 to 88% of tool calls from three production models carry private data the tool does not need; schema-aware rewriting cuts "privacy cost" 81.2 to 92.0% with argument-level task validity kept; the schema-only path needs no model call. Passes 1, 3, 5, 6. Fails 7 and 4 on my reading: gateways and firewalls already redact personal data from tool-call arguments (search summaries name several), and adding schema-aware rewriting to one is a feature. Two authors, 307 calls, no code. Fails test 9 in part: a model maker has reason to fix over-sharing.
2. **Running likely tool calls early to hide latency.** PASTE, arXiv:2603.18897 (task time down 48.5% reported); SPORK, 2607.03333; a client-side variant reporting 6 to 21%. Works in papers. Fails test 9 and filter 4: it is a harness feature the agent vendors own, and it is only safe for calls without side effects, which leads straight back to the transaction layer.
3. **Step-by-step guidance for screen-reader users.** AskEase, CHI 2026, Microsoft Research `[S]`: an NVDA add-on; in a 12-person study task success rose and workload fell. A separate diary study put computer-use agents at 52.5% success for blind users. Passes test 9 (a better model makes it better). Fails 7 and probably 8: the screen-reader vendor already ships an AI assistant (JAWS FS Companion), free NVDA add-ons exist, the authors are at a vendor, and the buyer is unclear.

Others, briefly: building-code checking has funded products (CivCheck, Archistar, UpCodes) (7); tariff classification is shipped by Zonos and Avalara and the best paper reaches 40% at ten digits (7, 2); synthetic respondents have a company valued near $1B and 2026 papers showing systematic bias (7, 2); connector generation is shipped by at least three vendors (7); web accessibility repair introduces new violations in one 2026 study (2); meta-analysis extraction and root-cause analysis both have 2026 papers reporting structural failure (2); entity resolution is a commodity (4, 7); spreadsheet auditing is done by assistants and add-ins (7, 4).

Limit: one or two searches per area, summaries only. This is a sweep, not a survey. Nothing here was run through the redirection's "different layer" starting points in any depth.

## Task 5. Framing

- **"One survives, weakly" is not earned.** Applying the lead's own table: filter 4 fails, filter 7 fails in substance, filter 2 is weaker than stated, test 9 is untested. The bar says "none" is acceptable; that is the answer.
- **"What the paper showed" is overstated.** "57% against 3%" is against no recovery; against checkpoint-and-retry the paper's own tables show a tie on task success. What the paper does show: holding irreversible sends until commit stops leaks that checkpoint-replay and saga compensation let through, and standard two-phase techniques do the same.
- **"The CTO's pattern, tested": weaken "holds" to "is consistent with four hand-picked cases".** Dates I could check: FIDES paper (arXiv 2505, May 2025) to experimental feature 20 May 2026, twelve months: fine. Rubrik announcement August 2025 before Atomix February 2026: true, but an announcement, not a shipped product, and still without general availability in April 2026 by one source. Caching before PreAct (June 2026): plausible, dates of the caching features not verified. "Two months" for tool-description tools: not verified. Four cases chosen by the person testing the pattern is an illustration under the lab's own rules.
- **The last sentence of that section does not stand.** The survivor is not "the kind left over": backup vendors, Cloudflare, gateways and workflow engines are all on it.
- **Limits section is honest** and correctly names "no product found" as the weak point.

## Standing of each claim

| Claim | Standing |
|---|---|
| One candidate survives, weakly | **Does not stand.** None survives; this is the nearest miss |
| Atomix: 57% against 3% with the layer | **Does not stand as evidence for the layer.** Tied with checkpoint-rollback in the same table |
| Atomix: 0 of 1,200 leaked | Stands (v1); "1,351 duplicates" does not (151 duplicates) |
| Atomix is "ICLR 2026" | Weaken: ICLR 2026 workshop |
| "Never sends the same payment or email twice" | Does not stand: authors disclaim crash-safe exactly-once |
| Two further papers report the same shape of result | Weaken: one does, on its own cases; one has no implementation |
| Cordon: 24 to 28% less time and tokens | Does not stand: tokens only; time 7.5% |
| Rubrik restores backups only, cannot reverse email or payment | Weaken: disputed by one secondary source; unresolved |
| Workflow engines do not sort by reversibility | Stands on what I saw |
| "A small open-source package" | Does not stand: at least six, plus Atomix |
| No funded company whose product is this | Stands, weakly; but Veeam and Cohesity were missed |
| Filter 4 "weak" | Does not stand: fails |
| Filter 7 "weakest" | Weaken further: fails in substance |
| Thirteen areas die | Stands for the seven checked, with wording fixes |
| The CTO's pattern holds | Weaken to "is consistent with" |
| 65% saw an agent act outside scope | Weaken: summaries say 65% had agent-related incidents; unopened |

## Corrections

1. Change the answer to "none survive; one near miss", and say which filters it fails (4 and 7; 2 weakened; test 9 unapplied).
2. Apply test 9 from the programme to every candidate; candidates.md uses only the first eight.
3. Atomix venue: ICLR 2026 workshop "Agents in the Wild", not the main conference.
4. State which version each Atomix number is from. The quoted figures are v1 (February 2026); v2 (May 2026) replaced the evaluation.
5. Report the checkpoint-rollback baseline beside every Atomix task-success number: WebArena 57.2 against 53.2; OSWorld 37.0 against 37.1; v2 τ-bench 17/30 against 16/30, "statistically tied".
6. State that at zero faults all modes are equal, and that no low-fault comparison against checkpoint-rollback was found.
7. Fix "sent 1,351 duplicates" to "leaked 1,351, of which 151 were duplicates"; add that in v2 two standard baselines also leak zero.
8. Add v2's limitations: no claim of crash-safe exactly-once; wrong adapter metadata leaks; partial commit with two or more irreversibles; bypass paths. Remove "never sends the same payment or email twice".
9. Add the throughput cost (14,209 against 1,182,535 tx/s in v1) beside the overhead figure, and write "of wall-clock time".
10. Cordon: tokens down 23.6 to 28.4%; task time down 7.5%.
11. ACRFence: say the mitigation is not implemented or evaluated.
12. Replace "two further papers report the same shape of result".
13. Add to nearest products: Veeam Agent Commander (February 2026), Cohesity Agent Resilience, Cloudflare Workflows rollbacks (5 June 2026), TrueFoundry's approval gate, LangChain's approval middleware, Google ADK tool confirmation and rewind, DBOS tool checkpointing, and the open-source set (Revoco, Revert Labs, Pherix, `agent-tx`, SafeAgent, OnceOnly).
14. Rubrik: record that scope (emails, payments, third-party calls) is disputed and that general availability was undisclosed in April 2026; open Rubrik's own documentation before describing it.
15. Add arXiv:2609.29095 to the sources; it is the best evidence on duplicates and points to tool-side idempotency keys as most of the fix.
16. FIDES: "shipped as an experimental feature".
17. Model-substitution row: add that the paper proposes trusted execution environments, so the kill is on provider cooperation as much as on filter 2.
18. CSA survey: quote the question as asked, or mark it unverified.
19. "The CTO's pattern": "holds" to "is consistent with four cases"; delete or rewrite the sentence that the survivor is the kind predicted to be left.
20. Record the search queries used, so the next reviewer can rerun them.

## What I could not do

Read any paper in full; open PyPI or Rubrik's site; verify star counts beyond the three repositories opened; check dates of Skyvern and Stagehand caching, `tdqs` and `mcplint`; open the survey. Every "none found" above is a weak absence from a few searches.
