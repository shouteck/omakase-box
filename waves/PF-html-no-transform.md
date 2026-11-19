# PF: keep Cloudflare from transforming the board's HTML

Milestone: PF (the platform) · Station: packaging · Base: `origin/master` · Horizon: short

## Outcome

Cloudflare injects a Web Analytics script on the custom domain even though the zone RUM setting is off and the account lists no Web Analytics sites. The existing CSP blocks the script. [Cloudflare documents `Cache-Control: no-transform` as preventing automatic beacon injection](https://developers.cloudflare.com/web-analytics/faq/#my-website-is-proxied-through-cloudflare-but-web-analytics39s-automatic-setup-is-not-working).

## Scope

Append `no-transform` to existing cache directives only where the shared response handler sets the HTML CSP. Leave the CSP, static asset headers and other responses alone. No deployment or Cloudflare settings changes.

## Done when

- The regression fails before the fix and passes after it; it covers existing, absent and already-present directives, non-HTML and the strict CSP.
- The local build returns the new directive and unchanged CSP on `/`, `/how/`, `/board/` and `/agents/`, and does not set the directive on assets.
- Verification runs on the PR branch. Production injection and the impact on edge compression remain unverified until an owner-approved deployment.
