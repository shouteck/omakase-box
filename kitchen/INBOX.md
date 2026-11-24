# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- **A schema bump misses its pinned test** (BT101, twice; once a red hosted run): when `SCHEMA_VERSION` in `packages/box-bounty/store.ts` moves, `bt31-ci.test.ts` pins `user_version`. A kitchen check could fail a diff that moves one without the other. Also full: `kitchen/stations/packaging.md` is at 12,286 of 12,288 bytes, so its next lesson needs a cut first.
