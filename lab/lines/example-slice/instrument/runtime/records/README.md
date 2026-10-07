# Runtime records

Session 4, 7 October 2026. Development cases only: `pallets/click` 3208 and `sindresorhus/ky` 823.

**In Git:** `results.json` (compact: every full-repository cell, each rule's files, sizes and expansions, all 96 sealed observations), each run group's `progress.json` and `summary.json`, `archive-validation/`, and `raw-manifest.json`.

**On disk only, ignored by Git:** 819 raw files, 187 MB: per-run stdout and stderr, strace file traces, coverage data, V8 coverage with generated script bodies, and the full `selector-analysis.json` files. They are on the owner's machine in this folder. `raw-manifest.json` lists every one with its size and SHA-256, so a copy can be checked. A clone of the branch does not have them; rerunning the drivers on the recorded image and snapshots regenerates equivalents, with new timestamps.

`node lab/lines/example-slice/instrument/runtime/records-manifest.mjs` rebuilds `results.json` and `raw-manifest.json` from the raw files.

| Folder | What it is |
|---|---|
| `click3208-full` | First attempt, aborted after one cell: the three modes differed in the printed test duration. Kept as a failure |
| `click3208-full-corrected` | 12 cells (example and guard, base and fixed, three repeats), three modes each |
| `click3208-sealed` | 48 sealed-package observations |
| `native-calibration`, `-canonical`, `-helpers` | Three attempts at the authored native TypeScript fixture: 6 unmapped statements, then 2, then none |
| `ky823-native-base`, `-no-cache`, `-cache-tmpfs` | Three single base attempts. The first two carry a second failure (no writable cache folder) and 17 unmapped statements; the third adds an in-memory `node_modules` mount and has none |
| `ky823-full` | 12 cells, three modes each |
| `ky823-sealed` | 48 sealed-package observations |

Images used are recorded per run by ID. They were built locally and are not pushed anywhere; the Debian packages inside are whatever resolved at build time. The image named in every Click record (`6e06bad04a13`) no longer exists; the Ky image (`6665c4ae169a`) does.
