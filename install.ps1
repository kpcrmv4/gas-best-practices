# Install gas-best-practices skill for Claude Code (Windows PowerShell)
$ErrorActionPreference = "Stop"

$Repo = if ($env:GAS_BP_REPO) { $env:GAS_BP_REPO } else { "https://github.com/kpcrmv4/gas-best-practices" }
$Dest = Join-Path $HOME ".claude\skills\gas-best-practices"

Write-Host "Installing gas-best-practices skill..."
New-Item -ItemType Directory -Force -Path (Split-Path $Dest) | Out-Null

if (Test-Path $Dest) {
  Write-Host "-> existing install found, updating..."
  Push-Location $Dest
  git pull --ff-only
  Pop-Location
} else {
  git clone --depth 1 $Repo $Dest
}

Write-Host ""
Write-Host "✓ Installed at: $Dest"
Write-Host ""
Write-Host "Restart Claude Code. The skill will auto-trigger when:"
Write-Host "  - Your project contains .clasp.json or appsscript.json"
Write-Host "  - You edit .gs / .js files in a clasp project"
Write-Host "  - You mention Google Apps Script / GAS / clasp"
