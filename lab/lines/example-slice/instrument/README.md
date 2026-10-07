# A-replay-1 instrument foundation

Session 3, 7 October 2026. This is a checked ingestion/scoring unit, **not the complete replay instrument or the confirmation freeze**.

## Reproduce

From the lab checkout, Node v24.11.0 and the existing TypeScript 6.0.3 dependency:

```
node lab/lines/example-slice/instrument/check.mjs
```

This uses only built-in assertions, in-memory known-answer fixtures and saved candidate IDs. It makes no network request and executes no downloaded project. The fixture source strings are lab-authored. Its expected rule sets distinguish execution, imports, unexecuted helper reach and directory inclusion; the last includes runtime data too. Checks also attack disclosure fractions, unknowns, authority, path portability and the primary row screen. It is measurement calibration, not empirical task coverage. check-results.json records one final author run and source hashes; the sceptic separately reruns it.

Collect a development ID once (authenticated public GitHub read access needed):

```
node lab/lines/example-slice/instrument/collect-development.mjs sindresorhus/ky 823
node lab/lines/example-slice/instrument/verify-development.mjs sindresorhus/ky 823
```

Existing snapshots and receipts refuse overwrite. To independently recheck a saved snapshot against the accepted commit without writing:

```
node lab/lines/example-slice/instrument/verify-development.mjs sindresorhus/ky 823 --check
```

The collector gates every ID against the immutable candidate partition before a network request. It reads accepted commit/first-parent metadata, then filters the accepted comparison to registered test-path families before exposing API output. The GitHub CLI receives the full HTTP comparison response transiently and applies client-side jq filtering; production paths/patches are not emitted to the agent or saved. This is model/snapshot blinding, not transport-level exclusion. It verifies raw Git blob SHA1 and byte length. Cross-family renames are refused without emitting the prior production path; ordinary test renames become delete+add. A comparison with 300 returned files is conservatively unsupported because it may be truncated. Test content is not run. A test-path match alone does not prove fixture content is test-only: review remains necessary.

The first ky823 and click3186 provisional snapshots were collected from PR-head test blobs before the provenance defect was identified. Kept immutable; separate accepted-validation receipts show that their exact path/action/blob sets match the accepted first-parent change. This preserves the original record rather than retroactively rewriting it.

## Interfaces and limits

core.mjs takes a regular-file tracked manifest with raw byte counts, a parsed module graph, three independently verified executed-file lists, visible example entry modules and endpoint inputs. It computes the four sets, exact disclosure path denominators and row scores. It cannot authenticate the truth of supplied trace/failure/context/authority inputs. Adapters and independent review must do that. A missing graph row is `unparsed`; missing/dynamic/external/ambiguous edges remain explicit rather than silently becoming an empty graph. E and G do not promise dependence completeness.

typescript-graph.mjs parses in-memory base+overlay text using the compiler API and resolver, without loading project modules/plugins or reading the host filesystem. It includes type imports, reexports, literal dynamic imports and require; flags nonliteral imports, ordinary direct/indirect/property eval and Function syntax. Computed aliases and generated code are not solved by this heuristic. Resolver options may be supplied from a future verified base-tsconfig adapter; its current default Bundler/ESNext options are fixture settings, not a frozen project adapter. It has not been checked on complete base trees from these libraries.

Paths reject traversal, absolute paths, symlinks and case collisions, as well as Windows ADS/reserved/trailing-dot aliases. This is deliberately a narrower portable-path domain than POSIX permits. The source universe remains the protocol's eight extensions; other languages appear only in total disclosure. The primary screen uses the raw condition; extra production expansion remains diagnostic. This unit scores rows, not the four-project cohort decision or an actual solver.

## Gate still closed

Python AST resolution; actual Python/Node coverage and verified TS source maps; syscall/file/directory tracing; isolated export/replay; base dependency setup and project allowlists; container image digests; failure-identity schemas and guards; pre-fix requests; final task admission and manifests are **not ready**. No confirmation content may be opened until the complete development supplement and implementations are committed and checked. No project executed in this session, no new dependency installed, no heavy job or paid service used.

Technical sources consulted: [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [GitHub commits API](https://docs.github.com/en/rest/commits/commits), [Node coverage documentation](https://nodejs.org/api/cli.html#node_v8_coveragedir), [Python AST documentation](https://docs.python.org/3/library/ast.html). Only the compiler/API reading informed this unit; coverage/AST reading is preparation, not implementation evidence.
