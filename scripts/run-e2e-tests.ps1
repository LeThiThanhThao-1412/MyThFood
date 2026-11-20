# MyThFood E2E Test Runner
# Usage: .\scripts\run-e2e-tests.ps1 [consumer|merchant|driver|admin|full-flow|all]
# Example: .\scripts\run-e2e-tests.ps1 all

param(
    [string]$Target = "all"
)

$PlaywrightDir = "$PSScriptRoot\..\test\playwright"
$ReportDir = "$PlaywrightDir\reports"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MyThFood E2E Playwright Test Runner" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ensure dependencies are installed
Write-Host "[1/3] Checking Playwright installation..." -ForegroundColor Yellow
if (-not (Test-Path "$PlaywrightDir\node_modules\.pnpm\@playwright+test")) {
    Write-Host "  Installing @playwright/test..." -ForegroundColor Gray
    Set-Location $PlaywrightDir
    pnpm install --no-frozen-lockfile 2>&1 | Out-Null
    Set-Location $PSScriptRoot\..
}

# Install Playwright browsers if not present
Write-Host "[2/3] Ensuring Playwright browsers are installed..." -ForegroundColor Yellow
Set-Location $PlaywrightDir
npx playwright install chromium 2>&1 | Out-Null
Set-Location $PSScriptRoot\..

# Create reports directory
if (-not (Test-Path $ReportDir)) {
    New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
}

# Run tests
Write-Host "[3/3] Running E2E tests (target: $Target)..." -ForegroundColor Yellow
Write-Host ""

Set-Location $PlaywrightDir

$exitCode = 0
$startTime = Get-Date

switch ($Target.ToLower()) {
    "consumer" {
        Write-Host "--- Running Consumer App Tests ---" -ForegroundColor Green
        npx playwright test --project=consumer --reporter=html,json,line
        $exitCode = $LASTEXITCODE
    }
    "merchant" {
        Write-Host "--- Running Merchant App Tests ---" -ForegroundColor Green
        npx playwright test --project=merchant --reporter=html,json,line
        $exitCode = $LASTEXITCODE
    }
    "driver" {
        Write-Host "--- Running Driver App Tests ---" -ForegroundColor Green
        npx playwright test --project=driver --reporter=html,json,line
        $exitCode = $LASTEXITCODE
    }
    "admin" {
        Write-Host "--- Running Admin Portal Tests ---" -ForegroundColor Green
        npx playwright test --project=admin --reporter=html,json,line
        $exitCode = $LASTEXITCODE
    }
    "full-flow" {
        Write-Host "--- Running Full Flow E2E Tests ---" -ForegroundColor Green
        npx playwright test --project=full-flow --reporter=html,json,line
        $exitCode = $LASTEXITCODE
    }
    default {
        Write-Host "--- Running ALL E2E Tests ---" -ForegroundColor Green
        npx playwright test --reporter=html,json,line
        $exitCode = $LASTEXITCODE
    }
}

$endTime = Get-Date
$duration = $endTime - $startTime

Set-Location $PSScriptRoot\..

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Run Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Target:    $Target" -ForegroundColor White
Write-Host "  Duration:  $($duration.TotalSeconds)s" -ForegroundColor White
Write-Host "  Exit Code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host ""
Write-Host "  Reports:" -ForegroundColor White
Write-Host "    HTML: $ReportDir\html\index.html" -ForegroundColor Gray
Write-Host "    JSON: $ReportDir\results.json" -ForegroundColor Gray
Write-Host ""

exit $exitCode