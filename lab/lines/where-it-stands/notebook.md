# Notebook: where the product stands

Append-only. Newest entry last.

## 7 October 2026, session 1: survey

**Set out to do.** The line's first stage: survey what is public on the owner's questions 1 to 5 and 7, the direction of software engineering with agents, and the strongest argument against a Box. Start with question 1, as the programme orders.

**Before starting.** `git fetch origin`; `lab` already contained `origin/master` (nothing to merge). One kitchen wave closed since the last brief, so no sync owed. Read the CTO's "For the lab" on master: nothing in it bears on this line.

**Written down before searching.** Expected to find: (a) that bounty and crowd platforms failed mainly on the solver's side (low pay, competition), as the owner's note guesses; (b) that some product already cuts a task-sized package out of a repository for agents; (c) that multi-agent systems already limit each sub-agent's access to source. Any of these being wrong would change the direction.

**Did.** About 45 web searches and 30 page fetches, all free, in four strands: the history of handing out bounded work; adjacent products and ways to keep code from outsiders; how agents divide work; entry points and why tools become normal. Wrote `related-work.md` with every source tagged by how it was read, and `survey.md` answering the questions by name. Dispatched a fresh agent as sceptic with the role file and the two pages, told to argue the opposite direction.

**What happened.**

- (a) was wrong in emphasis. The case studies put the cost on the owner: specification, context transfer, review. Solver-side causes appear, but only in sources not opened.
- (b) not found. Context packers ship text, not a runnable subset or a check; benchmark task directories have the right shape but are hand-made. The search for this was thin.
- (c) was wrong. Sub-agents get a fresh context window and the same working directory. The limit is on attention, not access. Vendor deny lists exist and, by the vendor's own page, do not cover every agent mode.
- **Surprise, followed.** No source names source disclosure as what stopped bounded delegation, and open-source bounties, where disclosure costs nothing, stayed as small as the rest. The product's most quoted number so far (2 of 694 files) answers a problem the history does not report. Followed it by asking what the one success had: security bug bounties scaled, and their unit carries its own proof. That points at the check, not the slice, as the half with a precedent.
- **Second surprise, noted only.** The form that did scale is now breaking: curl closed its bounty in January 2026 under machine-written reports. Free submission with costly review is the new shape of the old problem.

**Dead ends.** The Dibbern paper's repository page, the Codex cloud documentation and the Replit bounty page could not be read (blocked, redirected, or without the statement). The fetch tool returns a small model's summary of a page, not the page; two summaries were internally inconsistent (Bountysource shares adding to 100.9%, JetBrains headline shares adding to over 100%) and are flagged where used.

**Limits.** No paper read in full. About a third of the numbers are search-summary leads. Nothing about what customers want, by rule.

**Pstack principles that changed a decision.** *Laziness, subtract before you add* (as the charter restates it: existing method first): looked for an existing unit before describing the Box as new, which is how the benchmark task directory and the reduced test case came in as precedents. *Guard the context window*: did the reading through search summaries and targeted fetches in the main session and sent only the hostile review to a fresh agent. *Experience first*: ranked entry points by steps for the owner, which put "one click to assign an issue" down as the incumbent to beat.

**Next.** See the README's open threads.

**The sceptic (same session, fresh agent, same model family).** Re-opened fifteen sources, five in full text, and wrote `sceptic-survey.md` with 27 corrections. Four draft claims did not stand and six were weakened:

- The surprise recorded above was wrong as stated. Three sources name disclosure as a concern (one of them a source this survey had cited), and every sample read is of owners who had already chosen to hand work out, so none could show a disclosure barrier. Earned: not measured either way.
- "Security bounties are the exception that explains the rule" rested on a search-summary figure, an unsourced explanation and a false premise (curl's source is public).
- "No gain from handing agents chosen context" confused instruction files with source selection. Oracle-context studies find a gain or no loss.
- The draft recommended direction 1. The sceptic's point holds: that was the programme's prior restated; the evidence does not separate the directions and does not exclude stopping.
- Missed entirely by the lead: whole-repository agent delegation is the natural experiment. It is bounded delegation that did take hold, and it did so by handing over everything and specifying nothing, the reverse of a Box.
- Prior art found by the sceptic in under ten queries: Josh, Copybara, Zhou and Liu 2010, subset-mounting sandboxes. The lead's "handful of queries" was too few to say "nothing found".
- Wrong numbers and misquotes corrected in `related-work.md` (Bountysource shares, the offshoring study's size, a paraphrase set in quotation marks, "experimental", "sees only the diff").

`survey.md` was rewritten to the corrected version and lists what changed; `related-work.md` entries the sceptic re-opened are marked `[V]`.

**Lesson for the next survey session.** The fetch tool's summaries dropped half-sentences and invented a quotation; any sentence put in quotation marks should be asked for verbatim by keyword, and a search for prior art needs more than a handful of queries before "not found" is written. The lead also took the unfavourable number when a search summary and a fetched source disagreed, without noticing they disagreed.

**Next.** The adjacent-products table as the line's instrument; the full-text reading listed in the README. Formulation waits for the CTO's reading of the brief, because the survey's honest output is "undecided, and here is what would decide".
