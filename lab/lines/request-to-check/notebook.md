# Notebook: from a request to a check

Append-only. Newest entry last.

## 6 October 2026, session 1: survey

**Set out to do.** The programme's first session: survey Line 1 properly, skim Lines 2 and 3 for their names in the field and whether either is already answered, and send the CTO anything that bears on R2.

**Before starting.** Merged `origin/master` into `lab` (STATUS.md, K6 brief, packaging card; no conflicts). Master has no "For the lab" section in BACKLOG.md yet, so there was nothing from the CTO to answer. Kitchen state: K6 parked, R2 not approved and not briefed, D4 unstarted.

**Did.** About 30 web searches and 35 page reads, all free. Read R1's wave file, notes and agreement as the product's one real data point. Wrote `lab/survey.md`, this line's `README.md` and `related-work.md`. Every source is tagged by how it was read: abstract read, or search summary only. No paper was read in full.

**What happened.**

- The problem has no single name. The useful frame came from the benchmark-critique literature, not the test-generation literature: a check is a classifier with a false-accept rate, a false-reject rate and a cost.
- Expected to find that existing tests are a sound check and the hard part is only the missing-test case. Found instead that developer-written tests are wrong in both directions at rates that matter. This changed the line's formulation: every route, including "name an existing test", has to be scored for error, not assumed safe.
- Expected a published breakdown of requests by how checkable they are. Did not find one. Benchmarks filter to requests that already have tests, which hides the case the product most needs.
- Requester-cost evidence is thin: one 15-person study at function scale.
- Line 2 is not answered in the field. The nearest studies suggest context changes move cost more than success, and that small studies cannot resolve success differences under 10 to 15 points.
- Line 3 is not answered for import-following selection. The field's known gap is run-time loading.

**Dead ends and failures.**

- OpenAI's two SWE-bench Verified pages returned 403 to the reader. Their figures are from search summaries only and are tagged so.
- The Aarhus call-graph paper downloaded as a PDF the host could not render (no PDF tool installed). Its recall figures are from a search summary only.
- A search summary attributed "7.87% of bug-fix pull requests improve tests" to no identifiable paper. Left out.
- Searches for a taxonomy of requests by verifiability returned taxonomies of review comments and task types instead.
- arXiv:2507.18130 is now titled Doc2Feat-Bench; search results still call it NoCode-bench and quote an older best score (28.07%) than the current abstract (37.72% on the verified subset). Used the abstract.

**Surprise followed.** R1's check. Its agreement lists two commands: `tsc --noEmit` and one generated evaluator test. The outcome is "a section stops appearing in the output; everything else is preserved". In the field's terms that is one small fail-to-pass condition plus a pass-to-pass guard. The existing kitchen suite (22 tests then) already is a guard. So the roughly 470 lines may have bought a custom guard the repository partly had. Not tested: the existing tests may not cover what R1's fixtures covered, and they did not ship in the Box. Recorded as the first open thread and passed to the CTO as a question, not a finding.

**Sceptic.** A fresh agent was dispatched on the survey's scholarship and framing. Its report is `sceptic-survey.md`; corrections made after it are listed in the next entry.

**Next.** Formulate: fix the definitions in the README, write the labelling guide for the map (kinds of check, plus whether the outcome is observable at a command line), and label this repository's own wave files as a pilot before sampling public trackers. Settle the R1 open thread from recorded evidence first; it is cheap.

## 6 October 2026, session 1, after the sceptic

**Sceptic's verdict** (`sceptic-survey.md`; same model family as the lab lead, so independent by being fresh, not by being different). No invented source, author or number. One wrong comparison and several numbers quoted without the qualifier beside them in the source, each making the draft read stronger than the evidence.

**Corrected in the survey, related work, README and brief:**

- "One in five accepted solutions is wrong" did not stand as a general statement. Estimates run from about 1% to 20% by method; the 19.71% comes from model-written tests that themselves wrongly rejected valid fixes on about a tenth of tasks.
- METR: "about half" was already adjusted for the 68% human baseline; the draft quoted both. Raw figure is a third to a half.
- SWT-Bench: precision doubled at 20% recall. The draft left the recall out.
- TiCoder: 3 small tasks; only the yes/no variant was significant; the large gain assumes a requester who is never wrong.
- "The literature suggests requester-confirmed generated checks are the cheapest trustworthy route" did not stand. It is now a hypothesis. The sceptic found older human studies (Staats et al. 2012; Fraser et al. 2015) that point the other way, which the first search missed entirely.
- Line 2: the draft's prior that the effect on success would be small came from studies that add context, not remove source. Withdrawn. What stands is the cost of measuring: tasks, not runs, are the limit.
- "No requester-cost evidence" was too strong: acceptance-test experiments from 2006 to 2009 exist and are unread.

**Lesson for the instrument stage.** The lab lead's errors all ran one way: toward the tidier story. The map's labelling guide should be written so a second labeller cannot see the first's labels, for the same reason.

**Added from the Git record after the first entry** (observation, not a rerun). `tests/kitchen/kitchen-stats.test.ts` existed at R1's base `e412e08`: 193 lines covering `readRuns`, `stallCheck`, `checkLimits`, exit codes and the printed page, with no mention of Usage, and unchanged by R1. R1 added about 400 lines of checks and check plumbing across five files (`git diff --stat e412e08 ddeb3ab`, excluding research and wave files). So most of R1's "preserve" clause had a guard already; the new part was one condition. Not checked: whether that existing test runs inside a Box, and whether it covers R1's fixtures.

**Still unverified:** Qi 2015 and Smith 2015 (cited from search summaries), the 90,000 pull-request figure, the agent-pull-request task shares, the 7.3% enhancement share, and the model-judge papers.

**Next, revised.** Before formulating: read Liang et al. (arXiv:2609.12012), Staats et al. 2012 and the Fit-table experiments. Then the labelling guide and the pilot on this repository's wave files.

## 6 October 2026, session 2: formulate

**Set out to do.** Read what the sceptic found, settle the R1 thread, fix the definitions, write the labelling guide and try it on our own wave briefs.

**Before starting.** Merged `origin/master`: K6 is accepted there, not parked as the last brief said. Master now has "For the lab" in BACKLOG.md; the CTO took the R2 and D4 advice and asked that the R1 claim be settled before it is quoted. Installed the repository's pinned tooling and dependencies inside the lab folder (free; `npm ci --prefix scripts/tooling`, then a frozen pnpm install) after `kitchen-busy` said idle.

**Reading.** Poor yield. Liang et al. (arXiv:2609.12012): abstract only; it separates test availability, test validity, feedback use and evaluation independence, which matches this line's frame. Ricca et al. 2009: summary only; acceptance tables helped students understand requirements without significant extra effort, which is about reading tests, not writing them. Staats et al. 2012, Melnik et al. 2006 and Barr et al. 2015: could confirm they exist, could not open them. The human-confirmation question stays open and unread.

**Experiment 01** (`experiments/01-r1-cheap-check/`). Plan committed before the run (`b899611`). Eight candidates, two checks. All 16 predictions came true; the lead's Result said the cheap check matched R1's custom check on 7 of 8 and that the custom test mostly restated the existing one.

**The sceptic broke the second half.** Ten more candidates: on its six wrong ones the checks agree once. Each check catches wrong work the other accepts, and each rejects one right candidate because it searches for a word. It also found an arithmetic slip (three of seven, not six), an unrecorded second pass, flattering case selection, and that the cost comparison was of judgements, not of R1's 827 added lines. Standing: table stands, "about as well" weakens to suggests, "restated" does not stand.

**What changed my mind.** I went in expecting to show R1's cost was avoidable. What the evidence supports is narrower and more useful: the existing test and the new test protect different things, the new test was the weaker of the two in places, and the avoidable-cost question turns on delivery into a Box, which nobody has tested.

**Second time the lead's draft ran ahead of the evidence in the same direction.** Both times the cause was the same: cases and readings chosen by the person holding the hypothesis. Made structural: the formulation now requires candidates written by an agent that has not seen the checks.

**Formulation.** Fixed in the README: request, clause, candidate, right and wrong, check (evidence of change plus guard), route; three measures; what would show it wrong.

**Map pilot** (`map/pilot/`). 79 bullets, two blind labellers, kappa 0.71 on kind of check, 0.74 on observable. The guide's faults: the bullet is the wrong unit, "record it" riders inflate READ, two kinds of condition have no label, one default was wrong. Version 1 specified in `map/pilot/RESULT.md`.

**Dead ends.** The older human studies could not be opened at zero cost through this host's reader. The call-graph PDF from session 1 is still unread for the same reason (no PDF tool).

**Next.** Instrument. Guide version 1: split bullets into atomic conditions, add the red-or-green-on-base column, re-test agreement on the same 79. Then the first sample from outside this repository. In parallel, when the kitchen is idle: try to run the existing kitchen-stats test inside an exported Box, which is the test of whether R1's cost was avoidable.
