# K31b gh-start counter, machine A callers (.\gh).
$log = 'C:\Users\shout\AppData\Local\Temp\box-k31b\gh-logs\machine-a.jsonl'
$safe = ($args -join ' ') -replace '\\','\\' -replace '"','\"'
Add-Content -Path $log -Value ('{"ts":"' + (Get-Date -Format o) + '","cwd":"' + (Get-Location).Path + '","args":"' + $safe + '"}')
& 'C:\Program Files\GitHub CLI\gh.exe' @args
exit $LASTEXITCODE
