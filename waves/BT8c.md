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

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Binary files: what the tool does and why:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
