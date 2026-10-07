# Development runtime instrument

Only lab-authored calibration is implemented here. No confirmation input is authorized by these scripts. `predictions.md` precedes execution. The existing pure selector remains unchanged.

## Run the real fixture

Before building, run the kitchen busy gate and proceed only on `idle`. Build sequentially with this directory as context:

```
docker build -t lab-a-replay-1 lab/lines/example-slice/instrument/runtime
node lab/lines/example-slice/instrument/runtime/fixture_case.mjs <new-absolute-lab-a-replay-1-case-directory>
```

The fixture command prints a run specification. Save it to a new JSON file, add `outputDirectory` pointing outside the case directory, and run:

```
node lab/lines/example-slice/instrument/runtime/runner.mjs <spec.json>
```

The runner mounts only this synthetic case read-only, resolves the actual image ID, bounds CPU/memory/pids/time, disables network and capabilities, uses uid 1000, and writes only tmpfs outputs. It copies raw artifacts out before deleting its own named container. `run.json` preserves inputs, image ID, command, raw output, timestamps, status and hashes. An exclusive temp-file lease prevents simultaneous runs through this runner; stale leases fail closed and require recorded diagnosis rather than automatic removal. Container failures and fixture failures retain records. The read-only bind makes every packaged input immutable during measurement, including tests and authority files. A later solver workspace must independently enforce the recorded per-file authority and pristine hashes.

## Adapter boundaries

`python_adapter.py graph` reads `{contents,roots}` JSON on stdin, parses AST without executing modules and returns core-compatible graph edges. Roots must be declared before selection. Package initializers and `from package import submodule` are included; unresolved imports, ambiguous roots and dynamic import/eval remain explicit. It does not resolve arbitrary import hooks, runtime sys.path mutations or namespace-package semantics completely. The coverage mode consumes coverage.py 7.10.7 JSON absolute `/case/tree/` paths and emits only files with executed measured lines.

`typescript_adapter.mjs transpile` emits CommonJS ES2022 files, exact source maps and source/generated/map SHA256 receipts. `extract` validates these against unchanged source, maps actual JavaScript statement starts whose innermost precise V8 range executed, and requires an original executable statement on the mapped line. Blocks, type declarations, erased imports, empty exports and comment-only files do not seed E. The original compiler graph adapter remains the import graph. This transpile adapter is frozen for authored fixtures; native AVA/vitest/tsx loader maps and complete project compiler settings require a verified adapter before third-party admission. Transpilation is not typechecking.

`trace.mjs` parses `strace -f -yy -s 65535 -e trace=file,getdents64`, retains raw directory/existence/absent observations, distinguishes non-source inputs from production expansion, and surfaces split/unparseable calls as unknown. It assumes the declared working directory `/case/tree` for unannotated AT_FDCWD; commands changing cwd must supply annotated records or be refused at admission. It records observed directory entries as syscall state, never inventing placeholder file bytes. A caller must verify directory-state parity on export and treat unresolved reconstruction as unknown, not success.

`package.mjs exportCase` consumes verified raw snapshot buffers and frozen common allowlists. It refuses unknown base paths, symlinks in the runner and production source in common packaging. It exports primary and expanded variants separately, overlays immutable tests, and records hashes/authority. It has no owner-checkout fallback. The caller provides the frozen project test-family predicate. Immutable allowlists and overlay snapshots remain the caller's admission responsibility. Dependencies reside in the image; a project may explicitly create container-local node_modules links to `/opt/labdeps/node/node_modules`, never host sources/caches. Third-party dependency preparation is a separately recorded image build with install scripts disabled; Python build backends are not assumed script-free.

## Readiness

At authoring, no container fixture has been run by this worker; no passing runtime claim is made. Root coordination may record actual executions separately. Dockerfile pins the requested Node base and package versions, but Debian apt transitive packages are build-time resolved; record final image ID and versions before a freeze. Per-project dependency images, failure identity schemas, base tsconfig mapping and real development replay remain admission gates. No production fix or confirmation case was read.

Principles read and applied: Model the Domain made core versus expansion separate recorded sets; Prove It Works requires actual container fixture evidence before a runtime readiness claim. Feature playbook compatibility maps delegation to this sole code owner and independent root/sceptic review; architect exploration is skipped because the protocol already fixes coverage/graph/syscall mechanisms. Shared writes are serialized; parsing/adapters are the smallest safe decomposition under one owner.
