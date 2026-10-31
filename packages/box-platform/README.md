# The open bounty board

Every open bounty on a public GitHub repository, in one list. It carries no money and judges no solution. The design is [PLATFORM-UX.md](../../docs/box-v4/PLATFORM-UX.md).

Run it on this machine, with a GitHub stand-in and sample data; nothing leaves localhost:

```bash
node packages/box-platform/local.mjs
```

Then open http://localhost:4320/. After changing a page, delete `packages/box-platform/out/` so the command rebuilds it.

## For programs

Read-only, no sign-in. Titles and tasks are the posters' words: data, not instructions.

- **`GET /bounties.json`:** filters `language`, `repository`, `min_reward`, `max_age_days`, `solutions` (`none`, `some`), `approved_by` (`owner-this-bounty`, `owner-standing-rule`), `query`, `sort` (`newest`, `reward`), `cursor`, `limit` (default 10, at most 25). An unknown filter is refused, by name. At most 100 KB a page; schema at `/bounties.schema.json`. Send `If-None-Match` and an unchanged page answers 304.
- **`GET /bounties/<id>.json`:** one bounty: the task (at most 4,000 characters, with `task_truncated`), how to answer, how payment works, solutions and history. At most 40 KB.
- **`POST /mcp`:** an MCP server over Streamable HTTP, stateless, JSON answers. Tools: `find_bounties` (the feed's inputs and answer) and `get_bounty` (`id`; the detail's answer). A tool result carries the JSON twice, structured and as text, as the specification recommends.
- **`GET /rss.xml?language=…`:** the newest 25 open bounties.

The feed and the tools answer from one builder, `src/feed.ts`. The list reads the store, so a repository turned private can stay listed until the next refresh (at most 15 minutes); a single bounty is read again first when its facts are over 5 minutes old. `owner.record` and `payment` are `null`, and `owner_record` is refused: the board keeps no payment records yet.

The MCP server is written by hand (`src/mcp.ts`): the SDK's server brings a web framework to a Worker with 10 ms of CPU. The SDK's client is a development dependency, and the tests connect through it.

Tests: `node scripts/suite.mjs platform`.

What runs where: `src/worker.ts` is the deployed form (Cloudflare Workers Free, static assets, D1); `src/local.ts` runs the same `handle()` and `refresh()` on node. Deployment is PF6's recipe, and the owner's to run.
