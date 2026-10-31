# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- BT51-ci: Linux-only test faults (a hook with no execute bit, a spy loaded inside the stand-in) reach master unseen because acceptance runs on Windows and the off-machine run only fires after the merge. Consider a guard that fails any test writing a hook without `chmodSync`, or a way to run the Linux check on a wave branch before merging.
