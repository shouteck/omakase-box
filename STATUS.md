# Status

Updated by the CTO on 13 October 2026, at the close of wave BT7b-ci.

## Now

- **BT7b-ci merged** (`e7ec97b`; PASS test-verified on `7587669`): the fixture `git()` helper injects a test committer identity per invocation, so the suite no longer leans on a globally configured `user.name` — the `Committer identity unknown` red that hit both the BT7b and BT7c merge runs off-machine is closed at the seam, and a product-side identity miss cannot be masked by it. Master's off-machine run on `e7ec97b` is the confirmation.
- **BT7c done** (`1ce6cc7`): the bounty surface is 9 commands; BT7b (`bd31c77`) and BT6b (`af7b4e6`) landed before it.
- **The owner rewrote BT8 on 13 October** ("one yes from the owner"): `confirm` is removed by the owner's own decision, the instruction-files work moved to `waves/BT8b.md`, and reward/pricing moved to `waves/BT11.md`. Read the brief as it stands on master — the 11-October version is gone.
- **K14 merged** (`0448c4f`, owner-accepted partial), K12 (`9fb21f4`), BT7a (`6043833`). `.box/limits.json` allows GitHub only; rewards $0; Apache 2.0; reminders off.
- The lab is paused. Unmerged local branches kept for the owner: `wave/A6`, `wave/K7`, `wave/BT7`.
- About 109 `box-bt1-*` temp dirs remain in `%TEMP%` — kitchen leftovers, not on the standing deletion list; left for the owner to rule on.
- **Briefed but uncooked:** BT8 (owner-authored, removal included), BT8b (instruction files across hosts), BT11 (the reward field and who sets it), K13 (the bounty tool on Bun — stop-or-go first step) and a possible K-wave for the fixture-world Git floor.

## Next

**BT8** — the owner allows the tool once, in their own settings folder; `confirm` is removed; a pre-post scan for secret-shaped content runs because nobody sees a preview; `setup`, a summary and an on/off switch give the owner sight and stop. Owner-authored brief, removal decided — cooking under `START.md BT8`.

Carried findings: confirm/post bookkeeping drifts the approved WIP set (`github-preview-stale`) — `confirm` is being removed by BT8, so the surviving shape is whatever post's own plan check becomes; terminal `undone`; leftover WIP blocks collection apply; unpinned lineCounts git diff; refusal/exception paths still unquoted; PR closed-by-base-deletion looks like rejection; `log` in `OBJECT_AND_REF_ONLY` is a latent pin-skip for a future `log -p`; `look` on an ended bounty after GC fails as a plain git error; `DB_CHECK_SUITES` is a restated literal that goes stale if `bootstrap` gains a live test; the K14 budget guard can't see its own spy die (`≤`-only assertions — a positive-count anchor would close it); `child_process.fork` is an uninstrumented spawn seam; `plainGit` in ordinary-tree.ts is an identity-free helper with no call sites — latent. From BT6b: solver-planted operand words invisible at preflight (`find -exec pwn` + planted `pwn`; `rundll32 x.dll,f` comma syntax); conservative over-refusals recorded. From BT7b: version probes cost +1 spawn per command; `git-too-old` reports major.minor only; a scan-close under a non-status command shows the saved-job context only in that command's output; `apply` on a clash exits 0 (established outcome semantics). From BT7c: `close --reason` lands `rejected` on any open stage including drafts; `close` on an ended record exits 0 `already-ended`; unknown flags still silently ignored; agent-supplied stored text is outside the removed-name scrub by design.
