# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- A verify that fails only on 30 s timeouts in files the diff does not touch: check host load (free memory, heavy apps) before re-running, and re-run on a quiet host instead of parking. BT44 went red three times on a busy host and green in 876 s on a quiet one.
- reviewer.md (and worker.md): write the Result with the file tools, never a `node -e` or heredoc in Bash. Backticks inside such a command run as commands. BT44's pass left a stray `node.exe` waiting on stdin.
