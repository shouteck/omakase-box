# `box bounty` — the first five minutes

**What it does.** An agent hands a task it cannot or should not do to outside
solvers: the tool packages the task, what the agent tried, and the code into a
GitHub issue on the repository — never into a private one. Solutions come back
as pull requests the agent reads and judges; the chosen one is merged onto the
current code and can be undone with ordinary Git. Nothing a solver wrote is
ever run by the tool, and the tool never decides whether a solution is right.
On your machine it writes each bounty's record under `.box/bounties/` in the
project, and the owner's answers in a settings folder outside it (see
"Removing everything").

## Install

Node 22.13 or later, Git 2.40 or later, and the GitHub command line `gh` 2.0 or
later are required; the tool checks all three at start and says what is missing
and where to get it.

Run it once, with nothing installed:

    npx box-bounty bounty help

Or install it so `box` is a command:

    npm install -g box-bounty
    box bounty help

(`box-bounty` is the package's provisional name, pending the owner's publish
decision.) `npx` and npm run in the project folder and read its npm settings
and `node_modules`, so run the tool only in projects you trust. Node is from
<https://nodejs.org>, Git from <https://git-scm.com>, `gh` from
<https://cli.github.com>. Sign in to GitHub once:

    gh auth login

The tool uses that sign-in; it never sees, stores or asks for a credential.

## The first bounty

In a public GitHub repository you own or may post to, write the task for the
solver in a file, then:

    box bounty create --task TASK.md --why "why you are handing it off"
    box bounty post <id> --preview

`--preview` shows exactly what becomes public: the issue text, the branch, and
any of your commits that were not already on GitHub. Posting needs the owner's
one-time permission; if it is missing, `post` waits and prints the line to put
to them — for a repository they own the answer is:

    box bounty allow owner/project

Then `box bounty post <id>` posts the issue and pushes the branch. Solutions
arrive as pull requests: `box bounty status` lists them, `box bounty look <id>
<n>` collects one and shows its change (marked as the solver's words, never the
tool's), `box bounty apply <id> <n>` merges it onto the current code, and
`box bounty close <id>` ends a bounty with nothing merged.

## What becomes public, and what never does

Public: the task, the one line of why, the bounty branch's commits, and a
machine-readable block on the issue (the `box-bounty` issue format, versioned
separately from the tool's own version). Never public: files on the never-ship
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

`box bounty hook on --host <name>` (`<name>` is `devin` or `claude`) writes a
small entry for your agent host so sessions are told when a bounty has news;
it asks what it will do first and writes only after `--confirm`. It costs a
bounded number of `gh` calls at session start, pause and finish. `box bounty hook off --host <name>` removes
it; `box bounty hook` shows whether it is on.

## How to stop it

- `box bounty deny owner/project` — stop posting for that repository; drafts
  can still be made, nothing more is posted until `box bounty allow`.
- `box bounty hook off --host <name>` — sessions are no longer told about
  bounties.
- `npm uninstall -g box-bounty` — the tool is gone (below).

## Removing everything

    npm uninstall -g box-bounty

What the tool wrote stays where it was written, and nothing of it is required
to keep working: each project's own bounty records are in `.box/bounties/` in
the repository (delete the folder to forget them), and the owner's answers and
the reward setting are in the settings folder — `%APPDATA%\box` on Windows,
`~/.config/box` elsewhere, or `BOX_BOUNTY_SETTINGS_DIR` when set. Delete that
folder too and every trace of the tool is gone. Posted issues and branches on
GitHub are closed and removed by `box bounty close`, or by hand.
