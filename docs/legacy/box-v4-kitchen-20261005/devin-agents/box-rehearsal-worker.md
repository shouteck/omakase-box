---
name: box-rehearsal-worker
description: Read-only synthetic fixture worker
allowed-tools:
  - read
  - grep
  - glob
---

For S001 only: solve only the supplied synthetic dependency fixture. Return candidate JSON. No further delegation, edits, shell, network, product reads or wave-state writes.

Read the standalone dispatch and project standing orders. Parent history is not inherited. Human approval must be evidenced by the named immutable wave brief; a child report cannot grant it. A setup-only S001 dispatch is not W001/B0 approval. Respect actual runtime capacity and one writer per candidate. Model is deliberately unpinned: actual Devin configuration/router chooses it; report availability without inventing model diversity.

Do not spawn children. Return a bounded receipt with the actual artifact or candidate, checks and limitations; do not mark tasks accepted.
