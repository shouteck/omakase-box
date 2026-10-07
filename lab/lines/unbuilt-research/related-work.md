# Sources: research that works and has no product

Line E, session 1, 7 October 2026. Zero cost: web search and open pages.

**How each source was read.** `[A]` page or abstract fetched this session through the summarising fetch tool; numbers are from that summary. `[S]` search-result summary only: a lead. `[V]` re-opened by the sceptic and corrected; see `sceptic-candidates.md`. Nothing was read in full by the lead. Vendor pages are claims.

## Areas searched and what killed each

About 40 searches across: security enforced outside the model; permissions and capabilities; undo, transactions and recovery; caching and cost; sandboxes and agent operating systems; computer-use replay; observability; audit and receipts; tool descriptions; oversight interfaces; data systems for agents; model-provider auditing; shopping agents and manipulation; plus sweeps of 2026 systems, security, HCI and database venues.

| Area | The research | Nearest product or tool | Dies on |
|---|---|---|---|
| Deterministic security layer (CaMeL line) | CaMeL, Google DeepMind, arXiv:2503.18813 `[S]`; FIDES, Microsoft, arXiv:2505.23643 `[S]`; follow-ups through 2026 | FIDES in Microsoft Agent Framework as an experimental feature, 20 May 2026 `[V]`; Archestra's built-in dual-model agent `[S]`; Invariant Labs bought by Snyk `[S]`; NeuralTrust gateway, $20M seed June 2026 `[S]` | 7, 4 |
| Per-task privilege and revocable capabilities | Progent, arXiv:2504.11703 `[S]` (attack success to 0% on AgentDojo); AgentSpec; MiniScope (Berkeley); PORTICO, arXiv:2606.22504 `[A]` | Vendors' own permission rules and hooks; the gateways above | 7, 4 |
| Compile repeated computer-use runs into replayable programs | PreAct, arXiv:2606.17929 `[S]` (8.5 to 13 times faster, no model calls on replay) | Skyvern code caching, Stagehand caching with self-healing `[S]`; Freu AI | 7 |
| Token and context cost | Plan caching, arXiv:2506.14852 `[S]` (cost down 50%); prompt-cache layout, arXiv:2601.06007 `[S]` (45 to 80%) | Compression proxies (CTO's first look); provider features | 7, 4 |
| Sandbox checkpoint and fork | DeltaBox, SpecBox (2026) `[S]` | Sandbox vendors with snapshots and branching | 7 |
| Observability from outside the agent | AgentSight, arXiv:2508.02736 `[S]` (eBPF, under 3% overhead) | Its own open-source release; Aurva; New Relic eBPF AI monitoring `[S]` | 7 |
| Tool-description quality | arXiv:2602.18914 `[S]` (10,831 servers; compliant descriptions chosen 72% against a 20% baseline); arXiv:2602.14878 | Glama's quality score, `tdqs`, `mcplint` `[S]`, within two months of the papers | 7, 4 |
| Tamper-evident records of agent actions | Notarized Agents, arXiv:2606.04193 `[S]` (the receiving service signs a receipt) | Maatora, agent-receipts, an IETF draft `[S]` | 8: the paper itself lists "the adoption-incentive problem"; services must choose to sign |
| Serving the model you paid for | arXiv:2504.04715, NeurIPS 2025 `[S]` | Fingerprint checkers | 2: the paper finds software-only detection "fundamentally unreliable" |
| Which agent and step caused a failure | CTO's first look | | 2 |
| Dark patterns and manipulation of web agents | DECEPTICON, ICLR 2026 `[S]` (over 70% steered, against 31% of people) | None found | 2: no defence that works is reported |
| Oversight interfaces | arXiv:2602.16844 `[S]`: a new trace design cut time to find errors, accuracy "not meaningfully improved"; approval prompts accepted 93% of the time `[S]` | Vendors' auto-approval modes | 2, 4 |
| Data systems for agents | CIDR 2026 "agent-first" paper `[S]` | A research agenda, and database vendors with branching | 2, 7 |
| Skills and tool-server scanning; evaluation tasks from repositories | CTO's first look | Exists | 7 |

## The near miss: transactions for agent actions

**Corrected after the sceptic (`[V]`).** The draft called this a survivor. It is not; see `candidates.md`.

- **Atomix**, Mohammadi, Potamitis, Klein, Arora, Bindschaedler (MPI-SWS, Aarhus, EPFL), arXiv:2602.14849 `[A]` `[V]`: an ICLR 2026 **workshop** paper ("Agents in the Wild"), version 1 February 2026, version 2 May 2026 with a different evaluation. The numbers here are version 1's. A runtime between the agent and its tools. Each tool gets an adapter that states what resource it touches, an idempotency key and, where one exists, how to compensate. Effects are sorted into three kinds: can be held back until commit; happen at once but can be compensated; cannot be undone and are gated. With 30% of calls made to fail: task success 57.2% on WebArena against 3.3% with no transactions, 37.0% against 0.0% on OSWorld; on a third benchmark 53.5% against 41% for checkpoint and rollback. `[V]` Against checkpoint and rollback on the first two: 57.2 against 53.2, and 37.0 against 37.1; version 2 calls its comparison "statistically tied"; with no faults all modes are equal. 0 of 1,200 irreversible emails leaked, where checkpoint and rollback leaked 1,351, of which 151 were duplicates; in version 2 two standard baselines also leak none. Bookkeeping overhead "<0.01% of tool latency". Limits the paper states: single machine; exactly-once state held in memory; every tool needs a hand-written adapter; irreversible actions can only be gated. Code: `github.com/mpi-dsg/atomix`, Apache 2.0, "currently an alpha research implementation", 7 stars, one commit `[A]`.
- **ACRFence**, arXiv:2603.20625 `[A]` (abstract). After a restore an agent re-writes a slightly different request, so the server sees a new one: duplicate payments, reuse of spent credentials. Says framework maintainers have acknowledged it. No numbers in the abstract. `[V]` Its fix is proposed, not implemented.
- **Cordon**, Tsinghua and others, arXiv:2606.17573 `[A]`. Task-level transactions that stage irreversible effects before commit: 45 of 45 policy-violating cases stopped before commit against 14 of 45 for existing defences; `[V]` tokens down 23.6 to 28.4%, task time down 7.5%; median rollback 4 ms. No code mentioned.
- Also 2026, titles only `[S]`: DART (arXiv:2605.23311), "Safe to Resume?" (2608.29381), "When can agents safely checkpoint, fork, restore and merge?" (2608.22928), "Resume means resume" (2608.03836).

**Nearest products.**

- Rubrik Agent Rewind, announced August 2025 `[A]` (Computerworld). Ties a view of what an agent did to Rubrik's backups and restores files, databases, configurations and repositories from snapshots. Works with Agentforce, Copilot Studio, Bedrock Agents and custom agents. Covers data Rubrik protects; the article does not say it can reverse an email or a payment. General availability was "in the next few months" at announcement; current status not checked.
- Durable-execution engines (Temporal, Restate, DBOS, Inngest) `[S]`, all now marketed for agents: a step that completed is not run again after a crash. The developer writes the workflow and any compensation by hand; nothing sorts an agent's tool calls by reversibility or holds them back.
- `agent-tx` on PyPI `[S]`: saga-style rollback for tool calls. Size and use unknown.
- Coding agents' own file checkpoints `[S]`: local files only.
- **Found by the sceptic, missed by the lead** `[V]` (all through summaries; see `sceptic-candidates.md` for each): Veeam Agent Commander, February 2026 (rollback, and hard-to-reverse actions pause for approval); Cohesity Agent Resilience (announced); Cloudflare Workflows saga rollbacks, 5 June 2026; approval holds and step checkpoints in a gateway (TrueFoundry), LangChain middleware, Google's agent kit and DBOS; six small open-source projects of the same design with almost no adoption (Revoco, Revert Labs, Pherix, `agent-tx`, SafeAgent, OnceOnly). arXiv:2609.29095: a tool-side idempotency key cuts duplicates from 28% to 4%. One secondary source says Rubrik's product does cover emails, payments and third-party calls and had no stated general availability in April 2026; unresolved.

**Who would pay.** Cloud Security Alliance and Token Security, April 2026 `[S]`: 65% of organisations reported an agent-related incident in the past year (`[V]`: the search summaries disagree on whether this is "incident" or "acted outside scope"), 41% of incidents were unintended actions in business processes, 29% reported measurable impact. Public incidents in 2026 of agents deleting production databases `[S]`. A vendor survey and press reports; not opened.
