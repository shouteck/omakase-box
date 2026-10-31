# The open bounty board

Every open bounty on a public GitHub repository, in one list. It carries no money and judges no solution. The design is [PLATFORM-UX.md](../../docs/box-v4/PLATFORM-UX.md).

Run it on this machine, with a GitHub stand-in and sample data; nothing leaves localhost:

```bash
node packages/box-platform/local.mjs
```

Then open http://localhost:4320/. After changing a page, delete `packages/box-platform/out/` so the command rebuilds it.

Tests: `node scripts/suite.mjs platform`.

What runs where: `src/worker.ts` is the deployed form (Cloudflare Workers Free, static assets, D1); `src/local.ts` runs the same `handle()` and `refresh()` on node. Deployment is PF6's recipe, and the owner's to run.
