# Handoff: <task ID>, attempt <n>

Status: ready_for_review | changes_requested | blocked | accepted
Worker: <runtime identity>
Reviewer: <different identity, or explicitly sequential>
Revision: <Git commit or exact scoped file digest manifest>
Task definition revision: <digest>

## Delivered behaviour and interfaces

Describe the observable result and interface names/versions.

## Changed files

List exact files, shared integration changes and migrations.

## Verification actually performed

Record command, date/time, working directory, exit code, short observed result and evidence path. List unavailable/unexecuted checks separately. Never put secrets or real private fixture contents into a public handoff.

## Review decision

Record challenged criteria, independent reruns, findings, resolution and approval bound to the exact revision. Self-review does not become independent review by changing a role label.

## Limitations and blockers

Record remaining assumptions, demo/live mode, isolation evidence and exact prerequisites. Explain whether the milestone gate is satisfied.

## Next agent

Name successor task IDs, files to read, delivered interfaces, relevant failures and safe resume steps. No prior chat context may be assumed.
