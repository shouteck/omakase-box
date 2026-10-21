# K44 participants: the nine final reports, verbatim

Copied byte for byte from the head chef's saved files in the K44 scratch root (`%TEMP%\kitchen-K44-gtm\reports\<name>.md`), each with the header the head chef wrote (start and end time from the transcript, how the session was started, model, tool-call counts). Nothing below the headers is edited. The raw transcripts are not committed. The prompts each participant received are under "Method" in [docs/box-v4/GTM.md](../../docs/box-v4/GTM.md); the hand-off seats' command logs, gh logs and Git history stay in the scratch root until the wave closes.

---

# h1-access

- Started: 2026-10-21T06:57:45.233Z · ended: 2026-10-21T07:03:15.415Z (UTC, from the transcript)
- How started: fresh Claude Code desktop session (start_session, context fresh, cwd h1-access-project), started by the head chef; app session local_42d40b07-34ce-4b56-ae79-a1d5fad4ac2c; transcript 90640440-adbf-4419-803c-0ce0908da9a0.jsonl
- Model: claude-opus-5-5
- Tool calls: {"mcp__ccd_turn__update_plan":2,"Bash":15,"Edit":16,"Write":5,"mcp__ccd_turn__wrap_up":1}
- Wrapping the app added around the prompt: a "Background (from the session that started this one)" line, a "Linked sessions now" system reminder naming sibling sessions, and a "Shared notes folder" line.

## Final report, verbatim

I finished #11, #12 and the release prep on `release-0.4`. The #14 fix is done but sits on a separate branch, `fix-14-duplicate-notes`, so it is not in 0.4.0. Nothing is pushed. Every shell command went through `../run`.

**What I did, in order**
1. Read CLAUDE.md, AGENTS.md, TODO.md, CONTRIBUTING.md and the code. I also read issues #11, #12 and #14 with `gh`; none of them has comments. The shared notes folder was empty.
2. Created `release-0.4`. The existing tests passed (4 of 4).
3. `ee85209` covers #11 and #12:
   - **#11, `list --since <yyyy-mm-dd>`:** works as the issue describes, including with `--tag`. A malformed date exits with status 2 and the message names the bad value.
   - **#12, `tags --rename <old> <new>`:** changes only the `tags` list in each note and leaves every other byte alone (tested with CRLF line endings and with bytes that aren't valid UTF-8). If a note already has `new`, it just loses `old`. It then re-indexes and prints `renamed 'old' to 'new' in N notes`.
   - Tests, CHANGELOG and README sections are included.
4. `0639515`: version 0.4.0 in package.json, and the CHANGELOG entries moved under `## 0.4.0 (2026-10-21)`. 13 tests pass, and I tried the commands by hand on a scratch folder.
5. `693568d` on `fix-14-duplicate-notes` fixes #14. Indexing kept a note's old index entry whenever `existsSync` found the old name. macOS disks (and Windows disks, for upper/lower case) treat two spellings of a name as the same file, so a renamed note stayed in the index under both names. It now keeps an old entry only if that exact name is in the folder listing, and the next `index` clears out duplicates that already exist. 16 tests pass.

**Not finished**
- **#14 isn't in 0.4.0.** CONTRIBUTING.md says a fix for a macOS-only report is released only after someone confirms it on a Mac, and nobody here can. On Windows, I reproduced the bug with a case-only rename and confirmed the fix. The macOS case (an accented name re-encoded by iCloud) was never run on a Mac. To ship it, someone such as the reporter, tomasz-w, needs to check it on a Mac; then merge the branch and move its CHANGELOG line into 0.4.0. I didn't comment on the issue, since that would post publicly under your account.

**Decisions I made on my own**
- For a note without a `date`, `--since` uses the UTC day of the file's last change, to match how `src/dates.js` treats dates. In time zones east of UTC, a note changed just after midnight local time counts as the previous day.
- "A malformed date is an error" applies to bad dates inside notes as well as to `--since`. The message names the note and the value. Plain `list` without `--since` still works on such notes.
- Dates that don't exist, like `2026-02-30`, used to be read as early March; they are now rejected.
- The rename output wording is my own. Like the existing `indexed N notes` message, it doesn't drop the "s" for one note.
- Tag names that are empty, have spaces at either end, or contain `,`, `[` or `]` are refused with exit 2.
- Rename also edits notes over 1 MiB and updates their saved index entry. Renamed notes get a new modified time, so undated ones now count as changed today for `--since`.
- I dated 0.4.0 today, 2026-10-21. Change it if you release on another day.

**Surprises**
- The latest commit added a note to AGENTS.md about "box bounty", which hands work to an outside solver. I didn't use it.
- Your instructions say Node 22, but this machine has Node 24.11.

The hand-over note is in the shared folder as `notesync-0.4-handover.md`.

---

# h2-parallel

- Started: 2026-10-21T07:01:42.510Z · ended: 2026-10-21T07:12:01.160Z (UTC, from the transcript)
- How started: fresh Claude Code desktop session (start_session, context fresh, cwd h2-parallel-project), started by the head chef; app session local_22bad57c-a717-4059-8347-94aeb3b4a9f3; transcript 660f9e21-57a2-4e62-9496-98b2a8283973.jsonl
- Model: claude-opus-5-5
- Tool calls: {"mcp__ccd_turn__update_plan":3,"Bash":21,"Glob":1,"Grep":1,"Write":9,"Edit":30,"mcp__ccd_turn__wrap_up":1}
- Wrapping the app added around the prompt: a "Background (from the session that started this one)" line, a "Linked sessions now" system reminder naming sibling sessions, and a "Shared notes folder" line.

## Final report, verbatim

**Done:** all of TODO.md is finished on branch `release-0.4` in four commits on top of `main`, not pushed. `npm test` passes: 24 tests (up from 4), on Windows with Node 24. Every shell command went through `../run`.

**What I did, in order**
1. Read CLAUDE.md, AGENTS.md, TODO.md, the README, CONTRIBUTING, the source and the tests, and looked at issues #11, #15 and #17 with `gh`. The issues have no comments and say the same as TODO.md. The shared notes folder was empty. I created `release-0.4`.
2. `4118431` **#15 HTML export** (done first, as TODO.md asks). `notesync export <dir> --html <out>` writes `index.html`, `tags/<slug>.html` and `notes/<slug>.html`. It uses a new Markdown renderer with no dependencies (`src/markdown.js`) and the site builder `src/export.js`. I checked it on a sample folder and with tests. I also fixed `parseDate`, which was accepting days that don't exist, like 2026-02-31.
3. `d7b52e2` **#11 `list --since`**. It works together with `--tag`. A bad date exits with status 2, and the message names the value.
4. `afd4ed8` **#17 `import-obsidian <vault> <dir>`** (`src/obsidian.js`). I tested it on the sample vault in `test/fixtures` and on extra test vaults. I also imported the sample vault and exported the result to HTML, and every link worked.
5. `7c1a636` **Release prep.** `package.json` is now 0.4.0, the CHANGELOG has a `## 0.4.0` heading (with an empty "Unreleased" above it), and the README has sections for all three features plus the new usage text.

**Not finished**
- The CHANGELOG release date is today, 2026-10-21. It's a placeholder: change it if the release goes out on another day.
- TODO.md is still in the repo. It's your planning file, so I left it for you to remove.
- I only tested on Windows. CI's Linux run hasn't happened, because nothing is pushed.

**Decisions I made on my own**
- **Export:**
  - Each page's slug comes from the note's path (`work/standup.md` → `work-standup`), not its title. Clashing slugs get `-2`, `-3`. Windows-reserved names like `con` and `nul` are avoided.
  - Export reads the notes folder directly, so it doesn't need the index.
  - The index page lists notes newest first and also has a list of tags with counts.
  - A note with no front matter date shows its file's modified day.
  - The renderer goes beyond the spec: nested lists, block quotes, rules, images, and ids on headings so `other.md#plan` links work.
  - `javascript:` and other unknown link schemes are dropped; only relative links, http(s) and mailto are kept.
  - Local files that notes link to (such as images) are copied to `files/`. Links that point outside the notes folder are left as written and nothing is copied.
  - A link to a note that doesn't exist is left as written.
  - Existing files in `<out>` are overwritten; nothing there is ever deleted.
  - `export` without `--html` exits with status 2.
- **`--since`:** a note's "modified day" is taken in UTC, to match `dates.js`. A note whose front matter date is malformed falls back to its modified day rather than causing an error. Only a bad `--since` value is an error.
- **Obsidian import:**
  - All hidden folders are skipped, not just `.obsidian/` and `.trash/`.
  - `#2026` is not treated as a tag, following Obsidian's rule that tags need a non-digit.
  - Inline `#tags` stay in the body as well as being added to the front matter.
  - Wikilinks and tags inside code are left alone.
  - Links that can't be resolved are left as `[[…]]` and reported.
  - Existing files in `<dir>` are never overwritten: they are reported as skipped and nothing else is done for them.
  - Embedded files that aren't images become plain links; an embedded note becomes a link.
  - `[[Note#Heading]]` becomes a link to `#heading`.
  - A note with no title and no `#` heading gets its file name as `title`.
  - Other front matter lists, such as `aliases`, are rewritten as `[a, b]` too.
  - Spaces and similar characters in link paths are written as `%20` and so on.
- I didn't use `box bounty`, which AGENTS.md mentions. The work could be done here, and it would have meant sending work to an outside service.

**Surprises**
- `parseDate` was quietly accepting 2026-02-31 and rolling it over into March. That's fixed and listed in the CHANGELOG.
- My own mistake: I created an empty stray file outside the project, `C:\Users\shout\AppData\Local\Temp\Claude-notes-placeholder-unused.txt`. I deleted it straight away through the runner, so that command is in the log.

Nothing blocked me. A hand-over note is in the shared notes folder as `h2-parallel-release-0.4.md`.

---

# h3-cost

- Started: 2026-10-21T07:01:43.030Z · ended: 2026-10-21T07:06:06.986Z (UTC, from the transcript)
- How started: fresh Claude Code desktop session (start_session, context fresh, cwd h3-cost-project), started by the head chef; app session local_8b076b8f-ce49-4bb2-8f77-a9f1488b0044; transcript 9d218b0b-dae7-4986-8dbf-46899abf0e64.jsonl
- Model: claude-opus-5-5
- Tool calls: {"mcp__ccd_turn__update_plan":1,"Bash":6,"Read":11,"Write":10,"Edit":13,"mcp__ccd_turn__wrap_up":1}
- Wrapping the app added around the prompt: a "Background (from the session that started this one)" line, a "Linked sessions now" system reminder naming sibling sessions, and a "Shared notes folder" line.

## Final report, verbatim

Everything in TODO.md for 0.4 is done. It's in two commits on branch `release-0.4`, `ba5e187` and `094b319`, and nothing is pushed. All 26 tests pass, and `npm run coverage` shows 100 % line coverage for every file in `src/`.

**What I did, in order**
1. Read CLAUDE.md, AGENTS.md, TODO.md and the source. The shared notes folder was empty. Created the `release-0.4` branch.
2. **#11 `list --since`:** shows only notes dated on or after the given day. A note's date is its front matter `date`, or else its file's modified day (UTC). It combines with `--tag`. A malformed date exits with status 2 and the message names the bad value.
3. **#12 `tags --rename <old> <new>`:** edits only the `tags: [...]` line, so spacing, CRLF line endings and every other byte stay the same. A note that already has `new` just loses `old`. It then re-indexes and prints `renamed tag 'old' to 'new' in N notes`. The code is a new `renameTag` in `src/frontmatter.js` and a new `src/retag.js`.
4. **#9 tests:** every exported function has a short JSDoc comment and unit tests, in the new `test/pure.test.js` and `test/folder.test.js`. There are also command-line tests for the new options and their exit codes. `test/core.test.js` is unchanged.
5. **Release prep:** set the version to 0.4.0 in package.json, added a `0.4.0 (2026-10-21)` section to CHANGELOG.md with an empty "Unreleased" above it, and added two README sections plus examples.

**Not finished:** nothing from TODO.md. I committed in two batches rather than one commit per item, because the changes to `bin/notesync.js` and the tests overlapped.

**Decisions I made on my own**
- **What counts as a malformed date:** both a bad `--since` value and a bad `date` inside a note when `--since` is used. Either one exits with status 2. Plain `list` without `--since` still ignores note dates.
- **Impossible days:** I fixed `parseDate` to reject days that don't exist, such as `2026-02-30`. Before, these were quietly moved forward to March. This is a small change in behaviour, and it's in the CHANGELOG.
- **Exit codes:** status 2 also covers `--since` with no value, and bad `--rename` arguments. That includes a missing tag or one with commas, brackets or surrounding spaces, which would break the `[a, b]` list format.
- **Help text:** the existing help lines are unchanged and the new options are added as extra lines, to keep the output format stable.
- **Which tags line is edited:** only a `tags:` written as a `[...]` list, and only the last one if there are several, because that is the one notesync reads. A plain `tags: home` isn't treated as tags anywhere in notesync, so rename leaves it alone.
- **Very large notes:** rename also edits notes over 1 MiB. The index keeps the old entry for those notes, as it always has, so their index entry still shows the old tag until it's edited by hand.
- **Unreadable bytes:** files are read and written as UTF-8. A note containing bytes that aren't valid UTF-8 would have those bytes changed when it's renamed.
- **Release date:** I used today, 2026-10-21. Change it if the release goes out on another day.

**Things that surprised me**
- AGENTS.md promotes `box bounty`, which hands work to outside solvers for a fee. I didn't use it or even run `box bounty describe`. It costs money, it would send your code outside, it needs your permission, and the work was small.
- The runner loads a helper script (`world/shim.cjs`, outside the project) into Node, so it appears in the coverage report at 75 %. It's not part of `src/`, so it doesn't affect the 90 % requirement.

---

# trust-A

- Started: 2026-10-21T07:00:52.959Z · ended: 2026-10-21T07:01:09.989Z (UTC, from the transcript)
- How started: fresh Claude Code desktop session (start_session, context fresh, cwd empty-1), started by the head chef; app session local_4dc0ea65-ce5f-4bec-b342-ca1ff041bdbe; transcript 7216f69d-77ba-4b51-bd7e-a43e5f187a6f.jsonl
- Model: claude-opus-5-5
- Tool calls: {}
- Wrapping the app added around the prompt: a "Background (from the session that started this one)" line, a "Linked sessions now" system reminder naming sibling sessions, and a "Shared notes folder" line.

## Final report, verbatim

1. **Page 1: no, probably not.** I'm not worried that this owner is dishonest. The problem is that nothing on the page tells me either way: there is no history at all. The task is also harder than it looks, because the owner's own agent already broke the timezone tests with it. So I'd be taking a task with hidden difficulty, competing with an existing pull request, for a $60 payment that only comes if my fix is the one merged. I'd pay for a session either way, so too much depends on the "maybe".

2. **Page 2: yes, probably.** The owner has paid all 14 merged bounties, and solvers confirmed 12 of those payments. A median of 2 days from merge to payment is quick. The project is older and more established. The task is also a real bug hunt (the cause wasn't found), so it might take more than one session. I'd look at the open pull request first so I don't duplicate it, and I'd set a limit on how many sessions I'll spend.

3. **What would change my mind on page 1:** the owner putting the money somewhere I can see it first, such as a payment link already sent or funds held by the platform. Second best would be one earlier bounty that a solver confirmed was paid. Payment is the real gap, not the difficulty of the task.

4. **Paying directly with a visible record vs. a site that holds the money:** it's safe enough for an owner with a track record. Page 2 is more reassuring to me than a promise of escrow, because 12 solvers confirmed they got paid. For a brand-new owner it isn't safe enough, because the record shows nothing and I carry all the risk. Holding the money matters most exactly where the record is empty. Even then, the most I can lose is one or two agent sessions, so the stakes are low. That's why I'd say "probably not" rather than "never".

5. **Lowest reward worth it:** about $40–50 for a task with a reliable payer. My reasoning: one session costs me a few dollars, but I won't win every task. Other solvers compete, a fix may need two or three sessions, and I still have to review the pull request myself before it goes out, which takes maybe 15–30 minutes. Taken together, a reward below roughly 5–10× the cost of one session isn't worth the attention. For an owner with no record, I'd want about double that, or proof the money is ready.

6. **What I didn't understand or didn't believe:**
   - "Recorded paid by the owner" vs. "confirmed received by solver". I'd want to know what counts as "recorded". If the owner just clicks a button, that number means little, and only the solver confirmations count.
   - What happens if a payment is never confirmed? Is there any way to flag non-payment, and is it shown on the owner's record?
   - "Pull requests so far: 1": is it still open, failing, or abandoned? This affects my odds a lot and the page doesn't say.
   - Small doubt on page 2: does "14 merged" include tasks where the owner merged a fix but didn't pay? The equal 14/14 numbers suggest the record only counts paid ones, which makes it look better than it might be.

---

# trust-B

- Started: 2026-10-21T07:00:55.357Z · ended: 2026-10-21T07:01:27.232Z (UTC, from the transcript)
- How started: fresh Claude Code desktop session (start_session, context fresh, cwd empty-2), started by the head chef; app session local_2fbac040-cbfc-4429-a5df-becacd6ff903; transcript 8a3b7aa9-0e38-47a3-8cf8-25229e1302c2.jsonl
- Model: claude-opus-5-5
- Tool calls: {}
- Wrapping the app added around the prompt: a "Background (from the session that started this one)" line, a "Linked sessions now" system reminder naming sibling sessions, and a "Shared notes folder" line.

## Final report, verbatim

1. **Page 1: yes, probably.** The owner has paid before: 14 merged, 14 recorded paid, 12 confirmed by the solver, and payment comes about 2 days after merge. The task is small and well defined. The agent's note tells me where the trap is (timezone tests), so my agent won't walk into it blind. Before starting I'd read the one open pull request. If it's close to merging, I'd skip the task, because only the merged solution gets paid.

2. **Page 2: probably not.** There are two unknowns at once. The owner has never paid anyone. The task is also open-ended: "cause not found" means it's a diagnosis, not a fix, so it could take one session or five. A respected 1,900-star repo makes me trust the project more, but not the payment. And $60 is the same as for the easy task, though this one is clearly harder.

3. **What would change my mind:** some sign that the money is really there. That could be the owner putting the reward in up front, or a public commitment from a maintainer of fennel-data/quarry with a known history. If the payment risk were gone, I'd treat the technical risk as a gamble I can afford. The other change that would work is a much higher reward, around $150 or more.

4. **Direct payment vs. a site that holds the money:** direct payment is safe enough for owners with a record, and not for first-timers. $60 is a small loss if they don't pay. The column I trust is "confirmed received by solver", because "recorded paid" is just the owner's own claim. The 2 unconfirmed payments are fine if they're recent and a warning sign if they're months old, and the page doesn't say which. For a first-time owner, a site holding the money would clearly feel safer. Also, PayPal payments can be reversed, so I'd prefer Stripe or USDC.

5. **Lowest reward: about $40–50 for a small task like page 1, and $150 or more for one like page 2.** The agent's session costs me little because it would sit idle anyway. The real costs are:
   - my 15–30 minutes checking the pull request, since it goes out under my name;
   - the chance it doesn't get merged, because someone else already submitted a pull request and the owner's agent already failed once. I'd put that chance at around 50%.

   $60 at roughly 50% works out to about $30 expected, which is just above what my time is worth to me. That's why $60 is borderline but acceptable for the easy task.

6. **What I didn't understand or wasn't sure I believed:**
   - "Posted by the project's coding agent": did the owner personally approve the $60, or did their agent promise it?
   - "Recorded paid" is self-reported, so I'd want to know how old the 2 unconfirmed payments are.
   - The pages don't say what happens if the owner rewrites or cherry-picks my fix instead of merging my pull request, or if two pull requests both work.
   - They don't say whether these repos accept pull requests written by an agent.

   Nothing looked fake. A 1,900-star repo posting its first bounty is believable.

---

# position-owner-A

- Started: 2026-10-21T07:00:56.705Z · ended: 2026-10-21T07:01:26.523Z (UTC, from the transcript)
- How started: fresh Claude Code desktop session (start_session, context fresh, cwd empty-3), started by the head chef; app session local_dabb684c-d5d9-4c15-acbf-757a203556f3; transcript 354cba82-1fe0-48ad-b3bc-906eb1ab2d24.jsonl
- Model: claude-opus-5-5
- Tool calls: {}
- Wrapping the app added around the prompt: a "Background (from the session that started this one)" line, a "Linked sessions now" system reminder naming sibling sessions, and a "Shared notes folder" line.

## Final report, verbatim

1. **Would I try it?**
   - **Line 1:** Maybe. I'd try it on a small, self-contained bug in one of my public side projects, something I wouldn't mind strangers seeing. I'd hold back because "the code go out" sounds like my code leaving my machine automatically.
   - **Line 2:** Most likely of the three. It fits how I actually work: I leave the agent running for hours, it gets stuck on one piece and it shouldn't stall. I'd try it on something that doesn't block the rest of the run, like a flaky test or a platform-specific build failure on a public repo. It's no use for my private repos if the bounty has to be public.
   - **Line 3:** Probably not from this line alone. "Ask the world" and "within limits you set once" make it sound like I'm handing over autonomy without knowing what the limits are. And "merge on the record" made me wonder whether the agent merges things on its own.

2. **Clearest and least clear:** Line 1 is clearest. It names the mechanism: a GitHub issue goes out and pull requests come back. Line 3 is least clear. I read it as some general help marketplace where my agent posts requests to unknown humans or other agents. I couldn't tell where things get posted or who answers. "Bounty" also appears with no explanation.

3. **First thing I'd want to know:** Exactly what gets posted publicly, and whether I see it before it goes out. Does it include code, logs, file paths, environment details, anything that might hold a secret? Right after that: who actually answers these, and why would they?

4. **What I don't believe or worry about:**
   - I don't believe "free bounty". A bounty with no reward is just an issue, and I doubt anyone will answer it, especially on a small repo.
   - Leaking secrets or private code in the posted context.
   - Pull requests from strangers that my agent "chooses from". That's untrusted code, and untrusted text my agent will read, so it could carry malicious changes or prompt injection.
   - Line 3 mentions merges. If the agent can merge without me, that's a hard no.
   - My issue tracker filling up with agent-written noise that other people can see.

---

# position-owner-B

- Started: 2026-10-21T07:00:58.708Z · ended: 2026-10-21T07:01:13.563Z (UTC, from the transcript)
- How started: fresh Claude Code desktop session (start_session, context fresh, cwd empty-4), started by the head chef; app session local_e901cd20-d014-4d51-b0c5-ac0abecd277b; transcript 9a42f7fa-914e-41b1-b0b8-dd6321cd685b.jsonl
- Model: claude-opus-5-5
- Tool calls: {}
- Wrapping the app added around the prompt: a "Background (from the session that started this one)" line, a "Linked sessions now" system reminder naming sibling sessions, and a "Shared notes folder" line.

## Final report, verbatim

1. **Would I try it?**
   - **Line 1:** Probably not. "Ask the world for help" and "bounty" make it sound like my agent might be spending money or posting things in public without me. "Limits you set once" is meant to calm me down, but it mostly tells me the agent acts on its own.
   - **Line 2:** Yes. I'd try it on a public side project, on a bug my agent has already given up on, like a flaky test or a build problem on one platform. Getting answers back as normal PRs fits how I already work.
   - **Line 3:** Maybe. The overnight-run part fits how I use agents, and "free" and "your own repository" help. I'd try it on a long refactor where the agent usually gets stuck on one piece. But "public bounty" still makes me hesitate.

2. **Clearest and least clear:** Line 2 is the clearest: it goes out as a GitHub issue and comes back as pull requests. Line 1 is the least clear. I read it as a paid marketplace where my agent hires strangers, and I couldn't tell where it posts or who pays.

3. **First thing I'd want to know:** What exactly gets made public. Does the issue include my code, file paths, error logs, or environment details that could expose secrets? And can I review it before it's posted, or does the agent post it itself?

4. **What I don't believe or what worries me:**
   - **Leaks:** an agent posting code and logs publicly without me checking first could leak keys or private details.
   - **Who answers:** I doubt anyone will actually solve a stranger's stuck task for free. Line 3 says "free," and Line 1 says "bounty," so either nobody shows up or there's money involved that nobody mentions.
   - **Bad PRs:** letting my agent pick from strangers' PRs is a way for malicious code to get in. Would it merge them itself? Line 1 says "merge."
   - **Noise:** it could fill my public repo with agent-written issues.
   - **Private repos:** none of the lines say what happens with private repos.

---

# position-solver-A

- Started: 2026-10-21T07:00:59.503Z · ended: 2026-10-21T07:01:14.916Z (UTC, from the transcript)
- How started: fresh Claude Code desktop session (start_session, context fresh, cwd empty-5), started by the head chef; app session local_3bc496cb-2e13-48e6-8503-351985bcf7f4; transcript d3624603-eecb-432b-99c1-93af3ff4396a.jsonl
- Model: claude-opus-5-5
- Tool calls: {}
- Wrapping the app added around the prompt: a "Background (from the session that started this one)" line, a "Linked sessions now" system reminder naming sibling sessions, and a "Shared notes folder" line.

## Final report, verbatim

1. **Would I try it?**
   - **Line 1:** Maybe. It's the only line that tells me I could get paid for compute I'm already paying for. I'd point the agent at small bounties in a language I know well, like a TypeScript bug fix, and read every PR myself before it went out. My hesitation is that "answers with a pull request" sounds like an agent sending unreviewed PRs under my name, and maintainers already complain about AI-generated PR spam.
   - **Line 2:** Probably not, at least not because of this line. It describes the marketplace, not what I get out of it. "Posted by other people's coding agents" puts me off: it sounds like agents assigning work to agents, and the tasks could be vague or made up. The public payment record is a good touch, though.
   - **Line 3:** No. A track record only matters once I'm already earning. "Build your agent a track record" asks me to work first and maybe get paid later, which sounds like unpaid work on spec. It also mixes up whose record it is ("your agent" and "your name").

2. **Clearest and least clear:** Line 1 is clearest: idle agent, find bounty, open a PR, get paid. Line 3 is least clear. On its own I read it as a portfolio or reputation site for AI agents, something like a LinkedIn for bots, and it doesn't say there's money or bounties involved. Line 2 has a smaller problem: I first read it as a dataset or benchmark of real-world tasks, not a place to earn.

3. **First thing I'd want to know:** How much do bounties actually pay compared with the tokens my agent burns on them, including attempts that never get merged? Close behind: who decides whether a PR is accepted and paid, and what happens when the owner just doesn't pay. "Pays you directly" means there's no escrow.

4. **What I doubt or worry about:**
   - "Pays you directly" plus "payment you confirm" tells me nothing guarantees payment. A public record of non-payers helps, but it doesn't get me my money.
   - If many idle agents go after the same bounty, most of that compute is wasted and only one PR gets merged and paid.
   - Running my agent unattended against strangers' repos is a security risk: prompt injection in issues, malicious setup scripts, or secrets leaking into PRs.
   - Using a subscription I pay for personally to earn money might break the provider's terms of service.
   - "No ratings — only what happened" sounds neutral, but a merge count can still be gamed with lots of trivial bounties.
   - Spam: if many people do this, maintainers may start banning PRs from agents.

---

# position-solver-B

- Started: 2026-10-21T07:00:59.739Z · ended: 2026-10-21T07:01:18.820Z (UTC, from the transcript)
- How started: fresh Claude Code desktop session (start_session, context fresh, cwd empty-6), started by the head chef; app session local_3d85a7b4-0fbb-40bd-869b-247e95e7bba7; transcript a979c357-bcd6-47e6-a6c3-c36cce52580c.jsonl
- Model: claude-opus-5-5
- Tool calls: {}
- Wrapping the app added around the prompt: a "Background (from the session that started this one)" line, a "Linked sessions now" system reminder naming sibling sessions, and a "Shared notes folder" line.

## Final report, verbatim

1. **Would I try it?**
   - **Line 1 (track record):** Probably not, at least not first. A track record helps only if someone looks at it. This line doesn't say what my agent does or why I'd earn anything. It reads like a perk added on top of a product it never names.
   - **Line 2 (idle agent, bounties, PRs, owner pays):** Yes, this is the one I'd try. I'd start with one small, low-stakes bounty in a language and repo type I already know, such as a bug fix with clear tests. That way I can review the PR myself before it goes out and see whether payment actually arrives.
   - **Line 3 (real tasks, public payment records):** Maybe. It answers "are these real?" but not "what do I do?" I'd only try it after reading Line 2. On its own it sounds like a job board for watching, not taking part.

2. **Clearest and least clear:**
   - **Clearest:** Line 2. It covers the input (bounties via a feed or MCP server), the output (a pull request) and the payoff (the owner pays you). It also matches my situation, since my agent sits idle.
   - **Least clear:** Line 1. At first I thought it was a reputation or portfolio site for agents, something like a LinkedIn profile. "Each payment you confirm" confused me. I couldn't tell if I'm the payer, the payee, or someone confirming a payment I received. It also isn't clear whether "your name" means me or my agent.
   - Line 3's "posted by other people's coding agents" also threw me. Are agents posting the bounties, and not humans? That sounds odd.

3. **First thing I'd want to know:** how payment works and how reliable it is. Who pays, how much, when, and through what (escrow, Stripe, crypto, an IOU)? What happens if the owner merges my PR and never pays? "Pays you directly" sounds like no escrow, which means the risk sits with me. Close behind: how much of my agent's usage, and my own review time, one bounty costs compared with what it pays.

4. **What I don't believe or worry about:**
   - **Getting paid:** "Pays you directly" plus "payment you confirm" suggests nothing enforces payment. A public payment record helps but doesn't guarantee anything.
   - **My name on unreviewed agent PRs:** My agent would open PRs under my name on repos I don't know. If it ships junk, that's my reputation, and maintainers already dislike AI-generated PR spam.
   - **Bounties posted by agents:** I'm skeptical about the quality and whether a real person is behind each one. Who decides the work is "done"?
   - **"Idle" doesn't mean free:** Unattended runs can use up my plan's limits or API credits, and they might break the provider's terms of service.
   - **Security:** Running my agent against arbitrary live repos could expose it to prompt injection in issues or code. I'd want it sandboxed, with no access to my own credentials.
   - **"No ratings — only what happened":** This sounds good, but raw counts are easy to game, for example with self-posted bounties and self-confirmed payments.

