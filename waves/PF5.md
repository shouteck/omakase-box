# PF5: the tool and the platform, connected through GitHub

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF5` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-platform-v1; D-2026-10-21-no-platform-money; owner surface stays `allow`, `deny`, `config` (owner, 13 October 2026); spend no money

**Brief.** Written ahead by the CTO on 21 October 2026. **After PF2 and PF4.** Cook: high; reviewer: high.

**A design choice, made here.** K42 proposed a `box bounty login` command and an agent token. With no money on the platform, the token is not needed:

- the platform already reads every fact from GitHub;
- the owner's "paid" travels as the shared memory's `paid` event, which only someone with push access can push.

So the CLI gains **no new command and no credential.** It tells the platform "look now" with an unauthenticated hint carrying identifiers only, and reads the solver's accepted payment methods from the platform's public API. This keeps the owner's surface at `allow`, `deny` and `config`.

## Staffing (Claude Code, coordinator on Opus 5.5)

Dispatch each role with the Agent tool, passing `model` and `effort` exactly as written here. This brief is the explicit instruction those settings need.

- **Cook:** `box-worker`, **Opus 5.5**, effort **high**: it changes the CLI's core paths and what leaves the machine.
- **The pass:** `box-reviewer`, fresh, **Opus 5.5**, effort **high**. Never the agent that cooked.
- **Corrections:** a correction round uses a fresh cook at the same model and effort. After two FAILs on the same finding, the next correction steps up one level (Sonnet 5.5 to Opus 5.5 high, or Opus 5.5 high to Opus 5.5 xhigh) and the Result says so. Fable 5.1 is never used without the owner's word.
- **Record** the host, model and effort of every role in the Result (KITCHEN.md).

## Outcome

- A bounty appears on the board moments after `post`, instead of at the next scheduled search.
- The owner's "whom to pay" message names the solver's accepted payment methods from their profile.
- `status` states what the platform shows.
- If the platform is unreachable, the CLI works exactly as today.

## What it does

1. **Setting the address.** The platform's address is a `config` setting with a default of the public deployment (set in PF6). An empty value turns all platform calls off.
2. **Hints after `post`, a recognised merge, `close` and `config set paid`.**
   - Each is a fixed, allow-listed JSON shape: repository, issue number, bounty id and the event name. **Never a path, file, diff, task text, branch name or setting.**
   - A failed hint is kept locally and resent by the next command.
   - `status` and `--json` name the state ("the board has not been told yet: <reason>; next: any command when online").
   - The platform rate-limits hints and verifies everything on GitHub (PF1); a hint only moves a refresh earlier.
3. **The owner message.**
   - After a rewarded merge, the message the tool already writes (BT11b) gains the payee's accepted methods, read from the platform's public profile API.
   - Fallbacks: today's `pay-to:` line if the solver has none, then "ask the solver on the issue".
   - The message still says the tool never moves money.
4. **`status`:** one line per rewarded, merged bounty: "on the board: owed / recorded paid / confirmed received" from the platform's public API. It is cached and bounded, and has a quiet failure state that names its next step.
5. **Docs:** BOUNTY.md and the README describe the board, the hints and what is sent.

## Tests (`tests/box/bounty/pf5.test.ts` with a stand-in platform)

| Case | Expected |
|---|---|
| Hint payload | Matches the allow-list exactly; **a test that fails if any other field, path or text is added** |
| Platform down at `post` | `post` succeeds as today; the hint is queued; `status` names it; the next command resends it |
| Platform address empty | No network call at all |
| Owner message with a profile | Lists the methods; with none, falls back to `pay-to:`, then "ask on the issue" |
| `config set paid` | Writes the chain event as today, and hints |
| T1 and T4 guarantees (BT38) | Still hold: reads send nothing and change nothing shared |

**Bite:** add a path to the hint payload in a scratch copy; the allow-list test fails. Record it.

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0; hosted CI green after merge.
- The tool convention is named for each changed output (D-2026-10-14-tool-convention).

## Review lenses

- [x] **Security:** the hint allow-list; nothing private leaves the machine; unauthenticated hints cannot change any fact.
- [x] **User experience:** the pass runs the whole loop locally (post, solve, merge, pay message, record paid, confirm received) against the stand-in platform.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook; principles: prove-it-works, write less code of higher quality.
- Do not edit `waves/PF5.md` while a verify runs. Report at the timebox.
