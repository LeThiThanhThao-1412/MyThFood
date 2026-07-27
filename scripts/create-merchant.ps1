$ErrorActionPreference = "Continue"
$identityUrl = "http://localhost:3001/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Creating Merchant Account" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$phone = "+84903334455"
$pass = "Merchant123"

# Step 1: Register (KHÔNG có header Authorization)
Write-Host "`n[1] Registering merchant user..." -ForegroundColor Yellow
$body = @{
    phoneNumber = $phone
    fullName = "Chu Quan Pho"
    password = $pass
    email = "chuquan@pho24.com"
    roles = @("MERCHANT_OWNER")
} | ConvertTo-Json

try {
    $r = Invoke-RestMethod -Uri "$identityUrl/auth/register" -Method Post -Body $body -ContentType "application/json"
    Write-Host "  Registered: $($r.data.user.fullName) (ID: $($r.data.user.id))" -ForegroundColor Green
    $userId = $r.data.user.id
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "  User already exists, logging in..." -ForegroundColor Yellow
    } else {
        Write-Host "  Register error: $($_.Exception.Message)" -ForegroundColor Red
        # Thử login xem user có tồn tại không
        Write-Host "  Trying login anyway..." -ForegroundColor Yellow
    }
}

# Step 2: Login (luôn thử login)
Write-Host "`n[2] Logging in..." -ForegroundColor Yellow
$loginBody = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$identityUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $login.data.accessToken
$userId = $login.data.user.id
Write-Host "  Login successful! User ID: $userId" -ForegroundColor Green
Write-Host "  Token: $($token.Substring(0,30))..." -ForegroundColor Green

# Step 3: Create Merchant
Write-Host "`n[3] Creating merchant profile..." -ForegroundColor Yellow
$merchantBody = @{
    userId = $userId
    name = "Pho 24"
    phone = "02838231234"
    address = "123 Le Loi, District 1, HCMC"
    email = "pho24@example.com"
    description = "Pho truyen thong Viet Nam"
    latitude = 10.775
    longitude = 106.7
} | ConvertTo-Json

$merchantId = $null
try {
    $h = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
    $m = Invoke-RestMethod -Uri "$merchantUrl/merchants" -Method Post -Body $merchantBody -Headers $h
    $merchantId = $m.id
    Write-Host "  Merchant created: $($m.name) (ID: $merchantId, Status: $($m.status))" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "  Merchant already exists, finding existing..." -ForegroundColor Yellow
    } else {
        Write-Host "  Create merchant error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Try to find existing merchant
    try {
        $h = @{ Authorization = "Bearer $token" }
        $list = Invoke-RestMethod -Uri "$merchantUrl/merchants?take=100" -Method Get -Headers $h
        $existing = ($list.items | Where-Object { $_.userId -eq $userId })
        if ($existing) {
            $merchantId = $existing.id
            Write-Host "  Found existing merchant: $($existing.name) (ID: $merchantId)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Could not find existing merchant" -ForegroundColor Yellow
    }
}

# Step 4: Approve merchant (using admin account)
Write-Host "`n[4] Approving merchant..." -ForegroundColor Yellow

# Login as admin
$adminBody = @{ phoneNumber = "+84901112233"; password = "Admin123" } | ConvertTo-Json
try {
    $adminLogin = Invoke-RestMethod -Uri "$identityUrl/auth/login" -Method Post -Body $adminBody -ContentType "application/json"
    $adminToken = $adminLogin.data.accessToken
    Write-Host "  Admin logged in" -ForegroundColor Green
    
    if ($merchantId) {
        try {
            $ah = @{ Authorization = "Bearer $adminToken"; "Content-Type" = "application/json" }
            $approved = Invoke-RestMethod -Uri "$merchantUrl/merchants/$merchantId/approve" -Method Put -Headers $ah
            Write-Host "  Merchant approved: Status=$($approved.status)" -ForegroundColor Green
        } catch {
            if ($_.Exception.Response.StatusCode -eq 409) {
                Write-Host "  Merchant already approved" -ForegroundColor Yellow
            } else {
                Write-Host "  Approve error: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
} catch {
    Write-Host "  Admin login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Please approve merchant manually" -ForegroundColor Yellow
}

# Step 5: Add menu items
if ($merchantId) {
    Write-Host "`n[5] Adding menu items..." -ForegroundColor Yellow
    $mh = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

    $menuItems = @(
        @{ name = "Pho Bo Tai"; price = 50000; category = "MAIN_COURSE"; description = "Pho bo tai tuoi ngon"; preparationTime = 15 },
        @{ name = "Pho Ga"; price = 45000; category = "MAIN_COURSE"; description = "Pho ga thom ngon"; preparationTime = 12 },
        @{ name = "Bun Bo Hue"; price = 55000; category = "MAIN_COURSE"; description = "Bun bo Hue dac biet"; preparationTime = 20 },
        @{ name = "Tra Da"; price = 5000; category = "BEVERAGE"; description = "Tra da mat lanh"; preparationTime = 1 },
        @{ name = "Che Ba Mau"; price = 15000; category = "DESSERT"; description = "Che ba mau ngot mat"; preparationTime = 5 }
    )

    $addedCount = 0
    foreach ($item in $menuItems) {
        try {
            $mi = Invoke-RestMethod -Uri "$merchantUrl/merchants/$merchantId/menu/items" -Method Post -Body ($item | ConvertTo-Json) -Headers $mh
            Write-Host "  Added: $($mi.name) - $($mi.price) VND" -ForegroundColor Green
            $addedCount++
        } catch {
            if ($_.Exception.Response.StatusCode -eq 409) {
                Write-Host "  $($item.name) already exists" -ForegroundColor Yellow
            } else {
                Write-Host "  Add error for $($item.name): $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
    Write-Host "  Menu items added: $addedCount/$($menuItems.Count)" -ForegroundColor Gray
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  MERCHANT ACCOUNT READY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Phone: $phone" -ForegroundColor Green
Write-Host "  Pass:  $pass" -ForegroundColor Green
Write-Host "  User ID: $userId" -ForegroundColor Gray
if ($merchantId) {
    Write-Host "  Merchant ID: $merchantId" -ForegroundColor Gray
}
Write-Host "  App:   http://localhost:4003/login" -ForegroundColor Gray
Write-Host ""