# Native TypeScript calibration preregistration

Written before new native checks are executed. No native runner evidence is claimed.

Prediction: an inspector preload can record the exact generated script bodies from tsx/AVA/vitest without rewriting the project's module system. V8 script IDs associate coverage with those bodies. Source-map-cache data must match the actual inline map or immutable local map; embedded original content must hash-match the read-only base+test snapshot. Mapped executed generated statements seed only original executable syntax, excluding interface/type/ambient declarations and generated helper-only statements. Static import/reexport graph remains a separately measured compiler graph. Native configuration and inherited compiler options remain unchanged.

Hostile known-answer checks will reject an out-of-tree map source, changed embedded original content, generated-body hash mismatch, malformed ranges and mismatched actual/cached map. Comment/type-only modules must remain unseeded. Any failure refutes readiness; missing captured worker scripts or missing maps are explicit unknowns rather than empty execution lists. Project dependency versions and lock hashes must be frozen separately before admission.
