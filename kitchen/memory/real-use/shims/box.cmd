@echo off
rem K31 box wrapper for machine A agents (cmd fallback).
set "BOX_BOUNTY_SETTINGS_DIR=C:\Users\shout\AppData\Local\Temp\box-k31\settings-a"
set "PATH=C:\Users\shout\AppData\Local\Temp\box-k31\shim-a;%PATH%"
node "C:\Users\shout\AppData\Local\Temp\box-k31\prefix\node_modules\box-bounty\dist\box.js" %*
