# Status

Updated by the CTO on 17 October 2026 at the BT12 close.

## Now

- **BT12 Part A merged** (`155f3da`; PASS test-verified after one FAIL-and-correction round; finished by Claude Code). The bounty tool is one npm package: a single bundled file, 0 dependencies, no install scripts, about 103 KB; `npx` runs it with no install; Node 22 or later, checked at start with a named refusal. Hosted run green on Linux **and** on Node 22. The owner dropped the live demo (17 October 2026). **Part B, publishing, is the owner's decision and was not done**: the name `box-bounty` is free but unreserved; until it is published, the instruction-file install line is held, because an unpublished name in an agent-executed line can be claimed by anyone.

- **BT26 merged** (`44852b9`; PASS test-verified after one correction round): the six leftovers the BT18–BT25 passes named are closed, including the `.git`/`.box` any-depth refusal extended to 8.3 aliases (`GIT~1`), one `baseCommitOf` reader, the merge-message pin, rejoined comments, value-before-help parsing, and a JSON/text label-agreement tripwire proven non-vacuous.
- **K24 merged** (`5fab0bb`; PASS test-verified, the pass reran a full suite itself): no test runs above half its limit — nine journeys now share one built world per split (`sharedFixture`/`sharedPostedFixture`), `bt6b.test.ts` split four ways (40 % of suite wall → 3 %), bounty suite ~630 s → ~490 s. And a verify run dirty only in paths a step does not read counts for that step: wave-file edits mid-verify no longer cost a rerun — the wave's own close proved it (`+dirty` run reused, 17–83 s instead of ~860 s). The dirty-tree *launch* refusal still holds.
- Kitchen carried forward: packaging card — `realpathSync` does not expand 8.3 names; evidence card — re-measure after test-structure changes, and the shared-world journey pattern.
- No real bounty, payment or owner-settings change; all scratch and wave branches removed; temp swept.

## Next

Nothing is in flight. This run's remaining named wave is **BT27** (split `github.ts`, zero import cycles). Also briefed and waiting: **K25** (the tool's memory for agents). Owner decision open: **BT12 Part B**, publishing `box-bounty` to npm.
