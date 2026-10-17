# K28 review: the delegation record — what the project must remember about handed-off work, and how leading agent tools store it

Wave K28, branch `wave/K28`, 17–18 October 2026. Cook: box-worker (Subagent Default host profile; exact model identity not disclosed by the host). Design investigation — no product code, no tests changed, nothing posted, no account created. Prototype and measurement scripts: `kitchen/memory/delegation/` (`chain.mjs`, `measure.mjs`, `worlds.mjs`; rerun instructions in each header). Documentation pages cited with the date read; all fetched live on **2026-10-17/18**. Measurements on this host: Windows, Node v24.11.0, git 2.45.1; run counts and spreads stated beside every number.

## The owner's page (read this first)

**The delegation record, in five sentences.** The project should remember the decision to delegate, the hand-over, questions and solutions in flight, what came back, what was accepted, how it settled, and the link to the resulting code. Today's local record and public issue trail do not give a fresh machine the full reasons, larger-job context and outcome history. The proposed store is one small chain of event commits per bounty, outside the project's files on custom Git refs, fetched explicitly through the existing remote. git-bug provides the close architectural precedent; Beads also syncs separate data through Git, but uses Dolt rather than this event format. The local prototype supports the storage mechanism, while the two-agent experiment leaves the all-right validation bar unmet and real GitHub behavior untested.

**How the leading tools store it, in three sentences.** git-bug (github.com/git-bug/spec, read 2026-10-18) stores each entity as a DAG of commits holding JSON "operation packs", one ref per entity (`refs/bugs/<id>`), merges concurrent edits with empty-operation merge commits, orders events with Lamport clocks, pushes fast-forward-only, and lands remote copies under `refs/remotes/<remote>/bugs/<id>` — nothing ever enters the project's files or its default clone (measured: a negotiated clone of a remote holding 1,000 chains downloaded 3 objects). Beads (moved to gastownhall/beads; README, `docs/architecture/dolt.md`, `docs/core-concepts/sync-concepts.md`, `hash-ids.md`, read 2026-10-18) keeps a Dolt database under `.beads/` as its source of truth, syncs machines with `bd dolt push`/`pull` to `refs/dolt/data` on the project's git remote, treats its `.beads/issues.jsonl` file as "an export, not the sync channel", requires `bd bootstrap` on a fresh clone (a plain `git clone` gets nothing), avoids id collisions with hash ids, and gives agents a small injected context (`bd prime`) plus query commands (`bd ready`).

**Our design and why.** git-bug's shape, simpler: one ref `refs/box-bounty/<id>` per bounty; each event is one commit holding one small JSON event; a merge commit with an empty event joins two machines' concurrent appends. Sync is one explicit fetch refspec for commands that show bounties (at most once a minute) and a fast-forward push at milestones; on rejection: fetch, merge, retry — measured under one second end-to-end. The local BT31 `node:sqlite` database becomes a rebuildable cache of the chains, never the source of truth. Nothing is committed into the project's files, so `git grep`, ripgrep and `git log -p` on the default branch stay clean (verified). The owner needs no account, no program and no setup beyond the remote that already exists.

**What the experiment showed.** Two fresh agents got the same eight questions about a scratch project's eight-bounty history — one with the chains fetched, one with only the public issue texts. The chains agent scored **6 right / 2 partly / 0 wrong**; the issues-only agent scored **3 right / 2 partly / 3 wrong**. The chains agent clearly beat the issues-only one on exactly the record's questions (why, tried, larger job, paid) — but it did **not** answer every question right, so the brief's all-right pass bar is **not met**; both misses trace to fixture/question defects (detailed in step 5), not to the storage mechanism, and one of them exposes a real schema point worth carrying into BT32.

**What it costs.** Measured on this host: one event pushed in ~0.3 s and fetched in ~0.5 s (5 runs each, spreads 221–417 ms / 446–611 ms — the post-fix run; the lighter earlier run measured 156–175 / 210–287); a first fetch of 1,000 bounties' chains took ~6 s once (3.2 s in the lighter run), then nothing until new events exist; 1,000 bounties × 5 events costs the remote **1.54 MiB** of pack — nothing in any clone that does not ask for it. Limits: refs outside `refs/heads/*`/`refs/tags/*` are not covered by GitHub rulesets (they cannot be protected against deletion; any clone that fetched can restore them — measured ~1 s); GitHub's web UI does not display these refs (they appear in `git ls-remote` only); and a lost local cache is just rebuilt. **Not yet shown, honestly:** these numbers are `file://`-protocol only — real GitHub compatibility, push latency, push-protection scanning and object retention on `github.com` are unverified; commit-author fields are display-only (write access is the trust boundary, not authentication of the named author); and deletion durability rests on every clone holding a copy.

**The one decision needed.** Whether the project-agents memory lives on custom refs as designed here — in which case BT32 proceeds from the outline in step 6 — or the owner prefers a different store. (BT32 stays on hold until the owner answers, whatever this review recommends.)

---

## Step 1: the delegation record

Lifecycle events, with the facts each carries (who, when, what, why), the K26 tier and the writer:

| event | facts | tier | written by |
|---|---|---|---|
| `decided` | agent/account, time, task, **why**, **partOf** (larger job), **tried** (what failed in-house), resume note | project agents (+anyone: task, title) | the tool at `create`/`post` approval |
| `posted` | destination (`github`/`folder`), issue number/URL, reward, `allowedBy` summary, bounty branch | anyone | the tool at `post` |
| `question` / `note` | actor, time, text | project agents | tool or agent during flight |
| `solution-arrived` | attempt n, solver identity, answer commit, pay-to facts, arrival time | anyone | the tool at `answer`/collect |
| `set-aside` | attempt n, reason class | project agents | the tool when a solution is passed over |
| `merged` | attempt n, **merge commit** | anyone | the tool at `apply` |
| `closed` | end state: `paid {amount,to,link}` \| `rejected {reason}` \| `abandoned {reason}` \| `cancelled`; time | anyone for paid/public facts; reason text = project agents | the tool at `close`/`undo` |

Never in a chain (K26 "this machine" tier): local folder path, local branch/commit/dirty-file snapshots, `waiting` (pending owner questions), `scanFindings`, rejected solutions' text/reports, GitHub refresh caches, `githubApproval` (it names what deliberately stayed home).

**The question list** the record must answer at any time, by anyone on the project, on any machine, years later — and what answers each **today**:

| # | question | today | under this design |
|---|---|---|---|
| 1 | What is outstanding, and who waits on what? | Local records only — invisible on a second machine | chain: open vs closed events, every machine |
| 2 | Why handed off; what had been tried? | Local record only | `decided.why`/`tried`, every machine |
| 3 | Which larger job, and where did it stand? | `partOf` local only | `decided.partOf` + resume note |
| 4 | What came back, from whom, which accepted? | Issue comments + local attempts | `solution-arrived`/`merged`/`set-aside` events |
| 5 | Why does this code look like this? | **Works today**: `apply` writes `box bounty <id>: <title>` + `attempt:`/`solution:` in the merge message (answer.ts) → `git blame`/`log` reaches the id | same, plus the id resolves to the full chain on any clone |
| 6 | Have we handed off something like this before? | `find` over local records only | chain query by `partOf`/task |
| 7 | Was the solver paid? | Local `github.pay` fact + issue trail | `closed.paid` event |

## Step 2: how the leaders store it (all sources fetched live)

### git-bug — entities as a DAG of commits on per-entity refs

Sources: the spec repository `github.com/git-bug/spec` — `dag-entity.md`, `ids.md`, `bug.md` — and `git-bug/git-bug` `doc/design/data-model.md`, `doc/design/architecture.md`, README. Read 2026-10-18.

- **Objects and refs.** An entity is a DAG of commits; each commit's tree holds an `ops` blob (a JSON operation pack `{author:{id}, ops:[...]}`), plus empty-blob entries encoding Lamport `create-clock-N`/`edit-clock-N` and `version-N` (dag-entity.md §3, §5). Local entities live at `refs/<namespace>/<entity-id>` (e.g. `refs/bugs/<id>`); remote-tracking copies at `refs/remotes/<remote>/<namespace>/<id>` (§2). `.git/git-bug` holds only caches (architecture.md).
- **Merge and id collisions.** Entity id = SHA-256 of the first operation's serialized bytes — content-derived, no coordination needed (§7; ids.md). Concurrent edits merge by an explicit empty-ops merge commit with both tips as parents; ordering = Lamport clock, tie-broken by pack hash (§9–10). Only fast-forward pushes are accepted: "The DAG grows monotonically… a merged state can never be overwritten" (§10). Clock-spam guarded (§4).
- **Fresh clone.** Data arrives only via explicit `git bug pull` (fetch refspec into `refs/remotes/<remote>/...`) — a default `git clone` does not fetch it (implied by the refspec design; confirmed empirically for our equivalent in step 4). README: distributed over normal remotes, works offline, "doesn't pollute your project", bridges to GitHub.
- **Deletion/compaction.** `git bug wipe` exists; old entities are not compacted — the DAG is the history. Local caches live under `.git/`, separate from the object store.
- **Agent surface.** `git bug` commands query (`ls`/`show`/`status`); TUI/webui on top. Authorship: operations carry an author identity; commits optionally OpenPGP-signed, verified against keys registered in the signer's identity entity (§11).
- **Depends on:** Git only (plus an optional cache).

### Beads — a Dolt database synced through the same git remote

Sources: `gastownhall/beads` (repo moved from steveyegge/beads; GitHub redirect verified) — README.md, `docs/architecture/dolt.md`, `docs/core-concepts/sync-concepts.md`, `docs/core-concepts/hash-ids.md`. Read 2026-10-18.

- **Objects and refs.** Source of truth is a local **Dolt** database: embedded mode `.beads/embeddeddolt/` (single writer, file lock), server mode `.beads/dolt/`. Cross-machine sync is `bd dolt push`/`bd dolt pull` which stores Dolt history under **`refs/dolt/data`** on the project's git remote, "separate from source branches" (sync-concepts.md). `.beads/issues.jsonl` "is an export… not the canonical cross-machine sync channel."
- **Merge and id collisions.** Merge is delegated to Dolt ("cell-level merge", dolt.md). Ids are hash-based (`bd-a1b2`, from title+timestamp+salt) so "agents and branches never clash" (hash-ids.md).
- **Fresh clone.** Explicit: "Fresh clones should run `bd bootstrap`" — a plain clone does not get the data (sync-concepts.md).
- **Deletion/compaction.** `bd prune`/`bd purge` permanently delete closed beads; `bd flatten`/`bd admin compact` squash Dolt history; README advertises "memory decay" summarising old closed tasks.
- **Agent surface.** `bd prime` injects a small workflow context + memories (`bd remember`); `bd ready` lists claimable work; JSON output everywhere.
- **Depends on:** Dolt — a versioned SQL engine embedded in the `bd` binary (a real dependency; Beads pins Dolt 2.2.0 after measuring a `DOLT_RESET --hard` regression in 2.3.x, dolt.md).

### Git itself — refs, refspecs, notes

- Fetch/clone default refspec is `+refs/heads/*:refs/remotes/<remote>/*` plus tags (git-fetch docs). Custom namespaces are fetched only by an explicit refspec, e.g. `+refs/box-bounty/*:refs/box-bounty/*` — **verified empirically in step 4** (a `--no-local` negotiated clone of a remote holding 1,000 chain refs downloaded 3 objects and no chain refs).
- `git notes` stores annotations under `refs/notes/commits` — the same custom-ref mechanism; GitHub has long rendered notes on commit pages (not re-verified live; nothing in this design depends on it).
- **GitHub protection/visibility** (docs.github.com rulesets doc, read 2026-10-18): ruleset targets are branch and tag *name* patterns (fnmatch) — there is no targeting of refs outside `refs/heads/*` and `refs/tags/*`, so chain refs cannot be ruleset-protected against deletion; they are invisible in the web UI and reachable via `git ls-remote` (measured: all 1,000 listed). Whether secret-scanning push protection inspects custom-ref pushes is unverified — the defence stands regardless: nothing credential-shaped enters an event (the scanner already gates the same text fields at post).

### The others

- **Task Master** commits `tasks.json` into the repository — the committed-file shape the owner rejected.
- **Hosted agent memory (Mem0, Zep, Cognee)** — per K27's hosted-store analysis: new account, token, third-party readable, real cost; aimed at general knowledge, not a tool's own work records. No further reading done.

**Verified corrections to the brief's leads:** (1) Beads' store today is Dolt, not the "local database" the lead implied — the `refs/dolt/data` sync claim is confirmed; (2) `bd bootstrap`, not a default clone, gives a new machine the data — confirming the lead that sync rides the git remote outside project files; (3) git-bug's "doesn't pollute your project" claim verified: chain commits produce nothing on the default branch (step 4).

## Step 3: our storage design

Each choice cites step 2.

- **Event chains, one ref per bounty** — `refs/box-bounty/<id>` (git-bug shape: one entity, one ref, append-only commit chain). Chosen over one shared log ref because per-entity refs make pushes small and independent — two machines appending to *different* bounties never conflict, and the 1,000-ref fetch is one refspec. The shared-log alternative serialises every machine's writes behind one non-fast-forward race.
- **Event = one commit carrying one JSON event** in an `ops` blob (git-bug's operation-pack shape, simplified: schema `v:1`, `author`, `ops:[event]`; merge commits carry `ops:[]`). Events are the step-1 schema; `at` timestamps are display-only (git-bug §6.1).
- **Authorship and trust.** The commit/pack author records which machine's agent wrote the event; *trust comes from access control, not author fields* — only accounts with push access to `origin` can write `refs/box-bounty/*` there (GitHub collaborator permission; there is no anonymous push). A reader accepts chains only from the configured remote's fetch — a stranger cannot push a forged chain to a remote they cannot write, and a local ref outside `refs/remotes/origin/box-bounty/*` is ignored. git-bug adds optional signing; our remote access control covers the same trust question for a private-org remote — noted as a BT32 decision for public forks, where a fork's own clone is a separate remote anyway.
- **Sync.** Fetch `+refs/box-bounty/*:refs/remotes/origin/box-bounty/*` (git-bug's remote-tracking layout) inside commands that show bounties — `status`, `find`, `box bounty`, `hook start` — at most once per minute (BT32's cadence). Push `refs/box-bounty/<id>` at milestones. On non-fast-forward rejection: fetch, merge (empty-ops commit), retry — measured 0.8 s.
- **Merge.** git-bug's five scenarios verbatim (new / identical / ahead / fast-forward / diverged→merge commit); concurrent appends to one bounty union with no event lost (measured).
- **Local cache.** BT31's `box.db` rebuilt from the chains on demand; never the source of truth — a lost cache is a re-fetch (git-bug keeps the same split: objects in git, caches in `.git/git-bug`).
- **Link to code.** Already built: `apply`'s merge message carries `box bounty <id>` + `attempt:`/`solution:` (answer.ts) — `git blame` → merge commit → chain.
- **Deletion and loss.** Remote refs have no ruleset protection (step 2): a deleted ref is restored by any clone that fetched it (`git push origin refs/box-bounty/<id>`, measured); 
a wiped remote is rebuilt from any one machine. A lost local cache refetches.
- **Drafts and machine detail** stay local per K26 — `drafted`/`confirmed` transitions, `waiting`, `scanFindings`, `githubApproval`, rejected text never enter a chain. Chains start at `posted` (owner decision: nothing shared before posting is allowed).
- **Compaction.** Events are ~300–500 B; a closed chain keeps all events (history is the point). If size ever matters, git-bug shows the option: squash a closed chain to `decided`+`closed` plus a summary event — deferred, not built.
- **Agent surface** (guard-the-context-window): unasked = the existing bounded block/`OPEN` line; chains answer only on command, rebuilt into the sqlite cache. Nothing new loads unasked.

## Step 4: the prototype — measured

`kitchen/memory/delegation/measure.mjs` (reruns from a clean checkout; scratch under `%TEMP%\kitchen-K28-measure-*`, refuses foreign dirs). Method: one bare `file://` remote + two clones; all events ~300–500 B. **Limits:** a local `file://` remote — real GitHub pushes add network+auth latency; single run for the N=1,000 numbers (host load varies — evidence-station rule); "in-pack" sizes are exact, times are measured.

| measurement | result |
|---|---|
| push one event (5 runs) | 282, 417, 312, 221, 231 ms — spread 221–417 |
| fetch one event incl. ref discovery (5 runs) | 446, 590, 498, 611, 549 ms — spread 446–611 |
| push 1,000 chains (first push, ~5,000 commits) | 2,937 ms (1 run) |
| first fetch of 1,000 chains on a fresh clone | 5,995 ms (1 run) |
| remote pack after 1,000 × 5 events | **1.54 MiB** (`count-objects -vH`; loose 1.93 KiB) |
| concurrent append same bounty, both clones | second push rejected non-fast-forward → fetch+merge (empty-ops) → retry ok in **832 ms**; 13/13 events on both clones, both writers' events present, none lost |
| remote ref deleted, restored from a clone | `update-ref -d` then `push <ref>` — restored in **1,241 ms** |
| default `git clone --no-local` of the remote | downloads **3 objects, 1.34 KiB** — `for-each-ref` shows only `master`+`origin/master`: **no chain refs, no chain objects**. (`git ls-remote` on the remote lists all 1,000 chain refs — they exist, a default clone just never asks) |
| `git grep` / ripgrep / `git log -p` on the default branch | nothing: zero hits for any bounty id (local-path clone caveat noted and avoided with `--no-local`) |

Raw data: every number in the table is **run 3** — post-fix, `evidence/measure-report-run3-postfix.json` (run on a busier host while the regression check's other work was also running, hence higher timings; qualitative results identical). **Run 2 (historical, pre-fix `e5609a3` era):** `evidence/measure-console-run2-prefixed.log` — push 156–175, fetch 210–287, push-1000 1,890 ms, first-fetch 3,159 ms, merge+retry 694 ms, restore 578 ms, identical sizes and outcomes; its JSON sibling was overwritten by run 3 before provenance labels existed — the stale-evidence lesson below. Both runs' evidence and the mapping live in `evidence/` (see `README.md`).

**Pass correction (post-review):** the reviewer found that `chain.mjs` ran its CLI dispatch at import time — `measure.mjs`/`worlds.mjs --out …` exited 2 inside chain.mjs before the caller could parse its own argument, so the foreign-directory sentinel safety was incidental, not the ownership check. Root cause fixed in `chain.mjs` (main-module guard via `import.meta.url` vs `argv[1]`); regression check `kitchen/memory/delegation/check.mjs` asserts: direct CLI works, import does not consume argv, both `--out` scripts run on their own clean scratch, and foreign nonempty dirs are refused *by the marker check* (exit 1, marker-named message, sentinel byte-identical). Experiment worlds and scores are unchanged (no participant rerun — the bug never affected the generated worlds, only the generator's `--out` flag path at import).

**Second evidence correction:** regenerating measurements post-fix overwrote the run-2 JSON while its console log stayed — the committed pair then mixed runs (the stale-evidence risk this wave already hit once). Fixed by provenance: `evidence/README.md` names each run, every table number now cites run 3, and run 2 is labeled historical, not silently relabeled. Structural lesson: a committed summary and its raw record must carry the same run id; regenerating "fresh" evidence into a shared filename destroys the pairing — `check.mjs` now also asserts the committed evidence files exist and the post-fix JSON carries all 20 measurements (cheap structural guard; matching prose to numbers is deliberately not attempted).

## Step 5: the agents' test — run and scored

`kitchen/memory/delegation/worlds.mjs` built both worlds under `C:\Users\shout\AppData\Local\Temp\kitchen-K28-worlds\` (kept for the pass; regenerable via `--out`): a scratch "Acme service" history, 8 bounties across jobs `oauth-migration` (4) and `report-export` (2) plus 2 misc, 5 merged, 1 abandoned, 1 closed-unsolved, 1 open; merge commits carry the real `box bounty <id>: <title> / attempt: / solution:` message shape. World (a) = `--no-local` clone with all 8 chains fetched and the `chain.mjs` reader bundled; world (b) = `--no-local` clone with only `issues/<id>.md` public issue texts and no chain refs (verified: `for-each-ref` shows only `master`/`origin`).

**Participants** (dispatched by the CTO, sequentially, ~2026-10-18T00:08+08 — exact run timestamps not recorded, reported missing): participant A = subagent `538de45c`, participant B = subagent `0033eb48`, both `subagent_general` profile on Devin Desktop, exact model not disclosed. Each got its staged prompt plus an identical isolation/read-only instruction (own world only; no owner repository, sibling files, truth key, external sources, skills or agents). Isolation was by instruction, not sandbox — the evidence-station caveat applies. Both reported read-only use. Verbatim reports: `kitchen/memory/delegation/participant-a.txt`, `participant-b.txt` (unchanged). Prompts, question list and truth key: `kitchen/memory/delegation/evidence/`.

**Scores against the pre-existing `truth-key.json`** (rubric: right = all key facts, none invented; partly = some right/incomplete/one error; wrong = missing/invented/contradicted):

| Q | A (chains) | B (issues only) |
|---|---|---|
| 1 outstanding | **right** — bt-b203 open awaiting a solution; all others closed, incl. bt-b202 unsolved | **right** — same, from issue files |
| 2 why/tried | **right** — scaling blocker + both failed fixes cited | **wrong** — correctly reported the facts are absent from the issues |
| 3 larger job/standing | **partly** — partOf, tried and job outcomes right; the expected *historical mid-migration standing was never encoded in the fixture's events* (a `decided` event carries why/partOf/tried but no job-state snapshot — fixture defect plus a real schema lesson below); A's "does not establish the job was completed" is arguably better-calibrated than the key | **wrong** — partOf absent from issues; correctly reported it cannot be established |
| 4 what came back | **right** — erin-t, attempt 1, merge sha, paid | **right** — erin-t, attempt 1, merged (could not enumerate other submissions, none existed) |
| 5 blame→bounty | **right** — blame→solution commit→merge→chain→solver→paid | **right** — same chain via the merge-commit message alone (the pre-existing code link, no chains needed) |
| 6 handed off like this before | **partly** — stated every expected fact (bt-b201 merged+paid; bt-b202 rejected, 40 MB reason, unpaid) but framed the answer as "no previous scheduled-email task" — question/fixture ambiguity between exact-kind and same-job | **partly** — named the same two related bounties with outcomes; missing the paid fact and the 40 MB reason (absent from its issue texts) |
| 7 paid | **right** — carol-ops paid with receipt; a103 `paid:null`, correctly distinguished record from verified transaction | **wrong** — payment facts absent from issues; correctly reported unconfirmable |
| 8 job membership/endings | **right** — all four oauth-migration bounties with outcomes, incl. the second machine's | **partly** — named the right four with endings but could not attribute job membership |
| **Total** | **6 right / 2 partly / 0 wrong** | **3 right / 2 partly / 3 wrong** |

**The brief's pass bar — "world (a) answers every question right and clearly beats (b)" — is NOT met:** 6 of 8 right, not 8. (a) does clearly beat (b) on exactly the questions the record exists for (Q2, Q3, Q7, Q8 — the why, the job, the payment, the membership are absent from issue texts). No rerun was staged and the bar is not softened: the two partly answers trace to defects in the fixture/question, not the storage — Q3's expected job-standing was never written into any event, and Q6's "like this" was ambiguously framed. **Real lesson for the schema (not a retrieval miss):** the record should carry the job's standing at handoff — the K26 `resume.note` belongs in the `decided` event as an explicit field (the fixture emitted none); and "paid" needs a distinct recorded event since it is the only thing that distinguished (a) from (b) on Q7.

## Step 6: recommendation and the BT32 outline

**Recommend the per-bounty chain design** as written in step 3 — with one schema addition the experiment exposed (below). It is the git-bug model, measured here to cost ~0.2–0.6 s per event op, a one-time ~3–6 s first fetch at 1,000 bounties (host-load dependent; both runs recorded), 1.54 MiB remote growth, zero bytes in ordinary clones or the default branch, no account and no new program — and it directly answers the owner's two rejections: nothing is committed to the project's files, and the memory lives in the project's own Git, not a deletable issue store. The experiment did **not** meet the all-right bar (6/8 for world (a)); the misses were fixture/question defects, and (a) clearly beat (b) on every question the record exists to answer — this is reported plainly rather than treated as a pass. BT32 remains held for the owner's decision regardless of this recommendation.

**BT32 outline** (replaces the on-hold brief; not an edit to `waves/BT32.md`):
1. Event schema `v:1`: `{type, at, actor, …}` for `decided|posted|question|solution-arrived|set-aside|merged|closed` — allow-listed shared fields only (K26 tiers anyone+project-agents); never `folder|waiting|scanFindings|githubApproval|conflicts|local caches|rejected text`. `decided` must carry the K26 `resume.note` (the larger job's standing at handoff) as a first-class field — step 5's Q3 miss showed why; `closed.paid` is a distinct recorded event, not an implication.
2. Refs: `refs/box-bounty/<id>`; remote-tracking `refs/remotes/origin/box-bounty/<id>`; fetch `+refs/box-bounty/*:refs/remotes/origin/box-bounty/*` (≤1/min, display commands only); push `refs/box-bounty/<id>` at `post`/`apply`/`close`; non-ff → fetch → empty-ops merge → retry.
3. Trust: accept chains only fetched from the configured remote; writer = commit author (display); push access = the trust boundary (say so in BOUNTY.md).
4. Cache: `shared` table in `box.db` rebuilt from chains; `find`/`status`/`hook start`/`OPEN` read it; offline = last cache + the K26 said-once line.
5. Merge-commit link: unchanged (answer.ts already writes it) — document that `git log`/`blame` reaches the record.
6. Compaction: none in v1 (chains are ~KB); closed chains keep all events.
7. Behaviour tests: K26's three-clone test pattern + forged local ref ignored, draft events absent, offline-from-cache, deleted-remote-ref restored, second-machine `shared-only` read (BT32's case 5), OPEN/instruction block unchanged in size.
8. Measurements BT32 must reproduce: the step-4 table on the real implementation, plus `hook start`/`status` unasked-surface sizes unchanged (K25 bars) and K14 process budgets rebaselined only for the fetching commands.

## What was not examined, and why

- **Push protection / secret scanning on custom refs:** undocumented; the defence (scan fields before writing events) is unchanged either way. To be tested on the real GitHub remote during BT32.
- **GitHub object retention for custom refs:** refs keep objects reachable by definition; whether GitHub's GC ever prunes them is unverified. Mitigation is the same either way: every clone holds a full copy.
- **GitHub web rendering of notes/custom refs:** noted but not load-bearing — the design needs only `ls-remote`+fetch.
- **`bd`/`git-bug` binaries:** read, not installed (scope); their formats were read from specs, not run.
- **Signing:** git-bug's optional OpenPGP signing was designed against and judged unnecessary while push access is the boundary; flagged as a BT32 decision for public forks.
- **Time:** measure.mjs numbers are single-run at N=1,000 (5-run only for the single-event ops); re-run by the pass.

## Handoff — step 5 experiment (for the CTO)

- **World (a), chains fetched:** `C:\Users\shout\AppData\Local\Temp\kitchen-K28-worlds\world-a`
- **World (b), issue texts only:** `C:\Users\shout\AppData\Local\Temp\kitchen-K28-worlds\world-b`
- **Participant prompts (identical 8-question list):** `C:\Users\shout\AppData\Local\Temp\kitchen-K28-worlds\prompts\participant-a.txt` and `participant-b.txt`
- **Truth key + rubric:** `C:\Users\shout\AppData\Local\Temp\kitchen-K28-worlds\truth-key.json`
- **Close:** the pass finished and the CTO removed the marker-owned scratch worlds. The paths above are historical, not live. Regenerate with `node kitchen/memory/delegation/worlds.mjs --out <new-empty-dir>`; committed prompts, answer key and participant reports preserve the experiment.
- Run completed ~2026-10-18T00:08+08 (timestamps not recorded — reported missing); verbatim reports and prompts preserved under `kitchen/memory/delegation/` and `evidence/`.

## Close against the approved memory specification

The owner approved `docs/box-v4/MEMORY-SPEC.md` in another session while K28 ran. Its changes were preserved when merging. K28's local prototype supports R4/R7 and recovery under R5 only when another clone retains the deleted data. It does not prove GitHub authorization/retention, product allow-list enforcement, or the integration and context-size requirements. R10's bounty-id link already exists, but the short why and cross-machine lookup remain incomplete; the specification was corrected on that narrow fact. Before BT32 starts, its replacement brief must map every specification fact to an event or local/owner state, including publication history, unasked decisions and the separately planned owner-recorded payment fact. The proposed outline is not authorization to implement it.
