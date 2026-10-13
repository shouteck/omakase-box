# Status

Updated by the CTO on 13 October 2026 — master is RED off-machine; fix wave in flight before anything named.

## Now

- **Off-machine verify is red.** The BT7b and BT7c merge runs each failed the same 17 tests (`bt7b.test.ts`, `bt7b-review.test.ts`): fixture `git merge` calls carry no `user.name`/`user.email`, which this host supplies globally and the Linux runner does not. Fix wave **BT7b-ci** is cooking first — a test-environment defect, not product.

- **BT7c is done — merged and pushed** (`1ce6cc7`; PASS ui-verified on `54eaf5b`, one correction round). The bounty command surface is halved — 14 to 9: `undo`, `reply`, `remind` removed; `answer` folded into `look <n>`/`apply <n>` (they collect a PR or `--from` folder themselves, every former `answer` refusal firing before any write); `questions` folded into `status --comments`; `reject`+`withdraw` are one `close`. Every removed name refuses `command-removed` exit 3 naming the replacement; an enumeration test scans every print surface for removed names. The one real hole found in review — a legacy record's stored `outside.answers` replaying a removed name verbatim — is scrubbed in `asRecord`. Measured journeys (3 fresh agents × 2 journeys × before/after): post went 6→5–6 commands, collect 11–12→7–9; all 12 runs finished, nobody reached for a removed command. `confirm` stays until BT8.
- Master green off-machine after BT6b-ci (`2465d2c`). Earlier: BT7b `bd31c77`, BT6b `af7b4e6`.
- **K14 merged** (`0448c4f`, owner-accepted partial), K12 (`9fb21f4`), BT7a (`6043833`). `.box/limits.json` allows GitHub only; rewards $0; Apache 2.0; reminders off (the owner field stays; the `remind` command is gone).
- The lab is paused. Unmerged local branches kept for the owner: `wave/A6`, `wave/K7`, `wave/BT7`.
- About 109 `box-bt1-*` temp dirs remain in `%TEMP%` — kitchen leftovers, not on the standing deletion list; left for the owner to rule on.
- **Briefed but uncooked:** BT8 (removes `confirm` when standing rules replace it — removal, so it will gate on the owner's "go"; owner decisions of 12 October folded in at dispatch), K13 (the bounty tool on Bun — stop-or-go first step) and a possible K-wave for the fixture-world Git floor.

## Next

**BT8** — the owner's standing rules replace per-bounty `confirm`. It removes a command, so its brief will come to the owner for "go" at dispatch like BT7c's did.

Carried findings: confirm/post bookkeeping drifts the approved WIP set (`github-preview-stale`); terminal `undone`; leftover WIP blocks collection apply; unpinned lineCounts git diff; refusal/exception paths still unquoted; PR closed-by-base-deletion looks like rejection; `log` in `OBJECT_AND_REF_ONLY` is a latent pin-skip for a future `log -p`; `look` on an ended bounty after GC fails as a plain git error; `DB_CHECK_SUITES` is a restated literal that goes stale if `bootstrap` gains a live test; the K14 budget guard can't see its own spy die (`≤`-only assertions — a positive-count anchor would close it); `child_process.fork` is an uninstrumented spawn seam. From BT6b: solver-planted operand words invisible at preflight (`find -exec pwn` + planted `pwn`; `rundll32 x.dll,f` comma syntax); conservative over-refusals recorded. From BT7b: version probes cost +1 spawn per command (`git version`/`gh version`); `git-too-old` reports major.minor only; a scan-close under a non-status command shows the saved-job context only in that command's output; `apply` on a clash exits 0 (established outcome semantics). From BT7c: `close --reason` lands `rejected` on any open stage including drafts (old `reject` refused pre-posted); `close` on an ended record exits 0 `already-ended` where old `withdraw` refused; unknown flags still silently ignored; agent-supplied stored text (reject reasons, resume notes) is outside the removed-name scrub by design.
