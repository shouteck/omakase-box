# RC041-feed: name the bounty feed agents read

Milestone: 0.4.1 · Station: packaging · Base: `master`

## Outcome

The solver rehearsal reported that a successful empty read looked ambiguous
beside a timeout for board numbers. Name the JSON feed in `describe --solving`,
in `discover` results and refusals, and in the repository quickstart.

## Done when

- The configured feed URL is visible, and an empty read remains a success even
  if the separate board numbers are unavailable. A feed failure names the feed
  and leaves the bookmark alone.
- No route, default origin, JSON document, or site page changes.
- Run the bounty and kitchen acceptance checks. Open for review without
  merging until 0.4.0 ships.

## Lenses

- [x] **User experience:** try both an empty feed and a failed feed locally.

## Result

- **Test-verified on Devin/Linux:** the local stand-in sent an empty feed and a
  failed numbers response, a feed 404, and a malformed 200. The three regression
  cases failed before the change and passed after. Existing expectations stayed
  in place.
- **Experience First:** put the exact feed URL and read outcome on the first
  line instead of expecting the solver to infer them from the numbers line.
- **Prove It Works:** exercise both successful and failed HTTP replies against
  the configured board instead of testing the strings in isolation.
