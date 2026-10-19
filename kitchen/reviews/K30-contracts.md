# K30 proof map: every guarantee to its proof, the gaps ranked, the hardening plan

Companion to `docs/box-v4/CONTRACTS.md`. Each guarantee names the test that would fail if it broke, with the assertion quoted, or is marked `side effect` / `unproven → gaps`. Written 19 October 2026; all test names and assertion lines were read from the files on this branch.

## Refusal coverage (mechanical)

`node` one-liner (kept in the wave notes): enumerates every `BountyRefused('x'` literal, every `invalid('x'` call, the gate.ts/settings.ts/snapshot.ts ternaries and `retiredRoute` across `packages/box-bounty/**` and `packages/box-cli/src/**` (dist excluded) → **134 distinct reason names**; counts each name's occurrences inside the nine `**Refusals.**` blocks of CONTRACTS.md → **missing: [], in >1 block: []**. Every name sits in exactly one section; none needed the "fits no stage" list.

## Step 2a — guarantees → proofs

### create
- C1 never-ship removal — `never-ship.test.ts` 'removes an untracked secret' / 'catches env-file suffixes…': `expect(shipped).toEqual(['TASK.md', 'secretary/minutes.txt', 'src/…'])`. **Bitten (bite 1).**
- C2 links refused not followed — `snapshot.test.ts` link/junction cases; `expect(...).toBe('link-escape')` family via `refused`. Proven.
- C3 no network, no chain ref at create — `record.test.ts:54` `expect(git(repo, ['for-each-ref', '--format=%(refname)', 'refs/box-bounty/'])).toBe('')`; `bt32.test.ts` quiet test: `expect(gitCalls(trace, 'fetch')).toBe(0)`. **Bitten (bite 6).**
- C4 why required, record-only — `create.test.ts`/`record.test.ts` refusal `missing-why`; `expect(...reason).toBe('missing-why')`; "neither it nor why reaches the issue" (bt15.test.ts:221). Proven.
- C5 pinned snapshot commit — `snapshot.test.ts`/`record.test.ts:64` uses `result.plan.snapshot.commit`. Proven (assertion is use-of-pin; commit-existence is side effect of `git cat-file` tests).
- C6 emitted bytes = pinned commit — `github-history.test.ts:105` `expect(git(bare, ['show', `refs/heads/${pub.branch}:app.txt`])).toBe('work in progress')`. Proven.

### post
- P1 private repo refused — `bt15-guarantees.test.ts` 'private GitHub publication refuses by name and preserves the draft': refused-assertion plus `expect(state().issues).toEqual([])`. **Bitten (bite 2).**
- P2 never-ship never publishes — `bt15-guarantees.test.ts` '…refuses newly committed never-ship content without changing owner bytes': `expect(fingerprint(repo)).toEqual(before)`; `github-history.test.ts:142` refused `github-never-ship`. Proven.
- P3 only named becomes public — `github-history.test.ts:132-136` `expect(pub.wip!.added).toEqual(['notes/hint.txt'])` and `expect(git(bare, ['ls-tree',…])).not.toContain('stay.txt')`. **Bitten (bite 5).**
- P4 owner's yes before post — `record.test.ts:160` `expectRefusal(() => postToGitHub(repo, id), 'owner-allow-needed')`; `bt13.test.ts:194` plain-words question. **Bitten (bite 3).**
- P5 scan holds publish — `bt13.test.ts:204` 'the secret-scan hold tells the owner what was found…'; `github-history.test.ts` refused `publish-held`. Proven.
- P6 issue states what was published — `bt10.test.ts` 'pins the public v2 fields…', `bt11.test.ts:320` 'posts the owner's amount in the listing and the v2 block'. Proven.
- P7 identity from remotes — `bt16.test.ts` cases 1–15 (e.g. case 4 `repository-several-allowed`, case 8 re-point). Proven.
- P8 push proven SHA — `bt32-pass-toctou.test.ts` + `bt32.test.ts` provenance tests. Proven.

### track
- T1 unasked text constant — `bt17.test.ts:108` said-once test + `record.test.ts` OPEN/status assertions. Partially side effect (wording diffed in many tests).
- T2 bounded overview — `kitchen/memory/measure.mjs` (K25) + bt14/bt17 measured line counts pinned in `describe` budget (`k14-start-budget.test.ts` describe git:3). Proven as measured.
- T3 others' text marked — `json.test`/`bt19` `fromOthers` field; `bt11b-pass.test.ts:153` 'hostile words on the line never reach the hook, status or the record'. Proven.
- T4 reads change nothing shared — `bt32.test.ts` 'create, help, describe and config never fetch and never push': `expect(gitCalls(trace, 'push')).toBe(0)`. Covers those commands; `status`/`look` refresh path is read-cache (`chain.ts:414` catch). Partially side effect.
- T5 corrupt record degrades — `record-access.test.ts`, `bt11.test.ts:309` 'malformed reward reads as corrupt, not as an amount'. Proven.
- T6 outside state shown with read time — `bt10.test.ts` ended-status reads ('never claims a current match', ':189'). Proven.

### review
- R1 nothing a solver wrote is run — `answer.test.ts:352` sentinel test: `expect(refusalOf(() => applyGitHub(repo, id))).toBe('apply-unsafe-config')` and `expect(existsSync(join(repo, '.gitattributes'))).toBe(false)`; report line `expect(…report…).toContain('nothing in the solution was run…')` (answer.test.ts:89); `bt15-guarantees.test.ts:34`. **Bitten (bite 4).**
- R2 facts not verdicts — `answer.test.ts:112` 'an answer that does not fix the task is still a numbered attempt': `expect(result.attempt.outcome).toBe('answered')`. Proven.
- R3 solver never-ship refused inbound — `bt15-guarantees.test.ts:27` 'a solver-added never-ship path is refused before recording or writing owner files': `expect(fingerprint(repo)).toEqual(before)`; `answer.test.ts:342`. Proven.
- R4 empty return refused — `answer.test.ts:273` 'a return that changes nothing is answer-empty': refused `answer-empty`. Proven.
- R5 unsafe path refused — `collect.ts:265` path checks; covered inside `bt6b*`/answer suites (`answer-unsafe-path` refusals). Proven (assertion embedded in refusal-of helpers).
- R6 descent/branch binding — `collect.ts:254-258`; `bt7*`/bt11b fixtures exercise wrong-branch refusal; `github-pr-not-descended` asserted via refused() in bt11b/github tests. Proven.

### decide
- D1 one ordinary merge naming the bounty — `answer.test.ts:70`: `expect(record.events.map(e=>e.stage)).toEqual(['drafted','posted','taken','answered'])` then apply `expect(applied.outcome).toBe('applied')`; bt32 `mergeCommit` message test. Proven.
- D2 clash stops clean — `answer.test.ts:134,173` conflict tests (`expect(readFileSync(join(repo,'src','app.py'),'utf8')).toBe('x\n')`). Proven.
- D3 any merge recognised — `merged.ts` + `bt13.test.ts:133` hand-merge close. Proven.
- D4 ask holds merges — `bt13.test.ts:29` 'apply holds the merge in a named waiting state': `expect(held.stdout).toContain('May it be merged?')`; `:62` bound-answer. Proven (same gate family as bite 3).
- D5 dirty path named refusal — `answer.test.ts:303` 'apply on a dirty path the merge would overwrite is a named refusal, not damage'. Proven.
- D6 close finishes outside work — `bt10.test.ts` close tests (`closes with the exact merged PR…`); `bt13.test.ts:161` 'closing a merge-held bounty never waits'. Proven.
- D7 unasked said as fact — `bt13.test.ts:133,151` 'says the owner was not asked'. Proven.

### pay
- PY1 amount only from owner — `bt11.test.ts:281` 'create and post take no amount flag — each spelling is a named refusal' (`reward-agent-set`). Proven.
- PY2 bound amount survives rewrite — `bt11.test.ts:402` 'post → the record's reward rewritten → close keeps the bound amount'; `:424` forged-down summary. Proven.
- PY3 limit gate — `bt11.test.ts:225,336` refused `promise-limit-exceeded`/`reward-needs-limit`, `expect(under.stderr).toContain('limit-below-reward')`. Proven.
- PY4 merged solver named — `bt11b-pass.test.ts:96,105` two-solver tests. Proven.
- PY5 never moves money — `bt11b.test.ts:62` off-shape links rejected; `:82` 'a pay-to line in a commit message or file is never the description'. Structural (no payment code exists) + proven parsing boundary.
- PY6 chain carries amount only — `chain.ts:356` sharePaid comment + `bt32.test.ts` allow-list loop (`field ${key} is not on the posted allow-list`). Proven for posted/paid events.

### memory
- M1 drafts local — `record.test.ts:54` for-each-ref empty; `bt32.test.ts:54-55` `expect(chainTip…).toBeNull()`. **Bitten (bite 6).**
- M2 allow-listed fields only — `bt32.test.ts:67-69` allow-list + never-field loops (quoted above). Proven.
- M3 shared free text scan-held — `bt32.test.ts:219` 'a secret-shaped field holds the event before any object is written'. Proven.
- M4 proven tips only — `bt32.test.ts:158` swapped-tip test; `bt32-pass-toctou.test.ts`. Proven.
- M5 forged local ref untrusted — `bt32.test.ts:135`. Proven.
- M6 plain clone sees no chains — `bt32.test.ts:84` `expect(git(plain, ['for-each-ref', 'refs/box-bounty'])).toBe('')`. Proven (local stand-in; real-GitHub claim is evidence, marked).
- M7 corrupt/old shapes degrade — `record.test.ts`, `bt31-ci.test.ts`, `bt32.test.ts:192` invalid-event skip. Proven.
- M8 append-only history — `record.test.ts:146,172` events equality assertions. Proven.

### the owner
- O1 nothing allowed without a rule — `record.test.ts:160` owner-allow-needed; `bt16` unlisted-candidate waits. **Bitten (bite 3).**
- O2 answers live outside repo — `bt13.test.ts:93` 'an edited record cannot mark a merge approved'. Proven.
- O3 choices only — `settings-unknown-name`/`settings-hard-stop` refusals; k29-arg-refusals + owner tests. Proven.
- O4 settings outside repo — `settings-inside-repo` refusal tests (`bt8*`/settings tests). Proven.
- O5 money per repository — `bt11.test.ts:89,111` (`expect(repoReward(repoB)).toEqual({amount:0,limit:null})`). Proven.
- O6 shown-state binding — `bt13.test.ts:62,80` stale-allow tests. Proven.
- O7 said once — `bt17.test.ts:108`; `settings.ts` said map. Proven.

### platform
- PL1 git/gh checked — `bt15.test.ts:80-103` network-guard tests; refusal names pinned in bt18/k29. Proven.
- PL2 one file, no deps, Node floor — `bt12-package.test.ts:63,73,132`; `bt12-install.test.ts` global-install journey. Proven.
- PL3 named state + next step — pervasive (`next:` in every refusal message); k29-arg-refusals. Side effect / structural.
- PL4 stranger text marked — `bt11b.test.ts:86` 'the four facts are the tool's words'; `fromOthers` (json.test.ts). Proven.
- PL5 json only where grown — `bt18.test.ts:70` `json-not-supported`. Proven.
- PL6 every refusal named — k29-arg-refusals.test.ts + this audit's 134-name check. Proven (structural).

## Step 2b — the bite experiments (scratch: `$TEMP\kitchen-k30-bite`, a copy of this tree with node_modules junctioned; real checkout never touched)

| # | Guarantee | Mutation (file + line) | Command | Result |
|---|---|---|---|---|
| 1 | C1 / hard stop 1 | `never-ship.ts:40` `/\.env$/` → `/\.envx$/` | vitest `never-ship.test.ts` | FAIL 'catches env-file suffixes…': `AssertionError: expected ['TASK.md',…(4)] to deeply equal ['TASK.md',…(2)]` — .env shipped |
| 2 | P1 / hard stop 2 | `gh.ts:209` `info['private']!==false||visibility!=='public'` → `info['visibility']==='never'` | vitest `bt15-guarantees.test.ts` | FAIL 'private GitHub publication refuses by name': expected refusal, none thrown |
| 3 | P4+O1 / hard stop 3 | `gate.ts:29` `read.decision==='allowed'` → `=== 'allowed' || true` | vitest `record.test.ts` | FAIL 'holds the first post when the owner has not decided: owner-allow-needed' — post proceeded ungated |
| 4 | R1 | `git.ts:551` insert `return [];` atop `unsafeOwnerCommands` | vitest `answer.test.ts -t "nothing a solver wrote runs"` | FAIL: `expected '' to be 'apply-unsafe-config'` — hostile config no longer refused |
| 5 | P3 | `publish-plan.ts:405` `include = validateIncludes(…)` → `[...validateIncludes(…), ...untracked]` | vitest `github-history.test.ts -t "only the untracked files named"` | FAIL — unnamed untracked files joined the published set |
| 6 | M1 / drafts never shared | `commands.ts:59` `if (record.github?.issue !== undefined && … !== null)` → `if (true)` | vitest `record.test.ts -t "durability ref"` | FAIL: `expected +0 not to be +0` at line 174 — draft close wrote `refs/box-bounty/<id>` |

All six mutations restored; `diff` against the checkout confirms zero remaining `K30-BITE` markers. Real repo untouched: `git diff master --stat -- packages tests` empty.

## Step 2c — scale targets

| Target | Measurement | Recorded number |
|---|---|---|
| create <1 s on 10,000-file repo | no dedicated script; closest is `k14-start-budget.test.ts` (process counts, not time) | **not measured** for 10k files |
| one post <30 s | `tests/box/bounty/measure-post.mjs` (manual evidence script, push-only wall time) | not a whole-post figure; measure-post measures the push leg only — **whole post not measured** |
| track flat 100→1,000 bounties | `bt32.test.ts` scale-gate (`syncChains` fixed Git-process count at small/large N) + `kitchen/memory/measure.mjs` (K25, N≤1,000 surface sizes) | met (PLAN.md); fixed handful of Git processes at any scale (bt32.test.ts:320) |
| review 100 solutions/bounty | nothing seeds 100 PRs | **not measured** |
| decide cheap at 1,000 records | K25 surface measurements cover status/overview; merge path not measured at N | **not measured** |
| memory 100,000 records | `kitchen/memory/storage/benchmark.mjs` (K27, node-sqlite chosen) | met locally (PLAN.md; K27 benchmark) |
| process starts | `k14-start-budget.test.ts` BUDGET table (e.g. apply 26 git / 5 gh after BT37) | pinned per command |

## Step 3 — the gaps, ranked

| Guarantee/target | Stage | Proves it today | Risk if it broke |
|---|---|---|---|
| (none touching a hard stop is unproven — all three hard stops, nothing-solver-wrote-runs, only-named-public, owner's yes, drafts-local are bitten above) | — | — | — |
| create <1 s on 10,000 files | create | nothing | untrue statement (PLAN.md asserts a bound nobody checks) |
| whole post <30 s | post | stand-in only (push leg measured, not the command) | untrue statement |
| review: 100 solutions per bounty | review | nothing | untrue statement |
| decide cheap at 1,000 records | decide | nothing (K25 measures reads, not apply/close) | untrue statement |
| T1 unasked-text-constant | track | side effect only (no test diffs the block across no-change runs) | neither (style/attention rule) |
| T4 reads change nothing shared | track | side effect only beyond the four commands the quiet test names | neither |
| C5 pinned snapshot commit exists | create | side effect (used, never asserted resolvable) | neither |
| PL3 no silent failure | platform | side effect (no systematic check every refusal carries `next:`) | neither |
| M6 on real github.com | memory | stand-in only (local bare remote) | neither (documented evidence limit) |

**Tests that prove nothing in any contract (delete candidates):** none found clearly orphaned; `look.ts:17` `refuse` helper is defined but never called (dead code — lean candidate). Kitchen meta-tests (verify-reuse, k35/k36/k37) test the kitchen, not product contracts — out of this contract's scope by design.

**Refusal names belonging to no stage:** none — all 134 assigned, mechanically verified.

**Code serving no stage (lean rule):** `look.ts` unused `refuse` helper; `record.ts` keeps retired-stage loaders by design (compatibility, not dead).

## Step 4 — hardening proposal (one wave per stage/foundation needing one)

- **Create hardening wave:** add a measurement that builds a synthetic 10,000-file repo and times `create` (and a C5 assertion that the snapshot commit resolves via `git cat-file`). Adds one measure script + one test; deletes nothing. Depends on nothing.
- **Post hardening wave:** extend `measure-post.mjs` (or a new measure) to time the whole `post` command end-to-end against the stand-in, asserting under 30 s; pin the preview path too. Depends on nothing.
- **Track hardening wave:** one test running the quiet-test pattern over `status`/`look`/`hook` (any command that reads) to pin T4 fully, plus a block-diff test for T1 (run status twice with no change, assert identical block). Depends on nothing.
- **Review hardening wave:** seed 100 synthetic attempts/PRs and measure `look`/collect wall time + process count at that scale. Depends on a record-seeding helper (may reuse K25 measure approach).
- **Decide hardening wave:** measure apply/close wall time + process count at 1,000 records; add the systematic `next:`-presence check across all 134 refusal names (PL3). Depends on the same seeding helper.
- **No wave needed** for memory, the owner or the platform foundations: their guarantees are already proven or documented stand-ins (M6's real-GitHub clause is an evidence limit, not a code gap).
