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

## What is proposed and waits for the owner (fourth pass)

1. **How it works:** each half gets two tabs. Hand off work: With the tool | Without installing (list an issue, four steps). Answer bounties: With the tool | By hand (explicit Git steps, no jargon). Paying is its own section between them, shown as the front page's three cards. Patch `how`, with `mode` choosing which tabs are open.
2. **The empty board:** the layout the owner agreed to, with the two ways in as two small cards (patch `emptyBoard`).
3. **The front page's picture:** two still drawings, `picture.mjs`: A, a tangle goes into the box and comes out finished; B, the missing piece arrives. The owner rejected an animated isometric machine as too much to take in: **the picture must be understood in one glance; a still is enough.**

`review.src.html` is the review page; `review.mjs` makes the pictures of the pages and writes `review.html` with the two drawings put in.

## Lessons kept from the rejected pass

- Look at the site at a real laptop width before judging it. K56 looked at about 800 pixels, where inner pages stack, and called that "two sites".
- Start from the real page. Never redraw an approved page from memory.
- A partial mock-up reads as "the rest is gone". Show the whole page.
