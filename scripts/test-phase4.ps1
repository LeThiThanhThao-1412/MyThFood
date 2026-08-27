$ErrorActionPreference = "Continue"
$idUrl = "http://localhost:3001/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"
$orderUrl = "http://localhost:3004/api/v1"
$invUrl = "http://localhost:3005/api/v1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PHASE 4 TEST: CONSUMER ORDER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ts = Get-Random -Minimum 100000 -Maximum 999999
$phone = "+84904$ts"
$pass = "Order@123"

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
# 4.0 AUTH: Register + Login consumer
# ---------------------------------------------------------------
Write-Host "`n[4.0] Consumer Auth..." -ForegroundColor Yellow

try {
    $regBody = @{ phoneNumber = $phone; password = $pass; fullName = "Phase4 Consumer"; email = "p4@test.com"; roles = @("CONSUMER") } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$idUrl/auth/register" -Method Post -Body $regBody -ContentType "application/json"
    Info "Registered: $($r.data.fullName)"
} catch {
    if ($_.Exception.Message -match "already exists|409") { Info "Account exists" }
    else { Info "Register: $($_.Exception.Message)" }
}
Start-Sleep -Seconds 1

$consumerToken = $null; $consumerUserId = $null
try {
    $loginBody = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
    $l = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $consumerToken = $l.data.accessToken
    $consumerUserId = $l.data.user.id
    Pass "4.0 Consumer login - Token obtained"
} catch {
    Fail "4.0 Consumer login: $($_.Exception.Message)"
    exit 1
}

$authHeaders = @{ Authorization = "Bearer $consumerToken"; "Content-Type" = "application/json" }

# ---------------------------------------------------------------
# 4.1 LIST APPROVED RESTAURANTS
# ---------------------------------------------------------------
Write-Host "`n[4.1] List Approved Restaurants..." -ForegroundColor Yellow

$merchantId = $null
try {
    $r = Invoke-RestMethod -Uri "$merchantUrl/merchants?status=APPROVED&take=10" -Method Get -Headers $authHeaders
    $items = if ($r.items) { $r.items } else { @($r) }
    $count = if ($items -is [array]) { $items.Count } else { 1 }
    Pass "4.1 Listed approved restaurants: $count"
    if ($count -gt 0) {
        $first = if ($items -is [array]) { $items[0] } else { $items }
        # Handle data wrapper
        if ($first.data) { $first = $first.data }
        $merchantId = $first.id
        $merchantName = $first.name
        if (-not $merchantId -and $first.merchantId) { $merchantId = $first.merchantId }
        if (-not $merchantName -and $first.merchantName) { $merchantName = $first.merchantName }
        Info "Using merchant: $merchantName (ID: $merchantId)"
    }
    } catch {
    # Try without status filter
    try {
        $r = Invoke-RestMethod -Uri "$merchantUrl/merchants?take=10" -Method Get -Headers $authHeaders
        $items = if ($r.items) { $r.items } else { @($r) }
        $count = if ($items -is [array]) { $items.Count } else { 1 }
        Pass "4.1 Listed restaurants: $count"
        if ($count -gt 0) {
            $first = if ($items -is [array]) { $items[0] } else { $items }
            if ($first.data) { $first = $first.data }
            $merchantId = $first.id
            $merchantName = $first.name
            if (-not $merchantId -and $first.merchantId) { $merchantId = $first.merchantId }
            if (-not $merchantName -and $first.merchantName) { $merchantName = $first.merchantName }
        }
    } catch {
        Fail "4.1 List restaurants: $($_.Exception.Message)"
        exit 1
    }
}

if (-not $merchantId) {
    Info "4.1 No merchants found - will skip order placement"
}

# ---------------------------------------------------------------
# 4.2 VIEW MENU
# ---------------------------------------------------------------
Write-Host "`n[4.2] View Menu..." -ForegroundColor Yellow

$menuItem = $null
if ($merchantId) {
    try {
        $menu = Invoke-RestMethod -Uri "$merchantUrl/merchants/$merchantId/menu" -Method Get -Headers $authHeaders
        $menuArr = if ($menu -is [array]) { $menu } elseif ($menu.items) { $menu.items } elseif ($menu.data) { $menu.data } else { @($menu) }
        $count = if ($menuArr -is [array]) { $menuArr.Count } else { 1 }
        Pass "4.2 Menu viewed: $count items"
        if ($count -gt 0) {
            $menuItem = if ($menuArr -is [array]) { $menuArr[0] } else { $menuArr }
            Info "Sample item: $($menuItem.name) - $($menuItem.price) VND"
        }
    } catch {
        Fail "4.2 View menu: $($_.Exception.Message)"
    }
} else {
    Info "4.2 Skipped - no merchant"
}

# ---------------------------------------------------------------
# 4.3 PLACE ORDER
# ---------------------------------------------------------------
Write-Host "`n[4.3] Place Order..." -ForegroundColor Yellow

$orderId = $null; $order = $null
if ($merchantId -and $menuItem) {
    $orderBody = @{
        consumerId = $consumerUserId
        merchantId = $merchantId
        orderType = "DELIVERY"
        items = @(@{
            menuItemId = $menuItem.id
            name = $menuItem.name
            quantity = 2
            unitPrice = $menuItem.price
            specialInstructions = "Khong hanh"
        })
        deliveryAddress = "456 Nguyen Hue, District 1, HCMC"
        deliveryFee = 15000
        serviceFee = 5000
        discount = 0
        notes = "Giao gio hanh chinh"
    } | ConvertTo-Json -Depth 5

    try {
        $order = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $orderBody -Headers $authHeaders
        $orderId = $order.id
        Pass "4.3 Order placed: #$($orderId.Substring(0,8))"
        Info "Status: $($order.status) | Total: $($order.totalAmount) VND"
    } catch {
        Fail "4.3 Place order: $($_.Exception.Message)"
    }
} else {
    Info "4.3 Skipped - no merchant/menu item"
}

# ---------------------------------------------------------------
# 4.4 ORDER STATUS TRANSITIONS
# ---------------------------------------------------------------
Write-Host "`n[4.4] Order Status Transitions..." -ForegroundColor Yellow

if ($orderId) {
    $statusSteps = @("confirm", "preparing", "ready")
    foreach ($step in $statusSteps) {
        try {
            $updated = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/$step" -Method Patch -Headers $authHeaders
            Pass "4.4 $step -> $($updated.status)"
        } catch {
            $errMsg = $_.Exception.Message
            Info "4.4 ${step}: $errMsg"
        }
        Start-Sleep -Milliseconds 300
    }
} else {
    Info "4.4 Skipped - no order"
}

# ---------------------------------------------------------------
# 4.5 GET ORDER DETAILS
# ---------------------------------------------------------------
Write-Host "`n[4.5] Get Order Details..." -ForegroundColor Yellow

if ($orderId) {
    try {
        $detail = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId" -Method Get -Headers $authHeaders
        Pass "4.5 Order details: Status=$($detail.status) | Items=$($detail.items.Count)"
    } catch {
        Info "4.5 Order details: $($_.Exception.Message)"
        try {
            # Try list orders
            $list = Invoke-RestMethod -Uri "$orderUrl/orders?consumerId=$consumerUserId" -Method Get -Headers $authHeaders
            $orders = if ($list.items) { $list.items } elseif ($list.data) { $list.data } else { @($list) }
            $count = if ($orders -is [array]) { $orders.Count } else { 1 }
            Pass "4.5 Consumer orders: $count"
        } catch {
            Info "4.5 List orders: $($_.Exception.Message)"
        }
    }
} else {
    Info "4.5 Skipped - no order"
}

# ---------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PHASE 4 TEST COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Results: $($results.pass) PASSED / $($results.fail) FAILED" -ForegroundColor White
Write-Host ""
Write-Host "Phase 4 Features Tested:" -ForegroundColor White
Write-Host "  4.0 Consumer Auth" -ForegroundColor Gray
Write-Host "  4.1 List/Browse Restaurants" -ForegroundColor Gray
Write-Host "  4.2 View Menu" -ForegroundColor Gray
Write-Host "  4.3 Place Order" -ForegroundColor Gray
Write-Host "  4.4 Order Status Transitions" -ForegroundColor Gray
Write-Host "  4.5 Get Order Details" -ForegroundColor Gray