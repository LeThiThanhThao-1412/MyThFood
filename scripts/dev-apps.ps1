<#
.SYNOPSIS
    Launch all MyThFood frontend apps (admin, consumer, driver, merchant)
    each in its own PowerShell window, so you don't have to cd + pnpm dev manually.

.EXAMPLE
    # From the repo root:
    .\scripts\dev-apps.ps1

.NOTES
    Ports are defined in each app's package.json:
      consumer-app -> 4001
      merchant-app -> 4002
      driver-app   -> 4003
      admin-portal -> 4004
#>

$ErrorActionPreference = "Stop"

# Monorepo root = parent of this "scripts" folder
$root = Split-Path -Parent $PSScriptRoot

# app name -> relative path
$apps = [ordered]@{
    "consumer-app" = "apps\consumer-app"   # 4001
    "merchant-app" = "apps\merchant-app"   # 4002
    "driver-app"   = "apps\driver-app"     # 4003
    "admin-portal" = "apps\admin-portal"   # 4004
}

foreach ($name in $apps.Keys) {
    $appDir = Join-Path $root $apps[$name]

    if (-not (Test-Path (Join-Path $appDir "package.json"))) {
        Write-Warning "[$name] package.json not found at: $appDir - skipped"
        continue
    }

    $title = "MyThFood - $name"
    # Inner command runs inside the new window (note the escaped `$host`).
    $command = "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location -LiteralPath '$appDir'; pnpm dev"

    Start-Process -FilePath "powershell" -ArgumentList @("-NoExit", "-NoProfile", "-Command", $command)

    Write-Host "[+] $name -> pnpm dev   ($title)" -ForegroundColor Green
}

Write-Host ""
Write-Host "All 4 apps launched. Close a window (or press Ctrl+C inside it) to stop that app." -ForegroundColor Cyan
