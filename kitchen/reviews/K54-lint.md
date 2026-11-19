# K54 promise lint

## Choice and first run

Read on 19 November 2026:
- https://eslint.org/docs/latest/use/configure/configuration-files
- https://typescript-eslint.io/getting-started/typed-linting/
- https://typescript-eslint.io/rules/no-floating-promises/
- https://typescript-eslint.io/rules/no-misused-promises/
- https://typescript-eslint.io/rules/await-thenable/

ESLint 10.14.0 (30 October) and typescript-eslint 8.72.2 (9 November) were the newest stable registry releases older than the workspace's 10080-minute minimum on this host. Root development dependencies only; install succeeded with pnpm 10.34.5. Flat config, no presets, projectService uses the existing root tsconfig; no files outside a tsconfig were reported.

First run: no-floating-promises 0, no-misused-promises 2, await-thenable 0. Three consecutive wall times including the pnpm launcher: 3.533, 3.336, 3.330 seconds (all exit 1 for the same two findings). Linux shared host; no hosted duration inferred from these observations.

## Findings

| Rule | Real faults | Noise | Suppressed |
| --- | ---: | ---: | ---: |
| no-floating-promises | 0 | 0 | 0 |
| no-misused-promises | 0 | 2 | 2 |
| await-thenable | 0 | 0 | 0 |

Both findings kept with next-line suppressions in the per-rule commit:
- `packages/box-platform/src/local.ts:45`: Node HTTP listener intentionally returns no value to its caller; it awaits the request work and sends the response, catching request failures.
- `packages/box-platform/standin/standin.ts:188`: local test GitHub HTTP listener sends its own response; the returned promise is not a boolean or data value. Request-stream failures remain an existing limitation of this fixture, not a deployed Worker dropped write.

No deployed Worker findings; `worker.ts` passes background work to `context.waitUntil` through `defer`. No behaviour changed and no behavioural fault claimed fixed. Suppressed does not mean clean.
