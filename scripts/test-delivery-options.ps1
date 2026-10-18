# ============================================================================
# E2E: Phương thức giao hàng (SAVER / FAST / PRIORITY) - Phase 1
#
# Kiểm tra:
#  1. GET /shipping/quote trả đủ 3 phương thức.
#  2. Tạo đơn PRIORITY: priorityRank = 2, promisedDeliveryAt có giá trị,
#     phí do server tính lại.
#  3. Nhà hàng xác nhận -> chuẩn bị -> sẵn sàng: dispatch có deliveryOption
#     PRIORITY, priorityRank = 2.
#  4. Hàng đợi nhà hàng trả đơn ưu tiên trước.
#
# Yêu cầu: stack đang chạy (identity 3001, merchant 3003, order 3004,
# dispatch 3008) và dữ liệu seed có tài khoản bên dưới.
# ============================================================================

$ErrorActionPreference = "Stop"
$idUrl = "http://localhost:3001/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"
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

Write-Host "`n=== DELIVERY OPTIONS PHASE 1 ===" -ForegroundColor Cyan

$consumer = Login "+84901234567" "MyFood@123"
$merchant = Login "+84902334455" "MyFood@123"
$ch = @{ Authorization = "Bearer $($consumer.token)" }
$mh = @{ Authorization = "Bearer $($merchant.token)" }
$mhJson = @{ Authorization = "Bearer $($merchant.token)"; "Content-Type" = "application/json" }

$mres = Invoke-RestMethod -Uri "$merchantUrl/merchants?take=100" -Headers $mh
$m = ($mres.items | Where-Object { $_.userId -eq $merchant.userId }) | Select-Object -First 1
if (-not $m) { throw "Không tìm thấy nhà hàng của tài khoản test" }

$menu = Invoke-RestMethod -Uri "$merchantUrl/merchants/$($m.id)/menu" -Headers $mh
if (-not $menu -or $menu.Count -eq 0) { throw "Nhà hàng chưa có món để test" }
$item = $menu[0]

$originLat = if ($m.latitude) { [double]$m.latitude } else { 10.77 }
$originLng = if ($m.longitude) { [double]$m.longitude } else { 106.7 }
$destLat = 10.78
$destLng = 106.71

# ── 1. Quote ────────────────────────────────────────────────────────────────
Write-Host "`n[1] GET /shipping/quote" -ForegroundColor Magenta
$q = Invoke-RestMethod -Uri "$orderUrl/shipping/quote?originLat=$originLat&originLng=$originLng&destLat=$destLat&destLng=$destLng" -Headers $ch
Assert ($q.options.Count -eq 3) "quote trả đủ 3 phương thức"
$options = @{}
foreach ($o in $q.options) { $options[$o.option] = $o }
Assert ($options.ContainsKey("SAVER") -and $options.ContainsKey("FAST") -and $options.ContainsKey("PRIORITY")) "có SAVER / FAST / PRIORITY"
Assert ($options["SAVER"].fee -lt $options["FAST"].fee) "SAVER rẻ hơn FAST"
Assert ($options["PRIORITY"].fee -gt $options["FAST"].fee) "PRIORITY đắt hơn FAST"
Assert ($options["SAVER"].etaMinutes -gt $options["FAST"].etaMinutes) "SAVER ETA lâu hơn FAST"

$standardFee = [double]$options["FAST"].fee
$expectedPriority = [Math]::Min([Math]::Round($standardFee * 1.3) + 10000, 120000)
Assert ([double]$options["PRIORITY"].fee -eq $expectedPriority) "PRIORITY fee = 1.3 x FAST + 10.000"

# ── 2. Tạo đơn PRIORITY ────────────────────────────────────────────────────
Write-Host "`n[2] Tạo đơn PRIORITY" -ForegroundColor Magenta

# Case 2: mỗi khách chỉ có 1 đơn đang hoạt động → dọn đơn cũ trước khi test.
try {
    $activeStatuses = @("PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY")
    $existing = Invoke-RestMethod -Uri "$orderUrl/orders/consumer/$($consumer.userId)" -Headers $ch
    foreach ($e in @($existing | Where-Object { $activeStatuses -contains $_.status })) {
        try {
            $cancelBody = @{ reason = "delivery-option test cleanup" } | ConvertTo-Json
            Invoke-RestMethod -Uri "$orderUrl/orders/$($e.id)/cancel" -Method Patch -Body $cancelBody -Headers @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" } | Out-Null
            Write-Host "  [CLEANUP] hủy đơn cũ $($e.id)" -ForegroundColor Yellow
        } catch {
            Write-Host "  [CLEANUP] không hủy được $($e.id): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  [CLEANUP] bỏ qua (không đọc được đơn cũ)" -ForegroundColor Yellow
}

$orderBody = @{
    consumerId = $consumer.userId
    merchantId = $m.id
    orderType = "DELIVERY"
    paymentMethod = "CASH"
    items = @(@{
        menuItemId = $item.id
        name = $item.name
        quantity = 1
        unitPrice = $item.price
        specialInstructions = "delivery-option test"
    })
    deliveryAddress = "123 Le Loi, Q1, HCMC"
    deliveryLatitude = $destLat
    deliveryLongitude = $destLng
    deliveryFee = $options["PRIORITY"].fee
    serviceFee = 2000
    discount = 0
    deliveryOption = "PRIORITY"
} | ConvertTo-Json -Depth 6

$order = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $orderBody -Headers @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
Assert ($order.deliveryOption -eq "PRIORITY") "order.deliveryOption = PRIORITY"
Assert ([int]$order.priorityRank -eq 2) "order.priorityRank = 2"
Assert ($null -ne $order.promisedDeliveryAt) "order.promisedDeliveryAt có giá trị"
Assert ([double]$order.deliveryFee -gt 0) "order.deliveryFee được server tính"
Write-Host "  Order: $($order.id) | fee=$($order.deliveryFee) | promised=$($order.promisedDeliveryAt)" -ForegroundColor DarkGray

# ── 3. Merchant xử lý -> dispatch ──────────────────────────────────────────
Write-Host "`n[3] Merchant ready -> dispatch" -ForegroundColor Magenta
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/confirm" -Method Patch -Headers $mhJson | Out-Null
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/preparing" -Method Patch -Headers $mhJson | Out-Null
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/ready" -Method Patch -Headers $mhJson | Out-Null
Start-Sleep -Seconds 1

$d = Invoke-RestMethod -Uri "$dispatchUrl/dispatches/order/$($order.id)" -Headers $mh
$dispatch = if ($d.data) { $d.data } else { $d }
Assert ($null -ne $dispatch) "dispatch đã được tạo"
Assert ($dispatch.deliveryOption -eq "PRIORITY") "dispatch.deliveryOption = PRIORITY"
Assert ([int]$dispatch.priorityRank -eq 2) "dispatch.priorityRank = 2"

# ── 4. Hàng đợi nhà hàng ───────────────────────────────────────────────────
Write-Host "`n[4] Hàng đợi nhà hàng" -ForegroundColor Magenta
$queue = Invoke-RestMethod -Uri "$orderUrl/orders/merchant/$($m.id)" -Headers $mh
$openStatuses = @("PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP")
$open = @($queue | Where-Object { $openStatuses -contains $_.status })
Assert ($open.Count -gt 0) "có đơn đang mở trong hàng đợi"
if ($open.Count -gt 0) {
    $first = $open[0]
    $maxRank = ($open | Measure-Object -Property priorityRank -Maximum).Maximum
    Assert ([int]$first.priorityRank -eq [int]$maxRank) "đơn đầu hàng đợi có priorityRank cao nhất"
    Assert ($first.deliveryOption -eq "PRIORITY") "đơn PRIORITY đứng đầu hàng đợi"
}

# Dọn đơn test để lần chạy sau không vướng rule "1 đơn đang hoạt động".
try {
    $cancelBody = @{ reason = "delivery-option test cleanup" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/cancel" -Method Patch -Body $cancelBody -Headers $mhJson | Out-Null
    Write-Host "  [CLEANUP] đã hủy đơn test $($order.id)" -ForegroundColor Yellow
} catch {
    Write-Host "  [CLEANUP] không hủy được đơn test: $($_.Exception.Message)" -ForegroundColor Yellow
}

$result = if ($script:failed -eq 0) { "TẤT CẢ PASS" } else { "$script:failed FAIL" }
Write-Host "`n=== KẾT QUẢ: $result ===" -ForegroundColor $(if ($script:failed -eq 0) { "Green" } else { "Red" })
if ($script:failed -gt 0) { exit 1 }
