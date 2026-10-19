# K31b box wrapper for machine A (PowerShell callers).
$env:BOX_BOUNTY_SETTINGS_DIR = 'C:\Users\shout\AppData\Local\Temp\box-k31b\settings-a'
$env:K31B_GH_LOG = 'C:\Users\shout\AppData\Local\Temp\box-k31b\gh-logs\machine-a.jsonl'
$env:PATH = 'C:\Users\shout\AppData\Local\Temp\box-k31b\shim;' + $env:PATH
& node 'C:\Users\shout\AppData\Local\Temp\box-k31b\prefix\node_modules\box-bounty\dist\box.js' @args
exit $LASTEXITCODE
