# `box bounty` — a bounty, complete and safe, remembered in the project

GitHub posting is public and free, only to the project's own repository when
it is already public. Anyone can read the issue and the bounty branch. Nobody
is known to be watching these issues yet; the wait is unknown and every bounty
states the owner's reward — $0 by default, so no payment is promised. The tool is for public repositories on GitHub and has no other route.
Private repositories and unreadable visibility are refused with no override.

GitHub issues carry the [versioned public format](BOUNTY-FORMAT.md) for readers
that use none of this tool's code. The block's reward is the amount the owner
had set when the bounty was posted — zero USD until the owner sets one — and the
merged solution earns the whole reward. `status` compares the issue body's
block with the local record and reports absent, invalid, matching, or changed
metadata. The issue block never overrides the record. Older issues without a
block remain readable.

Closing updates only the `state` field of the final machine block and
preserves everything else as read live from GitHub — the reward included, so
the closed block states the amount the issue carried, never a value re-read
from the record. Invalid or duplicate blocks stay untouched; issue
closure and branch removal continue. A failed block write is reported as
`update-failed`, with the last observed comparison. `close <id>` retries that
write on an ended bounty. Compact ended `status` shows the cached last
observation and names `status <id> --full` for a current issue-body comparison.
A failed current read reports unavailable and labels any cached comparison.
`post <id> --preview` shows the exact issue and
publication plan before an owner has allowed posting and grants no authority.

A bounty is the task, what was tried, the one line of why, and the code —
nothing else. **Nothing a solver wrote is ever run by the tool:** checks were
removed on 11 October 2026, so `create` accepts no command flags at all —
`--setup`, `--check` and `--guard` are each a named refusal (`checks-removed`)
— and collecting, reporting and applying an answer runs no script,
hook, filter, merge driver or submodule fetch the answer carries. An answer
from any account can be listed, read and merged; choosing is always the
agent's or the owner's.

```
node packages/box-cli/dist/cli.js bounty create --task <file|-> --why "<one line>" \
    [--title "<text>"] [--resume "<context>"] [--full] [--repo <path>]
node packages/box-cli/dist/cli.js bounty [--repo <path>]
node packages/box-cli/dist/cli.js bounty help
node packages/box-cli/dist/cli.js bounty describe [--rules] [--repo <path>]
node packages/box-cli/dist/cli.js bounty status [id] [--full] [--comments] [--json] [--repo <path>]
node packages/box-cli/dist/cli.js bounty post <id> [--with-changes] [--include <file>] [--preview] [--repo <path>]
node packages/box-cli/dist/cli.js bounty look [id] <n> [--full] [--json] [--repo <path>]
node packages/box-cli/dist/cli.js bounty apply [id] [<n>] [--repo <path>]
node packages/box-cli/dist/cli.js bounty close [id] [--reason "<text>"] [--repo <path>]
```

Every command's normal output follows the same shape (BT17): one line
saying what happened — naming the bounty and, for a command that changes
something, the repository it acted on — then only the facts that need
attention now, then one `next:` line holding the one command to run (or both
real choices on that same line). Everything else — hashes, timestamps,
record paths, format observations, cached readings, reports and history —
sits one option away behind `--full`. Standing explanations are said once
the first time they apply, recorded in the owner's settings so they are
never repeated, and live permanently in `help` and `describe`.

The owner has three commands. An agent can run them after the owner's decision:

```
node packages/box-cli/dist/cli.js bounty allow [owner/name|waiting-id] [--ask] [--reward <whole dollars> --reward-limit <whole dollars>] [--repo <path>]
node packages/box-cli/dist/cli.js bounty deny [owner/name] [--repo <path>]
node packages/box-cli/dist/cli.js bounty config [set|add|remove <setting> <value>] [--json] [--repo <path>]
node packages/box-cli/dist/cli.js bounty status --since <iso> [--repo <path>]
```

The commands folded away — `answer`, `questions`, `reply`, `undo`,
`reject`, `withdraw`, `remind` (BT7c) and `confirm` (BT8) — each refuse by
name (`command-removed`) and say what took their place; none survives as a
hidden alias.

A fresh git clone contains no
`node_modules` and no built output, so `dist/cli.js` is missing until three
steps run, in this order:

```
npm ci --prefix scripts/tooling --ignore-scripts
node scripts/pnpm.mjs install --frozen-lockfile
node scripts/workspace.mjs build
```

The first step exists because `scripts/pnpm.mjs` wraps the repository-local
pnpm in `scripts/tooling`: until `npm ci` restores it, the install cannot
even start — it fails with "Repository-local pnpm is unavailable". That is
the step a warm checkout hides. It applies to any fresh copy, not only a
bounty.

Two programs are external requirements, checked where they are needed and
nowhere else: **Git 2.40 or later** (merges and the dry-merge read pin
`GIT_ATTR_SOURCE`, a git 2.40 feature, and the dry merge itself is
`merge-tree --write-tree`, git 2.38 — get it at https://git-scm.com) and, only
for commands that reach GitHub, the **GitHub CLI `gh` 2.0 or later, signed
in** (https://cli.github.com). A command that never touches a program never
demands it — `help` runs with neither installed. A program missing, too old
or not signed in is a named refusal on the error stream (`git-missing`,
`git-too-old`, `github-cli-missing`, `github-cli-too-old`,
`github-not-signed-in`): the program, the least version, what was found and
the program's official page — never an install attempt or instructions.
Checking a version costs one `git version` or `gh --version` per command,
only in commands that would run that program anyway; presence checks are
PATH lookups, never a spawned probe.

Run inside a Git checkout (or pass `--repo`) — `help` and `describe` work
anywhere; `help` prints the whole journey on one screen. `create` writes the bounty's record and Git bookmark. Nothing leaves the
machine until `post` publishes the GitHub issue and branch. Every outcome is a
named state: refusals print
`refused (<name>)` and exit 3; usage errors exit 2; operational failures
exit 1. `--task` is embedded verbatim, so a path the never-ship
rules would remove is refused (`never-ship-input`).

Every command reads options the same way: `--help` (or `-h`) prints that
command's own usage on standard output and exits 0, `--name=value` is the
same as `--name value`, and an option the command does not take is a usage
error naming it — nothing is silently ignored. `status`, `look` and
`config` take `--json` — one complete document, described below; on every
other command it is refused by name (`json-not-supported`). `box --version`
and `box bounty --version` print the tool's version.

With one open bounty, omit its identifier: `bounty look 1`, `bounty apply 1`,
or `bounty status --comments`. With several, the refusal names them
so you can choose. `status <id>` shows what needs doing first. `--full` adds
the history and reports. A listing marks a solution as new the first time the
tool shows it, then as seen since that time. Seen means only that it was shown.

## Reading as JSON

`status`, `look` and `config` take `--json`: one JSON object on standard
output — a newline after it and nothing else — printed instead of the text
view, built from the same facts, never by parsing the text. `"schema"` is
always the first key, `box-bounty/<command>@1`; a change to a field's
meaning grows `@2`, never silently. Times are ISO 8601, amounts are
whole-dollar numbers, commits are full hashes, and an absent fact is
`null`, never a missing key. Text written by someone else — a pull request
description, an issue comment — appears only inside `fromOthers` objects,
marked as theirs.

The choice follows npm rather than `gh --json <fields>`: `--json` selects
one complete document, so a field an agent assumed was there can never be
missing because nobody asked for it. A field-list mode could be added
later without breaking `@1`.

What the text view prints as lines — an acting-on notice, a merge
recognised, a said-once explanation — goes to standard error under
`--json`, unchanged; standard output carries the document alone. A refusal
stays a refusal: same text, same exit code, no document. `--full` adds
nothing to a document — it already carries the full facts; `status
--since` is a text report the document does not carry, so the combination
is refused. `status --comments --json` fills each bounty's `fromOthers`
with the issue's comments as `{from, at, text}`; without it `fromOthers`
is `null`.

`status --json` prints `{schema, repository, acting, owner, bounties}` —
`owner` is this checkout's read (`{decision, denied, decisionAt,
decisionLevel, reward, rewardLimit, promised}`) and each bounty carries
`id, title, why, stage, createdAt, baseCommit, reward, job, resume,
waiting, github, allowedBy, scanFindings, solutions, mergeNow, events,
next, corrupt`. `resume` is the saved job context (`{branch, commit,
changed, note}`) or `null` on records from before contexts were kept.
A record file that no longer reads is listed with `corrupt: true` and
every fact `null`. `solutions` entries name `n, pullRequest, collected,
seen, author, commit, outcome, changed, added, deleted, conflicts,
report, payTo, merged`; `mergeNow` is the fresh "would it merge now" read
the text view runs under `--full` — `{attempt, result, conflicts,
detail}` or `null` when nothing applies — beside `solutions[].conflicts`,
which stays the collection-time fact. `github`, when present, names the
repository, branch, bound commit, issue number and URL, the issue's
recorded `state` (open or closed) beside the publication's own
`lifecycle`, the issue-format comparison (`formatRead`, `formatReadAt`,
`formatUnavailableAt`, `formatRepair`), waiting pull requests, comment
count, any owed `pending` action and a merged bounty `pay` record.
`next` is the text view's one next line — an open bounty's next step, or
the asked-for / last-ended record's "continue the saved job" when nothing
is open.

`look <id> <n> --json` prints `{schema, id, n, pullRequest, collected,
author, commit, files, report, payTo, large, diff, fromOthers}` — `files`
is `{path, change}` pairs in Git's name order, `diff` is the unified diff
or `null` on a large change without `--full` (the text view's rule), and
`fromOthers` is `{from, text}` — the pull request's own description — or
`null` on attempts recorded before the description was kept.

`config --json` prints `{schema, settingsFile, allProjects,
allProjectsChangedAt, repositories, thisRepository, decision, denied,
decisionAt, decisionLevel, reward, rewardLimit, promised, instructions,
publishLists, waiting}` — outside a checkout the repository facts are
`null` and the settings still read. `repositories` maps each `owner/name`
to `{decision, addedAt, changedAt, reward, rewardLimit, history}`; a
`null` bounty on file reads back as `"denied"`. `instructions` is
`{enabled, file, found}`; `publishLists` is `{safeToPublish,
neverPublish}`; `promised` is this checkout's open-bounty total;
`waiting` lists each held action as `{id, for, reason, since, to, hits}`.

## Look at a solution

`look <id> <n>` collects pull request `<n>` itself — every check the old
`answer` command ran first, before anything is written — then prints the
change the solver made: the diff the pull request makes against
the commit the bounty named, computed on objects the tool already fetched.
When `<n>` names an attempt already collected it just shows it.
Nothing is checked out, no folder is made and there is nothing to remove —
looking touches neither your working tree, index, branch nor configuration,
and the tool runs nothing of the solver's to print it. The printed lines are
marked as the solver's words, not the tool's, and the output names the next
command (`apply <n>` to choose that solution). A large change prints its list
of changed files first; `look <n> --full` prints the whole diff.

Because the diff is read off objects, what it shows is the form Git stores,
not the form your working tree shows (git-lfs pointers, git-crypt
ciphertext). Your filters apply only when the tool lands a merge on your own
working tree.

## Apply a solution

`apply <n>` collects like `look` when `<n>` names a pull request, merges a
clean solution and names `git revert -m 1 <merge>` — one ordinary commit —
as the way back, in the same output. On your
own working tree your filters apply as in plain Git: after a clean `apply`,
filtered files are in their working-tree form and `git status` is clean.

That same plain-Git behaviour is the one place your own configuration can
betray the boundary. A filter or merge driver whose command resolves inside
the repository is replaced by whatever the merge lands and then run; what a
program reads cannot be bounded, so an unchanged program that calls a file
the solution changes is the same risk. The check parses each line the way
Git will run it — through `sh -c` — so a program reached after a `|`, `;`,
`&&`, subshell or substitution is checked as a command of its own, while a
separator inside `'…'` or `"…"` is data, not a command. Once a program
places outside the tree, every operand that decides what executes must
itself place: a path operand inside the tree refuses, a bare operand that
resolves to a program is a program reached through an operand —
`find -exec`, `xargs`, `env`, `ssh <host> <cmd>`, `wsl` or `stdbuf`
operands, and every other program like them, are checked as command lines —
a bare operand that exists inside the tree refuses, and an option's own
value (`--use-compress-program=…`, `-I…` and spellings like them) is a word
the program reads, so it is checked the same way. A quoted operand that
holds a whole line is checked as a line; a quoted word without a space is
data. A bare interpreter such as `node` or `sh` configured as a filter runs
the filtered stream itself as its program, so it refuses; a `git`
program's arguments can reach an `alias.*` — including one injected by a
`-c` operand — so aliases are expanded, recursively, and an expansion that
cannot be fully placed refuses; a launcher like `npm`, `make`, `just`,
`task` or `rake` reads its program from a manifest in the working tree, so
it refuses unless a flag that names that launcher's manifest places the
file outside; and `include.path`, `includeIf` and `core.attributesFile`
values resolve against the file that sets them (`~` expanded), so an
include that lands inside the tree refuses wherever in the chain it sits.
Before the merge the tool reads
your configuration and refuses by name (`apply-unsafe-config`),
stating the configured command and the path
involved, when a command resolves inside the tree or cannot be placed
inside or outside it at all. Nothing is touched: working tree, index and
branch are exactly as before. The fix is yours — point the command at a
program outside the repository, or merge the solution with your own git.

When a solution clashes with current code, `apply` aborts the merge — the
worktree and index are exactly as before, the record keeps the conflicting
paths — and states the facts: which files clash, which of the solution's
files would merge cleanly, and which commits on this branch touched the
clashing files since the shared commit. It names `look <n>` so you can read
the solution before deciding what to do, and says once that a merge you make
yourself runs under the owner's own Git settings — the tool's pins are not
part of it.

Resolving a clash is your own merge — the tool offers no command that
merges, stages or resolves, and keeps no merge state of its own. However the
solution lands on the branch the bounty was created on — your own merge, the
pull request merged directly — the next bounty command that reads a record
recognises it by Git ancestry and ends the bounty exactly as a clean `apply`
does: the record goes `applied` with the landed commit named, the closing
comment and issue close go out, and the durability refs drop. A merge on any
other branch closes nothing and is never mentioned; if two solutions are on
the branch, the one merged first in its first-parent history is the one the
bounty names. A record that names no branch it was created on, or whose
branch is gone, cannot be checked — the command says so and nothing closes.
If the recognised merge carries a never-ship path the collected solution did
not, the path is named as a fact — the history stays as you made it.

## Solvers' questions

Status states the number of issue comments from accounts other than the
owner and the latest time, without displaying their words. `status
--comments` shows them with each line marked as written by another account,
not by the tool — the issue is bound to this bounty before anything is read
from it. Answering is your own `gh`: `gh issue comment <number> --body
"<your own words>"` — the tool no longer writes comments for you. Choosing
whether and what to answer is yours.

## Return to the job

Create saves the branch, last commit and changed-file names in the project
record. Optional `--resume "<context>"` saves what the agent was doing and
the larger work waiting on the bounty, without a tool-defined length limit. This text and
`--why` are private; neither appears in an issue or comment. Status and apply
show the saved context. Older records with job files still show that context.
Put what was tried in the task, where the solver can read it.

## Post and collect on GitHub

On GitHub, a bounty is an issue on the code that is already there — solvers
are told to branch from `box-bounty/<id>`, an ordinary branch based on the
newest commit the repository already had, and to send pull requests to it. The tool uses Git and `gh` already
signed in on the machine. Sign in through those programs, outside the tool. It
never asks for, reads, stores or prints a token. `origin` must have one fetch
destination and one push destination, both naming the same GitHub repository.
Before any push, the tool reads that exact repository's visibility and refuses
private or unreadable visibility.

For a prepared bounty, show exactly what becomes public before anything is
published:

```
node packages/box-cli/dist/cli.js bounty post <id> --preview
```

This changes nothing. It asks the remote what it already has — fetched refs,
never a possibly-stale local tracking name — and prints:

- the commit the bounty branch is based on: the **newest commit on the current
  branch the GitHub repository already has**;
- what becomes public that was not: each unpushed commit with its identifier
  and subject, and — when the task is said to need uncommitted work — the
  tool's work-in-progress commit with the files it changes, adds and deletes;
  or `nothing new is published`;
- what stays home: uncommitted changes to tracked files that were not said to
  be needed, and every untracked file not named;
- never-ship-named paths that are already in the public history, as a fact —
  this tool cannot take back what is already public;
- the exact issue title and body a stranger will read.

Two choices, part of saying what the task is, and both visible in the preview:

- `--with-changes` — the task needs every uncommitted change to tracked files.
  They become **one** commit on the bounty branch, built by the tool through
  Git plumbing (`read-tree` + `update-index` + `write-tree` + `commit-tree`
  on a temporary index): the working tree, the index and the current branch
  never move, and the commit is deterministic — the preview, the record and
  the push name the same commit. Each file goes into the commit through the
  same clean filter a real `git add` would apply, so what publishes is the
  filtered form `create` would ship, never the working-tree bytes; a filter
  that cannot produce it is `github-filter-failed` and nothing is pushed.
  Without the flag they stay home; nothing
  publishes uncommitted work silently.
- `--include <file>` — an untracked file the task needs, named one flag per
  file. A name that resolves to a tracked file, a directory, a link, a path
  outside the repository, a missing file, a `.box/bounties/` record, or a
  never-ship path is a named refusal — untracked files are otherwise never
  published.

Never-ship holds on what is new: a change being published for the first time —
an unpushed commit or the work-in-progress commit — that touches a never-ship
path is refused (`github-never-ship`) and publishes nothing. A branch sharing
no commit with the remote has nothing public to point solvers at
(`github-no-public-base`).

Posting is gated once by the owner's decision, not per bounty — see *The
owner's one decision* below. With the tool allowed:

```
node packages/box-cli/dist/cli.js bounty post <id> [--with-changes] [--include <file>]
```

Before the push, the pre-publish scan reads everything that would be
published for the first time — see *The pre-publish scan* below.
The retired project limits file grants nothing and is no longer read.
When nothing local was needed,
the branch is a name pointing at the existing commit and **zero file content
is uploaded**; otherwise only the new commits go up, identifiers unchanged.
The issue says the task, what was tried, the branch to branch from and the
commit it is based on, whether the branch carries the poster's work in progress
and how and how many commits, how to answer (fork, branch from the bounty branch,
pull request against it), the reward (the owner's amount in force at posting)
and the licence as a fact — and carries the
`box-bounty` label, created on the repository when missing. The issue address,
number and branch are kept in the local record and shown by `status` and the
open-bounties line.

**Getting paid (reward above $0 only).** When the issue states a reward, its
"How to answer" also asks for one line in the pull request description:
`pay-to:` followed by the solver's Stripe payment link and nothing else, for
example `pay-to: https://buy.stripe.com/test_0EXAMPLE00000000000000`. The tool
reads the first line that starts with `pay-to:` and recognises exactly one
shape — `https://buy.stripe.com/` followed by an alphanumeric id (test-mode
ids start `test_`) — everything else is "not recognised" and the solver's
text is never echoed. `look` and `status` state which of the four facts each
solution carries: a recognised link, a recognised test-mode link, a `pay-to:`
line the tool does not recognise, or no line at all. The tool never opens the
link, never fetches it and cannot know the amount it asks for; when the
bounty closes on a merged solution the closing output and `status` carry the
message for the owner — whom to pay, how much (the amount from the owner's
setting, to be paid by hand) and where, with a sentence to check the checkout
shows the right amount and account name, plus who last edited the description
when that was not the solver. A merged solution with no recognised link is
stated the same way, without one.

The tool does not pay, does not know whether payment was made, holds no money
and does not protect the solver: posting a solution does not guarantee the
reward, and payment — if any — is the owner's to make by hand.

The solver forks the repository (or pushes a branch inside it), works from the
bounty branch and opens a pull request against it in the same repository.
Collect from the project's record:

```
node packages/box-cli/dist/cli.js bounty status <id>
node packages/box-cli/dist/cli.js bounty look <id> <number>
```

`status` lists open pull request numbers, authors and changed files, and
reads the current issue state too, so a later
session learns about a new answer from the record alone. It saves the observed
outside state and its time; the open-bounties line carries those answer facts.
If a refresh fails, status names the failure's own reason
(`github-command-failed`, `github-issue-mismatch`, …), shows the last
recorded outside state and when, and offers the `status` retry only where a
rerun could read a different answer.
`look <id> <number>` fetches the selected pull request's head without changing the
working tree, index or current branch (`--no-recurse-submodules`, so a carried
`.gitmodules` fetches nothing). Its target must be the recorded bounty branch
(`github-pr-wrong-branch`), its history must descend from the bounty branch's
tip (`github-pr-not-descended`) — there is nothing sound to compare it with
otherwise — the remote branch must still be where the tool left it
(`github-branch-changed`), its tree must hold no link, submodule or unsafe
name (`answer-unsafe-path`), and no commit it introduces may touch a
never-ship path (`answer-never-ship`) — a path planted deep in the history and
removed in the last commit still cannot land. A pull request that changes
nothing is `answer-empty`.

The report is computed with Git from the real history: the account and the
time, the commit count, files changed/added/deleted with line counts, whether
it merges cleanly onto the current branch and which paths clash if not (read
through `git merge-tree`, so the worktree and index never move), the stated
flags, and the sentence that nothing was run. `apply <id> <n>` is an ordinary
`git merge` of the pull request's commits onto the current branch — one merge
commit naming the bounty and the attempt — under the same working-tree
protections every merge has. `git revert -m 1 <merge>` reverses it whenever
you like; no tool command is needed.

**An answer from any account can be collected and applied.** The author is
recorded on the attempt as a fact — a GitHub-shaped login, nothing more — and
nothing it wrote is ever run: the fetch pulls objects only, the report reads
them, and `apply` pins attribute lookups to the owner's own tree and reads
hooks from an empty directory, so a returned `.gitattributes`, a merge driver,
a hook or a submodule declaration names no command on this host. Applying is
still a decision, not a consequence — `apply <id> <n>` is always the agent's
call.

`apply` and `close` comment the recorded fact on the issue, close it
and remove the bounty branch — a merge the next command recognises on the
bounty's branch does the same, naming the solution and the commit. If the branch carried work published only there —
the poster's unpushed commits or the work-in-progress commit — the issue names
those commits before the branch is removed, so nothing the agent published is
lost by surprise; the local work was never touched. If an outside step fails, the local decision stands and the record
names `github-decision-pending` and `close` as the command to retry. That retry resumes
outside work without repeating the local merge. `status` shows pending
work even after a bounty has ended. A `close` after an unfinished apply update
preserves both facts and finishes the issue closure and branch removal. Retry
uses the account that started the post; comments or copied listings from other
accounts cannot stand in for tool facts. This outside work finishes what was
posted whatever the owner's current decision — closing never waits — and when
that decision is not `allowed` the closing output says on one line that it
closed up on GitHub without asking, naming the standing answer.

If a push succeeds but the issue cannot be opened, the refusal is
`github-post-incomplete`. The record states the known outside state. Repeat
`post <id>` to finish; it recovers an issue whose response was lost
and never creates a second listing. To remove a partial post instead, run
`close <id>`. Nothing here sends money or posts to a bounty site.
Closing also finds and closes a successfully created issue whose response
was lost, before it clears the outside work.

Records from before this version still load. An unposted draft uses the
GitHub journey. Old delivery records can be read with `status` and ended
with `close`; collection on those records refuses as
`legacy-delivery-retired` and names `close`. Existing bounty folders beside
projects are no longer used and may be deleted by hand. The tool leaves them
alone.

## The owner's one decision

Posting, merging and closing need no approval once the owner has allowed the
tool — that is what the tool is for, and a separate approval for each would
show a control the tool does not have: an agent with Git and `gh` could do
any of it by itself. One decision remains, made once: *"my agents may use
this tool."*

The decision is kept in the owner's own settings folder on this machine,
**outside every repository** — never committed, never cloned, out of reach
of a solution, a pull request or a collaborator:

- Windows: `%APPDATA%\box\settings.json`
- elsewhere: `$XDG_CONFIG_HOME/box/settings.json`, or `~/.config/box/settings.json`
- tests and fixtures point `BOX_BOUNTY_SETTINGS_DIR` at a temporary folder.

Two files live there. `settings.json` holds only the owner's choices — the
decisions, rewards, limits, publish lists, instruction settings and merge
answers — and changes only when the owner changes them through `allow`,
`deny`, `config` or an answer to a held action; a read command never
rewrites it. `state.json` beside it is the tool's own memory — what it
already said once, the notices it showed, the migration and first-merge
records — so a command that only reads can still mark something told
without touching the owner's file; a state file the tool cannot read is
reset with one line, never a refusal, because nothing the owner decided
lives there. Both are written atomically (temp file then rename), so a
crash mid-write leaves the previous whole file.

A repository entry is keyed by its GitHub address, owner/name, with letter
case and a trailing .git normalized. Every copy on this machine is covered.
A fork, or another repository at the same folder path, is a different entry.
All fetch and push addresses must name one GitHub repository. A Git URL
rewrite that changes that destination refuses before permission or posting.
Remote names can change without changing the repository's identity.

Several remotes. A checkout can carry more than one remote and still be
allowed. Remotes that are not GitHub at all — a GitLab mirror, a company
host, a plain path — are simply ignored: the tool never reads from them,
never pushes to them, and they cannot block or fool the choice. When several
remotes name different GitHub repositories, the owner's own list decides:
the checkout is whichever listed repository its remotes name. If none of
them is listed the checkout is undecided — posting waits and names each
candidate with the exact `box bounty allow owner/name` that settles it, and
the all-projects setting never picks one itself. If more than one is
listed, the checkout refuses `repository-several-allowed` until all but one
come off the list. A remote whose fetch and push addresses name two
different GitHub repositories still refuses `github-remote-mismatch`. A yes
still covers exactly one repository, and every push goes only to the chosen
repository's canonical `https://github.com/owner/name.git` — while it is
chosen, `post`, `status`, `look`, `apply` and `close` open with
`acting on owner/name (2 GitHub remotes; the one on your list)`.

The owner has three words:

- `allow [owner/name]` adds a repository. Without a name it adds this
  repository. The disclosure says bounties are public under the owner's
  GitHub account, solutions the agent chooses are merged into the owner's
  code, and this decision covers this repository only. `--ask` means be
  asked each time before each post and before each merge — the tool's own
  merge waits for the owner's answer, and `allow <waiting-bounty-id>`
  releases it. `--reward <whole dollars>` and
  `--reward-limit <whole dollars>` set this repository's own reward and
  limit in the same breath; with neither, its bounties state $0 — a bare
  re-allow keeps what the entry already said.
- `deny [owner/name]` removes the active entry — its reward and limit go
  with it. Open bounties are untouched.
  Its dated removal stays in the settings history and blocks the all-projects
  default for that repository. Config shows 'not allowed; denied at' and the
  exact command to re-allow it. Re-allow clears the exception.
- Bare `config` prints what is in force — one line per repository: its
  address, allowed or ask, its reward, its limit, and what its open
  bounties promise now and what is left — with the commands that change
  them. Settings that are off and were never set are left out; the last
  line names `config --full` for every setting, its history and the long
  explanations. `config set all-projects true` allows all projects, except
  dated deny exceptions. It is off by default. `false` turns that default
  off; `ask` asks before each post and each merge in projects with no
  entry. `config add repositories owner/name` and `config remove
  repositories owner/name` are named refusals — `allow` adds a repository
  and `deny` removes one, one verb per action.
- `config set reward <whole dollars>` is the amount each new bounty on that
  repository states — whole US dollars, 0 unless the owner named one.
  `config set reward-limit <whole dollars>` is the most that may be promised
  across that repository's open bounties; a reward above $0 cannot be set
  without a limit at or above it, and a limit cannot sit below the reward.
  Both apply to the repository the command runs in, or to one named after
  the amount: `config set reward 10 owner/name`. Money is promised only for
  a repository the owner named — an unlisted one is a named refusal, and the
  all-projects extra never carries a reward. A posted bounty keeps the
  amount it was posted with; a change while bounties are open says so, and
  closing a bounty — merged or not — stops its amount counting. `status` and
  bare `config` show this repository's reward, its limit, what its open
  bounties promise and what is left. The first amount above 0 gets one
  plain sentence: it is a promise, made in the owner's name, that the owner
  pays by hand — the tool never moves money. A reward and limit written
  before rewards were per repository applied to nothing once this wave
  landed — the tool says once what they were, and every repository states
  $0 until the owner sets its own.

The agent is asked nothing about money. `create` and `post` take no amount
flag — each money spelling is a named refusal (`reward-agent-set`) — and a
project file claiming a reward or a limit is refused by name
(`project-claims-reward`); both live in the owner's settings only. A post
that would pass the limit refuses by name (`promise-limit-exceeded`) with
both numbers and changes nothing. The check is atomic with the record write
that binds the reward — posts running at the same time take a short lock, so
two concurrent posts cannot both pass; a post that finds the lock busy
refuses with `promise-limit-busy` and can be run again.

Nothing written grants nothing. A repository entry overrides the default.
Every change retains the previous value and its time. Legacy folder entries
are moved once to the single readable GitHub address at that path. Unreadable
or ambiguous paths are reported with a re-add command and grant nothing at
that path, even under an old blanket default. If two old paths have conflicting
decisions for the same address, that address stays not allowed until a new
decision. Migration notices and the old decision history remain visible.

Ask me each time covers posts and merges. Under `allowed` — and where
nothing is written — the tool's own merge proceeds as it always has; an `ask`
mode merge becomes a named waiting state the owner releases with
`allow <waiting-bounty-id>`, bound to the solution, its commit and the branch
tip, so a changed solution or a moved branch asks again. The owner answer to
a held merge is recorded in the owner's settings file, outside the
repository — a bounty record lives inside the checkout and could be edited
there, so nothing on it marks a merge approved. A merge the agent
lands with its own Git still closes the bounty in every mode; where the
owner's decision asked to be asked, the closing output, `status` and the pay
message state that the owner was not asked before that merge. Closing never
waits. `allow <waiting-bounty-id>` completes the held action immediately —
a post or a merge — and changes no repository permission. The first-use
message offers, in order, allow this repository, be asked each time before
each post and each merge, and this one bounty only. Bare config uses the
same choices. All-projects is not offered at first use. A later post says if
the owner previously chose one bounty only. An `ask` written before this
rule existed keeps its meaning; the tool says once that it now covers merges.

Waiting is a successful command outcome with exit status 0. No command waits
for typed input, and retrying a held post keeps its first waiting time. The
owner's permission is checked before any GitHub call; a first post still
waits if gh is absent. Allowed posts still require public repository visibility
and a signed-in GitHub account. A post under the all-projects setting says so.

The first merge of a stranger's solution asks the agent to tell the owner in
its closing message, naming the merge commit. It is a notice, never a question,
recorded once per receiving repository and shown by status. The receiving
repository's current GitHub address identifies that notice, even when the
bounty was published elsewhere. Without a usable address, the notice is
recorded locally in `.box/bounties/FIRST_MERGE` and names the local repository.
A recorded local notice still counts if a GitHub address is later added.
It grants no publication permission. `status --since <iso>`
also prints the bounties posted, solutions merged and bounties closed since
that time, plus what is waiting now. The seven old owner spellings are named
refusals with their replacements, never aliases.

**This is protection, not a lock.** The file sits where the owner's own
programs can write it; an agent that sets out to edit a file it can reach —
or to point `BOX_BOUNTY_SETTINGS_DIR` at a folder it made — could post the
same things with its own Git anyway. What the file does is stop accidents
and make every change visible with a time. It does not pretend to be a
cryptographic boundary.

A malformed settings file, or a name the tool does not know, is a named
refusal (`settings-malformed`, `settings-unknown-name`) — refused, never
ignored, on every command that reads it. A name that reaches for a hard stop
(`settings-hard-stop`) is refused the same way: **the three hard stops —
never-ship files, a private repository, the owner's standing rules — cannot
be expressed as settings or switched off by one.** The state file is the
tool's own, so its malformation is not a refusal: `the tool's own state at
<path> was unreadable and was reset` is said once and the run goes on.

## The pre-publish scan

Because nobody sees a preview any more, everything a GitHub post would
publish **for the first time** is scanned for secret-shaped content before
it goes out: the added lines of each commit not yet pushed, the tool's
work-in-progress commit when `--with-changes` is chosen, and every untracked
file `--include` names. `create` also scans the working-state snapshot so
the agent can fix a hit before `post`; a hit at `create` holds nothing and is recorded the same
way. The patterns are a small stated list, not proof of absence:

- private key blocks (`-----BEGIN … PRIVATE KEY-----`);
- well-known token and key formats (GitHub, GitLab, AWS, Slack, OpenAI,
  Google API keys, and the like);
- connection strings carrying a password (a `postgres://` URL whose
  credentials section contains `user:password@`, `Password=…` and the
  like);
- a long random-looking string assigned to a name such as `key`, `secret`,
  `token` or `password` — quoted or the bare `NAME=value` env spelling.

Ordinary code that uses the words `token` or `key` — short values, obvious
placeholders, a getter call — does not match. Stated limits of the same
kind: a token split across lines is not caught, a key block wrapped
differently (say, base64) is not caught, and **a file Git treats as binary
is not scanned at all** — the preview and the post name such files as not
scanned, which is a fact, never a hold; the owner's `never publish` list is
how such a path is kept out.

A hit makes **that one bounty** wait for the owner in a named waiting
state, naming the file and line — and the commit when the content sits in
one not yet pushed, since an ordinary push would publish it too — **never
printing the value**. The hold is recorded on the record: what was flagged
and what happened — and it stays in `status` (bare, `status <id>` and
`--full`) after the bounty ends. The record claims only what was verified:
a GitHub post ran the scan again, so it can say the flagged content changed
or sits on `safe to publish`. A finding on a legacy delivery records that
it was not re-checked. The agent's own moves are to remove the flagged content
and post again — that sends the bounty — or to stop it; the hit message
offers no owner command, because no owner answer can release a scan hold:
`allow <id>` on one is a named refusal (`allow-scan-held`). The owner
decides in `config` on two lists that live only in the owner's settings
outside the repository:

- **`safe to publish`** — `config add safe-to-publish <path>` lists paths
  the scan does not hold a bounty over, for known false alarms (a fixture
  with a made-up key). A safe-listed path still cannot carry a never-ship
  file — the rule keeps it out whatever the list says, and naming a
  never-ship path safe is refused (`publish-list-never-ship`).
- **`never publish`** — `config add never-publish <path>` is the owner's
  own addition to the never-ship table: a listed path is kept out of every
  bounty — snapshot, first-published commit, named file, returned solution.

Entries are repository-relative paths validated before the write: a path
resolving outside the repository or through a link is refused
(`publish-list-outside`, `publish-list-link`), and a project file that
claims either list is refused by name and grants nothing
(`project-claims-list`) — a solution must never widen what a bounty can
carry. `config` shows both lists and the commands that change them.

Waiting for the owner **cannot be enforced** — the owner may not act, and
content reworked until the scan passes goes out. What the tool guarantees
is that the owner is told every time, in `status` and `config`, and can
read what was published. An owner's `allow <id>` remains how permission
waits are answered — bound to what the owner was shown would be published:
if the base, the commits published for the first time, the work in
progress, the included files or what stays home changes afterwards, the
answer does not carry over (`github-preview-stale`); the tool's own
bookkeeping does not count as a change. An answer clears only what the
recorded wait named: a post held for the decision alone still runs its
scan. No setting switches the scan off — it is a protection of the owner's,
like never-ship, not a judgement on the agent.

`create` takes two required inputs and three optional ones:

- `--task <file>` is a file describing what needs doing, written for the
  solver. The project code is included automatically. Put what was tried in
  that file. `--task -` reads the same text from standard input and creates no
  task file. An empty file or empty standard input is `missing-task`; an
  input file under a never-ship path is `never-ship-input`.
- `--why "<one line>"` is required and private. Without it the refusal is
  `missing-why`.
- Optional `--title "<text>"` follows the same shortening rule as the task's
  first sentence: remove a leading Markdown heading marker, stop at the first
  sentence and keep at most 80 characters before the ellipsis.
- Optional `--resume "<context>"` saves private context for the unfinished
  work and the larger job, without a tool-defined length limit.
- `--repo <path>` selects the checkout, as it does for other commands.

`create --note`, `--job` and `--preview` refuse as `create-option-retired`
without writing anything and name their replacement. None is an alias.
`post --preview` shows the publication plan.


## Telling the agent

`box bounty` prints the cold-session overview: open work, solutions needing
attention and the next command. A solution already shown but not decided
includes its age. `describe` explains what the tool does and when it is worth
using, then generates cost and wait facts from the project records each time.
GitHub posting is public and free, and every bounty states the owner's reward — $0 by default.
With no past posted bounty it says there is no history yet. Otherwise it
reports waits from the recorded posting time to the first recorded solution
observation and how many ended posted bounties had
a solution merged. Past waits do not predict the next answer.

### Existing instruction files

`box bounty config` lists the instruction files found now. The known list,
confirmed against official documentation on 13 October 2026, is:

| Host | Files | Loading condition |
| --- | --- | --- |
| [Codex](https://developers.openai.com/codex/guides/agents-md) | `AGENTS.md`, `AGENTS.override.md` | The override takes precedence in a directory. |
| [Claude Code](https://code.claude.com/docs/en/memory) | `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md` | Project instructions loaded at startup. |
| [Cursor](https://cursor.com/docs/rules) | Existing `.mdc` files under `.cursor/rules` | Only `alwaysApply: true` guarantees every chat; other rules are conditional. |
| [Gemini CLI](https://geminicli.com/docs/cli/gemini-md/) | `GEMINI.md` | Default workspace context filename. |
| [GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions) | `.github/copilot-instructions.md` | Repository instructions for supported enabled features. |

Discovery checks these project-root files and existing rule files on every
invocation. It stores no discovered file list. Nested or differently named
instruction files can be selected explicitly. The owner enables maintenance
once for this checkout with:

```text
box bounty config set instructions true
```

This adds one identical block to each existing file found. It creates no
instruction file and changes no original bytes outside its marked block.
Front matter, other tools' blocks and line endings outside the block stay as
they were. A damaged block, a link or an unsafe path is a named refusal for
that file; other safe files still update. The registry declares which files
support documented `@relative/path` imports. In those files, inline references
outside Markdown code spans and code blocks keep the block in the imported
file once. Ordinary references in files without import support do not suppress
their block. Imports are resolved relative to the importing file.
The importer names that fact in config output. Cyclic imports are refused.

For any other host or custom filename, choose an existing file inside the
checkout — never one inside `.git/` or `.box/`, which belong to Git and to
this tool and are refused as `instruction-file-tool-owned` — then enable
maintenance:

```text
box bounty config set instruction-file path/to/instructions.txt
box bounty config set instructions true
```

The maintenance choice and optional custom file live in the owner's
`settings.json` outside the repository. They grant no publication permission.
`box bounty config set instructions false` stops maintenance and keeps existing
blocks. A newly appearing instruction file gets a once-only notice from
`status`, with the command to add the block; nothing adds it automatically.
Private notice acknowledgements store hashes, not a discovery list.

The block says the tool exists and points to `box bounty describe`. With
nothing open it has no activity line. With open work it says exactly
`a bounty is open; \x60box bounty\x60 shows more.` With a new solution it says
`a bounty has a new solution; \x60box bounty\x60 shows more.` New means no agent
in this project has been shown it. Once shown, the first wording returns.
No count, identifier, title, account, branch, stage or foreign text enters
the block. Its canonical bytes use LF in every file.

These lines are only as fresh as the last time the tool looked at GitHub.
Nothing runs in the background. The detailed local listing in
`.box/bounties/OPEN` remains separate from the instruction block.
`describe --rules` prints the current fixed block as a template.

### Awareness at fixed moments — the hook

An agent that forgets to run `status` still misses arrivals. On hosts that
run a command at fixed moments, the owner can switch on the hook:
`box bounty hook on --host <devin|claude>` prints a complete disclosure —
what the entries run, which files they read and write, what the context
costs, what may follow (including that a recognised merged solution closes
the GitHub issue with a comment — under `allowed` nobody is asked; under
"ask me each time" a hand merge still closes and the closing output states
the owner was not asked — while publication is allowed), what it never does
and how to stop it — and writes nothing until
the same command is repeated with `--confirm`. `box bounty hook` reports
per-host state; `box bounty hook off --host <name>` removes exactly the
entries it wrote and restores the settings file byte for byte.

The entries the hook installs call one shared command, `box bounty hook
start|pause|finish`, at the host's start, next-prompt and finishing slots:

- **start** shows the open-bounty state on one line — ids, stages, counts —
  and nothing when no bounty is open;
- **pause** and **finish** announce what arrived during the session, once
  each — a new solution, and at finish a merge conflict still waiting;
- every other moment the command prints nothing at all.

The agent's context only ever carries tool-generated facts — never a title,
account name, branch name or issue body a stranger chose. What was already
announced is kept in `.box/bounties/`'s sibling `.box/hook-told.json`, so an
event is announced once across sessions, and `.box/hook-on.json` records
what `hook on` created so `hook off` restores the file exactly. GitHub is
asked at most once every five minutes while an open bounty is posted
there, each call capped at eight seconds, and one run's calls bounded to
eight calls inside twenty seconds — a GitHub that paginates or hangs
cannot hold a session — and the host entry itself times out — a hook
never blocks a session, waits for input or exits non-zero.
Reading records recognises a merged solution as any record read does, so
under the standing rules the hook can close a GitHub bounty with a comment
— the disclosure says what that means under the decision in force before
anything is written.

Host support is limited to the hosts whose hook format was verified against
installed documentation on this machine: Devin CLI (`.devin/hooks.v1.json`)
and the Claude Code settings format (`.claude/settings.json`). A session
actually firing these entries was not live-proven on this machine — the
wiring is written to the documented format, nothing more.

### Retired project limits

`.box/limits.json` is no longer read, rewritten or deleted, even if malformed.
The tool reports its presence once and says it can be deleted. If you used
`rulesFile`, re-enable maintenance and re-select any custom file using the
commands above. `allowedDestinations` and `reminders` are dropped; `cost` and
`expectedAnswer` now come from facts. Everything the owner configures lives
in the owner's settings outside the repository.

## The record — the bounty outlives the agent

`create` also writes `.box/bounties/<id>.json` inside the repository and prints
its path. The tool writes the file; committing it is the agent's normal flow.
The record holds the id, title, the snapshot identifier
(commit + tree + base), the public task and generated note facts, and the stage
history — one event appended per transition, never rewritten:

```
drafted → posted → taken → answered → applied
    ↘ waiting — an action held for the owner: the first post with nothing
      written or "ask each time" written, a post held by the pre-publish
      scan or a named untracked file, an outside close held under
      "ask each time"
(ended early: rejected, withdrawn, expired;
 an applied merge is reversed with ordinary git — the record
 stays applied; older records carry `confirmed` and `undone`
 stages and still load — a `confirmed` record's written yes
 stands and the bounty posts)
```

`answered` is a waiting stage, not an ending: every answer lands there —
nothing is run and nothing is merged until `apply` runs — and an answer that
is not chosen does not end the bounty either; it stays a numbered **attempt**
while more can come back. Every answer is kept: `record.attempts[]` holds
each one's commit, change, outcome, conflict paths and report; `status` lists
them all. Records written before attempts existed — a single `answer` on the
record — load as attempt number 1 and still apply.

Records written while checks existed still load. They carry a `level` and
check outcomes (`verified`, `check-failed`, `check-unrunnable`,
`check-not-run`); `status` prints each as the history it is — "the declared
check exited 0 on it (checks were removed on 11 October 2026)" — never as a
promise about the current code, and no new record writes a level.

`status` lists open bounties first and names the next step. Ended ones are
compact lines. The public task is held directly in the record; old note and
job files remain readable. Private `--resume` context and the required
`--why` line never enter an issue.

`refs/box-bounty/<id>` pins the working-state snapshot while the bounty is
open. Each collected pull request is pinned under
`refs/box-bounty/<id>-answer-<n>`. Ended stages remove those durability refs.

## The commands after create

- `post <id>` publishes the issue and bounty branch on GitHub, after the
  owner's standing decision, private-repository hard stop and secret scan.
  `post <id> --preview` publishes nothing and shows the same plan.
- `look <id> <n>` collects pull request `n` when needed and shows the
  solver's diff, marked as theirs. `--full` prints a large change.
- `apply <id> [<n>]` collects when needed and merges the chosen solution.
  Several applicable attempts require a number, with `apply-ambiguous`
  naming the choice. Unknown numbers are `unknown-attempt`.
- `close <id> [--reason "<text>"]` ends any open bounty. A supplied reason
  records `rejected`; otherwise it records `withdrawn`. An empty reason
  refuses as `missing-reason`. Repeating close reports the ended state and
  retries any owed GitHub cleanup.
- `hook` is the owner's opt-in awareness hook, described above.

## The answer comes back

The solver opens a pull request against the bounty branch. The tool reads
fetched objects, checks descent from the published commit, refuses hostile
paths and never-ship content throughout the new history, and refuses an empty
change. It records facts without executing any solver program.

**Collection reports facts, never a verdict.** A wrong fact is a bug we can
find; a wrong verdict misleads and cannot be traced — so the report is policed:
no "correct", "safe", "good", "recommended", "should accept" or
"should reject", in any outcome, and a test keeps it that way. The report
states only what was observed:

- `report — attempt <n> for <id>` — which answer this is;
- `from:` — who sent it (the GitHub account name) and
  when it arrived;
- `change:` — changed/added/deleted path counts and lines added/removed;
- `current code:` — a dry merge read (`git merge-tree --write-tree`) of the
  answer against the current branch, with the conflict paths when it would not
  land — the worktree, index and `HEAD` never move for the read;
- `flag:` lines — eager observations, never blocks: the answer touches a file
  the stated rule marks as a test; files were added or deleted; the change is
  above the stated size;
- one always-present sentence — `nothing in the solution was run and this
  report says nothing about whether it works`;
- `next:` — the exact next command.

Every answer lands at `answered` and **stops** — nothing is merged; `box
bounty apply <id>` is the recorded decision, or `close <id> --reason "<why>"`
ends the bounty with its reason. More answers are attempts 2, 3, … and `status` lists them all.
When several attempts could apply, `apply` names them (`apply-ambiguous`) and
`apply <id> <n>` picks one — any attempt may be named, whichever account it
came from.

**Applying is a real git merge, never a file write.** The change becomes a
commit on the snapshot's base commit — the base tree plus the extracted delta
(built on a temporary index — the worktree and real index are never touched),
so the incoming side of the merge is the solver's change alone — and
`git merge` brings it onto the current branch as a merge commit whose message
names the bounty and the attempt. A conflict aborts the merge — the worktree
and index come back byte-identical — and the record keeps its stage with the
conflicting paths as the next step; fix them, commit, and `apply` retries, or
`close <id> --reason "<why>"` ends it. Work the merge would overwrite is refused by name
(`apply-worktree-dirty`) before it can run — uncommitted content on a touched
path, and any file that exists at a touched path but is not in the index (an
ignored file the merge would silently clobber) — never damaged. Applying one
attempt ends the bounty and removes every answer ref.

## Reversing an apply

The merge `apply` makes is one ordinary commit on the current branch, naming
the bounty — `git revert -m 1 <merge>` reverses it as a new commit whenever
you like, under your own Git settings. The tool has no `undo` command; a
revert is history you own, not a bounty transition, so the record stays
`applied` and the bounty stays ended.

## The note writes itself

`create` composes a private note from evidence it
gathers itself: the files the working state already changed
relative to `snapshot.baseCommit` — named when they are part of the shipped
set, a moved submodule is labelled `submodule changed`, and a file the working
state deleted is named when no never-ship rule would have kept it out; a path
a rule covers is never named inside the bounty. Live paths are judged on the
canonical path — the one shipping was decided on — never the diff's spelling,
and renames are unfolded so a rename's source is still classified. A deletion
is judged by the base tree's own spellings instead: what the owner committed,
never what now occupies the path — a link planted where the file was cannot
rename the loss after its target, and a base file that ships only as a link's
view of another tracked path is named as gone — whether the link leaves the
diff silent (same bytes) or turns the deletion into a modification (different
bytes), and a rule-covered canonical never suppresses a rule-free base
spelling's change.
When every differing path is one that does not ship, the note says the state
differs only outside the shipped set — never that the tree matches the last
commit when it does not.
The composed note is marked `tool-written` in the record and says so in
its first line. Gathering never crashes `create`: a repository with nothing
to report gets a plain note saying so. Older authored public notes remain
readable.

## The publication preview

`post --preview` is the only publication preview: the bounty branch commit,
commits not yet pushed and which uncommitted work stays home, computed at
the moment that matters — a plan worked out at create could be stale by
post time. Never-ship removals are stated. No source copy or file count is
written beside the project.

Create drafts a local record only: it needs Git, starts no `gh` and makes
no network call, and states nothing about what posting would publish —
`post` works that out and shows the plan before anything becomes public.
That holds when `gh` is missing, not signed in or GitHub cannot be reached.

## Checks were removed

On 11 October 2026 the owner removed checks from the tool: a bounty is the
task, what was tried, the why and the code, and judging a solution is the
agent's or the owner's work — never the tool's. `--setup`, `--check` and
`--guard` are each refused by name (`checks-removed`) so an agent reusing an
old command line learns why; the `mechanical`/`reviewed` level is gone with
them, from new records and issues. Old records
written before that day keep their keys on disk and still load — readers
ignore what no longer exists, and an old record's check outcome is printed as
dated history, not as anything about the current code.

## The snapshot identifier

`snapshot.commit` in the local record is a real commit object parented on
HEAD, recording the full working state. A temporary index records it with
`read-tree`, `add -A`, `write-tree` and `commit-tree`; the real index,
working tree and branch remain unchanged. Owner clean filters run as they do
for an ordinary commit, so this snapshot holds Git's stored byte form.

`snapshot.tree` identifies that tree and `snapshot.baseCommit` identifies
the original HEAD. The local `refs/box-bounty/<id>` bookmark prevents pruning
while the bounty is open. Removed never-ship bytes remain reachable in the
local snapshot; publication independently enforces the boundary on what goes
to GitHub. The snapshot is unchanged by retiring delivery.

## Never-ship

Built in, not overridable in this wave, checked on each file's **real path**
(realpath-resolved, case-folded) so spelling, case and links cannot bypass it:

- `dot-git` — any `.git` path segment
- `dot-env` — `.env`, `.env.*`, `.envrc*` basenames, and env-file spellings
  ending in `.env` (`prod.env`, `staging.env`). `.env.example`-style suffixes
  count too — templates carry real values often enough.
- `secrets-dir` — any path segment containing `secrets` (`secrets/`,
  `secrets-backup/`, `mysecrets/`); deliberately plural so `secretary/` and
  `secretariat/` do not match
- `runtime-dir` — any `.runtime/` segment
- `dot-box` — any `.box` path segment: the tool's own records under
  `.box/bounties/` never ship inside a later bounty. Exact segment only, so
  `.boxignore` itself still ships (and still means nothing to this rule).
- `private-key` — `*.key *.pem *.p12 *.pfx *.jks *.keystore *.ppk *.gpg`,
  and any basename starting `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519`
  (`id_rsa.pub`, `id_rsa_backup`, `id_rsa.old` all count)
- `certificate` — `*.crt *.cer *.der *.cert *.p7b *.p7c *.asc`
- `credentials-file` — `.netrc .pgpass .htpasswd .git-credentials .npmrc .pypirc .dockercfg .yarnrc .yarnrc.yml`, `.aws/credentials`, `.docker/config.json`
- `owner-list` — patterns from `.boxignore` at the repository root:
  `name` (file or dir, any depth), `name/` (dir contents), `*.ext` (basename
  glob), `dir/*.ext` (root-anchored glob), `/exact/path`. `#` comments, no `!`
  negation — patterns can only remove, never re-include. Like every other rule,
  patterns match case-folded on the canonical path.

A link or junction inside the repository that resolves **outside** it is refused
by name (`link-escape`) — never followed. A snapshot path that cannot be read
(broken link, link to a directory, vanished mid-scan) is `unreadable-path`.

**Limit:** never-ship matches names, not contents — a secret inside an
ordinary-looking file name still ships. The pre-publish scan (above) catches
secret-shaped content only in what a GitHub post publishes for the first
time. `.boxignore` is the catch-all for paths, plus the owner's `never publish` settings list,
which joins this same table from outside the repository.
