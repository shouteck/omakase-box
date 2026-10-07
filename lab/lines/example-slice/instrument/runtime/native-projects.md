# Native TypeScript development adapter: not admitted

This worker inspected only ky823 base package.json, tsconfig.json and tsconfig.dist.json as public development data. The partial zod5599 extraction did not contain package.json, so no zod configuration was inferred. No project AGENTS/CLAUDE instruction file was read. No new check, dependency installation or native runner was executed in this delegated step.

The ky base uses ESM, AVA `extensions.ts=module`, `nodeArguments=[--import=tsx/esm]` and `workerThreads=false`. Its tsconfig extends `@sindresorhus/tsconfig` and enables exactOptionalPropertyTypes. Its distribution config enables sourceMap/inlineSources, with source root `source` and output `distribution`. Its complete npm test script also runs xo and a build; a behavioural test-only command must be declared separately, never described as the whole project test command. The adapter leaves every project configuration file unchanged and does not transpile to CommonJS.

Run native capture inside the existing bounded container, with writable output only at /record. Add the following environment settings through a declared container-local wrapper (the generic runner currently freezes its own environment):

```
LAB_NATIVE_CAPTURE=1
NODE_V8_COVERAGE=/record/v8
NODE_OPTIONS=--enable-source-maps --import=/opt/instrument/native-typescript.mjs
```

Then invoke the project's actual AVA/vitest executable with its unchanged native loader/configuration. AVA must retain its registered tsx/esm import. Every spawned Node process needs the same preload and V8 directory; an absent worker capture becomes unknown. The capture file stores inspector script IDs, native generated bodies and hashes without rewriting source or intercepting the loader. Extraction reads the actual V8 source-map-cache and validates it against the script's embedded inline map or a local immutable map:

```
node /opt/instrument/native-typescript.mjs extract /record/v8 /record/native
node /opt/instrument/native-typescript.mjs --hostile-check
```

After static sceptic feedback, the author ran the cheap hostile checks and 12 original-syntax known answers on the host. Both passed, as did Node syntax validation. The first hostile run exposed platform-dependent file URL conversion; Linux container URLs now use explicit POSIX conversion and the corrected rerun passed. Local TypeScript is 6.0.3; source-map is unavailable locally, so actual SourceMapConsumer mapping and native extraction remain unexecuted. These are calibration checks, not native runner evidence.

Hostile checks attack changed original/generated content, differing map data, sources outside the mounted snapshot, external-map-relative source bases and sourceRoot separators. The extraction uses generated JS syntax statements and the most-specific V8 range, then requires the exact mapped original column inside executable syntax. It excludes function-declaration headers (which would confuse module initialization with execution of a dead function body), erased type imports/exports, interfaces, types, ambient declarations and empty scaffolding. Value imports and reexports are eligible statements; their reachability also remains the separate existing compiler-graph adapter, including its type edges. Executed generated candidates lacking a recognized source mapping become explicit unknown counts rather than silently empty E. Strict source mapping can undercount unsupported transformations, so native fixture known answers and complete unknown review are mandatory. Missing maps, missing inspector scripts and generated parse failures become explicit unknowns. Indexed maps and maps outside the immutable snapshot are unsupported. Local external-map source paths resolve relative to the map's location, with sourceRoot applied before resolving the source name. A process killed before its exit hook will have missing capture, not a measured empty file. Worker threads sharing a PID are not yet calibrated; no claim of vitest thread-pool readiness is made.

Minimal instrument dependencies remain TypeScript 6.0.3 and source-map 0.7.6 in the image plus built-in Node inspector. Ky's separate native dependency preparation needs AVA 5.3.1, tsx 4.20.6, inherited @sindresorhus/tsconfig and the test's actual imported packages (for example express, body-parser, busboy, pify, delay and raw-body). The base manifest ranges are not exact resolutions: freeze the dependency image's package lock, all resolved package versions, image digest and base manifest/config hashes before admission. Do not execute ky's prepare hook. The baseline declares TypeScript ^5.9.3 for its own build; the instrument's 6.0.3 AST parser is not evidence that its project build uses that version. Zod's complete manifests and native vitest configuration must first be extracted and inspected, then dependencies and worker model registered. Neither project is admitted by this code.

Prior predictions are in native-predictions.md. Root owns existing runtime files and integration; only native-typescript.mjs, this document and native-predictions.md were added here.
