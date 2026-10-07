# Research brief for the CTO

8 October 2026 — Box trial, Gate 0. The owner's open Box decision governs. Full reading and source checks: [Gate 0](lines/box-trial/gate-0.md).

| Reading | What shrank; denominator | Repair/time/cost result and limiting condition |
|---|---|---|
| Stubbifier; 15 Node packages, 75 clients | Files/functions; initial production bytes including dependencies: 56% mean static reduction, **31% dynamic** | Runnable through original-code retrieval; no repair/token trial; expansion can erase savings |
| Program Reduction; 47 selected Java bugs | Production lines retained 2.2–18.3%, mean 6.6%; tests 2249→56 | 80→<18 min headline mainly test reduction; sliced source loses 11/12 baseline fixes; slicing itself takes hours |
| CausalRepair; 483 single-function Java cases | Test/source statement skeletons for prompts; no aggregate repository/context size ratio | 313 correct/365 plausible; 25-candidate budget, perfect localization; 232 correct with automated localization; reported 23.28 min and $0.029/bug, no total-token comparison |
| Context Granularity; 109 known single-line Java bugs | Slice 47,766 vs file 331,383 context tokens (14.4%); **method smaller still** | Slice 22 correct/28 plausible; file 28/47: 79% precision does not mean more bugs fixed |
| Zhang ICSE03 / PLDI04; C SPEC | Instruction/statement sets; PLDI mean slices ~1.8–40.7% of unique executed statements | No agent repair; small queries exclude preprocessing; graph compression is not source reduction |
| Zhang ESE06/07; 19 real C faults | Fault-containing sets 0.45–63.18% of executed lines, 0.04–8.52% of program LOC | Data slices capture 12, full slices needed for 7; absent output needs forward slicing; no automated repair |
| Beszédes union slices; three C programs | Mean union 15%, static 72% of executable lines | Not necessarily runnable; finite tests give no safety guarantee; no repair/token trial |

**Gate 0 PASSED:** the reading leaves the open Python packaging versus pstack scope question worth measuring, and narrows Gate 1 to size, fix-function inclusion and ordering with the existing tracer; it does not predict Gate 1's outcome.

Reuse tracing and source skeletons; defer runnable stubs. The named work establishes neither native TypeScript Stubbifier support nor a verified Python counterpart. Fix sample, denominator and ordering first; count overhead, missed functions and module-level edits; keep the test-package+dependencies denominator beside repository size. The owner-set pass is at least half below one tenth of repository source and naming every real-fix function. Preserve test setup and intent comments. Historical patches score only.

Gate 3 must count all brief-writing/helper tokens and record necessary searches outside the Box; both arms already have the failing test and error trace. A fresh reader confirmed two papers independently. No experiment or repair-agent run occurred. Gate 1 has not begun; this session stops here. Other lines remain paused. Nothing needed from the kitchen.
