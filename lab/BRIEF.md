# Research brief for the CTO

8 October 2026 — Box trial, Gate 1. [Full result](lines/box-trial/gate-1-result.md); [fixed plan](lines/box-trial/gate-1-plan.md).

| Measurement | Result |
|---|---|
| Fixed public benchmark tasks | 30 across six large Python repositories |
| Confirmed successes / failures / unknown | 0 / 23 / 7; fifteen successes required |
| Lean packaging / production Python source | 27.8%–55.6%; median 38.9%; none below 10% |
| Lean packaging / all tracked Python | 11.1%–35.4%; median 20.2%; none below 10% |
| Every real-fix function/edit named; bodies retained | 19/23 admitted for both; four misses introduce new functions |
| Unknowns | Two Matplotlib timeouts; five SymPy subprocess traces incomplete |
| Independent check | Three selected packaging reruns match exactly; fresh native test run under review |

**Gate 1 FAILED:** even all seven unknowns succeeding cannot reach fifteen, so this runtime plus import-closure packaging stops before Gate 2.

This conservative method traced whole modified test files and included their local import closure. It does not settle narrower failing-test-only packaging, repair success or token savings. No repair agents, paid services or product changes. No transfer to the kitchen; owner and CTO decide from these numbers. Other lines stay paused. Nothing needed from the kitchen.
