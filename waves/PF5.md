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

## Result

- CTO: Claude Code desktop on Windows / Claude Opus 5.5 planned, built and closed. **Two hosts worked this wave, one after the other:** after this session parked at a usage limit, Devin resumed the branch (commits `b7f98d9` to `78db511`: docs, the loop's two fixes, the BT43 guards). Claude Code reviewed those commits, then did the bites, its own loop run, the last two commits and the close. Devin's model is not known here, and it left no Result.
- Commit: `4344d6a`.
- Verify: `verify 4344d6a PASS check=0 build=0 test:box-bounty=0 test:platform=0 test:kitchen=0(selected 18 of 18 kitchen files) db=none 1242s`. Earlier: `08ee1bd` FAIL (four BT43 and agreement guards; fixed in `00c9832`), `78db511` PASS, `4fae2eb` FAIL (three 30 s timeouts, no assertion).
- Level: `ui-verified` for the CLI, locally, against the real `handle()` and `refresh()` with GitHub stood in. Real GitHub and a real deployment were not exercised; that is PF6. Done when's "hosted CI green" is read at the next kickoff (STATUS.md).
- Checks:
  - The diff does what the brief says. Outside its list: BACKLOG, CONTRACTS T4, and the board's `how` and `privacy` pages, which state what a hint is.
  - Verify passes on this commit.
  - **Changed expectations, each because the brief adds the behaviour:** `methods_more: 0` in one expected profile; `bt43` gains two named exceptions, two renderer callers and a third document with a board set, and loses no check; `json-agreement` gains the `board` label.
  - **Bites, each in the working tree and restored; all ten fail their intended test:** a path added to the hint (the brief's, 2 failed); no empty-address guard; no redirect refusal; method recheck off (2); budget reserve off; per-bounty limit off; extra hint fields allowed (2); the copy guard off; the private rule off; the id check off.
  - **A weak test found before the bites ran:** the first redirect case aimed at a host that does not resolve, so it would have passed with redirects followed. It now aims at an address that answers with a valid profile, and that bite fails.
  - **Tool conventions:** `config set board` follows `git config` and `gh config set`; `""` for off follows `git config`'s empty value; `status --json` adds fields as `gh --json` does; the hint state follows `git status`, which states what is not yet sent and how. Not bought from any tool: the stderr line after a failed send, because no command may fail silently.
- Lenses:
  - **Security:** the hint is built in one function, sent and stored only through it; a tampered stored row sends only the four fields or is dropped. Tried on the route: a path, a title, a missing field, an unknown event, bad id, issue and repository, an array, not JSON, 600 bytes: all 400, no GitHub read, nothing stored. A hint with the wrong number or id changes nothing; a private repository is never listed and is purged. **Found while planning:** a hint naming a copy of a bounty could have read a stranger's pull requests into the real bounty; guarded and bitten. Tried on the tool: look-alike link, unknown kind, `constructor` as a kind, words in a link's place, a non-object method, a redirect, a 70 KB answer, HTML, a 500, an answer about another bounty, hidden characters. **Limits:** hints are unauthenticated, so anyone can spend the per-minute cap and delay others' hints, never change a fact, and the scheduled read still runs. The empty child environment has no test of its own: `fetch` reads nothing from it. The board learns the requester's address, as any web server does.
  - **User experience:** ran the loop (Devin's script, rerun by me on `4fae2eb`'s tree, 310 s cache wait included): post, listed, the solver lists methods, solve, merge, pay message ("example-quill lists these ways to be paid on the board: PayPal.me ...", "1 more is shown only to you"), owed with methods, record paid, recorded paid "the owner's word", solver confirms, "confirmed received ... the solver's word", `--json`, board off with no line. Devin's run found two faults, fixed in `08ee1bd`: two hints for one bounty left a false "not told yet", and "any command when online" was untrue for a 429. **Limits:** a confirmation shows in `status` only after the 5-minute cache. Issues in the loop came from a stand-in reading the tool's own world. The `how` and `privacy` text was read in source and covered by the page tests, not re-read in a running browser, against this wave's own template line.
- Method: feature playbook, Prove It Works, Laziness Protocol, read before code. Prove It Works changed two decisions: rerunning the loop instead of trusting a report of it, and strengthening the redirect test. Laziness Protocol changed one: no `to` on the chain's event. `architect` skipped: K43 and the brief settled the design.
- Findings and departures:
  - **Departs from K43:** `/api/solver/<login>` instead of `/people/<login>.json`, which PF3 never built. `methods_more` shows a count publicly, as K43 asks.
  - **A hint resent or a GET on a read** is how "reads send nothing" is met: identifiers only, nothing shared changes; tested through every reading command, and CONTRACTS T4 says so.
  - **Before any deploy (PF6):** `lookNow` has not met real GitHub; its CPU on Workers Free is unmeasured; `schema.sql` adds `hints`; `BOARD_DEFAULT` is empty until then.
  - **Not built, in BACKLOG:** `to` on the chain's `paid` event.
  - The bounty suite's 30 s timeouts on this host recur: `answer.test.ts` and `bt43.test.ts`, which the last fix did not change, timed out once and passed on the rerun.
- Merged: the `--no-ff` merge that follows this commit · Verify cost: `verify: 4 runs, total 4827s`, local run history, 0 missing · Resources removed: the three `kitchen-PF5-loop*` folders and `kitchen-PF5-msg.txt` in Temp; board and stand-ins stopped.
- Reflect: two hosts resumed one parked wave with nothing to tell the second of the first, and the owner had to ask -> kitchen: INBOX line. A negative test aimed at an address that cannot answer passes for the wrong reason -> kitchen: INBOX line (the packaging card is at its size limit). A `cd` slipped into shell calls twice, against the role's rule -> kitchen: the same INBOX line's check, a command-level guard if it recurs. New merge-driving test files need explicit timeouts from the start -> wave: done.
