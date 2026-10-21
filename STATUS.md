# Status

Updated by the CTO on 22 October 2026 at the K43 close.

## Now

- **K43 merged** (`5679f01`); independent PASS (ui-verified) on `266a220` after one correction round. It delivered:
  - `docs/box-v4/PLATFORM-UX.md`: people and jobs agents first, feed and MCP tools, card rules, payment facts, every state, minimalist visual rules, hosting;
  - a local Next.js prototype in `kitchen/platform-prototype/`, sample data only;
  - six fresh-agent reports, verbatim in `kitchen/reviews/K43-participants.md`.
- **Cold run:** three fresh Sonnet 5.5 agents (machine interface, solver web, owner web) all completed their tasks on the corrected prototype.
- **Design calls made in K43:**
  - an owner-only payment method shows only to the owner who owes, on that bounty's page, until "paid" is recorded;
  - self-dealing is read from the merged pull request's public `author_association`;
  - hosting recommendation: Cloudflare Workers Free at $0. Vercel Hobby's clause on "requesting … payment from visitors" stays arguable for a board that shows payment links.
- **For the owner, open:**
  - "posted by an agent or a person" became "how posting was approved", because the board cannot know who typed it;
  - whether "owes me" covers a disputed payment (PF3);
  - the board's one typeface against K41's serif plus monospace.
- **Verify/cost:** `verify: 3 runs, total 358s` locally (1 PASS, 2 FAIL from master's size rule). Four more runs in clean worktrees passed and are not counted. Off-machine: master green at `d70bddf`.
- **In the checkout, not ours:** nine untracked briefs, `waves/BT43.md`–`BT50.md` and `waves/K45.md` (written 21 October, 22:09–23:05). Left untouched. They make verify refuse in the main checkout until committed or moved by whoever wrote them.
- Six empty `%TEMP%\kitchen-K43-*` folders remain until their participant sessions are archived.

## Next

This run stops after K43. No wave is in flight or starts automatically.

- **See the prototype:** `cd kitchen/platform-prototype && npm start`, then http://localhost:4310/. It is already built in `out/`. A fresh build needs `npm ci && npm run build` first.
- **Before dispatching any queued brief:** BT42, PF1–PF6 and K41 fail `brief-check`, mostly on glosses in the "Owner decisions" field; PF1 also names a `test:platform` script that does not exist yet. PF1–PF6 also take K43's proposed corrections (Result, "Deliverable 5" and "Correction round 1").
- **Path to launch** (D-2026-10-21-k44-decisions, D-2026-10-21-minimalism): **BT42** next; then **PF1** → **PF2** and **PF3** → **PF4** → **PF5**; **K41** after PF5; **PF6** last; then the owner deploys, publishes and posts.
- **In BACKLOG:** the flaky `bt39` test; the CLI merge-recognition finding from K42 (unproven); BT33 parked; performance limits.
- **22 October 2026, owner:** K43's four points decided as recommended (D-2026-10-22-k43-decisions: approval wording; "not received" brings owner-only methods back; Inter for board and film; Cloudflare Workers Free; accent `#234a7d`), folded into PF1, PF3, K41 and PLATFORM-UX.md. The nine engineering-review briefs (BT43–BT50, K45) refined and committed. **Suggested order:** K45 first (cheaper verify for everything after), then BT44 and BT42, then BT43, BT45, BT48, BT49, BT50, BT47, BT46 on `packages/box-bounty`, while PF1 → PF2 and PF3 → PF4 run on `packages/box-platform` in parallel worktrees; PF5 after BT43, BT49 and BT50 (it touches the same print and GitHub paths); K41 after PF5; PF6 last.
