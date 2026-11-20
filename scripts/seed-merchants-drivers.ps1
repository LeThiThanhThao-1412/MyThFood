# ============================================================================
# MyThFood - Seed test data: 7 merchants + 10 drivers
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/seed-merchants-drivers.ps1
# Notes:  - Idempotent (skips accounts that already exist)
#         - Merchants: status PENDING (admin approves later)
#         - Drivers:   status INACTIVE (admin activates later)
# ============================================================================
$ErrorActionPreference = "Continue"

$identityUrl = "http://localhost:3001/api/v1"
$merchantUrl  = "http://localhost:3003/api/v1"
$driverUrl    = "http://localhost:3007/api/v1"
$PASS         = "MyFood@123"

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
$merchants = @(
    @{ phone = "+84906500001"; name = "Pho 24";           address = "123 Le Loi, Q1, TP.HCM";        lat = 10.773; lng = 106.701 },
    @{ phone = "+84906500002"; name = "Com Tam Sai Gon";  address = "45 Nguyen Hue, Q1, TP.HCM";     lat = 10.774; lng = 106.703 },
    @{ phone = "+84906500003"; name = "Bun Bo Hue Xua";   address = "12 Tran Hung Dao, Q5, TP.HCM";  lat = 10.757; lng = 106.668 },
    @{ phone = "+84906500004"; name = "Tra Sua Bobapop";  address = "78 Pham Ngu Lao, Q1, TP.HCM";   lat = 10.768; lng = 106.692 },
    @{ phone = "+84906500005"; name = "Pizza House";      address = "234 Vo Van Ngan, Thu Duc";       lat = 10.851; lng = 106.772 },
    @{ phone = "+84906500006"; name = "Ga Ran Ngon";      address = "56 Cach Mang Thang 8, Q3, TP.HCM"; lat = 10.783; lng = 106.683 },
    @{ phone = "+84906500007"; name = "Com Nieu Sai Gon"; address = "89 Hai Ba Trung, Q3, TP.HCM";   lat = 10.782; lng = 106.696 }
)

$drivers = @(
    @{ phone = "+84907600001"; name = "Nguyen Van An" },
    @{ phone = "+84907600002"; name = "Tran Van Binh" },
    @{ phone = "+84907600003"; name = "Le Van Cuong" },
    @{ phone = "+84907600004"; name = "Pham Van Dung" },
    @{ phone = "+84907600005"; name = "Hoang Van Em" },
    @{ phone = "+84907600006"; name = "Vu Van Giang" },
    @{ phone = "+84907600007"; name = "Dang Van Hung" },
    @{ phone = "+84907600008"; name = "Bui Van Khanh" },
    @{ phone = "+84907600009"; name = "Do Van Linh" },
    @{ phone = "+84907600010"; name = "Ngo Van Minh" }
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Register-Login {
    param([string]$Phone, [string]$Name, [string[]]$Roles, [string]$Email)

    $regBody = @{
        phoneNumber = $Phone
        fullName    = $Name
        password    = $PASS
        email       = $Email
        roles       = $Roles
    } | ConvertTo-Json

    try {
        Invoke-RestMethod -Uri "$identityUrl/auth/register" -Method Post -Body $regBody -ContentType "application/json" | Out-Null
        Write-Host "    [NEW] registered $Phone" -ForegroundColor Gray
    } catch {
        $msg = $_.ErrorDetails.Message
        if ($msg -match "already exists") {
            Write-Host "    [EXISTS] $Phone" -ForegroundColor Gray
        } else {
            Write-Host "    [WARN] register $Phone : $msg" -ForegroundColor Yellow
        }
    }

    $loginBody = @{ phoneNumber = $Phone; password = $PASS } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$identityUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    return $res.data
}

# ---------------------------------------------------------------------------
# 1. Merchants
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  [1] Creating 7 merchants" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$merchantCreated = 0
$i = 0
foreach ($m in $merchants) {
    $i++
    Write-Host "  [Merchant $i/7] $($m.name) ($($m.phone))" -ForegroundColor Gray

    $acc = Register-Login -Phone $m.phone -Name $m.name -Roles @("MERCHANT_OWNER") -Email ("merchant{0}@test.com" -f $i)
    $token  = $acc.accessToken
    $userId = $acc.user.id

    $h = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
    $body = @{
        userId      = $userId
        name        = $m.name
        phone       = $m.phone
        address     = $m.address
        email       = "merchant{0}@test.com" -f $i
        description = "Test restaurant #$i"
        latitude    = $m.lat
        longitude   = $m.lng
    } | ConvertTo-Json

    try {
        $r = Invoke-RestMethod -Uri "$merchantUrl/merchants" -Method Post -Body $body -Headers $h
        Write-Host ("    OK: {0} - id {1}" -f $r.name, $r.id) -ForegroundColor Green
        $merchantCreated++
    } catch {
        Write-Host ("    [SKIP] {0}: {1}" -f $m.name, $_.ErrorDetails.Message) -ForegroundColor Yellow
    }
    Start-Sleep -Milliseconds 300
}

# ---------------------------------------------------------------------------
# 2. Drivers
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  [2] Creating 10 drivers" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$driverCreated = 0
$i = 0
foreach ($d in $drivers) {
    $i++
    Write-Host "  [Driver $i/10] $($d.name) ($($d.phone))" -ForegroundColor Gray

    $acc = Register-Login -Phone $d.phone -Name $d.name -Roles @("DRIVER") -Email ("driver{0}@test.com" -f $i)
    $token  = $acc.accessToken
    $userId = $acc.user.id

    $digits = $d.phone -replace '\D', ''
    $h = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
    $body = @{
        userId                    = $userId
        fullName                  = $d.name
        phoneNumber               = $d.phone
        email                     = "driver{0}@test.com" -f $i
        idCardNumber              = "079" + $digits.Substring($digits.Length - 7)
        driverLicenseNumber       = "DL" + $digits
        vehicleRegistrationNumber = "59A-" + $digits.Substring($digits.Length - 5)
        insuranceNumber           = "INS-" + $digits
    } | ConvertTo-Json

    try {
        $r = Invoke-RestMethod -Uri "$driverUrl/drivers" -Method Post -Body $body -Headers $h
        $dName = if ($r.data) { $r.data.fullName } else { $r.fullName }
        $dId   = if ($r.data) { $r.data.id } else { $r.id }
        Write-Host ("    OK: {0} - id {1}" -f $dName, $dId) -ForegroundColor Green
        $driverCreated++
    } catch {
        Write-Host ("    [SKIP] {0}: {1}" -f $d.name, $_.ErrorDetails.Message) -ForegroundColor Yellow
    }
    Start-Sleep -Milliseconds 300
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DONE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Merchants created: $merchantCreated / $($merchants.Count)"
Write-Host "  Drivers created:   $driverCreated / $($drivers.Count)"
Write-Host ""
Write-Host "  Next: login admin portal (4004) to approve merchants & activate drivers."
Write-Host "========================================" -ForegroundColor Cyan
