# Survey: where the field is on the lab's three lines

Session 1, 6 October 2026. Line 1 surveyed properly; Lines 2 and 3 skimmed for names and whether they are already answered. Sources and how each was read are in [lines/request-to-check/related-work.md](lines/request-to-check/related-work.md). Nothing was read in full; numbers come from abstracts, and a few from search summaries, marked there.

## Line 1. From a request to a check

**The field's frame.** A check is a classifier of solutions with two error rates and a price: how often it accepts a wrong solution, how often it rejects a right one, and what it costs the requester to obtain. The standard shape is *fail-to-pass plus pass-to-pass*: something that was red on the starting code goes green (the change happened), and what was green stays green (nothing broke).

**What is known.**

1. *Even the best checks are wrong both ways.* On the most-studied benchmark, where the tests were written by the developers who made the real fix, about one in five accepted solutions is wrong once the tests are strengthened (SWE-ABS: 19.71%), and about half of test-passing agent pull requests would not be merged by maintainers (METR; the human patches scored 68%). In the other direction, an audit of hard cases found about a third had tests that enforce implementation details nobody asked for.
2. *A model can write the failing test from the request more often than not, for bug reports in Python.* Best published fail-to-pass rate is 63% (e-Otter++); two years ago it was near 20%. Using such a test as a filter doubled the precision of an agent's fixes (SWT-Bench).
3. *Generated tests have a known vice:* they assert what the code does now, not what it should do, and they share the blind spots of a solver from the same model family.
4. *Putting the requester in the loop is the one route with human evidence.* TiCoder shows people a few tests that tell candidate solutions apart and asks yes or no; 15 programmers judged code more accurately with less effort. Single functions only.
5. *Most real requests arrive without a test.* About 40% of pull requests touch tests at all. The field's benchmarks keep only requests that came with tests, so the common case this line cares about is the one least measured. The one benchmark of paid freelance work (SWE-Lancer) had engineers write and triple-check end-to-end tests for every task.
6. *Agents do not notice a vague request and rarely ask;* when made to ask, results recover. They also over-build on feature requests and change code when nothing needed changing.

**What is not known (not found in this session).** A map of real requests by how they could be checked. The requester's cost of specifying by a check against doing the work, at repository scale. Error rates of generated or requester-confirmed checks on TypeScript applications and feature-shaped requests.

**Is the line aimed right?** Yes, and the order in the programme (map first) is right: the field cannot say what share of real requests each kind of check would cover, and that share decides which route is worth studying. One sharpening: every route should be scored on the same three numbers (false accept, false reject, requester cost), because the literature shows the first two are large even for hand-written tests.

## Line 2. Does a Box help?

**Names in the field:** context engineering, repository-level context retrieval, localisation, context files, oracle context.

**Is it answered?** No. Nothing found compares the same agent on the same task with a reduced runnable package against the whole repository. The nearest evidence:

- Adding written context does not raise success and raises cost by over 20% (Gloaguen et al., arXiv:2602.11988, abstract read). A second study bounds any effect of context strategy on correctness to 10 to 15 points over 288 runs and finds agents fail on implementation skill, not missing repository knowledge (Khatri, arXiv:2607.27250, abstract read; single author, 17 tasks).
- Agents' own exploration misses every needed file on 27 to 35% of samples, and handing over the exact files shows "substantial remaining headroom" in a pilot (Agent Retrieval Bench, arXiv:2607.24882, abstract read).

**What this means for the line.** These pull in different directions, so the question is open and worth a benchmark. But the prior from the field is that a success-rate difference will be small, and a study with a few dozen runs cannot detect a small one: 288 runs only bounded it to 10 to 15 points. At zero cost the line can probably measure steps and tokens well and success only coarsely. That should be written into the line's formulation before any run, and the CTO should know it before designing D4 around a success comparison.

## Line 3. Does the slice contain what the change needs?

**Names in the field:** change impact analysis, program slicing, call-graph soundness, software debloating, co-change (logical coupling), hermetic builds.

**Is it answered?** Not for this product's method. What the field does say:

- Static analysis of JavaScript is known to miss edges created at run time (dynamic property access, computed imports, registries). A search summary reports call-graph recall near 76% for a state-of-the-art static analysis, rising to 88% with run-time hints (Møller's group, Aarhus); the paper was not readable this session, so treat the figures as a lead.
- Debloating research selects code by what the tests exercise, as the product's "checked by execution" step does, and inherits the same limit: whatever the checks do not exercise can be missing without anyone noticing.
- "edit2ripple" in Agent Retrieval Bench is the same question from the retrieval side: given an edit, which other files must change.

**What this means for the line.** Open, and the programme's plan (replay real past changes and count what the selection would have missed) is the standard way to measure it. The stand-in idea parked under this line has no direct precedent found in this skim.

## Bearing on the kitchen now

In [BRIEF.md](BRIEF.md).
