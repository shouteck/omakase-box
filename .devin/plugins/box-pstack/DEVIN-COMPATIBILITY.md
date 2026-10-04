# Box pstack compatibility map

This plugin adapts the MIT pstack skills created by Lauren Tan (poteto), through the HustleCoding Devin port pinned at `e9e225bb1f3362a51ac4e489d16f2d7b13c248ff`. The source manifest version is 0.11.3; this adaptation is 0.11.3-box.1. See LICENSE, unchanged NOTICE.md and PROVENANCE.json. It is separate from the newer Cursor plugin and does not contain or prove Cursor-native Orchestrate's runtime/store.

Use only in the Box kitchen repository selected by START.md and `.execution/ACTIVE_PLAN.json`. Local plugin installation still registers user-level skills; scope checks are instructions rather than security isolation. Every skill must stop this workflow outside the project. Project approval, tools and candidate evidence remain authoritative. This plugin supplies no global AGENTS rule, hook, MCP server, model setting or dependency requirement.

## Binding mappings

| Retained source assumption | Box Devin behavior |
| --- | --- |
| Cursor Task, subagent_type, generalPurpose or poteto-agent | Use actual Devin run_subagent/read_subagent schemas and registered Box profiles. No alias executable or fabricated Task arguments. |
| Coordinator implements, synthesizes or grafts code | CTO and leads coordinate and write scoped governance. A bounded box-worker owns product implementation/synthesis; distinct box-reviewer verifies the final immutable candidate. |
| Readonly/agent/Ask mode or run_in_background flags | Registered profile tools plus actual foreground/background permissions determine behavior. First rehearsal is foreground/sequential; no permission auto-grants. |
| Inline grok/claude/gpt model defaults or model arrays | Ignore upstream model defaults. Preserve existing configuration; custom profiles without model use router/admin default. Multi-model diversity is unverified unless actual profiles/models are approved and observed. |
| Mandatory parallel arena or one agent per evidence category | Approved budget, available slots and work ownership determine count. Serialize/rotate on this host. A reduced panel is a documented adaptation; do not claim original diversity proof. |
| Broad autonomy; implement after design; reversible means proceed | Routine choices inside approved scope proceed. New product wave, material scope/runtime changes, holds and revocation obey CEO gates. Setup S001 cannot accept B0 or approve W001. |
| Automatic PR/push/merge/commit or fix broken skill in own PR | Require the action/destination to be within actual human authorization. Otherwise provide scoped artifacts and report publication pending. No auto shipping or upstream PR. |
| cursor-team-kit deslop/control-cli/control-ui, Cursor create-skill/babysit | No companion installs. Use existing approved diff/tests or observed user-surface controls; unavailable checks stay unavailable. Do not claim companion validation. |
| AskQuestion | Only actual host user-question facilities; children return decisions to parent because Devin withholds user questions. Do not invent tool aliases. |
| ~/.cursor models/rules/skills/projects or Cursor transcript folders | Use project-local Devin profiles/rules/skills and explicitly provided/current-project transcripts. Never search unrelated projects/user chats or overwrite global configuration. |
| Universal MCP discovery/lookups | Use only enabled, authorized tools/sources relevant to this project. Do not connect accounts or send messages automatically. Missing categories are evidence gaps. |
| Bash log helper, /tmp commands or POSIX shell snippets | Check actual OS/shell and write scope first. Bundled log.sh remains unchanged upstream reference; it is not tested on Windows or auto-executed. CTO may write authentic governance logs using available file tools. |
| Remove old APIs/assets, discard prototypes or restart processes | Honor preservation and approved exact paths. No deletion of historical evidence or unrelated processes; safe worktree/lease rules still apply. |

The replacement `poteto-mode` and `setup-pstack` entrypoints take precedence. Other source bodies and references retain original situational methods under their compatibility prefaces. Their Cursor syntax, unavailable models and broader authority are reference prose, not commands. Do not copy a retained command until its mapped host behavior, approval and tool support are established.

## Situational routing and deferred behavior

- **how, why, recall and teach:** useful grounding and cited explanations. Search only current-project or specifically authorized sources. Do not fabricate access to Cursor histories or missing MCPs. Children receive standalone prompts because they do not inherit root conversation history.
- **architect, arena, interrogate and reflect:** preserve competing designs, explicit rubrics and skeptical findings. Independent agent identity and candidate binding are required. Model diversity and large panels are optional capabilities reported separately; default source panel/model counts are disabled.
- **feature, refactoring, bug fix, perf, hillclimb and prototype playbooks:** retained worker methods, applied only to bounded approved product work. Prototype code is product write scope, including throwaway code. CTO/lead cannot implement or graft candidates.
- **authoring-a-skill, automate-me, create/maintain-verification-skill:** creation needs relevant current task authorization and project-local scope. No unsolicited automation, user skill installation, runtime helper or separate PR. Verification design does not prove live behavior.
- **autonomous-run, multi-phase-plan, opening-a-pr:** never extend beyond the approved wave or assume publication. Project B-series plan takes precedence over retained plan shape. Missing upstream checker/helper is a gap; do not claim it passed.
- **show-me-your-work, session-pickup, pause-safely:** preserve authentic decision trails, leases, checkpoints and exact resume evidence. One worker's final summary is not acceptance. Cross-model review remains unverified when configuration does not establish it.
- **principles:** retain domain modeling, boundary discipline, simpler design, immutable evidence and independent verification. Never Block on the Human governs routine in-scope choices, not mandatory wave approval. Subtract/migrate/delete principles cannot discard preserved legacy assets. Build the Lever cannot add unauthorized code/tools.

## Evidence limits

Package hashes prove source packaging, not behavior. Installation proves registration, not invocation. A synthetic read-only S001 lead/worker/reviewer rehearsal proves only its observed topology, receipt/verdict behavior and START routing. It cannot prove native Cursor orch-store operation, full product delivery, code editing, Git merge, private-model quality or hostile-code evaluation.

Skill bodies are instructions rather than technical permission enforcement. Devin tool controls, registered profile limits, project approval evidence and exact candidate review must all be verified. No hooks are provided because hooks are best effort and fail open. W001 remains governed by its own unchanged approval record.

