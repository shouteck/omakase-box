@echo off
rem K31b gh-start counter, solver a1. One line == one start.
>>"C:\Users\shout\AppData\Local\Temp\box-k31b\gh-logs\solver-a1.jsonl" echo {"ts":"%DATE% %TIME%","cwd":"%CD%","args":"%*"}
"C:\Program Files\GitHub CLI\gh.exe" %*
