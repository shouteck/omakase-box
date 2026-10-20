# BT41 fresh-agent seat — recipient's report

Status: internal agent evidence, not customer proof. The recipient saw only
`C:\Users\shout\AppData\Local\Temp\kitchen-BT41\seat` (README.md, the built
`box-bounty-0.1.0.tgz`, and a scratch Git project in `sandbox\`), with no
repository access. The tarball was built from candidate `797190a`; its
packaged README is byte-identical to `FIRST-FIVE-MINUTES.md` at that commit
(sha256 f9763b91…).

The recipient finished the offline setup: installed from the tarball into
the seat, ran `box bounty help`, turned the instruction block on, created a
draft, answered `allow owner/project` (settings kept inside the seat via
`BOX_BOUNTY_SETTINGS_DIR`), ran `status`/`config --full`/`describe`, and
stopped at `post --preview`, which refused `github-visibility-unreadable`
(exit 3) because the placeholder remote is unreadable. Nothing was
published.

## Its four owner answers

(a) **What did I allow?** The tool may post bounties publicly on GitHub
under the owner's account for `owner/project` only, and merge a solution
the agent chooses, without asking before each post or merge. Reward $0; no
payment promised. It is a standing permission for that repository, not a
one-off and not any other repository. Instruction-file maintenance was
also turned on, which wrote the `box-bounty` block into `AGENTS.md`.

Lines it relied on: "A bounty asks people outside the project to fix
something, and it is posted publicly on GitHub under your account."; "Your
answer covers this repository only. A solution your agent chooses is
merged into your code."; "Each bounty on owner/project states $0 — no
payment is promised."; "You will not be asked before a post or a merge.";
"allowed: owner/project — written to the owner's settings."; "this
repository: owner/project; allowed by this repository entry"; "be asked
each time before each post and each merge: box bounty allow owner/project
--ask".

(b) **What is public?** Nothing from this bounty yet — it is still
`drafted`; preview refused. If posted: the task, the one-line why, the
bounty branch's commits, the machine-readable block, and the history ref
under `refs/box-bounty/*`. Anyone who can read the already-public
repository can read those refs. Never public: never-ship files, private
repositories, anything outside the permission. `create` printed
`never-ship removed (dot-box): 2`. It could not verify that the
placeholder `owner/project` is public and never saw the preview contents.

(c) **What do I owe, and to whom?** $0 to no one now; the open bounty
states $0 and "No payment exists." The README's future case — a merged
solution that states a reward, relayed by `apply`, tracked by `status`
until `config set paid` — is not reconciled by the material: it does not
say how much would be owed, how to pay it, or whether a $0 bounty can
create such an obligation. It did not guess. No payee is named.

(d) **How do I stop it all?** No single command. `deny owner/project`
removes the posting permission and leaves open bounties untouched;
`close <id> --reason` ends the open draft; `hook off` applies only if a
hook was enabled (none here); uninstall the package; delete the seat's
settings folder and `sandbox\.box`; nothing is on GitHub to clean up. If
something had been posted, delete the issue/PR and the shared ref by hand
(`git push origin --delete refs/box-bounty/<id>`, and
`git update-ref -d refs/box-bounty/<id>` on a machine that still holds it).

## Where it was unsure, guessed, or could not finish

- Its first draft's `--why` invented an owner statement; it closed that
  draft before any post and created a clean replacement.
- It ran `allow` itself as the setup step; the record cannot prove a human
  typed "yes".
- Preview refused (`github-visibility-unreadable`) both times; it never saw
  what would become public.
- GitHub access is unverified; no `gh auth login`, no network.
- The session hook was not tested (README names `devin`/`claude`; this is
  OpenCode; it would write outside the seat).
- `npx box-bounty` was not tested (needs the registry).
- A local install is not on PATH; the coding agent must call
  `..\node_modules\.bin\box.cmd bounty ...`.
- `config` says `never publish: none listed`, but `create` removed a
  built-in `.box`; it could not tell built-ins from user entries.
- `.box` is untracked, not ignored at the top level; `git add -A` could
  commit it.
- The first `status` warned `shared bounty memory not refreshed (remote:
  Repository not found.)`; later calls were silent.
- Not tested: `deny`, `close` on a posted bounty, `apply`, `look`, `find`,
  `hook`, posting.

## Where it found README and tool disagree or diverge

1. **Preview promise vs refusal.** README: `--preview` "shows exactly what
   becomes public". Tool: refused `github-visibility-unreadable` and showed
   nothing. Preview requires readable GitHub visibility, which the README
   does not mention. It refused safely.
2. **Where the record lives.** README: records in `.box/local/box.db`;
   delete `.box/local/` to forget this machine's copy. Tool: `records:
   .box/bounties/ is not tracked in Git (local to this checkout)`, and
   `.box/bounties/OPEN` exists. It calls this a real location/terminology
   mismatch; deleting only `.box/local/` may leave `.box/bounties/`.
3. **The never-ship list.** README lists `.env`, keys, credentials. Tool:
   `never publish: none listed`, but `create` removed `.box`. "None
   listed" is the user-added list; the README does not mention `.box` as a
   built-in.
4. **"Fixed block" is state-dependent.** README: `config set instructions
   true` writes "the fixed block". Tool: while a bounty is open the block
   and `describe --rules` include "a bounty is open; box bounty shows
   more."; closing the bounty removed that line. Minor.
5. **Offline status.** README: `status` lists waiting pull requests. Tool:
   first `status` warned the shared memory was not refreshed (remote
   unreadable); later calls were silent. Undocumented degraded mode.
6. **Uninstall command.** README: `npm uninstall -g box-bounty`; this seat
   installed locally, so the local equivalent differs. Environment
   mismatch, not a product bug.
7. **Undocumented `allow` options.** README presents `allow owner/project`
   as the owner's yes/no answer; the tool also supports `--ask` (be asked
   before each post and merge) and `--reward`/`--reward-limit`. Not a
   contradiction, but `--ask` materially changes what the owner agrees to.
8. **Exit codes.** Refusals did exit 3 when checked; the harness display
   once said 1. No README/tool disagreement.

Host/model: OpenCode on Windows, DeepSeek V4.1 Flash (opencode-go /
deepseek-v4.1-flash); Node 24.11.0, npm 11.6.1, Git 2.45.1, gh 2.101.0.
