$ErrorActionPreference = "Continue"
$idUrl = "http://localhost:3001/api/v1"
$orderUrl = "http://localhost:3004/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"
$driverUrl = "http://localhost:3007/api/v1"
$payUrl = "http://localhost:3006/api/v1"

$report = @()
$allPass = $true

function Log($msg, $status) {
    $global:report += "[$status] $msg"
    $color = if ($status -eq "PASS") { "Green" } elseif ($status -eq "FAIL") { "Red" } else { "Gray" }
    Write-Host "[$status] $msg" -ForegroundColor $color
    if ($status -eq "FAIL") { $global:allPass = $false }
}

function Login($phone, $pass) {
    $body = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $body -ContentType "application/json"
        return @{ token = $r.data.accessToken; userId = $r.data.user.id }
    } catch { return $null }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MYTHFOOD FULL SYSTEM TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ══════════════════════════════════════════════════════
# 1. AUTH FLOW
# ══════════════════════════════════════════════════════
Log "=== 1. AUTH FLOW ===" "INFO"

$consumer = Login "+84901234567" "MySecurePass123"
if ($consumer) { Log "Consumer login (+84901234567)" "PASS" } else { Log "Consumer login" "FAIL" }

$driver = Login "+84907654321" "Driver123"
if ($driver) { Log "Driver login (+84907654321)" "PASS" } else { Log "Driver login" "FAIL" }

$admin = Login "+84901112233" "Admin123"
if ($admin) { Log "Admin login (+84901112233)" "PASS" } else { Log "Admin login" "FAIL" }

# ══════════════════════════════════════════════════════
# 2. MERCHANT FLOW
# ══════════════════════════════════════════════════════
Log "=== 2. MERCHANT FLOW ===" "INFO"

$mh = @{ Authorization = "Bearer $($consumer.token)" }
try {
    $mres = Invoke-RestMethod -Uri "$merchantUrl/merchants?take=100" -Method Get -Headers $mh
    $merchant = ($mres.items | Where-Object { $_.status -eq "APPROVED" })[0]
    if ($merchant) {
        Log "Merchant found: $($merchant.name) ($($merchant.status))" "PASS"
    } else {
        Log "No approved merchant found" "FAIL"
    }
} catch { Log "Merchant search: $($_.Exception.Message)" "FAIL" }

# Menu
if ($merchant) {
    $menu = Invoke-RestMethod -Uri "$merchantUrl/merchants/$($merchant.id)/menu" -Method Get -Headers $mh
    if ($menu.Count -gt 0 -and $menu) {
        Log "Menu items: $($menu.Count)" "PASS"
    } else {
        Log "Creating test menu..." "INFO"
        $mi = @{ name="Pho Bo Tai"; price=50000; category="MAIN_COURSE"; description="Pho bo tai" } | ConvertTo-Json
        try {
            $r = Invoke-RestMethod -Uri "$merchantUrl/merchants/$($merchant.id)/menu/items" -Method Post -Body $mi -Headers @{ Authorization="Bearer $($consumer.token)"; "Content-Type"="application/json" }
            Log "Created menu: $($r.name)" "PASS"
            $menu = @($r)
        } catch { Log "Menu creation failed" "FAIL" }
    }
}

# ══════════════════════════════════════════════════════
# 3. DRIVER FLOW
# ══════════════════════════════════════════════════════
Log "=== 3. DRIVER FLOW ===" "INFO"

$dh = @{ Authorization = "Bearer $($driver.token)" }
try {
    $dres = Invoke-RestMethod -Uri "$driverUrl/drivers/user/$($driver.userId)" -Method Get -Headers $dh
    $ddata = if ($dres.data) { $dres.data } else { $dres }
    Log "Driver found: $($ddata.fullName) ($($ddata.status))" "PASS"

    if ($ddata.onlineStatus -ne "ONLINE") {
        try {
            Invoke-RestMethod -Uri "$driverUrl/drivers/$($ddata.id)/go-online" -Method Patch -Headers $dh | Out-Null
            Log "Driver now ONLINE" "PASS"
        } catch { Log "Go online failed" "FAIL" }
    } else {
        Log "Driver already ONLINE" "PASS"
    }
} catch { Log "Driver search: $($_.Exception.Message)" "FAIL" }

# ══════════════════════════════════════════════════════
# 4. ORDER FLOW
# ══════════════════════════════════════════════════════
Log "=== 4. ORDER FLOW ===" "INFO"

if ($merchant -and $menu -and $menu[0]) {
    $item = $menu[0]
    $orderBody = @{
        consumerId = $consumer.userId
        merchantId = $merchant.id
        orderType = "DELIVERY"
        items = @(@{ menuItemId = $item.id; name = $item.name; quantity = 2; unitPrice = $item.price; specialInstructions = "" })
        deliveryAddress = "123 Le Loi, District 1, HCMC"
        deliveryFee = 15000; serviceFee = 5000; discount = 0
    } | ConvertTo-Json -Depth 5

    $oh = @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
    try {
        $order = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $orderBody -Headers $oh
        $oid = $order.id.Substring(0,8)
        Log "Order #$oid placed ($($order.totalAmount) VND)" "PASS"
    } catch { Log "Order placement: $($_.Exception.Message)" "FAIL"; $order = $null }
}

# ══════════════════════════════════════════════════════
# 5. PAYMENT FLOW (COD)
# ══════════════════════════════════════════════════════
Log "=== 5. PAYMENT FLOW (COD) ===" "INFO"

if ($order) {
    $ph = @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
    $payBody = @{
        orderId = $order.id; consumerId = $consumer.userId; merchantId = $merchant.id
        amount = $order.totalAmount; paymentMethod = "CASH"
    } | ConvertTo-Json
    try {
        $payment = Invoke-RestMethod -Uri "$payUrl/payments" -Method Post -Body $payBody -Headers $ph
        Log "Payment created: $($payment.status) ($($payment.amount) VND)" "PASS"
    } catch { Log "Payment creation: $($_.Exception.Message)" "FAIL"; $payment = $null }
}

# ══════════════════════════════════════════════════════
# 6. ORDER LIFECYCLE
# ══════════════════════════════════════════════════════
Log "=== 6. ORDER LIFECYCLE ===" "INFO"

if ($order) {
    $steps = @("confirm", "preparing", "ready")
    foreach ($step in $steps) {
        try {
            $updated = Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/$step" -Method Patch -Headers $oh
            Log "Status → $($updated.status)" "PASS"
        } catch { Log "$step : $($_.Exception.Message)" "FAIL" }
    }
}

# ══════════════════════════════════════════════════════
# 7. DRIVER DELIVERY + SETTLEMENT
# ══════════════════════════════════════════════════════
Log "=== 7. DELIVERY + SETTLEMENT ===" "INFO"

if ($order -and $ddata) {
    $dh2 = @{ Authorization = "Bearer $($driver.token)"; "Content-Type" = "application/json" }
    $assignBody = @{ driverId = $ddata.id } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/out-for-delivery" -Method Patch -Body $assignBody -Headers $dh2 | Out-Null
        Log "OUT_FOR_DELIVERY" "PASS"
    } catch { Log "Assign driver: $($_.Exception.Message)" "FAIL" }

    try {
        Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/delivered" -Method Patch -Headers $dh2 | Out-Null
        Log "DELIVERED!" "PASS"
    } catch { Log "Mark delivered: $($_.Exception.Message)" "FAIL" }

    # Settlement
    if ($payment) {
        try {
            $compBody = @{ transactionId = "SETTLE-$oid" } | ConvertTo-Json
            Invoke-RestMethod -Uri "$payUrl/payments/$($payment.id)/complete" -Method Patch -Body $compBody -Headers $ph | Out-Null
            Log "Payment COMPLETED (withdraw)" "PASS"
        } catch { Log "Payment complete: $($_.Exception.Message)" "WARN" }

        # Try wallet settlement
        try {
            $walletSettle = @{
                merchantId = $merchant.id; driverId = $ddata.id; orderId = $order.id
                foodTotal = 2 * $item.price; shippingFee = 15000
            } | ConvertTo-Json
            Invoke-RestMethod -Uri "$payUrl/wallets/settle" -Method Post -Body $walletSettle -Headers $ph | Out-Null
            Log "Wallet settlement done" "PASS"
        } catch { Log "Wallet settlement: $($_.Exception.Message)" "WARN" }
    }
}

# ══════════════════════════════════════════════════════
# 8. SUMMARY REPORT
# ══════════════════════════════════════════════════════
Log "=== SUMMARY ===" "INFO"
Log "Test result: $(if ($allPass) { 'ALL PASSED' } else { 'SOME FAILED' })" $(if ($allPass) { "PASS" } else { "FAIL" })

# Write report to file
$report | Out-File -FilePath "d:\MyThFood\docs\SYSTEM_TEST_RESULTS.txt" -Encoding UTF8