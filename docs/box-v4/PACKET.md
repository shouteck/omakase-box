# Instructions packet and preservation boundary

The active instructions are already installed in this project. The accompanying ZIP is an instructions-only backup and transfer packet, not a runnable application checkout. It excludes product source, dependencies, runtime data, credentials and Git internals.

Use the live project state when resuming work. Do not extract an older packet over an active execution state, wave approval, handoff or candidate: that can erase later progress. For transfer into another checkout, inspect its current instructions and progress, reconcile versions and copy only the explicitly selected governance files.

The legacy snapshot is historical evidence. Its START.md, AGENTS.md, task graph and state must not become the active plan. ACTIVE_PLAN.json selects the Box V4 graph and state. The old product work remains in the live checkout and must be audited/reused rather than replaced by this packet.

The source supplement is copied unchanged for agents to read. Its design narrative does not grant operational permission. Native pstack installation, activation, orchestration runtime and dispatch remain unverified; writing these instructions does not install or activate them.
