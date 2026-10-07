# Related work: where the product stands

Surveyed 7 October 2026 (Line B, session 1). Zero cost: web search and open pages only.

**How each source was read.** `[A]` the page or abstract was fetched this session and the numbers are taken from it. The fetch tool returns a summary made by a small model, not the raw page, so an `[A]` number has passed through one summariser; where the summary was visibly inconsistent it is said. `[S]` known only from a search-result summary: a lead, not a fact, until someone opens the source. `[V]` re-opened by the sceptic and the entry corrected to match; see `sceptic-survey.md`. `[F]` beside a `[V]` means the sceptic read the paper's full text. The lab lead read nothing in full. By tag, roughly half the numbers on this page are `[S]`. Vendor pages are the vendor's claims. Anything unmarked is the lab's inference.

## What the problem is called

- **Crowdsourced software engineering / crowdsourced software development (CSD)**: contests and open calls (TopCoder).
- **Bounties, issue bounties, bug bounties**: pay on an accepted result.
- **Microtask programming**: work cut into small self-contained pieces with little context.
- **Onboarding, newcomer barriers, "good first issue"**: open source's version of handing out bounded work.
- **Outsourcing / offshoring, client extra costs, transaction costs, knowledge transfer.**
- **Modularity as work assignment** (Parnas), **Conway's law, socio-technical congruence**: the theory of where a boundary can be cut.
- **Multi-agent systems, orchestrator and sub-agents, delegation, hand-off, context engineering, agent-to-agent protocols**: the 2025 to 2026 names.
- **Least privilege for agents, content exclusion, the "lethal trifecta"**: the security names.
- **Task format** (instruction, environment, tests): the benchmark world's portable unit.

## 1. Attempts to hand out bounded software work, and what stopped them

**Contests and crowdsourcing.**

- Stol and Fitzgerald, *Two's company, three's a crowd: a case study of crowdsourcing software development*, ICSE 2014, doi 10.1145/2568225.2568249 `[A]` (abstract, verbatim from the university page). One multinational using a contest platform. Crowdsourcing "works better for specific software development tasks that are less complex and stand-alone without interdependencies"; "development cost was much greater than originally expected"; "overhead in terms of company effort to prepare specifications and answer crowdsourcing community queries was much greater"; time to run contests, review submissions and resolve quality issues "was significant"; quality problems surfaced late. One company, one platform.
- TopCoder studies `[S]`: an average task failure ratio of 15.7%; failure predicted by worker reliability, links in the description, number of registrants, number of required technologies (4,872 tasks); workers report barriers of competence, collaboration and time management. Not opened.
- Mao, Capra, Harman, Jia, *A survey of the use of crowdsourcing in software engineering*, JSS 2017 `[S]`. The field's survey; lists decomposition and quality as open issues. Not opened.

**Bounties on issues.**

- Zhou, Wang, Bezemer, Zou, Hassan, *Bounties in open source development on GitHub: a case study of Bountysource bounties*, arXiv:1904.02724 (and TSE 2020) `[V]` `[F]`. 5,445 bounties worth $406,425 on 3,509 issue reports in 1,203 projects, October 2012 to October 2017; GitHub issues only, which the paper says are 77.3% of the platform's issue reports. Of the 3,509 issue reports: 43.0% closed and paid, 19.7% closed and unpaid, 37.3% open and unpaid. By money, 53.8% was paid. Of the 692 closed and unpaid, 479 had in fact been addressed and nobody claimed the money ("it seems that money was not the driver"). Likelihood of success fell from 53.2% to 30.1% when the bounty came more than 180 days after the issue; the authors' explanation is a conjecture ("might be due to such issue reports having become obsolete or being hard to address"). In projects new to bounties, value mattered most. The lab's arithmetic: a mean of about $75 a bounty and about $80,000 a year, as a five-year mean. **The paper studies which bounties succeed. It says nothing about owner-side cost or why the platform stayed small.**
- *Studying the association between Gitcoin's issues and resolving outcomes*, arXiv:2309.15017 `[A]`. Over 4,000 bounty issues; outcome correlates with project length, description quality, issue type and value. The abstract gives no rates.
- Bountysource `[S]` (Wikipedia and developer posts, via search): sold twice to cryptocurrency companies, tried in 2020 to keep bounties unclaimed after two years and withdrew the change, appears to have stopped paying verified claims by June 2023, parent announced a bankruptcy filing in November 2023 `[V]`. No source gives a cause for the platform's failure; it is evidence about one company, not about demand.
- Replit Bounties `[S]`: described as deprecated and closed to new hunters. The docs page fetched did not contain the statement, so this is unconfirmed.
- Security bug bounties are the contrast `[S]`: HackerOne programmes paid $81 million in the twelve months to June 2025. The lab's conjecture, with no source for it: the unit there is a reproducible exploit, so the proof travels with the submission. Rival explanations not examined: a finding is worth far more than a $75 feature; no specification is needed because any exploit counts; the work cannot be done in-house by definition. (An earlier draft said no source is shared; that is false for curl and other open-source programmes.)
- That model is now under strain `[A]`: curl ended its bounty at the end of January 2026; Stenberg: "The current torrent of submissions put a high load on the curl security team" (The Register, 21 January 2026). Valid submissions were "about 5% by July 2025" `[V]` (quoted in arXiv:2607.04003); HackerOne's Internet Bug Bounty paused submissions in March 2026.

**Microtask programming.**

- LaToza and colleagues, CrowdCode and successors; Aghayi, *Large-scale microtask programming*, arXiv:2005.14306 `[V]` `[F]`, a two-page doctoral-symposium summary. It works in the laboratory: 9 developers built a microservice through 350 microtasks, first task submitted in under 30 minutes, 27 of 34 behaviours correct. Limits the author states: the client must specify functions and interfaces before any work is handed out; "decontextualizing programming work is hard"; workers make conflicting assumptions; design and architecture are not supported. It also reports an industry study at NTT (a project of 8,000 lines in 14 functions built and tested by microtasks; developers "took time to understand the new concepts"), and names disclosure as an obstacle: "some projects have security considerations, like private APIs that they do not want to expose to the public".
- A controlled experiment by Aghayi and LaToza `[S]`: against ordinary programming, onboarding time fell by a factor of 3.7 and project velocity rose 5.76 times with 7 times the people, while each developer was 1.3 times less productive. **Unresolved conflict:** the full-text source above says of the same 28-developer experiment that microtasking increased "individual developer productivity". The experiment paper has not been read.
- No commercial product came out of this line that the lab could find, beyond the NTT study. Not finding one is not proof there is none.

**Open source's "good first issue".**

- Tan, Zhou, Sun, *A first look at good first issues on GitHub*, ESEC/FSE 2020 `[A]`. 9,368 labelled issues in 816 repositories: they take longer to resolve than ordinary issues and "almost half of GFIs are not solved by newcomers".
- *Examining changes in good first issue practice and newcomer pull requests since the release of ChatGPT*, Zenodo 17638558, November 2025 (anonymous preprint; a later version is arXiv:2604.27532) `[A]`. 37 repositories, July 2021 to June 2025: the share of issues carrying the label fell from 0.90% to 0.74%, and merge rates for newcomer pull requests on them fell by 24% `[S]` (61.9% to 42.2%).
- Afroz and colleagues, *"AI slop is DDoSing open source"*, arXiv:2607.04003, July 2026 `[A]`. Over two million pull requests and issues in 294 repositories plus a survey of 229 practitioners: `[V]` `[F]` one-time contributors' merge ratio was 18.18% below a modelled counterfactual in 2025; communities fall back on "low-effort defensive strategies". The measured volume effect is modest: weekly pull requests 6.80% above the counterfactual, issues 8.12% below. "Flood" is how practitioners describe it, not what the series measures. This is about open submission by strangers.

**Outsourcing by ticket.**

- Dibbern, Winkler, Heinzl, *Explaining variations in client extra costs between software projects offshored to India*, MIS Quarterly 2008 `[S]` `[V]` (abstract only, from search; the repository page refused the fetch). Six offshored projects at one large German financial institution. The abstract asks why economic success varied so much and names four client extra costs: requirements specification and design, knowledge transfer, control, coordination; these were higher where the work needed client-specific knowledge. (An earlier draft said savings were "rarely" realised; the abstract does not say that.)

**The theory.**

- Parnas 1972 `[S]`: a module is "a work assignment"; the point of hiding information is to cut the communication needed between the people holding different assignments. Conway 1968 and the socio-technical congruence literature (Cataldo, Herbsleb) `[S]`: coordination needs follow the code's dependencies. The lab's reading of the two: a piece of work can be handed out cheaply only where the code was already cut so that it can be. If that is right it bears on Line A: the region for a task would follow existing module boundaries or be large.

**Disclosure as a concern** (added after the sceptic; an earlier draft said no source named it).

- Zhou and Liu, *Toward proactive knowledge protection in community-based software development*, ICSE 2010 workshop track, IBM Research `[V]` (publication page, read by the sceptic). Companies hesitate to use community developers because of "the concern about confidential knowledge exposure"; proposes restructuring tasks by "task reservation, task pretending and task partition" so work can go out without exposing confidential knowledge. The Box's disclosure idea, sixteen years earlier, from an industrial lab. The lab knows of no product that came of it.
- Computerworld, *At risk offshore*, 20 November 2003 `[V]`: theft of source at a contractor in 2002; the company kept offshoring and tightened controls. Disclosure as a risk firms managed, not one that stopped them.
- The Aghayi sentence above.
- **A limit on every sample in this section:** each study is of owners who had already decided to hand work out. Owners deterred by disclosure never appear. Nothing here measures whether disclosure stopped anyone.

## 2. Who does something adjacent today

**Coding agents on the whole repository.** `[S]` unless marked.

- Cloud agents (Codex cloud, Cursor cloud agents, Copilot coding agent, Jules, Devin, Claude Code remote tasks): a task is assigned from an issue, a chat message or a web page; a container or micro-VM is loaded with the whole repository; a pull request comes back. The Codex documentation page redirected and was not read, so "preloaded with the repository" rests on search summaries.
- Use is now ordinary. JetBrains Research, August 2026, over 15,000 developers `[A]` `[V]`: about 31% of respondents are "agentic coders" who generate about 84% of their code through agents; from a second post on the same survey, 90% use coding agents at least weekly and 68% daily. Use is concentrated in a few first-party vendors; neither post says anything about third-party agents.
- Agent pull requests are accepted at high rates in the public repositories that use them: Pinna, Gong, Williams, Sarro, arXiv:2602.08915 `[A]`, 7,156 pull requests from five agents: 82.1% for documentation, 66.1% for new features; task type matters more than which agent.
- Developers do not delegate blind: Huang, Reyna, Lerner, Xia, Hempel, *Professional software developers don't vibe, they control*, arXiv:2512.14012 `[A]`, 13 observed and 99 surveyed: `[V]` `[F]` they "retain their agency in software design and implementation" and enjoy agents "as source of collaboration--with the human in the loop-- rather than delegating work to the agents completely"; agents are found suitable for "straightforward, repetitive, and scaffolding tasks if prompted with well-defined plans" and unsuitable for integrating with existing and legacy code (3 for, 17 against). The authors state "a deliberate selection bias towards people positive towards AI".

**Tools that choose context for an agent.** Repomix, Gitingest, code2prompt (pack a repository or chosen files into one text file); Aider's repository map (a ranked outline of symbols) `[S]`. None ships a runnable subset, a check, or a statement of sufficiency. 

**Agents on chosen or reduced source** (added after the sceptic, who read these; an earlier draft said the literature finds no gain).

- SWE-bench, arXiv:2310.06770 `[V]` `[F]`: given the files the reference patch edits ("oracle"), Claude 2 resolved 4.80% against 1.96% with keyword retrieval. Old, weak models, no agent loop.
- Sam-Bodden, arXiv:2607.09691, June 2026 `[V]` (abstract; single author; N=70): "Compressed context ... matches whole files at a third of the tokens: a resolved issue costs 19K context tokens, not 94K".
- Agent Retrieval Bench, arXiv:2607.24882 `[V]` (abstract): retrieved starting context beats random context on which files the agent finds; "oracle gold context shows substantial remaining headroom". The lab's earlier note stands that agents' own search misses every needed file on 27 to 35% of samples.
- ContextBench, arXiv:2602.05892 `[V]` (abstract): 1,136 tasks; scaffolding "yields only marginal gains in context retrieval".
- The result in `lab/survey.md` that context files did not raise success (arXiv:2602.11988) is about instruction files, not about which source files an agent is given.
- Reading: being handed the right code helped or cost nothing in three studies, all with the right files supplied by an oracle. None tests a subset chosen by a rule that can miss, and none stops the agent looking elsewhere.

**Ways to let outsiders work on code that is not shared.**

- Whole-repository access under contract is the norm for contractors `[S]` (forum threads; contract terms assign IP).
- Secure remote workspaces (Citrix Secure Developer Spaces, formerly Strong Network; Coder) `[S]`: the outsider works inside the owner's environment with copy and download controls. The source is visible but hard to remove.
- Path-level access control exists in Perforce; Git hosting grants permission per repository `[S]`. Git sparse checkout is a convenience, not a barrier.
- Partial views of a Git repository that take changes back `[V]`: Josh (open source; serves a sub-folder of a monorepo as its own repository that can be fetched and pushed; its documentation offers this for "specific customers") and Copybara (Google, open source; moves code between a confidential repository and another one and imports outside changes). Cut by directory and static configuration, not by task, and with no check.
- Agent sandboxes that mount a chosen subset `[V]`: Docker's sandbox documentation offers a mode that "doesn't share a host workspace"; others mount "only the paths you specify". The means of giving an agent only some files exists and is free. Nothing found decides which files.
- Deny lists for agents: GitHub Copilot content exclusion `[A]` takes path patterns to ignore. `[V]` Since 2 September 2026 the Copilot app and CLI respect it (changelog); the Edit and Agent modes in editors do not (documentation as fetched by the sceptic). Vendors are closing this gap inside their own tools. Cursor has `.cursorignore` `[S]`. Claude Code has session-wide `Read(path)` deny rules and hooks that can block an operation `[V]`; deny-style and not per sub-agent.
- Vendor promises: zero data retention is now a headline feature of the large model providers `[S]`. Self-hosted and air-gapped assistants exist (Tabnine, Sourcegraph) `[S]`.
- How many owners refuse: Checkmarx 2024 via The Decoder `[A]`: 15% of surveyed companies prohibit AI coding tools while 99% of development teams use them; the respondents were security officers, the sample size was not given, and it is two years old.

**The benchmark world's portable task.** Harbor (successor to the Terminal-Bench format) `[A]`: "A Harbor task is an instruction, environment, and test script", a directory of `instruction.md`, `task.toml`, `environment/`, `tests/` and `solution/`. The environment is a container image. Tasks are written by hand for evaluation, not cut from live work.

**Not found:** anything that chooses the subset per task from a failing example and sends it out with that example as the check. That is narrower than an earlier draft claimed: sending out part of a repository and taking changes back exists (Josh, Copybara), and so does mounting a subset for an agent. What is new in a Box is the rule that chooses, which is Line A. Not searched: build-system dependency closures of one test target, and benchmark builders that turn live repositories into task environments automatically; both are the nearest technical neighbours.

## 3. How work is divided among agents (2025 to 2026)

- Anthropic, *How we built our multi-agent research system*, 13 June 2025 `[A]`. The lead hands each sub-agent "an objective, an output format, guidance on the tools and sources to use, and clear task boundaries". Vague hand-offs produced duplicated work. Multi-agent runs used about 15 times the tokens of a chat. On coding: "most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents are not yet great at coordinating and delegating to other agents in real time" `[V]`.
- Cognition, *Don't build multi-agents*, June 2025 `[S]`, and *Multi-agents: what's actually working*, April 2026 `[A]`. First position: sub-agents given a summary misread the task; share full traces. `[V]` Revised: "multi-agent systems work best today when writes stay single-threaded and the additional agents contribute intelligence rather than actions". A reviewer with a clean context that starts from the diff and re-reads whatever code it needs finds about two bugs per pull request: a limit on attention with full access. Managers delegating to child agents are shipped, with lessons: managers "default to being overly prescriptive, which backfires when the manager lacks deep codebase context". For a helper model, "a reasonable 80/20 solution is to just share a fork of the full context".
- Cemri and colleagues, *Why do multi-agent LLM systems fail?* (MAST), arXiv:2503.13657 `[A]`. Over 1,600 annotated traces from 7 frameworks, 14 failure modes in three groups: system design and specification, misalignment between agents, and task verification. `[S]` the first group is 44.2% of failures.
- Claude Code sub-agents documentation `[A]`, read 7 October 2026. A sub-agent "starts with a fresh, isolated context window" and gets a system prompt, the delegation message, project instruction files and git status; its tools can be allow-listed; it "starts in the main conversation's current working directory", so it can read the whole repository; the isolation offered is a git worktree, which is a full copy; it "returns only the summary". `[V]` Path-level read deny rules and hooks exist for the whole session, not per sub-agent.
- Osmani, *The code agent orchestra* `[A]` (2026, exact date not captured). One worktree per agent; "each agent only sees the files it owns" is a convention of the brief, not an access rule; hooks "run lint and tests before marking a task as done"; "The bottleneck is no longer generation. It's verification."
- A2A protocol, version 1.0 in 2026, under the Linux Foundation since June 2025 `[A]` (a builder's guide on the foundation's site, not the specification). A Task is "the unit of work, with an ID, a context ID, a state, a history, and artifacts"; messages carry text, bytes, a URL or structured data; the remote agent is "opaque". The guide says nothing about what source the remote agent should receive, how the result is checked, or any record of what was disclosed. `[S]` over 150 supporting organisations.
- Security `[S]`: the "lethal trifecta" (private data, untrusted content, a way to send data out); "Comment and Control", April 2026, in which text in issues and pull requests made three vendors' agents leak repository secrets; audits finding flaws in about a third of published agent skills. Practitioner guidance says an agent's working directory "should contain only the minimum set of files needed" and offers worktrees, which do not do that.

## 4. Entry points, hand-over forms, and what made tools normal

- Where agents are handed work in 2026 `[S]` (vendor pages): assign an issue to the agent in GitHub or Linear exactly as to a teammate; mention it in Slack or a pull-request comment; an error monitor opens a fix by itself (Sentry Seer); triage rules assign automatically.
- Dependabot `[S]`: bounded work packaged by a machine and delivered as a pull request with no step from the owner; merge rates of 60 to 76% in studies. Bot pull requests in general fared worse than human ones in a 2021 study (37% against 73%).
- Sadowski and colleagues, *Lessons from building static analysis tools at Google*, CACM 2018, and Johnson and colleagues, ICSE 2013 `[S]`: tools were ignored when they sat outside the workflow, when warnings were not actionable and when false alarms were common; Google's Tricorder succeeded by appearing inside code review and holding checks under about 10% effective false positives.
- Reduced test cases `[S]`: GCC requires "a self-contained test case" and compiler projects use automatic reducers (C-Reduce). This is a bounded, portable, checkable unit that did become normal, in a field where the failing example is the whole request.

## Not found, or not read

- Any public number for how many owners would hand a task outside if only part of the source went with it.
- Any comparison of an agent given a minimal runnable subset against the same agent on the whole repository (unchanged from `lab/survey.md`).
- Post-mortems from people who ran bounty or crowd platforms. Searched by the lead and again by the sceptic; none found from an operator.
- The body of Stol and Fitzgerald 2014, which is where any discussion of what the company would expose would be.
- Upwork and other contractor platforms on how code access is actually granted. Forum threads only.
- The A2A specification itself, the Codex cloud documentation and the Dibbern paper: fetches failed or redirected.
