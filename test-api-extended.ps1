$ErrorActionPreference = "Continue"

$loginBody = @{ phoneNumber = "+84901234567"; password = "MySecurePass123" } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "http://localhost:3001/api/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResp.data.accessToken
$authHeader = @{ Authorization = "Bearer $token" }
Write-Host "Token obtained" -ForegroundColor Green

# Correct URL bases
$invBase = "http://localhost:3005/api/v1/inventory"
$payBase = "http://localhost:3006/api/v1/api/v1/payments"

$mId = "9d27774f-f465-463f-b09d-a6223de3e012"
$miId = "0572befc-5cf4-4db4-af68-a39c5cf12f82"
$cId = "6d5b5f65-7cde-4356-9981-f94ac98200f3"
$oId = "da6a61ff-be7e-4e27-83ef-2903fc71b50a"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  INVENTORY SERVICE (Port 3005)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "[I-1] Create inventory item" -ForegroundColor Yellow
try {
    $b = @{ menuItemId = $miId; merchantId = $mId; totalQuantity = 100; lowStockThreshold = 10 } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri $invBase -Method Post -Body $b -Headers $authHeader -ContentType "application/json"
    $invId = $r.id
    Write-Host "  PASS: ID=$invId, Total=$($r.totalQuantity), Avail=$($r.availableQuantity)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[I-2] Get all inventory" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri $invBase -Method Get -Headers $authHeader
    Write-Host "  PASS: Count=$($r.Count)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[I-3] Get by menuItemId" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$invBase/menuitem/$miId" -Method Get -Headers $authHeader
    Write-Host "  PASS: Avail=$($r.availableQuantity), isOutOfStock=$($r.isOutOfStock)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[I-4] Get by ID" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$invBase/$invId" -Method Get -Headers $authHeader
    Write-Host "  PASS: Avail=$($r.availableQuantity), Resv=$($r.reservedQuantity)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[I-5] Update total to 200" -ForegroundColor Yellow
try {
    $b = @{ totalQuantity = 200 } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$invBase/$invId/total" -Method Put -Body $b -Headers $authHeader -ContentType "application/json"
    Write-Host "  PASS: Total=$($r.totalQuantity), Avail=$($r.availableQuantity)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[I-6] Reserve 2 items for order" -ForegroundColor Yellow
try {
    $b = @{ orderId = $oId; quantity = 2 } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$invBase/$invId/reserve" -Method Post -Body $b -Headers $authHeader -ContentType "application/json"
    Write-Host "  PASS: Avail=$($r.availableQuantity), Resv=$($r.reservedQuantity)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[I-7] Release reservation" -ForegroundColor Yellow
try {
    $b = @{ orderId = $oId; reason = "Cancel" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$invBase/$invId/release" -Method Post -Body $b -Headers $authHeader -ContentType "application/json"
    Write-Host "  PASS: Avail=$($r.availableQuantity), Resv=$($r.reservedQuantity)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[I-8] Reserve + Consume" -ForegroundColor Yellow
try {
    $b = @{ orderId = $oId; quantity = 3 } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$invBase/$invId/reserve" -Method Post -Body $b -Headers $authHeader -ContentType "application/json"
    Write-Host "    Reserved: Avail=$($r.availableQuantity)" -ForegroundColor Green
    $b2 = @{ orderId = $oId } | ConvertTo-Json
    $r2 = Invoke-RestMethod -Uri "$invBase/$invId/consume" -Method Post -Body $b2 -Headers $authHeader -ContentType "application/json"
    Write-Host "  PASS Consume: Avail=$($r2.availableQuantity), Total=$($r2.totalQuantity)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PAYMENT SERVICE (Port 3006)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "[P-1] Create payment CASH" -ForegroundColor Yellow
try {
    $b = @{ orderId = $oId; consumerId = $cId; merchantId = $mId; amount = 120000; paymentMethod = "CASH" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri $payBase -Method Post -Body $b -Headers $authHeader -ContentType "application/json"
    $pId = $r.id
    Write-Host "  PASS: ID=$pId, Status=$($r.status), Amount=$($r.amount)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[P-2] Get all payments" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri $payBase -Method Get -Headers $authHeader
    Write-Host "  PASS: Count=$($r.Count)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[P-3] Find payment by orderId" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$payBase/order/$oId" -Method Get -Headers $authHeader
    if ($r) { Write-Host "  PASS: ID=$($r.id), Status=$($r.status)" -ForegroundColor Green }
    else { Write-Host "  PASS: null" -ForegroundColor Yellow }
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[P-4] Find payments by consumer" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$payBase/consumer/$cId" -Method Get -Headers $authHeader
    Write-Host "  PASS: Count=$($r.Count)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[P-5] Find payments by merchant" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$payBase/merchant/$mId" -Method Get -Headers $authHeader
    Write-Host "  PASS: Count=$($r.Count)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[P-6] Get wallet for merchant" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$payBase/wallet/$mId" -Method Get -Headers $authHeader
    if ($r) { Write-Host "  PASS: Balance=$($r.balance)" -ForegroundColor Green }
    else { Write-Host "  PASS: null (not created)" -ForegroundColor Yellow }
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "[P-7] Complete payment" -ForegroundColor Yellow
if ($pId) {
    try {
        $r = Invoke-RestMethod -Uri "$payBase/$pId/complete" -Method Patch -Body '{ "transactionId": "txn-001" }' -Headers $authHeader -ContentType "application/json"
        Write-Host "  PASS: ID=$($r.id), Status=$($r.status)" -ForegroundColor Green
    } catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }
}

Write-Host "[P-8] Create + Fail payment" -ForegroundColor Yellow
try {
    $b = @{ orderId = "00000000-0000-0000-0000-000000000001"; consumerId = $cId; merchantId = $mId; amount = 50000; paymentMethod = "CASH" } | ConvertTo-Json
    $p2 = Invoke-RestMethod -Uri $payBase -Method Post -Body $b -Headers $authHeader -ContentType "application/json"
    Write-Host "    Created: ID=$($p2.id)" -ForegroundColor Green
    $r = Invoke-RestMethod -Uri "$payBase/$($p2.id)/fail" -Method Patch -Body '{ "reason": "Insufficient funds" }' -Headers $authHeader -ContentType "application/json"
    Write-Host "  PASS: Status=$($r.status)" -ForegroundColor Green
} catch { Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  TEST COMPLETE!" -ForegroundColor Green
Write-Host "  Driver/Dispatch: NOT in docker-compose" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan