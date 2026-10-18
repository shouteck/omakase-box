# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- Heredoc file writes (`cat > f <<'EOF'`) mangled `\\` sequences on this host — a BT34 cook's copied regexes were caught only by the byte-diff Done-when. Prefer the editor tools for backslash-heavy source; consider a pre-commit or guard-test check if it recurs.
