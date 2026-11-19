# Windows payment-page synchronization

## Brief

Investigate hosted verify 44528722243, compare BT67 and the last green Windows run, and make the payment-page journey deterministic without raising a timeout. No production operations or payment-state changes outside local fixtures. Push a new devin branch; no PR.

## Evidence

- Failed Windows run 44528722243: `pages.test.ts (70 tests | 1 failed) 62531ms`; the owner/payment test took `2915ms`. At line 336, `Matcher did not succeed in time`, with the unchanged payment window rather than an API error.
- Last green Windows run 44521850557: `pages.test.ts (64 tests) 62826ms`; the same journey took `2319ms`. This run already included BT67. BT67 changed payment eligibility (`head_on_default_at_sight`), not the window's click handler. The failed window still offered the correct eligible payee, amount and methods. Between that green BT67 head and the failed master head, the platform source changes were PF41's unrelated board component and page tests.
- `expect.poll` defaults to 1000 ms (installed Vitest implementation). Playwright's click waits for actionability, not completion of the handler's asynchronous POST. The test started that 1 s render poll before the POST completed.
- Local fault injection held a successful POST response for 1200 ms. The unchanged assertion reproduced the hosted expected/received text exactly: `Recorded: you paid example-quill $45` versus the unchanged `Pay example-quill` window; `1 failed | 69 passed (70)`. This demonstrates a reachable test race, not a Windows path/SQLite regression. The hosted logs do not include request timestamps or a browser trace: that the historical failure specifically exhausted its budget awaiting this response remains an inference, not a measured fact.
- Cancellation: workflow concurrency is `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`. Master run 44526583726 started 12:43:46; its Windows log says `The operation was canceled` at 12:57:29, immediately after successor 44528722243 started at 12:57:28. Run 44523682152 similarly cancelled around 12:28:56–12:29:01 after successor 44524247626 began 12:28:47. This supports superseding pushes, not a payment-test hang. Not every cancelled run's logs remained available.

## Changed expectations

- The owner/payment journey waits for the exact POST response, asserts HTTP 200, then retains the existing rendering assertion and 1 s polling budget. A one-shot 1200 ms response delay pins the race; it is fault injection, not the synchronization mechanism. No expected payment words, timeout settings or product behavior changed. Existing browser coverage exercises no-payment/closing and error cases elsewhere in the same file.

## Checks

- A name-filtered run could not exercise this journey independently: it depends on methods installed by the preceding browser journey, and timed out waiting for the absent button. The full file with the injected delay reproduced the original assertion failure.
- Initial requested verify refused uncommitted changes before executing checks; commit first, then run `node scripts/verify.mjs --full --fresh test:platform`.
- Principle used: `principle-fix-root-causes`: inject latency to reproduce the race; synchronize on the actual operation instead of extending a timer.
- Windows execution and visual review are not performed on this Linux host.

## Results

On commit `f17ad220`, `node scripts/verify.mjs --full --fresh test:platform` ran check/build/lint successfully and reported:

```text
 Test Files  21 passed (21)
      Tests  492 passed (492)
   Duration  49.59s (tests 96%, import 3%, transform 1%)
```

This includes all 70 tests in `tests/platform/pages.test.ts`, with the deliberately delayed successful response. The verify reporter prints suite totals rather than passing file names. Chromium was installed into the suite's configured browser path; browser tests ran, none skipped.

Verify automatically selected kitchen tests and failed the demo recorder (`the replay itself exited 1`). Running that local stand-in replay directly identified the environment cause: `status refused (repository-destination-mismatch): a Git URL rewrite sends this repository to a different destination`. No repository/global Git configuration was changed. Using the documented neutral HOME, `HOME=/home/ubuntu/kitchen-home node scripts/suite.mjs kitchen` reported:

```text
 Test Files  26 passed (26)
      Tests  207 passed (207)
   Duration  41.83s (tests 97%, transform 2%, import 1%)
```

The initial whole verify remains a failed invocation, not a claimed green acceptance run. No unchanged passing suite was rerun. Subsequent edits only record this evidence.
