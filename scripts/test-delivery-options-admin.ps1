# ============================================================================
# E2E: Phase 3 - Admin cấu hình phương thức giao hàng + báo cáo
#
# Kiểm tra:
#  1. GET /shipping/options/config trả 3 phương thức.
#  2. PUT /shipping/options/config/SAVER lưu được maxStackedOrders/feeFactor.
#  3. GET /shipping/quote vẫn báo giá đúng sau khi đổi cấu hình.
#  4. GET /orders/stats/delivery-options trả đủ 3 dòng.
#  5. GET /dispatches/stats/stacking trả thống kê lô gộp.
# ============================================================================

$ErrorActionPreference = "Stop"
$idUrl = "http://localhost:3001/api/v1"
$orderUrl = "http://localhost:3004/api/v1"
$dispatchUrl = "http://localhost:3008/api/v1"

$script:failed = 0
function Assert($condition, $message) {
    if ($condition) {
        Write-Host "  [PASS] $message" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $message" -ForegroundColor Red
        $script:failed++
    }
}

function Login($phone, $pass) {
    $body = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $body -ContentType "application/json"
    return @{ token = $r.data.accessToken; userId = $r.data.user.id }
}

Write-Host "`n=== DELIVERY OPTIONS PHASE 3 ===" -ForegroundColor Cyan

$admin = Login "+84901112233" "Admin@123"
$auth = @{ Authorization = "Bearer $($admin.token)" }
$authJson = @{ Authorization = "Bearer $($admin.token)"; "Content-Type" = "application/json" }

Write-Host "`n[1] GET /shipping/options/config" -ForegroundColor Magenta
$configRes = Invoke-RestMethod -Uri "$orderUrl/shipping/options/config" -Headers $auth
$configs = @($configRes.data)
Assert ($configs.Count -eq 3) "có 3 cấu hình phương thức"
$saver = $configs | Where-Object { $_.option -eq "SAVER" } | Select-Object -First 1
Assert ($null -ne $saver) "có cấu hình SAVER"
if ($saver) {
    Assert ([int]$saver.maxStackedOrders -ge 1) "SAVER có maxStackedOrders hợp lệ"
}

Write-Host "`n[2] PUT /shipping/options/config/SAVER" -ForegroundColor Magenta
$body = @{
    feeFactor = 0.8
    maxStackedOrders = 3
    dispatchTimeoutSeconds = 600
    driverResponseTimeoutSeconds = 90
} | ConvertTo-Json
$updated = Invoke-RestMethod -Uri "$orderUrl/shipping/options/config/SAVER" -Method Put -Body $body -Headers $authJson
$updatedData = if ($updated.data) { $updated.data } else { $updated }
Assert ($updatedData.option -eq "SAVER") "lưu cấu hình SAVER thành công"
Assert ([int]$updatedData.maxStackedOrders -eq 3) "SAVER maxStackedOrders = 3"
Assert ([double]$updatedData.feeFactor -eq 0.8) "SAVER feeFactor = 0.8"

Write-Host "`n[3] GET /shipping/quote sau cấu hình" -ForegroundColor Magenta
$quote = Invoke-RestMethod -Uri "$orderUrl/shipping/quote?originLat=10.77&originLng=106.7&destLat=10.78&destLng=106.71" -Headers $auth
$options = @{}
foreach ($o in $quote.options) { $options[$o.option] = $o }
Assert ($options.Count -eq 3) "quote trả 3 phương thức"
Assert ([double]$options["SAVER"].fee -lt [double]$options["FAST"].fee) "SAVER vẫn rẻ hơn FAST"
Assert ([double]$options["PRIORITY"].fee -gt [double]$options["FAST"].fee) "PRIORITY vẫn đắt hơn FAST"

Write-Host "`n[4] GET /orders/stats/delivery-options" -ForegroundColor Magenta
$statsRes = Invoke-RestMethod -Uri "$orderUrl/orders/stats/delivery-options?days=30" -Headers $auth
$stats = @($statsRes.data)
Assert ($stats.Count -eq 3) "thống kê trả đủ 3 phương thức"
Assert (($stats | Where-Object { $_.deliveryOption -eq "PRIORITY" }).Count -eq 1) "có dòng PRIORITY"

Write-Host "`n[5] GET /dispatches/stats/stacking" -ForegroundColor Magenta
$stackingRes = Invoke-RestMethod -Uri "$dispatchUrl/dispatches/stats/stacking?days=30" -Headers $auth
$stacking = if ($stackingRes.data) { $stackingRes.data } else { $stackingRes }
Assert ($null -ne $stacking) "có thống kê stacking"
Assert ($null -ne $stacking.totalDispatches) "có totalDispatches"
Write-Host "  batches=$($stacking.batches) stacked=$($stacking.stackedDispatches) total=$($stacking.totalDispatches)" -ForegroundColor DarkGray

$result = if ($script:failed -eq 0) { "TẤT CẢ PASS" } else { "$script:failed FAIL" }
Write-Host "`n=== KẾT QUẢ: $result ===" -ForegroundColor $(if ($script:failed -eq 0) { "Green" } else { "Red" })
if ($script:failed -gt 0) { exit 1 }
