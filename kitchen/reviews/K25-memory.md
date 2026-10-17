# K25 review: the tool's memory for agents — measured, compared, decided

Wave K25, branch `wave/K25`, 17 October 2026. Cook: box-worker. Measurements from `kitchen/memory/measure.mjs` (rerun instructions inside it); documentation pages cited with the date read, all fetched live on 2026-10-17.

## The owner's page (read this first)

**How the tool remembers today, in five sentences.** Every bounty gets one small record file kept inside the project, which is the source of truth: what it was for, what the agent had tried, where the work stood, what came back, and how it ended. A short fixed block in the project's instruction file tells every new agent the tool exists — it gains exactly one line while a bounty is open and never grows past that. An optional session-start hook whispers the open-bounty state once, and each later event once. Everything else — the full list, one record's detail, the machine-readable document — the agent asks for with a command. Nothing about whether those record files should be committed is ever said, and nothing connects one bounty to another.

**The one table that shows what an agent sees as bounties grow** (characters; ~tokens = characters ÷ 4):

| What the agent reads | N = 1 | N = 100 | N = 1,000 (all open) | N = 1,000 (5 open, 995 ended) |
|---|---|---|---|---|
| The instruction-file block (unasked) | 327 | 327 | 327 | 327 |
| The session-start hook line (unasked) | 155 | 2,535 | 24,136 (~6,000 tk) | 253 |
| The status overview (asked once) | ~850 | ~57,000 | ~565,000 (~141,000 tk) | ~79,500 (~20,000 tk) |
| The machine-readable document of all records | 1,216 | 128,026 | 1,281,826 | 1,384,810 |
| One record's detail view | ~750 | ~753 | ~754 | ~766 |

The unasked block is perfectly constant; the hook's start line stays one line but its length follows the number of *open* bounties; the overview grows without bound both ways; one record's view is flat. Details in Step 2.

**What other tools do differently, in three sentences.** Claude's own instruction file and the shared agents-instruction convention keep the always-loaded text deliberately small (a ~200-line target; deeper files load only when touched) and push everything else behind on-demand reads — our block already does this. Beads, the closest sibling (a git-backed issue tracker for agents), stores relationships as first-class dependencies, gives agents a "what can I pick up now" query plus a small optional context injection, and it *commits* its store so any clone sees the same memory. Letta splits memory into a small pinned "core" the agent edits itself and an unbounded "archival" store that is searched, never loaded — exactly the unasked/on-request split our own rule names.

**The proposals** (Step 5 has the full paragraphs):

1. **Bound the overviews.** Keep every open bounty listed (they need attention), but ended bounties become a count plus the few most recent, with the rest one command away. The agent sees roughly the same 40 lines at a thousand bounties as at ten.
2. **Cap the hook's start line.** Past a small number of open bounties it says "N open" plus the first few ids, so unasked context stays constant in characters, not just in lines.
3. **Let a bounty name its job.** One optional free-text field recorded at create, shown on the ended line and searchable, restores what the retired job-name option gave up; posting to GitHub can additionally wire the issue's own blocked-by/sub-issue relations.
4. **Say whether the records are committed.** One line in the status and configuration views saying whether the record folder is tracked in Git, and a warning when the remote is public — the record holds private context (the why, the saved-job note, the local folder path) that a pushed commit would publish.
5. **A purpose search for the records.** A search command matches titles, whys and task texts across open and ended records and answers in one bounded line per hit — recall by purpose, which today does not exist.

**What should be left alone.** The instruction block, the "said once" mechanics, the record schema itself, and `--json` as the escape hatch: they already meet the rule. Do not add a sync service, a database or an embedding index — the measurements show the gap is bounded views and two missing fields, not storage.

---

## Step 1: the map of what an agent sees

| Layer | Trigger | What it shows | Code | Needs served |
|---|---|---|---|---|
| Instruction-file block (`<!-- box-bounty -->` … `/box-bounty`) | Rewritten on every record write, when the owner enabled `instructions` | 4 fixed lines + 1 line when a bounty is open or has a new solution — constant size at any N | `wording.ts` `rulesBlockInterior`/`RULES_LINES`; sync in `instructions.ts` `syncInstructions`, driven by `render.ts` `syncOpenSurfaces` | exists; something open |
| Hook (`hook start`/`pause`/`finish`) | Host runs the slot command at session start/prompt-submit/stop, once enabled | `start`: one line naming every open id+stage; `pause`/`finish`: one line per new event, each told once (`.box/hook-told.json`) | `hook.ts` `runHook`, `envelope` | what is open; what arrived |
| Record `.box/bounties/<id>.json` | Written by `create` and every later command; read by every command | Source of truth: id, title, why, `resume` saved job (branch, commit, changed files, note), events, attempts + reports, waiting, scanFindings, github | `record.ts` `writeNewRecord`, `persistRecord`, `asRecord` | all four needs, per record |
| `.box/bounties/OPEN` | Rewritten on every record write | One line joining every open id, title, stage (and any GitHub answer listing) | `render.ts` `renderOpenLine` | what is open |
| `box bounty` (overview) | Agent asks | One-line description + the full status view | `render.ts` `renderOverview` | what exists, what's next |
| `box bounty status [<id>] [--full] [--comments] [--since]` | Agent asks | Open bounties in full; ended as one joined line; `--since` a time-filtered summary | `render.ts` `renderStatus`; `owner.ts` `renderSummary` | purpose, next step; recall by time only |
| `status --json`, `look --json`, `config --json` | Agent asks | Machine-readable documents | `json.ts` `statusDocument`, `lookDocument` | integration |
| `box bounty look <id> <n>` | Agent asks | One solution's diff and fact report | `look.ts` | what came back |
| GitHub issue + format block | At `post --to github`; refreshed on reads | The public copy: task, state, answer listing | `github.ts`, `post.ts` | handover of public facts only |
| Owner side (`settings.json`, `state.json`) | Owner decisions; tool bookkeeping | Decisions, once-marks, first-merge notices | `settings.ts` | not agent memory |

Two structural facts the map exposes:

- **The unasked tier is the block and the hook only** — everything else is opt-in. The block is already perfectly constant.
- **Surfaces go stale, never sync on read.** `OPEN` and the block are rewritten only on *writes*. A record that arrives via `git pull` (records shared across clones) leaves the block and `OPEN` stale until the next write — a clone that inherits records sees them through `status` but the block never learns of them until something writes.

## Step 2: measured growth

`node kitchen/memory/measure.mjs` builds scratch repos in `%TEMP%\kitchen-K25-*` (removed in a `finally`), seeds N−1 records directly in today's shape plus one real `bounty create` so `OPEN` and the block are produced by the tool's own write path, and runs each surface through the built CLI with a scratch `BOX_BOUNTY_SETTINGS_DIR`. Cells are `lines / characters / ~tokens (chars÷4, estimate) / wall ms`; wall time varies with host load, sizes are deterministic.

### Mix A — every record open

| surface | N=1 | N=10 | N=100 | N=1,000 |
|---|---|---|---|---|
| instruction-block sync (wall) | 204 ms | 217 ms | 312 ms | 1,882 ms |
| instruction block in AGENTS.md | 7 / 327 / 82 | 7 / 327 / 82 | 7 / 327 / 82 | 7 / 327 / 82 |
| `.box/bounties/OPEN` | 1 / 125 / 31 | 1 / 755 / 189 | 1 / 7,145 / 1,786 | 1 / 71,945 / 17,986 |
| `hook start` | 1 / 155 / 39 / 234 | 1 / 374 / 94 / 216 | 1 / 2,535 / 634 / 344 | 1 / 24,136 / 6,034 / 1,827 |
| `box bounty` | 10 / 847 / 212 / 190 | 64 / 5,918 / 1,480 / 218 | 604 / 56,680 / 14,170 / 322 | 6,004 / 565,182 / 141,296 / 1,619 |
| `status` | 9 / 751 / 188 / 200 | 63 / 5,822 / 1,456 / 250 | 603 / 56,584 / 14,146 / 300 | 6,003 / 565,086 / 141,272 / 1,727 |
| `status --json` | 1 / 1,216 / 304 / 240 | 1 / 12,736 / 3,184 / 249 | 1 / 128,026 / 32,007 / 342 | 1 / 1,281,826 / 320,457 / 1,534 |
| `status <one id>` | 9 / 751 / 188 / 191 | 9 / 752 / 188 / 215 | 9 / 753 / 188 / 318 | 9 / 754 / 189 / 1,654 |

### Mix B — five open, the rest ended (the steady state)

| surface | N=1 | N=10 | N=100 | N=1,000 |
|---|---|---|---|---|
| instruction-block sync (wall) | 187 ms | 196 ms | 322 ms | 1,707 ms |
| instruction block in AGENTS.md | 7 / 327 / 82 | 7 / 327 / 82 | 7 / 327 / 82 | 7 / 327 / 82 |
| `.box/bounties/OPEN` | 1 / 125 / 31 | 1 / 405 / 101 | 1 / 405 / 101 | 1 / 405 / 101 |
| `hook start` | 1 / 155 / 39 / 245 | 1 / 253 / 63 / 178 | 1 / 253 / 63 / 346 | 1 / 253 / 63 / 1,728 |
| `box bounty` | 10 / 859 / 215 / 256 | 38 / 3,866 / 967 / 207 | 38 / 10,662 / 2,666 / 391 | 38 / 79,513 / 19,878 / 1,708 |
| `status` | 9 / 763 / 191 / 167 | 37 / 3,770 / 943 / 193 | 37 / 10,566 / 2,642 / 473 | 37 / 79,417 / 19,854 / 1,778 |
| `status --json` | 1 / 1,216 / 304 / 210 | 1 / 13,255 / 3,314 / 236 | 1 / 137,860 / 34,465 / 368 | 1 / 1,384,810 / 346,203 / 1,976 |
| `status <one id>` | 9 / 763 / 191 / 171 | 9 / 764 / 191 / 199 | 9 / 765 / 191 / 325 | 9 / 766 / 192 / 1,531 |

### What the numbers say, per tier

- **Unasked:** the instruction block is constant at 327 characters at every N — exactly the rule's target. The hook's start line is one *line* but not one *size*: ~24 characters per open bounty, so ~24 KB (~6,000 tokens) injected unasked at 1,000 open bounties. With few open bounties it is constant. Verdict: constant in lines, **linear in characters** with open count.
- **Overview:** `box bounty`/`status` grow ~565 characters per open record and ~75 characters per ended record (the `ended:` line joins every ended record). At 1,000 open: ~565 KB ≈ 141,000 tokens — the whole context of some agents, for one overview. At 5 open + 995 ended: still ~80 KB ≈ 20,000 tokens because the ended list never truncates. **Both mixes are unbounded.**
- **On request:** `status <id>` is flat (~750 characters at any N). Bare `status --json` returns every record at ~1.3 KB each (~1.3–1.4 MB at N=1,000) — the caller asked for all of it, so this is by design, but it is the firehose any tool-building agent will hit first.
- **Wall time** stays under ~2 s even at N=1,000 on this host — file reads and one render pass; no process fan-out. Size, not speed, is the problem.
- **`OPEN` and the block** track *open* records only — both are constant in the ended mix, linear in the all-open mix.

## Step 3: how others do it

Every page below was fetched live and read on **2026-10-17**.

| Tool | Where memory lives | Always loaded (and size) | How the rest is found | Relationships | Between machines | Cost to the agent |
|---|---|---|---|---|---|---|
| **Claude Code** — [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory) | `CLAUDE.md` (+ `CLAUDE.local.md`, `.claude/rules/`, `@import`s, per-repo "auto memory") | CLAUDE.md tree at launch; docs advise **under 200 lines**; subdirectory files load on demand when their files are touched; auto memory capped at first 200 lines / 25 KB | The agent reads files itself; path-scoped rules trigger on matching paths | None — it's prose | Committed with the repo (`CLAUDE.local.md` gitignored) | Fixed instruction file + what it chooses to read |
| **AGENTS.md** — [agents.md](https://agents.md/) | One Markdown file per directory, committed | Nearest file always loaded; nested files for subprojects | Agent reads; closest file wins | None | Travels in the repo by definition | One file's worth, always |
| **Beads** — [github.com/steveyegge/beads README](https://raw.githubusercontent.com/steveyegge/beads/main/README.md) | `.beads/` Dolt database in the project; `issues.jsonl` export is a view, not truth | `bd prime` injects a small workflow context + persistent memories; the AGENTS.md snippet it installs is ~6 lines | `bd ready` (unblocked work), `bd show`, `bd dep tree`, JSON output; "compaction" summarizes old closed work | First-class: `bd dep add` (blocks, related, parent-child), hierarchical ids `bd-a3f8.1` | `bd dolt push/pull` to `refs/dolt/data` on the git remote; `--stealth` for uncommitted local use | Small injection + explicit queries |
| **Letta** — [docs.letta.com/guides/agents/memory](https://docs.letta.com/guides/agents/memory), […/archival-memory](https://docs.letta.com/guides/agents/archival-memory) | Server-side DB: memory blocks + archival vector store | "Core" memory blocks pinned in context; agent-editable | `archival_memory_insert`/`search` tools — archival is **never** pinned, queried on demand; all messages persist post-compaction | Blocks can be shared across agents | Lives server-side by design | Pinned core + retrieval calls |
| **Mem0** — [docs.mem0.ai overview](https://docs.mem0.ai/overview) | Managed memory store (vector + rerankers) | Nothing loaded unasked | `search` returns only relevant memories; extraction distills conversations into facts | Entity linking across memories | Server-side | Query cost only |
| **Zep** — [help.getzep.com concepts](https://help.getzep.com/concepts) | "Context Graph" per user/graph: facts, entities, episodes, summaries, with provenance and temporal invalidation | An assembled "Context Block" (the app chooses size) | `graph.search_*` / `thread.get_context`; fact invalidation recorded on edges | Graph relations are the storage model | Server-side | Context block + retrieval |
| **GitHub itself** — [adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues), [issue dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies) | Issues, labels, sub-issues (≤100 per parent, 8 levels deep), blocked-by/blocking dependencies | None — an agent reads `gh issue view` output, which prints "Blocked by"/"Blocking" rows | `gh issue list`, `gh issue view`, project views | Native: sub-issues and blocked-by/blocking, all via `gh` | GitHub is the store — any clone sees it | What the agent asks `gh` for |

### Lessons that apply to us, tied to the four needs

1. **Small pinned core + searched archive is the universal shape** (Letta's core/archival split, Claude's 200-line cap, Zep's assembled context block). Our block already is the pinned core — keep it that size forever; every growth belongs behind a command. (Need: all four.)
2. **"What is ready" is the query agents actually run** (Beads' `bd ready`, `bd prime`). Our equivalent is `status` — which is why its unbounded growth matters more than `--json`'s. (Need: what was created.)
3. **Relationships are first-class data everywhere that supports them** (Beads `dep add`, GitHub sub-issues/blocked-by) — never encoded in prose notes. Our `--resume` note can't answer "which bounties belong together" mechanically. (Need: how bounties relate.)
4. **The store travels with the work** (Beads commits/pushes its DB via the remote; GitHub is already remote; Letta/Mem0/Zep are server-side). A tool memory that lives only in one checkout dies at the clone boundary. (Need: handover.)
5. **Old work decays by design** (Beads' compaction; Zep's invalidation; Mem0's distillation). Our ended records never decay in the views — the `ended:` line is the rawest expression of that. (Need: growth.)

## Step 4: the four thin places, decided

### 1. Relationships — **confirmed**

Nothing in the record links two bounties: no field, no command, no derived view (`record.ts` `BountyRecord` — the retired `job` field is read-back display text on old records, written by nothing). Evidence: the step-1 map; `grep` of the package finds no relation field; the `ended:` line's `(job: …)` fallback renders `record.job?.file ?? record.title` — a name the tool can no longer write.

Options seen in Step 3:

| Option | Unasked | Overview | On request | Note |
|---|---|---|---|---|
| A free-text `job`/relation field on the record | nothing | +0 lines (a name inside an existing line) | `find` can match it | Restores what `--job` gave; Beads' `relates-to` is the same idea |
| GitHub sub-issues / blocked-by at `post` | nothing | nothing | visible in `gh issue view` | Free, native, but only exists for GitHub-posted bounties and the tool would have to maintain it |
| Nothing — the `--resume` note carries it | — | — | — | Refuted as recall: unsearchable prose, unverifiable |

**Recommendation:** a small record field (proposal 3), with GitHub's native relations as an optional mirror for posted bounties — not a replacement, since unposted draft bounties have no issue.

### 2. Handover across machines — **confirmed, and it has a safety edge**

The tool never says whether `.box/bounties/` is tracked. `record.ts`'s header says "committing it is the agent's normal flow," but nothing checks, advises or gitignores. What a clone of the repo sees depends entirely on that unwritten choice.

**Every field a committed record exposes** (verified against `BountyRecord`, `Attempt`, `StageEvent`, `WaitingFor`, `ScanFinding` and `ResumeContext` in `record.ts`, `GitHubPublication` in `gh.ts`, `PayToFact`/`PayOutcome` in `pay.ts`), split by whether the public GitHub surface already carries it:

*Already public on the issue or the pushed bounty branch (posted records):* `id`, `title`, `stage`, `createdAt`, `kind`, `schemaVersion`; `reward.amount` and `allowedBy{decision, level, decisionAt, usedAt}`; the whole `github` block — `repository`, `account`, `branch`, `commit`, `title`, `body`, `issue{number,url}`, `state`, `kind`, `base`, `pushed[{sha,subject}]`, `wipCommit`, `wip{changed,added,deleted}`, `questions{count,latestAt,unnamed}`, `seenPullRequests`/`availablePullRequests` (`[{n,commit,at,author,payTo}]`), `pay{pr,solver,link,testMode,editedBy,readFailed}`, `closedNote`, `scanBinary`, the `formatRead*`/`formatRepair`/`unavailable*` bookkeeping, and `outside{at,issueState,answers}` (stranger-written listing text, credential-redacted); and the public half of `attempts[]` (`n`, `pullRequest`, `author`, `commit`, `changed`/`added`/`deleted`, `payTo`) and of `events[]` (`stage`, `at`, `destination`, `merge`, `attempt`).

*Owner-only / local-only context the same commit would publish:* `why` (the reason for handing off); `folder` (an absolute host path — leaks the local username and directory layout); `resume{kind, branch, commit, changed[], note}` (the posting agent's local branch, commit, dirty-file list and `--resume` note); `content{task{file,text}, note{file,text}|null, tool}` (the full task and hand-off note text); `job{file,text}` (a legacy local file reference nothing writes any more); `noteSource`, `manifestSha256`, `snapshot{commit,tree,baseCommit}` and `conflicts{paths,at}`; the private half of `events[]` — `reason` (failure and abort classes), `command`, `unasked`, `partial[]`; the private half of `attempts[]` — `seenAt`, `at`, `outcome`, `conflicts`, `report[]` (the tool's fact report) and `description` (unchosen solvers' full pull-request descriptions); `waiting{for, reason, at, to, choice{withChanges,include}, hits[{path,line,rule,commit}], shown{base,head,tip,pushed,include,leftHome,untracked}, answered, merge}` (what is held for the owner, the flagged paths and lines, and exactly what the owner was shown); `scanFindings[{at, where, hits[{path,line,rule,commit}], settled}]` — the paths and line numbers of every secret-scanner hit; and `githubApproval{repository, preview, base, head, tip, tipTree, title, body, pushed[{sha,subject}], wipCommit, wip, include, withChanges, leftHome, untracked}` — the approved publish plan, including exactly what was deliberately left home.

- **If committed:** another machine sees everything — including every owner-only field above. `publish-plan.ts` already classifies `.box/bounties/` as owner-only context that is never published ("the tool's own bounty records carry owner-only context and are never published"). And the exposure is not hypothetical: `post` refuses private repositories (the hard stop "a private repository is never posted outside"), so **every repository that posts a bounty to GitHub is public**, and `origin` is public regardless — committing `.box/bounties/` to a branch pushed to `origin` publishes `why`, `resume`, `folder`, `scanFindings`, `githubApproval` and unchosen solvers' descriptions to a public repository unless the folder is ignored or stripped before push. That is a quiet end-run around the never-publish rule.
- **If not committed:** a fresh clone sees only the GitHub issues. The issue's format block carries id/stage/public facts — enough for "a bounty existed and its public state," not the saved job, the note, or solution facts. Handover of *private* context fails silently; worse, `OPEN` and the block never sync on read (step 1), so even inherited records leave the unasked surfaces stale.

What established tools do: Beads syncs its store through the git remote (`bd dolt push` to `refs/dolt/data`) and offers `--stealth` for "never commit"; GitHub carries the public half natively. Both make the choice **explicit**.

**Recommendation: let the tool say which — never a silent default.** `status`/`config` should state whether `.box/bounties/` is tracked, and warn when the repo's remote is public that the record carries owner-only context (`why`, the saved job, the host `folder` path, `scanFindings`, the approved `githubApproval` plan). Because the product refuses private repositories, that warning fires for every GitHub-posted repository — committing records there publishes them. On genuinely private projects (folder-less, never posted), committing is the right default and should be documented. Hard stop that must not weaken: **owner-only context (`why`, `--resume` note, solver descriptions) must never reach outside surfaces** — any commit guidance must preserve the existing never-publish rule, and a public remote should make the tool say so plainly.

### 3. Recall — **confirmed**

Ended records persist but nothing finds them by purpose: `status --since` filters by time only (`renderSummary`); `status` lists everything; no search exists. An agent can `grep` the record files itself — but only on the machine that has them, and only if it knows the shape. (Need: "have we asked for help on the parser before?")

### 4. Growth — **confirmed**

Step 2's tables: the overview is unbounded in both mixes (≈565 chars/open, ≈75 chars/ended; ≈141k and ≈20k tokens respectively at N=1,000), and the hook's start line grows ≈24 chars/open — one line, but an unbounded one. `status <id>` and the instruction block are flat.

## Step 5: proposed waves (in order)

1. **Bound the ended list** *(need: growth).* `status` and `box bounty` print `ended: <count>` plus the few most recent ended records (say, five, one line each) and name the command for the rest (`status --since`, or a bounded `--ended` listing). Before: 79.5 KB at 995 ended; after: ~2–3 KB at any N. Adds nothing to unasked. Passes "only what the tool is needed for": an agent could page records itself only by parsing record internals the tool owns.
2. **Cap the hook's start line** *(growth, unasked tier).* Past ~10 open bounties the line becomes `N open bounties — <first few ids> — see: box bounty status`. Before: ~24 KB at 1,000 open; after: constant ~300–600 characters. Keeps the unasked tier constant in characters, not just lines — the exact rule this wave holds proposals to.
3. **`--job "<name>"` restored as a relation field** *(relationships).* Optional free-text job name at `create`, stored on the record, printed inside existing status lines (no new lines), matchable by proposal 5's `find`; `post --to github` may additionally mark the issue blocked-by/sub-issue of sibling bounties' issues. Before: nothing machine-readable; after: `status`/`find` can group bounties by job. Unasked: unchanged.
4. **State record tracking, warn on public remotes** *(handover).* One line in `status`/`config` naming whether `.box/bounties/` is tracked, plus a plain warning when the remote is public that records hold owner-only context (`why`, `resume`, `folder`, `scanFindings`, `githubApproval`) a pushed commit would publish unless the folder is ignored or stripped. Since `post` refuses private repositories, every repository that uses `box bounty` on GitHub is public — the warning applies to all of them. Nothing added to unasked; one bounded line to overview. Names the hard stop it guards: owner-only context never reaches outside surfaces.
5. **`box bounty find "<text>"`** *(recall).* Searches title, `why`, task text and job name across open and ended records; one line per hit, bounded. An agent could grep the JSON itself — this command is justified because the record shape is the tool's to own (it already migrates old shapes in `asRecord`; a grepper would not).

## What was not examined, and why

- **Real (non-synthetic) records at scale:** the synthetic records match today's shape but carry no `github` blocks, attempts or scan findings — GitHub-published records are heavier. The shape floor is honest; real growth is *at least* this.
- **`look`, `status --comments`, `config`:** single-bounty or fixed-size surfaces; measured `status <id>` as their representative (all flat by construction).
- **Pause/finish hook slots:** same per-event line shape as `start`; `start` is the unasked maximum.
- **Non-Devin hosts' hook envelopes:** the `claude` format shares the envelope shape; only `devin` was exercised.
- **The owner's `status --since` view** was mapped, not measured — same unbounded join as `ended:`.
- **Solver-side memory** (what a solver agent sees inside a bounty folder) is a different subject and was out of scope.

### Method and principles

Playbook followed: `investigation` — map and measure before judging; Steps 1–2 map and measure, only Steps 4–5 decide. Principles read, and the decision each changed:

- **guard-the-context-window** — the unasked tier was treated as the scarce, non-renewable resource: proposals 1–2 bound what is injected before any addition was considered, and every proposal had to show its unasked cost stays constant.
- **minimize-reader-load** — the report opens with a one-page owner summary and a single growth table rather than the raw measurement tables, and each proposal is one paragraph.
- **subtract-before-you-add** — proposals 1, 2 and 4 bound or annotate surfaces that already exist; only proposal 5 adds a command, justified because the record shape is the tool's to own (a grepper would break on `asRecord` migrations).
- **model-the-domain** — the four needs and three tiers became the structure every surface, option and proposal is classified against, instead of judging each surface ad hoc; Step 4's exposure list groups fields by the domain fact that matters (already public vs owner-only).

---

## After BT28 — the same measurement rerun on the built candidate

`node kitchen/memory/measure.mjs`, 17 October 2026, same script and cells as Step 2 (`lines / characters / ~tokens / wall ms`). Proposals 1, 2, 4 and the `find` half of 5 are in; the numbers below are the measured after-state, not the estimates Step 5 made.

### Mix A — every record open

| surface | N=1 | N=10 | N=100 | N=1,000 |
|---|---|---|---|---|
| instruction-block sync (wall) | 167 ms | 185 ms | 282 ms | 1,296 ms |
| instruction block in AGENTS.md | 7 / 327 / 82 | 7 / 327 / 82 | 7 / 327 / 82 | 7 / 327 / 82 |
| `.box/bounties/OPEN` | 1 / 125 / 31 | 1 / 755 / 189 | 1 / 753 / 188 | 1 / 754 / 189 |
| `hook start` | 1 / 155 / 39 / 147 | 1 / 374 / 94 / 165 | 1 / 387 / 97 / 267 | 1 / 389 / 97 / 1,342 |
| `box bounty` | 10 / 847 / 212 / 163 | 64 / 5,918 / 1,480 / 175 | 604 / 56,680 / 14,170 / 275 | 6,004 / 565,182 / 141,296 / 1,292 |
| `status` | 9 / 751 / 188 / 158 | 63 / 5,822 / 1,456 / 174 | 603 / 56,584 / 14,146 / 275 | 6,003 / 565,086 / 141,272 / 1,372 |
| `status --json` | 1 / 1,261 / 315 / 201 | 1 / 12,781 / 3,195 / 204 | 1 / 128,071 / 32,018 / 346 | 1 / 1,281,871 / 320,468 / 1,434 |
| `status <one id>` | 9 / 751 / 188 / 150 | 9 / 752 / 188 / 185 | 9 / 753 / 188 / 291 | 9 / 754 / 189 / 1,655 |

### Mix B — five open, the rest ended (the steady state)

| surface | N=1 | N=10 | N=100 | N=1,000 |
|---|---|---|---|---|
| instruction-block sync (wall) | 160 ms | 182 ms | 277 ms | 1,260 ms |
| instruction block in AGENTS.md | 7 / 327 / 82 | 7 / 327 / 82 | 7 / 327 / 82 | 7 / 327 / 82 |
| `.box/bounties/OPEN` | 1 / 125 / 31 | 1 / 405 / 101 | 1 / 405 / 101 | 1 / 405 / 101 |
| `hook start` | 1 / 155 / 39 / 159 | 1 / 253 / 63 / 177 | 1 / 253 / 63 / 283 | 1 / 253 / 63 / 1,284 |
| `box bounty` | 10 / 859 / 215 / 154 | 38 / 3,866 / 967 / 181 | 38 / 3,932 / 983 / 288 | 38 / 3,940 / 985 / 1,313 |
| `status` | 9 / 763 / 191 / 343 | 37 / 3,770 / 943 / 181 | 37 / 3,836 / 959 / 289 | 37 / 3,844 / 961 / 1,471 |
| `status --json` | 1 / 1,261 / 315 / 296 | 1 / 13,300 / 3,325 / 233 | 1 / 137,905 / 34,476 / 330 | 1 / 1,384,855 / 346,214 / 1,342 |
| `status <one id>` | 9 / 763 / 191 / 162 | 9 / 764 / 191 / 177 | 9 / 765 / 191 / 297 | 9 / 766 / 192 / 1,282 |

### What changed, before → after

- **`hook start`, all-open N=1,000:** 24,136 → 389 characters — flat from N=100 (387) to N=1,000 (389), under the brief's 600-character bar. `OPEN` likewise: 71,945 → 754 characters at N=1,000, flat at N≥10.
- **The overview in the steady state:** `box bounty` 79,513 → 3,940 and `status` 79,417 → 3,844 characters at N=1,000 — flat from N=100 (3,932 / 3,836) to N=1,000, under the 4,500-character bar.
- **Small N is unchanged:** every surface's size at N=1 and N=10 matches the before table within measurement noise — the caps only engage past their limits.
- **What stays unbounded by design:** the all-open `box bounty`/`status` views (every open record still needs attention — the brief bounded ended records and the unasked tier, not the open list) and `status --json` (the caller asked for every record; `find` is the bounded recall path that landed with it).
- Wall time is unchanged in shape — ~1.3–1.7 s at N=1,000, the same file-read cost as before.
