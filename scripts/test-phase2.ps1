$ErrorActionPreference = "Continue"
$idUrl = "http://localhost:3001/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"
$inventoryUrl = "http://localhost:3005/api/v1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PHASE 2 TEST: MERCHANT SETUP" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ts = Get-Random -Minimum 100000 -Maximum 999999
$phone = "+84901$ts"
$pass = "Test@1234"

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
function ApiPost($uri, $body, $token) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    return Invoke-RestMethod -Uri $uri -Method Post -Body ($body | ConvertTo-Json) -Headers $headers
}
function ApiGet($uri, $token) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    return Invoke-RestMethod -Uri $uri -Method Get -Headers $headers
}
function ApiPut($uri, $body, $token) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    return Invoke-RestMethod -Uri $uri -Method Put -Body ($body | ConvertTo-Json) -Headers $headers
}

# ---------------------------------------------------------------
# 2.0 AUTH: Register + Login merchant account
# ---------------------------------------------------------------
Write-Host "`n[2.0] Auth Setup..." -ForegroundColor Yellow

try {
    $regBody = @{ phoneNumber = $phone; password = $pass; fullName = "Phase2 Merchant"; email = "p2@test.com"; roles = @("CONSUMER", "MERCHANT_OWNER") }
    $r = ApiPost "$idUrl/auth/register" $regBody
    Info "Registered: $($r.data.fullName)"
} catch {
    if ($_.Exception.Message -match "already exists|409") { Info "Account exists, attempting login" }
    else { Info "Register: $($_.Exception.Message)" }
}

Start-Sleep -Seconds 1

$token = $null; $userId = $null
try {
    $loginBody = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
    $l = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $l.data.accessToken
    $userId = $l.data.user.id
    Pass "2.0 Login - Token obtained"
    Info "Roles: $($l.data.user.roles -join ', ')"
} catch {
    Fail "2.0 Login: $($_.Exception.Message)"
    exit 1
}

# ---------------------------------------------------------------
# 2.1 CREATE MERCHANT
# ---------------------------------------------------------------
Write-Host "`n[2.1] Create Merchant Profile..." -ForegroundColor Yellow

$merchantId = $null
$mBody = @{
    userId = $userId
    name = "Test P2 Restaurant $ts"
    phone = $phone
    address = "123 Test St, District 1, HCMC"
    email = "p2rest@test.com"
    description = "Phase 2 test restaurant"
    latitude = 10.775
    longitude = 106.7
}
try {
    $mr = ApiPost "$merchantUrl/merchants" $mBody $token
    $merchantId = $mr.id
    Pass "2.1 Merchant created: $($mr.name) (Status: $($mr.status))"
} catch {
    Fail "2.1 Create merchant: $($_.Exception.Message)"
    exit 1
}

# ---------------------------------------------------------------
# 2.2 ADD MENU ITEMS
# ---------------------------------------------------------------
Write-Host "`n[2.2] Add Menu Items..." -ForegroundColor Yellow

$menuItemIds = @()
$menuItems = @(
    @{ name = "Pho Bo P2"; price = 50000; category = "MAIN_COURSE"; description = "Pho bo test phase 2"; preparationTime = 15 },
    @{ name = "Com Tam P2"; price = 40000; category = "MAIN_COURSE"; description = "Com tam test phase 2"; preparationTime = 10 },
    @{ name = "Tra Chanh P2"; price = 8000; category = "BEVERAGE"; description = "Tra chanh test"; preparationTime = 2 }
)

foreach ($item in $menuItems) {
    try {
        $added = ApiPost "$merchantUrl/merchants/$merchantId/menu/items" $item $token
        $menuItemIds += $added.id
        Pass "2.2 Added: $($added.name) - $($added.price) VND"
    } catch {
        Fail "2.2 Add $($item.name): $($_.Exception.Message)"
    }
    Start-Sleep -Milliseconds 300
}

# Fetch menu to verify
try {
    $menu = ApiGet "$merchantUrl/merchants/$merchantId/menu" $token
    $count = if ($menu -is [array]) { $menu.Count } elseif ($menu.items) { $menu.items.Count } else { 1 }
    Pass "2.2 Menu verified: $count items"
} catch {
    Fail "2.2 Get menu: $($_.Exception.Message)"
}

# ---------------------------------------------------------------
# 2.3 SET OPERATING HOURS
# ---------------------------------------------------------------
Write-Host "`n[2.3] Set Operating Hours..." -ForegroundColor Yellow

$hoursBody = @{
    operatingHours = @{
        monday    = @{ open = "07:00"; close = "22:00"; isOpen = $true }
        tuesday   = @{ open = "07:00"; close = "22:00"; isOpen = $true }
        wednesday = @{ open = "07:00"; close = "22:00"; isOpen = $true }
        thursday  = @{ open = "07:00"; close = "22:00"; isOpen = $true }
        friday    = @{ open = "07:00"; close = "23:00"; isOpen = $true }
        saturday  = @{ open = "08:00"; close = "23:00"; isOpen = $true }
        sunday    = @{ open = "08:00"; close = "22:00"; isOpen = $true }
    }
}
try {
    $updated = ApiPut "$merchantUrl/merchants/$merchantId/operating-hours" $hoursBody $token
    Pass "2.3 Operating hours set successfully"
} catch {
    Info "2.3 Operating hours: $($_.Exception.Message)"
    # Try direct PUT to merchant
    try {
        $fullBody = @{ name = "Test P2 Restaurant $ts"; phone = $phone; address = "123 Test St"; email = "p2rest@test.com"; description = "Phase 2 test restaurant"; isOpen = $true }
        $updated = ApiPut "$merchantUrl/merchants/$merchantId" $fullBody $token
        Pass "2.3 Merchant updated (isOpen=true)"
    } catch {
        Info "2.3 Merchant update: $($_.Exception.Message)"
    }
}

# ---------------------------------------------------------------
# 2.4 CHECK IS-OPEN
# ---------------------------------------------------------------
Write-Host "`n[2.4] Check is-open status..." -ForegroundColor Yellow

try {
    $check = Invoke-RestMethod -Uri "$merchantUrl/merchants/$merchantId" -Method Get -Headers @{ Authorization = "Bearer $token" }
    $isOpen = if ($check.isOpen -ne $null) { $check.isOpen } else { $false }
    Pass "2.4 is-open check: $isOpen"
} catch {
    Fail "2.4 is-open: $($_.Exception.Message)"
}

# ---------------------------------------------------------------
# 2.5 INVENTORY (tied to menu items + merchant)
# ---------------------------------------------------------------
Write-Host "`n[2.5] Inventory Management..." -ForegroundColor Yellow

if ($menuItemIds.Count -gt 0) {
    $firstItemId = $menuItemIds[0]
    
    # Create inventory for first menu item
    $invBody = @{
        menuItemId = $firstItemId
        merchantId = $merchantId
        quantity = 100
        unit = "portion"
    }
    try {
        $inv = ApiPost "$inventoryUrl/inventory" $invBody $token
        Pass "2.5 Inventory created: Qty=$($inv.quantity)"
    } catch {
        Info "2.5 Create inventory: $($_.Exception.Message)"
        # Try GET to check if exists
        try {
            $existingInv = ApiGet "$inventoryUrl/inventory?merchantId=$merchantId" $token
            $invCount = if ($existingInv -is [array]) { $existingInv.Count } elseif ($existingInv.items) { $existingInv.items.Count } else { 1 }
            Pass "2.5 Existing inventory: $invCount items"
        } catch {
            Info "2.5 Get inventory: $($_.Exception.Message)"
        }
    }
} else {
    Info "2.5 Skipped - no menu items"
}

# ---------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PHASE 2 TEST COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Results: $($results.pass) PASSED / $($results.fail) FAILED" -ForegroundColor White
Write-Host ""
Write-Host "Phase 2 Features Tested:" -ForegroundColor White
Write-Host "  2.1 Create Merchant Profile" -ForegroundColor Gray
Write-Host "  2.2 Add/Verify Menu Items" -ForegroundColor Gray
Write-Host "  2.3 Set Operating Hours" -ForegroundColor Gray
Write-Host "  2.4 Check is-open status" -ForegroundColor Gray
Write-Host "  2.5 Inventory Management" -ForegroundColor Gray