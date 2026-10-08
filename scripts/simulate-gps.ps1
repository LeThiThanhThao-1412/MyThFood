# ============================================================================
# simulate-gps.ps1 — Mô phỏng GPS tài xế: nội suy tuyến đường thẳng và gửi vị
# trí lên driver-service mỗi `IntervalSec` giây (mặc định 5s) qua
# PATCH /drivers/:id/location. Cuối cùng xác minh lịch sử GPS đã được ghi nhận.
#
# Cách dùng:
#   1) Có sẵn token + driverId:
#      .\simulate-gps.ps1 -DriverId <uuid> -Token <jwt> -StartLat 10.775 -StartLng 106.7 -EndLat 10.778 -EndLng 106.705
#   2) Tự đăng nhập driver rồi tra profile:
#      .\simulate-gps.ps1 -Phone "+84903xxxxxx" -Password "Driver@123"
# ============================================================================

param(
    [string]$DriverId = "",
    [string]$Token = "",
    [string]$Phone = "",
    [string]$Password = "Driver@123",
    [double]$StartLat = 10.775,
    [double]$StartLng = 106.7,
    [double]$EndLat = 10.778,
    [double]$EndLng = 106.705,
    [int]$Steps = 20,
    [int]$IntervalSec = 5,
    [string]$BaseUrl = "http://localhost:3007/api/v1",
    [string]$IdentityUrl = "http://localhost:3001/api/v1"
)

$ErrorActionPreference = "Continue"

function Info($msg) { Write-Host "  [INFO] $msg" -ForegroundColor Gray }
function Pass($msg) { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SIMULATE DRIVER GPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Xác định token
$authToken = $Token
$userId = $null

if (-not $authToken) {
    if (-not $Phone) {
        Fail "Cần cung cấp -Token HOẶC -Phone/-Password để xác thực driver."
        Write-Host "Ví dụ: .\simulate-gps.ps1 -Phone '+84903xxxxxx' -Password 'Driver@123'" -ForegroundColor Yellow
        exit 1
    }
    Info "Đăng nhập driver $Phone ..."
    try {
        $loginBody = @{ phoneNumber = $Phone; password = $Password } | ConvertTo-Json
        $l = Invoke-RestMethod -Uri "$IdentityUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
        $authToken = $l.data.accessToken
        $userId = $l.data.user.id
        Pass "Đăng nhập thành công (userId: $userId)"
    } catch {
        Fail "Đăng nhập thất bại: $($_.Exception.Message)"
        exit 1
    }
} else {
    Info "Sử dụng token có sẵn."
}

$headers = @{ Authorization = "Bearer $authToken"; "Content-Type" = "application/json" }

# 2. Xác định driverId
if (-not $DriverId) {
    if (-not $userId) {
        Fail "Cần cung cấp -DriverId (khi dùng -Token mà không có -Phone)."
        exit 1
    }
    Info "Tra hồ sơ tài xế theo userId: $userId ..."
    try {
        $dp = Invoke-RestMethod -Uri "$BaseUrl/drivers/user/$userId" -Method Get -Headers $headers
        $d = if ($dp.data) { $dp.data } else { $dp }
        $DriverId = $d.id
        Pass "Tìm thấy driver profile: $DriverId"
    } catch {
        Fail "Không tìm được hồ sơ tài xế: $($_.Exception.Message)"
        exit 1
    }
}

# 3. Đảm bảo tài xế ONLINE (domain chỉ cho cập nhật vị trí khi online)
try {
    Invoke-RestMethod -Uri "$BaseUrl/drivers/$DriverId/go-online" -Method Patch -Headers $headers | Out-Null
    Pass "Tài xế đã được bật ONLINE."
} catch {
    Info "go-online: $($_.Exception.Message) (có thể đã online/chưa activate — vẫn tiếp tục)"
}

# 4. Nội suy tuyến đường + gửi vị trí mỗi IntervalSec giây
Info "Nội suy $Steps điểm từ ($StartLat, $StartLng) → ($EndLat, $EndLng), mỗi ${IntervalSec}s ..."

$sent = 0
for ($i = 0; $i -le $Steps; $i++) {
    $t = $i / $Steps
    $lat = $StartLat + ($EndLat - $StartLat) * $t
    $lng = $StartLng + ($EndLng - $StartLng) * $t

    $body = @{ latitude = $lat; longitude = $lng } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "$BaseUrl/drivers/$DriverId/location" -Method Patch -Body $body -Headers $headers -TimeoutSec 10 | Out-Null
        $sent++
        Write-Host ("  [{0,2}/{1}] Gửi ({2}, {3}) -> OK" -f $i, $Steps, ([math]::Round($lat, 6)), ([math]::Round($lng, 6))) -ForegroundColor Green
    } catch {
        Write-Host ("  [{0,2}/{1}] Gửi ({2}, {3}) -> LỖI: {4}" -f $i, $Steps, ([math]::Round($lat, 6)), ([math]::Round($lng, 6)), $_.Exception.Message) -ForegroundColor Red
    }

    if ($i -lt $Steps) {
        Start-Sleep -Seconds $IntervalSec
    }
}

Write-Host ""
Info "Đã gửi $sent/$($Steps + 1) điểm vị trí."

# 5. Xác minh lịch sử GPS đã được ghi nhận
try {
    $hist = Invoke-RestMethod -Uri "$BaseUrl/drivers/$DriverId/location/history?limit=500" -Method Get -Headers $headers
    $points = if ($hist.data) { $hist.data } else { $hist }
    Write-Host ""
    Write-Host "  Lịch sử GPS ghi nhận được: $($points.Count) điểm" -ForegroundColor Cyan
    if ($points.Count -gt 0) {
        $last = $points[$points.Count - 1]
        Write-Host ("  Điểm mới nhất: ({0}, {1}) lúc {2}" -f $last.latitude, $last.longitude, $last.recordedAt) -ForegroundColor Cyan
    }
} catch {
    Info "Không đọc được lịch sử GPS: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Hoàn tất mô phỏng GPS." -ForegroundColor Cyan
