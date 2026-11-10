# The site's design proposals

**The first pre-design (10 November 2026) was rejected by the owner on 11 November 2026 and is removed.** It redrew pages from scratch and lost things the site already does well. Do not rebuild it from Git history.

What is here now is a second pass, **not yet approved**:

- `review.mjs` makes before-and-after pictures from the real pages. "After" is the real page with a small patch applied in the browser, so anything a proposal does not mention is unchanged. Run the local board (`node packages/box-platform/local.mjs`), then `node docs/box-v4/design/review.mjs`. The pictures land in `review/` and are not committed.
- `review.html` shows each pair with the reason for every change. Open it after making the pictures.

## What the owner has decided

- **The mark is candidate A** (owner, 11 November 2026, D-2026-11-11-mark-a): an open box with a square set into it. Its drawing is the constant `MARK` in `review.mjs`.
- **The current design stays.** The owner is content with it; a proposal improves a named weak spot and says why, with a before and an after of the whole page.

## What is proposed and waits for the owner

1. Top bar: the mark, the name omakase-box, one filled button, every link reachable on a phone.
2. Front page: the install line under the two buttons; a third way in for maintainers. Nothing removed.
3. How it works: the solver's three steps in the same panel of cards as "Your agent takes it from there".
4. The empty board: an example row and the two ways a bounty gets here, in place of the grey box.

Proposed to stay as they are: the board with bounties, a bounty's page, For agents, Numbers, Terms.

## Lessons kept from the rejected pass

- Look at the site at a real laptop width before judging it. K56 looked at about 800 pixels, where inner pages stack, and called that "two sites".
- Start from the real page. Never redraw an approved page from memory.
- A partial mock-up reads as "the rest is gone". Show the whole page.
