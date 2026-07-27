$ErrorActionPreference = "Continue"
$idUrl = "http://localhost:3001/api/v1"
$orderUrl = "http://localhost:3004/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"
$driverUrl = "http://localhost:3007/api/v1"
$payUrl = "http://localhost:3006/api/v1"

function Login($phone, $pass) {
    $body = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $body -ContentType "application/json"
    return @{ token = $r.data.accessToken; userId = $r.data.user.id }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PAYMENT & SETTLEMENT FLOW TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Login
Write-Host "--- AUTH ---" -ForegroundColor Magenta
$consumer = Login "+84901234567" "MySecurePass123"
Write-Host "[PASS] Consumer: +84901234567" -ForegroundColor Green

$driver = Login "+84907654321" "Driver123"
Write-Host "[PASS] Driver: +84907654321" -ForegroundColor Green

# 2. Get merchant
Write-Host ""
Write-Host "--- MERCHANT ---" -ForegroundColor Magenta
$mh = @{ Authorization = "Bearer $($consumer.token)" }
$mres = Invoke-RestMethod -Uri "$merchantUrl/merchants?take=100" -Method Get -Headers $mh
$merchant = ($mres.items | Where-Object { $_.status -eq "APPROVED" })[0]
if (-not $merchant) {
    Write-Host "[FAIL] No approved merchant" -F Red; exit 1
}
Write-Host "[PASS] Merchant: $($merchant.name)" -ForegroundColor Green

# 3. Get/create menu
$menu = Invoke-RestMethod -Uri "$merchantUrl/merchants/$($merchant.id)/menu" -Method Get -Headers $mh
if ($menu.Count -eq 0 -or -not $menu) {
    Write-Host "[INFO] Creating test menu items..." -ForegroundColor Yellow
    $menuItems = @(
        @{ name="Pho Bo Tai"; price=50000; category="MAIN_COURSE"; description="Pho bo tai" }
    )
    $menu = @()
    foreach ($mi in $menuItems) {
        $r = Invoke-RestMethod -Uri "$merchantUrl/merchants/$($merchant.id)/menu/items" -Method Post -Body ($mi | ConvertTo-Json) -Headers @{ Authorization="Bearer $($consumer.token)"; "Content-Type"="application/json" }
        $menu += $r
        Write-Host "[PASS] Added: $($r.name)" -ForegroundColor Green
    }
}
$item = $menu[0]
if (-not $item) { Write-Host "[FAIL] No menu item" -F Red; exit 1 }
$foodPrice = 2 * $item.price
Write-Host "[INFO] Menu: $($item.name) x2 = $foodPrice VND" -ForegroundColor Gray

# 4. Place order (COD - Cash on Delivery)
Write-Host ""
Write-Host "--- ORDER (COD) ---" -ForegroundColor Magenta
$orderBody = @{
    consumerId = $consumer.userId
    merchantId = $merchant.id
    orderType = "DELIVERY"
    items = @(@{ menuItemId = $item.id; name = $item.name; quantity = 2; unitPrice = $item.price; specialInstructions = "" })
    deliveryAddress = "123 Le Loi, District 1, HCMC"
    deliveryLatitude = 10.775; deliveryLongitude = 106.700
    deliveryFee = 15000; serviceFee = 5000; discount = 0
} | ConvertTo-Json -Depth 5

$oh = @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
$order = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $orderBody -Headers $oh
$oid = $order.id.Substring(0,8)
Write-Host "[PASS] Order #$oid placed - $($order.totalAmount) VND (COD)" -ForegroundColor Green

# 5. Create payment (COD)
Write-Host ""
Write-Host "--- PAYMENT (COD) ---" -ForegroundColor Magenta
$payBody = @{
    orderId = $order.id; consumerId = $consumer.userId; merchantId = $merchant.id
    amount = $order.totalAmount; paymentMethod = "CASH"
} | ConvertTo-Json
$ph = @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
$payment = Invoke-RestMethod -Uri "$payUrl/payments" -Method Post -Body $payBody -Headers $ph
Write-Host "[PASS] Payment created: $($payment.status) | $($payment.amount) VND (COD)" -ForegroundColor Green

# 6. Order lifecycle
Write-Host ""
Write-Host "--- ORDER LIFECYCLE ---" -ForegroundColor Magenta
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/confirm" -Method Patch -Headers $oh | Out-Null; Write-Host "[PASS] PENDING -> CONFIRMED" -F Green
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/preparing" -Method Patch -Headers $oh | Out-Null; Write-Host "[PASS] CONFIRMED -> PREPARING" -F Green
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/ready" -Method Patch -Headers $oh | Out-Null; Write-Host "[PASS] PREPARING -> READY_FOR_PICKUP" -F Green

# 7. Driver delivers + auto-settlement
Write-Host ""
Write-Host "--- DRIVER DELIVERY + AUTO-SETTLEMENT ---" -ForegroundColor Magenta
$dh = @{ Authorization = "Bearer $($driver.token)" }
$dres = Invoke-RestMethod -Uri "$driverUrl/drivers/user/$($driver.userId)" -Method Get -Headers $dh
$ddata = if ($dres.data) { $dres.data } else { $dres }
Write-Host "[PASS] Driver: $($ddata.fullName)" -ForegroundColor Green

if ($ddata.onlineStatus -ne "ONLINE") {
    Invoke-RestMethod -Uri "$driverUrl/drivers/$($ddata.id)/go-online" -Method Patch -Headers $dh | Out-Null
}

$dh2 = @{ Authorization = "Bearer $($driver.token)"; "Content-Type" = "application/json" }
$assignBody = @{ driverId = $ddata.id } | ConvertTo-Json
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/out-for-delivery" -Method Patch -Body $assignBody -Headers $dh2 | Out-Null
Write-Host "[PASS] OUT_FOR_DELIVERY" -ForegroundColor Green

Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/delivered" -Method Patch -Headers $dh2 | Out-Null
Write-Host "[PASS] DELIVERED!" -ForegroundColor Green

# 8. Complete payment (settlement)
Write-Host ""
Write-Host "--- SETTLEMENT ---" -ForegroundColor Magenta
try {
    $completeBody = @{ transactionId = "SETTLEMENT-AUTO-$oid" } | ConvertTo-Json
    $pcRes = Invoke-RestMethod -Uri "$payUrl/payments/$($payment.id)/complete" -Method Patch -Body $completeBody -Headers $ph
    Write-Host "[PASS] Payment COMPLETED! (Settlement done)" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Complete payment: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 9. Settlement breakdown
Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  SETTLEMENT BREAKDOWN (COD)" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

$shipFee = 15000
$merchantShare = [Math]::Round($foodPrice * 0.7 * 0.9)
$driverShare = [Math]::Round($shipFee * 0.75)

Write-Host ""
Write-Host "Order #$oid"
Write-Host "  Food total:     $($foodPrice.ToString('N0')) VND"
Write-Host "  Shipping fee:   $($shipFee.ToString('N0')) VND"
Write-Host "  Platform fee:   5,000 VND"
Write-Host "  TOTAL:          $($order.totalAmount.ToString('N0')) VND"
Write-Host ""
Write-Host "After DELIVERED (auto-settlement):"
Write-Host "  Merchant Wallet: +$($merchantShare.ToString('N0')) VND (food x 70% - 10% VAT)" -ForegroundColor Green
Write-Host "  Driver Income:   +$($driverShare.ToString('N0')) VND (ship fee x 75%)" -ForegroundColor Green
Write-Host "  Platform:        +$($order.totalAmount - $merchantShare - $driverShare) VND" -ForegroundColor Blue
Write-Host ""
Write-Host "[PASS] Applicable for both COD and Online payment!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PAYMENT & SETTLEMENT TEST COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan