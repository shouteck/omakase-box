# PF5: the tool and the platform, connected through GitHub

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF5` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-platform-v1, D-2026-10-21-no-platform-money
Owner context: D-2026-10-21-platform-v1; D-2026-10-21-no-platform-money; owner surface stays `allow`, `deny`, `config` (owner, 13 October 2026); spend no money
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written ahead by the CTO on 21 October 2026. **After PF2 and PF4.**

**A design choice, made here.** K42 proposed a `box bounty login` command and an agent token. With no money on the platform, the token is not needed:

- the platform already reads every fact from GitHub;
- the owner's "paid" travels as the shared memory's `paid` event, which only someone with push access can push.

So the CLI gains **no new command and no credential.** It tells the platform "look now" with an unauthenticated hint carrying identifiers only, and reads the solver's accepted payment methods from the platform's public API. This keeps the owner's surface at `allow`, `deny` and `config`.

## Plan

Agreed with the owner in plan mode, 31 October 2026. Read before code: feature playbook, Prove It Works, Laziness Protocol. `architect` skipped: the brief and K43 settled the design. One writer.

1. **Network is one synchronous child process** (`packages/box-bounty/board.ts`): the library is synchronous and the pay message is built inside a sync close path. Empty environment, one 2.5 s deadline per batch, no redirects, 64 KB per answer. An empty address starts no process.
2. **Address:** `config set board <url>`, `""` is off; `https://`, or `http://` on loopback; no credentials, path or query. The default is empty until PF6.
3. **Hints:** `hintOf` is the only builder, exactly `{repository, issue, bounty, event}`. Queued at the four `share*` choke points in `chain.ts`, in the store's meta. Flushed at the end of every command except `hook`, at most 10. A failed flush after a command that changed something prints one stderr line.
4. **T4 here means:** a read pushes nothing and appends no chain event. A read may resend a queued hint and `status` may GET; neither carries anything but identifiers.
5. **Pay message:** at close, `/api/solver/<login>` is read once and stored on `github.pay` as `accepts`, rechecked against `KINDS` on read. Order: methods, `pay-to:`, "ask the solver on the issue". Not reached, or the hook path: says so and names the profile page.
6. **`status`:** reads `/bounties/<id>.json` (and the profile when owed) for open posted and rewarded merged bounties, at most 5 per command, stalest first, cached 5 minutes. The renderer reads only the cache. `--json` carries the same facts under `board`.
7. **Platform:** `POST /api/hint`, at most 512 bytes, exact keys. One look per bounty per minute, a global per-minute cap, refused past half the hour's GitHub budget. `lookNow` reuses the refresh's readers; the private rule first; nothing from the body but the id is stored. `/api/solver/<login>` gains `methods_more`, a count only.
8. **Not built:** `to` on the chain's `paid` event: optional in STATUS, unasked by the brief, against BT36's "never the solver". Stays a BACKLOG line.

## Parked

Parked 31 October 2026 when the usage limit was reached; not accepted. Built on this branch: plan items 1 to 7, with `tests/platform/hints.test.ts` and `tests/box/bounty/pf5.test.ts`. Inner-loop runs only: pf5 38 of 38, platform suite 234 of 234; `test:box-bounty` and `test:kitchen` not run, so stale wording elsewhere in the suite is unchecked. `account.test.ts` gained `methods_more: 0` in one expected profile, because the brief adds the field.

Left, in order:
1. Docs: BOUNTY.md and README (board, hints, what is sent), platform README, `privacy` and `how` pages (the hint keeps only a bounty id for a minute), the T4 line in CONTRACTS.md (what "reads" means here), BACKLOG (`to` on the chain's `paid` event stays unbuilt).
2. Bites, restored after: a path added to the hint (the brief's); no empty-address guard; method recheck off; budget reserve off; the `storeIssue` guard in `lookNow` off.
3. `node scripts/verify.mjs test:box-bounty test:platform test:kitchen`.
4. The whole loop against the local board (UX lens); read the changed pages running.
5. Close per `kitchen/roles/cto.md`. Reflect: a `cd` slipped into a Bash call and moved the session's directory, against the role's rule.

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

## Lenses

- [x] **Security:** the hint allow-list; nothing private leaves the machine; unauthenticated hints cannot change any fact.
- [x] **User experience:** the CTO runs the whole loop locally (post, solve, merge, pay message, record paid, confirm received) against the stand-in platform.
- [ ] **Measurement fairness:** not applicable.

## Notes

- Feature playbook; principles: prove-it-works, write less code of higher quality.
- Do not edit `waves/PF5.md` while a verify runs. Report at the timebox.
