# BT9: the hook, so an agent knows without remembering

Milestone: BT · Station: packaging (also evidence) · Base: master at the time this cooks, after BT8 is merged · Branch: `wave/BT9` · Timebox: 150 minutes; at expiry, report partial findings and stop

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

- Feature playbook, with the investigation steps first: confirm on each real host what its start and during-session slots do with a command's output before writing the installer for it.
- One output command shared by every host; a thin, separate piece per host that only knows where that host keeps its settings and what an entry looks like. Do not build a general plug-in system.
- BT4 found, from published work, that wording alone changes how much a tool is used and that more detail is not better. Keep every line the hook prints as short as it can be and still be a fact with a next command.
- "Told once" matters more than "told immediately". An agent told twice learns to ignore the line.
- The moment an agent is about to finish its work is the most valuable during-session slot: a solution that arrived should be seen before the agent stops. Use it where the host has it.
- Out of scope: any reward or payment, which no wave implements; switching the hook on in this repository; a background process, a server or anything that runs when no session does.
- Everything the wave creates in the temp folder or a trial project is named for the wave and removed at close. Any host setting it changed for a trial is restored and listed in the Result by exact path.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Hosts proved, hosts only read about:
- To switch it on in this repository (owner's decision):
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
