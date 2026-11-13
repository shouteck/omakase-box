# K68: the 30 slowest tests, read one by one, and what a command costs

Written by the CTO on 13 November 2026 for [K68](../../waves/K68.md), at the owner's request after K51 to K67: "have you looked at whether these tests are truly needed and done correctly?" I read the body of each of the 30 slowest bounty tests (a whole-suite run at 3 workers, so times are about twice what one worker takes; only the ratios matter) and traced the Git and `gh` calls behind a command. No code or test changed. **Verdicts are my reading, not proof: each conversion still needs the break proof of [TESTING.md](../../docs/box-v4/TESTING.md).**

## The numbers that frame it

- The 30 slowest tests are **540 s of the suite's 3444 s (16%)**. Even a 60% cut of all 30 is about 9% of the suite.
- Only **5 of the 30** defend a hard stop (and those 5 are not the slowest). K51's "protected" list was a keyword heuristic; most of these are journeys and diagnostics.
- **Almost no Git call repeats inside a command.** A traced `status` is 13 starts, all different; `collect a pull request` 24 starts (one repeated: `git diff --name-status` twice); `close` 23 (one repeated: `update-ref --stdin` twice). The cost is the number of distinct steps the tool takes, not waste: reading shared memory (fetch, two `for-each-ref`, `rev-list`, `cat-file`), appending a chain event (`rev-parse`, `cat-file -e`, `hash-object`, `mktree`, `commit-tree`, `update-ref`, `push`: seven starts), a `gh version` probe in every process. `k14-start-budget` already budgets these per command (`create` 14 Git, `post` 27 Git and 8 `gh`, `status` of a posted bounty 9 and 5), so the team has watched them.
- **Why a test is slow is mostly its setup:** posting one bounty is about 35 starts (3 to 4 s); a test that posts six, or runs 20 commands, is 20 to 30 s before it asserts anything.

## The 30, with a verdict

Key: **keep** needed as written; **battery** the same loop of commands appears in several tests; **data** the claim is about a pure rule, so test it as a table plus one real door; **state** build the state directly instead of reaching it through the real journey; **hoist** repeated work inside a loop; **dedupe** another test already asserts this; **compat** guards a retired record shape, an owner question.

| # | s | test | defends | why slow | verdict |
|---|---|---|---|---|---|
| 1 | 33.6 | bt38 T1 reads leave the instruction block byte and time identical | T1: unasked text constant | every read command run twice through the CLI, about 30 runs | **battery** (with 4 and 9) |
| 2 | 33.3 | first-merge: same-address copies notify once | the first-merge notice is once per repository address, case-folded | three whole worlds (post, solver PR, look, apply) to test address keying | **data**: keying table plus the one journey the file already has |
| 3 | 31.4 | pf5: at most five reads per command | a bound on board reads | posts five more bounties through the real flow only to have records | **state**: write the records directly |
| 4 | 22.4 | bt38 T4 reads append no chain event, push nothing | T4: reads change nothing shared | the same read-command battery again | **battery** |
| 5 | 21.1 | k14 every command within its start budget | the per-command process-start budget | about 20 commands, each counted | **keep**: it is the instrument, and the tool for judging every reduction below |
| 6 | 19.7 | bt6b-holes hole 1: a process filter naming a real program lands | the tool never runs a solver's program; a legitimate filter is not refused | a world, look and apply to test one classification | **data** (with 17, 20, 28) |
| 7 | 19.4 | bt61-text the journey, command by command | text of every command byte-identical (BT61) | 21 commands, each recorded | **dedupe** into one shared journey transcript (with 14, 19) |
| 8 | 19.3 | bt51 a late mark keeps the branch at the head | merge recognition under a late GitHub mark | apply and close through a stand-in that delays its answer | **keep**, but trim: one of two tests of the same recovery (see 18) |
| 9 | 18.6 | pf5 T1 and T4: reads leave the block and chains alone, send only identifiers | T1, T4 and what the board is told | the battery a third time, plus request shape | **battery**; keep the request-shape assertions |
| 10 | 15.2 | bt56 5: a close interrupted half way finishes once | recovery of a half-done close | world, apply with a refusing remote hook, close | **dedupe** with 18 |
| 11 | 14.9 | bt43 create, status, status --since, post --preview, config print each name quoted | PL4: a stranger's text is quoted by one renderer | seven commands, one formatter | **data**: the renderer as a unit, one door |
| 12 | 14.6 | bt26 a new record's merge message has no `snapshot:` line | a merge message carries a snapshot line only if the record does | two worlds, two applies, to read one string | **data** (the message composer as a function), and **compat**: the second half guards a retired field |
| 13 | 14.4 | bt12-install the whole $0 journey against stand-ins | the packed tool installs and runs | a real install and a real journey | **keep**: the one real-install journey |
| 14 | 14.4 | bt61-agreement the journey, create to close | text and `--json` documents agree | seven commands | **dedupe** into the shared journey transcript |
| 15 | 14.4 | bt7c-review a stored legacy outside-answers text names no removed command | no retired command is named in any output | the same three renders recomputed inside an 8-iteration loop (about 32 status renders) | **hoist**: render three texts once, check eight names against them; and **compat** |
| 16 | 14.1 | bt43 a subject merged by one apply prints quoted in a later conflict list | PL4 for a commit subject | two bounties, two applies, a conflict | **data**: the list renderer, one door |
| 17 | 13.8 | bt6b-holes hole 2: a git filter command whose alias lands in the tree is refused | the same classifier, a hostile case | world, alias, look, apply | **data** |
| 18 | 13.6 | bt51 a refused push leaves a named pending state; close retries | recovery from a refused push | world, apply, hook, close | **dedupe** with 10 |
| 19 | 13.4 | json-agreement the collected and applied views | text and JSON agree on two states | a look and an apply | **dedupe** into the shared journey transcript |
| 20 | 13.4 | bt6b lands a solution when every configured command resolves outside the repo | the classifier's positive case | world, look, apply | **data** |
| 21 | 13.0 | bt43 a subject published by a later post prints quoted in preview, body, close | PL4 again | post, apply, preview, post, close | **data** |
| 22 | 12.9 | bt58 a chain under the old name is read, continued and closed there | records written before 0.2.0 still work | two machines, an old-name world | **compat** |
| 23 | 12.8 | bt13 apply holds the merge; allow releases exactly the shown state | D4 (hard stop 3), plumbing | held merge, answer, apply, several wording pins | **keep**, with fewer wording pins |
| 24 | 12.6 | github-history --include publishes only what is named | P3, P2 | about eight whole previews to test eight include names | **data** in part: validate the include names before planning |
| 25 | 12.5 | bt40 one refusal per family through the built CLI | PL3: every refusal carries a reason and a next step | eight CLI runs | **keep** |
| 26 | 12.4 | github keeps hostile titles and PR text out of shell arguments | no shell injection | post, look | **keep** (setup is the cost) |
| 27 | 12.2 | bt7 a comment from an unreadable account is counted and shown | the stranger's name never printed | a posted world and two renders | **keep** |
| 28 | 12.0 | bt6b-third hole E: a launcher whose flag is not its manifest flag | the classifier | world, look, two applies | **data** |
| 29 | 12.0 | answer a conflict aborts clean and the record keeps it | D2: a clash stops, byte-clean | world, collect, apply | **keep** |
| 30 | 11.9 | bt39 an unchanged pull-request set costs no per-request file calls | bounded reads | four PRs, four renders | **keep** |

## The patterns

- **A. One battery run three times** (1, 4, 9; 75 s): the same list of read commands is driven through the CLI to show a different thing each time (the instruction block unchanged; no chain event and no push; what the board is told). One battery, run once, with all the assertions after each command, loses nothing: about **50 s** saved.
- **B. The same journey run five times** (5, 7, 13, 14, 19): create, post, look, apply, close, recorded for a start budget, for a text snapshot, for text-and-JSON agreement, for the install check. The start budget and the real install must stay separate; the text snapshot and the two agreement tests can read one shared transcript: about **27 s**.
- **C. A classifier tested through apply** (6, 17, 20, 28; 59 s): the rule "does this configured command run a program the solver wrote" is a function of a string and a repository; each case builds a world and applies. As K65 did for never-ship: a table of command strings (many more than these four, in milliseconds) and two real applies (one refused, one landed): about **49 s**, and many more cases.
- **D. A formatter tested through seven doors** (11, 16, 21; 42 s): the one renderer of a stranger's text, driven through every command. The renderer as a unit plus one door: about **30 s**.
- **E. State reached the long way** (2, 3; 65 s): five bounties posted, or three worlds built, to have records or addresses. Build the records directly, as `rewriteRecordRaw` already lets a test do: about **55 s**.
- **F. Work repeated in a loop** (15; 14 s): `statusGitHub` three times per iteration of an 8-iteration loop, none of it depending on the iteration. Hoisted, about 1.5 s. This is a plain test bug.
- **G. The same recovery tested twice** (10, 18; 29 s): refuse the remote's update, apply, see the named pending state, allow, close, see it finish. About **15 s**.
- **H. Compat tests for a retired shape** (12, 15, 22; 42 s): they guard records written by versions before 0.2.0 (the old chain name, the old `snapshot` field, old command names). The product is recent (0.2.0 was published on 12 November 2026; earlier 0.1.x releases predate the solver side). **Owner question: do these still earn their cost, or are the old readers and their tests removable?** (a product simplification: less code as well as less time).

If every verdict above were carried out: about **240 s of the 540 s**, **7% of the whole suite**. The rest of the suite is about 1200 tests of 1 to 5 s each, where the cost is the commands they run, not a pattern in the test.

## What would move the whole suite

The broad lever is the **cost of a command**, as K51c found. From the trace:

1. **A `gh version` start in every process** (about 75 ms): cache it for the session or drop it (the first `gh api` fails clearly if gh is too old). One start in every command.
2. **Appending a chain event is seven starts** (`rev-parse`, `cat-file -e`, `hash-object`, `mktree`, `commit-tree`, `update-ref`, `push`); `git fast-import` writes the blob, tree, commit and ref in one process. Security-sensitive code (chain provenance); the break audit would guard it.
3. **Two `for-each-ref` calls** that could be one, and `rev-parse` plus `cat-file -e` that could be one `cat-file --batch-check`.
4. **The test `gh` is a Node process per GitHub call**: five of the thirteen starts of a `status`. An injectable in-process transport (the seam [BT59](../../waves/BT59.md) needs anyway) removes them from tests without touching production behaviour.

Roughly, 1 to 3 save about a quarter of the Git starts of the common commands, and 4 removes up to 40% of a `status`'s starts in tests. These are product changes on code the hard stops depend on; each wants its own wave, the start-budget test and the audit as guards.

## Correction (K70, 13 November 2026)

Patterns B (the journey transcript) and D (the `bt43` renderers) and the `bt6b` landings, as estimated above, did not survive reading the tests: the journey tests are complementary (each proves what the others rely on), the `bt43` doors are the runtime half of a promise whose static half is the walk in the same file (only two of the three share a setup, worth about 6 s), and the landings cannot share a world. See [K70](../../waves/K70.md). The other patterns (A, C, E, F, G) were carried out in K69.

## Not examined

I did not read the other 1200 tests; I did not measure the saving of any verdict; "needed" for the keeps rests on what the test asserts, not on a break proof; the owner question in H is a product decision.
