@echo off
rem K31b box wrapper for machine A (cmd / PowerShell callers).
set "BOX_BOUNTY_SETTINGS_DIR=C:\Users\shout\AppData\Local\Temp\box-k31b\settings-a"
set "K31B_GH_LOG=C:\Users\shout\AppData\Local\Temp\box-k31b\gh-logs\machine-a.jsonl"
set "PATH=C:\Users\shout\AppData\Local\Temp\box-k31b\shim;%PATH%"
node "C:\Users\shout\AppData\Local\Temp\box-k31b\prefix\node_modules\box-bounty\dist\box.js" %*
