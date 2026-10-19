@echo off
rem K31b gh-start counter for the box tool's own gh calls (the tool resolves
rem 'gh' on PATH and launches the .cmd through cmd.exe). This directory holds
rem ONLY this file: a bare 'gh' shell script here would shadow it and fail a
rem direct CreateProcess. One appended line == one gh process start.
if "%K31B_GH_LOG%"=="" set "K31B_GH_LOG=C:\Users\shout\AppData\Local\Temp\box-k31b\gh-logs\all.jsonl"
>>"%K31B_GH_LOG%" echo {"ts":"%DATE% %TIME%","cwd":"%CD%","args":"%*"}
"C:\Program Files\GitHub CLI\gh.exe" %*
