# Update gas-best-practices skill to the latest version (Windows PowerShell)
$ErrorActionPreference = "Stop"

$Dest = Join-Path $HOME ".claude\skills\gas-best-practices"

if (-not (Test-Path (Join-Path $Dest ".git"))) {
  Write-Host "✗ Skill not installed via git at: $Dest" -ForegroundColor Red
  Write-Host "  Run install.ps1 to install first."
  exit 1
}

Push-Location $Dest

$Before = (git rev-parse --short HEAD).Trim()
Write-Host "-> Current: $Before"
Write-Host "-> Fetching from origin..."
git fetch --tags origin | Out-Null

$AfterRemote = (git rev-parse --short origin/main).Trim()

if ($Before -eq $AfterRemote) {
  Write-Host "✓ Already up-to-date ($Before)" -ForegroundColor Green
  Pop-Location
  exit 0
}

Write-Host "-> Updates available: $Before -> $AfterRemote"
Write-Host ""
Write-Host "Changes:"
git log --oneline "$Before..origin/main" | Select-Object -First 20
Write-Host ""

git pull --ff-only origin main
$After = (git rev-parse --short HEAD).Trim()

Write-Host ""
Write-Host "✓ Updated: $Before -> $After" -ForegroundColor Green
Write-Host "  Restart Claude Code to reload the skill."

Pop-Location
