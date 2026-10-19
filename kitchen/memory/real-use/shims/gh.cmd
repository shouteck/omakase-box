@echo off
rem K31 gh-start counter (cmd fallback). One line appended == one gh start.
if "%K31_GH_LOG%"=="" set "K31_GH_LOG=C:\Users\shout\AppData\Local\Temp\box-k31\gh-logs\unknown.jsonl"
>>"%K31_GH_LOG%" echo {"ts":"%TIME%","cwd":"%CD%","args":"%*"}
"C:\Program Files\GitHub CLI\gh.exe" %*
