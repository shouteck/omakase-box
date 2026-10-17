# K26 review: what every agent on the project shares, and what stays on one machine

Wave K26, branch `wave/K26`, 18 October 2026. Cook: box-worker. Design investigation — no product code, no tests changed. Field classification verified against `packages/box-bounty/record.ts` (`BountyRecord`, `Attempt`, `WaitingFor`, `StageEvent`, `ResumeContext`, `ScanFinding`, `AllowedBy`, `AnswerSpec`), `gh.ts` (`GitHubPublication`), `pay.ts` (`PayToFact`, `PayOutcome`), and the readers `render.ts`, `json.ts`, `find.ts`, `hook.ts`, `instructions.ts`, `post.ts`, `publish-plan.ts`. Started from `kitchen/reviews/K25-memory.md` Step 4.2's field lists.

## The owner's page (read this first)

**What every agent will share.** Each bounty keeps two records instead of one. A *shared* record travels with the code — committed like a commit message — and carries what any agent on the project, on any machine, now or later, needs: that the bounty exists, what it was for, why it was handed off, what was already tried, which larger job it is part of, where that job stood, and the public facts of its outside life (the issue, its state, the solution that was merged). A *local* record stays on the machine that ran the commands and keeps machine state: the local branch and uncommitted files, the folder path, pending owner questions, scan findings, rejected solutions' text, and the GitHub refresh cache.

**What stays on one machine.** Anything that names this machine's state (an absolute path, a local branch name, a dirty-file list, a timestamp of a local refresh), anything the owner has not yet answered, and anything a stranger wrote that was not merged — by the owner's decision 5 of 17 October 2026.

**The example, in the new design.** Agent A's flaky-test bounty commits a shared record: the task, the why ("tried 3 fixes… suspect clock skew"), `partOf: "OAuth migration"`, and the job-handover note "halfway through moving the session store; `migrateSession` is written, `revokeSession` and `cleanupExpired` still call `memoryMap`". Her branch `oauth-wip`, her uncommitted `src/auth/session.js` and `scratch/debug.log`, her folder path, the scan finding and the two rejected solutions stay local. A week later Agent B clones the project, sees the open-bounties line, reads the shared record, does not fix the same test in parallel, does not retry the three failed fixes, and knows the session-store move is half done.

**What the experiment showed.** Three clones differing only in what they carry — (a) today's full records, (b) only the shared tiers, (c) only the public issue — were each handed to a fresh agent told "continue the OAuth migration in this project; use whatever tools are here." All three found the open task and the real bug (clock skew in the mock) and retried none of the three failed fixes. The decisive difference was the unfinished work: the agent with only the shared part picked up the half-done session-store move and finished it, exactly as well as the agent with the full records; the agent with only the public issue fixed the test but never learned the session-store move existed, and left the larger job half done. The shared part carried everything the fuller record carried — and the public issue alone was not enough.

**The one rule a reader must keep.** Drafts share nothing: nothing enters the shared record before the owner has allowed posting. A shared field is written only at milestones (posted, solution merged, closed, part-of changed) — never on a read.

---

## Step 1: every field, classified

Tiers: **anyone** (already public on the issue or the pushed bounty branch), **project agents** (the shared mental model — public in a public repository, per the owner's decision 3), **this machine** (machine state, pending owner interaction, stranger text not merged). A field already public is *anyone* whichever tier it would otherwise be; "anyone" is the widest audience the field may reach, and everything in it is also project-agents knowledge.

### `BountyRecord` top-level fields (`record.ts`)

| field | what it holds | public on issue/branch? | tier | reason |
|---|---|---|---|---|
| `schemaVersion` | record schema marker, always `1` | yes (format block carries the record's public facts) | anyone | boilerplate; the issue's format block is written from the same shape |
| `kind` | `'box-bounty-record'` marker | yes (the format block names `box-bounty`) | anyone | boilerplate |
| `id` | `bt-<12 hex>` | yes (`<!-- box-bounty:<id> -->` in the issue body) | anyone | public identifier |
| `title` | bounty title | yes (issue title) | anyone | public |
| `stage` | current journey stage | yes (format block) | anyone | public milestone state |
| `createdAt` | create timestamp | yes (issue created at the same posting) | anyone | public |
| `why` | one line of why the work was handed off (`create --why`) | no — kept off the issue today | project agents | owner decision 3: the why is shared like a commit message; it is what stops a later agent repeating the hand-off |
| `partOf` | the job or bounty this belongs to (`create --part-of`, BT28) | no | project agents | the relation another agent needs ("part of the OAuth work — do not fix the same test") |
| `job` (legacy) | `{file, text}\|null` retired `--job` read-back | no | project agents | same fact as `partOf` on records old enough to carry it; nothing writes it |
| `reward.amount` | whole-dollar amount bound at posting | yes (issue states the reward) | anyone | public |
| `folder` | absolute path of the bounty folder `create` wrote | no | this machine | absolute host path — leaks username and directory layout (decision 5) |
| `content.task.file` | repo-relative path of the task file | yes (the task text is the issue body; the file path rides the bounty) | anyone | public with the task |
| `content.task.text` | the task text written for the solver | yes (issue body) | anyone | public |
| `content.note` | `{file, text}\|null` hand-off note | partly — the tried-note is shared, the generated-from-local-changes note is local | **mixed — see Step 2** | the note's knowledge ("what was tried") is shared; a generated note's provenance in local edits is machine detail |
| `content.tool` | tool name/version that wrote the bounty | yes (rides the posted bounty metadata) | anyone | public provenance |
| `noteSource` | `'authored' \| 'generated' \| 'legacy'` | no | project agents | provenance of the shared note; harmless and needed to read the note correctly |
| `resume` | `ResumeContext` saved job | **mixed — see Step 2** | **mixed** | the larger job and where it stood is shared; branch/commit/dirty files are machine state |
| `manifestSha256` | sha256 of the `bounty.json` bytes | no | this machine | binds a returned manifest on this machine; meaningless to another clone (folder delivery) |
| `snapshot` | `{commit, tree, baseCommit}` create-time capture — old records only | no (the commits may exist only locally) | this machine | local object ids; new records store nothing |
| `attempts[]` | every solution handed back | **mixed — see Step 2** | **mixed** | public attempt facts vs rejected solutions' text and local bookkeeping |
| `conflicts` | `{paths, at}\|null` paths a dry merge flagged | no | this machine | transient local merge state; `paths` are repo-relative but only meaningful to the machine doing the apply |
| `events[]` | one entry per stage transition | **mixed — see Step 2** | **mixed** | dates and merges of public milestones vs local reasons/commands |
| `waiting` | `WaitingFor` — an action held for the owner | no | this machine | pending owner question; decision 5 |
| `scanFindings[]` | `ScanFinding[]` pre-publish scan hits | no | this machine | flagged paths+lines of secret-shaped content; decision 5 |
| `allowedBy` | `AllowedBy` which owner answer allowed the post | yes (the posting's own public trail states the owner allowed it) | anyone | recorded on the public `posted` milestone |
| `github` | `GitHubPublication` — see below | partly | **mixed** | public issue facts vs local refresh cache |
| `githubApproval` | the approved publish plan | no | this machine | includes `leftHome`/`untracked` — what deliberately stayed home; decision 5 |
| legacy `answer` (`AnswerSpec`) | pre-`attempts` single answer `{commit, changed, added, deleted}` | no (local pinned ref) | this machine | loaded and converted to attempt 1 by `asRecord`; same treatment as an unmerged attempt |

### `ResumeContext` sub-fields

| field | what it holds | public? | tier | reason |
|---|---|---|---|---|
| `resume.kind` | `'not-recorded' \| 'recorded'` | no | project agents | shape marker needed to read the shared note |
| `resume.branch` | the posting agent's local branch | no | this machine | local branch name — machine state |
| `resume.commit` | HEAD commit at create | partly (the commit may be pushed later) | this machine | a local object id; the shared record says "the larger job", not this machine's SHA |
| `resume.changed[]` | uncommitted/dirty file list at create | no | this machine | machine state (decision 5) |
| `resume.note` | the `--resume` note: the larger job and where it stood | no | project agents | owner decision 3: shared like a commit message — this is the "halfway through the session-store move" fact Agent B needs |

### `Attempt` sub-fields (`attempts[]`)

| field | what it holds | public? | tier | reason |
|---|---|---|---|---|
| `attempt.n` | stable 1-based number (= PR number for GitHub collections) | yes | anyone | names the PR publicly |
| `attempt.pullRequest` | PR number collected from | yes | anyone | public |
| `attempt.author` | solver's GitHub login | yes | anyone | public on the PR |
| `attempt.commit` | the answer commit | yes | anyone | pushed/fetched commit; the merged one lands in history |
| `attempt.changed[]` `added[]` `deleted[]` | the solution's path lists | yes | anyone | public in the PR diff |
| `attempt.payTo` | parsed `pay-to:` fact — `PayToFact{state, link}` (`pay.ts`: `state` = `none\|unrecognised\|recognised\|test-mode`; `link` = the payment-link address) | yes | anyone | parsed from the public PR description; `state`/`link` are the solution's own public pay-to facts |
| `attempt.at` | collection timestamp | no | this machine | when *this* machine collected it |
| `attempt.seenAt` | when this machine's `status` first showed it | no | this machine | per-machine "seen" bookkeeping |
| `attempt.outcome` | `'answered' \| 'set-aside'` | no | this machine | local decision bookkeeping; a stranger's rejection is not published |
| `attempt.conflicts` | dry-merge conflict paths `\|null` | no | this machine | this machine's merge read |
| `attempt.report[]` | the fact report rendered at collection | no | this machine | decision 5: rejected solutions' reports stay local; the merged solution's merge is already public history |
| `attempt.description` | the PR description text, credential-redacted | no | this machine | stranger-written text; `fromOthers` rules; only the merged solution's merge enters history |

### `StageEvent` sub-fields (`events[]`)

| field | what it holds | public? | tier | reason |
|---|---|---|---|---|
| `event.stage` | the stage reached | yes | anyone | public milestones (posted, applied, closed) mirror issue/PR state — the shared record carries only posted-and-later events; `drafted`/`confirmed` are local pre-post transitions and never enter the shared part (decision 4) |
| `event.at` | transition timestamp | yes | anyone | public milestone dates (issue/PR timestamps); the `at` of a shared event is a posted-and-later milestone date — local `drafted`/`confirmed` timestamps stay local with their events |
| `event.destination` | where a `posted` event went | yes | anyone | public |
| `event.merge` | the commit a merge made | yes | anyone | the merge lands in public history |
| `event.attempt` | which attempt the transition was about | yes | anyone | public with the merged PR |
| `event.reason` | failure/abort class | no | this machine | local command outcomes (decision 5: failure reasons local) |
| `event.command` | the command that drove it | no | this machine | names local tool/owner actions |
| `event.unasked` | "owner was not asked before this merge" | no | this machine | owner-interaction bookkeeping |
| `event.partial[]` | solution paths the merge left as they were | no | this machine | detail of this machine's merge |

### `WaitingFor` sub-fields

All `waiting` — the held action and everything bound to it — is **this machine** (a pending owner question).

| field | what it holds | tier |
|---|---|---|
| `waiting.for` | `'post' \| 'close' \| 'merge'` | this machine |
| `waiting.reason` | `owner-allow/-ask/-off \| secrets \| untracked-file` | this machine |
| `waiting.at` | when the wait began | this machine |
| `waiting.to` | intended destination | this machine |
| `waiting.choice{withChanges, include[]}` | the intended post choices | this machine |
| `waiting.hits[]{path,line,rule,commit?}` | flagged scan hits held on | this machine |
| `waiting.shown{base,head,tip,pushed[],include[],leftHome,untracked}` | what the owner was shown would publish | this machine |
| `waiting.answered{at, shown?}` | the owner's one answer, bound to `shown` | this machine |
| `waiting.merge{n,commit,head}` | what a held merge is bound to | this machine |

### `ScanFinding` sub-fields — all **this machine**

| field | what it holds | tier |
|---|---|---|
| `scanFinding.at` | when flagged | this machine |
| `scanFinding.where` | `'create' \| 'post'` | this machine |
| `scanFinding.hits[]{path,line,rule,commit?}` | the flagged paths/lines/rules | this machine |
| `scanFinding.settled` | what happened (`went-out`/`ended` text or null) | this machine |

### `AllowedBy` sub-fields — **anyone** (recorded on the public `posted` milestone)

| field | what it holds | tier |
|---|---|---|
| `allowedBy.decision` | `'allowed' \| 'once'` | anyone |
| `allowedBy.level` | `'project' \| 'default' \| 'this-bounty'` | anyone |
| `allowedBy.decisionAt` | when the owner's answer was written | anyone |
| `allowedBy.usedAt` | when the post used it | anyone |

### `GitHubPublication` sub-fields (`github`, `gh.ts`)

| field | what it holds | public? | tier | reason |
|---|---|---|---|---|
| `github.repository` | `owner/repo` | yes | anyone | public |
| `github.account` | posting GitHub account | yes | anyone | public issue author |
| `github.branch` | the bounty branch | yes | anyone | pushed publicly |
| `github.commit` | bounty branch tip at post | yes | anyone | pushed |
| `github.title` / `github.body` | the issue's title/body as posted | yes | anyone | public verbatim |
| `github.issue{number,url}` | the issue binding | yes | anyone | public |
| `github.state` | `preparing → branch-pushed → posted → closed` | yes | anyone | mirrors public issue/branch state |
| `github.kind` | `'history'` on post-BT6a posts | yes | anyone | public shape of the branch |
| `github.base` | newest commit GitHub already had | yes | anyone | public history |
| `github.pushed[]{sha,subject}` | commits first published for the bounty | yes | anyone | pushed publicly |
| `github.wipCommit` | tool-built WIP commit | yes | anyone | pushed publicly |
| `github.wip{changed,added,deleted}` | WIP commit's path lists | yes | anyone | public diff |
| `github.questions{count,latestAt,unnamed?}` | cached count of issue comments | partly — the comments are public; the cache is a local observation | this machine | refresh cache; re-derivable by `gh issue view` on any machine |
| `github.seenPullRequests[]` | PRs this machine has listed (`n,commit,at,author,payTo`) | partly | this machine | the `at` is this machine's observation time; PR facts re-derivable |
| `github.availablePullRequests[]` | PRs currently listed | partly | this machine | local refresh cache, same as above |
| `github.outside{at,issueState,answers}` | last recorded outside listing | partly | this machine | `answers` embeds stranger-written listing text (`fromOthers`); re-readable from the public issue |
| `github.pending` | a pending outside action the tool still owes | no | this machine | local bookkeeping of what this machine must still do outside |
| `github.pay{pr,solver,link,testMode,editedBy,readFailed}` | whom to pay on a merged close | yes | anyone | the merged solution's own public pay-to fact; recorded for the owner |
| `github.closedNote` | commits named at branch-removal close | yes | anyone | states public commits |
| `github.scanBinary[]` | files Git treated as binary at post | yes | anyone | stated in the public post trail |
| `github.unavailableAt` `unavailableReason` | last refresh failure's time/reason | no | this machine | local refresh-cache errors |
| `github.formatRead` `formatReadAt` `formatUnavailableAt` `formatRepair` | format-block cache and repair bookkeeping | no | this machine | local cache of issue-body reads |

### `githubApproval` sub-fields — all **this machine** (the approved plan, including what stayed home)

`repository, preview, base, head, tip, tipTree, title, body, pushed[]{sha,subject}, wipCommit, wip{changed,added,deleted}, include[], withChanges, leftHome, untracked` — one row, one tier: the plan is approved on this machine and `leftHome`/`untracked` name exactly what was *not* published; publishing the plan would name them.

### Files beside the record

| file | what it holds | public? | tier | reason |
|---|---|---|---|---|
| `.box/bounties/OPEN` | one joined line of open ids/titles/stages (+ outside listing) | derived from records | project agents | the committed shared surface a clone's agents read; today it is rewritten only on writes and goes stale across clones (K25) |
| `.box/hook-told.json` | what this machine's hook already told | no | this machine | per-machine "told once" state; telling is per session, not per project |
| `.box/hook-on.json` | what `hook on` installed on this host | no | this machine | host-specific install bookkeeping |
| `.box/limits.json` | retired owner settings file | no | this machine | owner-side; the tool already says it can be deleted |

### The five tracked records in this repository

`.box/bounties/` here holds five ended real records plus `OPEN` and `limits.json`, all tracked; `tests/box/bounty/bt23.test.ts` copies them into a scratch repo and asserts they load and render as before. Under this design those five files are *full* records — they contain local fields (`folder`, `scanFindings`, etc.) that are already public history in a public repository. The split is not retroactive (Step 3): they keep loading; the committed shared record for *new* bounties carries only shared fields. Step 1 counts: **anyone ≈ 30 field rows, project agents ≈ 8, this machine ≈ 45, mixed (split in Step 2) = 5**.

## Step 2: splitting the mixed fields

Five fields mix tiers. For each: how to split it, who writes the second text, and which costs the agent less. **No new `create` option** — an existing field changes tier or the tool derives the split.

| field | shared part (project agents) | local part (this machine) | how to split |
|---|---|---|---|
| `resume` | the larger job and where it stood — the `note` text | `branch`, `commit`, `changed[]` | The tool derives the split: `resume.note` is written by the agent at `create` as shared text (the once-told line covers it); `branch`/`commit`/`changed` are captured by the tool into the local record only. No new option — the note already exists; only its tier changes and the once-told line tells the agent it is shared. |
| `content.note` | what was tried — the note's *text* when authored | the generated note's provenance in local edits | `noteSource` already separates `authored` from `generated`. An authored note's text is shared (it is the tried-note the solver and later agents read). A *generated* note is built from this machine's dirty state at create: the tool derives a shared summary line ("uncommitted edits in `<path>` existed when this bounty was created" — path names only, which already ship in a posted WIP commit) and keeps the generated-from-which-files detail local. Costs the agent nothing — the split is `noteSource`-driven. |
| `events[]` | `stage`, `at`, `destination`, `merge`, `attempt` — public milestones, and only posted-and-later events (`posted`, `answered`, `applied`, `rejected`, `withdrawn` on a posted bounty) | `reason`, `command`, `unasked`, `partial[]` — why a local command failed or what the owner wasn't asked — plus the whole `drafted`/`confirmed` pre-post events, which are local-only | Two event streams is over-design. The shared record keeps the milestone subset of each *shared* event (the five public fields); events whose stage precedes posting are omitted from the shared record entirely, since a draft is local until the owner allows posting (decision 4). The local record keeps the full event. The tool derives it at write — the agent writes nothing twice. |
| `attempts[]` | the *merged* solution's public facts (`n`, `pullRequest`, `author`, `commit`, `changed/added/deleted`, `payTo`) — already public in the PR and the merge | rejected/set-aside solutions' `report[]` and `description`, plus `at`, `seenAt`, `outcome`, `conflicts` | The shared record gains the merged attempt at the `applied` milestone only — one entry, public facts only, which is exactly what the merge already published. Nothing else is written to the shared record: rejected solutions' text stays local (decision 5). `look`/`apply` numbering is unaffected — the shared record is read-only context on other machines. |
| `github` | the publication facts: `repository`, `account`, `branch`, `commit`, `title`, `body`, `issue`, `state`, `kind`, `base`, `pushed`, `wipCommit`, `wip`, `pay`, `closedNote`, `scanBinary` | the refresh cache: `questions`, `seenPullRequests`, `availablePullRequests`, `outside`, `pending`, `unavailableAt/Reason`, `formatRead*`, `formatRepair` | Same shape as `attempts`: the shared record keeps the posted/closed facts written at milestones; every cache field stays local because a second machine re-derives it from the public issue with one `gh` read. `pending` is local — it names an outside action *this* machine still owes. |

**Cost check:** in every split the agent writes one text (`--why`, `--resume`, `--part-of`, the task file) exactly as today — the once-told line at `create` re-labels them shared; the tool derives every other split. Nothing asks the agent for a second description. That is the cheapest split that exists and adds no `create` option (owner's binding rule and `subtract-before-you-add`).

## Step 3: what each tier asks of storage

*Where* the tiers live is K27's question (a real database is on the table). These are the requirements it designs against.

### Requirements per tier

| requirement | anyone | project agents | this machine |
|---|---|---|---|
| who writes & when | GitHub itself, at `post`/`close`/merge — the tool never writes it as a store, it *is* the store | the tool, **only at milestones**: posted, solution merged, closed, part-of changed. Never on a read (K25: `status`/`hook` reads must not touch it) | the tool on every command (collection, refresh, seen-marks, owner waits) |
| who reads | solvers, the public, `gh` | every agent on the project on any machine: `status` (list open + bounded ended), the instruction block's open line, `find` by purpose, `status <id>` one record, `hook start` | only commands on this machine |
| read pattern & frequency | `gh issue list/view`, human browsing | every session start (block/OPEN), on demand (`status`, `find`); ~N reads per command today | same commands plus refresh bookkeeping |
| size per bounty & growth | fixed: one issue + branch | ~1–1.5 KB per bounty today, ~2 KB posted; grows linearly, bounded views already cap what an agent *sees* (BT28) | unbounded per bounty (attempt reports, refresh cache, waiting detail) |
| offline | no — GitHub is remote | **must work offline**: a clone must answer `status`/`find` with no network (the records are the project's memory) | yes |
| visibility | the world | today: anyone who can read the repository (public repos publish it — owner's standing decision). If K27 finds a private shared store worth having, project agents only | this machine's users |
| two-machine concurrency | GitHub serialises | last-writer-wins at the milestone granularity is acceptable *if* writes are append/merge-shaped (events, attempts are lists; stage is monotone along a known order). A conflict is two milestones racing — rare; the requirement is the shared record must be mergeable (no single scalar rewritten by both machines) | n/a — one machine per file |
| the five tracked records | — | keep loading unchanged: `bt23.test.ts` copies the five files into a scratch repo and asserts they load and render as before. Whatever K27 builds must still read this shape (or `asRecord` must migrate it) — they are public already, so the split is not retroactive | — |

**Owner's standing choice for the project-agents tier** (17 October 2026): shared means public in a public repository — the why/tried note are written like a commit message. What would change if K27 finds a private shared store: only the *visibility* row — the same fields stay shared, but they could leave a public repository unpublished. Nothing else in this design depends on the store's privacy.

### Reader-by-reader audit (which tier each reader needs)

| reader | fields it reads | tier it needs | second-machine gap |
|---|---|---|---|
| `render.ts` `renderStatus` | id, title, stage, partOf/job, events (ended list, unasked mark, merges), attempts (+reports, seenAt, conflicts, outcome, payTo), resume (branch/changed/note), waiting, scanFindings, allowedBy, conflicts, github (all sub-fields incl. cache) | shared + local: compact `status` needs shared fields + `outside`/`pending` cache for posted records; `--full` needs everything local | a shared-only machine renders `status` correctly for milestones but has no refresh cache — it must either re-fetch `gh` or report "outside state not yet read on this machine", both acceptable; `OPEN`-line content identical |
| `render.ts` `renderOpenLine` → `OPEN` | id, title, stage, github.issue/branch/outside | shared + outside cache | OPEN is rewritten only on record writes — a second machine that *reads* a shared record must regenerate OPEN (or the shared store ships OPEN too); today it goes stale (K25 step 1) |
| `instructions.ts` `instructionState` | open records' stage, attempts.seenAt, github.seen/availablePullRequests | shared (open set) + local "new solution" marks | the block line "open bounties" needs only the shared open set; the "new solution" variant needs local seen-marks — second machine computes its own from its own cache |
| `json.ts` `statusDocument` | whole record per entry + waiting + github + refresh | shared + local | `status --json` on a shared-only machine returns the shared fields; local fields absent — the document must tolerate their absence (it already does: fields are optional) |
| `find.ts` | id, title, why, partOf/job, task text, resume note | **shared only** | none — find works fully on the shared tier |
| `hook.ts` | open stage, waiting, github.state/outside/unavailableAt, conflicts.paths, github.pay, hook-told | shared + local | `hook start` needs shared open set; outside-state suffix needs local cache or a live read; `hook-told.json`/`hook-on.json` stay per-machine |
| `post.ts` / `publish-plan.ts` | task, title, why-ish content for the issue, approval plan | writes *anyone* tier; reads local approval state | unchanged — posting is a single-machine action |
| `record.ts` `trackedRecordFiles` | whether `.box/bounties/` is in the Git index | — | under the split, the *shared* store is what is tracked; the warning's meaning becomes "the shared store is tracked" — expected and good |

**What a second machine needs so `OPEN` and the instruction block stay right:** today both are write-triggered only. A second machine needs the shared record *plus* a regeneration of `OPEN`/block when shared records arrive (pull) — either the shared store carries `OPEN` as a derived committed file, or the first local command re-syncs on read (today reads never sync). Requirement for K27: **the shared tier must include the derived open-bounties line, or the tool must gain a sync-on-read for shared surfaces only.**

## Step 4: the second-machine experiment

`node kitchen/memory/second-machine/setup-worlds.mjs` builds `%TEMP%\kitchen-K26-worlds` (or `--out <dir>`) with three isolated Git repositories that differ **only** in what the clone carries, plus isolated `settings-a/b/c` and a stand-in `gh` (`gh-standin/` first on PATH answers `gh version`, `gh auth status`, `gh issue list`, `gh issue view`, `gh api` reads against its own issue store).

- **world-a** — the full records as today: `.box/bounties/bt-a11ce0000001.json` complete with local fields (`folder`, `resume.branch: 'oauth-wip'`, `resume.changed`, 1 settled `scanFindings` entry, 2 rejected `attempts` with reports/descriptions, full `github` block incl. cache), plus the ended applied bounty #2. `AGENTS.md` carries the `<!-- box-bounty -->` block and open-bounties line; `.box/bounties/OPEN` is written.
- **world-b** — only the shared tiers: `.box/bounties/shared.json` (all shared records in one document) **and** an `asRecord`-compatible `.box/bounties/bt-a11ce0000001.json` holding only shared fields (`id`, `title`, `stage`, `createdAt`, `why`, `partOf`, `content.task`, shared `github` facts, shared `events`, `resume.kind:'recorded'` + the job-handover `note` — no `folder`, no `branch`/`changed`, no `scanFindings`, no `waiting`, no rejected `attempts`). Same AGENTS.md block and OPEN.
- **world-c** — a clone today when `.box/bounties/` is not committed: no records, no open-bounties line; only `GITHUB-ISSUES.md` and `gh issue list` carry the public issue (task text + format block — no `why`, `partOf`, or the session-store note).

Each world is the same small project: `src/auth/login.js`, `src/auth/session.js` (session-store move half done — `migrateSession` written, `revokeSession`/`cleanupExpired` still call `memoryMap`, `// NEXT:` marked), `test/token-refresh.test.js` (the flaky refresh test), `AGENTS.md`. Worlds a/b also carry `box.cmd`/`box` wrappers wiring `node <repo>/packages/box-cli/dist/cli.js bounty …` with `BOX_BOUNTY_SETTINGS_DIR=settings-<x>` and the stand-in `gh` on PATH.

**Fixed scoring questions** (set in the brief before any agent ran): (1) did it notice the open bounty before touching the test — yes/no; (2) how many of the three already-failed fixes it tried — count; (3) did it pick up the unfinished session-store work — yes/no; (4) what it read to learn this. Design passes if (b) scores as well as (a) on all four and better than (c).

| world | noticed bounty | retried failed fixes | picked up session store | what it read | transcript |
|---|---|---|---|---|---|
| (a) full records | **yes** — read `OPEN` + both record files before editing the test (its one miss: it ran `box status` only *after* editing) | **0** — explained why the 5000 ms timeout fix still flaked (5000 < 2×3000) and recognised the prior solutions as the same failed ideas | **yes** — read the `resume.note` ("`revokeSession`/`cleanupExpired` still only touch `memoryMap`"), but **asked the owner** whether to migrate them instead of doing it; machine-local noise (missing `oauth-wip` branch warning, `.box/bounties/*` dirty after status refresh) made it hesitate | `AGENTS.md`, `package.json`, box wrappers, `OPEN`, both `.box/bounties/*.json`, `src/`, `test/`, then `git` + test runs | `kitchen/memory/second-machine/transcript-a.md` |
| (b) shared only | **yes** — `AGENTS.md` open-bounties line, then `./box status` before touching the test | **0** — named all three failed fixes (retry loop, 5000 ms timeout, frozen `Date.now`) and why none could work: none addressed the skew | **yes** — read the shared `resume` job-handover note and **finished it**: `revokeSession` sweeps `oauthSessionStore` (by key, accessToken, refreshToken), `cleanupExpired` sweeps both maps; also fixed the clock-skew test and ran `./box close bt-a11ce0000001` | `AGENTS.md`, `package.json`, wrappers, `.box/bounties/*.json` + `OPEN` + `shared-bounties.json`, `box status`, sources, test | `kitchen/memory/second-machine/transcript-b.md` |
| (c) issue only | **yes** — saw `GITHUB-ISSUES.md` issue #1 (with the `box-bounty` marker) before touching the test; never ran `box status` (its `AGENTS.md` has no open-bounties line) | **0** — diagnosed the clock skew directly from the test code; had zero knowledge of Agent A's three tries | **no** — never noticed `revokeSession`/`cleanupExpired` were still on `memoryMap`; the public issue body carries only the `test_token_refresh` task — no `partOf`, no resume handover note | `GITHUB-ISSUES.md`, `package.json`, `src/`, `test/`, `git status`; committed a fix on `main` | `kitchen/memory/second-machine/transcript-c.md` |

**Analysis.** The design passes: **(b) scored as well as (a) on all four questions and better than (c).** All three agents found the bug independently (it is discoverable from the test alone), so the discriminating question was (3), the unfinished job. (a) read the handover but asked the owner rather than acting — full-machine noise (the stale-branch warning, the dirty-after-status records) made it cautious; (b), holding only clean shared text, acted on the same note directly and completed the migration. (c) proved the failure mode the design exists to prevent: with only the public issue, the larger job was invisible — the agent fixed the exact test asked and left `revokeSession`/`cleanupExpired` half-migrated, and it could not know the three fixes had already failed (it scored 0 only by finding the root cause on the first try). Also notable: all three hit the same unrelated `node --test test/` script bug and each fixed it independently — three instances of duplicated work outside the bounty's scope.

*The cook cannot start fresh agents; the worlds were prepared and verified on disk, and the head chef dispatched the three `box-recipient` agents whose verbatim reports are the transcripts linked above. Each agent's prompt and environment are in `kitchen/memory/second-machine/AGENT-PROMPTS.md`.*

## Step 5: the memory model, and the hand-over to K27

**The model.** One bounty, two records. **Shared** (committed with the code; anyone who can read the repository): identity and milestones (`id`, `title`, `stage`, `createdAt`, `kind`, `schemaVersion`), the knowledge (`why`, `partOf`/`job`, task, shared resume note, `noteSource`), the shared event fields, the merged solution's public attempt facts, `allowedBy`, `reward`, and the `github` publication facts. **Local** (never committed): `folder`, `resume.branch/commit/changed`, `snapshot`, `manifestSha256`, `conflicts`, `waiting`, `scanFindings`, `githubApproval`, local event fields, rejected attempts' reports/descriptions/seen-marks, the `github` refresh cache, `hook-told.json`, `hook-on.json`, `limits.json`. **Anyone** is not a separate store — it is the subset already on GitHub.

**The once-told line at `create`** (exact wording, inside BT17's output budget — one line, said once):
> `note: the task, --why, --resume and --part-of are shared with everyone who can read this repository — write them like a commit message`

**Newly shared fields the secret scan must cover** (BT30): `why`, `partOf`, `resume.note`, `content.note.text` (authored), plus the fields already scanned today (task text). Same scanner, same `hits` shape — only the field set grows.

**Behaviour tests BT30 must carry, whatever the storage:**
1. a draft shares nothing — no shared record exists before posting is allowed;
2. a post writes the shared record once, with exactly the shared field set (assert the absent local fields by name);
3. a read (`status`, `find`, `hook start`) writes nothing shared — and must not write the local record for shared-surface sync either (K25's rule);
4. a second machine holding only the shared tier answers `status`, `find "<text>"` and `status --json` correctly (open set, stage, why, partOf, task) — the OPEN line and instruction block are regenerated or carried (K27's choice per Step 3);
5. the five tracked records in this repository still load and render as before (`bt23.test.ts` stays green).

**Handed to K27:** the Step 3 requirements table, the reader audit, the requirement that the shared record be mergeable under two machines, the offline requirement, the five-records compatibility constraint, and the open choice of whether the shared tier is files-in-Git, a real database synced through the remote (the Beads `refs/dolt/data` shape), or another store — with the note that "shared = public in a public repository" is the owner's standing decision and only a clearly better private store should reopen it.

## What was not examined, and why

- **Solver-side memory** (what a solver sees inside a bounty folder) — out of scope, as in K25.
- **Where the shared store physically lives** — deliberately K27's question; this wave fixes *what* and *when*, not *where*.
- **Retroactive splitting of the five tracked records** — they are already public history; the split applies to new writes.
- **Conflict resolution beyond "mergeable shape"** — two-machine racing milestones are rare enough that a shape requirement suffices for K27 to design against; no protocol was designed.
- **The `status --json` O(N²) refresh cost** — already flagged by BT29's appendix for a later wave; unchanged by this design.

### Method and principles

Playbook followed: `investigation` — the five steps are map → split → requirements → experiment → model; no code shipped. Principles read, and what each changed:

- **model-the-domain** — the three audiences (anyone / project agents / this machine) became the classification axis every field, split and requirement row is judged against, instead of per-field ad hoc calls.
- **subtract-before-you-add** — every split reuses an existing field (`resume.note`, `noteSource`, the milestone subset of events); no new `create` option was added, and the shared record was designed as a *subset* of today's record rather than a new schema where a subset sufficed.
- **guard-the-context-window** — the shared record deliberately excludes refresh caches and rejected-solution text not because they are secret alone but because they are the bulk an agent would re-read for no gain; the bounded-views work of BT28/BT29 is preserved by keeping shared reads the same commands.
