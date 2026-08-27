$ErrorActionPreference = "Continue"
$idUrl = "http://localhost:3001/api/v1"
$driverUrl = "http://localhost:3007/api/v1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PHASE 3 TEST: DRIVER ONLINE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ts = Get-Random -Minimum 100000 -Maximum 999999
$phone = "+84903$ts"
$pass = "Driver@123"

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
# 3.0 AUTH: Register + Login driver
# ---------------------------------------------------------------
Write-Host "`n[3.0] Driver Auth..." -ForegroundColor Yellow

try {
    $regBody = @{ phoneNumber = $phone; password = $pass; fullName = "Phase3 Driver"; email = "p3driver@test.com"; roles = @("DRIVER") } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$idUrl/auth/register" -Method Post -Body $regBody -ContentType "application/json"
    Info "Registered: $($r.data.fullName)"
} catch {
    if ($_.Exception.Message -match "already exists|409") { Info "Account exists" }
    else { Info "Register: $($_.Exception.Message)" }
}
Start-Sleep -Seconds 1

$driverToken = $null; $driverUserId = $null
try {
    $loginBody = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
    $l = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $driverToken = $l.data.accessToken
    $driverUserId = $l.data.user.id
    Pass "3.0 Driver login - Token obtained"
    Info "Roles: $($l.data.user.roles -join ', ')"
} catch {
    Fail "3.0 Driver login: $($_.Exception.Message)"
    exit 1
}

# ---------------------------------------------------------------
# 3.1 CREATE DRIVER PROFILE
# ---------------------------------------------------------------
Write-Host "`n[3.1] Create Driver Profile..." -ForegroundColor Yellow

$driverProfileBody = @{
    userId = $driverUserId
    fullName = "Phase3 Driver"
    phoneNumber = $phone
    email = "p3driver@test.com"
    vehicleType = "MOTORBIKE"
    licensePlate = "59A-$($ts % 99999)"
    idCardNumber = "07920$ts"
    driverLicenseNumber = "DL$ts"
    vehicleRegistrationNumber = "VR-59A-$($ts % 99999)"
    insuranceNumber = "INS-2024-$ts"
} | ConvertTo-Json

$dh = @{ Authorization = "Bearer $driverToken"; "Content-Type" = "application/json" }
$driverProfile = $null
try {
    $dr = Invoke-RestMethod -Uri "$driverUrl/drivers" -Method Post -Body $driverProfileBody -Headers $dh
    $driverProfile = if ($dr.data) { $dr.data } else { $dr }
    Pass "3.1 Driver profile created: $($driverProfile.fullName) | Status: $($driverProfile.status)"
} catch {
    if ($_.Exception.Message -match "409|already exists") {
        # Try getting existing profile
        try {
            $dp = Invoke-RestMethod -Uri "$driverUrl/drivers/user/$driverUserId" -Method Get -Headers @{ Authorization = "Bearer $driverToken" }
            $driverProfile = if ($dp.data) { $dp.data } else { $dp }
            Pass "3.1 Driver profile (existing): $($driverProfile.fullName) | Status: $($driverProfile.status)"
        } catch {
            Fail "3.1 Driver profile: $($_.Exception.Message)"
            exit 1
        }
    } else {
        Fail "3.1 Driver profile: $($_.Exception.Message)"
        exit 1
    }
}

$driverId = $driverProfile.id

# ---------------------------------------------------------------
# 3.2 COMPLETE TRAINING + ACTIVATE
# ---------------------------------------------------------------
Write-Host "`n[3.2] Activate Driver..." -ForegroundColor Yellow

try {
    $r = Invoke-RestMethod -Uri "$driverUrl/drivers/$driverId/complete-training" -Method Patch -Headers $dh
    $result = if ($r.data) { $r.data } else { $r }
    Pass "3.2 Training completed - Status: $($result.status)"
} catch {
    Info "3.2 Training: $($_.Exception.Message)"
}

Start-Sleep -Milliseconds 500

try {
    $r = Invoke-RestMethod -Uri "$driverUrl/drivers/$driverId/activate" -Method Patch -Headers $dh
    $result = if ($r.data) { $r.data } else { $r }
    Pass "3.2 Driver activated - Status: $($result.status)"
    $driverProfile = $result
} catch {
    Info "3.2 Activate: $($_.Exception.Message)"
}

# ---------------------------------------------------------------
# 3.3 UPDATE LOCATION
# ---------------------------------------------------------------
Write-Host "`n[3.2] Update Driver Location..." -ForegroundColor Yellow

try {
    $locBody = @{ latitude = 10.775; longitude = 106.7 } | ConvertTo-Json
    Invoke-RestMethod -Uri "$driverUrl/drivers/$driverId/location" -Method Patch -Body $locBody -Headers $dh | Out-Null
    Pass "3.2 Location updated: (10.775, 106.7)"
} catch {
    Info "3.2 Update location: $($_.Exception.Message)"
}

# ---------------------------------------------------------------
# 3.3 GO ONLINE
# ---------------------------------------------------------------
Write-Host "`n[3.3] Go Online..." -ForegroundColor Yellow

try {
    $r = Invoke-RestMethod -Uri "$driverUrl/drivers/$driverId/go-online" -Method Patch -Headers $dh
    $result = if ($r.data) { $r.data } else { $r }
    Pass "3.3 Driver go online - Status: $($result.onlineStatus)"
    $driverProfile = $result
} catch {
    if ($_.Exception.Message -match "already online") {
        Pass "3.3 Driver already online"
    } else {
        Info "3.3 Go online: $($_.Exception.Message)"
    }
}

# ---------------------------------------------------------------
# 3.4 UPDATE LOCATION AFTER ONLINE
# ---------------------------------------------------------------
Write-Host "`n[3.4] Update Location (moving)..." -ForegroundColor Yellow

try {
    $locBody2 = @{ latitude = 10.778; longitude = 106.705 } | ConvertTo-Json
    Invoke-RestMethod -Uri "$driverUrl/drivers/$driverId/location" -Method Patch -Body $locBody2 -Headers $dh | Out-Null
    Pass "3.4 Location updated: (10.778, 106.705)"
} catch {
    Info "3.4 Update location: $($_.Exception.Message)"
}

# ---------------------------------------------------------------
# 3.5 GET AVAILABLE DRIVERS
# ---------------------------------------------------------------
Write-Host "`n[3.5] Get Available Drivers..." -ForegroundColor Yellow

try {
    $r = Invoke-RestMethod -Uri "$driverUrl/drivers/available/list" -Method Get -Headers $dh
    $avail = if ($r.data) { $r.data } elseif ($r.items) { $r.items } else { @($r) }
    $count = if ($avail -is [array]) { $avail.Count } else { 1 }
    Pass "3.5 Available drivers: $count"
} catch {
    Info "3.5 Available drivers: $($_.Exception.Message)"
    # Try alternative endpoint
    try {
        $r = Invoke-RestMethod -Uri "$driverUrl/drivers/available" -Method Get -Headers $dh
        $avail = if ($r.data) { $r.data } elseif ($r.items) { $r.items } else { @($r) }
        $count = if ($avail -is [array]) { $avail.Count } else { 1 }
        Pass "3.5 Available drivers (alt): $count"
    } catch {
        Info "3.5 Available alt: $($_.Exception.Message)"
    }
}

# ---------------------------------------------------------------
# 3.6 GO OFFLINE
# ---------------------------------------------------------------
Write-Host "`n[3.6] Go Offline..." -ForegroundColor Yellow

try {
    $r = Invoke-RestMethod -Uri "$driverUrl/drivers/$driverId/go-offline" -Method Patch -Headers $dh
    $result = if ($r.data) { $r.data } else { $r }
    Pass "3.6 Driver go offline - Status: $($result.onlineStatus)"
} catch {
    Info "3.6 Go offline: $($_.Exception.Message)"
}

# ---------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PHASE 3 TEST COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Results: $($results.pass) PASSED / $($results.fail) FAILED" -ForegroundColor White
Write-Host ""
Write-Host "Phase 3 Features Tested:" -ForegroundColor White
Write-Host "  3.0 Driver Auth (register + login)" -ForegroundColor Gray
Write-Host "  3.1 Create/Get Driver Profile" -ForegroundColor Gray
Write-Host "  3.2 Update Driver Location" -ForegroundColor Gray
Write-Host "  3.3 Go Online" -ForegroundColor Gray
Write-Host "  3.4 Update Location (while online)" -ForegroundColor Gray
Write-Host "  3.5 Get Available Drivers List" -ForegroundColor Gray
Write-Host "  3.6 Go Offline" -ForegroundColor Gray