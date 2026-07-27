$ErrorActionPreference = "Stop"
Write-Host "=== TEST 1: Login ===" -ForegroundColor Cyan
$body = @{phoneNumber="0900000001";password="Test@12345"} | ConvertTo-Json
try {
    $r = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/login" -Method POST -Body $body -ContentType "application/json"
    Write-Host "200 OK" -ForegroundColor Green
    Write-Host "AccessToken: $($r.data.accessToken.Substring(0,40))..." -ForegroundColor Gray
    Write-Host "RefreshToken Present: $($r.data.refreshToken -ne $null)" -ForegroundColor Green
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== TEST 2: Register strong password ===" -ForegroundColor Cyan
$phone = "091$((Get-Random -Min 1000000 -Max 9999999))"
$body = @{phoneNumber=$phone;fullName="Test User";password="Strong@P@ss1"} | ConvertTo-Json
try {
    $r = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/register" -Method POST -Body $body -ContentType "application/json"
    Write-Host "201 CREATED - Roles: $($r.data.roles -join ',')" -ForegroundColor Green
} catch {
    Write-Host "HTTP $($_.Exception.Response.StatusCode.value__): $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== TEST 3: Register weak password (should FAIL) ===" -ForegroundColor Cyan
$phone = "092$((Get-Random -Min 1000000 -Max 9999999))"
$body = @{phoneNumber=$phone;fullName="Weak PW";password="12345"} | ConvertTo-Json
try {
    $r = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/register" -Method POST -Body $body -ContentType "application/json"
    Write-Host "UNEXPECTED SUCCESS - should have been rejected!" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -ge 400) {
        Write-Host "CORRECTLY REJECTED: HTTP $statusCode" -ForegroundColor Green
    } else {
        Write-Host "HTTP $statusCode" -ForegroundColor Red
    }
}
Write-Host ""

Write-Host "=== TEST 4: Register with ADMIN role (should sanitize) ===" -ForegroundColor Cyan
$phone = "093$((Get-Random -Min 1000000 -Max 9999999))"
$body = @{phoneNumber=$phone;fullName="Hacker";password="Hack@1234";roles=@("ADMIN")} | ConvertTo-Json
try {
    $r = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/register" -Method POST -Body $body -ContentType "application/json"
    $actualRoles = $r.data.roles -join ','
    if ($actualRoles -eq "CONSUMER") {
        Write-Host "SECURE: Roles correctly sanitized to [$actualRoles] (not ADMIN)" -ForegroundColor Green
    } else {
        Write-Host "VULNERABILITY: Roles not sanitized - got [$actualRoles]" -ForegroundColor Red
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== TEST 5: Rate Limiting (rapid requests) ===" -ForegroundColor Cyan
$body = @{phoneNumber="0900000001";password="wrong"} | ConvertTo-Json
$throttled = $false
for ($i=1; $i -le 10; $i++) {
    try {
        $null = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/login" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        Write-Host "  Req $i : 200 OK" -ForegroundColor Gray
    } catch {
        $sc = $_.Exception.Response.StatusCode.value__
        if ($sc -eq 429) {
            Write-Host "  Req $i : 429 RATE LIMITED !" -ForegroundColor Green
            $throttled = $true
            break
        }
        Write-Host "  Req $i : HTTP $sc" -ForegroundColor Gray
    }
    Start-Sleep -Milliseconds 200
}
if (-not $throttled) {
    Write-Host "WARNING: No rate limiting detected (10 requests without 429)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== ALL TESTS DONE ===" -ForegroundColor Cyan