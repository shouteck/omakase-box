# Station: Console

The screens an owner or requester uses, and whether a person understands them. The browser half of D1.2, and D3.2 later.

## What this station knows

- The owner console is `apps/private-console/` (React, built with Vite by the `build` step). The contributor side is `apps/contributor-portal/`. They are separate apps on separate hosts and must stay separate.
- What the product promises a requester, from `docs/box-v4/DELEGATION-MAP.md`: show the result as a short example or before/after in the application's own words; no handwritten technical spec, no mandatory chat, no raw hashes or dependency editing for ordinary use. An approved agreement never changes in place; an amendment is a new version, and the screen must show that the earlier approval no longer applies.
- The screen shows what the server says. Status, ownership, versions and approval state come from the API on every load; nothing is decided in the browser.
- Browser tests use Playwright with the Chromium already in `.runtime/browsers` (the suite runner sets the path).

## Traps

- **Do not download a browser.** If Chromium is missing or will not launch, stop and report.
- **A passing browser test is not a usable screen.** Tests prove the buttons work; they do not prove an owner knows what they are approving.
- **Never show unfinished or failed work as complete**, and never hide a scope or approval decision to make the screen simpler.
- **Reload is a test.** State that survives only in the page is a bug.

## The pass checks

- Tick the user-experience lens for any wave on this station. Use the screen as an owner who has not read the code: say what you thought you were approving, what was excluded, and what you expected after an amendment, then compare with what happened.
- Reload mid-flow and confirm the server's state is what the screen shows.
- Try the flow as the wrong role and confirm the server refuses, not only that the button is hidden.
- Verdict level for this station should be `ui-verified`; say so if it was only `test-verified`.
