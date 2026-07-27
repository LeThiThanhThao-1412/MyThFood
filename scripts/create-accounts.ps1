$ErrorActionPreference = "Continue"

$identityUrl = "http://localhost:3001/api/v1"
$driverUrl = "http://localhost:3007/api/v1"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Creating Test Accounts" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ==========================================
# 1. DRIVER ACCOUNT
# ==========================================
Write-Host "`n[1] Creating DRIVER account..." -ForegroundColor Yellow

$driverPhone = "+84907654321"
$driverPass = "Driver123"

$registerBody = @{
    phoneNumber = $driverPhone
    fullName = "Tai Xe Mot"
    password = $driverPass
    email = "taixe@example.com"
    roles = @("DRIVER")
} | ConvertTo-Json

try {
    $r = Invoke-RestMethod -Uri "$identityUrl/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
    Write-Host "  Driver registered: $($r.data.user.fullName) (ID: $($r.data.user.id))" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "  Driver already exists, logging in..." -ForegroundColor Yellow
    } else {
        Write-Host "  Register error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Login as driver
$loginBody = @{ phoneNumber = $driverPhone; password = $driverPass } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "$identityUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$driverToken = $loginResp.data.accessToken
$driverUserId = $loginResp.data.user.id
Write-Host "  Driver logged in! Token: $($driverToken.Substring(0, 30))..." -ForegroundColor Green

# Create driver profile via Driver Service
$driverProfileBody = @{
    userId = $driverUserId
    fullName = "Tai Xe Mot"
    phoneNumber = $driverPhone
    email = "taixe@example.com"
    vehicleType = "MOTORBIKE"
    licensePlate = "59A-12345"
    idCardNumber = "079201234567"
    driverLicenseNumber = "DL123456789"
    vehicleRegistrationNumber = "VR-59A-12345"
    insuranceNumber = "INS-2024-98765"
} | ConvertTo-Json

try {
    $headers = @{ Authorization = "Bearer $driverToken" ; "Content-Type" = "application/json" }
    $d = Invoke-RestMethod -Uri "$driverUrl/drivers" -Method Post -Body $driverProfileBody -Headers $headers
    Write-Host "  Driver profile created: $($d.data.fullName) | ID: $($d.data.id)" -ForegroundColor Green
} catch {
    Write-Host "  Driver profile error (may already exist): $($_.Exception.Message)" -ForegroundColor Yellow
}

# ==========================================
# 2. CONSUMER / MERCHANT ACCOUNT
# ==========================================
Write-Host "`n[2] Creating CONSUMER/MERCHANT account..." -ForegroundColor Yellow

$consumerPhone = "+84901234567"
$consumerPass = "MySecurePass123"

$consumerRegisterBody = @{
    phoneNumber = $consumerPhone
    fullName = "Test User"
    password = $consumerPass
    email = "test@example.com"
    roles = @("CONSUMER", "MERCHANT_OWNER")
} | ConvertTo-Json

try {
    $cr = Invoke-RestMethod -Uri "$identityUrl/auth/register" -Method Post -Body $consumerRegisterBody -ContentType "application/json"
    Write-Host "  Consumer registered: $($cr.data.user.fullName) (ID: $($cr.data.user.id))" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "  Consumer already exists, logging in..." -ForegroundColor Yellow
    } else {
        Write-Host "  Register error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

$consumerLoginBody = @{ phoneNumber = $consumerPhone; password = $consumerPass } | ConvertTo-Json
$consumerLoginResp = Invoke-RestMethod -Uri "$identityUrl/auth/login" -Method Post -Body $consumerLoginBody -ContentType "application/json"
$consumerToken = $consumerLoginResp.data.accessToken
$consumerUserId = $consumerLoginResp.data.user.id
Write-Host "  Consumer logged in! Token: $($consumerToken.Substring(0, 30))..." -ForegroundColor Green

# Create consumer profile
try {
    $consumerHeaders = @{ Authorization = "Bearer $consumerToken"; "Content-Type" = "application/json" }
    $consumerProfileBody = @{
        userId = $consumerUserId
        fullName = "Test User"
        phone = $consumerPhone
        email = "test@example.com"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:3002/api/v1/consumers" -Method Post -Body $consumerProfileBody -Headers $consumerHeaders | Out-Null
    Write-Host "  Consumer profile created" -ForegroundColor Green
} catch {
    Write-Host "  Consumer profile (may exist): $($_.Exception.Message)" -ForegroundColor Yellow
}

# Create merchant profile for this user
try {
    $merchantHeaders = @{ Authorization = "Bearer $consumerToken"; "Content-Type" = "application/json" }
    $merchantProfileBody = @{
        userId = $consumerUserId
        name = "Nha Hang Test"
        phone = "+84901234567"
        address = "123 Le Loi, District 1, HCMC"
        email = "nhahang@test.com"
        description = "Nha hang test cua MyThFood"
        latitude = 10.775
        longitude = 106.7
    } | ConvertTo-Json
    $mr = Invoke-RestMethod -Uri "http://localhost:3003/api/v1/merchants" -Method Post -Body $merchantProfileBody -Headers $merchantHeaders
    Write-Host "  Merchant profile created: $($mr.name) (ID: $($mr.id))" -ForegroundColor Green
    $testMerchantId = $mr.id
    
    # Approve merchant
    try {
        $adminLoginBody = @{ phoneNumber = "+84901112233"; password = "Admin123" } | ConvertTo-Json
        $adminLoginResp = Invoke-RestMethod -Uri "$identityUrl/auth/login" -Method Post -Body $adminLoginBody -ContentType "application/json"
        $adminToken2 = $adminLoginResp.data.accessToken
        $ah = @{ Authorization = "Bearer $adminToken2"; "Content-Type" = "application/json" }
        Invoke-RestMethod -Uri "http://localhost:3003/api/v1/merchants/$testMerchantId/approve" -Method Put -Headers $ah | Out-Null
        Write-Host "  Merchant auto-approved!" -ForegroundColor Green
    } catch {
        Write-Host "  Approve error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Merchant profile (may exist): $($_.Exception.Message)" -ForegroundColor Yellow
}

# ==========================================
# 3. ADMIN ACCOUNT
# ==========================================
Write-Host "`n[2] Creating ADMIN account..." -ForegroundColor Yellow

$adminPhone = "+84901112233"
$adminPass = "Admin123"

$adminRegisterBody = @{
    phoneNumber = $adminPhone
    fullName = "Admin Master"
    password = $adminPass
    email = "admin@mythfood.com"
    roles = @("ADMIN")
} | ConvertTo-Json

try {
    $ar = Invoke-RestMethod -Uri "$identityUrl/auth/register" -Method Post -Body $adminRegisterBody -ContentType "application/json"
    Write-Host "  Admin registered: $($ar.data.user.fullName) (ID: $($ar.data.user.id))" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "  Admin already exists, logging in..." -ForegroundColor Yellow
    } else {
        Write-Host "  Register error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

$adminLoginBody = @{ phoneNumber = $adminPhone; password = $adminPass } | ConvertTo-Json
$adminLoginResp = Invoke-RestMethod -Uri "$identityUrl/auth/login" -Method Post -Body $adminLoginBody -ContentType "application/json"
$adminToken = $adminLoginResp.data.accessToken
Write-Host "  Admin logged in! Token: $($adminToken.Substring(0, 30))..." -ForegroundColor Green

# ==========================================
# SUMMARY
# ==========================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ACCOUNT SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Consumer / Merchant:" -ForegroundColor White
Write-Host "  Phone: +84901234567" -ForegroundColor Green
Write-Host "  Pass:  MySecurePass123" -ForegroundColor Green
Write-Host "  Roles: CONSUMER, MERCHANT_OWNER" -ForegroundColor Gray
Write-Host "  Apps:  http://localhost:4001 (Consumer) / http://localhost:4003 (Merchant)" -ForegroundColor Gray
Write-Host ""
Write-Host "Driver:" -ForegroundColor White
Write-Host "  Phone: $driverPhone" -ForegroundColor Green
Write-Host "  Pass:  $driverPass" -ForegroundColor Green
Write-Host "  Role:  DRIVER" -ForegroundColor Gray
Write-Host "  App:   http://localhost:4002" -ForegroundColor Gray
Write-Host ""
Write-Host "Admin:" -ForegroundColor White
Write-Host "  Phone: $adminPhone" -ForegroundColor Green
Write-Host "  Pass:  $adminPass" -ForegroundColor Green
Write-Host "  Role:  ADMIN" -ForegroundColor Gray
Write-Host "  App:   http://localhost:4004" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan