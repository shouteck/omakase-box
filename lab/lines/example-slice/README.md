# Line A: a slice anchored on an example

**Stage:** instrument, session 4, 7 October 2026. Runtime instrument built and run on two development cases (Click 3208, Ky 823), reviewed by two fresh sceptics. Zod has no adapter; images and allowlists are not frozen; confirmation content stays closed. The replay itself has not run.

**Problem:** choose a small portable work package before a solver has solved the task, with no second request for missing context.

**Current answer:** a failing example is a useful anchor, but preserving its current behaviour, containing edits and providing everything a solver needs are separate claims. The programme's unrestricted assertion is false for an existing-code-only region; a state/directory-inclusive model or restricted repair language remains possible. New files and previously unused helpers require explicit treatment. Real-world frequency and package size are unknown: no real change replay has run on this line.

**Metric for the next stage:** per frozen task/rule, containment of existing production edits, treatment of new paths, source file/byte disclosure, clean build and same observed failure, and needed reading context. Full historical patch containment is not synonymous with the existence of an acceptable repair. Bugs, extensions and wholly new work stay separate.

**User consequence:** a Box may eventually offer an empirical coverage statement for a stated task class. It cannot yet promise that every repair is possible inside it, or that an example passing means the owner's whole request is satisfied.

- [Survey](survey.md)
- [Sources and access limits](related-work.md)
- [Executable attacks and prior predictions](attacks.md)
- [Notebook](notebook.md)
- [Independent sceptic review](sceptic-survey.md)
- [Replay formulation and freeze](replay-protocol.md)
- [Formulation sceptic review](sceptic-formulation.md)
- [Frozen candidate metadata](replay-1/candidate-metadata.json)
- [Instrument foundation and rerun instructions](instrument/README.md)
- [Session 3 registered checks and results](instrument-session-3.md)
- [Instrument sceptic review](sceptic-instrument-3.md)

**Formulation result:** four file rules (execution, execution plus imports, module reach from the example, whole registered source root), separate failure/edit/new-path/context scores, explicit primary versus expanded packages, and a 25% file-and-byte operational size threshold. The threshold is a lab choice, not customer evidence. Public metadata yields 60 candidates across ky, zod and click, of which 45 are confirmation; itsdangerous has zero in the fixed window. Therefore this cohort cannot meet its four-project positive screen. Do not substitute a project or alter the window to rescue that result.

**Instrument progress:** deterministic checks distinguish E/EI/R/G and reject thirteen false primary-row passes. Five development ingestions have accepted-commit validation receipts; three have no changed test-family paths and none is admitted or executed. Sceptic attacks corrected provenance, malformed-root disclosure and dynamic-code detection defects. This validates mechanics, not actual trace collection or containment rates.

**Session 4 result, development cases only:** no rule gives a small package on either case. Executed files are 14 of 17 source files on Click and 14 of 24 on Ky; adding imports, or reaching from the test, or taking the whole root, all give the whole root on both. Ky's executed-files package does not load. Where a package loads, the failure reproduces and the fixed source passes. The full historical change never fits because it also edits a changelog or readme. Two cases; not a rate. [Record and standing](instrument-session-4.md), [both sceptic reviews](sceptic-runtime.md), [records](instrument/runtime/records/README.md).

**Next:** freeze and keep images by digest; decide whether configuration files are editable; calibrate or refuse zod; then the confirmation freeze. The CTO should first weigh the brief: Click and Ky look unable to show a small package at file granularity, so the frozen cohort may only be able to return "no demonstrated promise". Line D can take the execution-plus-imports package for these two projects now, knowing it equals the source root.
