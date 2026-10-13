# BT9: the hook, so an agent knows without remembering

Milestone: BT · Station: packaging (also evidence) · Base: master at the time this cooks, after BT8 is merged · Branch: `wave/BT9` · Timebox: 150 minutes; at expiry, report partial findings and stop

> **Changed by the owner's decisions of 12 October 2026. Where the text below differs, this wins; the head chef folds it in when revising the brief at dispatch.**
> - **The hook can close a bounty.** Its command reads the bounties' records, so under BT7b it recognises a merged solution and closes the bounty on GitHub, at the start of a session or wherever it runs. The disclosure must say so in plain words: switching the hook on means an issue can be closed, with a comment, with nobody asked, when a solution has been merged. If the standing rules do not allow closing without asking, the hook only states the fact.
> - **What the finishing slot shows** is a solution that arrived and, from BT11, the message naming whom to pay: the solver whose solution was merged. There is no separate award to show.
> - **Commands that no longer exist** (BT7a to BT7c): `answer`, `questions`, `reply`, `unlook`, `finish`, `cancel`, `undo`. The hook names only commands that exist.

**Brief, written ahead.** By the CTO on 11 October 2026, while BT6's second run was cooking, for the way BT6a posts a bounty: an issue on the real history, with an ordinary bounty branch and solutions as ordinary pull requests. The outcome and the acceptance are settled with the owner. Command names, field names and file paths follow the design discussion; the head chef checks them against the Results of BT6a to BT8 before dispatching, corrects names only, and says in the pre-cook card what changed.

## Outcome

On hosts that can run a command at fixed moments, an agent is shown the state of the project's bounties when its session starts, and is told once when something new arrives during the session. It is silent otherwise. It is off until the owner switches it on, and switching it on shows the owner plainly what it does, what it costs and what it may cause.

A new session knows nothing and cannot be relied on to run `status`. This is what removes that dependence.

## What the CTO read first (11 October 2026)

Search results and vendor pages, not tested here. The worker verifies each against the host's own documentation and on the real host before relying on it, and corrects this table in the Result.

| Host | Slot at session start | Slot during a session | Where it is configured | Caution |
|---|---|---|---|---|
| Claude Code | `SessionStart`; output is added to the agent's context | `UserPromptSubmit` (each turn), `Stop` (when the agent finishes) | `.claude/settings.json` in the project | The reference format others copy |
| Devin CLI | `SessionStart` | `UserPromptSubmit`, `Stop`, `PostToolUse` | `.devin/hooks.v1.json`, or a `hooks` key in `.devin/config.json`; also reads `.claude/settings.json` | Its docs say the format is compatible with Claude Code's |
| Codex CLI | `SessionStart` | `UserPromptSubmit`, `Stop` | Its own config | Reported as experimental and behind a flag; Windows support reported disabled at one point |
| Cursor | `sessionStart` | `beforeSubmitPrompt`, `stop` | Its own hooks file | A user report says context from `sessionStart` often does not reach the first message |
| Gemini CLI | `SessionStart` | Its own events | `.gemini/settings.json` | How output reaches context was not confirmed |

This repository has `.claude/` and `.devin/` folders, and both hosts cook here.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`. Host settings files in this repository are **not** edited by the wave; see "This repository" below.
- Read for context: `PLAN.md` ("How the agent finds out", the hook row under "Remaining waves", "Other rules of the product"); `waves/BT4.md` Result (reminders, the tool-kept lines, how wording was tested); `waves/BT6.md` Result (how `status` reads GitHub and what it prints); `waves/BT7.md` Result (the staged merge, the comment count); `waves/BT8.md` Result (rules, where they live, the waiting state); `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table; the protections of the owner's working tree, index and branch; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`. Any global or user-level host setting, on any host.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.

**One small command the host runs**

- `notify` (or the name that fits) has two modes. At session start it prints the state of open bounties, briefly, and the command that shows more. During a session it prints only what is new since this project's agents were last told, one line per event, each event once, across sessions.
- **Silent when there is nothing to say.** No open bounties, or nothing new: no output at all, exit 0. This is the one deliberate exception to "no command returns nothing", and the doc page says why: its output is paid for in every session's context. Run by hand with a flag, it says "nothing to report" like any other command.
- **It interrupts as little as it can, at the moments that suit.** It speaks at the start of a session and at the moment an agent is about to finish its work, not in the middle of a task. During a session the only thing worth raising is a solution arriving, and it is raised at the next natural pause, once. Everything else (a solver's comment, a staged merge, a decision waiting for the owner, an issue closed outside the tool) is shown at session start and in `status`, not announced mid-work.
- **Only what the tool generated.** Counts, numbers, the tool's own identifiers, times. Never a title, description, branch name or account name that a stranger chose. A test feeds hostile text through every outside field and shows none of it reaches the output.
- **Facts only.** It never says what the agent should do beyond naming the command that shows more. BT3a's banned-words test covers its output.
- **Fast and never in the way.** It reads the record first. It asks GitHub at most once per stated interval (a few minutes), with a short time limit, and remembers when it last asked. If GitHub cannot be reached it prints the last known state with the time it was recorded, or nothing if nothing is open. It never exits non-zero in a way a host would treat as blocking the session, never waits on input, and a test shows it returns within its limit when the network hangs.
- **The moment an agent is about to finish its work is a slot of its own,** where the host has one. There the hook shows what this session should not end without saying: a solution that arrived for a bounty this project has open, and a merge this session left staged. Build it so a later wave can add to it; BT11 adds the awards this session made, for the agent's closing summary.
- What agents have been told is state in `.box`, never published, and safe if two sessions run at once: an event may be announced twice in a race, never lost.

**Switching it on is the owner's act, with full disclosure**

- Off by default. Nothing in the normal journey switches it on, and the description shown to agents does not offer to.
- `hook on --host <name>` first prints the disclosure and changes nothing unless confirmed with an explicit flag. The disclosure states, as facts:
  - what it does and at which moments on this host;
  - what it touches: the exact project settings file and the exact lines it will add; that it contacts GitHub through the owner's sign-in and how often;
  - what it costs: how many lines can enter the agent's context per session, and that it is nothing when no bounty is open;
  - how it may affect the agent: it can pull attention from the task in hand; the agent may act on what it sees; **and when standing rules allow it, a solution arriving can lead to a merge with nobody asked.** That last sentence is shown whenever the rules in force make it true, and says which rule;
  - what it never does: act by itself, show a stranger's text, tell the agent what it should do;
  - how to stop it: the exact command.
- It writes only the project-level settings file for that host, adds only its own marked entry, preserves everything else in the file byte for byte, and refuses by name if the file is malformed or the entry cannot be added safely. `hook off` removes exactly that entry. A test round-trips a settings file with other hooks and comments in it.
- Where a host has no usable slot, or only the start slot, `hook on` says so plainly and offers what exists; the rules-file line remains the fallback and is not removed.
- The reviewer checks that what is disclosed is what happens: each sentence of the disclosure is traced to behaviour.

**This repository**

- The wave does not switch the hook on here. That is the owner's decision for their own project and their own token budget. The Result gives the exact command for each host that cooks here, and the disclosure each would show.

**Everything else**

- **Cases that must fail, each a named refusal that changes nothing:** an unknown host; a settings file that is not valid; a settings path that resolves outside the project (junction, `..`); `hook on` without the confirming flag (prints the disclosure, exits as a named outcome); `hook off` when it is not on.
- Works with BT8's withdrawn authority: the hook still reports, and the disclosure line about merges with nobody asked is no longer shown.
- The description shown to agents does not change. The doc page gains one section. No line count is enforced (owner, 11 October 2026: a fixed limit could damage the product by cutting what an agent needs). The measure is whether a fresh agent got what it needed without wading: the reviewer judges that, and reports anything shown that the agent did not use.
- Proved on at least two real hosts available on this machine, in a trial project, not this repository: the start slot and one during-session slot each. Say which were proved and which only read about.
- Works on this Windows host from Git Bash and PowerShell.

## Review lenses

- [x] **Security:** the reviewer tries to get text of its choosing into an agent's context through the hook: pull request titles, account names, branch names, issue text, a hostile stand-in `gh`, a tampered record. It tries to make `hook on` write outside the project or damage a settings file, and to make the hook block or slow a session. It confirms no global setting is touched on any host.
- [x] **User experience:** two parts. An owner, played by the reviewer with only the disclosure in front of them, says what they are agreeing to and what could happen as a result; anything they could not answer is a finding. Then a fresh agent on a real host with the hook on, in a trial project: started with one bounty open, it says what it knows before doing anything; a solution is then made to arrive mid-session, and the reviewer reports whether the agent was told once, at which moment, and what it did. A third run with no bounty open confirms nothing is added to the context.
- [x] **Measurement fairness:** the cost figure in the disclosure. The reviewer measures the lines and characters actually added per session in each state (none open, one open, three open, one event) on a real host and compares them with what the disclosure states.

## Notes for the worker

- Dispatch, 13 October: owner named BT9 in the START message. Base `ebef4e6`; start 08:38 UTC; stop by 11:08 UTC. The hosted run on the BT8c merge was in flight at dispatch; the BT8b merge run was green. Name corrections per the brief's own instruction: also read waves/BT8a.md, waves/BT8b.md and waves/BT8c.md Results — the owner surface is now `allow`/`deny`/`config`, merges are never gated (a recognised merge closes the bounty without asking, so the 12-Oct disclosure sentence about closing with nobody asked applies under current rules), and the removed-command list also covers `remind`, `confirm` and the `owner *` spellings. Disposable trial projects and temp settings only; never touch this repository's host settings, any global/user-level host setting, real authority or the network beyond what the hook design requires.
- Feature playbook, with the investigation steps first: confirm on each real host what its start and during-session slots do with a command's output before writing the installer for it.
- One output command shared by every host; a thin, separate piece per host that only knows where that host keeps its settings and what an entry looks like. Do not build a general plug-in system.
- BT4 found, from published work, that wording alone changes how much a tool is used and that more detail is not better. Keep every line the hook prints as short as it can be and still be a fact with a next command.
- "Told once" matters more than "told immediately". An agent told twice learns to ignore the line.
- The moment an agent is about to finish its work is the most valuable during-session slot: a solution that arrived should be seen before the agent stops. Use it where the host has it.
- Out of scope: any reward or payment, which no wave implements; switching the hook on in this repository; a background process, a server or anything that runs when no session does.
- Everything the wave creates in the temp folder or a trial project is named for the wave and removed at close. Any host setting it changed for a trial is restored and listed in the Result by exact path.

---

## Result

- Worker: Devin (cook) · Reviewer: pending — the pass has not run on this commit
- Commit: `56d879cff47e5541c292cbf3ab4739d42a2dadc9` on `wave/BT9`
- Verify: first run `node scripts/verify.mjs test:box-bounty test:box-package` on `56d879c` FAILed with two 30 s timeouts under parallel load — `record.test.ts` "bounty.json names a different id" and `report.test.ts` "no verdict word"; both re-passed standalone (27/27 in 34 s) — not a regression, machine-load flake. A rerun on the final commit SHA is the acceptance run; see below
- Verdict: implementation complete pending review · Level: pending
- Lenses (worker-side; the pass re-judges): security — hostile title/account/branch/PR-author/issue text through every outside field produces only tool-generated lines (test: `hook.test.ts` "shows open-bounty state"); settings escape refused by name on a junction (`hook-settings-escape`); malformed file named (`hook-settings-malformed`); entry timeout 30 s, each `gh` call capped at 8 s, GitHub asked at most once per 5 min, whole refresh bounded inside the entry cap, always exit 0. UX — disclosure prints before any write and names the merge-close consequence only while publication is allowed (`--confirm` gate tested); no real-host session could run (below). Measurement — real CLI on a trial repo: 0 open → 0 bytes out, exit 0, no `.box` created; 1 open drafted → 1 line, 92 chars of `additionalContext` (159-byte envelope); 3 open → 1 line, 132 chars (211-byte envelope); one arrival → one line; matches the disclosure's "one line at start, one per new event, zero when nothing is open".
- Hosts proved: **none**. Devin CLI on this machine is installed (`devin.exe`, 3000.10.31) but `Not logged in` — no live lifecycle run was possible. Cursor (3.24.12) is GUI-oriented; no non-interactive agent entry point was found. No `claude`, `codex` or `gemini` binary exists on PATH. Hosts only read about, against installed/bundled documentation: **devin** (`.devin/hooks.v1.json`; bundled docs state hook entries run a command with JSON stdin, `hookSpecificOutput.additionalContext` reaches context, non-2 exits are nonblocking; the adapter event map seen locally lists SessionStart, UserPromptSubmit, SessionEnd, PreToolUse, PostToolUse, ErrorOccurred — `Stop` is documented in the general table but not confirmed in that local map) and **claude** (`.claude/settings.json`, `hooks` key; format per the same installed documentation). Both adapters are written to the documented format only — the wiring is a read-about claim, not a proven one.
- To switch it on in this repository (owner's decision): `box bounty hook on --host devin` writes entries to `.devin/hooks.v1.json`; `box bounty hook on --host claude` writes to `.claude/settings.json` (Devin reads this file too). Either prints the full disclosure first and changes nothing until repeated with `--confirm`. `box bounty hook off --host <name>` removes exactly the written entries and restores the file byte for byte.
- Findings and limits:
  - No host lifecycle slot was live-proven — the "proved on at least two real hosts" acceptance is **not met**; it cannot be met on this machine without a Devin sign-in or an installed CLI host. Everything host-facing is built to installed documentation and is test-covered at the file and command level, not the session level.
  - Fixed in review of my own first pass before commit: a path-prefix check that would have accepted a sibling `repo-evil/` junction; `hook off` deleting pre-existing empty arrays and an owner-written `"hooks": {}`; GitHub-ask timestamp lost if the host killed the run mid-refresh (now persisted before the calls); `.box` created in a project that never opened a bounty (now no state is written unless something was told or state exists); help text named a removed-command word; a host-name literal outside the product registry.
  - The finishing slot shows arrivals and left merge conflicts; the BT11 solver-to-pay line does not exist yet (that wave adds it).
  - GitHub polling: at most once per 5 minutes while an open bounty is posted there; each `gh` spawn capped at 8 s; total refresh bounded so the 30 s host entry timeout is never the real limit; a killed run still leaves the interval marker.
  - The mid-run full-suite failure of `hook.test.ts` (`.box` created by a stale `dist/cli.js`) was a build-order artifact; after rebuilding, the file passes 8/8.
  - Disclosure was traced to behaviour: every sentence maps to a tested fact except the live-host firing, which is stated as read-about in the doc and here.
- Merged: not yet — awaiting the pass · Resources removed: smoke trial repos `box-bt9-smoke-*`, `box-bt9-boxcheck-*` deleted; `box-bt9-hosts/` trial projects deleted at close; no repository or global host settings were changed (verified: `.claude/` and `.devin/` in this repo untouched — `git status` clean there)
- Reflect: the pstack feature playbook's "confirm the host before writing the installer" step is what kept this honest — the only host binaries present could not run a session, so the wave shipped read-about adapters with named boundaries rather than claims. The JSONC splice (parse-for-spans, edit-by-text) proved simpler and safer than a rewrite-on-off model: it is what makes byte-for-byte restore and comment preservation possible at all.
