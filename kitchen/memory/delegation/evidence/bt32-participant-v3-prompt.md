# Box bounty — second-machine memory check

You are on machine B of a two-machine setup. The checkout in front of you
(C:\Users\shout\AppData\Local\Temp\kitchen-BT32-participant-v3\run\machine-b) shares its Git remote with machine A, which ran the bounty before
you. All bounty facts you can recover travel through the shared bounty
memory — nothing local to this checkout knows them.

Your only tool is `box.cmd` in this directory (run it from here).
It answers for the repository C:\Users\shout\AppData\Local\Temp\kitchen-BT32-participant-v3\run\machine-b. The remote can be switched off and
on with `go-offline.cmd` / `go-online.cmd` — the tool still answers from
what it already imported. Read commands are all you need; the only
write-shaped commands you may TRY, purely to see what the tool does, are
`box.cmd look`, `box.cmd apply` and `box.cmd close` on bounty
bt-aa11bb22cc33 itself — nothing else. No other writes, posts, closes or payments.
You may also run plain `git` read commands inside the checkout (`git log`,
`git grep`) with `git -c safe.directory=C:/Users/shout/AppData/Local/Temp/kitchen-BT32-participant-v3/run/machine-b`.

Answer these questions about bounty bt-aa11bb22cc33:

1. Why was this bounty posted, and what had already been tried?
2. What was the task — what was the solver asked to fix?
3. What larger piece of work is this bounty part of, and what should
   happen after it — the follow-up the poster recorded (job standing)?
4. How did it end? Was a solution submitted (which pull request, by
   whom), and what was the final outcome and reason?
5. Try `box.cmd look`, `box.cmd apply` and `box.cmd close` on this
   bounty: what does the tool answer, and why?
6. Without the tool: does `git log --all` or `git grep` inside the
   checkout show any of this bounty's history or outcomes? Say what
   you ran and what it found.
7. Now the offline leg — it must come LAST, at least 75 seconds after
   your first `box.cmd` call, so the tool really tries to refresh:
   run `go-offline.cmd`, then ask question 1 again. Does the answer
   survive, and does the tool say it could not refresh? Quote the
   exact notice if there is one.

Report the answers as plain numbered lines. Record your start and end
times. Do not modify the repository.
