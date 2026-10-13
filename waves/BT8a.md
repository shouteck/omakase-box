# BT8a: the owner's side is three words and a list

Milestone: BT · Station: packaging (also evidence) · Base: `3a159c2` at dispatch · Branch: `wave/BT8a` · Timebox: 150 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Rewritten by the CTO on 13 October 2026 against BT8's Result (merged `e8e1038`).** The owner made these decisions in conversation while BT8 cooked. The earlier draft of this brief also carried the secret scan; that is now its own wave, [BT8c](BT8c.md), so each can be reviewed once. Order: BT8a, then [BT8b](BT8b.md), then BT8c.

## What BT8 built that this wave changes

- A `bounty owner` group of seven commands: `setup`, `allow [--project|--all] [--yes]`, `ask`, `off`, `on`, `answer <id>`, `summary`.
- The owner's yes stored in `settings.json` under the repository's folder path, with an all-projects default beside it.
- A first-use message that prints the commands for this project, for all projects, and for that one bounty.
- Under "ask me each time", each post **and each closing** waits.

## Outcome

An owner has three words to know and usually types none of them: they tell their agent what they want and the agent runs it. The yes is a list of repositories the owner can read and change. What the yes means reaches the owner through their agent's own words, and that is tested.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`. Tests never read or write the real owner settings folder.
- Read for context: `waves/BT8.md` Result, all of it; PLAN.md ("The three hard stops", "Other rules of the product"); `kitchen/stations/packaging.md`.
- Do not touch: the secret scan, its patterns, what a hit offers (BT8c); the never-ship table; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network. The K14 start budgets are re-measured and stated.

**Three words**

After tools people already know: `direnv allow` and `direnv deny` for trust; `git config`, `npm config` and `gh config` for everything else; a status command for where things stand.

| Command | What it does |
|---|---|
| `allow [repository]` | Adds a repository to the owner's list; with no name, the one it is run in. Prints what that allows before writing. One option makes the entry "ask me each time". `allow <bounty>` lets one waiting post go out and decides nothing else. |
| `deny [repository]` | Takes a repository off the list. |
| `config` | Bare: prints every setting, set or not, with its value and the exact command that changes it. With `set`, `add` or `remove`: changes one thing. |
| `status` | Exists and is shared with agents. Shows what is waiting for the owner; with an option, what was done since a given time. |

- **Nothing else is the owner's.** `owner setup` becomes bare `config`; `owner ask` an option of `allow`; `owner off` and `owner on` become `deny` and `allow`; `owner answer <id>` becomes `allow <bounty>`; `owner summary` becomes an option of `status`. Each old spelling, typed, is a named refusal that says what replaced it. None is kept as an alias.
- **A new setting never adds a command.** Whether the yes extends to all the owner's projects is one `config` setting, off by default. BT8c and BT11 add theirs the same way.
- **Bare `config` is written for an agent to act on:** complete, each line carrying its command, and one line saying what the owner has not decided yet.
- The dated history of changes stays in the settings file, so what was there before a `deny` is still visible.

**A list of repositories**

- The owner can add the repository they are in, add one by naming it without being inside it, see the list (when each was added, allowed or "ask me each time") in bare `config`, and remove one with `deny`.
- **A repository is named by its GitHub address** (owner and name), not its folder. The yes is about bounties being posted publicly to that repository under the owner's account. Every copy on this machine is covered; a different repository at the same folder path is not; a fork is a different repository. The cook may argue for another identity in the Result only by showing this one fails a case below.
- A repository with no GitHub address cannot be listed, and the refusal says so by name.
- **Entries BT8 wrote under a folder path are moved once:** to the address of the repository at that path if there is exactly one and it can be read; otherwise reported with the command that re-adds it. Never silently kept as a yes for whatever sits at that path.
- `deny` returns a repository to "nothing written". Open bounties are untouched and `status` says the repository is no longer allowed.
- Tested: the same path holding a different repository; a fork; a remote renamed after the yes; two remotes pointing at different repositories; an address differing only in letter case or a trailing `.git`.

**One repository at a time, and one decision behind two doors**

- Plain `allow` covers this repository and nothing else. All projects is an extra the first-use message does not offer.
- First use and bare `config` use the same words for the choices they share, and first use says it is the same decision. First use offers, in this order: allow this repository; be asked each time; this one bounty only.
- An owner who chose "this one bounty" before is told so in one line the next time.
- An action that goes ahead under the all-projects setting says so in those words.

**"Ask me each time" covers publishing only**

- The owner is asked before each post. The tool closes a bounty whose solution is merged without asking, in every mode: the merge has happened, and a held close only leaves a stale open issue.
- Bare `config` and the doc page say plainly that this covers publishing and nothing else, and that merging is not gated.
- `allow <bounty>` posts the waiting bounty; the owner does not wait for an agent to return.

**What the yes means has to reach the owner**

- The first-use message gives the agent three short facts that survive paraphrase: bounties are **public**, under the owner's GitHub account; a solution the agent chooses is **merged** into the owner's code; and it is **this repository** only.
- **The relay is measured.** The reviewer plays an owner who sees only what the agent says in the conversation, never the tool's output, then writes down what they believe they agreed to. Three runs with fresh agents. If "public", "merged" or "this repository" is missing from what the owner understood in any run, the message is made shorter and blunter and the runs are repeated. The Result gives each relayed sentence word for word.
- **The first merge of a stranger's solution in a repository is said to the owner once.** The output of that `apply`, or of the command that recognises that merge, tells the agent to say in its closing message that a solution written by someone outside was merged, naming the commit. Once per repository, recorded, never a question. `status` shows it too.

**Waiting is not failing**

- A command that leaves a bounty waiting says so in its first line and exits in a way an agent host does not read as a crash; the Result states the exit status chosen and why. No command waits for typed input.

**Small things BT8's pass found, closed here:** stray arguments to `allow` are refused, not ignored (F4); a bounty already waiting keeps its first wait time (F5); the owner's permission is checked before any call to GitHub, so a first post with `gh` missing still reaches the waiting state or a refusal that says both (F7).

**Cases that must fail, each a named refusal that changes nothing:** each `owner …` spelling; `config set` of a name the tool does not know, or of a hard stop; `allow` or `deny` with a name that is not a repository address or a waiting bounty; adding a repository with no GitHub address; `deny` of one not listed; `allow <bounty>` for something not waiting.

## Review lenses

- [x] **Security:** the reviewer tries to make a yes for one repository apply to another: same path with a different repository, a fork, a second remote, a remote edited to claim a listed address while the bounty would go elsewhere, a lookalike address, a moved entry that lands on the wrong repository. It replays BT8's attacks on the settings file through the new commands, and reports for each: prevented, or permitted but visible.
- [x] **User experience:** the relay trial, three runs, word for word. Then two readers, each fresh: an agent given only bare `config` and an owner's plain request ("stop bounties on this repository", "allow the shop repository too", "ask me each time here") runs the right command first time; an owner, played by the reviewer with only bare `config`, says what each line means. The reviewer reports anything shown that was not used and any line addressed to the wrong reader.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Dispatch, 13 October: owner said "go" after the removal card. Hosted master verification of BT7b-ci2 passed. Start at 03:13 UTC; stop by 05:43 UTC. Use disposable offline GitHub stand-ins and a temporary owner settings folder for every trial; do not post a real issue, change real authority or spend money. Supply exact built-CLI fixture creation and cleanup instructions for the fresh relay/config readers. Keep the candidate clean while acceptance runs. The CTO owns kitchen docs and dispatches fresh reviewers/readers.
- Refactoring playbook: BT8's behaviour is reviewed and right; this wave changes its shape. Migrate callers, then delete the old spellings. Subtract before adding.
- The owner rejected requiring a real terminal for the owner's commands. Do not add it, a typed confirmation, a key or a signature. The honest position stays: this stops accidents and makes changes visible.
- A message has one reader. A line for the owner belongs in bare `config` or `status`, not in what an agent is shown, except the three facts it is asked to pass on.
- Never write a token-shaped literal in a tracked file, this one included (BT8's lesson; `secret-literals.test.ts` will fail).
- The owner's side is not designed further until this wave has run: the next useful information is what a fresh agent and a first-time owner do with it.
- Report at the timebox. Do not run on.
- Not in this wave: the scan and what a hit offers (BT8c); the instruction files and `limits.json` (BT8b); the hook (BT9); any reward or limit (BT11).

---

## Result

- Workers: original `/root/bt8a_cook`, then fresh correction cook `/root/bt8a_correction_cook`. Reviewer: `/root/bt8a_pass`. All used Codex on this Windows host with inherited model settings; fresh agents, not independent humans or claimed model diversity.
- Final candidate: `7534f3b964cc4524cc6186ec7c8de72e7f56eece`.
- Repository permission uses normalized GitHub owner/name, with letter case and a trailing .git normalized. It resolves effective fetch and push destinations, including Git rewrites. A fork is separate; divergent remotes, lookalikes and ambiguous legacy paths refuse. Legacy folder entries migrate only when one readable address can be established. Unresolved entries do not turn an all-projects setting into a silent yes.
- `deny` removes the active entry and keeps a dated inactive entry and history. That explicit removal blocks blanket authority until reallowed. All-projects remains an extra configuration setting, off by default.
- Waiting exits 0, with waiting on the first line. This is a completed request waiting for authority, not a host crash. Repeated post preserves its original wait time; first-post permission precedes GitHub calls. One-bounty allow posts directly. Ask covers publishing only; a merged bounty closes without another owner question.
- Disclosure is emitted to stdout before authority writes for allow, including conversion to ask and configuration additions. Validation precedes those effects. Bare config derives its permission summary from actual state and includes undecided settings and dated history.
- The final first-merge correction records the actual receiving repository, not the bounty's publication repository. With no determinable GitHub address, it records a private fact in existing excluded bounty bookkeeping at `.box/bounties/FIRST_MERGE`. Ordinary-parent checks and exclusive creation preserve malformed or foreign bytes; an unreadable marker is reported without undoing an already landed merge. The marker does not enter shipped snapshots, resume context or the public WIP commit. The never-ship table and scan rules are unchanged.

### Verification and correction record

- `aa0ad4ba722ca48a6de16ca03f902abc626e6e85`: full acceptance failed in 411s. Typecheck/build passed, bounty had 314 passes, eight failures and one skip; package did not run. Five failures lacked the retained external cat helper, two disposable-home/link fixtures were blocked by the default host sandbox, and one BT7 transport fixture still used the removed rewrite setup.
- `6c7e4668a1ea341a847f5e8c1c11b5603b07bd6d`: grouped correction, then 427s acceptance failed solely on the package color-banner assertion with inherited NO_COLOR. The process-local retry removed NO_COLOR and added Git usr/bin to PATH; disposable fixture execution used approved elevation. It completed PASS in 427s at `.kitchen/runs/2026-10-13T04-17-38-110Z-6c7e466`: 326 bounty passes; 142 package passes and six skips. Failed overall runs were not reused.
- Independent pass still rejected that green candidate. After collection from owner/project, changing the receiving repository to fork/project and merging locally incorrectly announced and recorded owner/project. The fresh correction cook reproduced five initial failures against the old build, then added nine real-CLI notice/privacy cases. Its four-file scoped run passed 38/38. Final acceptance and review evidence follow below.
- Test environment changes were invocation-local. No global tool settings, real owner authority, real GitHub issue or payment changed. The named suites were offline; db=none.

### Tests removed for changed behavior

Seven obsolete owner-group checks were replaced: off/on history; owner-held close under ask; allow requiring --yes; allow --all; owner allow releasing waiting; setup/summary; and the old record compound expectation for posting nothing with exit 3. One obsolete rendered owner-allow assertion was removed from a retained waiting-stage check. Replacements assert observable disclosure before writing, deny/default/reallow history, direct one-bounty post, publishing-only ask, truthful config, waiting exit 0 and stable time, permission-before-GitHub, and retained double-close terminal behavior. Scan, Git safety, merge and transport safety expectations were not weakened.

### Security review

The pass independently exercised 20 built-CLI probes on the preceding candidate: folder reuse, fork, renamed and second remotes, fetch/push mismatch, both Git rewrite forms, lookalike addresses, malformed and unknown settings, and conflicting or unresolved legacy entries under blanket authority. Refusals left settings unchanged. Same-user settings edits and a settings junction are permitted but visible, as the owner required: an accident stop, not a lock. Populated foreign fixture cleanup refused and preserved bytes. The final correction receives an additional exact-commit review below.

### Fresh reader trials

The first relay round shifted choice to the owner in all three paraphrases. The message was corrected to name the agent explicitly, and three new agents read only captured first-use output. The pass played the owner using only their conversation messages and understood all three required facts in every final run. The final first-use and bare configuration choice wording is unchanged by the first-merge correction.

- `f636d1b4c2147254ed4687f18de1eed752fc9142`: completed clean PASS in 509s at `.kitchen/runs/2026-10-13T04-41-59-042Z-f636d1b`, with 335 bounty passes and 142 package passes plus six existing skips. The pass confirmed both fork paths now name the receiving fork and malformed/linked marker preservation works. It then found the same local checkout repeated the notice after adding a readable GitHub remote. The cook independently reproduced notice flags true/false/true across three independent bounties.
- `7534f3b964cc4524cc6186ec7c8de72e7f56eece`: the transition correction suppresses the repeat using the existing private local fact. It does not infer a permission entry or historical GitHub-address attribution. The three independent bounty regression now gives true/false/false; 39 scoped tests passed, including ten correction cases. The same-user marker remains an observable accident-stop convention, not an authenticity lock.

#### Relay 1

> Bounty bt-87932fb185f2 is waiting for your permission to post to GitHub. Bounties are public under your GitHub account, and a solution chosen by the agent is merged into your code.
>
> For this repository, you can choose:
>
> - Allow the tool: `box bounty allow`
> - Require approval before each publication: `box bounty allow --ask` — merging does not require approval.
> - Allow only this bounty: `box bounty allow bt-87932fb185f2`
>
> Which option do you want?

#### Relay 2

> The tool is waiting for your permission to publish bounties publicly under your GitHub account. Solutions chosen by the agent are merged into your code. This decision applies only to this repository.
>
> You can choose:
>
> - Allow this repository: `box bounty allow`
> - Require approval before each publication: `box bounty allow --ask` — merging does not require approval.
> - Allow only bounty `bt-87932fb185f2`: `box bounty allow bt-87932fb185f2`
>
> Which option do you want?

#### Relay 3

> Do you want to allow the tool to publish bounties publicly under your GitHub account? Any solution the agent chooses is merged into your code. This permission applies only to this repository.
>
> Choose one:
>
> - Allow this repository: `box bounty allow`
> - Ask before each publication: `box bounty allow --ask` — merging does not require approval.
> - Allow only this bounty: `box bounty allow bt-87932fb185f2`
>
> Publishing is currently waiting for your approval.

#### Bare configuration

Two further fresh agents received only bare config and an owner's request. For "Stop bounties on this repo", `/root/bt8a_config_final_stop` first ran `deny owner/project`, exited 0, and confirmed status said not allowed. For "Allow owner/shop too", `/root/bt8a_config_final_shop` first ran `config add repositories owner/shop`, exited 0, and received the dated allowed entry. Neither reported hesitation or misreading. Both used only the offline fixture wrapper and temporary settings.

The pass played the owner using only bare config. It understood the actual current entry, the default being off when undecided, true/false/ask blanket behavior, entry overrides, deny overriding blanket permission, dated history, and publishing-only ask. Nonblocking unused lines included blanket settings, unrelated ask examples, removal/reallow alternatives and status for the add request. The settings filepath and timestamps were operator detail; "dated deny removal" was awkward. Earlier exploratory config readers got the right first command, but build overlap made those trials nongating. The final captures were frozen on clean 6c7e466 before the retry build.

### Final acceptance and close

- Verdict: **PASS, ui-verified**, from fresh pass `/root/bt8a_pass` on `7534f3b964cc4524cc6186ec7c8de72e7f56eece`. Both required lenses, security and user experience, passed. Measurement fairness was not applicable.
- Executed worker record: `.kitchen/runs/2026-10-13T04-55-02-950Z-7534f3b`. Summary: `verify 7534f3b PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 494s`. Clean at start and finish, no omitted steps. Bounty: 336 passed across 27 files, no skips. Packaging: 142 passed, six skipped across 17 passed files and one skipped file. The six skips are the existing A3 R2 replay tests guarded by BOX_A3_REPLAY.
- Completed reviewer invocation: `.kitchen/runs/2026-10-13T05-04-52-857Z-7534f3b`. Summary: `verify 7534f3b PASS check=reused build=reused test:box-bounty=reused test:box-package=reused db=none 1s`. Exit 0, exact SHA, clean tree. The reviewer read the underlying completed logs and used recorded reuse, not a second executed full suite.
- On 7534f3b964cc4524cc6186ec7c8de72e7f56eece the pass independently replayed three separate local bounties and got notice flags true/false/false after adding the remote before the third. Original marker bytes stayed unchanged, were absent from all delivered repositories, and did not create permission or address-level notice entries. Status retained the first local commit. The reviewer inspected the small transition diff and carried unchanged fork/protection checks from f636d1b and explicitly attributed reader trials from 6c7e466. Its newly created transition fixture and helper were removed.
- Latest hosted master read before merge remained green, run `38340167522`. New pushed verification is not claimed complete at close.
- Merged with no fast-forward as `4d35a81afd6b3f7ef22e064b42303d0bcf1464e0`. Final product changes were reviewed before the merge; only kitchen records changed afterwards.
- Resources removed: both registered relay/config fixture trees and registries; four owned count artifacts; all pass-created fixture worlds, probe helpers and evidence files. No BT8a-named temporary artifact remains. Verification logs and the normal compiled build remain. No database or container was created by acceptance. Older owner-held branches and unrelated temp folders were preserved. The merged wave branch is deleted at close.
- The interruption ended the correction cook after its completed acceptance record. The pass resumed and completed its own gate. No result is inferred from the interrupted turn.

### Final K14 starts

| Command | Git starts | gh starts |
|---|---:|---:|
| help | 0 | 0 |
| describe / describe-rules | 2 | 0 |
| create-preview | 11 | 0 |
| create / create-local | 18 | 0 |
| status-drafted / status-applied / status-end | 2 | 0 |
| close-draft | 3 | 0 |
| post-preview | 16 | 3 |
| post-github | 19 | 8 |
| status-posted | 2 | 5 |
| status-comments | 3 | 7 |
| look-pr | 19 | 2 |
| look / look-full | 6 | 0 |
| apply | 15 | 5 |
| close-ended | 4 | 4 |
| post-dir | 2 | 0 |
| look-from | 16 | 0 |
| close-reason | 4 | 0 |

Measured on final 7534f3b, not inferred from upper bounds. Positive-count anchors now reject a dead spy for expected nonzero paths. No budget increased. The uninstrumented child_process.fork seam remains a stated limit.

### Principles and reflection

The original cook and pass read the refactoring playbook and the applicable installed TypeScript guidance. Model the domain and foundational thinking changed the core key from a folder to a normalized repository address with explicit dated inactive entries. Boundary discipline placed destination and settings validation before authority effects. Subtract before adding and migrate callers then delete legacy APIs removed the old owner commands instead of keeping aliases. Minimize reader load changed bare config to summarize actual state. Prove it works drove stdout-before-write checks, real fork merges, independent local bounties and private-marker shipping probes. Type system discipline parsed external settings rather than trusting their shapes. The CTO's experience-first review required actor-explicit wording after the blind relay failure.

Reflect: the same-bounty terminal reapply check missed once-only notices across independent bounties, receiving forks and a newly readable address. It becomes the real-CLI first-merge regression file, including the three-bounty transition.
Reflect: repository attribution and owner understanding need observable flows, not prose review. The packaging station now calls for independent first merges in the actual receiving repository and a cold relay naming who chooses.
