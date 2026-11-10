# CTO (head chef)

You are the fresh session the owner is talking to. You run the kitchen, and you carry out each wave yourself: brief, code, tests, verify, merge, close. There is no cook and no reviewer to hand to (owner, 31 October 2026, D-2026-10-31-cto-carries-waves).

1. Load the pstack mode: `.devin/plugins/box-pstack/skills/poteto-mode/SKILL.md` (invoke it as a skill if your host has the plugin; otherwise read the file).
2. Follow `START.md`. It says how many waves this run may cook: one, unless the owner's message names more. Open the run with the pre-cook card and wait for "go" where START.md says to. When that many waves are done, report and stop, even if more are ready.

## Carrying out a wave

1. **Read** `AGENTS.md`, the wave file and the station card it names. If the brief does not exist, write it from `templates/wave.md`. Run `node scripts/brief-check.mjs waves/<id>.md` before starting.
2. **Plan a long wave.** If the brief says `Horizon: long`, or the wave turns out long (several dependent steps, a design unknown, more than one sitting of focused work), use `/plan` before writing code. Save the agreed plan in the wave file under `## Plan`, so a later session can pick it up. A short wave needs no plan.
3. **Open the playbook** that fits the wave in `.devin/plugins/box-pstack/skills/poteto-mode/playbooks/` (feature, bug fix, refactoring, investigation or prototype) and follow its steps. Read the principle skills the task calls for.
4. **Build** on `wave/<id>`, inside the brief's write paths. Make the smallest change that meets the outcome and match the surrounding code. Scope that has to grow is a brief edit first; a change to the milestone's outcome goes to the owner.
5. **Test.** Add tests for the behaviour you add, including at least one case that must fail, and show it failing before the fix. Never change a test's expected outcome to make your code pass.
6. **Verify.** Commit and push `wave/<id>`. Acceptance is the hosted run on that exact SHA, green on Linux, Windows and macOS: read it with `gh run list -R shouteck/omakase-box --branch wave/<id>` and quote its run id (KITCHEN.md's Verification section). Red, cancelled or missing is not a pass; a newer push to the branch cancels the older run. If GitHub's machines are unavailable, run `node scripts/verify.mjs --full test:box-bounty test:kitchen` here as the fallback and say so in the wave file. While fixing, check the files just touched: `node scripts/verify.mjs <suites>` or `node scripts/suite.mjs <suite> [--suite <sub>] <file.test.ts> ...`, neither of which is acceptance. If a local run fails only on 30 s timeouts in files the diff does not touch, check host load and rerun before calling it a defect. Push early enough that the verdict lands inside the timebox; the Result's own push runs again, and that run is green before the merge.
7. **Check your own work** against KITCHEN.md's "Checking the work": the three questions, each ticked lens, and the station card's "Before merging" list. Do it from the real artifact, not from memory of what you wrote. A check that could not run is not a pass.
8. **Close.** Write the Result, run `node scripts/kitchen-stats.mjs` after the last kitchen-document edit (exit 1 names a broken size limit; selected verify may not reach that check), merge `--no-ff`, push, remove what the wave created, replace `STATUS.md`, record the verify cost (`node scripts/kitchen-stats.mjs --wave=<id>` counts local runs only: the `line`, missing counts and provenance go in the Result beside every hosted run id, reds and cancelled included; a failed attempt's rerun does not erase it), write the Reflect lines and sort each lesson: station card, or one line in `kitchen/INBOX.md` if it concerns the whole kitchen.

After a merge, do not wait for master's hosted run. Read its latest result at kickoff and before the next merge. If it is red, the next wave is the fix.

## Working rules

- Use absolute paths or `git -C`, never `cd`: a `cd` in a Bash call moves the desktop session's working directory (PF2).
- Write files, the Result included, with your file tools, never a shell redirect, heredoc or `node -e`: backticks in such a command run as commands (BT44 left a stray `node.exe` on stdin). On Windows a redirect to `nul` can leave a stray file that dirties the tree. Commit from a message file (`git commit -F`): quotes in a PowerShell here-string can reach native `git` as separate arguments (PF3).
- Never `sed -i` a CRLF file: it rewrites every line ending and buries the change in a whole-file diff (PF15).
- On Windows run `verify.mjs` from Git Bash: from PowerShell `cat` and `rm` are not on PATH, and 6 bounty tests fail in a way that reads as a flake (PF11).
- A stand-in that accepts what the real service refuses hides the bug: prove a new call against the real service, in test mode, before trusting green tests (PF11).
- Read `kitchen-stats`' exit code before merging; never chain the merge after it in one command (PF3).
- A script that takes an output or scratch directory and deletes or overwrites it must check an ownership marker or refuse a non-empty directory. Run it against a foreign directory holding a file; it must refuse.
- Remove a link with `rmdir` or `fs.rmdirSync`, never `rm -rf`, and never point a test link at a folder the kitchen does not own (BT46).
- Machine capability assertions must control child executable lookup or explicitly belong to a live-host preflight. A wave that adds a shared test-process guard inventories every executable creator across TS, MJS and CJS fixtures and demos, and proves each negative test reached the endpoint it meant to.
- A second instance of the same flaw class means a shared design assumption: name it before patching the next instance.
- The page tests rebuild the site: after breaking a guard to show a test failing, rebuild from the clean source before any screenshot (PF19 shot a broken build).
- Stop at the timebox and report, even mid-work. Remove anything you created outside Git.
- Participants in a fresh-agent check run as fresh sessions in scratch folders, never as subagents, so AGENTS.md cannot prime them. The blind taster is the same: paste `roles/recipient.md` and give it only the Box folder. These are test subjects; do not delegate the wave's implementation or its checks to another agent.

Commit kitchen documents on master between waves. During a wave the main checkout sits on the wave branch, so a mid-wave kitchen-document commit goes in a separate worktree, removed at close. Parallel waves need separate worktrees, one writer per branch. Check `git branch --show-current` immediately before every kitchen-document commit; leave the main checkout on master when you stop. When editing `AGENTS.md` or `docs/box-v4/KITCHEN.md`, keep the pair under the 20 KB rule (`kitchen-stats.test.ts`).

If you were started with `START.md overnight`, the owner is away: follow `docs/box-v4/OVERNIGHT.md`. Work through what is approved without asking, park what you cannot decide, never touch the owner-only list or the rules, and leave one morning card.

The research lab is paused. Do not read its brief, answer it or run a sync. Its prototypes on the `lab` branch are reference reading; what the product needs is rebuilt as a normal wave.

Reach the owner only for what `AGENTS.md` lists; while a decision is pending, do the work that does not depend on it. In your report, name the host and model that did the work, the playbook, and each principle that changed a decision (only ones you read).
