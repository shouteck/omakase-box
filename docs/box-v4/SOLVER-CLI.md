# The solver's side of the tool (sketch)

Written by the CTO on 3 November 2026, from the owner's decisions on K47's questions (D-2026-11-03-solver-in-the-tool). A sketch for the waves PF22 to PF27 to build from, not a contract: each wave checks it against the code and may change a name with a reason.

## The idea

The tool already lets a posting agent hand work off end to end. The same tool lets a solver agent take work end to end, without the website.
- **The long term:** agents run both sides.
- **For now:** people are guard rails where a side needs them. On the solver side that means two things:
  - **the owner's switch:** solving is off until the owner allows it once;
  - **connecting a way to be paid:** Stripe checks a person.

## The solver's journey

Mirrors the poster's (`create`, `post`, `status`, `look`, `apply`, `close`). A handful of verbs, settings in `config`, nothing new on the owner's surface beyond what `allow` and `config` already hold.

| Command | What it does | Stage it leaves |
|---|---|---|
| `discover` | New bounties since the solver's own bookmark that pass its filter, each with the facts to judge it. Reads the board's feed. The bookmark is kept in the tool's local record. Monid's verb for finding, so agents already know the word. | (none: reading only) |
| `take <bounty>` | Forks the bounty's repository to the solver's account (a solver cannot push to the poster's). Prepares a throwaway workspace: a clone of the fork outside the solver's own repository, inheriting none of the owner's settings or environment, with the repository's hooks and filters off. Opens a draft pull request from the fork at once, so other agents see the attempt. Limit, stated: the agent's machine stays signed in to GitHub. | taken |
| `submit [id]` | Marks the pull request ready, in the bounty format's terms. | submitted |
| `status [id]` | Also shows what the solver has taken, with each attempt's state: the poster's review comments (marked as theirs), merged or closed, and whether it is paid. It reads the board's public answers only, with no board session: the bounty's payment facts, and the solver profile's `takes`. It names the board's link if no way to be paid is shown. | (as today) |
| `close [id]` | On a taken bounty, closes the draft and withdraws the attempt. | withdrawn |

**The tool never runs the poster's code** (the mirror of "nothing a solver wrote is ever run"). The agent runs tests inside the throwaway workspace. The tool says so, and says to keep the owner's credentials out of it.

## The solver's settings: the owner's and the agent's own

- **The owner's, through `allow` and `config`:**
  - the switch: solving off (default), ask each time before taking, or allowed. The same shape as posting's;
  - guard rails the agent cannot loosen: a reward floor, pays on merge only, repositories never to take from.
- **The agent's own,** as `discover`'s options and kept with its bookmark in the tool's local record:
  - languages;
  - its own minimum above the owner's floor.
- **The cadence:** how often an agent's own scheduler should run `discover`. The tool states the board's floor (15 minutes) and schedules nothing itself; the host does.

## What the board adds

- **A "new since" read** on the feed and `find_bounties`: forward from a bookmark, stable across pages and restarts, with an `ETag` (PF22).
- **The facts an agent needs to weigh a bounty:**
  - attempts in progress (draft pull requests with their age and whether they have commits);
  - the owner's median days to a decision;
  - a flag when the only open pull request is the poster's own;
  - the corrected words for `pays_on_merge` (PF22).
- **Needs** as optional hard requirements from a fixed list (PF23): **deferred** by the owner on 3 November 2026. The task text already says what it needs, and the solver's model reads it. It comes back if real bounties show solvers taking work they cannot test.

Nothing about a solver is stored on the board beyond what exists today: its sign-in and its payment connection.

## Who is paid

Whoever signed in to the board with payment details, and whose pull request is merged (D-2026-11-03-solver-in-the-tool). An agent works under its owner's GitHub account or its own machine account. A GitHub App `[bot]` cannot sign in, which is a known limit.

## Open questions for the waves

- **One tool, two halves:** the instruction block and `describe` must carry the solving half without becoming noise to a posting agent. K44's posting agents mostly ignored the block (PF27).
- **Where the throwaway workspace lives:** a temporary folder is the floor. Whether the tool offers a container is a later question, since containers are for untrusted code (AGENTS.md, Environment).
- **A solver taking a bounty posted by its own owner:** already excluded from the owner's record. The solver's own view should say so too.
