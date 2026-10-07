# Candidates: research that works and nobody has built

Line E, session 1, 7 October 2026. Sources and how each was read: [related-work.md](related-work.md). **This is the version after the sceptic** ([sceptic-candidates.md](sceptic-candidates.md)), who found seven neighbouring products the lead had missed, corrected the main paper's numbers, and swept twelve further areas.

**Answer: none survive. There is one near miss.** The bar asked for three and says "none" is acceptable. Twenty-six areas were looked at between the lead and the sceptic. They die mostly on filter 7 (a product already exists) and filter 2 (the research does not yet work).

**A caution on scope.** While this session ran, the owner redirected the line: look in a different layer, where the model is not the moat, and treat that as the first test (test 9). This session had already searched the layer directly on top of the model. So it is evidence for the redirection, and it has not yet looked where the redirection points. The sceptic's twelve extra areas touched a few trades lightly (building codes, tariffs, accessibility) and found products there too.

## The near miss: a safety net under agent actions

**In one sentence.** A layer between any agent and the tools it calls that holds back what can be held, undoes what can be undone, recognises a repeated request, and stops for a person on what cannot be taken back.

**What the paper showed, corrected.** Atomix (Max Planck Institute, EPFL, Aarhus), a paper at an ICLR 2026 workshop, not the main conference. Two versions exist and their evaluations differ; the numbers below are from the first.

- With three calls in ten made to fail, agents finished 57% of web tasks with the layer against 3% with no recovery at all. Against the ordinary approach of restoring a checkpoint and retrying, it was 57 against 53 on one benchmark and 37 against 37 on another. The later version calls its own comparison "statistically tied". With no failures injected, every mode scores the same.
- What it does show: of 1,200 emails that must not go out from abandoned attempts, none leaked with the layer; restore-and-retry leaked 1,351, of which 151 were duplicates. In the later version two standard techniques also leak none.
- The authors do not claim exactly-once delivery through a crash. The code is public and is, in their words, an alpha research implementation.
- Of the two other 2026 papers the draft cited as agreeing: one reports fewer tokens (about a quarter) and 45 of 45 forbidden actions stopped before commit; the other describes the problem and has not built its fix.

**Why it does not survive.**

| Test | Verdict |
|---|---|
| 9. The model is not the moat | Mixed. A better model does not stop a retry from repeating a payment. But agent vendors and the owners of the tools have every reason to build this themselves, and are |
| 1. No machine decides correctness | Passes |
| 2. No unsolved research | Weaker than the draft said. The gain over plain checkpoint-and-retry is not established |
| 3. Real software | Passes |
| 4. Not standard practice, not a vendor's afternoon | **Fails.** Repeat-recognition keys, undo by compensation, approval gates and step journals are each shipped practice |
| 5. Not a marketplace | Passes |
| 6. The owner can tell if it is good | Passes: break calls on purpose and count leaks and duplicates |
| 7. The market has not found it | **Fails in substance.** No one product does all four things, but the market is on it |
| 8. Someone would pay | Plausible; a survey and incidents, not buyers |

**What already exists.** Two backup companies sell undo for agents (Rubrik, announced August 2025; Veeam, February 2026, which also pauses hard-to-reverse actions for approval), and a third has announced one. Cloudflare added undo-by-compensation to its workflow product in June 2026. Agent frameworks and gateways ship approval holds and step checkpoints (LangChain, Google's agent kit, DBOS, at least one gateway). Six small open-source projects have the same design and almost no users. A separate 2026 paper reports that a repeat-recognition key on the tool's side alone cuts duplicates from 28% to 4%.

## What died, in a line each

- **Security enforced outside the model** (the CTO's lead). In Microsoft's agent framework as an experimental feature since May 2026; several funded products. Filter 7.
- **Per-task permissions and revocable authority.** Works in papers. Vendors and gateways do it. Filters 7 and 4.
- **Turning a repeated screen task into a program that replays without the model.** Works. Browser-automation products ship it. Filter 7.
- **Cutting tokens by caching; running likely tool calls early.** Work. Known, productised, or a feature the agent vendor owns. Filters 7, 4 and test 9.
- **Watching agents from outside with operating-system tracing.** Works. Open source from its authors, and vendors. Filter 7.
- **Scoring the descriptions tools give of themselves.** Works. Scoring tools already exist. Filter 7.
- **Stripping private data a tool does not need from what an agent sends it.** Works in one small paper. Gateways already redact. Filters 7 and 4.
- **Receipts signed by the service an agent called.** The cryptography works. Every service must opt in, which the paper calls unsolved. Filter 8.
- **Checking a provider serves the model you paid for.** The paper finds it cannot be done reliably from outside. Filter 2.
- **Defending web agents against manipulative pages; interfaces that make people better overseers; finding the failing step; root-cause analysis; extracting data for medical reviews; repairing web accessibility.** The research measures the problem and has no fix that works, or reports its own failure. Filter 2.
- **Outside developer tools, lightly:** checking building plans against codes, tariff classification, simulated survey respondents, connectors between systems, spreadsheet auditing, matching records. Funded products in each. Filter 7. Help for screen-reader users passes test 9 and has a vendor's free assistant already.

## The CTO's pattern

*"The gap between a paper and a product is months, and many papers come from vendors."* Consistent with four cases the lead picked, which is an illustration and not a test. Checked: Microsoft's paper to its experimental feature, twelve months. A backup vendor announced undo for agents six months before the transactions paper. The other two dates were not verified.

## What this session is worth

It confirms, area by area and with products named, the owner's reason for redirecting: on the layer next to the model, a result that works is already a product or about to be a vendor's feature. It does not yet say anything about the layers the redirection names (a trade's daily work and records, compliance and liability, many small systems, the physical world). That is the next session.

## Limits

One session; about 40 searches by the lead and about as many by the sceptic; nothing read in full by either; most product facts are search summaries. Searches were by topic words the two thought of. The lead's queries were not recorded, so the search cannot be rerun exactly; the next session records them. Lead and sceptic are the same model family. Nothing about what customers want.
