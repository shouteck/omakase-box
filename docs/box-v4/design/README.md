# The site's design proposals

**The first pre-design (10 November 2026) was rejected by the owner on 11 November 2026 and is removed.** It redrew pages from scratch and lost things the site already does well. Do not rebuild it from Git history.

What is here now is a second pass, **not yet approved**:

- `review.mjs` makes before-and-after pictures from the real pages. "After" is the real page with a small patch applied in the browser, so anything a proposal does not mention is unchanged. Run the local board (`node packages/box-platform/local.mjs`), then `node docs/box-v4/design/review.mjs`. The pictures land in `review/` and are not committed.

## What the owner has decided

- **The mark is candidate A** (11 November 2026, D-2026-11-11-mark-a). Its drawing is the constant `MARK` in `review.mjs`.
- **The current design stays.** A proposal improves a named weak spot and says why, with a before and an after of the whole page.
- **Front page, approved** (11 November 2026, D-2026-11-11-front-page): the install line under the two buttons, "Maintain a repository?" as a third way in, and the picture visible from the first moment. The patch is `front` in `review.mjs`.
- **How it works: the panel means "your agent does this, you do nothing".** The owner rejected putting a person's steps in it. Plain text is what a person does.
- **The empty board's layout is agreed** (one centred message, a sample row); only how the two ways in are drawn was still open.
- **Every page not listed below stays exactly as it is.** Do not propose changes to them again.

## Settled on 11 November 2026 (D-2026-11-11-site-settled)

- **The front page's picture stays as it is today.** An animated isometric machine and two line drawings were each rejected. Do not propose a new picture unless the owner asks.
- **The empty board:** one centred message, the two ways in as the site's own blue links, one quiet sample row (patch `emptyBoard`). The owner rejected filled black round buttons there: stay with the look the site already uses.
- **Every command the site prints says omakase-box.** That follows the tool's rename (BT63), since the pages' commands are checked against the built tool.
- **How it works does not repeat the three payment cards;** they belong to the front page.

## Approved on 11 November 2026 (D-2026-11-11-design-approved): to be built

**How it works** (patch `how`, with `mode` choosing which way is open): each half has a small two-part switch beside its heading. Hand off work: With the tool | Without it (three short steps to list an issue). Answer bounties: With the tool | By hand (four short steps). The tool's way is the one thing a person runs and then the agent's panel. One line and a link stand in for payment.

`review.src.html` is the review page; `review.mjs` makes the pictures and copies it to `review.html`.

## Lessons kept from the rejected pass

- Look at the site at a real laptop width before judging it. K56 looked at about 800 pixels, where inner pages stack, and called that "two sites".
- Start from the real page. Never redraw an approved page from memory.
- A partial mock-up reads as "the rest is gone". Show the whole page.
