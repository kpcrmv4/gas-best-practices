# Check status of gas-best-practices skill (Windows PowerShell)
$ErrorActionPreference = "Stop"

$Dest = Join-Path $HOME ".claude\skills\gas-best-practices"

Write-Host "gas-best-practices status"
Write-Host "========================="

if (-not (Test-Path $Dest)) {
  Write-Host "✗ Not installed" -ForegroundColor Red
  Write-Host "  Install: iwr -useb https://raw.githubusercontent.com/kpcrmv4/gas-best-practices/main/install.ps1 | iex"
  exit 1
}

Write-Host "Location: $Dest"

if (-not (Test-Path (Join-Path $Dest ".git"))) {
  Write-Host "⚠ Installed (not via git — can't check for updates)" -ForegroundColor Yellow
  exit 0
}

Push-Location $Dest

$Current = (git rev-parse --short HEAD).Trim()
$CurrentDate = (git log -1 --format=%cd --date=short).Trim()
try { $Tag = (git describe --tags --abbrev=0 2>$null).Trim() } catch { $Tag = "(no tag)" }
$RuleCount = (Get-ChildItem -Path "rules" -Filter "*.md" -ErrorAction SilentlyContinue).Count

Write-Host "Version : $Tag"
Write-Host "Commit  : $Current ($CurrentDate)"
Write-Host "Rules   : $RuleCount files"

Write-Host ""
Write-Host "-> Checking remote..."
try {
  git fetch --tags origin 2>$null | Out-Null
} catch {
  Write-Host "✗ Cannot reach remote" -ForegroundColor Red
  Pop-Location
  exit 1
}

$Remote = (git rev-parse --short origin/main).Trim()

if ($Current -eq $Remote) {
  Write-Host "✓ Up-to-date" -ForegroundColor Green
} else {
  $Behind = (git rev-list --count "$Current..origin/main").Trim()
  Write-Host "⚠ $Behind commit(s) behind: $Current -> $Remote" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Run to update:"
  Write-Host "  pwsh $Dest\update.ps1"
}

Pop-Location
