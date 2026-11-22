# MCP strict clients: list resources and prompts on /mcp

Milestone: 0.4.1 · Station: evidence · Base: `15b3881b` · Branch: `devin/1795362394-mcp-strict-clients` · Horizon: short

## Outcome

Streamable HTTP clients can discover that the board has no resources, resource templates, or prompts. The stateless endpoint continues to refuse SSE GET requests with 405 and `Allow: POST`.

## Scope

- Write: `packages/box-platform/src/mcp.ts` and `tests/platform/machine.test.ts`.
- Do not touch the site, the live deployment, or the 0.4.0 release PR.

## Done when

- The SDK can connect, ping, and retrieve all three empty lists.
- Local HTTP returns 405 with `Allow: POST` for SSE GET and an empty 202 for the initialized notification.
- The commit passes the kitchen verify command with the platform suite.

## Changed expectations

- tests/platform/machine.test.ts::holds the transport rules — use `unknown/method` instead of `resources/list` to exercise the existing `-32601` expectation. The SDK test now verifies `resources/list` succeeds.
