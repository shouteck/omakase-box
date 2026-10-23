# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.
- A resource the head chef makes for every agent in a wave (BT43's browser shim) lives outside the session scratchpad, under a `kitchen-<wave>-` name, and every prompt names it as do-not-touch: a cook's scratch cleanup deleted it mid-wave and cost one red verify.
- The file-tools rule (no heredoc, `node -e` or `sed -i` writes) was broken by two BT43 agents a day after it was restated in both role files: text is not holding. Encode it (a pre-tool hook, or a verify check on stray files) through a kitchen wave.
- A cloud Linux host has no Playwright Chromium at the pinned revision; BT43 ran k16 on the host's 1194 dressed as 1243 (the environment says never `playwright install`). Decide the cloud-host browser route once (a K wave or the owner), rather than per wave.
- A security Outcome names its mechanism and its limit, never "no path can": BT43's original Outcome could not be confirmed by any pass, and five passes each found one more site before the owner amended it to guarantees a check can hold. A wave-template line or a brief-check rule.
