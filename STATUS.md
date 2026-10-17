# Status

Updated by the CTO on 17 October 2026 at the BT27 close.

## Now

- **BT27 merged** (`e8c93bc`; independent PASS, test-verified). GitHub work is split into client, publication planning, posting, collection and closing modules, with shared notice helpers in a leaf module. `github.ts` is eight lines of re-exports. Complete import cycles fell from 18 to zero, including inline type imports and re-exports.
- All 87 moved declarations and 135 moved/nested function bodies retain their text and leading comments. The public exports remain identical: 195 from `index.ts`, 18 from `github.ts`. Tests are unchanged. The independent standard journey and 30-command raw-output capture both match byte for byte.
- Clean candidate `bcbf9aa` passed bounty (636 tests), package (142 tests; six skipped) and kitchen (83 tests). The independent pass completed its own exact-commit verification using the valid recorded steps. Implementation and acceptance finished before the original deadline; an account-usage interruption delayed the remaining journeys, verdict and close until the owner resumed the chat.
- Temporary worktree, junctions and scratch roots removed; evidence retained in the existing verify logs. The main checkout is clean on master. No real bounty, payment or owner-settings change occurred.
- **BT12 Part A remains merged. Part B, npm publishing, remains deferred by the owner.** The install line stays held until publishing. The live demo was dropped.

## Next

No wave is in flight. **K25** is briefed and waiting for the owner to name it. This run stops after BT27. BT12 Part B stays deferred until the owner resumes it.
