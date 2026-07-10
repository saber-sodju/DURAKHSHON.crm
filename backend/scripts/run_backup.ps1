# Daily backup runner — invoked by a Windows Scheduled Task.
# Fetches the live production DB's public connection string from Railway CLI
# (this machine must stay logged in to `railway`) and runs backup_db.py.

$ErrorActionPreference = "Stop"
$repoRoot = "C:\Users\PC\durakhshon"
$backend = "$repoRoot\backend"
$logFile = "$backend\backups\backup.log"

New-Item -ItemType Directory -Force -Path "$backend\backups" | Out-Null

Set-Location $repoRoot
$line = railway variables --service Postgres-1xMA --kv 2>$null | Select-String '^DATABASE_PUBLIC_URL='
if (-not $line) {
    "$(Get-Date -Format s)  ERROR: could not fetch DATABASE_PUBLIC_URL from Railway CLI (not logged in?)" |
        Out-File -Append $logFile
    exit 1
}
$dbUrl = ($line -split '=', 2)[1]

$env:DATABASE_URL = $dbUrl
$output = & "$backend\.venv\Scripts\python.exe" "$backend\scripts\backup_db.py" --keep 30 2>&1
"$(Get-Date -Format s)  $output" | Out-File -Append $logFile
