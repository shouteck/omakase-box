# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.
- Run `verify.mjs` from Git Bash on Windows: from PowerShell `cat` and `rm` are not on PATH, so 6 bounty tests fail every time and it reads as a flake (PF11). Candidate: verify refuses, by name, when they are missing.
