# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- BT46: a scratch script ended in `rm -rf` on a junction to %TEMP%; caught before it ran. Remove a link with `rmdir` or `fs.rmdirSync`, and never point a test link at a folder the kitchen does not own: a role-file line.
