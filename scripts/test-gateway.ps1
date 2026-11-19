# ============================================================================
# Smoke test Kong Gateway (DB-less) - http://localhost:8000
# ----------------------------------------------------------------------------
# Kiem tra: health, 15 service co route dung prefix, dang ky/dang nhap/me,
# upload multipart, Stripe webhook (raw body), x-trace-id, (tuy chon) rate-limit.
#
#   pwsh scripts/test-gateway.ps1
#   pwsh scripts/test-gateway.ps1 -IncludeRateLimit   # them 65 request login
#
# Yeu cau: docker compose up -d (gateway + services dang chay).
# ============================================================================
param(
    [string]$Gateway = "http://localhost:8000",
    [switch]$IncludeRateLimit
)

$ErrorActionPreference = "Stop"
$script:fail = 0
$script:pass = 0
$bodyFile = Join-Path $env:TEMP "kong-smoke-body.txt"
$hdrFile = Join-Path $env:TEMP "kong-smoke-headers.txt"

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m) { Write-Host "  [PASS] $m" -ForegroundColor Green; $script:pass++ }
function Bad($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red; $script:fail++ }
function Info($m) { Write-Host "  [INFO] $m" -ForegroundColor Gray }

# Goi curl.exe (GET mac dinh), tra ve HTTP status code; body ghi ra $bodyFile
function CurlCode([string[]]$CurlArgs) {
    Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    $out = & curl.exe -s -o $bodyFile -w "%{http_code}" @CurlArgs
    if (-not $out) { return 0 }
    return [int](($out | Select-Object -Last 1).Trim())
}

function ReadBody {
    if (Test-Path $bodyFile) { return (Get-Content $bodyFile -Raw) }
    return ""
}

# Lay gia tri 1 header tu response (curl -D ghi header ra file)
function ResponseHeader([string]$Name, [string[]]$CurlArgs) {
    & curl.exe -s -o NUL -D $hdrFile @CurlArgs | Out-Null
    $m = Select-String -Path $hdrFile -Pattern "(?im)^$($Name):\s*(.+)$"
    if (-not $m) { return $null }
    return $m.Matches[0].Groups[1].Value.Trim()
}

# ----------------------------------------------------------------------------
Step "1. Gateway health"
try {
    $h = Invoke-RestMethod -Uri "$Gateway/gateway/health" -TimeoutSec 10
    if ($h.message -match "ok") { Ok "GET /gateway/health -> $($h.message)" }
    else { Bad "GET /gateway/health tra ve khong nhu mong doi: $($h | ConvertTo-Json -Compress)" }
}
catch {
    Bad "Khong goi duoc $Gateway/gateway/health - gateway chua chay? ($($_.Exception.Message))"
    Write-Host "`nKhong the tiep tuc." -ForegroundColor Red
    exit 1
}

# ----------------------------------------------------------------------------
Step "2. Route toi 15 service (401/4xx cua service la OK, 404 cua Kong la loi)"
$routes = @(
    "/api/v1/auth/me",
    "/api/v1/consumers/profile",
    "/api/v1/merchants",
    "/api/v1/health",
    "/api/v1/orders",
    "/api/v1/order-change-requests",
    "/api/v1/shipping/fee",
    "/api/v1/inventory",
    "/api/v1/payments",
    "/api/v1/drivers",
    "/api/v1/dispatches",
    "/api/v1/wallets",
    "/api/v1/upload/missing-file.png",
    "/api/v1/reviews",
    "/api/v1/promotions",
    "/api/v1/notifications",
    "/api/v1/cases",
    "/api/v1/assistant/health",
    "/api/v1/penalties",
    "/api/v1/fraud-rules",
    "/api/v1/fraud/suspicious",
    "/api/v1/chat/conversations"
)
foreach ($p in $routes) {
    $code = CurlCode @("--max-time", "20", "$Gateway$p")
    $body = (ReadBody)
    if ($code -eq 0) { Bad "$p -> khong ket noi duoc" }
    elseif ($body -match "no Route matched") { Bad "$p -> Kong 404 (thieu route)" }
    else { Ok "$p -> HTTP $code" }
}

$code = CurlCode @("--max-time", "10", "$Gateway/api/v1/khong-ton-tai")
if ($code -eq 404 -and (ReadBody) -match "no Route matched") { Ok "path la -> Kong 404 dung nhu mong doi" }
else { Bad "path la -> HTTP $code (mong doi 404 cua Kong)" }

# ----------------------------------------------------------------------------
Step "3. Dang ky + dang nhap + /auth/me qua gateway"
$phone = "+849" + (Get-Random -Minimum 10000000 -Maximum 99999999)
$password = "Kong@12345"
$token = $null
try {
    $regBody = @{ phoneNumber = $phone; fullName = "Kong Smoke"; password = $password } | ConvertTo-Json
    $reg = Invoke-RestMethod -Uri "$Gateway/api/v1/auth/register" -Method POST -Body $regBody -ContentType "application/json"
    Ok "register $phone -> id=$($reg.data.id)"
}
catch {
    Bad "register that bai: $($_.Exception.Message)"
}

try {
    $loginBody = @{ phoneNumber = $phone; password = $password } | ConvertTo-Json
    $login = Invoke-RestMethod -Uri "$Gateway/api/v1/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $login.data.accessToken
    Ok "login -> roles=$($login.data.user.roles -join ',')"
}
catch {
    Bad "login that bai: $($_.Exception.Message)"
}

if ($token) {
    try {
        $me = Invoke-RestMethod -Uri "$Gateway/api/v1/auth/me" -Headers @{ Authorization = "Bearer $token" }
        if ($me.data.phone -eq $phone) { Ok "GET /auth/me -> $($me.data.phone) ($($me.data.status))" }
        else { Bad "GET /auth/me tra ve user khac: $($me.data.phone)" }
    }
    catch {
        Bad "GET /auth/me that bai: $($_.Exception.Message)"
    }
}

# ----------------------------------------------------------------------------
Step "4. x-trace-id (correlation-id plugin)"
$custom = "kong-smoke-" + (Get-Random -Minimum 1000 -Maximum 9999)
$sent = ResponseHeader "x-trace-id" @("-H", "x-trace-id: $custom", "--max-time", "15", "$Gateway/api/v1/orders")
if ($sent -eq $custom) { Ok "client gui x-trace-id=$custom -> giu nguyen, khong bi Kong ghi de" }
else { Bad "x-trace-id khong duoc giu nguyen (nhan lai: '$sent')" }

$generated = ResponseHeader "x-trace-id" @("--max-time", "15", "$Gateway/api/v1/orders")
if ($generated -match "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-") { Ok "khong gui header -> Kong sinh UUID ($generated)" }
else { Bad "khong thay x-trace-id dang UUID (nhan lai: '$generated')" }

# ----------------------------------------------------------------------------
Step "5. Upload multipart qua gateway"
if (-not $token) {
    Info "bo qua vi khong co token"
}
else {
    $png = Join-Path $env:TEMP "kong-smoke.png"
    [IO.File]::WriteAllBytes($png, [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="))
    $code = CurlCode @("--max-time", "40", "-X", "POST", "$Gateway/api/v1/upload/image",
        "-H", "Authorization: Bearer $token",
        "-F", "file=@$png;type=image/png",
        "-F", "folder=avatars")
    $body = (ReadBody)
    $json = $null
    try { $json = $body | ConvertFrom-Json } catch { }
    if (($code -eq 200 -or $code -eq 201) -and $json.data.url) {
        Ok "POST /upload/image -> HTTP $code, url=$($json.data.url)"
        if ($json.data.url -like "$Gateway*") { Ok "URL file tro ve gateway (nho UPLOAD_BASE_URL)" }
        else { Bad "URL file khong tro ve gateway: $($json.data.url)" }
    }
    else {
        $snippet = if ($body.Length -gt 200) { $body.Substring(0, 200) } else { $body }
        Bad "upload that bai: HTTP $code $snippet"
    }
}


# ----------------------------------------------------------------------------
Step "6. Stripe webhook (raw body khong bi Kong sua)"
$secret = $null
try { $secret = (& docker exec mythfood-payment-service printenv STRIPE_WEBHOOK_SECRET 2>$null | Out-String).Trim() } catch { }
if (-not $secret -or $secret -notlike "whsec_*") {
    Info "bo qua: khong doc duoc STRIPE_WEBHOOK_SECRET tu container mythfood-payment-service"
}
else {
    $payload = '{"id":"evt_kongsmoke","object":"event","api_version":"2023-10-16","type":"payment_intent.succeeded","data":{"object":{"id":"pi_kongsmoke","object":"payment_intent","metadata":{}}}}'
    $payloadFile = Join-Path $env:TEMP "kong-smoke-webhook.json"
    [IO.File]::WriteAllText($payloadFile, $payload, (New-Object Text.UTF8Encoding($false)))
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $hmac = [System.Security.Cryptography.HMACSHA256]::new()
    $hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
    $sig = (($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$ts.$payload"))) | ForEach-Object { $_.ToString("x2") }) -join ""
    $code = CurlCode @("--max-time", "20", "-X", "POST", "$Gateway/api/v1/payments/webhooks/stripe",
        "-H", "Content-Type: application/json",
        "-H", "stripe-signature: t=$ts,v1=$sig",
        "--data-binary", "@$payloadFile")
    if ($code -eq 200) { Ok "POST /payments/webhooks/stripe -> HTTP 200 (chu ky hop le)" }
    else { Bad "webhook -> HTTP $code $(ReadBody)" }
    Start-Sleep -Seconds 3
    $logs = ""
    # docker logs ghi ra stderr: ha ErrorActionPreference tam thoi de khong bi
    # PowerShell 5.1 coi la loi dung (Stop) va nuot mat output.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { $logs = (& docker logs mythfood-payment-service --since 60s 2>&1 | Out-String) } catch { }
    $ErrorActionPreference = $prevEap
    if ($logs -match "Received Stripe webhook: payment_intent\.succeeded") {
        Ok "payment-service verify chu ky thanh cong => raw body nguyen ven qua Kong"
    }
    else {
        Bad "payment-service khong log 'Received Stripe webhook' - raw body co the bi thay doi"
    }
}

# ----------------------------------------------------------------------------
Step "7. Rate-limit /auth/login (tuy chon)"
if (-not $IncludeRateLimit) {
    Info "bo qua (them -IncludeRateLimit de chay; se chan login trong 60s)"
}
else {
    $first429 = 0
    for ($i = 1; $i -le 70; $i++) {
        $b = @{ phoneNumber = "+84900000000"; password = "wrong-pass" } | ConvertTo-Json
        try {
            Invoke-RestMethod -Uri "$Gateway/api/v1/auth/login" -Method POST -Body $b -ContentType "application/json" | Out-Null
            $code = 200
        }
        catch { $code = $_.Exception.Response.StatusCode.value__ }
        if ($code -eq 429) { $first429 = $i; break }
    }
    if ($first429 -gt 0) { Ok "429 xuat hien o request #$first429 (60 request/phut/IP)" }
    else { Bad "khong thay 429 sau 70 request login" }

    try {
        Invoke-RestMethod -Uri "$Gateway/api/v1/auth/me" -Method GET | Out-Null
        $meCode = 200
    }
    catch { $meCode = $_.Exception.Response.StatusCode.value__ }
    if ($meCode -eq 401) { Ok "/auth/me khong bi chan (401 chu khong phai 429)" }
    else { Bad "/auth/me tra ve $meCode (mong doi 401)" }
}

# ----------------------------------------------------------------------------
Remove-Item -LiteralPath $bodyFile, $hdrFile -Force -ErrorAction SilentlyContinue
Write-Host "`n----------------------------------------" -ForegroundColor Cyan
$color = if ($script:fail -eq 0) { "Green" } else { "Red" }
Write-Host "PASS: $script:pass   FAIL: $script:fail" -ForegroundColor $color
if ($script:fail -gt 0) { exit 1 }
exit 0

