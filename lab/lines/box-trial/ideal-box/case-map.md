# Case map: evidence, anchors and unknowns

This is a bounded map of the inspected sources, not a market census. **E** = evaluated in the cited paper; **D** = explicit documentation; **H** = plausible extension, untested; **U** = not established in inspected sources/searches. U is not evidence of absence. **P/M** follow the comparison. Query identifiers refer to [the search record](reading-log.md). Uncertain intersections have queries, not invented negative results.

Each source column gives what is offered, rather than just a tick. The two tables together contain every inspected source.

| Case | ADI P | DAIRA P+M | SWE-Doctor P+M | Wallaby P | Coco P |
|---|---|---|---|---|---|
| Failing test / wrong output | E reproduction/frame navigation | E monitored reproduction/report | E generated tests/diagnosis | D per-test path/values | D points and test coverage |
| Reproduction script, not test | D Python command/frame | E reproduction commands | H adapt diagnosis outside generated tests | U Q4 | D instrumented execution import |
| Log error, nothing runnable | U Q1 | U Q2 | U Q3 | U Q4 | U Q5 |
| Named function/file | D frame filter; runnable anchor still needed | D target/depth filter; reproduction needed | H targeted test generation | D file/line tests, values | D file coverage detail |
| Change under review | H inspect relevant reproduction; Q1 | H monitor existing behavior; Q2 | H diagnose regression; Q3 | D tests for changed code | D diff/test coverage |
| Feature request | U Q1 | U Q2 | U Q3 | D test generation workflow | D coverage-driven test generation; future behavior unknown |
| Few/no tests | D command anchor, not magical evidence | E generate reproduction from issue | E generate reproducing tests | H add runnable tests; Q4 | D new tests against coverage gaps; requires instrumented execution |
| Slow code | U performance workflow Q1 | U performance workflow Q2 | U performance workflow Q3 | D slow-test identification; not full causal profiling | U listed MCP profiling Q5 |
| Coverage gap / new tests (source-named) | U Q1 | H monitor new tests; Q2 | D targeted issue tests, not generic gap ranking | D test/coverage workflows | D test generation and verification demo |

| Case | Entire pgr P (Kind 3) | AutoCodeRover P localisation + model agent | coverctl P | Supercov P core / optional M assessment |
|---|---|---|---|---|
| Failing test | D static search only | E passing/failing SBFL list | D coverage checks/gaps; no ordered path | D run wrapper + coverage query |
| Reproduction script | D static search only | U Q10 | U Q13 | H adapter-compatible coverage command; Q14 |
| Log error, nothing runnable | D static search only | U Q10/Q11 | U Q13 | U Q14 |
| Named function/file | D definitions/source first | D AST search + optional SBFL | D file/domain gaps | D scoped gap queries |
| Change under review | D static search only | H regression tests + SBFL; Q10 | D changed-file coverage | D diff coverage |
| Feature request | D static search only | U Q10/Q11 | D coverage suggestions; does not know unimplemented behavior | D agent test generation guidance |
| Few/no tests | D static search only | U SBFL without passing/failing tests Q10 | D gaps/setup; no run means no runtime fact | D gaps/new-test guidance; must obtain execution |
| Slow code | D static search only | U Q10/Q11 | U profiling Q13 | U profiling Q14 |
| Coverage gap / new tests | D static search only | U Q10 | D suggest/debt/policy | D gaps/diff and optional quality assessment |

E for AutoCodeRover's failing-test row denotes the paper's evaluated issue workflow using this option, not a numerical claim reproduced here; only its method section was inspected. Documentation features are not evidence of repair improvement. A named file or generated test is a targeting mechanism, not evidence that future behavior is already known. The sources' broader features exceed our four questions; none of these inspected deliveries is verified as silent runtime Q1.

## What would anchor each case?

| Case | Required anchor / availability of test→code map | Public prevalence in agents' work |
|---|---|---|
| Failing test | Known command/test identity; fresh trace available in existing lab tasks. Stored per-test coverage can serve stale-checked lookup. | Unknown. Selected bug benchmarks are not a representative frequency survey. |
| Reproduction script | Executable command plus failing assertion/symptom; can trace without a suite map. | Unknown. |
| Log-only error | Recorded frames alone provide observed locations, not all executed functions. Need a reproduction, retained execution trace, or applicable test→code map. | Unknown. |
| Named function/file | Source identity plus tests that cover it. Map absent in many repos; must build or report missing. | Unknown. |
| Review | Diff/revision plus relevant test→code map or fresh runs; old map needs invalidation. | Unknown. |
| Feature | Existing entry point or nearest test is only a proxy for future behavior. New execution/specification required. | Unknown. |
| Few/no tests | Runnable script/session, or newly built tests. A nonexistent map cannot be looked up. | Unknown. |
| Slow code | Representative workload plus timing/profile evidence. Coverage says reached, not where time went. | Unknown. |
| Coverage gap / test generation | Current instrumented runs plus source; uncovered points can guide tests but not prove missing behavior. | Unknown. |

Existing maps: Wallaby explicitly maps lines to tests; Coco associates coverage points with executions/tests. Python dynamic contexts map test identities to lines. Supercov documents per-test attribution for specific runner adapters, with aggregate fallback. coverctl's multi-language coverage support alone does not establish per-test attribution. None establishes a universally installed, current map.

## Recommendation

No source inspected supports ranking cases by population prevalence, so there is **no evidence-backed pair of “least covered and most common” cases** to recommend. Log-only and future-feature rows have especially weak anchors in this set; empty cells do not make them promising Box cases.

First remain with the **failing test**, as the later narrowing requires. Facts for this case exist elsewhere, but the silent delivery combination remains unverified in the inspected set, so the condition for widening (“the Box has been done”) has not been established. For later only, a **reproduction script** is the nearest engineering extension because it has a runnable anchor. It is already covered by runtime tools and is not a demonstrated unmet or common opportunity. Do not widen implementation in this session.
