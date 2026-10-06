# Pilot of the labelling guide (version 0) on this repository's wave briefs

6 October 2026, session 2. Rerun the scoring with `node lab/lines/request-to-check/map/score.mjs lab/lines/request-to-check/map/pilot/labels-lead.csv lab/lines/request-to-check/map/pilot/labels-second.csv`.

## What was done

- **Cases:** all 79 "Done when" bullets of the 15 wave briefs on master, extracted by script into `clauses.md`.
- **Labellers:** the lab lead, who wrote the guide, and a fresh agent given only the guide and the clauses. The lead's labels were written and moved out of the folder before the second labeller started. Both are the same model family; this measures whether the guide can be followed, not whether two different minds agree.
- **Purpose:** test the guide. It is not the map. Wave briefs are written by a head chef who already thinks in checks, for a repository with strong tests; they are far more checkable than requests from the outside world.

## Agreement

| | Raw agreement | Cohen's kappa |
|---|---|---|
| Kind of check (6 labels) | 78.5% of 79 | 0.71 |
| Observable from outside (yes/no) | 88.6% of 79 | 0.74 |

One labelling each, so no spread. By the usual reading 0.71 is substantial agreement, but 17 disagreements in 79 is too many to trust shares to within a few points.

## Counts (lead / second labeller)

| Kind | Lead | Second | Share, roughly |
|---|---|---|---|
| An existing check decides it | 8 | 5 | 6 to 10% |
| A short command decides it | 24 | 23 | about 30% |
| Exact example given | 1 | 0 | about 1% |
| A measurement | 3 | 1 | 1 to 4% |
| A purpose-built test is needed | 23 | 21 | 27 to 29% |
| A person must read and judge | 20 | 29 | 25 to 37% |

## What the disagreements show

1. **The bullet is the wrong unit.** By the second labeller's count over half the bullets hold several conditions. Eleven of the 17 disagreements are on bullets one or both labellers marked compound.
2. **The guide's rules inflate "a person must read".** A trailing "and record it" turned a mechanically checkable clause into READ for the second labeller in about twelve of its 29 READ labels, by its own count; the lead applied the same rule less strictly. Eight of the 17 disagreements are exactly this, which is nearly the whole gap in READ (20 against 29).
3. **Two kinds of condition have no label.** A negative case shown once by hand and then reverted (K9.5, K5.6, K8.3), and a condition on how the work was done ("a real run", "the preparation worker must not implement", "an independent reviewer"), which no inspection of the result can decide.
4. **The default in rule 2 was wrong** both times the second labeller checked whether a named suite already existed.
5. The guide never names its tie-break, and rules 1 and 5 pull opposite ways.

The second labeller's own account is in `second-labeller-notes.md`.

## What survives, with what confidence

- **Suggests:** in this repository's own briefs, an existing check alone decides only about one clause in ten. Most of what a brief asks for needs something new: a command (about three in ten), a purpose-built test (about three in ten) or a person reading (a quarter or more). Rests on 79 bullets from one author, one repository, two same-family labellers, and a guide with known faults.
- **Suggests:** about three clauses in ten could be decided by a short command with no test code. These are the cheap ones R2 is looking for.
- **Does not show** anything about requests from outside this kitchen.

## Changes for guide version 1 (to make and re-test next session)

1. Split every bullet into atomic conditions before labelling; the splitting is done once, by script plus one person, and both labellers label the same atoms.
2. A "record it" rider becomes its own atom. It no longer changes the label of the condition it trails.
3. Add `DEMO` (a constructed case shown once, not kept) and `PROCESS` (about how the work was done, not about the result).
4. Rule 2: the labeller is told, per request, which suites and commands exist on the base. No default.
5. State the tie-break once: when one atomic condition fits two labels, take the cheaper.
6. Add a third column: is the condition **red on the base** (evidence of change) or **green on the base** (guard)? Experiment 01 showed this is the distinction that matters for R2.
