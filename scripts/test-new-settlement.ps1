$ErrorActionPreference = "Continue"
$idUrl = "http://localhost:3001/api/v1"
$orderUrl = "http://localhost:3004/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"
$driverUrl = "http://localhost:3007/api/v1"
$walletUrl = "http://localhost:3009/api/v1"

function Login($phone, $pass) {
    $body = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $body -ContentType "application/json"
    return @{ token = $r.data.accessToken; userId = $r.data.user.id }
}

function GetWallet($ownerId, $ownerType) {
    return Invoke-RestMethod -Uri "$walletUrl/wallets?ownerId=$ownerId&ownerType=$ownerType" -Method Get
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  NEW SETTLEMENT FORMULA TEST" -ForegroundColor Cyan
Write-Host "  Merchant 25% | Driver 20%" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$consumer = Login "+84901234567" "MyFood@123"
$merchant = Login "+84902334455" "MyFood@123"
$driver = Login "+84907654321" "Driver@123"
Write-Host "[AUTH] ok" -ForegroundColor Green

$mh = @{ Authorization = "Bearer $($merchant.token)" }
$mres = Invoke-RestMethod -Uri "$merchantUrl/merchants?take=100" -Headers $mh
$m = ($mres.items | Where-Object { $_.userId -eq $merchant.userId }) | Select-Object -First 1
if (-not $m) { Write-Host "[FAIL] No merchant" -ForegroundColor Red; exit 1 }
$merchantId = $m.id
Write-Host "[MERCHANT] $($m.name)" -ForegroundColor Green

$menu = Invoke-RestMethod -Uri "$merchantUrl/merchants/$merchantId/menu" -Headers $mh
if (-not $menu -or $menu.Count -eq 0) {
    $mi = @{ name="Com Tam"; price=50000; category="MAIN_COURSE"; description="Com tam test"; preparationTime=15 } | ConvertTo-Json
    $menu = @(Invoke-RestMethod -Uri "$merchantUrl/merchants/$merchantId/menu/items" -Method Post -Body $mi -Headers @{ Authorization="Bearer $($merchant.token)"; "Content-Type"="application/json" })
}
$item = $menu[0]
$foodTotal = 2 * [double]$item.price
Write-Host "[MENU] $($item.name) x2 = $foodTotal" -ForegroundColor Green

$dh = @{ Authorization = "Bearer $($driver.token)" }
$dres = Invoke-RestMethod -Uri "$driverUrl/drivers/user/$($driver.userId)" -Headers $dh
$ddata = if ($dres.data) { $dres.data } else { $dres }
$driverId = $ddata.id
Write-Host "[DRIVER] $($ddata.fullName)" -ForegroundColor Green

try {
    $topup = @{ ownerId = $driverId; ownerType = "DRIVER"; amount = 5000000 } | ConvertTo-Json
    Invoke-RestMethod -Uri "$walletUrl/wallets/topup" -Method Post -Body $topup -ContentType "application/json" -Headers @{ Authorization = "Bearer $($driver.token)" } | Out-Null
    Write-Host "[TOPUP] Driver +5M" -ForegroundColor Green
} catch { Write-Host "[TOPUP] skip" -ForegroundColor Yellow }

$shipFee = 15000
Write-Host "`n---- TEST 1: COD ----" -ForegroundColor Magenta
$bM = GetWallet $merchantId "MERCHANT"
$bD = GetWallet $driverId "DRIVER"
$bP = GetWallet "PLATFORM_DEFAULT" "PLATFORM"

$orderBody = @{
    consumerId = $consumer.userId; merchantId = $merchantId; orderType = "DELIVERY"; paymentMethod = "CASH"
    items = @(@{ menuItemId = $item.id; name = $item.name; quantity = 2; unitPrice = $item.price; specialInstructions = "" })
    deliveryAddress = "123 Le Loi, Q1, HCMC"; deliveryLatitude = 10.775; deliveryLongitude = 106.7
    deliveryFee = $shipFee; serviceFee = 2000; discount = 0
} | ConvertTo-Json -Depth 5

$oh = @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
$order = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $orderBody -Headers $oh
$oid = $order.id.Substring(0,8)
Write-Host "[PASS] Order #$oid method=$($order.paymentMethod) total=$($order.totalAmount)" -ForegroundColor Green

$mh2 = @{ Authorization = "Bearer $($merchant.token)"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/confirm" -Method Patch -Headers $mh2 | Out-Null
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/preparing" -Method Patch -Headers $mh2 | Out-Null
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/ready" -Method Patch -Headers $mh2 | Out-Null
$dh2 = @{ Authorization = "Bearer $($driver.token)"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/out-for-delivery" -Method Patch -Body (@{ driverId = $driverId } | ConvertTo-Json) -Headers $dh2 | Out-Null
Invoke-RestMethod -Uri "$orderUrl/orders/$($order.id)/delivered" -Method Patch -Headers $dh2 | Out-Null
Write-Host "[PASS] Order #$oid DELIVERED" -ForegroundColor Green
Start-Sleep -Seconds 2

$aM = GetWallet $merchantId "MERCHANT"
$aD = GetWallet $driverId "DRIVER"
$aP = GetWallet "PLATFORM_DEFAULT" "PLATFORM"

$eM = [Math]::Round($foodTotal * 0.75)
$eD = $foodTotal + [Math]::Round($shipFee * 0.20)
$eP = [Math]::Round($foodTotal * 0.25) + [Math]::Round($shipFee * 0.20)

Write-Host "`n[COD RESULT]" -ForegroundColor Yellow
Write-Host "  Expected: M +$eM | D -$eD | P +$eP" -ForegroundColor Cyan
Write-Host "  Actual  : M $([double]$bM.balance)->$([double]$aM.balance) | D $([double]$bD.balance)->$([double]$aD.balance) | P $([double]$bP.balance)->$([double]$aP.balance)" -ForegroundColor Green

Write-Host "`n---- TEST 2: ONLINE (CARD) ----" -ForegroundColor Magenta
$bM2 = GetWallet $merchantId "MERCHANT"
$bD2 = GetWallet $driverId "DRIVER"
$bP2 = GetWallet "PLATFORM_DEFAULT" "PLATFORM"

$orderBody2 = @{
    consumerId = $consumer.userId; merchantId = $merchantId; orderType = "DELIVERY"; paymentMethod = "CREDIT_CARD"
    items = @(@{ menuItemId = $item.id; name = $item.name; quantity = 2; unitPrice = $item.price; specialInstructions = "" })
    deliveryAddress = "123 Le Loi, Q1, HCMC"; deliveryLatitude = 10.775; deliveryLongitude = 106.7
    deliveryFee = $shipFee; serviceFee = 2000; discount = 0
} | ConvertTo-Json -Depth 5

$order2 = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $orderBody2 -Headers $oh
$oid2 = $order2.id.Substring(0,8)
Write-Host "[PASS] Order #$oid2 method=$($order2.paymentMethod)" -ForegroundColor Green

Invoke-RestMethod -Uri "$orderUrl/orders/$($order2.id)/confirm" -Method Patch -Headers $mh2 | Out-Null
Invoke-RestMethod -Uri "$orderUrl/orders/$($order2.id)/preparing" -Method Patch -Headers $mh2 | Out-Null
Invoke-RestMethod -Uri "$orderUrl/orders/$($order2.id)/ready" -Method Patch -Headers $mh2 | Out-Null
Invoke-RestMethod -Uri "$orderUrl/orders/$($order2.id)/out-for-delivery" -Method Patch -Body (@{ driverId = $driverId } | ConvertTo-Json) -Headers $dh2 | Out-Null
Invoke-RestMethod -Uri "$orderUrl/orders/$($order2.id)/delivered" -Method Patch -Headers $dh2 | Out-Null
Write-Host "[PASS] Order #$oid2 DELIVERED" -ForegroundColor Green
Start-Sleep -Seconds 2

$aM2 = GetWallet $merchantId "MERCHANT"
$aD2 = GetWallet $driverId "DRIVER"
$aP2 = GetWallet "PLATFORM_DEFAULT" "PLATFORM"

$eD2 = [Math]::Round($shipFee * 0.80)

Write-Host "`n[ONLINE RESULT]" -ForegroundColor Yellow
Write-Host "  Expected: M +$eM | D +$eD2 | P +$eP" -ForegroundColor Cyan
Write-Host "  Actual  : M $([double]$bM2.balance)->$([double]$aM2.balance) | D $([double]$bD2.balance)->$([double]$aD2.balance) | P $([double]$bP2.balance)->$([double]$aP2.balance)" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  TEST COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

