# Human wave authority

Approval records represent actual CEO messages, never inferred assent, prepared example messages or coordinator-generated permission. Before execution, freeze the presented brief and record its SHA-256, wave ID, plan version, allowed actions/paths, selected runtime and the actual human message reference or verbatim approval with observed time. Update the active state only after those bindings are verified.

Do not pre-populate approval for W001: it is awaiting its briefing and CEO decision. Approval of the instructions rewrite is not approval of reconciliation or implementation.

A hold stops scheduling and must be followed by an actual CEO resume instruction bound to the same approved brief before work resumes. Append the hold and resume events; do not erase them. If permission was revoked, scope changed or the brief changed, present a revised brief and obtain fresh wave approval. Starting a new session, reading START.md or an elapsed timeout never resumes a held wave.

Approval to execute a wave does not authorize publishing, spending, global changes or production operations excluded from its brief. Independent technical acceptance is separate from human authorization.
