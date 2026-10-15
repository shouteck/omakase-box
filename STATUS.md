# Status

Updated by the CTO on 15 October 2026 at the BT16 close.

## Now

- **BT16 completed.** Reviewed commit `cd99825`, independent PASS ui-verified; merged `d04a072`. A checkout whose remotes name several GitHub repositories — the fork workflow — now resolves through the owner's list: exactly one listed candidate is the repository, several listed refuse `repository-several-allowed`, and an unlisted checkout waits naming each candidate's `allow` command. Non-GitHub remotes and pushurls are ignored entirely; `repository-address-ambiguous` is retired. Pushes still go only to the chosen repository's canonical URL, and `post` now requires `permissions.push` first (`github-push-denied`).
- Exact clean acceptance: `verify cd99825 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 741s` — 494/494 bounty, 142 package with six existing skips. The pass re-ran bt16 and bt8a (45/45) and replayed BT8a's probes plus six of its own (65 checks, no yes reaching a second repository); cold fork and mirror journeys posted only to the chosen repository.
- The wave hit its designed K14 stop: rule 6's remote read cost +1 Git start on `describe` and five `status` legs. The CTO authorized rebaselining exactly those six ceilings inside the brief; measured counts are in the wave file.
- Flakes seen under load: the known `report.test.ts` 30 s verdict-word timeout, and `bt11` promise-lock 15 s (7.8 s alone) — both green on rerun, recorded in BACKLOG.md.
- No real bounty, payment, owner-settings change or solver-code execution. All wave scratch removed; the close sweep found none of the kitchen's named temp leftovers.

## Next

This run cooks **K20**, **BT17**, **K21** in that order, then stops and reports. K20 measures the tool against command-line conventions; BT17 shortens command output on K20's findings; K21 reviews the architecture last so it sees the final state. No wave is in flight.
