# ============================================================================
# MyThFood - Test Environment Setup
# Creates test accounts + profiles for all roles needed in business flow tests
# ============================================================================
$ErrorActionPreference = "Continue"

$identityUrl = "http://localhost:3001/api/v1"
$consumerUrl = "http://localhost:3002/api/v1"
$merchantUrl  = "http://localhost:3003/api/v1"
$driverUrl    = "http://localhost:3007/api/v1"

# FIXED TEST CREDENTIALS (persistent across test runs)
# NOTE: Consumer and Merchant are SEPARATE accounts (not shared)
$consumerPhone = "+84901234567"
$consumerPass  = "MyFood@123"
$merchantPhone = "+84902334455"
$merchantPass  = "MyFood@123"
$driverPhone   = "+84907654321"
$driverPass    = "Driver@123"
$adminPhone    = "+84901112233"
$adminPass     = "Admin@123"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MyThFood TEST ENVIRONMENT SETUP" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------
# HELPER: Call API with retry on rate limit
# ------------------------------------------------------------------
function Invoke-Api {
    param(
        [string]$Uri,
        [string]$Method,
        [string]$Body,
        [hashtable]$Headers = @{ "Content-Type" = "application/json" },
        [int]$MaxRetries = 3
    )
    $retry = 0
    while ($retry -lt $MaxRetries) {
        try {
            $params = @{
                Uri = $Uri
                Method = $Method
                ContentType = "application/json"
                Headers = $Headers
            }
            if ($Body) { $params.Body = $Body }
            return Invoke-RestMethod @params
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            if ($statusCode -eq 429) {
                $retry++
                Write-Host "  [RATE-LIMIT] Retry $retry/$MaxRetries..." -ForegroundColor Yellow
                Start-Sleep -Seconds (5 * $retry)
            } elseif ($statusCode -eq 409) {
                # Already exists - not an error
                return $null
            } else {
                throw $_
            }
        }
    }
    throw "Rate limited after $MaxRetries retries"
}

# ------------------------------------------------------------------
# HELPER: Promote an account to ADMIN directly in the DB.
# identity-service blocks self-registering ADMIN (only CONSUMER/DRIVER/
# MERCHANT_OWNER are allowed), so the ADMIN role must be set at DB level.
# ------------------------------------------------------------------
function Set-AdminRole {
    param([string]$Phone)
    docker exec -e PGPASSWORD=$env:DB_PASSWORD mythfood-postgres psql -U mythfood -d mythfood_identity -c "UPDATE users SET roles = 'CONSUMER,ADMIN' WHERE phone_number = '$Phone';" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    [OK] ADMIN role set for $Phone" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] Could not set ADMIN role (docker/DB not reachable)." -ForegroundColor Yellow
        Write-Host "    Fix manually: docker exec -e PGPASSWORD=$env:DB_PASSWORD mythfood-postgres psql -U mythfood -d mythfood_identity -c ""UPDATE users SET roles = 'CONSUMER,ADMIN' WHERE phone_number = '$Phone';""" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------
# STEP 1: Ensure identity service is healthy
# ------------------------------------------------------------------
Write-Host "[1] Checking Identity Service health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/login" -Method Post `
        -Body '{"phoneNumber":"__health__","password":"__health__"}' `
        -ContentType "application/json" -ErrorAction SilentlyContinue
    Write-Host "  Identity Service is UP" -ForegroundColor Green
} catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq 401) {
        Write-Host "  Identity Service is UP (responds to auth)" -ForegroundColor Green
    } elseif ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq 429) {
        Write-Host "  Identity Service UP but RATE LIMITED! Restart with THROTTLE_TTL=0" -ForegroundColor Red
        Write-Host "  Run: cd mythfood/apps/identity-service && pnpm dev" -ForegroundColor Yellow
        exit 1
    } else {
        Write-Host "  Identity Service is DOWN or unreachable" -ForegroundColor Red
        Write-Host "  Start: cd mythfood/apps/identity-service && pnpm dev" -ForegroundColor Yellow
        exit 1
    }
}

# ------------------------------------------------------------------
# STEP 2: Register / Login accounts
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[2] Setting up test accounts..." -ForegroundColor Yellow

$accounts = @()

# --- CONSUMER ---
Write-Host "  [Consumer] +84901234567..." -ForegroundColor Gray
$cBody = @{
    phoneNumber = $consumerPhone
    fullName = "Test Consumer"
    password = $consumerPass
    email = "consumer@test.com"
    roles = @("CONSUMER")
} | ConvertTo-Json

$regResult = Invoke-Api -Uri "$identityUrl/auth/register" -Method Post -Body $cBody
if ($regResult) {
    Write-Host "    Registered: $($regResult.data.fullName)" -ForegroundColor Green
} else {
    Write-Host "    Account already exists" -ForegroundColor Gray
}

Start-Sleep -Seconds 1

# Login consumer
$cLoginBody = @{ phoneNumber = $consumerPhone; password = $consumerPass } | ConvertTo-Json
try {
    $cLogin = Invoke-Api -Uri "$identityUrl/auth/login" -Method Post -Body $cLoginBody
    $consumerToken = $cLogin.data.accessToken
    $consumerUserId = $cLogin.data.user.id
    Write-Host "    Logged in! Roles: $($cLogin.data.user.roles -join ', ')" -ForegroundColor Green
    $accounts += @{ role = "CONSUMER"; token = $consumerToken; userId = $consumerUserId }
} catch {
    Write-Host "    [FAIL] Login: $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# --- MERCHANT OWNER (Restaurant Owner) ---
Write-Host "  [Merchant] $merchantPhone..." -ForegroundColor Gray
$mBody = @{
    phoneNumber = $merchantPhone
    fullName = "Test Merchant"
    password = $merchantPass
    email = "merchant@test.com"
    roles = @("MERCHANT_OWNER")
} | ConvertTo-Json

$mRegResult = Invoke-Api -Uri "$identityUrl/auth/register" -Method Post -Body $mBody
if ($mRegResult) {
    Write-Host "    Registered: $($mRegResult.data.fullName)" -ForegroundColor Green
} else {
    Write-Host "    Account already exists" -ForegroundColor Gray
}

Start-Sleep -Seconds 1

# Login merchant
$mLoginBody = @{ phoneNumber = $merchantPhone; password = $merchantPass } | ConvertTo-Json
try {
    $mLogin = Invoke-Api -Uri "$identityUrl/auth/login" -Method Post -Body $mLoginBody
    $merchantToken = $mLogin.data.accessToken
    $merchantUserId = $mLogin.data.user.id
    Write-Host "    Logged in! Roles: $($mLogin.data.user.roles -join ', ')" -ForegroundColor Green
    $accounts += @{ role = "MERCHANT_OWNER"; token = $merchantToken; userId = $merchantUserId }
} catch {
    Write-Host "    [FAIL] Login: $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# --- DRIVER ---
Write-Host "  [Driver] +84907654321..." -ForegroundColor Gray
$dBody = @{
    phoneNumber = $driverPhone
    fullName = "Test Driver"
    password = $driverPass
    email = "driver@test.com"
    roles = @("DRIVER")
} | ConvertTo-Json

Invoke-Api -Uri "$identityUrl/auth/register" -Method Post -Body $dBody | Out-Null

Start-Sleep -Seconds 1

$dLoginBody = @{ phoneNumber = $driverPhone; password = $driverPass } | ConvertTo-Json
try {
    $dLogin = Invoke-Api -Uri "$identityUrl/auth/login" -Method Post -Body $dLoginBody
    $driverToken = $dLogin.data.accessToken
    $driverUserId = $dLogin.data.user.id
    Write-Host "    Logged in! Roles: $($dLogin.data.user.roles -join ', ')" -ForegroundColor Green
    $accounts += @{ role = "DRIVER"; token = $driverToken; userId = $driverUserId }
} catch {
    Write-Host "    [FAIL] Login: $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# --- ADMIN ---
Write-Host "  [Admin] +84901112233..." -ForegroundColor Gray
$aBody = @{
    phoneNumber = $adminPhone
    fullName = "Test Admin"
    password = $adminPass
    email = "admin@test.com"
    roles = @("ADMIN")
} | ConvertTo-Json

Invoke-Api -Uri "$identityUrl/auth/register" -Method Post -Body $aBody | Out-Null

Start-Sleep -Seconds 1

$aLoginBody = @{ phoneNumber = $adminPhone; password = $adminPass } | ConvertTo-Json
try {
    $aLogin = Invoke-Api -Uri "$identityUrl/auth/login" -Method Post -Body $aLoginBody
    $adminToken = $aLogin.data.accessToken
    $adminUserId = $aLogin.data.user.id
    Write-Host "    Logged in! Roles: $($aLogin.data.user.roles -join ', ')" -ForegroundColor Green
    $accounts += @{ role = "ADMIN"; token = $adminToken; userId = $adminUserId }
} catch {
    Write-Host "    [FAIL] Login: $($_.Exception.Message)" -ForegroundColor Red
}

# Promote to ADMIN at DB level (identity-service sanitizes ADMIN on self-register)
Set-AdminRole -Phone $adminPhone

# ------------------------------------------------------------------
# STEP 3: Create service profiles
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[3] Creating service profiles..." -ForegroundColor Yellow

# Consumer profile
Write-Host "  [Consumer Profile]" -ForegroundColor Gray
$consumerHeaders = @{ Authorization = "Bearer $consumerToken"; "Content-Type" = "application/json" }
$consumerProfileBody = @{
    userId = $consumerUserId
    fullName = "Test Consumer"
} | ConvertTo-Json
try {
    Invoke-Api -Uri "$consumerUrl/consumers" -Method Post -Body $consumerProfileBody -Headers $consumerHeaders | Out-Null
    Write-Host "    Profile created (or exists)" -ForegroundColor Green
} catch {
    Write-Host "    [WARN] $($_.Exception.Message)" -ForegroundColor Yellow
}

Start-Sleep -Seconds 1

# Merchant profile
Write-Host "  [Merchant Profile]" -ForegroundColor Gray
$merchantHeaders = @{ Authorization = "Bearer $merchantToken"; "Content-Type" = "application/json" }
$merchantProfileBody = @{
    userId = $merchantUserId
    name = "Nha Hang Test"
    phone = $merchantPhone
    address = "123 Le Loi, District 1, HCMC"
    email = "nhahang@test.com"
    description = "Nha hang test cua MyThFood"
    latitude = 10.775
    longitude = 106.7
} | ConvertTo-Json
$merchantId = $null
try {
    $mr = Invoke-Api -Uri "$merchantUrl/merchants" -Method Post -Body $merchantProfileBody -Headers $merchantHeaders
    if ($mr) {
        $merchantId = $mr.id
        Write-Host "    Created: $($mr.name) (ID: $merchantId)" -ForegroundColor Green
    } else {
        Write-Host "    Profile exists, fetching..." -ForegroundColor Gray
        $merchantList = Invoke-RestMethod -Uri "$merchantUrl/merchants?take=100" -Method Get -Headers @{ Authorization = "Bearer $merchantToken" }
        $items = if ($merchantList.items) { $merchantList.items } else { @() }
        foreach ($m in $items) {
            if ($m.userId -eq $merchantUserId) { $merchantId = $m.id; break }
        }
        Write-Host "    Found existing: ID=$merchantId" -ForegroundColor Green
    }
} catch {
    Write-Host "    [WARN] $($_.Exception.Message)" -ForegroundColor Yellow
}

# Approve merchant
if ($merchantId -and $adminToken) {
    Start-Sleep -Seconds 1
    try {
        $ah = @{ Authorization = "Bearer $adminToken"; "Content-Type" = "application/json" }
        Invoke-Api -Uri "$merchantUrl/merchants/$merchantId/approve" -Method Put -Headers $ah | Out-Null
        Write-Host "    Merchant APPROVED" -ForegroundColor Green
    } catch {
        Write-Host "    [WARN] Approve: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Start-Sleep -Seconds 1

# Driver profile
Write-Host "  [Driver Profile]" -ForegroundColor Gray
if ($driverToken) {
    $driverProfileBody = @{
        userId = $driverUserId
        fullName = "Test Driver"
        phoneNumber = $driverPhone
        email = "driver@test.com"
        vehicleType = "MOTORBIKE"
        licensePlate = "59A-12345"
        idCardNumber = "079201234567"
        driverLicenseNumber = "DL123456789"
        vehicleRegistrationNumber = "VR-59A-12345"
        insuranceNumber = "INS-2024-98765"
    } | ConvertTo-Json
    try {
        $dh = @{ Authorization = "Bearer $driverToken"; "Content-Type" = "application/json" }
        $dr = Invoke-Api -Uri "$driverUrl/drivers" -Method Post -Body $driverProfileBody -Headers $dh
        if ($dr) {
            Write-Host "    Created: $($dr.fullName) | ID: $($dr.id)" -ForegroundColor Green
        } else {
            Write-Host "    Profile exists" -ForegroundColor Green
        }
    } catch {
        Write-Host "    [WARN] $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------
# STEP 4: Add menu items to merchant
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[4] Adding menu items to merchant..." -ForegroundColor Yellow
if ($merchantId -and $merchantToken) {
    $menuItems = @(
        @{ name = "Pho Bo Tai"; price = 50000; category = "MAIN_COURSE"; description = "Pho bo tai tuoi ngon"; preparationTime = 15 },
        @{ name = "Pho Ga"; price = 45000; category = "MAIN_COURSE"; description = "Pho ga thom ngon"; preparationTime = 12 },
        @{ name = "Bun Bo Hue"; price = 55000; category = "MAIN_COURSE"; description = "Bun bo Hue dac biet"; preparationTime = 20 },
        @{ name = "Tra Da"; price = 5000; category = "BEVERAGE"; description = "Tra da mat lanh"; preparationTime = 1 }
    )

    $menuHeaders = @{ Authorization = "Bearer $merchantToken"; "Content-Type" = "application/json" }
    foreach ($item in $menuItems) {
        $itemBody = $item | ConvertTo-Json
        try {
            $added = Invoke-Api -Uri "$merchantUrl/merchants/$merchantId/menu/items" -Method Post -Body $itemBody -Headers $menuHeaders
            if ($added) {
                Write-Host "    [PASS] Added: $($added.name) - $($added.price) VND" -ForegroundColor Green
            } else {
                Write-Host "    [SKIP] Already exists: $($item.name)" -ForegroundColor Gray
            }
        } catch {
            Write-Host "    [WARN] $($item.name): $($_.Exception.Message)" -ForegroundColor Yellow
        }
        Start-Sleep -Milliseconds 500
    }
} else {
    Write-Host "  [SKIP] No merchant ID or token" -ForegroundColor Yellow
}

# ------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TEST ENVIRONMENT READY" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Accounts:" -ForegroundColor White
Write-Host "  Consumer:  $consumerPhone / $consumerPass  (CONSUMER - Dat mon)" -ForegroundColor Green
Write-Host "  Merchant:  $merchantPhone / $merchantPass  (MERCHANT_OWNER - Nha hang)" -ForegroundColor Green
Write-Host "  Driver:    $driverPhone / $driverPass  (DRIVER - Giao hang)" -ForegroundColor Green
Write-Host "  Admin:     $adminPhone / $adminPass  (ADMIN - Quan tri)" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend URLs:" -ForegroundColor White
Write-Host "  Consumer:  http://localhost:4001  (Khach hang)" -ForegroundColor Green
Write-Host "  Merchant:  http://localhost:4003  (Nha hang)" -ForegroundColor Green
Write-Host "  Driver:    http://localhost:4002  (Tai xe)" -ForegroundColor Green
Write-Host "  Admin:     http://localhost:4004  (Admin)" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan