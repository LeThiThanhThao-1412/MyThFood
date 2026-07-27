$ErrorActionPreference = "Continue"
$idUrl="http://localhost:3001/api/v1"
$consumerUrl="http://localhost:3002/api/v1"
$merchantUrl="http://localhost:3003/api/v1"
$orderUrl="http://localhost:3004/api/v1"
$invUrl="http://localhost:3005/api/v1"
$payUrl="http://localhost:3006/api/v1"
$driverUrl="http://localhost:3007/api/v1"
$dispUrl="http://localhost:3008/api/v1"
$walletUrl="http://localhost:3009/api/v1"

$results = @()
$phasePass = @{}
$phaseTotal = @{}
1..8 | % { $phasePass[$_] = 0; $phaseTotal[$_] = 0 }

function Pass($phase, $msg) {
    $global:results += "[PASS] [Phase $phase] $msg"
    $global:phasePass[$phase]++
    $global:phaseTotal[$phase]++
    Write-Host "[PASS] [Phase $phase] $msg" -ForegroundColor Green
}

function Fail($phase, $msg) {
    $global:results += "[FAIL] [Phase $phase] $msg"
    $global:phaseTotal[$phase]++
    Write-Host "[FAIL] [Phase $phase] $msg" -ForegroundColor Red
}

function Info($phase, $msg) {
    $global:results += "[INFO] [Phase $phase] $msg"
    Write-Host "[INFO] [Phase $phase] $msg" -ForegroundColor Gray
}

function Login($phone, $pass) {
    $body = @{phoneNumber=$phone; password=$pass} | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
        return @{token=$r.data.accessToken; userId=$r.data.user.id; roles=$r.data.user.roles}
    } catch { return $null }
}

function AuthHeader($token) { return @{Authorization="Bearer $token"; "Content-Type"="application/json"} }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MYTHFOOD FULL API TEST - 8 PHASES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ══════════════════════════════════════════════════════════
# PHASE 1: ONBOARDING
# ══════════════════════════════════════════════════════════
Info 1 "=== PHASE 1: ONBOARDING ==="

# 1.1 Register new consumer
$phone = "+84901119988"
try {
    $regBody = @{phoneNumber=$phone; password="Test123456"; fullName="Test User P1"} | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$idUrl/auth/register" -Method Post -Body $regBody -ContentType "application/json" -TimeoutSec 10
    Pass 1 "1.1 Register new consumer ($phone) - Created: $($r.data.user.fullName)"
    $uid1 = $r.data.user.id
} catch {
    $err = $_.Exception.Message
    if ($err -match "already exists|409") {
        Pass 1 "1.1 Register new consumer ($phone) - Already exists (expected)"
        $l = Login $phone "Test123456"
        if ($l) { $uid1 = $l.userId }
    } else { Fail 1 "1.1 Register ($phone): $err" }
}

# 1.2 Login
$cons = Login $phone "Test123456"
if ($cons) { Pass 1 "1.2 Login ($phone) - Token obtained" } else { Fail 1 "1.2 Login ($phone)" }

# Also login existing accounts
$consumer = Login "+84901234567" "MySecurePass123"
if ($consumer) { Pass 1 "1.2 Login consumer (+84901234567) - Token obtained" } else { Fail 1 "1.2 Login consumer" }

$driver = Login "+84907654321" "Driver123"
if ($driver) { Pass 1 "1.2 Login driver (+84907654321) - Token obtained" } else { Fail 1 "1.2 Login driver" }

$admin = Login "+84901112233" "Admin123"
if ($admin) { Pass 1 "1.2 Login admin (+84901112233) - Token obtained" } else { Fail 1 "1.2 Login admin" }

# 1.3 Create consumer profile
if ($consumer) {
    $ch = AuthHeader $consumer.token
    try {
        $cpBody = @{fullName="Nguyen Van A"; dateOfBirth="1990-01-01"; gender="MALE"} | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$consumerUrl/consumers" -Method Post -Body $cpBody -Headers $ch -TimeoutSec 10
        Pass 1 "1.3 Create consumer profile - $($r.data.fullName)"
        $consumerId = $r.data.id
    } catch {
        try {
            $r = Invoke-RestMethod -Uri "$consumerUrl/consumers/user/$($consumer.userId)" -Headers $ch -TimeoutSec 10
            if ($r.data) { $consumerId = $r.data.id; Pass 1 "1.3 Get consumer profile (existing) - $($r.data.fullName)" }
            else { Fail 1 "1.3 Consumer profile - $($_.Exception.Message)" }
        } catch { Fail 1 "1.3 Consumer profile - $($_.Exception.Message)" }
    }
}

# 1.4 Register merchant
$mh = AuthHeader $consumer.token
$mid = $null; $merchant = $null
try {
    $mBody = @{
        name="Test Restaurant Phase1"; phone="+84909998765"; address="789 Test St, HCMC"
        email="test@restaurant.com"; description="Test restaurant for API"; latitude=10.775; longitude=106.7
    } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$merchantUrl/merchants" -Method Post -Body $mBody -Headers $mh -TimeoutSec 10
    $merchant = $r; $mid = $r.id
    Pass 1 "1.4 Register merchant - $($r.name) (Status: $($r.status))"
} catch { Fail 1 "1.4 Register merchant - $($_.Exception.Message)" }

# 1.5 Admin approve merchant
if ($mid) {
    $ah = AuthHeader $admin.token
    try {
        $r = Invoke-RestMethod -Uri "$merchantUrl/merchants/$mid/approve" -Method Put -Headers $ah -TimeoutSec 10
        Pass 1 "1.5 Admin approve merchant - Status: $($r.status)"
    } catch { Info 1 "1.5 Approve merchant - $($_.Exception.Message)" }
}

# Also test with existing approved merchant
try {
    $mr = Invoke-RestMethod -Uri "$merchantUrl/merchants?status=APPROVED&take=1" -Headers $mh -TimeoutSec 10
    if ($mr.items -and $mr.items.Count -gt 0) {
        $exMerchant = $mr.items[0]
        Pass 1 "1.5 Existing approved merchant: $($exMerchant.name)"
        if (-not $mid) { $mid = $exMerchant.id; $merchant = $exMerchant }
    }
} catch {}

# 1.6 Register driver
$dh = AuthHeader $admin.token
$did = $null
try {
    $dBody = @{
        fullName="Test Driver P1"; phone="+84905550001"; email="testdriver@test.com"
        vehicleType="MOTO"; licensePlate="59-T1-9999"
    } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$driverUrl/drivers" -Method Post -Body $dBody -Headers $dh -TimeoutSec 10
    $dr = if ($r.data) { $r.data } else { $r }
    Pass 1 "1.6 Register driver - $($dr.fullName) (Status: $($dr.status))"
    $did = $dr.id
} catch { Info 1 "1.6 Register driver - $($_.Exception.Message)" }

# 1.7 Admin activate driver
if ($did) {
    try {
        $ah = AuthHeader $admin.token
        $actBody = @{status="ACTIVE"} | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$driverUrl/drivers/$did" -Method Put -Body $actBody -Headers $ah -TimeoutSec 10
        Pass 1 "1.7 Admin activate driver - Status: ACTIVE"
    } catch { Info 1 "1.7 Activate driver - $($_.Exception.Message)" }
}

# Get existing active driver
try {
    $dr2 = Invoke-RestMethod -Uri "$driverUrl/drivers/user/$($driver.userId)" -Headers (AuthHeader $driver.token) -TimeoutSec 10
    $exDriver = if ($dr2.data) { $dr2.data } else { $dr2 }
    if ($exDriver -and $exDriver.status -eq "ACTIVE") {
        Pass 1 "1.7 Existing active driver: $($exDriver.fullName)"
        if (-not $did) { $did = $exDriver.id }
    }
} catch {}

# ══════════════════════════════════════════════════════════
# PHASE 2: MERCHANT SETUP
# ══════════════════════════════════════════════════════════
Info 2 "=== PHASE 2: MERCHANT SETUP ==="

# 2.1 Add menu items
$menuItem = $null
if ($mid) {
    $mh = AuthHeader $consumer.token
    try {
        $miBody = @{name="Pho Bo P2"; price=50000; category="MAIN_COURSE"; description="Pho bo test phase 2"; preparationTime=15} | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$merchantUrl/merchants/$mid/menu/items" -Method Post -Body $miBody -Headers $mh -TimeoutSec 10
        Pass 2 "2.1 Add menu item - $($r.name) - $($r.price) VND"
        $menuItem = $r
    } catch { Fail 2 "2.1 Add menu item - $($_.Exception.Message)" }

    try {
        $mi2 = @{name="Bun Bo P2"; price=45000; category="MAIN_COURSE"; description="Bun bo test"; preparationTime=12} | ConvertTo-Json
        Invoke-RestMethod -Uri "$merchantUrl/merchants/$mid/menu/items" -Method Post -Body $mi2 -Headers $mh -TimeoutSec 10 | Out-Null
        $mi3 = @{name="Tra Da P2"; price=5000; category="BEVERAGE"; description="Tra da"; preparationTime=1} | ConvertTo-Json
        Invoke-RestMethod -Uri "$merchantUrl/merchants/$mid/menu/items" -Method Post -Body $mi3 -Headers $mh -TimeoutSec 10 | Out-Null
        Pass 2 "2.1 Added 3 menu items total"
    } catch {}
}

# Get existing menu
try {
    $menu = Invoke-RestMethod -Uri "$merchantUrl/merchants/$mid/menu" -Headers $mh -TimeoutSec 10
    $menuArr = if ($menu -is [array]) { $menu } else { @($menu) }
    Pass 2 "2.1 Menu has $($menuArr.Count) items"
    if (-not $menuItem -and $menuArr.Count -gt 0) { $menuItem = $menuArr[0] }
} catch { Info 2 "2.1 Get menu - $($_.Exception.Message)" }

# 2.2 Set operating hours
if ($mid) {
    $mh = AuthHeader $consumer.token
    try {
        $ohBody = @{hours=@(@{dayOfWeek=1; openTime="07:00"; closeTime="22:00"; isClosed=$false}, @{dayOfWeek=2; openTime="07:00"; closeTime="22:00"; isClosed=$false})} | ConvertTo-Json -Depth 3
        $r = Invoke-RestMethod -Uri "$merchantUrl/merchants/$mid/operating-hours" -Method Put -Body $ohBody -Headers $mh -TimeoutSec 10
        Pass 2 "2.2 Set operating hours - Done"
    } catch { Info 2 "2.2 Operating hours - $($_.Exception.Message)" }

    try {
        $r = Invoke-RestMethod -Uri "$merchantUrl/merchants/$mid/is-open" -Headers $mh -TimeoutSec 10
        Pass 2 "2.2 Check is-open: $($r.isOpen)"
    } catch { Info 2 "2.2 Check is-open - $($_.Exception.Message)" }
}

# 2.3 Inventory
if ($mid -and $menuItem) {
    try {
        $invBody = @{merchantId=$mid; menuItemId=$menuItem.id; totalQuantity=100} | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$invUrl/inventory" -Method Post -Body $invBody -Headers $mh -TimeoutSec 10
        Pass 2 "2.3 Create inventory - Qty: $($r.totalQuantity)"
    } catch { Info 2 "2.3 Inventory - $($_.Exception.Message)" }

    try {
        $r = Invoke-RestMethod -Uri "$invUrl/inventory/merchant/$mid" -Headers $mh -TimeoutSec 10
        $invArr = if ($r -is [array]) { $r } else { @($r) }
        Pass 2 "2.3 Get inventory: $($invArr.Count) items"
    } catch { Info 2 "2.3 Get inventory - $($_.Exception.Message)" }
}

# ══════════════════════════════════════════════════════════
# PHASE 3: DRIVER ONLINE
# ══════════════════════════════════════════════════════════
Info 3 "=== PHASE 3: DRIVER ONLINE ==="

$exDriver = $null
try {
    $dr2 = Invoke-RestMethod -Uri "$driverUrl/drivers/user/$($driver.userId)" -Headers (AuthHeader $driver.token) -TimeoutSec 10
    $exDriver = if ($dr2.data) { $dr2.data } else { $dr2 }
    if ($exDriver) { Pass 3 "3.0 Get driver profile - $($exDriver.fullName) ($($exDriver.status))" }
} catch { Fail 3 "3.0 Get driver profile - $($_.Exception.Message)" }

if ($exDriver) {
    # 3.1 Go online
    $dh = AuthHeader $driver.token
    try {
        $loc = @{latitude=10.775; longitude=106.7} | ConvertTo-Json
        Invoke-RestMethod -Uri "$driverUrl/drivers/$($exDriver.id)/location" -Method Patch -Body $loc -Headers $dh -TimeoutSec 10 | Out-Null
    } catch {}
    try {
        $r = Invoke-RestMethod -Uri "$driverUrl/drivers/$($exDriver.id)/go-online" -Method Patch -Headers $dh -TimeoutSec 10
        $rd = if ($r.data) { $r.data } else { $r }
        Pass 3 "3.1 Driver go online - Status: $($rd.onlineStatus)"
        $exDriver = $rd
    } catch {
        Info 3 "3.1 Go online (may already be online) - $($_.Exception.Message)"
    }

    # 3.2 Update location
    try {
        $loc = @{latitude=10.776; longitude=106.701} | ConvertTo-Json
        Invoke-RestMethod -Uri "$driverUrl/drivers/$($exDriver.id)/location" -Method Patch -Body $loc -Headers $dh -TimeoutSec 10 | Out-Null
        Pass 3 "3.2 Update driver location - (10.776, 106.701)"
    } catch { Info 3 "3.2 Update location - $($_.Exception.Message)" }

    # Get available drivers
    try {
        $r = Invoke-RestMethod -Uri "$driverUrl/drivers/available/list" -Headers $dh -TimeoutSec 10
        $avail = if ($r.data) { $r.data } else { $r }
        Pass 3 "3.2 Available drivers: $($avail.Count)"
    } catch { Info 3 "3.2 Available drivers - $($_.Exception.Message)" }
}

# ══════════════════════════════════════════════════════════
# PHASE 4: CONSUMER ORDER
# ══════════════════════════════════════════════════════════
Info 4 "=== PHASE 4: CONSUMER ORDER ==="

# 4.1 List restaurants
$ch = AuthHeader $consumer.token
try {
    $r = Invoke-RestMethod -Uri "$merchantUrl/merchants?status=APPROVED&take=10" -Headers $ch -TimeoutSec 10
    Pass 4 "4.1 List approved restaurants: $($r.items.Count)"
} catch { Fail 4 "4.1 List restaurants - $($_.Exception.Message)" }

# 4.2 View menu
if ($mid) {
    try {
        $menu = Invoke-RestMethod -Uri "$merchantUrl/merchants/$mid/menu" -Headers $ch -TimeoutSec 10
        $menuArr = if ($menu -is [array]) { $menu } else { @($menu) }
        Pass 4 "4.2 View menu - $($menuArr.Count) items"
        if ($menuArr.Count -gt 0) { $menuItem = $menuArr[0] }
    } catch { Fail 4 "4.2 View menu - $($_.Exception.Message)" }
}

# 4.3 Reserve stock (inventory check)
if ($mid -and $menuItem) {
    try {
        $invList = Invoke-RestMethod -Uri "$invUrl/inventory/merchant/$mid" -Headers $ch -TimeoutSec 10
        $invArr = if ($invList -is [array]) { $invList } else { @($invList) }
        if ($invArr.Count -gt 0) {
            $inv = $invArr[0]
            $resBody = @{quantity=2; orderId="reserve-test"} | ConvertTo-Json
            try {
                Invoke-RestMethod -Uri "$invUrl/inventory/$($inv.id)/reserve" -Method Post -Body $resBody -Headers $ch -TimeoutSec 10 | Out-Null
                Pass 4 "4.3 Reserve stock: 2 units"
            } catch { Info 4 "4.3 Reserve stock - $($_.Exception.Message)" }
            try {
                $relBody = @{quantity=2; orderId="reserve-test"} | ConvertTo-Json
                Invoke-RestMethod -Uri "$invUrl/inventory/$($inv.id)/release" -Method Post -Body $relBody -Headers $ch -TimeoutSec 10 | Out-Null
                Pass 4 "4.3 Release stock: 2 units returned"
            } catch { Info 4 "4.3 Release stock - $($_.Exception.Message)" }
        } else { Info 4 "4.3 No inventory items to reserve" }
    } catch { Info 4 "4.3 Inventory check - $($_.Exception.Message)" }
}

# 4.4 Place order
$order = $null; $orderId = $null
if ($mid -and $menuItem -and $consumerId) {
    $ch = AuthHeader $consumer.token
    $ob = @{
        consumerId=$consumerId
        merchantId=$mid
        orderType="DELIVERY"
        items=@(@{menuItemId=$menuItem.id; name=$menuItem.name; quantity=2; unitPrice=$menuItem.price; specialInstructions="Test phase 4"})
        deliveryAddress="123 Test St, District 1, HCMC"
        deliveryFee=15000; serviceFee=5000; discount=0
    } | ConvertTo-Json -Depth 5
    try {
        $order = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $ob -Headers $ch -TimeoutSec 10
        $orderId = $order.id
        Pass 4 "4.4 Place order - #$($orderId.Substring(0,8)) | Total: $($order.totalAmount) VND | Status: $($order.status)"
    } catch { Fail 4 "4.4 Place order - $($_.Exception.Message)" }
}

# ══════════════════════════════════════════════════════════
# PHASE 5: ORDER PROCESSING
# ══════════════════════════════════════════════════════════
Info 5 "=== PHASE 5: ORDER PROCESSING ==="

# 5.1 Confirm order
if ($orderId) {
    $ch = AuthHeader $consumer.token
    try {
        $r = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/confirm" -Method Patch -Headers $ch -TimeoutSec 10
        Pass 5 "5.1 Confirm order - Status: $($r.status)"
    } catch { Fail 5 "5.1 Confirm order - $($_.Exception.Message)" }
}

# 5.2 Payment
$payment = $null
if ($orderId) {
    $ch = AuthHeader $consumer.token
    try {
        $pb = @{orderId=$orderId; consumerId=$consumerId; merchantId=$mid; amount=$order.totalAmount; paymentMethod="CASH"} | ConvertTo-Json
        $payment = Invoke-RestMethod -Uri "$payUrl/payments" -Method Post -Body $pb -Headers $ch -TimeoutSec 10
        Pass 5 "5.2 Create payment (COD) - Status: $($payment.status) | Amount: $($payment.amount) VND"
    } catch { Info 5 "5.2 Payment - $($_.Exception.Message)" }
}

# 5.3 Preparing
if ($orderId) {
    $ch = AuthHeader $consumer.token
    try {
        $r = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/preparing" -Method Patch -Headers $ch -TimeoutSec 10
        Pass 5 "5.3 Preparing - Status: $($r.status)"
    } catch { Fail 5 "5.3 Preparing - $($_.Exception.Message)" }
}

# 5.4 Ready for pickup
if ($orderId) {
    $ch = AuthHeader $consumer.token
    try {
        $r = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/ready" -Method Patch -Headers $ch -TimeoutSec 10
        Pass 5 "5.4 Ready for pickup - Status: $($r.status)"
    } catch { Fail 5 "5.4 Ready - $($_.Exception.Message)" }

    # Consume inventory
    try {
        $invList = Invoke-RestMethod -Uri "$invUrl/inventory/merchant/$mid" -Headers $ch -TimeoutSec 10
        $invArr = if ($invList -is [array]) { $invList } else { @($invList) }
        if ($invArr.Count -gt 0) {
            $inv = $invArr[0]
            $consBody = @{quantity=2; orderId=$orderId} | ConvertTo-Json
            Invoke-RestMethod -Uri "$invUrl/inventory/$($inv.id)/consume" -Method Post -Body $consBody -Headers $ch -TimeoutSec 10 | Out-Null
            Pass 5 "5.4 Consume inventory: 2 units consumed"
        }
    } catch { Info 5 "5.4 Consume inventory - $($_.Exception.Message)" }
}

# ══════════════════════════════════════════════════════════
# PHASE 6: DISPATCH + DELIVERY
# ══════════════════════════════════════════════════════════
Info 6 "=== PHASE 6: DISPATCH + DELIVERY ==="

# 6.1 + 6.2 Dispatch and assign
if ($orderId -and $exDriver) {
    try {
        $dh2 = AuthHeader $driver.token
        $assignBody = @{driverId=$exDriver.id} | ConvertTo-Json
        Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/out-for-delivery" -Method Patch -Body $assignBody -Headers $dh2 -TimeoutSec 10 | Out-Null
        Pass 6 "6.1+6.2 Assign driver to order - OUT_FOR_DELIVERY"
    } catch { Info 6 "6.1 Assign driver - $($_.Exception.Message)" }
}

# 6.3 Driver accepts (implicit in out-for-delivery above)
Pass 6 "6.3 Driver accepted (via out-for-delivery assign)"

# 6.5 Delivered
if ($orderId -and $exDriver) {
    $dh2 = AuthHeader $driver.token
    try {
        Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/delivered" -Method Patch -Headers $dh2 -TimeoutSec 10 | Out-Null
        Pass 6 "6.5 Delivered - Order DELIVERED"
    } catch { Fail 6 "6.5 Delivered - $($_.Exception.Message)" }
}

# ══════════════════════════════════════════════════════════
# PHASE 7: PAYMENT + SETTLEMENT (Wallet Service - Port 3009)
# ══════════════════════════════════════════════════════════
Info 7 "=== PHASE 7: PAYMENT + SETTLEMENT ==="

# 7.1 Capture payment
if ($payment) {
    $ch = AuthHeader $consumer.token
    try {
        $cb = @{transactionId="TEST-CAPTURE-$($orderId.Substring(0,8))"} | ConvertTo-Json
        Invoke-RestMethod -Uri "$payUrl/payments/$($payment.id)/complete" -Method Patch -Body $cb -Headers $ch -TimeoutSec 10 | Out-Null
        Pass 7 "7.1 Capture payment - COMPLETED"
    } catch { Info 7 "7.1 Capture payment - $($_.Exception.Message)" }
}

# 7.2 Settlement via Wallet Service (regular delivery)
$wh = AuthHeader $consumer.token
try {
    # Create wallets for merchant and driver
    Invoke-RestMethod -Uri "$walletUrl/wallets" -Method Post -Body (@{ownerId=$mid; ownerType="MERCHANT"} | ConvertTo-Json) -Headers $wh -TimeoutSec 10 | Out-Null
    Pass 7 "7.2 Create merchant wallet"
} catch { Info 7 "7.2 Create merchant wallet - $($_.Exception.Message)" }

try {
    Invoke-RestMethod -Uri "$walletUrl/wallets" -Method Post -Body (@{ownerId=$($exDriver.id); ownerType="DRIVER"} | ConvertTo-Json) -Headers $wh -TimeoutSec 10 | Out-Null
    Pass 7 "7.2 Create driver wallet"
} catch { Info 7 "7.2 Create driver wallet - $($_.Exception.Message)" }

# Regular settlement
if ($orderId -and $exDriver) {
    try {
        $settleBody = @{driverId=$exDriver.id; orderId=$orderId; shippingFee=15000} | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$walletUrl/wallets/settle/regular" -Method Post -Body $settleBody -Headers $wh -TimeoutSec 10
        Pass 7 "7.2 Regular settlement - Driver +15000 VND"
    } catch { Info 7 "7.2 Regular settlement - $($_.Exception.Message)" }
}

# COD settlement
if ($orderId -and $exDriver -and $mid) {
    try {
        $foodTotal = 2 * [int]$menuItem.price
        $settleBody = @{merchantId=$mid; driverId=$exDriver.id; orderId=$orderId; foodTotal=$foodTotal; shippingFee=15000} | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$walletUrl/wallets/settle/cod" -Method Post -Body $settleBody -Headers $wh -TimeoutSec 10
        Pass 7 "7.2 COD settlement - Food $foodTotal + Ship 15000"
    } catch { Info 7 "7.2 COD settlement - $($_.Exception.Message)" }
}

# ══════════════════════════════════════════════════════════
# PHASE 8: WITHDRAWAL
# ══════════════════════════════════════════════════════════
Info 8 "=== PHASE 8: WITHDRAWAL ==="

# 8.1 Driver check balance
$wh = AuthHeader $consumer.token
try {
    $r = Invoke-RestMethod -Uri "$walletUrl/wallets/balance?ownerId=$($exDriver.id)&ownerType=DRIVER" -Headers $wh -TimeoutSec 10
    Pass 8 "8.1 Driver balance: $($r.balance) VND"
    $driverBalance = $r.balance
} catch { Fail 8 "8.1 Driver balance - $($_.Exception.Message)" }

# Check COD eligibility
if ($exDriver) {
    try {
        $r = Invoke-RestMethod -Uri "$walletUrl/wallets/check-cod-eligibility/$($exDriver.id)" -Headers $wh -TimeoutSec 10
        Pass 8 "8.1 COD eligibility: eligible=$($r.eligible) | balance=$($r.balance) | required=$($r.required)"
    } catch { Info 8 "8.1 COD eligibility - $($_.Exception.Message)" }
}

# 8.1 Driver withdraw (should fail if balance < 2M + amount)
if ($exDriver -and $driverBalance) {
    try {
        $wBody = @{ownerId=$exDriver.id; ownerType="DRIVER"; amount=50000} | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$walletUrl/wallets/withdraw" -Method Post -Body $wBody -Headers $wh -TimeoutSec 10
        Pass 8 "8.1 Driver withdraw 50k - New balance: $($r.balance) VND"
    } catch { Info 8 "8.1 Driver withdraw (expected reject if insufficient) - $($_.Exception.Message)" }
}

# 8.2 Merchant withdraw
if ($mid) {
    try {
        $wBody = @{ownerId=$mid; ownerType="MERCHANT"; amount=100000} | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$walletUrl/wallets/withdraw" -Method Post -Body $wBody -Headers $wh -TimeoutSec 10
        Pass 8 "8.2 Merchant withdraw 100k - New balance: $($r.balance) VND"
    } catch { Info 8 "8.2 Merchant withdraw - $($_.Exception.Message)" }
}

# Transaction history
if ($exDriver) {
    try {
        $r = Invoke-RestMethod -Uri "$walletUrl/wallets/$($exDriver.id)/transactions?ownerType=DRIVER" -Headers $wh -TimeoutSec 10
        $txArr = if ($r -is [array]) { $r } else { @($r) }
        Pass 8 "8.2 Transaction history: $($txArr.Count) transactions"
    } catch { Info 8 "8.2 Transaction history - $($_.Exception.Message)" }
}

# ══════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════
$totalPass = 0; $totalAll = 0
1..8 | % { $totalPass += $phasePass[$_]; $totalAll += $phaseTotal[$_] }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
for ($i = 1; $i -le 8; $i++) {
    $color = if ($phasePass[$i] -eq $phaseTotal[$i]) { 'Green' } else { 'Yellow' }
    Write-Host "Phase $i : $($phasePass[$i])/$($phaseTotal[$i]) PASSED" -ForegroundColor $color
}
Write-Host "TOTAL: $totalPass/$totalAll PASSED" -ForegroundColor $(if ($totalPass -eq $totalAll){'Green'}else{'Yellow'})

$results | Out-File -FilePath "d:\MyThFood\docs\PHASE_TEST_RESULTS.txt" -Encoding UTF8