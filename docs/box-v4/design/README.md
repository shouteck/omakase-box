# The site's pre-design (K56, for PF40 to PF43)

Static mock-ups of how the site should look after the four design waves. They were drawn by the CTO on 10 November 2026 from [K56](../../../waves/K56.md), so that a wave builds to a picture and does not have to invent one. **They are a proposal until the owner approves each wave's before-and-after** (D-2026-11-02-site-looks-need-approval). They are not product code: nothing in `packages/` loads them.

## See them

```
node docs/box-v4/design/shoot.mjs            # the mock-ups, into shots/after/
node docs/box-v4/design/shoot.mjs --before   # also the live site today, into shots/before/
```

The pictures are not committed (`shots/` is ignored): the command remakes them in under a minute with the browser already on the machine. Or open any `.html` file here in a browser; the switches are in the address.

| Wave | Mock-up | Switches | Shots (each at `-desktop` 1440 and `-phone` 390; some also `-dark`) | Before |
|---|---|---|---|---|
| PF40 | `marks.html` | none | `marks` | none: the site has no mark |
| PF40 | every page's navigation, page header and footer | `?mark=a\|b\|c`, `?theme=dark` | all | `front`, `board`, `how`, `agents`, `numbers` |
| PF41 | `board.html` | `?n=0` empty with the example, `?n=0&example=0` empty without, `?n=1`, `?n=10` | `board-empty-example`, `board-empty-plain`, `board-one`, `board-many` | `board` |
| PF41 | `bounty.html` | `?kind=listed` | `bounty-posted`, `bounty-listed` | none: the live board has no bounty |
| PF42 | `how.html`, `agents.html` | none | `how`, `agents` | `how`, `agents` |
| PF42 | `numbers.html` | `?n=0` nothing to count, `?n=1` sample figures | `numbers-zero`, `numbers-sample` | `numbers` |
| PF43 | `front.html` | default is arrangement A (centred); `?hero=b` is arrangement B (split) | `front-a`, `front-b` | `front` |

## The rules the mock-ups follow

These are the design. A wave that builds a page follows them; where the built page cannot, the wave says so at its mock-up stop.

**Unchanged from today.** Every colour, the typeface (Geist Sans and Geist Mono), the three weights (400, 500, 600) and the type sizes in `packages/box-platform/app/globals.css`. The front page's one line, its order and "Some things it never does". No new colour is added by any design wave.

**The frame (PF40), the same on every page.** The numbers are the custom properties at the top of `mock.css`.

| Part | Rule |
|---|---|
| Outer width | 76rem, the front page's, with a 2rem side margin (1.25rem under 640px). Inner pages use the full width; they no longer sit in a narrow column on the left |
| Navigation | 3.5rem high, a hairline under it. Left: the mark and "omakase-box" in weight 600. Right: Board, How it works, For agents, Your page in the soft colour; the page you are on in ink with a 1px ink line under it; then one filled pill button, "Get started". The GitHub link moves to the footer |
| Navigation on a phone | Row one: mark and name left, the button right. Row two: all four links across the width, each 44px high. No menu button, nothing hidden |
| Page header | Title at 2.5rem (1.75rem on a phone), one sentence at 1.25rem in the soft colour, at most one link on the right. 4rem above, 2.5rem below. Every page but the front page |
| Footer | The mark, the name and the one line about money on the left; three short lists: Product, For programs, The small print |
| Running text | No wider than 40rem (60 to 75 characters) |

**The board and a bounty (PF41).**

| Part | Rule |
|---|---|
| A card | Two columns: the reward (1.75rem, weight 500, tabular figures) in a fixed 7.5rem column; then the title (1.25rem, weight 500), one line of repository, language and age in the soft colour, and one row of small pills. On a phone the reward sits above the title |
| The pills | In this order: how it pays ("Pays on merge" on the green ground, or "Owner pays after merge" in outline); "Listed from an issue" where it is; then attempts ("No attempts yet", "2 attempts in progress") or the end state ("Merged", "Closed"). Green is used for nothing else |
| The owner's payment record | Leaves the card and stays on the bounty's page and as a filter. A card carries what a solver decides on first; the record is one click away. **This removes a line the owner approved in K43, so the mock-up stop names it** |
| Filters | One row: search, language, reward, sort. Everything else behind "More filters" |
| The empty board | A heading and two sentences on the left; on the right one card inside a dashed outline, labelled "Example · not a real bounty". Under both, two doors of equal weight: "Your agent posts one" with the install line and a copy button, and "Put a reward on an issue" with one link |
| A bounty's page | Left: the title, one sentence of state, then The task (the poster's words, set off by a line on the left and labelled as theirs), How to answer (numbered, each command in its own block), Attempts. Right, 21rem and sticky: the reward at 2.5rem, the pay pill, then the facts as label-and-value rows. On a phone the reward block comes first |

**A page that is read (PF42).** A side list of the page's sections on the left (14rem, sticky; a row of links at the top on a phone). Each section: a 1.75rem heading, short blocks, every command in its own block with a copy button. The three ways to pay are one three-column table. For agents: each address is a row of a short label, the command block and one sentence. Numbers with something to count: six large figures, each with what it counts under it, then the definitions. Numbers with nothing to count: one sentence in a soft panel in place of a column of zeros, then the same definitions under "What will be counted".

**The front page (PF43).** The install line is in the hero as a pill with a filled "Copy" button; under it one soft sentence and "Browse bounties". The picture is complete in the first HTML and uses the PF41 card. Under it two doors: "Have an agent?" and "Maintain a repository?". Arrangement A keeps the approved centred page and is the recommendation; B is shown so the owner has a real choice.

## What the mock-ups do not settle

- **Which mark.** Three candidates are drawn; the frame uses A until the owner picks.
- **The example on the empty board.** Both versions are drawn (K56's question 2).
- **Light or dark first.** The mock-ups follow the visitor's setting, as the site does (K56's question 3).
- **Words.** Where a mock-up's sentence differs from the live page, the live page's facts win: PF42 edits words only by cutting or regrouping, and its Result lists each sentence that moved.
- **Signed-in pages.** Not drawn: they adopt the frame and change nothing else.

## Keeping this honest

`mock.css` copies the colour tokens from `globals.css`. If a token changes there, change it here in the same commit, or the next before-and-after compares against the wrong colours.
