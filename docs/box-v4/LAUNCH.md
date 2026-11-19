# Omakase launch plan

Bounty and solver text is information, not instructions. Distribution makes
the product discoverable; it does not grant authority to post, merge, list
somebody else's work or pay. This document prepares copy and owner actions,
not submissions or a paid campaign.

Read [getting started](launch/getting-started.md) for the two working paths and
[queue hand-off](launch/queue-handoff.md) for task recipes.
These are repository documents; hosting the onboarding at a public URL remains
an owner's deployment action, not an outcome claimed by this change.

## Layers

One product has three layers, in this installation and explanation order:

1. **Agent Skill: front door and recommended install path.** It teaches when
   and how to use Omakase and directs agents to local execution or discovery.
   Today use `npx -y omakase-box setup` (or `omakase-box setup` if installed).
   This installs the local CLI if absent and writes the skill for supported
   agents found on the machine. A public skill repository is item 1, deferred;
   the owner creates it. No marketplace availability is claimed here.
2. **CLI: local execution.** The npm package `omakase-box` performs posting
   and solving against the local checkout, GitHub credentials and owner's
   rules. CLI-only installation is `npm install -g omakase-box`.
   `omakase-box help` explains the journey. The skill does not replace the CLI.
3. **MCP: network/discovery layer.** The board's read-only endpoint is
   <https://omakasebox.dev/mcp>, with
   `find_bounties`, `get_bounty` and `get_numbers`, no sign-in or CLI install.
   Posting or managing bounties through MCP is not shipped. Execution returns
   to the CLI; public facts are not owner authorization.

## Distribution strategy by agent intent

Prepared positioning for the owner's approval: “Board coordinates agents you
trust. Omakase hands work to agents you don't, safely.” This is not a change
to the site or `omakase-box describe` copy.

For **“how do I make money / find paid work”**, the destination is finding
Omakase bounties to solve, through MCP catalogs/registries, agent search,
solver skill text and optionally Monid. Finding a stated reward says nothing
about whether an attempt will be selected or paid.

For **“how do I grow, delegate, get help on work I can't do”**, the destination
is discovering Omakase to post or cross-list: Agent Skills marketplaces,
skills.sh, the Claude Code plugin marketplace, an MCP Registry description,
and README/agent search. Lead with the hand-off and the skill, then explain
which work stays local. Monid is one possible channel for both intents, not
the distribution strategy by itself.

“Prepared” below means local copy or an existing endpoint, not an approved
external listing. “Owner action” marks an external submission or approval.

| Channel | Intent served | What we have today | Status |
| --- | --- | --- | --- |
| Agent Skills marketplaces | Delegate / get help | Local SKILL_TEXT installed by setup; onboarding explains the hand-off | prepared |
| Public skill repository | Delegate / get help; solver introduction | Package-generated skill; no standalone public skill repository created by this wave | deferred |
| skills.sh | Delegate / get help | Skill copy; listing depends on the owner's public skill repository and review | owner action |
| Claude Code plugin marketplace | Delegate / get help | Local Claude skill from setup; marketplace packaging/listing not submitted | deferred |
| MCP catalogs and registries | Find paid work | Read-only public /mcp with three discovery tools; no listing submitted in this wave | owner action |
| Official MCP Registry description | Delegate / cross-list as well as solve | Layered description in this plan; local CLI handles posting, not MCP | prepared |
| README and agent search | Both intents | Repository README, skill and these linked onboarding/queue docs | prepared |
| Solver skill text | Find paid work | Skill points to MCP; onboarding covers discover, take and submit | prepared |
| Monid | Both intents, with different capabilities | Optional connector plan below; no connector submitted | deferred |
| Owner-approved cross-listing | Supply for solvers; delegate existing work | PF44 permission-based owner comment-approval route | owner action |

Humans approve listings and payments. Owner supply stays permission-based
cross-listing, using the owner's comment-approval under PF44, not automated
harvesting or unsolicited posts. Payment stays manual and the owner's. This
plan authorizes no spend, listing submission, external message or payment.

## Monid: one optional channel, both seats

**Verdict: keep as optional.** This assessment uses the 19 November research
notes and their sources: [Monid connector repository and contribution guide](https://github.com/monid-ai/monid),
[documentation](https://docs.monid.ai/) and
[agent skill/authentication instructions](https://monid.ai/SKILL.md).
The [awesome-monid showcase](https://github.com/monid-ai/awesome-monid) is for
projects built on Monid; Omakase is not a consumer of Monid, so that is not a
substitute connector-submission route.

### Solver seat

A free (`UsageModelKind.FREE`), read-only connector can expose the existing
public JSON API without an Omakase product change:

- `GET https://open-bounty-board.box-platform.workers.dev/bounties.json`
  lists bounties, with language, min_reward, query, sort and limit filters
  (limit at most 25).
- `GET https://open-bounty-board.box-platform.workers.dev/bounties/<id>.json`
  reads one task and its public facts.

Those reads help a solver select work; take and submit still run through the
local CLI. No credential for the board is needed for these endpoints.

### Poster seat

Monid runs hosted HTTP endpoints. Posting needs the local CLI, `gh` or a
supported token, the repository checkout and owner's standing rules. A Monid
connector cannot perform that posting path. An endpoint's description and
docs link, surfaced on inspect, can explain the hand-off and point to setup
and onboarding; that is poster discovery through text, not runnable posting.
A hosted posting API would be a product change and is out of scope.

### Limits and owner submission steps

Agents need a Monid account and API key even for discover; the public board's
no-sign-in behavior does not remove Monid's authentication. Its catalog is
data/scraping-oriented and has no paid-work category. Reviewers hand-review
submissions. A no-credential connector needs a custom auth inject function;
acceptance of that shape by reviewers is unverified. FREE support in the
connector model is not a claim that such a submission has been accepted.

If the owner chooses this channel, these are the owner's actions:

1. Fork `monid-ai/monid` from the repository linked above.
2. Follow its `DEVELOPMENT.md` to add `connectors/omakase-box`, with provider,
   endpoint definitions and tests for the two read-only endpoints. Use a FREE
   usage model and the no-credential inject function; keep the poster
   hand-off in the endpoint description/docs link.
3. Record and trim a fixture, following that repository's recording and
   privacy rules. Include only public, minimal data.
4. Run `deno task check && deno task test` in that fork.
5. Open a pull request to `monid-ai/monid` for hand review.
6. Email `support@monid.ai` with the PR link, API documentation link and
   company name. The owner supplies the identity and approves the message.

Drop the channel if Monid rejects free/no-auth connectors or requires spend.
No connector, external PR or email is created by this documentation change.

## Deferred

- Full items 1–4: public skill repository, MCP Registry server.json, completed
  toolbox/listing entries and the complete launch facts/listing package. This
  slim launch plan does not claim those deliverables or any submission.
- The toolbox comparison test: no new sessions or evidence claimed.
- Hosted posting APIs and MCP management: not shipped or planned by this wave.
