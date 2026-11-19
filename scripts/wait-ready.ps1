# =============================================================================
# KIỂM TRA SẴN SÀNG — hiện thực hoá bốn cổng của giao thức §2.2
#
#   Cổng 1  liveness   : 17 container (15 backend + postgres + redis) healthy
#   Cổng 2  readiness  : 13 CSDL nghiệp vụ trả lời SELECT 1 (+ mythfood_identity)
#   Cổng 3  nghiệp vụ  : GET /api/v1/orders không token phải trả 401
#   Cổng 4  W0         : k6/w0-smoke.js, 1 VU / 30 s, 0 lỗi
#
# Cách dùng:
#   .\scripts\wait-ready.ps1                       # đủ bốn cổng
#   .\scripts\wait-ready.ps1 -SkipSmoke            # bỏ cổng 4 (nhanh)
#   .\scripts\wait-ready.ps1 -Since $t0            # trả thêm thời gian khởi động
#
# Trả về một hashtable: HealthyCount, StartupSeconds, DbOk, SmokeOk.
# =============================================================================
[CmdletBinding()]
param(
    [int]$DeadlineMinutes = 10,
    [switch]$SkipSmoke,
    [datetime]$Since = [datetime]::MinValue
)

# Xem ghi chú ở harness.ps1: docker ghi cảnh báo ra stderr, không được để
# PowerShell biến chúng thành lỗi dừng script.
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFiles = @('-f', 'docker-compose.yml', '-f', 'docker-compose.research.yml')

$protocolDbs = @('consumer', 'merchant', 'order', 'inventory', 'payment', 'driver',
                 'dispatch', 'wallet', 'review', 'promotion', 'notification',
                 'resolution', 'chat')
$allDbs = @('identity') + $protocolDbs   # identity cần cho đăng nhập của k6

Write-Host '[Cổng 1] liveness: đợi 17 container healthy...' -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes($DeadlineMinutes)
$healthy = 0
do {
    $healthy = @(docker compose @composeFiles ps --format '{{.Health}}' 2>$null |
                 Where-Object { $_ -eq 'healthy' }).Count
    if ($healthy -ge 17) { break }
    Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)
if ($healthy -lt 17) { throw "Không đủ 17 container healthy (đang có $healthy) — dừng run và ghi lý do vào nhật ký." }
Write-Host "  ok  $healthy/17 healthy" -ForegroundColor DarkGray

Write-Host '[Cổng 2] readiness: 14 CSDL trả lời...' -ForegroundColor Cyan
foreach ($db in $allDbs) {
    $value = (docker exec mythfood-postgres psql -U mythfood -d "mythfood_$db" -tAc 'SELECT 1' | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $value -ne '1') { throw "CSDL mythfood_$db chưa sẵn sàng (nhận '$value')." }
}
Write-Host "  ok  $($allDbs.Count)/$($allDbs.Count) CSDL (giao thức liệt kê 13; identity kiểm thêm cho đăng nhập)" -ForegroundColor DarkGray

Write-Host '[Cổng 3] nghiệp vụ: GET /api/v1/orders phải trả 401...' -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 'http://localhost:3004/api/v1/orders'
    $code = [int]$response.StatusCode
} catch {
    $code = [int]$_.Exception.Response.StatusCode
}
if ($code -ne 401) { throw "Kỳ vọng 401 ở GET /api/v1/orders, nhận $code (guard/route chưa nạp)." }
Write-Host '  ok  401' -ForegroundColor DarkGray

$smokeOk = $null
if (-not $SkipSmoke) {
    Write-Host '[Cổng 4] W0: k6 smoke 1 VU / 30 s, yêu cầu 0 lỗi...' -ForegroundColor Cyan
    $log = Join-Path $env:TEMP "w0-smoke-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
    docker compose @composeFiles --profile load run --rm -e RUN_ID=W0-smoke k6 run /work/w0-smoke.js *> $log
    $smokeExit = $LASTEXITCODE
    $content = Get-Content -LiteralPath $log -Raw
    $failedLine = ($content -split "`n" | Where-Object { $_ -match 'http_req_failed' } | Select-Object -First 1)
    Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
    if ($smokeExit -ne 0) { throw "W0 thất bại (mã thoát $smokeExit). Dòng http_req_failed: $failedLine" }
    $smokeOk = $true
    Write-Host ("  ok  W0 (mã thoát 0) {0}" -f ($failedLine -replace '\s+', ' ').Trim()) -ForegroundColor DarkGray
}

$startupSeconds = $null
if ($Since -ne [datetime]::MinValue) {
    $startupSeconds = [math]::Round(((Get-Date) - $Since).TotalSeconds, 1)
    Write-Host ("  thời gian từ mốc -Since đến khi qua cổng: {0} s" -f $startupSeconds) -ForegroundColor DarkGray
}

[pscustomobject]@{
    HealthyCount   = $healthy
    DbOk           = $allDbs.Count
    SmokeOk        = $smokeOk
    StartupSeconds = $startupSeconds
}
