# Survey: where the field is on the lab's three lines

Session 1, 6 October 2026. Line 1 surveyed properly; Lines 2 and 3 skimmed for names and whether they are already answered. Sources and how each was read are in [lines/request-to-check/related-work.md](lines/request-to-check/related-work.md). Numbers come from abstracts, and a few from search summaries, marked there. A sceptic then re-opened the main sources; this page is the corrected version, and the corrections are listed in [lines/request-to-check/sceptic-survey.md](lines/request-to-check/sceptic-survey.md).

## Line 1. From a request to a check

**The field's frame.** A check is a classifier of solutions with two error rates and a price: how often it accepts a wrong solution, how often it rejects a right one, and what it costs the requester to obtain. The standard shape is *fail-to-pass plus pass-to-pass*: something that was red on the starting code goes green (the change happened), and what was green stays green (nothing broke).

**What is known.**

1. *Even the best checks are wrong both ways.* On the most-studied benchmark, where the tests were written by the developers who made the real fix, some test-passing solutions are wrong: between about 1% and 20% depending on how one looks, with about 8% certainly wrong by the most conservative direct method. Maintainers would merge only a third to a half of test-passing agent pull requests, against 68% of the original human patches. In the other direction, annotators flagged 61% of a random sample as having tests that could reject a valid solution, though the one direct count of that happening found it rare (1 of 27).
2. *A model can write the failing test from the request more often than not, for bug reports in Python.* Best published fail-to-pass rate is 63% (e-Otter++), scored against the known fix; that is not the same as a trustworthy check. Used as a filter, such tests doubled the precision of an agent's fixes but discarded four in five correct ones (SWT-Bench).
3. *Generated tests have a known vice:* they assert what the code does now, not what it should do, and they share the blind spots of a solver from the same model family.
4. *Putting the requester in the loop has human evidence on both sides.* TiCoder shows people a few tests that tell candidate solutions apart and asks yes or no; 15 programmers judged code more accurately on 3 small tasks. Against it, an older study found people wrongly approve a quarter to a half of incorrect generated invariants (Staats et al. 2012, search summary). Whether a requester's yes can be trusted is open.
5. *Most real requests arrive without a test.* About 40% of pull requests touch tests at all. The field's benchmarks keep only requests that came with tests, so the common case this line cares about is the one least measured. The one benchmark of paid freelance work (SWE-Lancer) had engineers write and triple-check end-to-end tests for every task.
6. *Agents do not notice a vague request and rarely ask;* when made to ask, results recover. They also over-build on feature requests and change code when nothing needed changing.

**What is not known (not found in this session).** A map of real requests by how they could be checked. The requester's cost of specifying by a generated check against doing the work, at repository scale (older experiments on hand-written acceptance tests exist and are still to be read). Error rates of generated or requester-confirmed checks on TypeScript applications and feature-shaped requests.

**Is the line aimed right?** Yes, and the order in the programme (map first) is right: the field cannot say what share of real requests each kind of check would cover, and that share decides which route is worth studying. One sharpening: every route should be scored on the same three numbers (false accept, false reject, requester cost), because the literature shows neither error is negligible even for hand-written tests.

## Line 2. Does a Box help?

**Names in the field:** context engineering, repository-level context retrieval, localisation, context files, oracle context.

**Is it answered?** No. Nothing found compares the same agent on the same task with a reduced runnable package against the whole repository. The nearest evidence:

- Adding written context does not raise success and raises cost by over 20% (Gloaguen et al., arXiv:2602.11988, abstract read). A second study of 17 tasks and 288 runs saw no effect of context strategy on correctness, but by its own account could only have detected a difference above 30 points; 10 points would need 120 to 200 tasks, and repeating runs barely helps (Khatri, arXiv:2607.27250; single author).
- Agents' own exploration misses every needed file on 27 to 35% of samples, and a pilot that hands over the exact files reports headroom in which files the agent finds and how much it explores, not in task success (Agent Retrieval Bench, arXiv:2607.24882, abstract read).

**What this means for the line.** The question is open and worth a benchmark. These studies add a context file; a Box removes source, so they give no prior on the size of the effect. What they do establish is the cost of finding out: what limits a success comparison is the number of distinct tasks, not runs, and a difference of 10 points needs over a hundred tasks. The repository's history offers a few dozen. So at zero cost a success comparison can only detect a very large difference. Fewer tokens in a smaller package is close to mechanical and proves little by itself. The line's formulation must state the smallest effect its benchmark can detect before any run, and the CTO should know this before designing D4 around a success comparison.

## Line 3. Does the slice contain what the change needs?

**Names in the field:** change impact analysis, program slicing, call-graph soundness, software debloating, co-change (logical coupling), hermetic builds.

**Is it answered?** Not for this product's method. What the field does say:

- Static analysis of JavaScript is known to miss edges created at run time (dynamic property access, computed imports, registries). Laursen, Xu and Møller (PLDI 2024, abstract read from the paper in session 3) report average call-graph recall of 75.9% for static analysis on 36 projects, rising to 88.1% with run-time hints. That is call edges inside programs, not which files a change needs, so it shows the kind of gap, not its size for this product.
- Debloating research selects code by what the tests exercise, as the product's "checked by execution" step does, and inherits the same limit: whatever the checks do not exercise can be missing without anyone noticing.
- "edit2ripple" in Agent Retrieval Bench is the same question from the retrieval side: given an edit, which other files must change.

**What this means for the line.** Open, and the programme's plan (replay real past changes and count what the selection would have missed) is the standard way to measure it. The stand-in idea parked under this line has no direct precedent found in this skim.

## Bearing on the kitchen now

In [BRIEF.md](BRIEF.md).
