# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.
- Never `sed -i` a CRLF file: it rewrote all of `bt22.test.ts`'s line endings in PF15 and buried one changed line in a 522-line diff. Candidate: the Windows note in `kitchen/roles/cto.md`.
