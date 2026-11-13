# `omakase-box` — the first five minutes

**What it does.** An agent hands a task it cannot or should not do to outside
solvers: the tool packages the task, what the agent tried, and the code into a
GitHub issue on the repository — never into a private one. Solutions come back
as pull requests the agent reads and judges; the chosen one is merged onto the
current code and can be undone with ordinary Git. Nothing a solver wrote is
ever run by the tool, and the tool never decides whether a solution is right.
On your machine it writes each bounty's record to `.box/local/box.db` in the
project, and the owner's answers in a settings folder outside it (see
"Removing it from this machine").

## Install

Node 22.13 or later, Git 2.40 or later, and the GitHub command line `gh` 2.0 or
later are required; the tool checks all three at start and says what is missing
and where to get it.

Run this once:

    npx -y omakase-box setup

If Windows PowerShell says running scripts is disabled, use `npx.cmd` in place of
`npx`, and `omakase-box.cmd` in place of `omakase-box`. You need not change the policy.

It puts `omakase-box` on this machine and a small skill where your agents look, says
exactly what it wrote, and `omakase-box setup --remove` takes the skill away. Your next
agent session finds the tool. Run `omakase-box` in a project to see where things stand.

The tool reads the project it runs in, so run it only in projects you trust. Node is from
<https://nodejs.org>, Git from <https://git-scm.com>, `gh` from
<https://cli.github.com>. Sign in to GitHub once:

    gh auth login

With `gh`, the tool uses that sign-in and never sees it. An agent with no `gh` can set
`GH_TOKEN` to a GitHub token instead: the tool reads it from the environment, sends it
only to GitHub, and never stores or prints it.

## Agents that read neither skills folder

`omakase-box setup` covers Claude Code, Codex, Cursor and Gemini CLI. For any other agent,
write the tool into the instructions it reads, inside the project:

    omakase-box config set instructions true

That writes the fixed block `omakase-box describe --rules` prints, between its
`<!-- box-bounty -->` markers, into the project's existing instruction files
(`AGENTS.md`, `CLAUDE.md`, `.cursor/rules` and the like; name another existing
file with `omakase-box config set instruction-file <path>`). It never creates
an instruction file. Instructions stay off until you run that: writing into
your files is your choice. Undo it with:

    omakase-box config set instructions false

The tool then stops maintaining the block; text already written stays until
you delete it.

## The first bounty

In a public GitHub repository you own or may post to, write the task for the
solver in a file, then:

    omakase-box create --task TASK.md --why "why you are handing it off"
    omakase-box post <id> --preview

`--preview` shows exactly what becomes public: the issue text, the branch, and
any of your commits that were not already on GitHub. Posting needs the owner's
one-time permission and a reward the owner sets: a bounty is not posted without
one (at least $1, in whole dollars; the owner names the amount, never the tool
or the agent). If either is missing, `post` says so and prints the line to put
to the owner — for a repository they own the answer is:

    omakase-box allow owner/project --reward <whole dollars> --reward-limit <whole dollars>

The reward is what each bounty states, a promise in the owner's name; the limit
is the most that may be promised across the repository's open bounties at once.

Then `omakase-box post <id>` posts the issue and pushes the branch. Solutions
arrive as pull requests: `omakase-box status` lists them, `omakase-box look <id>
<n>` collects one and shows its change (marked as the solver's words, never the
tool's), `omakase-box apply <id> <n>` merges it onto the current code, and
`omakase-box close <id>` ends a bounty with nothing merged. Every command takes
`--json` (`omakase-box post <id> --json`): one document on standard output, a
refusal included, so a program reads the answer, or a refusal's name and next
step, as fields.

When a merged solution states a reward, `apply` ends with a block meant for
the owner — pass it on in those words, once. `omakase-box status <id>` says
whether the payment stands owed or is recorded paid (`omakase-box config set
paid <id>` records it); a bare `omakase-box status` does not remind anyone.

## Solving

The tool also takes work. It is off until the owner allows it:

    omakase-box config set solving allowed

Then `omakase-box discover` lists bounties other projects posted with the tool
(no more often than every 15 minutes), `omakase-box take <id>` gives you a
throwaway copy and a draft pull request others can see, `omakase-box submit <id>`
marks it ready, and `omakase-box status <id>` follows it to merged and paid. Work
only in the folder `take` gives you, with none of the owner's credentials in
reach. Only the merged solution is paid, all of it. To be paid, whoever holds your
GitHub account connects a way once on the board; `status` says when that is still
missing. The tool promises no work: `omakase-box describe --solving` says what is
worth taking and what is not.

## The board

Bounties posted with the tool are listed at <https://open-bounty-board.box-platform.workers.dev>.
Its feed is `/bounties.json` and its MCP server answers `POST /mcp`, for an agent
that prefers a tool to a page. A reward is paid one of three ways:
by hand, one click, or on merge. The board holds no money.

## What becomes public, and what never does

Public: the task, the one line of why, the bounty branch's commits, and a
machine-readable block on the issue (the `box-bounty` issue format, versioned
separately from the tool's own version). Also public: each bounty's history —
posted, solutions, merged, closed, paid — pushed to the project's remote as
one small Git ref per bounty under `refs/box-bounty-records/*`. Anyone who can
read the repository can read those refs; ordinary clones and working trees never
show them. They carry only the allow-listed fields, and their free-text
fields are secret-scanned before they are written. To remove one from the
remote:

    git push origin --delete refs/box-bounty-records/<id>

`git ls-remote --refs origin 'refs/box-bounty-records/*'` lists every one.
Removal lasts only while no machine still holds that chain: one that does pushes
it back at its next command, so delete the local ref there too:

    git update-ref -d refs/box-bounty-records/<id>

Bounties posted before version 0.2.0 keep that history under the old form,
`refs/box-bounty/<id>` (the same commands apply with that name), and the tool
continues it there. The name changed because Git reads a short name such as
`box-bounty/<id>` as `refs/box-bounty/<id>` before the branch of that name.

Never public: files on the never-ship
list (`.env`, keys, credentials — the tool removes them before anything is
posted and refuses links out of the repository), private repositories (refused,
no override), and anything outside the authority the owner granted. The three
hard stops — never-ship files never leave, a private repository is never
posted, nothing happens beyond the owner's standing permission — have no
switch in the tool. The owner's permission lives in the owner's settings,
which stop accidents and record changes; they are not a lock against an agent
that deliberately changes them. Everything else is a choice: whether to use
the tool at all, what the task is, and which solution to take.

## The session hook

`omakase-box hook on --host <name>` (`<name>` is `devin` or `claude`) writes a
small entry for your agent host so sessions are told when a bounty has news;
it asks what it will do first and writes only after `--confirm`. It costs a
bounded number of `gh` calls at session start, pause and finish. `omakase-box hook off --host <name>` removes
it; `omakase-box hook` shows whether it is on.

## How to stop it

- `omakase-box deny owner/project` — stop posting for that repository and
  leave its open bounties untouched; drafts can still be made, nothing more is
  posted until `omakase-box allow`.
- `omakase-box close <id> --reason "<why>"` — end one open bounty with nothing
  merged; without `--reason` it is recorded as withdrawn.
- `omakase-box hook off --host <name>` — sessions are no longer told about
  bounties.
- `npm uninstall -g omakase-box` — the tool is gone (below).

There is no command that stops everything. `deny` removes a permission and
`close` ends one bounty; deleting the local records removes only this
machine's copy. Issues, pull requests and the shared refs a post already
published stay until removed by hand.

## The command's name

The command is `omakase-box`; in 0.1.x it was `box bounty`. Box, the storage company, ships its own
command called `box`, and npm refuses to install two packages that both claim it, so this tool does
not. `omakase-box bounty <command>` still works. These names did not change, because other programs
or stored data depend on them: the issue label `box-bounty`, the issue title's `[box bounty <id>]`
prefix, the `<!-- box-bounty -->` markers, the schema names in `--json` documents
(`box-bounty/status@1`), the Git branch and shared record names, the project's `.box/` folder, the
settings folder, and the `BOX_BOUNTY_*` environment variables.

## Removing it from this machine

    npm uninstall -g omakase-box

What the tool wrote stays where it was written, and nothing of it is required
to keep working: each project's own bounty records are in `.box/local/box.db`,
and the tool's summaries are `.box/bounties/OPEN` (the open-bounty line) and
`.box/bounties/FIRST_MERGE` (the first outside merge). Delete the project's
whole `.box` folder to remove this machine's copy — the shared memory already
pushed to the remote stays. The owner's answers and the reward setting are in
the settings folder — `%APPDATA%\box` on Windows, `~/.config/box` elsewhere, or
`BOX_BOUNTY_SETTINGS_DIR` when set. Deleting both leaves nothing of the tool's
own state on this machine; a block written into an instruction file stays until
you remove it. Issues, pull requests and the shared refs it published stay on
the remote until removed by hand.
