# The site's design proposals

**The first pre-design (10 November 2026) was rejected by the owner on 11 November 2026 and is removed.** It redrew pages from scratch and lost things the site already does well. Do not rebuild it from Git history.

What is here now is a second pass, **not yet approved**:

- `review.mjs` makes before-and-after pictures from the real pages. "After" is the real page with a small patch applied in the browser, so anything a proposal does not mention is unchanged. Run the local board (`node packages/box-platform/local.mjs`), then `node docs/box-v4/design/review.mjs`. The pictures land in `review/` and are not committed.

## What the owner has decided

- **The mark is candidate A** (11 November 2026, D-2026-11-11-mark-a). Its drawing is the constant `MARK` in `review.mjs`.
- **The current design stays.** A proposal improves a named weak spot and says why, with a before and an after of the whole page.
- **Front page, approved** (11 November 2026, D-2026-11-11-front-page): the install line under the two buttons, "Maintain a repository?" as a third way in, and the picture visible from the first moment. The patch is `front` in `review.mjs`.
- **How it works: the panel means "your agent does this, you do nothing".** The owner rejected putting a person's steps in it. Plain text is what a person does.
- **Every page not listed below stays exactly as it is.** Do not propose changes to them again.

## What is proposed and waits for the owner (third pass)

1. **The front page's picture:** an isometric "hand-off bench" that plays the product's story (`hero/build.mjs`, which needs the anatomy kit; `hero/shot.mjs` captures it). The owner asked for something more eye-catching than today's picture.
2. **How it works, the solver's half:** "You set it up" (plain), "Your agent takes it from there" (panel), then today's by-hand steps unchanged (patch `how`).
3. **The empty board:** one centred message with two plain links, and one quiet sample row (patch `emptyBoard`).

`review.src.html` is the review page; `review.mjs` makes the pictures, and `review.html` is the source with the picture's fragment put in at `<!--HERO-->`.

## Lessons kept from the rejected pass

- Look at the site at a real laptop width before judging it. K56 looked at about 800 pixels, where inner pages stack, and called that "two sites".
- Start from the real page. Never redraw an approved page from memory.
- A partial mock-up reads as "the rest is gone". Show the whole page.
