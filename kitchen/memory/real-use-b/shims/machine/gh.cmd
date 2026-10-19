@echo off
rem K31b gh-start counter, machine A callers (.\gh). One line == one start.
>>"C:\Users\shout\AppData\Local\Temp\box-k31b\gh-logs\machine-a.jsonl" echo {"ts":"%DATE% %TIME%","cwd":"%CD%","args":"%*"}
"C:\Program Files\GitHub CLI\gh.exe" %*
