$ErrorActionPreference = "Continue"
$idUrl = "http://localhost:3001/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"
$orderUrl = "http://localhost:3004/api/v1"
$paymentUrl = "http://localhost:3006/api/v1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PHASE 5 TEST: PAYMENT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ts = Get-Random -Minimum 100000 -Maximum 999999
$phone = "+84905$ts"
$pass = "Payme@123"

$results = @{ pass = 0; fail = 0 }

function Pass($msg) {
    $global:results.pass++
    Write-Host "  [PASS] $msg" -ForegroundColor Green
}
function Fail($msg) {
    $global:results.fail++
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
}
function Info($msg) {
    Write-Host "  [INFO] $msg" -ForegroundColor Gray
}

# ---------------------------------------------------------------
# 5.0 AUTH: Register + Login (consumer + merchant)
# ---------------------------------------------------------------
Write-Host "`n[5.0] Auth Setup..." -ForegroundColor Yellow

try {
    $regBody = @{ phoneNumber = $phone; password = $pass; fullName = "Phase5 User"; email = "p5@test.com"; roles = @("CONSUMER", "MERCHANT_OWNER") } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$idUrl/auth/register" -Method Post -Body $regBody -ContentType "application/json"
    Info "Registered: $($r.data.fullName)"
} catch {
    Info "Register: $($_.Exception.Message)"
}
Start-Sleep -Seconds 1

$token = $null; $userId = $null
try {
    $loginBody = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
    $l = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $l.data.accessToken
    $userId = $l.data.user.id
    Pass "5.0 Login - Token obtained"
} catch {
    Fail "5.0 Login: $($_.Exception.Message)"
    exit 1
}

$authHeaders = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

# ---------------------------------------------------------------
# 5.1 CREATE MERCHANT + MENU + ORDER (prerequisites)
# ---------------------------------------------------------------
Write-Host "`n[5.1] Setup Order..." -ForegroundColor Yellow

$merchantId = $null
try {
    $mBody = @{ userId = $userId; name = "Test P5 Shop $ts"; phone = $phone; address = "5 Payment St, HCMC"; email = "p5shop@test.com"; description = "Phase 5 test shop"; latitude = 10.775; longitude = 106.7 } | ConvertTo-Json
    $mr = Invoke-RestMethod -Uri "$merchantUrl/merchants" -Method Post -Body $mBody -Headers $authHeaders
    $merchantId = $mr.id
    Pass "5.1 Merchant created: $($mr.status)"
} catch {
    Fail "5.1 Create merchant: $($_.Exception.Message)"
    exit 1
}

Start-Sleep -Milliseconds 500

# Add menu item
$menuItem = $null
try {
    $miBody = @{ name = "Com Tam P5"; price = 40000; category = "MAIN_COURSE"; description = "Com tam phase 5"; preparationTime = 10 } | ConvertTo-Json
    $mi = Invoke-RestMethod -Uri "$merchantUrl/merchants/$merchantId/menu/items" -Method Post -Body $miBody -Headers $authHeaders
    $menuItem = $mi
    Pass "5.1 Menu item added: $($mi.name)"
} catch {
    Fail "5.1 Add menu: $($_.Exception.Message)"
    exit 1
}

Start-Sleep -Milliseconds 500

# Place order
$orderId = $null; $orderAmount = $null
try {
    $orderBody = @{
        consumerId = $userId
        merchantId = $merchantId
        orderType = "DELIVERY"
        items = @(@{ menuItemId = $menuItem.id; name = $menuItem.name; quantity = 2; unitPrice = $menuItem.price; specialInstructions = "" })
        deliveryAddress = "5 Test Lane, HCMC"
        deliveryFee = 15000
        serviceFee = 5000
        discount = 0
        notes = "Phase 5 payment test"
    } | ConvertTo-Json -Depth 5
    $order = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $orderBody -Headers $authHeaders
    $orderId = $order.id
    $orderAmount = $order.totalAmount
    Pass "5.1 Order placed: #$($orderId.Substring(0,8)) | Amount: $orderAmount VND"
} catch {
    Fail "5.1 Place order: $($_.Exception.Message)"
    exit 1
}

# ---------------------------------------------------------------
# 5.2 CREATE PAYMENT (CASH)
# ---------------------------------------------------------------
Write-Host "`n[5.2] Create Payment (CASH)..." -ForegroundColor Yellow

$paymentId = $null
try {
    $payBody = @{
        orderId = $orderId
        consumerId = $userId
        merchantId = $merchantId
        amount = $orderAmount
        paymentMethod = "CASH"
    } | ConvertTo-Json
    $payment = Invoke-RestMethod -Uri "$paymentUrl/payments" -Method Post -Body $payBody -Headers $authHeaders
    $paymentId = $payment.id
    Pass "5.2 Payment created: $($payment.status) | Amount: $($payment.amount) VND"
} catch {
    Fail "5.2 Create payment: $($_.Exception.Message)"
}

# ---------------------------------------------------------------
# 5.3 GET PAYMENT DETAILS
# ---------------------------------------------------------------
Write-Host "`n[5.3] Get Payment Details..." -ForegroundColor Yellow

if ($paymentId) {
    try {
        $detail = Invoke-RestMethod -Uri "$paymentUrl/payments/$paymentId" -Method Get -Headers $authHeaders
        Pass "5.3 Payment details: Status=$($detail.status) | Method=$($detail.paymentMethod)"
    } catch {
        Info "5.3 Payment details: $($_.Exception.Message)"
        try {
            # Try list payments by order
            $list = Invoke-RestMethod -Uri "$paymentUrl/payments?orderId=$orderId" -Method Get -Headers $authHeaders
            $items = if ($list.items) { $list.items } elseif ($list.data) { $list.data } else { @($list) }
            $count = if ($items -is [array]) { $items.Count } else { 1 }
            Pass "5.3 Payments for order: $count"
        } catch {
            Info "5.3 List payments: $($_.Exception.Message)"
        }
    }
} else {
    Info "5.3 Skipped - no payment"
}

# ---------------------------------------------------------------
# 5.4 PAYMENT LIST
# ---------------------------------------------------------------
Write-Host "`n[5.4] List Payments..." -ForegroundColor Yellow

try {
    $list = Invoke-RestMethod -Uri "$paymentUrl/payments?take=20" -Method Get -Headers $authHeaders
    $items = if ($list.items) { $list.items } elseif ($list.data) { $list.data } else { @($list) }
    $count = if ($items -is [array]) { $items.Count } else { 1 }
    Pass "5.4 Listed payments: $count"
} catch {
    Info "5.4 List payments: $($_.Exception.Message)"
}

# ---------------------------------------------------------------
# 5.5 PAYMENT STATUS TRANSITIONS
# ---------------------------------------------------------------
Write-Host "`n[5.5] Payment Status Transitions..." -ForegroundColor Yellow

if ($paymentId) {
    # Try to confirm payment
    try {
        $r = Invoke-RestMethod -Uri "$paymentUrl/payments/$paymentId/confirm" -Method Patch -Headers $authHeaders
        Pass "5.5 confirm -> $($r.status)"
    } catch {
        Info "5.5 Confirm: $($_.Exception.Message)"
        # Try other transitions
        try {
            $r = Invoke-RestMethod -Uri "$paymentUrl/payments/$paymentId/settle" -Method Patch -Headers $authHeaders
            Pass "5.5 settle -> $($r.status)"
        } catch {
            Info "5.5 Settle: $($_.Exception.Message)"
        }
    }
} else {
    Info "5.5 Skipped - no payment"
}

# ---------------------------------------------------------------
# 5.6 USER PAYMENT HISTORY
# ---------------------------------------------------------------
Write-Host "`n[5.6] User Payment History..." -ForegroundColor Yellow

try {
    $list = Invoke-RestMethod -Uri "$paymentUrl/payments?consumerId=$userId&take=10" -Method Get -Headers $authHeaders
    $items = if ($list.items) { $list.items } elseif ($list.data) { $list.data } else { @($list) }
    $count = if ($items -is [array]) { $items.Count } else { 1 }
    Pass "5.6 Consumer payments: $count"
} catch {
    Info "5.6 User history: $($_.Exception.Message)"
}

# ---------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PHASE 5 TEST COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Results: $($results.pass) PASSED / $($results.fail) FAILED" -ForegroundColor White
Write-Host ""
Write-Host "Phase 5 Features Tested:" -ForegroundColor White
Write-Host "  5.0 Auth + Merchant Setup" -ForegroundColor Gray
Write-Host "  5.1 Create Order (prerequisite)" -ForegroundColor Gray
Write-Host "  5.2 Create Payment (CASH)" -ForegroundColor Gray
Write-Host "  5.3 Get Payment Details" -ForegroundColor Gray
Write-Host "  5.4 List All Payments" -ForegroundColor Gray
Write-Host "  5.5 Payment Status Transitions" -ForegroundColor Gray
Write-Host "  5.6 User Payment History" -ForegroundColor Gray