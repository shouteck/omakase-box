# Sceptic's attack on the Line B survey

7 October 2026. Target: [survey.md](survey.md) and [related-work.md](related-work.md) as they stood at the start of this session. Nothing in those files was edited.

**How things were read here.** Three grades, used throughout:

- `[F]` full text read: the arXiv PDF was downloaded by the fetch tool and converted locally with `pdftotext`; passages were located by search and read directly. No summariser in between.
- `[A]` page fetched through the summarising fetch tool (a small model answers a question about the page). Quotes marked verbatim were asked for verbatim, but still passed through that model.
- `[S]` search-result summary only. A lead.

Nothing was measured, so there was no measurement to rerun. The one piece of arithmetic in the survey was redone (item 1.1). No heavy job was run. Cost: zero.

## 1. What was re-opened, source by source

### 1.1 Zhou et al., Bountysource bounties, arXiv:1904.02724 `[F]`

**Mismatch, several.**

- Counts match: 5,445 bounties, $406,425, 3,509 issue reports, 1,203 projects, issues reported 19 October 2012 to 5 October 2017.
- The status shares in related-work are wrong and attached to the wrong unit. The paper (Fig. 5 and text) gives shares of **bounty issue reports**, not of bounties: successful 1,508 (43.0%), ignored, i.e. closed and unpaid, 692 (19.7%), failed, i.e. open and unpaid, 1,308 (37.3%). They sum to 100.0%. Related-work says "about 44% of bounties were paid" and that the shares "add to 100.9%". The inconsistency was the summariser's, not the paper's.
- By money, more than half was paid: $218,624 of $406,425 (53.8%). The survey's "under half of bounties paid" is true per issue report and false per dollar; it should say which.
- The 180-day figure matches: likelihood falls "from 53.2% to 30.1%". The paper's explanation is hedged: "might be due to such issue reports having become obsolete or being hard to address". The survey's table states "old, hard issues attract money but not fixes" as what stopped it.
- The lab's arithmetic ($75 mean, about $80,000 a year) is right as division, but mislabelled twice in the survey. It is the **mean over five years**, not "at its studied peak", and it covers **only bounties on GitHub issues**, which the paper says are 77.3% of Bountysource issue reports, not "all of Bountysource".
- Omitted and relevant: 479 of the 692 "ignored" reports were in fact addressed, and nobody claimed the money; the authors write "it seems that money was not the driver". So 21.8% of addressed bounty issues were solved without payment. The "paid" rate understates the "solved" rate.
- What the paper does not contain: anything about owner review cost, specification cost, or why the platform stayed small. It studies which bounties succeed. The survey's row places it under "what its students say stopped it"; it supports nothing about owner-side cost.

### 1.2 Stol and Fitzgerald, ICSE 2014 `[A]` (abstract as reproduced on B. Fitzgerald's own page, brian-fitzgerald.com/?p=1601; the lero.ie record returned navigation only)

**Matches.** The quoted phrases are all present ("less complex and stand-alone without interdependencies"; "development cost was much greater than originally expected"; "overhead in terms of company effort to prepare specifications and answer crowdsourcing community queries was much greater"; contest, review and quality time "was significant"; quality issues "pushed later in the lifecycle"). Still one company, one platform, abstract only. The body of the paper was not read by the survey or by this review. That matters: see 2.2, the paper's body is where any discussion of what the company was willing to expose would be.

### 1.3 Aghayi, *Large-scale microtask programming*, arXiv:2005.14306 `[F]`

**Mismatch, three, one of them against the survey's central claim.**

- It is a two-page doctoral-symposium summary by one PhD student. The numbers match (9 developers, 350 microtasks, first microtask in under half an hour, 27 of 34 behaviours). "Decontextualizing programming work is hard" is verbatim. The requirement that the client specify the API first is present.
- **Contradiction with related-work's own `[S]` line.** Related-work says a controlled experiment found each developer "1.3 times less productive", and the survey table states "each person slower" as fact. This source, by the same author, says of the same controlled experiment (28 developers) that microtasking had advantages "in reducing onboarding time and time-to-market and, surprisingly, in increasing the quality of code and individual developer productivity". The survey took the unfavourable number from a search summary and did not notice the fetched source says the opposite. Unresolved until the experiment paper is read.
- **"Never left research" is too strong.** The source reports an industry study with NTT: "successful in implementing and testing a project with 8000 lines of code in 14 functions", with the caveat that developers "took time to understand the new concepts" and that dedicated people managing the microtask project were valuable. Still a study, but inside a company on a real project.
- **A source the survey cites names disclosure.** Future work: "some projects have security considerations, like private APIs that they do not want to expose to the public." The survey's short-version point 2 says "not one source read names unwillingness to share source". This one does, in passing.

### 1.4 Afroz et al., "AI slop is DDoSing open source", arXiv:2607.04003 `[F]`

**Matches**, with one tightening. 294 repositories, over 2 million pull requests and issues, survey N = 229, one-time contributors' PR merge ratio "18.18% lower than expected" (Bayesian structural time series, relative to a modelled counterfactual, d = 2.84), "low-effort defensive strategies" verbatim. Add: aggregate weekly PR volume was only 6.80% above the counterfactual and issue volume ran 8.12% **below** it. "Flood" describes practitioner accounts; the measured volume effect is modest and the merge-ratio effect is the strong one. The paper also supports the related-work `[S]` line on curl: valid submissions "about 5% by July 2025".

### 1.5 Pinna et al., arXiv:2602.08915 `[A]` (abstract)

**Matches** on 7,156 pull requests, five agents, 82.1% documentation, 66.1% new features. Not checked beyond the abstract. The survey's use ("accepted at high rates in the public repositories that use them") is fair but is about public repositories that opted in; it is whole-repository delegation succeeding, which is evidence for the incumbent, not for a Box.

### 1.6 Huang et al., "Professional software developers don't vibe, they control", arXiv:2512.14012 `[F]`

**Mismatch, minor, plus an omitted limit.**

- 13 observed, 99 surveyed: matches. "retain their agency in software design and implementation": verbatim.
- "collaboration rather than complete delegation" is set in quotation marks in related-work and is **not in the paper**. The paper's Takeaway 4 reads: developers "enjoy working with agents as source of collaboration--with the human in the loop-- rather than delegating work to the agents completely". Paraphrase presented as quotation.
- The survey's sentence "delegate what is well scoped and cheap to verify" is the lab's gloss. The paper says agents are suitable for "straightforward, repetitive, and scaffolding tasks if prompted with well-defined plans". "Cheap to verify" is not the paper's criterion.
- Omitted: the authors state "the survey involved a deliberate selection bias towards people positive towards AI". Also omitted and relevant to a Box: respondents rated agents unsuitable for "integrating with existing code; legacy code" (3 for, 17 against).

### 1.7 Cognition, "Multi-agents: what's actually working", 22 April 2026 `[A]` (cognition.com; two fetches, the second asking for verbatim sentences by keyword)

**Mismatch, two.**

- The single-threaded-writes sentence is verbatim. "An average of 2 bugs per PR" matches (the post adds "roughly 58% are severe").
- **"Manager and child delegation is still called experimental": the word "experimental" does not occur in the post** (keyword fetch). The post describes manager and child Devins as shipped, and gives failure lessons: "Managers trained on small-scoped delegation default to being overly prescriptive, which backfires when the manager lacks deep codebase context" and "Agents assume they share state with their children when they don't".
- **"Sees only the diff" is wrong in the way that matters here.** The post: the review agent "gets to skip this extraneous context, only look at the diff, and re-discover any context it needs as it reads the code from scratch". It starts from the diff and has the code. That is a limit on attention with full access, the incumbent pattern, not an instance of working from a restricted slice.
- Also in the post and not in related-work: for sharing with a second model "a reasonable 80/20 solution is to just share a fork of the full context of the primary model". Cognition's working answer to "what context does the helper get" is: all of it.

### 1.8 Anthropic, "How we built our multi-agent research system", 13 June 2025 `[A]`

**Matches.** Date, the four-part hand-off sentence, "about 15× more tokens than chats", and the coding sentence, whose second half related-work dropped: "and LLM agents are not yet great at coordinating and delegating to other agents in real time". Also present: "domains that require all agents to share the same context or involve many dependencies between agents are not a good fit for multi-agent systems today". Both omitted sentences cut against an agent-callable entry point (section 3).

### 1.9 Claude Code sub-agents documentation `[A]`, read 7 October 2026

**Matches, with an omission.** Fresh isolated context, starts in the main conversation's working directory, worktree isolation, tool allow and deny lists, returns the final summary: all present. Omitted: the same page points to session-wide `permissions.deny` rules of the form `Read(path)` and to `PreToolUse` hooks that can block individual operations. So "tools limit an agent by tool and by attention, not by which source it can read" is too strong for this tool: there is a path-level read deny list and a programmable gate. They are session-wide, deny-style and not per sub-agent, and whether shell commands can route around them was not checked. The capability gap is narrower than stated.

### 1.10 GitHub Copilot content exclusion: documentation `[A]` and changelog of 2 September 2026 `[A]`

**Mismatch: the "disagreement" is stale.**

- Changelog, opened: "The GitHub Copilot app and Copilot CLI now respect content exclusion policies configured by enterprise, organization, and repository administrators." Related-work had this as `[S]`.
- Documentation, as fetched today: "Content exclusion is currently not supported in Edit and Agent modes of Copilot Chat in Visual Studio Code and other editors." The sentence related-work quotes ("GitHub Copilot CLI and Agent mode in Copilot Chat in IDEs do not support content exclusion") was not returned; the CLI is no longer listed as unsupported in what was returned.
- Reading: the two do not disagree. CLI and app honour exclusions since September 2026; IDE agent modes do not. The survey's "the only path-level controls are deny lists that the vendor's own documentation says agent modes do not all honour" needs that precision, and the trend it reveals is against the survey: vendors are closing this gap inside the incumbent tools.

### 1.11 JetBrains Research, August 2026 `[A]` ("How much code do developers really let agents write?")

**Matches.** Over 15,000 professional developers, May to July 2026; agentic coders about 31%, 84% of their code agent-generated. The headline shares (47%, 38%, 27%) do exceed 100%; the page attributes this to bucketing. A second post from the same survey `[A]`: 90% use coding agents at least weekly, 68% daily; one tool is the most used for 31% of developers. Use is concentrated in a few first-party vendors; nothing in either post is about third-party agents.

### 1.12 Checkmarx via The Decoder, 27 July 2024 `[A]`

**Matches.** 15% prohibit, 99% of teams use, respondents CISOs, no sample size on the page. The "second figure of 8%" has no source named in related-work at all and cannot be checked.

### 1.13 Dibbern, Winkler, Heinzl, MIS Quarterly 2008 `[S]` (abstract as returned by search; not fetched)

**Mismatch, two.**

- The design is "six offshored software projects in a large German financial service institution": **one client organisation**, not "German banks and insurers".
- "Savings were rarely realised" (related-work) and "the studied projects rarely saved money" (survey) are not in the abstract. The abstract asks why there is "such a high level of variation in the economic success" and names four extra-cost activities. Variation is not "rarely". The four cost types and the client-specific-knowledge finding match.

### 1.14 Bountysource history, Wikipedia `[A]`

**Matches**, with corrections. CanYa 2017 and The Blockchain Group 2020; "as of June 2023 ... appears to have stopped paying"; bankruptcy filing announced November 2023. The 2020 terms change is not on the Wikipedia page as fetched; a developer's post of 18 June 2020 `[A]` (simon.shimmerproject.org) confirms it and adds that it "has been withdrawn since", which related-work omits. Neither source gives a cause for the platform's failure. The survey's "platform trust" as something that "stopped" bounties is the lab's inference from a company that changed hands twice and went bankrupt; it says nothing about demand.

### 1.15 Tan, Zhou, Sun, ESEC/FSE 2020 `[S]` (abstract via search)

**Matches** on 9,368 issues, 816 projects, longer to resolve, "almost half of GFIs are not solved by newcomers". Not fetched by this review.

### `[S]` claims the survey leans on as if established

1. "Security bug bounties did take hold ... the exception that explains the rule: the proof travels with the submission and no source is shared." The $81 million figure is `[S]`. The explanation is the lab's and no source is cited for it. "No source is shared" is false for the survey's own examples: curl and the Internet Bug Bounty concern open-source code. Other explanations (a finding is worth far more than a $75 feature; no specification is needed because any exploit counts; the work is adversarial and cannot be done in-house by definition) were not considered. This row carries the survey's key sentence, "the one form that scaled is the one where the submission carries its own proof", and that sentence is inference on a search summary.
2. "Each person slower" (microtask): `[S]`, contradicted by an `[F]` source (1.3).
3. "Offshoring ... rarely saved money": `[S]`, and not what the abstract says (1.13).
4. Tricorder and "about 10% false alarms"; tools ignored outside the workflow: `[S]`. This is the entire evidential base for Question 7's "what made tools normal".
5. "Whole-repository access is the norm for contractors": `[S]`, forum threads.
6. "Path-level access control ... is absent from Git hosting": `[S]`, and incomplete (2.1).
7. "Third-party agents ... looks real and growing (protocols, marketplaces, published flaws in third-party agent add-ons)": every element is `[S]`.
8. Cloud agents load "the whole repository": `[S]`; the Codex page was never read.
9. MAST 44.2%, Dependabot 60 to 76%, bot pull requests 37% against 73%, the label decline 61.9% to 42.2%: all `[S]`.
10. Parnas and Conway "read together: a piece of work can be handed out cheaply only where the code was already cut so that it can be": `[S]` sources, lab synthesis. If true it is an argument against the product (Line A's region would follow existing module boundaries or be large), and the survey does not draw that consequence.

## 2. What the survey missed

### 2.1 Prior art for "send out only part of a repository and take changes back"

The survey says nobody offers a hand-off where the solver gets only the source the task needs, and that path-level restriction is absent from Git. Found in under ten queries:

- **Josh** (github.com/josh-project/josh) `[A]` README, `[S]` for the details: "fast, reversible Git history transformation"; sub-folders of a monorepo served as independent repositories; search summary of the project documentation: the partial repository "supports both fetch as well as push", and this "makes it easy to mirror just selected parts of your repo to public github repositories or specific customers". A filtered, pushable view of part of a repository for an outside party exists as open source. It is cut by directory, not by task, and carries no check.
- **Copybara** (Google, open source) `[S]`: moves and transforms code between a confidential authoritative repository and another repository, and imports outside changes back. Same shape: subset out, patch in, verified in the real repository. Static configuration, not per task.
- **Zhou and Liu, "Toward proactive knowledge protection in community-based software development", ICSE 2010 workshop track, IBM Research** `[A]` (publication page): clients identify confidential knowledge, risky design elements are scored, and tasks are restructured by "task reservation, task pretending and task partition" so work can go to community developers "without worrying about the confidential knowledge exposure". This is the Box's disclosure idea, sixteen years old, from an industrial lab. That it did not become a product is a data point the survey needed.
- **Agent sandboxes that mount a chosen subset.** Docker's sandbox documentation `[A]`: default is the whole workspace directory; alternatives are a clone mode and a "mountless sandbox" that "doesn't share a host workspace". Eclipse Enclave `[S]`: "mounts only the paths you specify". A practitioner guide `[S]` recommends file allow-lists "when the task is narrow". The mechanism for giving an agent only some files exists and is free; what is absent is anything that decides which files.
- Not searched and should be: build-system dependency closures (the transitive sources of one test target are computable in Bazel-style builds and are what sparse-checkout tooling in large monorepos uses), and benchmark constructors that turn live repositories into task environments automatically. Both are the nearest technical neighbours of "derive the subset from the check". Known to this reviewer only from memory; no source opened; treat as leads.

**Standing of "nothing found".** Narrowed, it survives: nothing opened derives the subset per task from a failing example and ships it with that example as the check. As written ("what nobody offers today: a hand-off where the solver gets only the source the task needs") it does not: partial, returnable views for outsiders exist; mounting a subset for an agent exists. The novel part is the rule that chooses the subset, which is Line A, and nothing else.

### 2.2 Evidence that disclosure was a barrier

The survey: "The lab found no study or post-mortem that says so."

- Zhou and Liu 2010 `[A]`, above: companies hesitate to use community developers because of "the concern about confidential knowledge exposure". One source, stating exactly what the survey says no source states.
- Aghayi 2020 `[F]`, a source the survey itself used: projects with "private APIs that they do not want to expose to the public".
- Computerworld, "At risk offshore", 20 November 2003 `[A]`: stolen intellectual property "is a genie that can't be put back in the bottle"; the 2002 theft of SolidWorks source at an Indian contractor. The same article reports the company **kept** offshoring and tightened controls, which cuts the other way: disclosure was a named risk that firms managed, not one that stopped them.
- A search summary `[S]` reports a study in which crowdsourcing platforms' intellectual-property terms and "the confidentiality of the crowdsourcing tasks" are listed among the issues of crowdsourced software engineering. Not opened.
- Not verified, flagged as a lead only: the research framework in Stol and Fitzgerald's own paper is recalled by this reviewer as listing knowledge and intellectual property among its concerns. The body was not opened by anyone. It must be read before the survey says what that case study does and does not name.

**The structural flaw.** The survey's evidence cannot detect a disclosure barrier even if one exists. Every study it read is of an organisation that had already decided to hand work out (a firm on TopCoder, a bank that offshored, projects that posted bounties, open-source projects whose code is public). Owners deterred by disclosure never enter those samples. "Open-source bounties, where sharing is free, stayed just as small" compares a population with free disclosure and almost no money against no one. "Not named in the sources read" is the only claim earned, and after the three sources above even that is false as worded.

### 2.3 Agents on reduced or curated context

The survey: "the literature so far finds no gain from handing agents chosen context"; and "a solver on a Box succeeds about as often as on the whole repository: unmeasured anywhere."

- SWE-bench, arXiv:2310.06770 `[F]`: under "oracle" retrieval (the files the reference patch edits) Claude 2 resolves 4.80% against 1.96% with BM25 retrieval; BM25 at the 27,000-token limit "retrieves none of the files from the 'oracle' context" in almost half of instances. Old, non-agentic, weak models; but it is a measured gain from being handed the right files.
- Sam-Bodden, "What context does a coding agent actually need to act?", arXiv:2607.09691, June 2026 `[A]` (abstract; single author; localisation by oracle): "Compressed context ... matches whole files at a third of the tokens: a resolved issue costs 19K context tokens, not 94K"; rendering the rest of a file as skeletons "resolves no more issues than deleting that remainder outright (N=70, exact McNemar p=0.75)". Directly on the question; small N; unreviewed.
- Qin and Xie, Agent Retrieval Bench, arXiv:2607.24882, July 2026 `[A]` (abstract): a pilot finds retrieval-derived starting context gives "higher file F1 with less post-seed exploration than random non-gold context, while oracle gold context shows substantial remaining headroom".
- ContextBench, arXiv:2602.05892 `[A]` (abstract): 1,136 tasks, 66 repositories, human-annotated gold context; scaffolding "yields only marginal gains in context retrieval"; models favour recall over precision.
- Cognition 2026 `[A]`: "clean context leads to a notable improvement in capabilities when using a generator-verifier loop".
- The result the survey relies on (context files did not raise success; Gloaguen et al., arXiv:2602.11988, `[S]` here) is about instruction files such as AGENTS.md, not about which source files an agent is given. It does not support "no gain from chosen context".

**Reading.** The public record is not "no gain" and not "unmeasured anywhere". It is: handing the right code helps or costs nothing in three studies, all with the localisation given by an oracle; none tests a subset chosen by a rule that can miss, and none removes the agent's ability to look elsewhere. The survey's sentence against direction 2 is contradicted; its "unmeasured" for direction 1 stands only for the hard-boundary case.

### 2.4 Post-mortems by people who ran platforms

None found from an operator. One 2020 user post on Bountysource's fee and terms changes `[A]` (1.14). One newsletter of 25 March 2026 `[A]` ("The AI bounty graveyard") claiming bounty issues now draw 10 to 25 machine-written pull requests within hours and that a project mass-closed its bounty pull requests; it names platforms but no project and cites nothing. Unusable except as a lead. The survey's "unknown" stands. The brief asked for post-mortems; after two sessions there are none, and the survey's causal story for bounties is therefore built from one success-factor study that does not address causes.

## 3. The strongest opposite case

### 3.1 The central chain does not follow

The survey argues: (a) owner-side cost, not disclosure, stopped bounded delegation; (b) agents remove the solver-side obstacles; (c) so what is left is the owner's side, "the half a Box is aimed at".

- (a) rests on two case studies of one organisation each, one read as an abstract and one as a search summary, plus a bounty study that does not address causes. "The studies name" should be "two case studies name".
- (b) is asserted with no source. It is also beside the point: if (a) is right, solver-side obstacles were not binding, so removing them explains nothing.
- (c) contradicts the survey's own table. Question 2 says a Box does **not** remove the cost of writing down what is wanted or the cost of review, and calls those "the heaviest". The half that is left is the half a Box does not address. The survey's last line of "What changes with agents" says the opposite of its Question 2.

### 3.2 The natural experiment the survey reports and does not use

Delegation of bounded work did take hold, between 2024 and 2026, at very large scale (90% weekly use `[A]`, a third of developers generating most code through agents `[A]`, 66 to 82% acceptance in public repositories `[A]`). It took hold in the form: whole repository in, no written specification beyond an issue, trusted first-party vendor, pull request out. On the survey's own account of history this is exactly what should work: context transfer made free by handing over everything, specification cost made near zero by letting the solver read the code.

A Box reverses the two things that made it work. It withholds context, which adds a failure mode (the missing file) that the incumbent does not have. And it requires a check up front, which is the cost history says kills delegation (R1: about 470 lines of checks for an 8-line change). It buys reduced disclosure, which the survey says was not the binding friction. On the survey's own evidence, direction 1 spends on the frictions that matter to relieve one that does not.

### 3.3 Direction 1's customer is assumed

"A solver you would not give the repository to" is the whole of direction 1. The survey's support: "looks real and growing (protocols, marketplaces, published flaws in third-party agent add-ons). Size unknown." Every item is a search summary. Counting organisations that back a protocol says nothing about anyone sending private source to a third-party coding agent. What was actually opened points the other way: use is concentrated in a few first-party vendors (JetBrains `[A]`); the vendors are adding path exclusions to their own agents (GitHub changelog `[A]`); the cautious minority has self-hosted options (the survey's own point). The survey grants in Question 5 that this is "unknown" and then recommends the direction that needs it. The convenient assumption is that an owner who distrusts a solver will respond by sending it less, when the observed response to distrusted solvers is to not use them.

### 3.4 Why direction 2 is better supported than the survey allows

The survey dismisses direction 2 on three grounds. Each is weaker than stated.

- "The literature so far finds no gain from handing agents chosen context": contradicted (2.3). There is positive, if thin and oracle-dependent, evidence that the right slice matches whole files at a third of the tokens.
- "Built-in sub-agents are free and take no steps": true, and equally fatal to direction 1's recommended entry point, which is the same tool call.
- "Without a trust boundary the slice has no second purpose": the purposes inside one boundary are cost (15 times chat tokens for multi-agent runs `[A]`), accuracy under context rot (Cognition `[A]`), and a check that is fixed before the work starts. Those are the things every engineering account read says are short. Disclosure is not on any of those lists.

Direction 2 also has what direction 1 lacks: an observable user. Orchestrators passing briefs to sub-agents exist today in the tools opened here; the experiment "same sub-agent, slice against whole repository, same check" is runnable at zero cost and is already on the programme ("Does a Box help?"). Direction 1 cannot be tested without customers, who are ruled out.

Against direction 2, honestly: Cognition's shipped answer is to share full context; managers that over-prescribe "backfire"; ContextBench finds scaffolding gives only marginal retrieval gains; and anything that helps inside one tool will be absorbed by that tool's vendor. Direction 2 is not well supported. It is better supported than direction 1, and it is the one whose key assumption can be measured.

### 3.5 The case for "stop: a Box adds nothing"

Stated at full strength. (i) The disclosure benefit has no evidenced buyer (3.3) and, where wanted, has older and simpler substitutes: a filtered pushable repository view (Josh), a mount of chosen paths, a deny list, a locked workspace. (ii) The travelling check is, by the survey's words, "not unique in kind; unique only if cheap", and its cheapness is unproven and so far disproven (R1). (iii) The idea of partitioning tasks to protect confidential knowledge was published by IBM Research in 2010 and nothing came of it. (iv) The incumbent is one click and already works. What remains is a rule for choosing files, which is a feature of an agent harness, not a product. Nothing in the survey refutes this. The survey's own refutation conditions (Line A's region is most of the repository; a solver on a Box does clearly worse; the example costs anything like R1's) are all unmeasured, so the recommendation is conditional on three unknowns plus an unknown customer. A conditional this deep is "undecided", and the survey should say so in the recommendation rather than only under "what would refute it".

### 3.6 Inferences from human history to agents that are unsupported

1. That the human history has one cause. Six unlike things (contests, issue bounties, microtasks, onboarding labels, offshoring, security bounties) are given one explanation. Only two rows have a source that speaks to cause.
2. That solver-side obstacles "go away" with agents. Token cost is pay per task; many agents submitting to one bounty is competition; "satisfies the check and not the intent" is the motivation problem in another form. The survey lists these as "new", which hides that they are the old ones.
3. That review "gets worse" for a Box owner. The evidence (curl, AI slop) is about open submission by strangers. A Box goes to one chosen solver. The open-source flood does not transfer.
4. That microtask onboarding "in minutes" transfers to a slice of an existing repository. Those tasks were designed from scratch against a client-written API; nothing was cut from a live codebase.
5. That security bounties scaled because the proof travels (1, `[S]` list).
6. That least privilege being "recommended practice" predicts adoption. The same sources show vendors implementing it inside their own agents, which predicts absorption.

### 3.7 Framing

- The survey says "shows" is not used. Stronger-than-"suggests" claims are made by other words: "what the studies name as the cause" (short version 1); "history says the heaviest are the fifth and sixth"; "this is the cost history says kills delegation"; "the exception that explains the rule"; "the solver-side obstacles go away"; "so a Box is distinct"; "the capability is missing". Each needs "suggests", a count of sources, or deletion.
- "So a Box is distinct" (short version 6) follows from a search the survey calls "a handful of queries". Section 2.1 found four neighbours quickly.
- The Limits section says "a third of the numbers are leads". By the tags in related-work, most numbers outside sections 1 and 3 are `[S]`, and the whole of "Who does something adjacent" opens with "`[S]` unless marked". The limit is understated.
- Convenient omissions: the Anthropic sentence that agents "are not yet great at coordinating and delegating to other agents"; Cognition's "share a fork of the full context"; the selection bias in Huang et al.; the withdrawn Bountysource terms change; the 21.8% of solved bounty issues nobody claimed. Each would have weakened a line of the argument.

## 4. Question 7: the ranked entry points and hand-over forms

The survey labels the ranking "the lab's inference from the table, not a measurement". That is accurate, and it goes further than the survey admits: the ranking contradicts the only evidence cited.

- The evidence on "what made tools normal" is two `[S]` sources about static analysers at Google: success came from living "inside something already open (code review, the tracker)". By that evidence the first entry points should be the issue tracker and the review comment. The survey ranks the issue second, omits the review comment, and ranks first a tool an agent calls, for which that evidence says nothing.
- "It serves the delegator that is growing fastest" has no source. No number anywhere in related-work measures agents acting as delegators, let alone their growth.
- What was opened says agents delegate badly: Anthropic `[A]` ("not yet great at coordinating and delegating"), Cognition `[A]` (over-prescriptive managers backfire; children assumed to share state). No source shows an agent choosing to package work for another agent when it could do the work itself or spawn a built-in sub-agent at no cost.
- **The first-ranked entry point is in tension with the recommended direction.** Direction 1's solver is one "you would not give the repository to". An agent inside the owner's boundary that, with no person present, packages source and sends it to a less-trusted party is the exfiltration pattern the survey's own security section warns of. It needs a person's confirmation, which removes "none (no person)" from the steps column. The pairing "direction 1, entered the way direction 2 would be" was not examined for this.
- The table's "steps for the owner" column counts today's incumbents at one or none. It does not give the count for a Box from each place, which is the number the ranking needs.
- Hand-over forms: "A folder. Already built" ranks by sunk cost. "A call to an agent that takes the folder" has no evidence. "Later: a link, a queue" is unargued. The owner asked what the easiest hand-over looks like for each kind of solver; the survey does not answer per solver.
- The requirement set for Line A ("from a pointer alone, with at most one confirmation") is a product wish stated as a finding. Nothing read supports the number one.

**Standing of Question 7:** the list of places work shows up is a fair description on `[S]` sources. The ranking is pure inference, partly against its own cited evidence, and should be presented to the kitchen as unranked candidates.

## 5. Corrections the survey and related-work must make

1. Bountysource shares: replace with 43.0% successful, 19.7% closed and unpaid, 37.3% open and unpaid, **of 3,509 bounty issue reports**; delete "add to 100.9%". State that 53.8% of the money was paid.
2. "$80,000 a year across all of Bountysource at its studied peak": change to a five-year mean for bounties on GitHub issues only (77.3% of the platform's issue reports).
3. Add from the same paper: 479 addressed issues went unclaimed (21.8% of addressed); and state that the paper does not study why bounties stayed small or any owner-side cost. Remove it from the "what stopped it" column or mark that column "lab's reading".
4. "Old, hard issues attract money but not fixes": mark as the authors' conjecture ("might be due to").
5. Microtask: remove "each person slower" from the survey table, or mark it as an unresolved conflict between an `[S]` summary and the `[F]` source that says individual productivity increased. Record that arXiv:2005.14306 is a two-page doctoral-symposium summary.
6. Microtask: replace "never left research" with the NTT industry study (8,000 lines, 14 functions) and its caveats.
7. Short version point 2 and Question 1 "what it does not support": withdraw "not one source read names unwillingness to share source" and "the lab found no study ... that says so". Cite Zhou and Liu (ICSE 2010), the Aghayi sentence, and the 2003 SolidWorks account. Replace with: disclosure is named as a concern; no source read measures whether it stopped anyone; the samples read could not show it.
8. Delete "open-source bounties, where sharing is free, stayed just as small" as evidence about disclosure, or state the confound.
9. Security bounties row: remove "no source is shared" (false for curl and the Internet Bug Bounty); mark "the exception that explains the rule" as the lab's conjecture on an `[S]` figure; list the rival explanations.
10. Dibbern: one German financial institution, six projects; remove "rarely" (twice); mark abstract-only.
11. Huang et al.: remove the quotation marks from "collaboration rather than complete delegation" or quote Takeaway 4; mark "cheap to verify" as the lab's gloss; add the stated selection bias.
12. Cognition: delete "still called experimental"; correct "sees only the diff" to "starts from the diff and re-reads the code it needs"; add the "share a fork of the full context" sentence and the over-prescriptive-manager lesson.
13. Anthropic: restore the dropped half-sentence on agents delegating poorly.
14. Copilot: the changelog is now `[A]`; CLI and app honour content exclusion since 2 September 2026; IDE Edit and Agent modes do not. Remove "the two disagree". Reword Question 3 accordingly.
15. Claude Code: add session-wide `Read(path)` deny rules and `PreToolUse` hooks; change "not by which source it can read" to say that deny-style, session-wide path controls exist and per-task allow-lists do not.
16. Bountysource: note the 2020 terms change was withdrawn; mark "platform trust" as inference; no cause of failure is given by any source.
17. "Nothing found" and short version point 5: add Josh, Copybara, Zhou and Liu 2010, and subset-mounting sandboxes as neighbours, and narrow the novelty claim to "choosing the subset per task from the check". Add build-dependency closures and automatic benchmark-environment construction to "not read".
18. Direction 2 evidence and the Line 2 carry-over: withdraw "the literature so far finds no gain from handing agents chosen context". Cite SWE-bench oracle retrieval, arXiv:2607.09691, arXiv:2607.24882 and ContextBench with their limits. Separate instruction files from source selection.
19. Question 5 item 2: change "unmeasured anywhere" to "measured only with oracle localisation and without a hard boundary".
20. Reconcile Question 2 ("a Box cannot remove the heaviest frictions") with "What changes with agents" ("what is left is ... the half a Box is aimed at"). One of them must change.
21. State the natural experiment plainly: whole-repository agent delegation is the form in which bounded delegation did take hold, and say what a Box gives up relative to it.
22. "Solvers that are not the trusted vendor: looks real and growing": change to "unknown; no source opened shows private code being sent to third-party coding agents"; remove "growing".
23. Recommendation: either present it as undecided between directions 1 and 2 pending the "Does a Box help?" measurement, or state that direction 1 is chosen on the programme's prior and not on the survey's evidence. Record the conflict between an unattended agent-callable entry and a less-trusted solver.
24. Question 7: present the entry points and hand-over forms unranked, or rank by the cited evidence (inside the tracker and the review). Delete "the delegator that is growing fastest". Mark "at most one confirmation" as a design target.
25. Limits: replace "a third of the numbers are leads" with an actual count by tag. Add that every historical sample consists of owners who had already chosen to hand work out.
26. Replace "what the studies name as the cause", "history says", "the exception that explains the rule", "go away", "so a Box is distinct" and "the capability is missing" with wording at the strength of "two case studies suggest" or weaker.
27. Give a source for the "8%" ban figure or delete it.

## 6. Host and model

Claude Code agent session on the owner's Windows 10 machine, started by the lab lead as a fresh agent with the role file and the line's files. Model as reported by the host: Opus 5.5 (`claude-opus-5-5`). Same model family as the survey's author as far as is known; independence here is a fresh context, not a different model. Tools used: web search, the summarising fetch tool, and local `pdftotext` on five arXiv PDFs the fetch tool saved (1904.02724, 2005.14306, 2607.04003, 2512.14012, 2310.06770). Some sources postdate this model's training data and could be checked only against what was fetched.

## 7. Standing of each main claim

| # | Claim | Standing |
|---|---|---|
| 1 | Bounded hand-out of software work was tried many ways and stayed small | **Stands** as description. "Did take hold" for whole-repository agents must be added beside it |
| 2 | The cause the studies name is on the owner's side (specification, context transfer, review) | **Weaken** to "two single-organisation case studies, read as abstracts, are consistent with". The bounty study does not bear on it |
| 3 | No source names unwillingness to share source; open-source bounties show disclosure was not the barrier | **Does not stand.** Sources name it; the samples could not detect it. Earned: "not measured either way" |
| 4 | With agents the solver-side obstacles go away and review gets worse | **Weaken.** First half is unsourced inference; second half is from open-submission settings and is not shown for a single chosen solver |
| 5 | Most owners already let an agent see their code, which removes secrecy as a general reason | **Stands** at "suggests" (one large vendor survey, one old ban figure) |
| 6 | Nobody offers a hand-off limited to the source the task needs, with a travelling check | **Weaken.** Partial returnable views and subset mounts exist. What was not found: per-task selection driven by the check |
| 7 | Today's tools limit attention, not access; the only path controls are deny lists agent modes do not honour | **Weaken.** Out of date for Copilot CLI and app; incomplete for Claude Code |
| 8 | The security bounty is "the exception that explains the rule" | **Does not stand.** `[S]` figure, unsourced explanation, a false premise for the survey's own examples |
| 9 | The literature finds no gain from handing agents chosen context | **Does not stand** |
| 10 | Solver success on a Box against the whole repository is unmeasured | **Stands** for a hard boundary with a fallible rule; adjacent oracle results exist |
| 11 | Third-party solvers needing less than the repository are a real and growing category | **Does not stand.** "Unknown" is earned; "growing" is not |
| 12 | The Box stands or falls on the owner's cost to make the example and confirm | **Stands** as "is consistent with", and is the survey's most useful sentence. It argues against direction 1 as much as for it |
| 13 | Recommendation: direction 1, entered through an agent-callable tool | **Does not stand as a finding of this survey.** It is the programme's prior restated. The evidence read does not separate directions 1 and 2, leans slightly to 2 on testability and on what was opened, and does not exclude "stop" |
| 14 | Question 7 ranking | **Does not stand.** Inference, in part against its own cited evidence. The unranked list stands |
