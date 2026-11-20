$ErrorActionPreference = 'Continue'
Set-Location 'd:\MyThFood\mythfood'

$wallet     = "http://localhost:3009/api/v1"
$serviceKey = "3c1b7f539b204af7af26f378d67e9eb1"
$jwtSecret  = "453a464b027340b982703bab1b281dce7c30cdfcdbf148a69695443d4859f68d"

# 1. Sinh admin JWT
$token = node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:'e2e-admin', phoneNumber:'admin', roles:['ADMIN']}, '$jwtSecret', {expiresIn:'1h'}))"
$token = ($token | Out-String).Trim()
Write-Host ("Admin JWT: " + $token.Substring(0, 35) + "...")

$authHeaders = @{ Authorization = "Bearer $token" }
$svcHeaders  = @{ "x-service-key" = $serviceKey }

$driverId   = "e2e-driver-0001"
$merchantId = "e2e-merchant-0001"

function Show($label, $obj) { Write-Host ("== {0} ==`n{1}" -f $label, ($obj | ConvertTo-Json -Depth 8 -Compress)) }

# 2. Topup driver 200k de COD debit 103k pass
try {
  $topup = Invoke-RestMethod "$wallet/wallets/topup" -Method Post -Headers $authHeaders -ContentType "application/json" -Body (@{ownerId=$driverId; ownerType="DRIVER"; amount=200000} | ConvertTo-Json)
  Show "2. Topup driver 200k" $topup
} catch { Show "2. Topup ERROR" $_.Exception.Message }

# 3. Accrue COD order
try {
  $codBody = @{ merchantId=$merchantId; driverId=$driverId; orderId="e2e-order-cod-0001"; foodTotal=100000; shippingFee=15000; serviceFee=0; discount=0; discountFundedBy="MERCHANT"; paymentMethod="COD"; deliveredAt=(Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json
  $a1 = Invoke-RestMethod "$wallet/wallets/settlement/accrue" -Method Post -Headers $svcHeaders -ContentType "application/json" -Body $codBody
  Show "3. Accrue COD" $a1
} catch { Show "3. Accrue COD ERROR" $_.Exception.Message }

# 4. Accrue Online order
try {
  $onBody = @{ merchantId=$merchantId; driverId=$driverId; orderId="e2e-order-online-0002"; foodTotal=200000; shippingFee=20000; serviceFee=0; discount=0; discountFundedBy="MERCHANT"; paymentMethod="CREDIT_CARD"; deliveredAt=(Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json
  $a2 = Invoke-RestMethod "$wallet/wallets/settlement/accrue" -Method Post -Headers $svcHeaders -ContentType "application/json" -Body $onBody
  Show "4. Accrue Online" $a2
} catch { Show "4. Accrue Online ERROR" $_.Exception.Message }

# 5. Pending merchant
try {
  $p = Invoke-RestMethod "$wallet/wallets/settlement/pending?ownerId=$merchantId&ownerType=MERCHANT" -Method Get -Headers $authHeaders
  Show "5. Merchant pending" $p
} catch { Show "5. Pending ERROR" $_.Exception.Message }

# 6. DRY-RUN settlement
try {
  $d = Invoke-RestMethod "$wallet/wallets/settlement/batches/run" -Method Post -Headers $authHeaders -ContentType "application/json" -Body (@{dryRun=$true} | ConvertTo-Json)
  Show "6. DRY-RUN" $d
} catch { Show "6. DRY-RUN ERROR" $_.Exception.Message }

# 7. RUN settlement (real)
try {
  $r = Invoke-RestMethod "$wallet/wallets/settlement/batches/run" -Method Post -Headers $authHeaders -ContentType "application/json" -Body (@{} | ConvertTo-Json)
  Show "7. RUN (real)" $r
} catch { Show "7. RUN ERROR" $_.Exception.Message }

# 8. Balances
try {
  $mw = Invoke-RestMethod "$wallet/wallets?ownerId=$merchantId&ownerType=MERCHANT" -Method Get -Headers $authHeaders
  $dw = Invoke-RestMethod "$wallet/wallets?ownerId=$driverId&ownerType=DRIVER" -Method Get -Headers $authHeaders
  Write-Host ("== 8. Balances ==")
  Write-Host ("Merchant balance = " + $mw.balance + "  (ky vong 225000)")
  Write-Host ("Driver   balance = " + $dw.balance + "  (ky vong 113000 = 200000-103000+16000)")
} catch { Show "8. Balances ERROR" $_.Exception.Message }

# 9. Batches list
try {
  $b = Invoke-RestMethod "$wallet/wallets/settlement/batches" -Method Get -Headers $authHeaders
  Show "9. Batches" $b
} catch { Show "9. Batches ERROR" $_.Exception.Message }
