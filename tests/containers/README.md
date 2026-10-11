# tests/containers

Preserved assertions for the frozen hostile-runner path: the M-series public
image profile (`templates/workspaces/public-image-profile.ts`, digest-pinned in
`.execution/evidence/M4.2/`). PLAN.md keeps that path frozen for later stages,
so these tests are kept rather than deleted.

This suite is **not** part of `check` or ordinary verification. Run it
explicitly with `node scripts/pnpm.mjs test:containers`. It needs a local
Docker daemon and the frozen M-series public image present: `image.test.ts`
execs `.execution/evidence/M4.2/public-image.mjs`, which runs `docker image
inspect`; the two release-approval browser tests cover the same frozen
public-image contract path and live here with it.
