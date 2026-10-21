# PF2: solver agents find bounties: the feed, the MCP server and RSS

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF2` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-platform-v1 (feature 2); D-2026-10-21-gtm-thesis (agents first); D-2026-10-21-k44-decisions (decision 5: machine channels first); spend no money

**Brief.** Written ahead by the CTO on 21 October 2026. Before dispatch, the CTO reconciles it with K43's machine-interface design in `PLATFORM-UX.md` (schema, tool names, bounds) and corrects names only. **After PF1.** Cook: high; reviewer: high.

## Staffing (Claude Code, coordinator on Opus 5.5)

Dispatch each role with the Agent tool, passing `model` and `effort` exactly as written here. This brief is the explicit instruction those settings need.

- **Cook:** `box-worker`, **Sonnet 5.5**, effort **high**: a well-specified interface over PF1's data.
- **The pass:** `box-reviewer`, fresh, **Opus 5.5**, effort **high**: prompt-injection hygiene and bounds need the stronger reader. Never the agent that cooked.
- **Participants:** two fresh sessions (never subagents), **Sonnet 5.5** at its default effort.
- **Corrections:** a correction round uses a fresh cook at the same model and effort. After two FAILs on the same finding, the next correction steps up one level (Sonnet 5.5 to Opus 5.5 high, or Opus 5.5 high to Opus 5.5 xhigh) and the Result says so. Fable 5.1 is never used without the owner's word.
- **Record** the host, model and effort of every role in the Result (KITCHEN.md).

## Outcome

A solver agent with no web browser can find bounties that match its skills, read one fully and know exactly how to answer, through a JSON feed or an MCP server. A person can follow the board by RSS. All read-only, bounded and free.

## What it does

1. **`/bounties.json`:**
   - K43's schema, with filters (language, repository, minimum stated reward, state, age), paging and a stated maximum page size;
   - each entry's fields in the order that decides a solver, ending with how to answer;
   - cacheable (ETag), so an agent polling cheaply costs little.
2. **The MCP server:**
   - Served by the platform over the MCP remote transport (Streamable HTTP), read-only, no sign-in.
   - Tools:
     - `find_bounties`: filters in, a bounded list out, with a cursor;
     - `get_bounty`: id in; out: the task marked as the poster's words, how to answer, solutions so far, the owner's payment facts once PF4 exists, and the stated reward with "the owner pays directly".
   - Tool descriptions say what the platform is and is not: it lists public GitHub bounties, carries no money, and judges nothing.
3. **RSS** of new bounties, filterable by language.
4. **Unasked text stays small** (K25 rule): a list entry is a few lines; the full task only on `get_bounty`.

## Tests (`test:platform`)

| Case | Expected |
|---|---|
| Feed schema | Validates against the published JSON schema; field order as designed |
| Bounds | No response exceeds the stated size; paging walks a 120-bounty stand-in exactly once |
| MCP | An MCP SDK client lists the tools and calls each against the local server; the outputs match the feed |
| Private repository | Never in the feed, the MCP output or RSS |
| Untrusted task text | Delivered as data, marked as the poster's words; no instruction-like text is ever placed in a tool description |
| ETag | A repeat request with the tag returns 304 |

**Fresh-agent check** (K44 experiment E3, in miniature). Two fresh sessions in scratch folders, never subagents, each given only the MCP server's address (or only the feed URL) of the local platform with the stand-in. The task: "find a bounty you could do in TypeScript, and say exactly how you would answer it and how you would be paid." Both must succeed. Record their transcripts' key steps.

## Done when

- `node scripts/verify.mjs test:platform test:kitchen` exits 0; hosted CI green after merge.
- The fresh-agent check succeeded.
- `packages/box-platform/README.md` documents the feed and the MCP tools.

## Review lenses

- [x] **Security:** no private data; prompt-injection hygiene, meaning poster text never appears in tool descriptions and is always marked.
- [x] **User experience:** the pass runs the agent task itself through MCP only.
- [x] **Measurement fairness:** the pass checks the bounds on a stand-in it seeds.

## Notes for the worker

- Feature playbook; principles: prove-it-works.
- Downloads (the MCP SDK) on the pre-cook card.
- Do not edit `waves/PF2.md` while a verify runs. Report at the timebox.
