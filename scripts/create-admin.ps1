$ErrorActionPreference = "Continue"
$identityUrl = "http://localhost:3001/api/v1"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Creating Admin Account" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$adminPhone = "+84901112233"
$adminPass = "Admin@123"

# Register Admin
Write-Host "`n[1] Registering admin account..." -ForegroundColor Yellow

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
        Write-Host "  Admin already exists" -ForegroundColor Yellow
    } else {
        Write-Host "  Register error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Login Admin
Write-Host "`n[2] Logging in as admin..." -ForegroundColor Yellow

$adminLoginBody = @{ 
    phoneNumber = $adminPhone
    password = $adminPass 
} | ConvertTo-Json

try {
    $adminLoginResp = Invoke-RestMethod -Uri "$identityUrl/auth/login" -Method Post -Body $adminLoginBody -ContentType "application/json"
    $adminToken = $adminLoginResp.data.accessToken
    $adminUserId = $adminLoginResp.data.user.id
    
    Write-Host "  Admin logged in successfully!" -ForegroundColor Green
    Write-Host "  User ID: $adminUserId" -ForegroundColor Gray
    Write-Host "  Token: $($adminToken.Substring(0, 30))..." -ForegroundColor Gray
} catch {
    Write-Host "  Login error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ADMIN ACCOUNT READY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Phone: $adminPhone" -ForegroundColor Green
Write-Host "  Pass:  $adminPass" -ForegroundColor Green
Write-Host "  Role:  ADMIN" -ForegroundColor Gray
Write-Host "  App:   http://localhost:4004" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan