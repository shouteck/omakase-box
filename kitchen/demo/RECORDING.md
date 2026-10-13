# Recording prompt — the BT11b demo

**The usual way is `node kitchen/demo/record.mjs`** — it runs the same replay
for real in the sandbox and leaves one video a person can play (plus a still
per step, the transcript and an index), with no screen, no cloud session and
no recording by hand. The cloud session below is only for someone who wants a
filmed desktop.

Paste the block below into a fresh Devin Cloud session **in desktop mode** (it
needs a screen, a browser and the recorder). It is the whole job.

## What the owner sets up first

- A Devin Cloud session with **desktop mode** enabled.
- Access in that session to `shouteck/omakase-box` (read/build) and
  `shouteck/box-bounty-sandbox` (the only repository the run may touch).
- A GitHub token scoped to the sandbox repository only, provided to the
  session as a secret (e.g. `SANDBOX_GH_TOKEN`). The session never prints it.

## The prompt to paste

> This is a recording job, not kitchen work. Do not act as head chef, do not
> start a wave, do not change any code, and do not commit or push to
> `shouteck/omakase-box`.
>
> 1. Clone `shouteck/omakase-box` and build the tool
>    (`npm ci --prefix scripts/tooling --ignore-scripts`,
>    `node scripts/pnpm.mjs install --frozen-lockfile`,
>    `node scripts/workspace.mjs build`).
> 2. Clone `shouteck/box-bounty-sandbox` beside it.
> 3. Sign `gh` in with the token the owner provides as a secret — it is scoped
>    to the sandbox repository and used only there.
> 4. On the owner's instruction, allow the sandbox repository for box bounty on
>    this machine — and nothing else (`box bounty allow`).
> 5. Start recording with the terminal and a browser both visible.
> 6. Run `node kitchen/demo/bt11b-replay.mjs --real --auto`. It prints one line
>    before each step saying who is acting, and each public page it creates on
>    its own `PAGE <url>` line — bring each of those pages on screen as it is
>    printed (the issue, each pull request, the closed issue).
> 7. Never open the payment link itself — no agent opens it, enters a payment
>    detail, or completes a checkout.
> 8. When the run ends, stop recording and send the recording plus the exact
>    addresses of the pages the run created.

## Notes

- The replay is `kitchen/demo/bt11b-replay.mjs`; its `--real` mode posts a
  fresh test bounty in the sandbox each run and cleans up what it opened.
- On Linux run it in `--standin` mode instead (the transcript in
  `bt11b-transcript.txt` is one stand-in run); real mode on Linux is exactly
  this recording session.
- The run is about a minute at default `--auto` pauses; `--pause` and
  `--url-pause` lengthen the beat if a slower recording reads better.
