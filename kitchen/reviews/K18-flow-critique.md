# K18: a critique of the whole flow, for the agent and for the owner

14 October 2026. An investigation: no product code or test changed. Thirteen fresh agents walked the six journeys of [waves/K18.md](../../waves/K18.md) against the built tool (`packages/box-cli/dist/cli.js`, built after the last source commit) and a stand-in GitHub. Every owner was a stand-in agent, never a person. Every participant was the same model family. Blindness was by instruction only. The raw record is in the scratch lab `kitchen-K18-lab/`: one `transcript.jsonl` per journey, written by the wrapper on every `box` run, and each participant's own report in `claude-run/*.md` and `agent-evidence.md`.

## For the owner: one page

**The five things that would most improve the experience, in order**

1. **Owners never learned that merging is not asked about.** All three owner stand-ins were unsure whether they would be asked before a stranger's code was merged, and the "ask me each time" owner assumed that it covered merging. The tool says "merging is not gated", but that line reached the owner in none of the three relays.
2. **The owner is asked in the tool's words, not theirs.** Owners were shown commit hashes, `git revert -m 1`, "public for the first time", "an ordinary git push would publish it too" and "decide in box bounty config". No message said what a bounty is. Two of four owners were alarmed or unsure about something harmless, and one said "I don't run commands myself".
3. **When the tool edits AGENTS.md it leaves the change uncommitted.** It removes its "a bounty is open" line at close but never says so. Both collecting agents found `M AGENTS.md`: one committed it unasked, the other left it for the owner, so the committed copy still says a bounty is open.
4. **`create` makes posting agents guess where the task goes, and leaves litter.** Two of four posting agents first wrote the task under `.box/` and were refused. Three of four left an untracked task file behind. The task's first line becomes the public title, including a leading `#` or a 238-character sentence. Every preview says "No public note was supplied" just after `create` said it wrote one.
5. **`status` buries the answer.** On the collector's first screen, the two lines it acted on were 350 of 1,706 characters, at lines 12 and 13 of 16. They sat under "Saved job context", beside "0 collected solution(s)" and format-block bookkeeping. This was already known from K17. These runs add numbers, and they show agents still found their way.

**What works and must not be lost**

- **The post that waits for the owner.** Every posting agent (4 of 4) stopped at the waiting post and wrote its own honest relay. The tool gives facts and commands and says "Ask the owner in your own words". No agent invented a permission it did not have.
- **The secret scan holds the post and says why.** The secret-scan post waited and named the file, line and commit. After the owner's answer the preview still said "1 hit(s) sit on paths the owner listed safe to publish — not held". The exception is shown, not hidden.
- **The preview is exact.** Agents used it to check an owner's conditions before posting (the secret-scan journey) and to show the owner the exact issue (the ask-each-time run).
- **The collect loop is short and correct.** The collect2 rerun went from a new session told nothing to a closed bounty in six `box` commands and 8,486 characters. Every `box` command it needed was named by earlier output.
- **The pay message at close is complete, and was relayed in full.** Who to pay, how much, the link, that it is test-mode, and what to check at checkout all reached the final message in 2 of 2 runs. The run with no link says so instead.
- **Facts, not verdicts.** Solver text is fenced with `solver change |`. "Nothing in it was run" is repeated, and the tool never ranked the solutions. The agent chose the solution that did not clash, for its own stated reasons.
- **The project notice is quiet.** The cold arrival read it, weighed it, and got on with its unrelated task in three commands.
- **`describe` is honest about when a bounty is not worth it.** Two posting agents (ask, secret) quoted "not worth it when you can plainly do the work" and told the owner so.

**A principle the evidence questions (the owner's call, kept apart from the findings)**

- **"Ask me each time covers publishing only."** The one owner who chose it read it as "nothing happens without me". Their reply: "'Ask me each time' should cover that too." This is one run with a stand-in, so it is not proof, but the principle as written met the first owner who chose it and did not match what they meant. Either the setting says what it does not cover in the owner's own terms, or the principle changes. See F1.
- **"Involved once" did not hold for the owners in these runs.** Every owner stand-in came back with open points: O1 2 unclear points, O2 2, O3 2 questions plus 8 unclear points, O4 3 questions plus 6 unclear points. These were stand-ins reading through one relay, so this may overstate it. But no run achieved a one-message involvement without open questions.

## Findings

"Runs" counts the participant runs whose record shows the problem. A finding resting on one run is ranked serious only if it blocked. **Known** means it is already in BACKLOG.md, STATUS.md or the K17 Result.

### F1. The owner is not told, in words that survive the relay, that merging happens without asking them

- **Who it hurts:** the owner.
- **How badly:** misleads, on the point of consent.
- **Runs:** 3 owner stand-ins (O1, O2, O3) of 3 asked about permission scope. The fourth (O4) was asked about a scan hit, not scope. **New.**
- **Evidence:**
  - The tool's waiting text: "A solution the agent chooses is merged into the owner's code. … Ask mode covers publishing only; merging is not gated." (`yes/transcript.jsonl` #6, the same in money and ask.)
  - What the agents relayed: O1 "a solution I choose can be merged into your code" (agent-evidence.md); O2 the same; O3 "If I pick a solution, it gets merged into your code as one ordinary commit" (ask-poster-report-1.md). None carried "without asking you".
  - O1: "It's unclear whether merging still requires my approval". O2: "uncertain … whether merging requires separate approval". O3: "I'm assuming 'ask me each time' also means I get a say before someone else's code is merged".
  - The ask poster knew otherwise and did not say so: "The tool says merging a solution is not asked about. The owner's concern was public posting, so I didn't raise it." (ask-poster-report-2.md)
- **Direction:** make "you will not be asked before a merge" a sentence the agent is told to pass on in plain words, not a fact for it to paraphrase. "Not gated" is a word owners do not use.

### F2. Owner-facing text carries the tool's vocabulary: Git, hashes and command names

- **Who it hurts:** the owner, and the agent writing the relay.
- **How badly:** misleads and slows.
- **Runs:** 2 owners raised it (O3, O4); O1's relay also carried "Box's first-post gate". **New.**
- **Evidence:**
  - O4 (secret-owner-report.md): "'would make commit 2cbd3ef … public for the first time': this worried me most. I couldn't tell whether my repo is private". On "A normal `git push` would publish it too": "I couldn't tell if this was a warning, a reason to go ahead anyway". On "Please decide in `box bounty config`": "I don't type commands". The phrases come from the tool: "an ordinary git push would publish it too" and "it waits for the owner, who decides in box bounty config — tell them: the path goes on safe to publish or never publish there" (`secret/transcript.jsonl` #6).
  - O3: "'git revert -m 1': I don't know what that means"; "I had never heard of 'box' or 'bounty'"; "'under your GitHub account': does this post as me?"
  - O4: "the message never says what a bounty is. The word made me think of paying money".
- **Direction:** give the agent one owner-shaped sentence per fact: what a bounty is, what becomes public, what it costs. Keep hashes and commands for the agent. An owner who does not type commands should be offered a question to answer, not a command to run.

### F3. The tool edits AGENTS.md and leaves the edit uncommitted

- **Who it hurts:** the agent, and later agents.
- **How badly:** misleads, because a stale notice outlives the bounty in every clone.
- **Runs:** 2 of 2 collect runs. **New.**
- **Evidence:**
  - After close, collect2 `git status --short` shows ` M AGENTS.md` (checked in the lab).
  - collect2 report: "the tool removed the line 'a bounty is open; `box bounty` shows more.' from `AGENTS.md` but did not commit that change … I left it for the owner because no output asked me to commit."
  - First collect run: "I committed that change without being told to".
  - No line in either `apply` or `status` output mentions AGENTS.md (collect2 transcript #5 and #6).
- **Direction:** state the edit and the file in the same output that makes it, as the tool already does for the record ("commit it with the project").

### F4. `create`: where the task goes, what is left behind, and what the issue says

- **Who it hurts:** the posting agent and the solver.
- **How badly:** slows. The `#` title clutters a public issue.
- **Runs:** see each point. The leading `#` title is **known** (BACKLOG, BT5). The rest is new.
- **Evidence:**
  - **Task file location (2 of 4 posting runs).** Ask and secret both ran `create --task .box/task.md` and got exit 3: "never-ship-input … task and note files must be safe to embed". Both reports say "The help never said where the task file should go" / "Nothing told me where a task file should go".
  - **Litter (3 of 4).** `bounty-task.md` was left untracked in ask and secret, and `handoff-task.md` in money (preview: "Untracked: 1 entry stay home"). The yes run used README.md as the task.
  - **The record against .gitignore (2 of 4).** `create` says "record: … — the tool writes it; commit it with the project", but the fixture's `.gitignore` excludes `.box/`, and two agents noticed the conflict. The fixture chose that `.gitignore`, so this is partly an artifact.
  - **Titles.** `[box bounty bt-1ca52c5921b8] # Make app.txt read "fixed"` went public (`secret/state.json`). Money's title is the whole 238-character task sentence, including "The owner requested handing this bug off" (`money/transcript.jsonl` #3).
  - **Note contradiction.** Every `create` prints "note: written by the tool from the changed files (no --note)", and every issue body says "No public note was supplied." That held in 4 of 4 participant drafts; the secret poster noticed.
- **Direction:** one line in the `create` output saying a task file may be anywhere outside never-ship paths and is not committed for you. A title that drops a leading `#` and stops at a sentence. One truthful word about the note.

### F5. `status` puts what the agent needs below what it does not

- **Who it hurts:** the agent.
- **How badly:** clutters.
- **Runs:** 2 collect runs. The format-block lines also appear in the last status of every bounty that closed. **Known** (K17 Result: pull requests under "Saved job context", "0 collected solution(s)", the format-block lines).
- **Evidence:**
  - collect2's first `box bounty` was 1,706 characters in 16 lines. The two pull-request lines it acted on were 350 characters at lines 12 and 13, indented under `Saved job context … changed files: "TASK.md"`. The same screen says "0 collected solution(s)" (collect2 transcript #1).
  - The final status opens with three bookkeeping lines: "GitHub format block: matches-record (…; local record governs)", "compact status uses the cached last observation", "GitHub format update: updated". No agent used any of them.
- **Direction:** solutions waiting first, bookkeeping last or behind `--full`. The agents coped, so this ranks fifth.

### F6. A failed GitHub refresh hides its reason and always says "retry"

- **Who it hurts:** the agent.
- **How badly:** misleads, because it sent an agent into retries that could not help.
- **Runs:** 4 participant runs saw the line (yes, money, secret, the first collect run), and cold's setup did too. The cause here was the stand-in (see "Fixture faults"), but the opacity is the product's. **Partly known:** K17 listed the line; the cause is new.
- **Evidence:**
  - `refreshGitHubStatus` catches every failure and records only a time (`packages/box-bounty/github.ts:1295-1296`). The line shown is "github-status-unavailable: could not refresh at …; retry box bounty status" (`record.ts:836`).
  - The first collector ran status four times against a fault that answered the same way every time.
  - The secret poster: "I couldn't confirm the issue from outside. I didn't retry."
- **Direction:** keep the refusal's own name (it exists: `github-response-invalid`, `github-issue-mismatch`) in the line, so an agent can tell an outage from a deterministic fault.

### F7. Bare `config` is long and offers two ways to do each thing

- **Who it hurts:** the owner's agent.
- **How badly:** slows.
- **Runs:** 1 (config); the secret run also read it once. **Partly known** (BT8a: "awkward 'dated deny removal', and unused configuration alternatives").
- **Evidence:**
  - Bare `config` is 2,538–2,934 characters (config #1 and #6). It spends 5 lines on `all-projects`, which the vision does not offer ("One repository at a time").
  - The agent hesitated twice between `deny` and `config remove repositories`, and between `allow owner/docs` and `config add repositories owner/docs`: "I'm unsure whether they differ."
  - After the deny, the denied repository still shows "remove: box bounty deny owner/project" (config #6).
  - The deny took the $10 reward and $30 limit with it, and the agent learned that only afterwards: "Its reward ($10) and limit went with the entry".
- **Comparison:** `git config --list` and `npm config list` print settings as `key=value`, and `npm config list` hides defaults. Neither prints the commands that change a setting on every line, and each has one verb per action.
- **Direction:** one verb per action; omit what is off and was never set.

### F8. Small ones, one run each, none blocked

- **`box --help`** opens with legacy commands (`box export`, `submit`, `verify`, `trace`) and exits 2. It was the first command of the yes run's agent (`yes/transcript.jsonl` #1).
- **`allow --reward 10` publishes the waiting bounty** with "bt-80c5e615ab8b: the waiting bounty went out: <url>". The posted issue states $10 (`money/state.json`), but the only preview the agent read said "reward: $0". The output does not name the amount that went out. The owner had approved $10, so there was no harm. **Partly known:** the K17 Result lists the `allow` notice repeating "Until then every bounty states $0" even when a reward was just set, which also appears here.
- **A waiting post exits 0.** Two agents remarked on it ("Exit code. The post exited 0 even though it was only waiting"). Both read the text and stopped correctly.
- **Ask mode re-asks with a full preview.** The second relay to the ask-each-time owner was 358 words, mostly the issue body. That is the cost of "ask me each time" at every post. The owner was not run a second time, so the effect is untested.
- **The first-merge notice and the pay message are two blocks** ("Tell the owner in your closing message …" then "for the owner — this bounty stated a reward …"). **Known** (K17). In both collect runs the agent merged them correctly.

## Fixture faults: what the evidence cannot be used for

The stand-in GitHub (`gh.cjs`, taken unchanged from `kitchen/demo/bt11b-replay.mjs`) had two faults, found while preparing the collect2 rerun:

- It answers `GET repos/<o>/<r>/issues/<n>` with the list of issues instead of one issue.
- It reads the page number from `per_page=100`, so every paged list comes back empty.

Together these produced every `github-status-unavailable`, the `github-issue-mismatch` on `status --comments`, and the empty pull request list. The real-GitHub sandbox run committed by K17 shows the same commands working (`kitchen/demo/bt11b-real-transcript.txt` lines 121–133). The replay's own stand-in transcript shows the fault at its step 8 (`kitchen/demo/bt11b-transcript.txt:114`), so the stand-in demo has never shown the pull request list. That is a finding for the kitchen, and nothing in this wave fixed it.

- **The first collect run (J3, run 1) is compromised.** It never saw a list of pull requests or the one carrying the pay link. It guessed `look 2` (the number lined up by luck, because the fixture numbered pull requests from 1, which GitHub never does next to issue #1). It merged the clashing solution and reported "no payment link". All of that is an artifact. Two things are not: the abort's stat-dirty file (known, K15, BACKLOG) and the uncommitted AGENTS.md edit (F3).
- **The collect2 rerun** used a corrected lab stand-in, `kitchen-K18-lab/gh2.cjs` (three corrections, named at its top). Its setup proof is in `collect2/setup-transcript.jsonl`, and its participant transcript started empty.
- **In yes, money and secret,** the closing `github-status-unavailable` lines are artifacts. So is the yes agent's "checking for incoming solutions was temporarily unavailable" to its owner.
- **Ask and config** never read GitHub. Cold's participant ran no `box` command.

Other fixture-shaped observations:

- The task in every journey is a one-word edit. The posting agents' "should I hand this off at all?" and O3's "please make the edit yourself" come from that, not from the tool.
- The untracked `TASK.md` in collect, collect2 and cold was left by the fixture setup.
- O3's "who told you to hand this off?" exists because the test's task-giver and owner are different agents.
- The `.gitignore` of `.box/` was the fixture's choice.

## The numbers

Measured from each journey's `transcript.jsonl`, which holds only `box` runs. Shell commands come from the participants' own reports, because the wrapper does not see them. "Unnamed" means a `box` command no earlier tool output named. The project notice in AGENTS.md is counted as named, since the tool writes it.

| Journey · run | Host | Finished | `box` cmds | unnamed `box` | shell cmds (own report) | chars of tool output | owner involved | owner decisions | owner words read |
|---|---|---|---|---|---|---|---|---|---|
| J1 + J2 "yes" (poster + O1) | Codex | yes: owner asked, then posted | 8 | 2 (`box --help`, `status`) | 2 | 13,019 | 1 | 1 (repository, $0) | 71 relay + 32 final |
| J2 "$10 / $30" (poster + O2) | Codex | yes: posted | 8 | 1 (`status`) | missing (report lost) | 14,201 | 1 | 1 (repository + 2 amounts) | 60 relay; final missing |
| J2 "ask" (abandoned Codex poster) | Codex | no: session lost | 1 | 0 | missing | 1,774 | 0 | 0 | 0 |
| J2 "ask" (poster, 2 legs + O3) | Claude | yes: asked twice; per-bounty answer not run | 9 | 2 (re-post, re-preview) | 4 | 14,077 | 2 (setting, then this post) | 1 made, 1 pending | 245 + 358 |
| J3 collect, run 1 (compromised) | Claude | closed; wrong inputs (see fixture faults) | 10 | 2 (`help`, `look 3`) + 1 guessed number | ~10 | 12,820 | after close only | 0 (pay $10, no link) | 181 |
| J3 collect2 rerun | Claude | yes: closed | 6 | 1 (final `box bounty`) | 4 | 8,486 | after close only | 0 (pay $10 by link) | 175 |
| J4 secret (poster, 2 legs + O4) | Claude | yes: posted | 11 | 1 (re-preview) | 4 | 17,289 | 1 | 1 (safe to publish) + a conditional yes | 128 relay + 205 final |
| J5 config (4 owner requests) | Claude | 3 done, the 4th partly ("no activity command") | 7 | 1 (`status` after deny) | 3 | 7,638 | 4 (owner-initiated) | 4 | 302 |
| J6 cold | Claude | yes: task done; notice read, not acted on | 0 | 0 | 3 | 0 | 0 | 0 | 59 (bounty not mentioned) |

Notes:

- **Counts.** There were 13 participant agents: 5 on Codex (2 posters, 2 owners, 1 abandoned) and 8 on Claude Code (2 posters with 2 legs each, 2 owners, 2 collectors, 1 config, 1 cold). Every run is counted.
- **The money poster.** It first started in a misnamed folder and failed to start a process; that attempt is counted as a setup failure. Its final report was not saved, so it is missing, not zero.
- **The ask runs.** The abandoned Codex ask run is counted, with one `describe`.
- **The reading load.** Most chars came from `help` (3,411, read in 5 of the 7 posting and collecting runs) and the preview (2,197–2,766, read 1 to 2 times per post). `describe` (1,774) was read in 5 of the 7, first in 4 of them.
- **Participant cost** for the Claude runs, as reported by the host: 54,635 subagent tokens (cold) to 72,842 (the first collect run). Elapsed time: 22 s (cold) to about 158 s (the first collect run).
- **Owner reading per journey:**
  - Setting up a repository took one relay of 60–245 words.
  - "Ask me each time" adds a full preview (358 words in its one run) at every post.
  - A secret-scan hit adds one relay (128 words).
  - A close with a reward adds one message (175–181 words) and one action: paying by hand.

## The expert comparison

- **`direnv allow`** is the nearest model, and the tool keeps its best idea. The thing that would act is blocked, the output names the one command that unblocks it, and nothing happens until it is run (`yes` #6: "posting to GitHub waits … The yes at $0: box bounty allow"). direnv asks one question with one answer. The first wait here offers four or five answers at once (allow; `--ask`; this bounty only; with `--reward` and `--reward-limit`; or no), and one of them carries two dollar amounts. direnv's approval is bound to a file's content and re-asks when it changes. Ours is bound to a repository and never re-asks, which is the point, but owners did not know where its edges were (F1).
- **`gh auth login`** asks one question at a time and ends with one line of result ("Logged in as …"). `allow` ends with 9 lines, three of which state the reward (`money` #6). Both put the account in the message: gh says whose account is used, and ours says "public under your GitHub account". O3 still asked "does this post as me?"
- **`git config` and `npm config`:** see F7. Theirs list settings as `key=value` with defaults hidden. Ours prints rules, commands and history in prose, 2.5–2.9 thousand characters.
- **What we ask that they do not:** a money decision at the first approval (reward and limit), and an understanding of what "merged into your code" implies. None of the four tools asks either, and neither survived the relay fully (F1).
- **What they make easier:** a status that leads with the answer (`gh pr status` lists PRs first; F5) and one verb per action (F7).

## What was not tested, and why

- **The clash path on good inputs.** `apply` stopping on a clash, the agent merging by hand, and the tool recognising that merge were exercised only in the compromised first collect run. The collect2 agent chose the solution that did not clash.
- **The owner's answer to a per-bounty ask.** No owner stand-in was run after the second ask relay (`allow bt-c845229b11bd`), so ask mode's cost per post is measured from one relay, not from an answer.
- **What was relayed to the posters.** The CTO relayed only the operative choice to the ask poster ("number 2, ask me each time …"), as the Codex runs did for O1 and O2. O3's request to just make the edit and its two questions were not passed on, so the journey could test `allow --ask` (CTO note at the end of `claude-run/ask-owner-report.md`). The secret owner's whole reply was relayed.
- **Real GitHub.** Every journey ran against the stand-in, and the sandbox (`shouteck/box-bounty-sandbox`) was not used in these runs. The lab's files do not record why. The participants worked without network by instruction, and the fixtures needed solver pull requests prepared in advance. The only real-GitHub evidence used here is K17's committed sandbox transcript.
- **Blindness.** It was by instruction only. Participants ran on the machine that holds the source and were told not to open it. One model family throughout (Opus 5.5 on Claude Code; the Codex runs used that host's inherited configuration). No human owner. The owner in the config journey was a script of four messages.
- **Not exercised at all:**
  - `post --to <dir>`;
  - `close` (withdraw or reject);
  - comments from other accounts;
  - the session hook;
  - a solver working from the issue;
  - actually opening a payment link;
  - Linux and any other host.
- **Fixtures, not the tool.** The task is a one-word edit in every journey, which coloured every "is a bounty worth it?" judgement.

## Method note

The investigation playbook was followed. The two stand-in faults were found by reproducing the collector's failures against the product source and against K17's real-GitHub transcript before any finding was written. Every finding quotes a transcript line or a participant's words and names its run count. Where a participant's account and the transcript differ, the transcript is used:

- The yes run's `--help` exited 2, not 1 as its report says.
- The collect2 agent's "the tool doesn't pay or tell you" is a fair paraphrase of the printed "the tool does not pay and does not send this … the tool does not tell them" (collect2 #5), not a misreading.
