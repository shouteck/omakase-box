# BT8c: the secret scan as the owner decided it

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch, after BT8a and BT8b · Branch: `wave/BT8c` · Timebox: 120 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 13 October 2026, split out of BT8a after BT8's Result (merged `e8e1038`) showed how much each half changes. The decisions are the owner's, made in conversation while BT8 cooked. The head chef checks names against master at dispatch.

## What BT8 built that this wave changes

- A hit holds the post, and the message tells the owner to allow it once (`owner answer <id>`, which BT8a turns into `allow <bounty>`), add the path to never-ship, or close the bounty.
- The scan runs at `post` only.
- Its pass found gaps: a file Git treats as binary is not scanned at all and nothing says so (F2); an unquoted `NAME=value`, a token split over two lines and a base64-wrapped key block are not caught (F3).

## Outcome

The owner's part in the scan is two lists set beforehand. A hit always reaches the owner, no approval command is put in front of an agent, and the likely answer, removing the secret, needs nobody's permission. What the scan cannot see, it says.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`. Tests never read or write the real owner settings folder.
- Read for context: `waves/BT8.md` Result (the scan, F2, F3, F9); `waves/BT8a.md` Result (`config`, `allow <bounty>`); `waves/BT6a.md` Result (exactly what a post publishes); `kitchen/stations/packaging.md`.
- Do not touch: the built-in never-ship table; the three-word owner surface from BT8a, except to add settings to `config`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.

**The owner's part is set beforehand**

- Two lists in the owner's settings, shown in bare `config` and changed with `config add` and `config remove`:
  - **never publish:** the owner's additions to never-ship. A listed path is kept out of every bounty.
  - **safe to publish:** paths the scan does not hold a bounty over, for known false alarms such as test fixtures with made-up keys.
- Both live in the owner's settings and never in the project. A project file that claims either is refused by name and grants nothing. A path on the safe list still cannot carry a never-ship file.
- **"Allow it once" is removed for hits.** `allow <bounty>` on a bounty held by the scan is a named refusal that says the two things that do settle it. The safe list replaces it: slower the first time, and not asked again. (`allow <bounty>` still lets a post through that waits only for the owner's permission.)

**A hit waits for the owner, and the owner is always told**

- There is no setting for this. The bounty is held in a named waiting state that `status` shows.
- While it waits, whoever acts first settles it: the owner marks the path safe or never-publish; or the agent removes the content and posts again; or either stops the bounty.
- **The hit message shows the agent only what an agent may do:** remove it and post again; or stop and not post this bounty at all. No approval command appears in it. One line says it is waiting for the owner, who decides in `config`, and tells the agent to tell them.
- Stopping uses the ordinary closing command, but the message does not say "close": nothing was posted, so it says that nothing was published, nothing will be, and the owner's files are untouched.
- **The hit says where the secret is, as a fact,** and never prints the value: the file and line, and, when the content is in a commit not yet pushed, that commit and that an ordinary push would publish it too.
- **A hit stays in the record and in `status` after it is settled,** including when the agent fixed it and the bounty went out: what was flagged, and what happened. The owner should know a secret was sitting in their working files.
- **`create` previews it.** It states what would be published for the first time, and any hit, so the agent can fix it before `post`. A hit at `create` holds nothing and is recorded the same way.
- Removing the flagged content and running `post` again is enough to send the bounty. If the content was captured earlier, the tool recaptures it or says exactly what the agent must redo; a test proves which.

**What the scan cannot see, it says**

- A file Git treats as binary that would be published for the first time is named as a fact in the same output: it was not scanned. It does not hold the post by default; the Result argues that choice, and the owner's never-publish list is the answer for anyone who wants such files kept in.
- The stated pattern list gains the unquoted `NAME=value` form for the same names it already watches, with tests that ordinary code and configuration using those words with short or placeholder values still pass.
- A token split across lines and a wrapped key block are left as stated limits in the doc page, with the plain sentence that the scan is not proof of absence.

**An approval covers exactly what was shown**

- A yes for one waiting post (`allow <bounty>`, or a post under "ask me each time") is bound to what the owner was shown would be published. If that changes afterwards, the approval does not carry over. The tool's own bookkeeping between approval and posting does not count as a change: the `github-preview-stale` shape carried since BT6a is closed here, or reported as still open, with a test either way.

**Said plainly in the doc page:** waiting for the owner cannot be enforced. Content reworked until the scan passes goes out. What the tool guarantees is that the owner is told every time and can read what was published.

**Cases that must fail, each a named refusal that changes nothing:** a safe-list or never-publish entry that resolves outside the repository, is a link, or names a never-ship path as safe; either list claimed from a project file; `allow <bounty>` for a scan hit; an approval after the content changed.

## Review lenses

- [x] **Security:** the reviewer plays an agent that wants a flagged bounty out. It tries: reworking the content so the pattern no longer matches (and reports that it goes out and that the owner is told, as the doc page says); adding to the safe list from the project, through a solution, through a link or a case trick on the path; getting the value printed, in the hit, in `status` or in the record; making the hit vanish from the record; discarding and recreating the bounty to lose its trace. For each: prevented, or permitted but visible, and whether the doc page's claim matches.
- [x] **User experience:** an agent whose post is held by a hit says what it may do, what it may not and who decides, then removes the content and posts. An owner, played by the reviewer with only bare `config` and `status`, adds one entry to each list, says what each did, and says what happened to a hit their agent fixed last week. The reviewer reports any line addressed to the wrong reader.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Dispatch, 13 October: owner named BT8c in the START message after the BT8b close card. Base `0fdc01b`; start 06:55 UTC; stop by 08:55 UTC. The hosted run on the BT8b merge was still in flight at dispatch; the preceding master run was green. Use disposable fixtures and a temporary owner settings folder only; do not touch the real settings, post anything, or alter real authority.
- Subtract first: remove "allow once" for hits and the owner's commands from the hit message, then add the lists.
- Every secret-shaped test value is built at run time; never write one in a tracked file, this one included. `secret-literals.test.ts` guards it, and GitHub's push protection will reject the push.
- The scan stays a small stated list. Do not grow it into a general scanner: each pattern added needs a false-alarm test beside it.
- Report at the timebox. Do not run on.
- Not in this wave: anything about the owner's three words (BT8a); the instruction files (BT8b); the hook (BT9); any reward (BT11).

---

## Result

- Worker: cook on wave/BT8c · Reviewer: the pass, fresh Devin agent (this host), Windows, exercising the built `packages/box-cli/dist/cli.js` against disposable temp repos, a bare-repo "remote", a `gh` stand-in (fixture pattern) and `BOX_BOUNTY_SETTINGS_DIR` pointed at a temp dir.
- Commit: `fc90d84730135011ab7cb67a5756666cce870db7` — diff `master...fc90d84` is inside scope (box-bounty, box-cli bounty commands, tests/box/bounty, BOUNTY.md, one dispatch line in the wave file); nothing else touched.
- Verify: `verify fc90d84 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 658s` — `.kitchen/runs/2026-10-13T07-42-31-320Z-fc90d84/summary.json`, sha matches, clean tree, all four steps exit 0. Relied on per role; no `--fresh` rerun (nothing about the record is in doubt — the defect below was found by live exercise, not by the suites).
- Verdict: **FAIL** · Level: test-verified plus live-CLI exercise (would-have-been level had the two findings not surfaced)
- Lenses:
  - **Security (answered in full, all tries run live):** reworked content goes out AND the owner is told — after `git reset` dropped the flagged commit, `post` created the issue and `status` shows `scan finding (recorded at create): keys.txt:1 (assigned-secret) — the flagged content changed — the bounty went out`; the flagged commit never reached the remote. Safe-list injection from a project `settings.json` claim: refused `project-claims-list` on both `post` and `config` (owner `config add` still works while the claim file exists); through a link: `publish-list-link`; outside path: `publish-list-outside`; case trick (`KEYS.TXT`): stored spelled as typed on Windows but matching folds case — no bypass, cosmetic only; through a solution: a merged claim file refuses at the next consult — visible. `allow <id>` on the scan hold: `allow-scan-held`, exit 3, nothing changed. The value is never printed — zero occurrences in hold text, `status`, the record JSON or the gh-state issues. Making the hit vanish: no tool command erases findings; `rm .box/bounties/<id>.json` removes the trace silently — a plain file in the owner's repo, the "cannot be enforced" class. Discard-and-recreate: `close` settles the finding on the old record, but see finding B — `status` then shows only `withdrawn`. Answer binding verified live: drift after the wait → `github-preview-stale`; re-post → fresh wait → `allow` → carried answer survives the scan hold → post credited to "one-bounty answer". Tool bookkeeping between wait and answer does not stale it (`untracked` counts porcelain entries; `.box/` collapses to one).
  - **User experience (answered):** the held-post message says exactly what the agent may do (remove and post again — "that sends the bounty"; or stop — nothing published, nothing will be, owner's files untouched), what it may not (no approval command appears), and who decides (the owner, in `box bounty config` — "tell them"). "Stop" does not name `close` per the brief; the agent finds it in `help`. As owner with bare `config`/`status`: `config` shows both lists with the exact `add`/`remove` commands; `config add never-publish real` excluded `real/` from the next create's shipped set (`owner-never-publish`); `config add safe-to-publish <path>` releases the scan hold; `config add safe-to-publish .env` refused `publish-list-never-ship`. A hit the agent fixed shows in bare `status` on the posted bounty. Lines addressed to the wrong reader: none that violate the brief — the permission-wait hold still names `allow <id>` to the agent (relay wording, matches the permission design), the scan hold correctly does not.
  - Measurement fairness: not applicable.
- Binary files: what the tool does and why: a file Git treats as binary (NUL in the head / `Binary files … differ`) yields the scan no added lines, so it cannot be read — the tool names it "not scanned" as a fact on the create preview, the post preview and the post output, records it as `github.scanBinary`, and never holds the post. "Reported, never held" is defensible: holding every binary would stall ordinary repos carrying images/archives, the doc page states the limit and the remedy plainly, and the owner's `never publish` list is the designed instrument for keeping such a file out. Caveat: `status` (any form) never re-shows `scanBinary`; the doc only claims preview+post, which hold.
- Findings and limits:
  - **F-A (the FAIL): a folder post settles a live finding with a false fact.** `postBounty --to <dir>` runs no scan (documented design) but still calls `settleScanFindings(..., 'went-out')`; when the flagged path is not safe-listed the record says "the flagged content changed — the bounty went out". Verified live: `creds.txt` shipped to the delivered folder still containing the secret bytes while the record claims the content changed. The record's "what happened" — the exact clause this wave adds — is wrong, and an owner reading it could believe the secret was scrubbed before it left. The same settle text asserts "the owner marked the path safe to publish", attribution the tool cannot verify — `config add` is an unauthenticated local write and an agent can run it. Fix is small: settle honestly for folder posts (e.g. "went out unchecked" or leave unsettled), and word the safe-list settlement as the list's state, not who acted.
  - **F-B (the FAIL): a settled finding is invisible in `status` once the bounty ends.** `status`, `status <id>` and `status <id> --full` print nothing of `scanFindings` for ended records — verified live: the closed held bounty shows only `ended: bt-… withdrawn` plus stage history; only the raw `.box/bounties/<id>.json` retains it. `status --since` likewise never reports a settled finding. The brief says a hit "stays in the record and in `status` after it is settled" and the doc page claims the owner is told "every time, in `status` and `config`" — the ended case (the agent stopped it) is precisely where the owner most needs to learn a flagged file sat in their working tree.
  - Minor: the project-claim check covers a fixed spelling set at root and `.box/` — a claim in another filename (e.g. `sub/settings.json`) grants nothing but never surfaces; consistent with "grants nothing" but the "refused by name" reach is narrower than the plain reading. `untracked`/`leftHome` in `shown` are counts, not names — untracked-file swaps with equal counts carry the answer over, which is sound because unpublished files are not what the answer binds (include names and `tip` bind the published bytes). A `KEYS.TXT`-case entry is stored spelled as typed (matching folds case — cosmetic only).
  - Cook's claims confirmed where exercised: lists keyed by real repository path, refusals by name (outside/link/never-ship-as-safe/double-list/not-listed), `allow-scan-held` still releasing permission waits (verified via the untracked-file test and the carried-answer flow), binary reported not-scanned and never held, `shown` binds base/head/tip/pushed/include/counts with `github-preview-stale` on real drift.
- Merged: · Resources removed: (left for CTO — my own temp world under `%TEMP%/bt8c-review` is disposable)
- Reflect:
