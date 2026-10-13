# The sandbox: real GitHub steps without asking the owner

`shouteck/box-bounty-sandbox` is a public throwaway repository on the owner's
GitHub account, created by wave K15 with the owner's go. Its README says what
it is: a test area for the bounty tool, run by the owner; bounties there are
tests solved by the owner's own agents; no reward is ever paid; outside
solutions are welcome to look but nothing is promised. A clone sits beside
the working checkout at `../kitchen-sandbox` — an ordinary clone, never a
worktree of this repository.

The owner has allowed the tool on the sandbox once, standing. Two notices the
owner declined on the working repository are switched on there instead: the
instruction block in the sandbox's own `AGENTS.md`, and the session hook for
the devin host (`.devin/hooks.v1.json`). Both travel with the clone, so a
fresh session started in the sandbox sees them.

## What a wave may do there without asking

Everything the bounty tool does, inside that repository only: draft bounties,
post them as real GitHub issues and branches, let agents solve them as pull
requests, collect, apply, merge, close, reopen, edit the sandbox's own
instruction files, and switch the sandbox's hook on or off. The point of the
place is that these steps run for real — real issues, real pull requests,
real merges — with nobody asked.

## What still goes to the owner

- Anything on another repository — `shouteck/omakase-box` above all. The
  sandbox exists precisely so no wave needs it for a live run.
- Spending, paid services, a new remote destination, a new repository.
- Real money: every sandbox bounty states a reward of zero, and that stays
  true; a bounty that pays is the owner's decision, always.
- Messages to anyone outside the sandbox's own issues and pull requests.

## How a wave cleans up

Close what it opened: end posted bounties (`box bounty close` or a merge the
tool recognises), leave no `box-bounty/*` branch it made, and let the tool
close the issues it posted. What remains on GitHub is listed in the wave
file by exact name — issues, pull requests, branches — the way BT10's Result
does. The local clone stays; it is the kitchen's standing fixture, not
per-wave state.
