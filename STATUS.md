# Status

Updated by the CTO on 14 October 2026, at the K18 close.

## Now

- **K18 merged and pushed** (`948e0f1`, merge of `wave/K18`; reviewed commit `fbee672`). A critique of the whole bounty flow for the agent and the owner: [kitchen/reviews/K18-flow-critique.md](kitchen/reviews/K18-flow-critique.md), one page for the owner first. No product code changed.
- **How it was run:** started on Codex, cut off midway, resumed on Claude Code. Thirteen fresh agents walked the six journeys against the built tool and a stand-in GitHub; every owner was a stand-in agent; one model family; blindness by instruction only. Every run is counted, including one abandoned and one compromised by a stand-in fault (rerun on a corrected fixture).
- **The top five:** (1) owners never learned that merging is not asked about — 3 of 3 owner stand-ins unsure, the "ask me each time" owner assumed it covered merging; (2) owner-facing text carries Git, hashes and command names, and never says what a bounty is; (3) the tool's AGENTS.md edit at close is left uncommitted; (4) `create` leaves agents guessing where the task file goes, leaves it behind, and makes poor public titles; (5) `status` buries the waiting solutions (known since K17). Further findings F6–F11, incl. two added by the pass: the secret-scan remedy cannot work for an already-committed secret, and a merge that keeps half a solution earns the whole reward.
- **Works and must not be lost:** the post that waits for the owner, the secret-scan hold, the exact preview, the short collect loop (six commands from a cold session to a closed bounty), the complete pay message, facts-not-verdicts, the quiet project notice, `describe`'s honesty about when a bounty is not worth it.
- **One principle the evidence questions (owner's call):** "ask me each time covers publishing only" did not match what the one owner who chose it meant.
- **Checked:** pass **PASS, test-verified** on `fbee672` after one round of corrections to the report (an unsupported quote, an agent's phrase counted as the tool's, a relay artifact, small counts) — `verify fbee672 PASS check=0 build=0 test:kitchen=0 db=none 77s`. The pass recounted every number from the raw transcripts and reproduced one measurement on a rebuilt fixture.
- **Kitchen finding, not fixed:** the demo replay's stand-in GitHub (`kitchen/demo/bt11b-replay.mjs`, lines ~125 and ~161) answers a one-issue request with the list and reads the page from `per_page=`, so its stand-in mode has never shown a refresh or a pull-request list (`kitchen/demo/bt11b-transcript.txt:114`). Real mode is unaffected.
- **Owner's settings file:** unchanged; still carries the retired shared `reward $5 / limit $50` from K16 (inert under BT11c). Putting it back is the owner's own command.
- Off-machine verify on master was green at kickoff (K17 merge); the K18 merge run has not been read.

## Next

Three waves from K18's critique are briefed, in the order the owner approved on 14 October 2026:

1. **K19** — the demo's stand-in GitHub answers like GitHub, with a parity check ([waves/K19.md](waves/K19.md)).
2. **BT13** — what the owner hears; "ask me each time" holds merges too ([waves/BT13.md](waves/BT13.md)).
3. **BT14** — what the agent reads; its pre-cook card waits for the owner's go because it removes duplicate `config` verbs ([waves/BT14.md](waves/BT14.md)).

Send `START.md: K19, BT13, BT14`, or one at a time.

No wave is named and none is briefed. Ready when wanted: choosing which K18 findings to fix (the report's one page is written for that decision); fixing the replay's stand-in GitHub; publishing the K17 demo where the owner chooses.
