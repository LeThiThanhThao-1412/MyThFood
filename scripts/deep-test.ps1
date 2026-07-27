$ErrorActionPreference = "Continue"

function Test-Endpoint {
    param($Name, $Method, $Url, $Headers, $Body)
    try {
        if ($Method -eq 'GET') { $r = Invoke-RestMethod -Uri $Url -Method Get -Headers $Headers -TimeoutSec 5 }
        elseif ($Method -eq 'POST') { $r = Invoke-RestMethod -Uri $Url -Method Post -Body $Body -Headers $Headers -ContentType 'application/json' -TimeoutSec 5 }
        elseif ($Method -eq 'PATCH') { $r = Invoke-RestMethod -Uri $Url -Method Patch -Body $Body -Headers $Headers -ContentType 'application/json' -TimeoutSec 5 }
        return @{Pass=$true;Name=$Name;Data=$r}
    } catch {
        $msg = $_.Exception.Message.Substring(0, [Math]::Min(120, $_.Exception.Message.Length))
        return @{Pass=$false;Name=$Name;Error=$msg}
    }
}

$idUrl='http://localhost:3001/api/v1'
$consumerUrl='http://localhost:3002/api/v1'
$merchantUrl='http://localhost:3003/api/v1'
$orderUrl='http://localhost:3004/api/v1'
$invUrl='http://localhost:3005/api/v1'
$payUrl='http://localhost:3006/api/v1'
$driverUrl='http://localhost:3007/api/v1'
$dispUrl='http://localhost:3008/api/v1'

Write-Host '====== AUTH: Login as all roles ======'
$body = @{phoneNumber='+84901234567';password='MySecurePass123'} | ConvertTo-Json
$c = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $body -ContentType "application/json"
$ct = $c.data.accessToken; $cuid = $c.data.user.id
$ctH = @{Authorization="Bearer $ct"}

$body = @{phoneNumber='+84907654321';password='Driver123'} | ConvertTo-Json
$d = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $body -ContentType "application/json"
$dt = $d.data.accessToken; $duid = $d.data.user.id
$dtH = @{Authorization="Bearer $dt"}

$body = @{phoneNumber='+84901112233';password='Admin123'} | ConvertTo-Json
$a = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $body -ContentType "application/json"
$at = $a.data.accessToken; $auid = $a.data.user.id
$atH = @{Authorization="Bearer $at"}

$results = @()

Write-Host ''
Write-Host '========================================'
Write-Host '  1. IDENTITY SERVICE (3001)'
Write-Host '========================================'
$t = Test-Endpoint 'GET /users/me (consumer)' 'GET' "$idUrl/users/me" $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
$t = Test-Endpoint 'GET /users/me (driver)' 'GET' "$idUrl/users/me" $dtH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
$t = Test-Endpoint 'GET /users/me (admin)' 'GET' "$idUrl/users/me" $atH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
$badBody = @{phoneNumber='+84901234567';password='WrongPass'} | ConvertTo-Json
$t = Test-Endpoint 'POST /auth/login (wrong pw)' 'POST' "$idUrl/auth/login" $null $badBody; $results += @{Pass=(-not $t.Pass);Name='Wrong password rejected (401)'}; Write-Host ("[{0}] {1}" -f $(if(-not $t.Pass){'PASS'}else{'FAIL'}), 'Wrong password rejected')
$t = Test-Endpoint 'GET /users/me (no auth)' 'GET' "$idUrl/users/me" $null $null; $results += @{Pass=(-not $t.Pass);Name='Missing auth rejected (401)'}; Write-Host ("[{0}] {1}" -f $(if(-not $t.Pass){'PASS'}else{'FAIL'}), 'Missing auth rejected')
# Test register with duplicate
$regBody = @{phoneNumber='+84901234567';password='Test123';fullName='Dup'} | ConvertTo-Json
$t = Test-Endpoint 'POST /auth/register (duplicate)' 'POST' "$idUrl/auth/register" $null $regBody; $results += @{Pass=(-not $t.Pass);Name='Duplicate register rejected'}; Write-Host ("[{0}] {1}" -f $(if(-not $t.Pass){'PASS'}else{'FAIL'}), 'Duplicate register rejected')

Write-Host ''
Write-Host '========================================'
Write-Host '  2. CONSUMER SERVICE (3002)'
Write-Host '========================================'
$t = Test-Endpoint 'GET /consumers/user/:id' 'GET' ("$consumerUrl/consumers/user/$cuid") $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
if ($t.Pass -and $t.Data.data) { $cname = $t.Data.data.fullName; Write-Host "       Name: $cname" }
$t = Test-Endpoint 'GET /consumers/addresses' 'GET' "$consumerUrl/consumers/addresses" $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
$t = Test-Endpoint 'GET /consumers/me' 'GET' "$consumerUrl/consumers/me" $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
# Add address
$addrBody = @{label='Home';address='123 Le Loi, District 1, HCMC';latitude=10.762622;longitude=106.660172;isDefault=$true} | ConvertTo-Json
$t = Test-Endpoint 'POST /consumers/addresses' 'POST' "$consumerUrl/consumers/addresses" $ctH $addrBody; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)

Write-Host ''
Write-Host '========================================'
Write-Host '  3. MERCHANT SERVICE (3003)'
Write-Host '========================================'
$t = Test-Endpoint 'GET /merchants?take=10' 'GET' "$merchantUrl/merchants?take=10" $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
if($t.Pass -and $t.Data.items -and $t.Data.items.Count -gt 0) { $m = $t.Data.items[0]; $mid = $m.id }
$t = Test-Endpoint 'GET /merchants?status=APPROVED' 'GET' "$merchantUrl/merchants?status=APPROVED" $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
$t = Test-Endpoint 'GET /merchants/:id (detail)' 'GET' ("$merchantUrl/merchants/$mid") $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
$t = Test-Endpoint 'GET /merchants/:id/menu' 'GET' ("$merchantUrl/merchants/$mid/menu") $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
if($t.Pass) { $menu = $t.Data; if($menu -is [array]) { $mi = $menu[0] } else { $mi = $menu } }
if($mi) { Write-Host "       Menu item: $($mi.name) - $($mi.price) VND" }
# Add menu item
$menuBody = @{name='Banh Mi Thit (Test)';price=25000;category='MAIN_COURSE';description='Banh mi test deep api'} | ConvertTo-Json
$mh = @{Authorization="Bearer $ct";"Content-Type"="application/json"}
$t = Test-Endpoint 'POST /merchants/:id/menu/items' 'POST' ("$merchantUrl/merchants/$mid/menu/items") $mh $menuBody; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)

Write-Host ''
Write-Host '========================================'
Write-Host '  4. ORDER SERVICE (3004)'
Write-Host '========================================'
if($mi) {
    $oh = @{Authorization="Bearer $ct";"Content-Type"="application/json"}
    $ob = @{
        consumerId=$cuid; merchantId=$mid; orderType='DELIVERY'
        items=@(@{menuItemId=$mi.id;name=$mi.name;quantity=2;unitPrice=$mi.price;specialInstructions='Deep test'})
        deliveryAddress='456 Nguyen Hue, D1, HCMC'; deliveryFee=15000; serviceFee=5000; discount=0
    } | ConvertTo-Json -Depth 5
    $t = Test-Endpoint 'POST /orders' 'POST' "$orderUrl/orders" $oh $ob; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
    if($t.Pass) { $oid = $t.Data.id; $oamt = $t.Data.totalAmount; Write-Host "       Order ID: $($oid.Substring(0,8)) | Total: $oamt VND" }
    $t = Test-Endpoint 'GET /orders?consumerId=' 'GET' ("$orderUrl/orders?consumerId=$cuid") $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
    $t = Test-Endpoint 'GET /orders/:id' 'GET' ("$orderUrl/orders/$oid") $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
    # Lifecycle
    $steps = @('confirm','preparing','ready')
    foreach($s in $steps) {
        $t = Test-Endpoint "PATCH /orders/:id/$s" 'PATCH' ("$orderUrl/orders/$oid/$s") $oh $null; $results += $t
        $statusText = if($t.Pass){$t.Data.status}else{'FAILED'}
        Write-Host ("[{0}] {1} -> {2}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name, $statusText)
    }
}
# Shipping estimate
$t = Test-Endpoint 'GET /shipping/estimate' 'GET' "$orderUrl/shipping/estimate" $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)

Write-Host ''
Write-Host '========================================'
Write-Host '  5. INVENTORY SERVICE (3005)'
Write-Host '========================================'
$t = Test-Endpoint 'GET / (inventory root)' 'GET' $invUrl $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
if($mid) {
    $t = Test-Endpoint 'GET /inventory/merchant/:id' 'GET' ("$invUrl/inventory/merchant/$mid") $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
}

Write-Host ''
Write-Host '========================================'
Write-Host '  6. PAYMENT SERVICE (3006)'
Write-Host '========================================'
if($oid) {
    $ph = @{Authorization="Bearer $ct";"Content-Type"="application/json"}
    $pb = @{orderId=$oid;consumerId=$cuid;merchantId=$mid;amount=$oamt;paymentMethod='CASH'} | ConvertTo-Json
    $t = Test-Endpoint 'POST /payments' 'POST' "$payUrl/payments" $ph $pb; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
    if($t.Pass) { $pid = $t.Data.id; Write-Host "       Payment: $($t.Data.status) | $($t.Data.amount) VND" }
    $t = Test-Endpoint 'GET /payments/:id' 'GET' ("$payUrl/payments/$pid") $ph $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
    $cb = @{transactionId='DEEP-SETTLE'} | ConvertTo-Json
    $t = Test-Endpoint 'PATCH /payments/:id/complete' 'PATCH' ("$payUrl/payments/$pid/complete") $ph $cb; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
}
# Wallet endpoints
$t = Test-Endpoint 'GET /wallets/merchant/:id' 'GET' ("$payUrl/wallets/merchant/$mid") $ctH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
if($t.Pass -and $t.Data) { Write-Host "       Balance: $($t.Data.balance) VND" }

Write-Host ''
Write-Host '========================================'
Write-Host '  7. DRIVER SERVICE (3007)'
Write-Host '========================================'
$t = Test-Endpoint 'GET /drivers/user/:userId' 'GET' ("$driverUrl/drivers/user/$duid") $dtH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
$ddid = $null
if($t.Pass) {
    if($t.Data.data) { $dd = $t.Data.data } else { $dd = $t.Data }
    $ddid = $dd.id
    Write-Host "       Driver: $($dd.fullName) | Status: $($dd.status) | Online: $($dd.onlineStatus)"
}
if($ddid) {
    $t = Test-Endpoint 'PATCH /drivers/:id/go-offline' 'PATCH' ("$driverUrl/drivers/$ddid/go-offline") $dtH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
    $t = Test-Endpoint 'PATCH /drivers/:id/go-online' 'PATCH' ("$driverUrl/drivers/$ddid/go-online") $dtH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
    # Available list
    $t = Test-Endpoint 'GET /drivers/available' 'GET' "$driverUrl/drivers/available" $dtH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
}
# Delivery - assign driver to order and mark delivered
if($oid -and $ddid) {
    $dh = @{Authorization="Bearer $dt";"Content-Type"="application/json"}
    $assignBody = @{driverId=$ddid} | ConvertTo-Json
    $t = Test-Endpoint 'PATCH /orders/:id/out-for-delivery' 'PATCH' ("$orderUrl/orders/$oid/out-for-delivery") $dh $assignBody; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
    $t = Test-Endpoint 'PATCH /orders/:id/delivered' 'PATCH' ("$orderUrl/orders/$oid/delivered") $dh $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)
}

Write-Host ''
Write-Host '========================================'
Write-Host '  8. DISPATCH SERVICE (3008)'
Write-Host '========================================'
$t = Test-Endpoint 'GET / (dispatch root)' 'GET' $dispUrl $null $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)

Write-Host ''
Write-Host '========================================'
Write-Host '  9. EDGE CASES & SECURITY'
Write-Host '========================================'
$t = Test-Endpoint 'GET nonexistent order' 'GET' "$orderUrl/orders/nonexist123" $ctH $null; $results += @{Pass=(-not $t.Pass);Name='404 on nonexistent order'}; Write-Host ("[{0}] {1}" -f $(if(-not $t.Pass){'PASS'}else{'FAIL'}), '404 on nonexistent order')
$t = Test-Endpoint 'GET orders (no auth)' 'GET' "$orderUrl/orders" $null $null; $results += @{Pass=(-not $t.Pass);Name='401 on missing auth'}; Write-Host ("[{0}] {1}" -f $(if(-not $t.Pass){'PASS'}else{'FAIL'}), '401 on missing auth')
$t = Test-Endpoint 'GET orders (driver token on consumer endpoint - cross role)' 'GET' "$orderUrl/orders?consumerId=$cuid" $dtH $null; $results += $t; Write-Host ("[{0}] {1}" -f $(if($t.Pass){'PASS'}else{'FAIL'}), $t.Name)

Write-Host ''
Write-Host '========================================'
Write-Host '  SUMMARY'
Write-Host '========================================'
$passCount = ($results | Where-Object { $_.Pass }).Count
$failCount = ($results | Where-Object { -not $_.Pass }).Count
$total = $passCount + $failCount
Write-Host ("TOTAL: $passCount/$total PASSED" -f $(if($failCount -eq 0){'Green'}else{'Yellow'}))

if ($failCount -gt 0) {
    Write-Host ''
    Write-Host 'FAILED TESTS:' -ForegroundColor Red
    $results | Where-Object { -not $_.Pass } | ForEach-Object {
        Write-Host ("  - {0}: {1}" -f $_.Name, $_.Error) -ForegroundColor Red
    }
}