# BT11a: a bounty states the owner's reward

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch · Branch: `wave/BT11a` · Timebox: 120 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Written by the CTO on 13 October 2026**, the first half of the old BT11, rewritten clean against the tool as it stands after BT10. The decisions are the owner's (11 to 13 October 2026). The second half, the solver's payment link, is [BT11b](BT11b.md). The head chef checks names against master at dispatch.

> **Dispatch, 13 October 2026 (Devin host).** Owner named BT11a after K15. Base `a15c60d`. Names checked against master: `format.ts` pins `schemaVersion: 1`, `reward: {amount:0,currency:'USD'}`, `terms:'merged-solution-earns-whole'` — the version bump lives there; `create.ts:280` and `github.ts:936` emit the `reward: $0` listing line; owner `config` surface exists per BT8a. No real-GitHub step; the sandbox exists for BT11b. The two-agent relay check (K15's standing method) is the UX lens — 5 runs, relayed sentences word for word in the Result (learned at K15 review: persist them, do not summarize).

## What is true today

Every bounty states $0. The public format's version 1 accepts no other amount. The owner's settings hold their allowed repositories and two lists, shown and changed through `config`; nothing about money.

## Outcome

The owner states one reward and every bounty carries it, in the listing a person reads and in the block a program reads. The agent is asked nothing about money. What is promised at any moment cannot pass a limit the owner set.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`, `docs/box-v4/BOUNTY-FORMAT.md`.
- Read for context: PLAN.md ("The three hard stops", "Other rules of the product"); the Results of `waves/BT8a.md` (`config`, `allow`, the first-use message) and `waves/BT10.md` (the block, the format page, the outside reader); `kitchen/stations/packaging.md`.
- Do not touch: anything about a payment link or who is paid (BT11b); the never-ship table; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network. The K14 start budgets are re-measured and stated.

**The reward**

- One setting in the owner's `config`: the reward each bounty states, in US dollars as a whole number, 0 by default. No command is added. Bare `config` shows it with the command that changes it.
- Every bounty posted carries the amount in force at posting, in the listing and in the block. A bounty keeps the amount it was posted with; changing the setting changes later bounties only, and the tool says so when it changes while bounties are open.
- **The agent is asked nothing about money.** No command, flag or file lets an agent choose, change or raise an amount, for one bounty or for all. A reward claimed from inside the project is refused by name and grants nothing.
- The tool states no preference about amounts and suggests none.

**The limit on what is promised at once**

- A second setting: the most that may be promised across open bounties. The tool refuses to accept a reward above 0 without it, and says why.
- A post that would pass the limit is a named refusal that says both numbers and changes nothing.
- The limit counts open bounties only: when a bounty closes, merged or not, its amount no longer counts. The tool keeps no record of what was paid and has no command for it.
- `status` and bare `config` show the reward, the limit, what open bounties promise and what is left.

**Asked as part of the one decision**

- The first-use message and `allow` state the reward each bounty will carry and how to set it. Leaving it at $0 is a valid answer and needs no number. An owner who names an amount above 0 is asked for the limit in the same breath.
- An owner who allowed the tool before this wave is not interrupted: their bounties keep stating $0, and the tool says once, as a fact, that a reward can now be set and gives the command. No bounty is held to ask.
- The first time the owner states any amount above 0, the tool says once, in plain words, what that is: a promise, made in the owner's name, that the owner pays by hand. The fourth fact joins the three the agent is asked to pass on at first use: what each bounty promises to pay.

**The public format**

- The block's `reward` field carries the amount. The format's version changes, the page says what changed, and a version 1 block still reads. The outside reader that uses none of our code reads both. `terms` is unchanged: the merged solution earns all of it.
- The listing a person reads states the reward plainly and, above $0, that payment is the poster's to make by hand and that posting a solution does not guarantee it. A test pins the wording: no sentence promises payment, timing or selection.
- `describe` gains the money side of when a bounty is worth it, in a sentence or two, generated from the setting.

**Cases that must fail, each a named refusal that changes nothing:** an amount that is not a whole number of dollars at or above 0; a reward above 0 with no limit; a limit below the reward; a post that would pass the limit; a reward or limit claimed from a project file; any attempt to pass an amount to `create` or `post`.

- Bounties, records and settings written before this wave load and read as $0.
- The three hard stops are unchanged by a reward.

## Review lenses

- [x] **Security:** the reviewer plays an agent that wants a bounty to state more than the owner set, or to post past the limit: odd arguments, a project file, an edited record, a solution that carries a settings file, a block edited on GitHub, two posts racing the limit. For each: prevented, or permitted but visible. It checks the block and the listing can never disagree about the amount.
- [x] **User experience:** tested with fresh agents, never with the owner. The two-agent check from K15: one agent relays the first-use message for a repository whose owner is about to set a reward; a second, who has never seen the tool, writes down what it is agreeing to; a check looks for public, merged, this repository only, and what each bounty promises. Five runs, sentences word for word. Then a stranger with only a posted issue says what the reward is and what has and has not been promised.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. Small on purpose: two settings, one field, one refusal.
- A new setting never adds a command (owner, 13 October 2026). It goes in `config`.
- Left out on purpose and in BACKLOG.md: an agent pricing each bounty within a budget, and raising a posted reward. The owner judged it too early.
- No real-GitHub step here; BT11b has the real run, in the sandbox.
- Report at the timebox. Do not run on.

---

## Result

- Worker: cook, Devin (continuation of the interrupted session) · Reviewer:
- Commit: `c173a8d` on `wave/BT11a` — 18 files, +590/−60 (13 product/doc files, the reader, three test files, new `bt11.test.ts`). This wave file follows in a second commit; the code the pass verifies is `c173a8d`.
- Verify: `verify c173a8d PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 462s`, exit 0. Bounty 32 files / 408 tests; package 17 files pass, 1 skipped (existing optional skip). Run: `.kitchen/runs/2026-10-13T15-19-34-702Z-c173a8d`.
- Verdict: · Level:
- Lenses: security — every agent money path is a tested named refusal: amount spellings on create/post (`reward-agent-set`), project-file reward/limit claims (`project-claims-reward`), malformed record reward (`record-corrupt`), non-whole/negative config values (`reward-amount-invalid`), reward without limit (`reward-needs-limit`), limit below reward (`limit-below-reward`), post past the limit (`promise-limit-exceeded`, before any write or gh call). Listing/block agreement is structural: the one `reward` parameter feeds both the README/issue line and `formatFor`, and a test asserts the shipped bytes. UX — see below.
- Two-agent runs (count, sentences): **5 runs, CTO-dispatched on `c173a8d`, 15:29–15:35 UTC.** Fixture: temp clone of `box-bounty-sandbox`, `BOX_BOUNTY_SETTINGS_DIR` isolated to `%TEMP%\box-bt11a-settings`, `reward-limit 200` + `reward 50` set — the real wait output verbatim was:
  > `waiting for the owner: bt-2b321e9e346a — the owner has not allowed the tool — posting to GitHub waits for them`
  > `…Bounties are public under the owner's GitHub account. A solution the agent chooses is merged into the owner's code. This decision covers this repository only.`
  > `Each bounty states the reward the owner has set — $50, a promise in the owner's name paid by hand. They set it with: box bounty config set reward <whole dollars>` (+ the three choices and `config` pointer)

  **All 5/5 agent-1 relays carried all four facts** (public under owner's account; chosen solution merges into owner's code; this repository only; each bounty promises $50 paid by hand). Agent-1 sentences, word for word:
  - A1: "Please decide whether I may publish this bounty for this repository. It will be public on GitHub under your account and state that you will personally pay a **$50 reward** for an accepted solution. Any merged code becomes part of your repository."
  - B1: "…the tool is blocked until you grant permission for this repository… It includes a reward you've configured (currently $50), which is a promise made in your name that you'd pay out manually to whoever's solution gets accepted… whichever option you choose applies only to this repository…"
  - C1: "…It advertises a $50 reward — that's a promise made in your name, and it's paid out manually by you when someone claims it, not automatically. When a solution comes in, whichever one is selected gets merged into your repository's code…"
  - D1: "…the bounty would go up publicly on GitHub under **your** account, on this repo. It advertises a **$50 reward** — a promise made in your name that you'd pay by hand to whoever solves it… merging isn't gated by this permission, only publishing is."
  - E1: "…It states a reward — currently set to $50 — which is a commitment made in your name that you'd pay out manually to whoever's solution gets accepted. If a solution comes in and I pick it, that work gets merged into your codebase."

  Agent-2 write-ups — what each believed it was agreeing to:
  - A2: "…authorize a coding agent to publicly post a bounty on GitHub under your account for this repository, offering a $50 reward that you would personally pay to whoever submits a solution you accept… approval applies to publishing this bounty only — it does not obligate you to merge any submitted work…"
  - B2: "…a bounty I've configured — currently carrying a $50 reward — will be posted publicly under my GitHub identity, making me responsible for manually paying whoever submits the accepted solution, and that chosen solution will be merged into this repository's code… applies only to this repository, and approval gates only the act of publishing…"
  - C2: "…a $50 bounty… publicly visible, commit me to manually paying $50 to whoever's submission is selected, and result in the winning solution being merged into this repository's code — with merges not gated by my approval in any case…"
  - D2: "…the public posting of a $50 bounty on this GitHub repository under my own account… a promise I would be expected to fulfill by manually paying whoever solves it… Approving only gates publishing: it does not control merging… applies only to this repository… or decline entirely, in which case nothing is posted."
  - E2: "…committing me to a stated $50 reward that I would personally pay out to whoever submits an accepted solution, with the winning code being merged into my codebase… this permission governs only the act of publishing bounties, not the merging of accepted solutions… I can decline entirely or renegotiate the reward amount before anything is posted."

  **Stranger read (brief's second UX check):** a fresh agent given only the rendered issue text (verbatim $50 preview block) answered: "**$50 (USD)**, payment made **by hand by the issue poster**… the pull request whose solution gets merged earns the entire $50… no guarantee of payment at all — submitting an answer doesn't entitle anyone to anything, and non-merged solutions earn nothing." — correct on amount, payer, mechanism and non-promises.

  Same caveat as K15: an agent standing in for an owner is a proxy, not a person.
- Findings and limits: the promise limit is check-then-write inside one command — two posts in simultaneous CLI processes could both pass the gate before either persists; the horizon is the one the surface already names ("this repository's open bounties — what the tool can see"). GitHub approvals recorded pre-wave post their frozen $0 body by design. A version 1 block re-renders only for records actually published before this wave; every new post — preview included — is v2, so preview and post cannot disagree about the amount. Re-measured K14 starts on the final commit: post-preview 16 git (budget 18), post-github 19 git (budget 21), close-ended 4 gh (budget 5); all other labels unchanged, all under budget.
- Merged: · Resources removed:
- Reflect: feature playbook. Principles that changed decisions: `boundary-discipline` — money validation sits only at boundaries (flag parse, settings load, project-file claim scan, record load, block parse); nothing re-checks inside. `prove-it-works` — the listing/format disagreement was caught by a real preview-vs-post byte comparison, not by reading the code; K14 was re-measured, not assumed. `bounty.json` deliberately carries no reward: its sha256 binds the shipped answer set, so the money fact lives on the record, the README listing and the format block instead.
