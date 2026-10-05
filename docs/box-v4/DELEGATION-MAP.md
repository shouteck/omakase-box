# Portable Boxes for delegation

Direction revision: delegation-focus-2026-10-05. The CEO requested this refocus on 5 October 2026 after discussing portable work packages, delegation and optional bounty distribution. This is product-planning authority, not approval of another implementation wave.

## Promise and first users

Turn a change in an existing codebase into a runnable work package that another developer or agent can implement, submit and have independently verified without downloading the whole owner repository.

Start with engineering leads and organisations that repeatedly delegate bounded changes. PMs, founders and other requesters can initiate work. Buying an accepted contribution changes the unit of engagement; it does not eliminate engineering expertise, technical ownership or integration responsibility. Competitive advantage and willingness to pay remain hypotheses.

The initial buyer hypothesis is an engineering team that regularly uses contractors for bounded changes in an existing repository. Owners select their own trusted employees, invited contractors or agents; the product need not supply a workforce. Organisation-access Boxes are a valid mode for authorised proprietary work, but do not demonstrate selected-source portability or guarantee confidentiality. Both modes retain independent owner verification.

The CEO confirmed that self-service positioning is sufficient for an MVP experiment, not established differentiation. The intended advantage is less owner preparation, recipient setup/investigation and owner verification/integration effort at comparable quality. Define the comparison before the experiment and record effort throughout development; see [the validation plan](delegation/VALIDATION-PLAN.md). Do not respond to competition by adding a marketplace or speculative features.

## One preparation engine, several entry points

The primary action is **Prepare this work for delegation**. The first entry point accepts a pasted issue/request body or a direct description, associated with a registered repository. A ticket URL can be recorded as provenance; it is not a claim that an external connector fetched its contents. Backlog selectors, API-triggered requests and conversation are subsequent adapters to the same preparation engine. Do not require a tracker account or mandatory chat session.

Preparation grounds facts in a known source revision, derives the requested change, identifies dependencies and produces a draft Box. A request can contain several outcomes; several messages can refine one outcome. Keep coherent full-stack work together when appropriate. Cross-Box prerequisites and overlapping edits are different relationships. Creating a draft does not approve execution or publish a bounty.

## What a ready portable Box contains

- The owner-approved outcome, concise examples, constraints and exclusions, including declared project standards.
- An exact source baseline and selected source needed for this supported task, with provenance and inclusion reasons.
- Separate understanding/read context, editable paths and verification obligations.
- A reproducible dependency/tool recipe, required configuration and non-sensitive fixtures or declared service interfaces.
- Local checks, owner-side independent acceptance, and an explicit patch/submission/integration contract.
- Scope, ownership, revision, capability and resource declarations sufficient for a fresh recipient to open the work in an existing editor or through an agent adapter.

Portability is actual exported source plus supporting material, not merely a smaller prompt or a hidden file tree. No owner repository clone, complete `.git` history, credentials, access token or owner remote access may be required for the portable demonstration. Cached third-party dependencies or a declared runtime can be reused; measure their size separately from owner-source transfer.

Begin with supported, modular TypeScript tasks over trusted synthetic/non-sensitive repositories. A suitable first fixture is an integration adapter or bounded validation change with a shared helper, visible caller contract and unrelated owner modules that must be absent from the export. The owner retains the complete repository for final verification. A connected UI/API example is a subsequent breadth probe within this ladder, not a requirement that every task use one layer exclusively.

Use structural references, imports/types, configuration, tests and available runtime evidence to select and expand context. No universal minimal slice is promised. The first implementation can use an explicit owner-reviewed source/dependency manifest and automated export validation; AI-assisted selection is a later measurable improvement, not a prerequisite for proving the handoff.

An unsupported coupling or missing obligation becomes an actionable preparation gap. A full-repository Open Box may remain a legitimate existing execution mode, but cannot count as success for the portable-package gate. Do not silently fetch the full owner repository to repair a supposedly self-contained package.

## Behavior without requester bureaucracy

Show the relevant result using a concise example, before/after view or input/output scenario grounded in the current application. Reuse its terminology and components where available. PMs do not author test suites, dependency graphs or technical contracts. Rich arbitrary interactive previews and a bespoke editor are not initial deliverables.

The underlying agreement records observable outcomes and constraints. Existing behavior is evidence, not automatically the desired behavior. Approved Box obligations remain immutable; an intentional amendment creates a new version and visible impact. A proposed preview is not a verified implementation. Tests cannot add unpublished business requirements or redefine success to fit returned code.

## Submission and acceptance

A recipient opens the package, implements within its declared scope, runs local checks and submits a baseline-bound patch. The owner applies it to an isolated copy of the original repository, verifies the approved behavior and surrounding interfaces, obtains distinct review and performs only authorised integration. Local package success alone cannot accept the contribution.

Human, agent and hybrid execution use the same obligations. The initial proof uses an approved trusted recipient/runtime. Public strangers, hostile execution, private disclosure and real bounty payments retain their separate gates. The package must not assume that the recipient runs the company's private intent model.

## Delivery ladder

Tasks are in [the delegation graph](../../tasks/box-delegation-task-graph.json). The order follows risk: prove the package before building more screens.

| Step | Concrete outcome | Form |
|---|---|---|
| D1 | Supported task class, request intake and owner-approved completion agreement | Existing web console and API |
| D2 | A Box exports as a plain folder, proves itself in a clean directory, and a recipient submits a real patch from it | Command line and file format |
| D3.1 | The owner verifies the exact patch in the original repository and merges it | Command line |
| D4 | Fresh-recipient delegation, counterexamples, effort and disclosure compared with ordinary delegation, separately labeled commercial evidence | Measured runs and a report |
| D3.2 | One minimal web journey for prepare, delegate and accept | Web, after the D4 decision |

A Box is a folder: `box.json` (outcome, base commit, read context, editable paths, checks, submission contract), the selected source, the lockfile and tool versions, and non-sensitive fixtures. Three commands cover the loop: export, submit, verify. None needs a server, a database, accounts or a container. The recipient's environment recipe is a Node version and a lockfile; a container image is an optional convenience, never a requirement.

The existing B-series code is a parts list. Reuse the Box contracts and hashing from B1.1 and whatever analyzer and patch-validation code fits. The versioned Box store and the D1 intake remain valid as one source of agreements; the package proof does not depend on them.

## Where a Box has to win

For a contributor the owner already trusts with the repository, "grant access and point at the issue" is the baseline, and it is cheap. A Box earns its preparation cost in two situations, and both are measurable:

- **Limited disclosure.** The owner will not or cannot share the whole repository. Report, for every Box, the share of owner source the recipient received.
- **Agent context.** A small, verified context makes an agent cheaper and more reliable than the full repository does. Compare the same agent with the Box and with the full repository: success, tokens, elapsed time, owner interventions.

Total owner effort still matters and is still recorded. If neither wedge shows an advantage in D4, that is the finding.

## The kitchen is the first customer

A wave brief is already a Box in prose: outcome, base commit, editable paths, checks, independent verification in the original repository. From D2.2 on, the kitchen delivers its own briefs to its workers as exported Boxes and records what the worker lacked. This is real repeat use by a team that delegates daily. It is not independent customer evidence and is reported separately from it.

## Validation and later extensions

Measure owner preparation effort, recipient setup and investigation, clarification requests, package omissions, source/dependency transfer, accepted integration, independent verification and rework. Include failed and rejected packages. Record real versus synthetic evidence and whether the recipient already knew the repository. A separate-context agent run is not an independent human study or proof of confidentiality.

Use ordinary issue-plus-contractor delegation as the first measured baseline, with equivalent outcome and acceptance obligations. Inspect documented competitors and record overlap rather than asserting an empty market. A prospective customer pilot asks whether teams actually use Boxes for their next eligible delegation and what they will pay; favorable interview answers alone are insufficient. Technical D4 acceptance can complete while customer usefulness remains unverified. Propose a separately authorised pilot when appropriate; no participant recruitment, private-data access, external messages, spending or implementation follows from this direction alone.

Required counterexamples: a missing shared dependency; omitted business context; local checks passing while owner integration fails; an out-of-scope patch; stale baseline/behavior; and attempted reliance on owner-only source. Each must fail or be classified honestly. Validate at least two supported changes; identify one unsupported case. Do not claim universal task breadth from these examples.

Bounties are a later distribution and contracting mode for a proven Box: matching, reward commitments, reservation, settlement and disputes need their own design. Restricted proprietary packaging requires explicit disclosure policy and measured assurance. Conversation, backlog integrations, richer previews, automatic selection and larger team coordination can expand after the delegation loop proves useful. None is assumed unique merely because this roadmap is narrower.
