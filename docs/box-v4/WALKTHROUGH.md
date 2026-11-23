# The walkthrough: checking the whole system against its invariants

The owner, 24 November 2026: these are well-defined problems, but development drifts away from the invariants it set out to hold. So the whole system is walked through at fixed points, early and again later, before the base is built on further. This page is the practice. The first walkthrough was the session of 23 and 24 November 2026, whose findings are the briefs BT71 to BT99, PF55 to PF61 and BT100.

**The rule:** the deterministic part decides what must be looked at and what must hold. Judgment can only add findings; it can never pass something the deterministic part flagged.

## When

- Before each milestone is approved, and before launch.
- After every ten merged product waves, counted from the last walkthrough's tag.
- On the owner's request.

It is never run overnight; it is a session with the owner.

## The deterministic part

`node scripts/walkthrough.mjs` (built by [K75](../../waves/K75.md)) prints the walkthrough's agenda, the same way every time. It covers six things.

1. **Scope:** every product file changed since the last `walkthrough/<date>` tag, by `git diff --stat`, grouped by component.
2. **Coverage:** every file under `packages/box-bounty`, `packages/box-cli/src` and `packages/box-platform/src` is listed in the register below, either pinned by a table or marked not pinned yet. A file in neither fails the script.
3. **The invariants:** every pinned table's test is run, and its result printed.
4. **The bug-class scanners:** one parser check per class of fault found in a walkthrough. Each runs over the whole code, not only the changed files. They are part of the ordinary suite, and the script prints their results.
5. **References:** each table row that rests on an outside source records the address and the date read. `node scripts/walkthrough.mjs --references` (by hand; it needs the network) re-reads each source and lists the rows whose source changed. Same pattern as `gitleaks-rules.mjs --check` and `skill-targets.mjs --check`.
6. **Advisories:** the Git advisories list (BT97), npm's own checks, and the Node and Git versions the tool requires.

## The judgment part

For each component on the agenda, the same questions, in this order. Answers go in the walkthrough's file.

1. **Who writes each fact this component touches?** One owner per fact (D-2026-11-24-one-fact-one-owner).
2. **What can leave the machine from here, and does it go through the one door?**
3. **Does any read write anything,** locally or outward?
4. **If it stops halfway, what does a rerun do?**
5. **With two processes at once, what happens?**
6. **What does it cost on a large repository, or with many bounties?**
7. **What do the references say?** Look up how established tools do it, and cite them before recommending anything.
8. **What does it tell an agent,** and is each claim in `CLAIMS.md`?

Each finding becomes a brief, or a line folded into one, or a backlog line, in the walkthrough's file. Nothing is fixed during the walkthrough itself.

## The record

- **One file per walkthrough,** `waves/WT-<date>.md`, with the script's agenda output, the answers by component, and the findings with where each went.
- **The tag `walkthrough/<date>`** on the commit it reviewed, pushed, so the next walkthrough's scope is mechanical.
- **New bug classes become scanners** (point 4) in the next K wave, so they cannot come back unseen.

## The register

Each pinned table, its test, and what it holds. A table not yet built names its wave.

| Table | Test | Holds | Wave |
|---|---|---|---|
| `tests/box/bounty/SURFACE.txt` | `bt62*.test.ts`, `surface.mjs` | every command, option, refusal, `--json` field | BT62; values lines BT99 |
| `tests/box/bounty/exit-sites.ts` | `bt82.test.ts` | every place data leaves | BT82; the door BT83 |
| `docs/box-v4/MEMORY-SPEC.md` section 3 | `bt75.test.ts` | where each fact lives | BT75 |
| `docs/box-v4/OWNER-SURFACE.md` | `owner-surface.test.ts` | every owner decision, its owner, tighten or loosen | BT89 |
| `docs/box-v4/CLAIMS.md` | `claims.test.ts` | every claim made to agents, with its guards | BT92 |
| `docs/box-v4/GIT-DEFENCES.md` | `git-defences.test.ts` | every Git defence, on every call | BT97 |
| `docs/box-v4/CHANNELS.md` | `channels.test.ts` | every install channel and its next step | BT91 |
| `packages/box-bounty/skill-targets.json` | `bt91.test.ts`, `skill-targets.mjs --check` | each agent's skill folder | BT91 |
| `packages/box-bounty/secret-rules.json` | `gitleaks-rules.mjs --check` | the scan's rules | BT78 |
| `docs/box-v4/CONTRACTS.md` guard ids | `proof-map.mjs --check` | each guarantee has a test | existing |
| `tests/platform/provider-shapes.json` | `provider-shapes.test.ts` | our stand-ins match real providers | PF56 |
