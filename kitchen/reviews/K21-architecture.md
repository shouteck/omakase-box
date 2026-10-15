# K21: an architecture review of the bounty tool

15 October 2026. An investigation on `wave/K21` at master `0046519`: no product code or test changed. The method, suspects and template are in [waves/K21.md](../../waves/K21.md). Scratch work lived under `%TEMP%\kitchen-K21-*` and was removed at close; the one run kept for the record is the S6 experiment quoted below.

## For the owner: one page

**What the tool is made of**

```
                 box bounty <command>
                        |
        +---------------+----------------+
        | 1 drafting    | 2 the owner's  |
        | (task, note,  | yes (decisions,|
        |  snapshot)    |  rewards,      |
        |               |  publish lists)|
        +-------+-------+--------+-------+
                |                |
        +-------v-------+ +------v------+
        | 3 posting     | | 4 solutions |
        | (publication  | | arriving    |
        |  plan, scan,  | | (pull req.  |
        |  issue)       | |  reports)   |
        +-------+-------+ +------+------+
                |                |
        +-------v-------+ +------v------+
        | 5 bringing one| | 6 telling   |
        | home (apply,  | | the owner   |
        | close, merge  | | (pay msg.,  |
        | recognition)  | |  owner blk) |
        +-------+-------+ +------+------+
                |                |
        +-------v----------------v------+
        | 7 memory across sessions      |
        | (the record, instruction      |
        |  files, the hook)             |
        +---------------+---------------+
                        |
        +---------------v---------------+
        | 8 underneath: the Git layer,  |
        | the GitHub layer, errors,     |
        | wording                       |
        +-------------------------------+
```

**The five changes that would most simplify or protect the tool, in order**

1. **Decide what the tool may do on the owner's GitHub when it ends a bounty by itself.** When the tool notices a merge or a close, it writes a comment, closes the issue and deletes the bounty branch — without checking whether the owner's standing answer still covers that. The owner's "no" or "ask each time" currently gates posting but not tidying; the fix is an owner decision first, then a small code change.
2. **Stop the draft from promising what a post will publish.** The draft runs a full rehearsal of publication — including a network call — and can show a fact that is already wrong by the time the owner is asked (demonstrated in a scratch run). Removing it makes drafting purely local; the real preview already exists one command later.
3. **Retire the words and fields only the old design left behind.** The lifecycle still carries stages and answer kinds the tool can never reach again, plus a record field nothing reads. Converting old records at load and deleting the dead vocabulary shrinks what every reader must hold.
4. **Split the record keeper from the record.** One file stores bounties, draws every status screen, counts promised money and gates the owner — and sits inside five import cycles. Moving the drawing and the money out leaves a small store every other part can trust.
5. **Keep the snapshot's camera, drop its shelf.** The draft-time capture of the working state is still the right input for the secret scan and the note; the durable copy of it (a pinned commit named on every record) is read today only by records written before the redesign. New records can stop naming it; old ones keep theirs.

**What is sound and should be left alone**

- The owner/foreign Git split — two channels, one for the owner's own history, one for anything a stranger's bytes could touch, with solver text never executed and never printed as the tool's own. Verified in code and in tests.
- The three hard stops: never-ship names cannot be published or come back in a solution, private repositories cannot be posted outside, and posting waits on the owner's written answer bound to what they were shown. Each is enforced at the real boundary, not by convention.
- The record's append-only event list, the named-refusal contract (refused with a name, exit 3), and the merge that Git itself recognises rather than the tool's own merge state.
- The standing-rules model: the owner answers once per repository, and the tool shows facts and never a verdict.

---

## Step 1 — the inventory (about 25 minutes)

### Files

`packages/box-bounty/` has 19 source files; `packages/box-cli/src/` has one. Line counts on master `0046519`; "exports" counts `^export` lines; "imported by" lists in-package importers (`from './<name>.js'`).

| File | Lines | Exports | Imported by |
|---|---|---|---|
| answer.ts | 420 | 11 | github, index, merged, owner, record |
| args.ts | 75 | 3 | index |
| create.ts | 392 | 13 | github, index |
| errors.ts | 10 | 1 | all other modules |
| format.ts | 107 | 10 | answer, github, hook, index, merged, owner, record |
| git.ts | 933 | 28 | answer, create, github, index, look, merged, owner, record, repository, settings, snapshot |
| github.ts | 1744 | 25 | answer, create, format*, hook, index, look, merged, record |
| hook.ts | 796 | 17 | index |
| index.ts | 66 | 50 | — (the package's public surface) |
| instructions.ts | 213 | 9 | owner, record, tell |
| look.ts | 63 | 4 | index |
| merged.ts | 240 | 3 | index, record |
| never-ship.ts | 272 | 10 | create, github, index, merged, owner, record, snapshot |
| owner.ts | 425 | 8 | index, record |
| pay.ts | 148 | 8 | answer, github, hook, index, merged, record |
| record.ts | 1304 | 54 | answer, create, format*, github, hook, index, instructions, look, merged, owner, tell |
| repository.ts | 116 | 6 | github, index, owner, record, settings |
| settings.ts | 655 | 38 | answer, create, github, hook, index, instructions, merged, never-ship, owner, record, tell |
| snapshot.ts | 130 | 6 | create, index |
| tell.ts | 46 | 2 | index |
| wording.ts | 58 | 6 | index, instructions, tell |
| **package total** | **~8,099** | | |
| box-cli/src/cli.ts | 537 | 0 | — (imports box-bounty/index) |

*format.ts imports only types from github/record (`import type`), so those edges carry no runtime cycle.

### Dependency graph (runtime imports)

```
cli.ts --> index.ts --> (all modules)
create --> github --> create          CYCLE: create <-> github   (github needs TOOL_VERSION)
record --> github --> record          CYCLE: record <-> github
record --> merged --> github          CYCLE: record -> merged -> github -> record
record --> answer --> github          CYCLE: record -> answer -> github -> record
record --> owner --> record           CYCLE: record <-> owner    (record needs DECISION_WORDS)
record --> instructions --> record    CYCLE: record <-> instructions
github --> answer --> github          CYCLE: answer <-> github
never-ship --> settings --> repository --> git    (no cycle)
format -T-> record, github            (type-only, acyclic)
git, errors, wording, pay, args, tell, look, snapshot: leaves or near-leaves
```

`record.ts` sits in five distinct cycles and imports 12 in-package modules — it is the hub. The practical consequence: no module below it can be read or changed alone, and `import type` cannot fix it because the imports are real calls (`postBounty` in record.ts calls `postGitHub`; record.ts calls `syncInstructions`, `noticeMergedSolutions`, `DECISION_WORDS`, `showPath`).

### Command map (cli.ts -> functions -> modules)

| Command | cli.ts calls | Reaches |
|---|---|---|
| `create --task --why` | `parseCreateArgs`, `createBounty` | args -> create -> snapshot, git, never-ship, github (scan+preview), record, settings, instructions |
| `post <id> [--preview] [--with-changes] [--include]` | `previewGitHub`, `postBounty` | github -> planGitHub/postGitHub -> git, gh api, record, settings, format, pay, never-ship |
| `status [id] [--comments] [--since]` | `renderStatus` | record -> github (refresh, comments, syncGitHubDecision), merged (scan on read), instructions, settings, owner, pay |
| `look <id> <n> [--full]` | `lookBounty` | look -> github (resolveAttempt -> answerGitHub collect), git diff, record |
| `apply <id> <n>` | `applyBounty` | answer -> github (resolveAttempt), git (merge machinery), record, settings, format, pay |
| `close <id> [--reason]` | `closeBounty` | record -> github (syncGitHubDecision), git (ref cleanup), instructions |
| `allow`/`deny <repo|id>` | owner.ts allow/deny | owner -> settings (write decision), record (postBounty/applyBounty for held bounties), instructions |
| `config ...` | owner.ts config family | owner -> settings (all keys), never-ship (publish lists), repository, instructions |
| `describe`, `help`, `rules` | `renderDescribe`, `renderHelp`, `renderRules` | tell, wording, record (overview lines), settings |
| `hook <slot|on|off|status>` | runHook/hookOn/hookOff/hookStatus | hook -> record (status line), github (refresh), pay, settings, host settings files |
| retired verbs (`answer`, `questions`, `reply`, `undo`, `reject`, `withdraw`, `remind`, `confirm`, `owner`) | refusal table in cli.ts | errors only — `command-removed`, names the replacement |
| `export`, `submit`, `verify`, `trace` | box-package commands | outside the bounty package |

## Step 2 — the data (about 25 minutes)

### BountyRecord fields

Written at `.box/bounties/<id>.json` by `persistRecord` (record.ts). "Written now" means a code path on master `0046519` can produce it; "legacy" means only old records on disk carry it.

| Field | Written by | Read by | Written now | Introduced |
|---|---|---|---|---|
| `kind: 'box-bounty'` | writeNewRecord | asRecord (validation) | yes | BT2 |
| `id`, `title`, `why`, `createdAt` | create | everywhere | yes | BT2 |
| `stage` | transitionTo (record.ts:1116) | everywhere | yes | BT2 |
| `events[]` | transitionTo (append-only) | status, describe, close | yes | BT2 |
| `snapshot` | writeNewRecord seed (create.ts:373) | github.ts:885-889 (legacy draft only), look.ts:56 fallback, answer.ts merge message | **yes, but read only by legacy paths** for `commit`/`tree`; `baseCommit` duplicated by `resume.commit` | BT2 |
| `resume` | create (kind 'recorded': branch, commit, why, note) | merged.ts:113, record status | yes | BT13 |
| `content {task,note,tool}` | create.ts:375 | github.ts:870-885 (issue text) | yes | BT15 |
| `noteSource` | create ('generated'); normalized to 'legacy' for old records | bountyContent, record validation | yes | BT15 |
| `folder`, `manifestSha256` | — | github.ts:873-891 only (unposted folder drafts) | **no — legacy readers only** | pre-BT6a |
| `githubApproval` | — | github.ts:1051, 1151-1206 (pre-BT8 recorded approval path), format.ts | **no** | pre-BT8 |
| `github` (publication) | postGitHub (github.ts:1145,1210) | status, collect, close, format | yes | BT6/BT6a |
| `answer` (singular) | — | attemptsOf normalizes it (record.ts:313-328), asRecord validation | **no** | pre-BT7 |
| `attempts[]` | collectHistoryPullRequest (github.ts:1553) | status, look, apply, merged scan | yes | BT7c |
| `waiting` | waitForOwner | owner gate, status, apply merge-wait | yes | BT8 |
| `allowedBy` | postGitHub/apply path | status, owner history | yes | BT8c |
| `reward {amount}` | postGitHub:1144 (bound at post) | boundAmount, format.ts, promisedTotal | yes | BT11a |
| `conflicts` | apply/collect (null or path list) | status, apply refusal text | yes | BT7b |
| `scanFindings[]` | recordScanFinding (create.ts:377, github.ts:1086); settled by settleScanFindings | status, owner history | yes | BT8 scan / BT13 |
| `replies` | — | **nothing reads it** | **no — dead field** | BT7 era (reply removed in BT7c) |
| `job` | — | record.ts:1025 (display on ended records) | **no — `--job` retired** | pre-BT15 |
| `outside` (inside `github`) | syncGitHubDecision/refresh | status | yes | BT7 era outside-close detection |

### Stages and attempt outcomes

`transitionTo(` sites (all of them): posted github.ts:1234; taken github.ts:1530; answered github.ts:1531; applied answer.ts:286 + merged.ts:192; waiting record.ts:1136; rejected record.ts:1296; withdrawn record.ts:1298. `drafted` is the seed (record.ts:518,523).

| Stage | Moved into by | Only read |
|---|---|---|
| drafted | record seed | — |
| confirmed | **nothing on master** | github.ts:1029/1047/1061 (pre-BT8 post path), record.ts:419/586/1262, format.ts — all legacy reads |
| waiting | waitForOwner | — |
| posted | postGitHub | — |
| taken | collectHistoryPullRequest | — |
| answered | collectHistoryPullRequest | — |
| verified | **nothing** | nextStep:591, status lists, requireCurrentDelivery — legacy reads only |
| applied | applyBounty, merged scan | — |
| rejected, withdrawn | closeBounty | — |
| expired | **nothing** (no transitionTo, no write; `git log -S "stage: 'expired'"` finds no write ever landed) | format.ts:89, owner.ts:413 — dead weight in unions |
| undone | **nothing** (`undo` removed in BT7c) | github.ts:1588, format.ts:89, owner.ts:413, record.ts:1025 — legacy reads |

AttemptOutcome: `answered` written at github.ts:1548 (every current attempt); `verified` written only inside attemptsOf's legacy conversion (record.ts:323, for `level: 'mechanical'` old records); `check-failed`, `check-unrunnable`, `check-not-run` — **never written** (checks were removed; they survive only in the type :68, the applicableAttempts filter :338 and the sort :973-974).

### Owner settings (`loadSettings`, settings.ts)

| Key | Written by | Read by | Still live? |
|---|---|---|---|
| `kind` | migrations set it | loadSettings validation | yes — schema check |
| `repositories` (per-repo decision/reward) | allow/deny/config | requireRepository, readDecision, repoReward | yes — the core |
| `decision`, `mergeDecision` | writeDecision/writeMergeAnswer | readDecision | yes |
| `projects` | — (old shape) | migration reader settings.ts:313-348 | live migration reader — still needed while pre-BT8c settings exist |
| `retiredReward` | migration | readDecision notices | legacy — kept so a migrated owner still sees the old amount in `config` |
| `rewardPromiseSaid`, `rewardNoticeAt`, `askMergeNoticeAt` | markSaid | saidOnce/saidAlready — once-only owner notices | live but single-fire; droppable only when no old settings file can still be read |
| `migrations` | migration writes | readDecision:513, renderConfig owner.ts:304 | live — shown to owner as history |
| publish lists (safe-to-publish / never-publish additions) | config add | never-ship rules | yes |

### Git refs

| Ref | Written by | Removed by | Read by |
|---|---|---|---|
| `refs/box-bounty/<id>` | writeNewRecord (record.ts:~506) | dropDurabilityRefs at close | legacy draft path github.ts:885-889; tests: record.test.ts:56, bt15.test.ts:188, snapshot.test.ts:77 |
| `refs/box-bounty/<id>-answer-<n>` | collectHistoryPullRequest (github.ts:1529) | dropDurabilityRefs | keeps fetched PR heads alive; nothing dereferences the name |
| `refs/box-bounty/<id>-answer` (singular) | — (pre-BT7 writes) | dropDurabilityRefs | old records only |
| `refs/box-bounty/<id>-github` | postGitHub (github.ts:1146,1211) | dropDurabilityRefs | pins the publication commit for collect/close paths |

### Instruction and hook state

- Instruction files (AGENTS.md, CLAUDE.md, host files): the Box rules block between `<!-- box-bounty -->` markers (wording.ts RULES_MARKERS), inserted/updated/removed by instructions.ts `syncInstructions`; toggled by `config set instructions`.
- Hook: a host settings file inside the project (`.claude/settings.json` etc.) gets `box bounty hook <slot>` entries for `start`, `pause`, `finish` — installed by hookOn with byte-preserving JSON-span editing; uninstall state in `.box/hook-on.json`; told-once state in `.box/hook-told.json`; budgets: at most 8 gh calls per run, per-call and run timeouts, GitHub contacted only while an open bounty is posted.

## Step 3 — the suspects (about 50 minutes)

| # | Verdict | Evidence |
|---|---|---|
| S1 | **Confirmed** | `confirmed`, `verified`, `undone`, `expired` have no `transitionTo` and no `stage:` write (all write sites listed in step 2). `expired` has no write anywhere in history (`git log -S "stage: 'expired'"` empty). Reads remain for old records: github.ts:1029/1061 (confirmed posts), record.ts:586/591, format.ts:89, owner.ts:413, github.ts:1588. Cost: about a dozen read sites keep legacy vocabulary in every reader's head. |
| S2 | **Confirmed** | `check-failed`, `check-unrunnable`, `check-not-run` are never produced — they appear only in the AttemptOutcome union (record.ts:68), the applicableAttempts filter (:338) and the sort (:973). `verified` is written only for the legacy `level: 'mechanical'` normalization (:323). |
| S3 | **Confirmed, partly** | `folder`/`manifestSha256` read only at github.ts:873-891 for unposted legacy drafts. `githubApproval` only in the pre-BT8 post path (github.ts:1051, 1151-1206) plus format.ts. `legacyConfirmed` only at github.ts:1061. But `content` is **current**, not legacy — written at create.ts:375, read for every issue body. Also found `replies` (record.ts:206) read by nothing and `job` written by nothing. |
| S4 | **Partly confirmed** | `projects` is a live migration reader (settings.ts:313-348) — still needed; `retiredReward`/`rewardNoticeAt`/`askMergeNoticeAt`/`rewardPromiseSaid` are once-only notices — live code but single-fire, droppable only when the kitchen declares pre-BT8c settings extinct; `migrations` is shown to the owner (owner.ts:304); `kind` is the schema check. Nothing is dead code today. |
| S5 | **Confirmed** — see the snapshot section | Current-code reads of the durable snapshot: the create-time enumeration and note facts (real); `record.snapshot` fields on new records (written but read only on legacy paths plus one cosmetic merge-message line); the `refs/box-bounty/<id>` pin (protects a commit nothing post-create reads for new records). |
| S6 | **Confirmed by run** | Scratch fixture under `%TEMP%\kitchen-K21-*` with a stand-in `gh` and a bare remote: `create` printed "nothing new is published"; after editing and committing `a.txt`, `post --preview` showed 1 first-published commit and 1 tracked file staying home. The preview also costs a `gh auth status`, a `repos/<repo>` API call and a `git fetch` **on every create** — and is shown only in create's `--full` block (cli.ts:283-285) or as an "unavailable" line. |
| S7 | **Confirmed** | github.ts: 1,744 lines, ~45 functions, at least seven jobs: gh client and response validation (:97-257), commit/file scanning (:258-500), plan building (:500-780), issue text (:780-990), post (:992-1243), answer collection (:1244-1560), close/sync (:1560-1744). Only four section comments mark it. Splitting the scan out also fixes S10. |
| S8 | **Confirmed** | record.ts: 1,304 lines mixing storage (`asRecord`, persist), rendering (`renderStatus` ~200 lines, `renderHelp`, overview, nextStep, ownerBlock), money (`promisedTotal`, `withPromiseLock`, `assertPromiseRoom`), the owner gate (`ownerGate`, `waitForOwner`, `allowedByFor`), command implementations (`postBounty`, `closeBounty` call into github/answer) and legacy compat. It imports 12 in-package modules and sits in 5 cycles. |
| S9 | **Confirmed, by design with one gap** | Amount: `boundAmount` prefers the posted issue body over `record.reward`, which wins over settings — deliberate (BT11a: the posted promise is the fact). State: record stage is local truth; `pending`, `formatRead`, `outside`, `closedNote` are the reconciliation fields — disagreement is designed for. Gap: `syncGitHubDecision` comments/closes/removes on GitHub **without reading the owner's decision** (no `readDecision` call in github.ts:1565-1744) — already BACKLOG BT9; confirmed in code. |
| S10 | **Confirmed** | create.ts:9 imports `looksBinary`, `scanText`, `previewGitHub` from github.js. The scan helpers are Git-agnostic text functions; the preview pulls the whole GitHub layer (and a fetch) into drafting. Moving `scanText`/`looksBinary` and the binary-path helpers into a small `scan.ts` removes create's GitHub dependency except the preview — which S6 argues can go entirely. |
| S11 | **Partly confirmed** | hook.ts: 796 lines. About 270 lines (roughly :303-579) are a tolerant JSON parser/rewriter for host settings files — proportional to the byte-exact on/off guarantee the disclosure promises (hook.ts:742), but heavy. It re-implements the inside-the-project link walk instructions.ts already has (checkedSettingsPath :593-621 vs instructions.ts:21-37): same guarantee, two implementations. The rest (slots, budgets, told-once, disclosure) earns its size. |
| S12 | **Confirmed** | Retired-path tests: bt15.test.ts:27-58 (folder post/confirmed drafts), :267-288 (folder-posted record, pre-BT6a publication), record.test.ts:100-121 (undone load, confirmed post), bt8a.test.ts legacy migration block, bt16.test.ts:229 (`projects` migration). They protect real compat code — keep while the compat code stays. GitHub-side guarantees rest entirely on the stand-ins (github-fixture.ts and variants); the Git guarantees (snapshot, never-ship classification, merge/apply, refs) run on real Git. Tests that need no Git at all (K14's question): the format/pay/scan-text parsing cases could run bare but currently ride inside fixture-heavy files. |
| S13 | **Partly confirmed** | Three backlog items, two code defects and one owner question — not one root cause: (a) `syncGitHubDecision` ignoring the owner's decision (BT9) — an authority question needing an owner call; (b) stale index after a clashing apply (BT14/K15) — a missing index refresh on the abort path; (c) instruction-file writes into `.git/`/`.box/` (BT8b) — a missing refuse-list at the write boundary. Shared shape: edge-path writes not re-checked against a boundary; the fixes differ. |

**Added suspects found during the walk**

| # | Verdict | Evidence |
|---|---|---|
| A1 `record.replies` dead field | Confirmed | record.ts:206 — declared; grep finds no read or write. `reply` was removed in BT7c; the field outlived it. |
| A2 record.ts is the cycle hub | Confirmed | Five cycles in step 1's graph; record.ts imports github (postGitHub, syncGitHubDecision...), owner (DECISION_WORDS), answer (showPath), merged, instructions. |
| A3 stale comments for the retired design | Confirmed | look.ts:16-17/25-27 still describe `<dir>` folder collection; a record.ts comment near :505 says "after the folder is in place"; answer.ts's AnswerSpec comment says "parented on snapshot.baseCommit" — attempts are PR heads now. |
| A4 one-caller wrappers | Confirmed | `approveGitHub` has exactly one caller (previewGitHub, github.ts:1023); `postBounty` in record.ts is a two-line forwarder to postGitHub; the `ownRepository`/`requireRepository` pair in settings. Each adds a name a reader must hold. |
| A5 retired-route detection triplicated | Confirmed | The same legacy-route shape appears at requireCurrentDelivery (record.ts:1249), the legacy draft reader (github.ts:873) and the nextStep/ownerWaitLines texts — three places must agree about what "old" means. |

## Step 4 — the components (about 40 minutes)

### 1. Drafting — `create`

- **Purpose:** turn a task file and a one-line why into a durable draft record, with a note the solver can read and nothing published.
- **Files/functions:** create.ts (`planBounty`, `composeNote`, `finalizeBounty`, `createBounty`), args.ts (`parseCreateArgs`, retired-flag refusals), snapshot.ts (`createSnapshotCommit`, `classifySnapshot`).
- **Reads/writes:** reads the task file, git status/tree via a temporary index (snapshot.ts:48-63), never-ship rules, settings (reward for the note); writes `.box/bounties/<id>.json`, `refs/box-bounty/<id>`, the generated note file.
- **Design decisions:** snapshot via temp-index commit — never touches worktree/index/branch (snapshot.ts:48-124; real-Git test snapshot.test.ts:56) — **holds** as the scan/enumeration vehicle; id derives from snapshot.commit+title+time (create.ts:371) — **partly** (any stable input would do); the create-time publicationPreview (create.ts:384-390) — **no longer holds**: it can show a stale fact (S6 run) and costs a fetch on every draft.
- **Leftovers:** `plan.snapshot`'s durable fields (S5); comment trails from the folder era.
- **Hard stops:** never-ship input refusal (`never-ship-input`, BOUNTY.md:111, enforced when reading the task file); the create-time scan names secret-shaped hits before any post.
- **Tests:** snapshot.test.ts (real Git, nine tests including junction/link canonicalisation), create.test.ts, never-ship.test.ts classification — strong on real Git; the preview's only contract is exercised through stand-in fixtures.
- **Risk:** composeNote's base-to-snapshot diff canonicalisation under links/junctions — covered by snapshot.test.ts:103-114; a change to the enumeration must keep those tests meaningful.
- **Recommendations:** remove the create-time preview (S2/P2 — it can state an untrue fact and makes drafting depend on the network); move the scan helpers to their own module (S2/P1).

### 2. The owner's yes — `allow`, `deny`, `config`

- **Purpose:** the owner answers once per repository; the tool binds every later post or merge to that answer.
- **Files/functions:** settings.ts (loadSettings, writeDecision, requireRepository, repoReward, migrations, `BOX_BOUNTY_SETTINGS_DIR` at :9-17), owner.ts (allow/deny/config commands, notices, config/reward handling :325-397).
- **Reads/writes:** reads/writes the owner settings file outside the repository; reads records (to resume held posts/merges on `allow <id>`); writes publish lists via never-ship.ts.
- **Design decisions:** one settings file outside every checkout — **holds**; `allow` binds the answer to the shown plan (`sameShown`, github.ts:1077) — **holds**; migration of pre-BT8c `projects` entries — **still needed** (S4).
- **Leftovers:** migration readers and once-only notice keys (S4) — real code, single-fire; `repositories` vs `projects` dual shape.
- **Hard stops:** the owner gate itself — posts wait before any gh probe (github.ts:1042-1049); scan holds can never be answered away (github.ts:1065 `allow-scan-held`).
- **Tests:** bt8a/bt8c/bt14/bt16 cover migration, per-repo binding and notices on real Git plus fixtures; settings-file writes run against `BOX_BOUNTY_SETTINGS_DIR` isolation — verified in the S6 scratch run (allow wrote only to the scratch dir).
- **Risk:** migration readers are load-bearing; deleting them strands old settings — the tests named in S12 would notice.
- **Recommendations:** keep; when the kitchen declares pre-BT8c settings extinct, drop the migration block and notice keys together (S3/P1 as one cleanup wave).

### 3. Posting — `post`

- **Purpose:** publish exactly the approved plan — real history plus at most one tool-built wip commit — as a GitHub issue.
- **Files/functions:** github.ts (`planGitHub` ~:500-780, `approveGitHub`/`previewGitHub` :992-1024, `postGitHub` :1026-1243), repository.ts (remote choice), format.ts (the readable block), pay.ts (`pay-to` facts).
- **Reads/writes:** reads HEAD, remote refs (fetch), status, the record; writes `refs/box-bounty/<id>-github`, the remote branch, the GitHub issue and label, `record.github` plus the reward binding inside `withPromiseLock` (:1141-1149).
- **Design decisions:** an issue on real history (BT6a) — **holds**; the approval bound to the shown plan, stale meaning a named refusal (:1172-1185) — **holds**; the reward bound at post inside the promise lock (BT11a) — **holds**; a legacy `githubApproval` still posts exactly what was approved (:1151-1206) — **partly**: correct compat, about 60 lines kept for records that can only shrink.
- **Leftovers:** the old-approval branch; the legacy folder-draft reader (:873-891).
- **Hard stops:** public-only repository (:91 `PUBLIC_ONLY`, enforced by the `private:false` + `visibility:'public'` check); never-ship on everything first-published (:782 `github-never-ship`; include-named files :562); the scan hold (:1084-1108) cannot be bypassed by an answer; promise room inside the lock (:1142 `assertPromiseRoom`).
- **Tests:** github-history.test.ts and fixtures drive the whole flow on the stand-in; never-ship violations, stale-preview and branch-changed refusals have named tests; the real-Git part (plan building, the wip commit) runs through the fixture repos — real Git, fake `gh`.
- **Risk:** plan/preview/post must agree — the stale-check battery (:1172-1185) is the guard and is tested; a change to planGitHub's inputs is the most delicate edit in the file.
- **Recommendations:** none urgent; the seam split belongs to the github.ts finding (S7, S2/P1).

### 4. Solutions arriving — `status`, `look`

- **Purpose:** show open state and let a numbered pull request become a recorded attempt — facts only, solver text fenced.
- **Files/functions:** look.ts (`lookBounty` — a diff over fetched objects with `--no-ext-diff --no-textconv` :58-60), github.ts (`resolveAttempt` :1459, `answerGitHub`/`collectHistoryPullRequest` :1425-1556, `listGitHubAnswers`), record.ts (`renderStatus`, ~200 lines).
- **Reads/writes:** reads `gh api` PR data, FETCH_HEAD, records; writes the attempt record and `refs/box-bounty/<id>-answer-<n>` (:1529), `seenAt`, `seenPullRequests`.
- **Design decisions:** collection refuses bad PRs by name — wrong branch (:1436), changed mid-collect (:1443), unsafe tree (:1491), never-ship in new history (:1514 `answer-never-ship`), empty diff (:1518) — **holds**; solver text never shown as the tool's own (fenced `solver change |`, credential redaction :93) — **holds**.
- **Leftovers:** look.ts comments still describe folder `<dir>` collection (:16-17, 25-27) — stale text only.
- **Hard stops:** `answer-never-ship` is the inbound half of the never-ship stop — a path planted deep in PR history still cannot land (:1494-1514); `github-branch-changed` refuses if the bounty branch moved outside the tool (:1483).
- **Tests:** answer.test.ts and github.test.ts on the stand-in plus real Git objects; hostile-path and history-plant cases covered (bt7-filters, github tests).
- **Risk:** the FETCH_HEAD race check (:1443) is the only guard against mid-collect change — tested; the ls-tree unsafe-path check is the solver-input boundary — tested.
- **Recommendations:** fix the stale comments (S1/P1, part of the legacy trim).

### 5. Bringing one home — `apply`, merge recognition, `close`

- **Purpose:** land the chosen solution on the owner's current code under owner rules; end the bounty honestly either way.
- **Files/functions:** answer.ts (`applyBounty` — a real `git merge --no-ff` with the hooks path outside the repo, `GIT_ATTR_SOURCE=HEAD`, dirty-path byte save and abort restore, transition at :286), merged.ts (`noticeMergedSolutions`/`checkMergedSolutions` — an ancestry check on every record read, a binary-search landing finder :157-168), record.ts (`closeBounty` :1277-1304), github.ts (`syncGitHubDecision` :1565+).
- **Reads/writes:** apply reads the attempt commit, the decision and dirty paths; writes the merge commit, record `applied`, drops durability refs and syncs GitHub. merged.ts reads one `rev-list` per open bounty per process; it can write `applied` and a GitHub sync as a side effect of a read.
- **Design decisions:** any-merge recognition via ancestry, never commit text (merged.ts:1-16) — **holds**; it replaced three failed review rounds of staged merges. Closing never waits even when the owner was not asked (the `unasked` fact :189-204) — **holds by design**, and it is also the gap: `syncGitHubDecision` acts on GitHub without consulting the owner's decision (S13a).
- **Leftovers:** read-with-side-effects — `loadRecord`/`listRecords` trigger the merge scan (record.ts:488,536); deliberate, but the trigger lives inside a getter where no caller expects it.
- **Hard stops:** the owner/foreign Git split (git.ts — foreign commands run with pinned config and quoted args; unsafe owner commands named); dirty-worktree protection in apply with byte-exact restore; merges wait under ask-mode (mergeWaitLines).
- **Tests:** bt7b.test.ts, answer.test.ts, first-merge.test.ts on real Git; `unasked` marking and partial-fact lines tested; the stale index after an abort is the known gap (K15/BT14).
- **Risk:** apply's abort/restore path (index left stale — a tested complaint, not corruption); syncGitHubDecision's authority scope — an owner decision, not just code.
- **Recommendations:** the owner decision on outside-closes (S1/P3); an index refresh on the abort path (S1/P1); name the read side-effect in loadRecord's contract (S1/P1).

### 6. Telling the owner — owner block, pay message, first-merge note

- **Purpose:** relay to the owner in their own words what waits, what happened and whom to pay.
- **Files/functions:** record.ts (`ownerBlock`, `ownerWaitLines`, `firstUseBlock`, the scan-hold text at github.ts:1091-1107), pay.ts (`payNotice`, `payToLine` — whom, where, test-mode named), owner.ts (history render :413-419), merged.ts (`recordFirstMerge` and the emitted fact lines :202-215).
- **Reads/writes:** reads record events, decisions, scan findings, pay facts; writes nothing itself (emits lines); `recordFirstMerge` writes a once-only `.box/FIRST_MERGE` marker via settings.
- **Design decisions:** "pass this on in these words" owner blocks — **holds** (K18 measured every posting agent writing an honest relay); the complete pay message — **holds**; once-only notices (`saidOnce`) — **holds but single-fire** (S4).
- **Leftovers:** none found — the blocks render from live fields.
- **Hard stops:** the scan-hold owner text is the human half of the publish hold; it names files and lines but never the secret bytes — verified in the S6 run's held-post output.
- **Tests:** bt13/bt14/first-merge tests on fixtures; K18 measured relay fidelity end to end.
- **Risk:** text drift — the blocks quote command names; tests assert on them.
- **Recommendations:** none beyond the BT17 quietness wave already landed.

### 7. Memory across sessions — record, instruction files, hook

- **Purpose:** any later agent (or the owner's next session) sees the same truth.
- **Files/functions:** record.ts (store and render), instructions.ts (the rules block in host instruction files, import-graph aware, containment/link checks :21-37), hook.ts (slots start/pause/finish, told-once `.box/hook-told.json`, install records `.box/hook-on.json`, byte-exact JSON-span editing, budgets).
- **Reads/writes:** record files under `.box/bounties/`; instruction files in-repo (marked block only); host settings files in-repo; `.box/hook-*.json`.
- **Design decisions:** append-only events plus a stage field — **holds**; the told-once hook with hard budgets (at most 8 gh calls, timeouts, GitHub only while posted) — **holds**; `hook on` prints a full disclosure and changes nothing until `--confirm` — **holds** (K20: match).
- **Leftovers:** the ~270-line JSON rewriter duplicating the containment walk instructions.ts already has (S11); the hook file lives inside the project tree by design (agents can commit it — noted, not a defect).
- **Hard stops:** hook writes stay inside the project (checkedSettingsPath :593-621 refuses links/junctions/escapes); instruction writes stay inside the marked block; `.box/bounties/` is never published (a path-prefix filter in the publication plan).
- **Tests:** hook.test.ts (byte-exact off, told-once, budgets — fixture hosts), tell.test.ts, instructions covered in bt8a/bt14.
- **Risk:** the JSON rewriter is the most intricate text code in the package — a malformed host file must restore byte-exact; hook.test.ts covers the guarantee; the `.git`/`.box` instruction-file gap (S13c) is the open one.
- **Recommendations:** a refuse-list for instruction-file targets (S1/P2); share or cross-check the two containment walks (S1/P1).

### 8. Underneath — git.ts, the gh layer, errors, wording, tests

- **Purpose:** the plumbing every component stands on.
- **Files/functions:** git.ts (the `git`/`gitOutcome`/`ownerGit`/`ownerGitOutcome` channels, `commandConfig` pins, `unsafeOwnerCommands`, `dryMergeOnto`, `gitIndexWrite`, `gitRefsWrite`, `mergeBase`, the GIT_LEAST probe), github.ts's gh half (`resolveProgram` for `gh`, `api`, `remoteGit`, `signedAccount`, GH_LEAST, credential redaction :93), errors.ts (`BountyRefused` — 10 lines, the whole refusal mechanism), wording.ts/tell.ts (`DESCRIBE_LINES`, `RULES_MARKERS`, `renderRulesBlock`), index.ts (50 re-exports — the public surface).
- **Reads/writes:** this is the only code that spawns `git`/`gh` — the owner channel runs with the owner's config; the foreign channel pins config so solver-controlled config, hooks and attributes cannot run (answer.ts also disables the hooks path and attributes on the merge).
- **Design decisions:** two Git channels by caller, not by repository — **holds**; the single most important structural decision. `BountyRefused` with named reasons as the only failure vocabulary — **holds**. Every wording constant in one file (wording.ts) so describe, rules and the hook cite the same text — **holds**.
- **Leftovers:** index.ts re-exporting nearly everything (50 exports including internals like `transitionTo`, `refName`) — the package's public surface is the whole package.
- **Hard stops:** most live here — foreign-git pinning, redaction, the GIT_LEAST/GH_LEAST probes, `answer-unsafe-path` upstream at github.ts:1491.
- **Tests:** bt7-git-channels.test.ts proves the split on real Git; secret-literals.test.ts greps the suite for credential patterns; k14-start-budget bounds startup; report.test.ts covers fact reports.
- **Risk:** git.ts is where a "harmless" flag change becomes an escape — the unsafe-commands list and pin set are the review surface; changes there demand the git-channels test plus a hostile-fixture run.
- **Recommendations:** narrow index.ts's public surface when the record split lands (S1/P1, rides with the record split).

## Step 5 — the snapshot, decided on evidence

BT15's own map (waves/BT15.md, "The snapshot's remaining uses") held up under this walk, with one sharpening: the uses split cleanly into **transient** (needed only during `create`) and **durable** (named on the record, pinned as a ref).

| Use | Needs | Could Git at use-time serve it? |
|---|---|---|
| Create-time scan set and note facts (`classifySnapshot`, the `composeNote` base-to-snapshot diff) | A consistent enumeration of the working state — uncommitted and untracked included — with junction/link canonicalisation | **Not safely** — `ls-files`+`status` could enumerate, but the note's correctness under links/junctions was built on a real tree (snapshot.test.ts:103-114); live HEAD loses uncommitted work |
| Draft id derivation (create.ts:371) | Any stable input | yes — trivially |
| `record.snapshot` on new records (`commit`, `tree`, `baseCommit`) | Nothing post-create reads it on current routes: `look` uses `github.commit` for history posts; `baseCommit` duplicates `resume.commit` | yes — `resume.commit` already carries the base |
| `refs/box-bounty/<id>` pin (record.ts:~506) | Keeps the snapshot commit resolvable | only legacy readers dereference it (the old-draft check github.ts:885-889; tests) |
| Old records' `record.snapshot` and pin | `bountyContent` legacy-draft verification; the `look` fallback for pre-history records | keep — those records exist and must load |

**Recommendation: a middle course.** Keep the capture mechanism — the temp-index working-state build and `classifySnapshot` are the honest enumeration the scan and the note need. Retire the durable half for new records: no `refs/box-bounty/<id>` pin on new drafts, no `record.snapshot` field (make it optional on the type — asRecord never validated it anyway; `look.ts:56` and the merge-message line read `resume.commit` for old records' base). Whether the transient object is a commit or a bare tree (`write-tree` instead of `commit-tree`) is the implementer's choice — a tree suffices for the enumeration and the note diff.

**What it removes:** the ref write in `writeNewRecord` (about three lines) and its cleanup path for new records (`dropDurabilityRefs` stays — deleting an absent ref is a no-op and old records still need it); `BountyRecord.snapshot` becomes a legacy-only field (about ten lines of type and seed); the concept "a third kind of commit lives in the repository" for anything written after the wave. `snapshot.ts` (~130 lines) keeps its enumeration machinery almost unchanged.

**What it costs — tests replaced, not deleted:** snapshot.test.ts 'records an identifier Git itself resolves' (:70-85) — retire or repoint at the transient tree; record.test.ts 'pins the snapshot under a ref gc cannot prune' (:41-58) — retire for new records, keep a legacy-record variant; the bt15.test.ts:188 ref assertion — same treatment; the classification, no-mutation and junction tests (:31-128) stay untouched — they protect the part that remains. The guarantee each retires: "draft facts survive gc" is no longer needed because nothing post-create reads the object; "the capture is a real Git object" survives via the transient tree.

**What it does to S6:** orthogonal, but it shrinks create's surface further — with the preview gone (the S6 finding) the snapshot's only create-time consumers are the scan and the note, exactly what the transient tree serves.

## Step 6 — ranking and proposed waves

Scores: **S**implify 1-3, **P**rotect 1-3 (the brief's rubric). Ordered by sum, then Protect.

| Finding | S | P | Sum | One-line reason |
|---|---|---|---|---|
| 1. `syncGitHubDecision` acts on the owner's GitHub without consulting the owner's decision (S13a/BT9) | 1 | 3 | 4 | writes outside after authority may be withdrawn — an owner question first |
| 2. The create-time publication preview can state a stale fact and costs a fetch per draft (S6) | 2 | 2 | 4 | it can say something untrue; removing it makes create offline-only |
| 3. Legacy vocabulary: never-written stages/outcomes, dead `replies`, legacy-only fields, stale comments (S1/S2/S3/A1/A3/A5) | 3 | 1 | 4 | removes concepts every reader holds |
| 4. record.ts is a 1,304-line hub inside five import cycles (S8/A2) | 3 | 1 | 4 | splits the store from rendering, money and gates |
| 5. The snapshot's durable half serves only legacy records (S5) | 3 | 1 | 4 | removes a stored copy and a concept |
| 6. github.ts mixes at least seven jobs; the scan helpers are not GitHub-specific (S7/S10) | 2 | 1 | 3 | real seams; splitting reduces reader load, not just code size |
| 7. Instruction-file writes can target `.git/`/`.box/` (S13c) | 1 | 2 | 3 | a write boundary the owner (or an agent running config) can cross destructively |
| 8. One-caller wrappers: `approveGitHub`, `postBounty`, `ownRepository` (A4) | 2 | 1 | 3 | names without jobs |
| 9. Stale index after a clashing apply (S13b) | 1 | 1 | 2 | friction, not corruption |
| 10. Read-with-side-effects: `loadRecord` runs the merge scan (component 5) | 1 | 1 | 2 | deliberate design; the contract should say so |
| 11. The ~270-line JSON rewriter in hook.ts duplicating the containment walk (S11) | 1 | 1 | 2 | heavy but earns the byte-exact guarantee; share the walk |

**Proposed waves (at most five, in order)**

1. **Draft without GitHub.** Remove `create`'s `previewGitHub` call (create.ts:384-390) and move `scanText`/`looksBinary` and the binary-path helpers into a small `scan.ts`. Outcome: `create` is purely local — no gh probe, no fetch, no stale-capable preview; the real preview stays at `post --preview`. Removes finding 2 and unblocks finding 6's scan seam. Depends on nothing.
2. **Legacy vocabulary trim.** Normalise old records at load (`asRecord` is the single compat gate), drop `replies` and the never-written stage/outcome reads outside the gate, fold the three retired-route checks into `requireCurrentDelivery`, fix the stale comments. Removes finding 3. Mechanical; depends on nothing. The brief must enumerate which compat stays — undone-loads, confirmed-posts and the folder-draft read are all still reachable while old records can exist.
3. **The snapshot's durable half retires.** As decided above: the transient tree kept, the pin and `record.snapshot` dropped for new records, `look` and the merge message reading `resume.commit` for old ones; the three named tests replaced by a legacy-record variant and a tree-identifier check. Removes finding 5. Do after wave 2 so the compat surface is already consolidated.
4. **Split the record.** Extract rendering (`renderStatus`/`renderHelp`/overview/`nextStep`/the owner blocks) and money (`promisedTotal`, `withPromiseLock`, `assertPromiseRoom`) out of record.ts; the store keeps `asRecord`, events, transitions and refs. This breaks the five cycles — the `postBounty`/`closeBounty` command wrappers move to cli level or a small commands module. Removes findings 4 and 8 and makes every later wave cheaper. Do after 2-3 so there is less code to move.
5. **Boundary fixes plus the owner's call.** Code: a refuse-list for `.git`/`.box` instruction-file targets, an index refresh on apply's abort path, collapse the one-caller wrappers, share the containment walk. The owner decision comes first — whether `syncGitHubDecision` may tidy GitHub when the standing answer is deny, ask, or nothing — and the wave then implements the answer. Covers findings 1, 7, 8, 9 and 11.

## What was not examined, and why

- **`packages/box-package/**` internals** (where `resolveProgram` lives) — out of the wave's stated scope; only its seam into bounty code was read.
- **Test-file internals beyond names and roles** — the S12 inventory used test names, fixture wiring and grepped assertions, not a full read of 50 files.
- **`docs/box-v4/BOUNTY.md` and PLAN.md as contract versus code** — consulted as contract, not audited line-by-line against behaviour.
- **Non-English/encoding and Windows junction corners beyond the tested paths** — the tested canonicalisation was verified; untested corners remain untested, not proven safe.
- **Performance beyond k14's start budget** — no profiling was in scope; the costs noted (a fetch per create, a rev-list per record read) come from reading call sites, not benchmarks.
- **The stand-in `gh` fixtures themselves** — which of the variants is committed and whether they drift — was listed by name only; the K19 parity test covers one.

*Timebox note:* the six steps ran to roughly their budgets and this report was written inside the window.
