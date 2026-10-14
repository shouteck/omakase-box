# Status

Updated by the CTO on 14 October 2026, at the K16 close.

## Now

- **K16 merged and pushed** (`c0bc1f3`, merge of `wave/K16` tip `747fddd`; reviewed commit `00b3ab9`). The kitchen can now film itself: `node kitchen/demo/record.mjs` runs the BT11b journey for real in the sandbox and leaves a video a person can watch — `kitchen/demo/runs/real-2026-10-13-19-49-07/demo.webm`, 1280x800, ~1:52, ~12.8 MB. The viewer sees each command and its real output, the real GitHub pages as they are created (issue #22, PRs #23/#24, all sandbox-only), a "who is acting" line before every step, and a closing card naming what the run left on GitHub. No screen, cloud session or extra token needed — a windowless Playwright browser records a page that shows the replay's output.
- **Checked:** pass **PASS, test-verified** on `00b3ab9` after one FAIL round. The first recording silently ran a stale pre-BT11b `dist`; the fix rebuilt, re-recorded, and re-checked every caption against the new transcript — issue #22 carries the v3 block and `pay-to:` instruction (verified live with `gh`), `look`/`status` show the pay fact per solution, `apply` prints the owner pay message, `hook finish` repeats it. Verify green on `00b3ab9` (`verify 00b3ab9 PASS check=0 build=0 test:kitchen=0 db=embedded 179s`, pass's own foreground run). All 16 stills and the transcript audited against the live sandbox; hostile `PAGE`-line and URL probes all refused — only sandbox addresses are ever navigated.
- **Evidence without watching:** beside the video the command writes 16 stills, the full transcript and a step index; `kitchen/demo/bt11b-real-transcript.txt` and `bt11b-real-index.md` are committed as text. Three fresh-agent reads of the stills + index described the product, the actors and the owner pay message correctly (verbatim in [waves/K16.md](waves/K16.md)).
- **Left on GitHub (sandbox only):** closed issue `#22`, closed PRs `#23`/`#24`, solver branches `solver-a/solver-b-bt-baf2712b00b4`, label `box-bounty`; scratch ref deleted, sandbox `main` untouched. Earlier runs' leftovers listed in the Result. `kitchen/demo/RECORDING.md` now names this command as the usual way; the cloud session is only for a filmed desktop.
- **Limits:** webm only (no converter present; plays in browsers and VLC); GitHub pages render logged-out; stills/transcript carry `C:\Users\shout` paths (same name as the public login); one legibility slip in a UX read (2-char sha truncation). The ignored `kitchen/demo/runs/` folders stay on disk as the audited evidence.
- Whether the video is published anywhere (README, release, the sandbox) is the owner's decision — no wave does it.

## Next

Two waves are briefed and ready when named, in this order:

1. **BT11c** — the reward becomes per repository and part of `allow`; the shared reward BT11a wrote is applied to nothing ([waves/BT11c.md](waves/BT11c.md)). Owner's decision, 14 October 2026.
2. **K17** — corrections to the demo, which then shows the owner's one command ([waves/K17.md](waves/K17.md)).

**Found on 14 October 2026 and not yet put right:** K16's real runs wrote a $5 reward and a $50 limit into the owner's own settings file, for every repository; resetting it is the owner's own command (`box bounty config set reward 0`). K17 stops the demo touching that file.

No wave is named and none is briefed. Ready when wanted: publishing the demo where the owner chooses, or the Devin Cloud desktop recording (`kitchen/demo/RECORDING.md`) if a filmed desktop is wanted after all.
