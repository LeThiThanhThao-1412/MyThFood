$ErrorActionPreference = 'Continue'
Set-Location 'd:\MyThFood\mythfood'

$orderUrl  = "http://localhost:3004/api/v1"
$walletUrl = "http://localhost:3009/api/v1"
$jwtSecret = "453a464b027340b982703bab1b281dce7c30cdfcdbf148a69695443d4859f68d"

$token = (node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:'e2e-admin', phoneNumber:'admin', roles:['ADMIN']}, '$jwtSecret', {expiresIn:'1h'}))" | Out-String).Trim()
$authHeaders = @{ Authorization = "Bearer $token" }

$orderId    = "11111111-2222-4333-8444-555555555555"
$consumerId = "aaaaaaaa-1111-4222-8333-444444444444"
$merchantId = "bbbbbbbb-2222-4333-8444-555555555555"
$driverId   = "cccccccc-3333-4333-8444-555555555555"

function Show($label, $obj) { Write-Host ("== {0} ==`n{1}" -f $label, ($obj | ConvertTo-Json -Depth 8 -Compress)) }

# 1. Top up driver wallet 200k
try {
  $topup = Invoke-RestMethod "$walletUrl/wallets/topup" -Method Post -Headers $authHeaders -ContentType "application/json" -Body (@{ownerId=$driverId; ownerType="DRIVER"; amount=200000} | ConvertTo-Json)
  Show "1. Topup driver" $topup
} catch { Show "1. ERROR" $_.Exception.Message }

# 2. Insert order OUT_FOR_DELIVERY (COD)
$sql = "INSERT INTO orders (id, consumer_id, merchant_id, order_type, status, subtotal, delivery_fee, service_fee, discount, discount_funded_by, total_amount, payment_method, driver_id, created_at, updated_at) VALUES ('$orderId','$consumerId','$merchantId','DELIVERY','OUT_FOR_DELIVERY',100000,15000,0,0,'MERCHANT',115000,'COD','$driverId',now(),now());"
docker exec mythfood-postgres psql -U mythfood -d mythfood_order -c "$sql" 2>&1
Write-Host "2. Inserted order (id=$orderId, status=OUT_FOR_DELIVERY, COD)"

# 3. PATCH delivered -> order-service goi wallet accrue
try {
  $d = Invoke-RestMethod "$orderUrl/orders/$orderId/delivered" -Method Patch -Headers $authHeaders
  Show "3. PATCH delivered (order status)" ($d | Select-Object id, status, paymentMethod -ErrorAction SilentlyContinue)
} catch { Show "3. ERROR" $_.Exception.Message }

Start-Sleep -Seconds 1

# 4. Check settlement_entries in DB
Write-Host "== 4. settlement_entries (order $orderId) =="
docker exec mythfood-postgres psql -U mythfood -d mythfood_wallet -c "SELECT \"orderId\", \"ownerType\", kind, amount, status FROM settlement_entries WHERE \"orderId\" = '$orderId';" 2>&1

# 5. Driver balance (ky vong 97000)
try {
  $dw = Invoke-RestMethod "$walletUrl/wallets?ownerId=$driverId&ownerType=DRIVER" -Method Get -Headers $authHeaders
  Show "5. Driver balance (ky vong 97000)" $dw.balance
} catch { Show "5. ERROR" $_.Exception.Message }

# 6. Run settlement
try {
  $r = Invoke-RestMethod "$walletUrl/wallets/settlement/batches/run" -Method Post -Headers $authHeaders -ContentType "application/json" -Body (@{} | ConvertTo-Json)
  Show "6. Settle" $r
} catch { Show "6. ERROR" $_.Exception.Message }

# 7. Merchant balance (ky vong 75000)
try {
  $mw = Invoke-RestMethod "$walletUrl/wallets?ownerId=$merchantId&ownerType=MERCHANT" -Method Get -Headers $authHeaders
  Show "7. Merchant balance (ky vong 75000)" $mw.balance
} catch { Show "7. ERROR" $_.Exception.Message }

# 8. Order final status in DB
Write-Host "== 8. Order final status =="
docker exec mythfood-postgres psql -U mythfood -d mythfood_order -c "SELECT id, status, payment_method, subtotal, delivery_fee FROM orders WHERE id = '$orderId';" 2>&1
