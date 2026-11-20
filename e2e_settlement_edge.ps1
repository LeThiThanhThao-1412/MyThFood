$ErrorActionPreference = 'Continue'
Set-Location 'd:\MyThFood\mythfood'

$wallet     = "http://localhost:3009/api/v1"
$serviceKey = "3c1b7f539b204af7af26f378d67e9eb1"
$jwtSecret  = "453a464b027340b982703bab1b281dce7c30cdfcdbf148a69695443d4859f68d"

$token = (node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:'e2e-admin', phoneNumber:'admin', roles:['ADMIN']}, '$jwtSecret', {expiresIn:'1h'}))" | Out-String).Trim()
$authHeaders = @{ Authorization = "Bearer $token" }
$svcHeaders  = @{ "x-service-key" = $serviceKey }

$merchantId = "e2e-merchant-0001"
$driverId   = "e2e-driver-0001"

function Show($label, $obj) { Write-Host ("== {0} ==`n{1}" -f $label, ($obj | ConvertTo-Json -Depth 8 -Compress)) }

# A. Idempotency: accrue lai cung order COD
try {
  $codBody = @{ merchantId=$merchantId; driverId=$driverId; orderId="e2e-order-cod-0001"; foodTotal=100000; shippingFee=15000; serviceFee=0; discount=0; discountFundedBy="MERCHANT"; paymentMethod="COD"; deliveredAt=(Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json
  $a = Invoke-RestMethod "$wallet/wallets/settlement/accrue" -Method Post -Headers $svcHeaders -ContentType "application/json" -Body $codBody
  Show "A. Accrue lai (idempotent, ky vong entries=2)" $a
} catch { Show "A. ERROR" $_.Exception.Message }

# B. Re-run settlement cung cua so -> ALREADY_SETTLED
try {
  $r = Invoke-RestMethod "$wallet/wallets/settlement/batches/run" -Method Post -Headers $authHeaders -ContentType "application/json" -Body (@{} | ConvertTo-Json)
  Show "B. Re-run (ky vong ALREADY_SETTLED)" $r
} catch { Show "B. ERROR" $_.Exception.Message }

# C. Chong am vi: driver 0 dong accrue COD -> phai loi
try {
  $poor = "e2e-driver-poor"
  $codBody = @{ merchantId=$merchantId; driverId=$poor; orderId="e2e-order-poor-0003"; foodTotal=50000; shippingFee=0; serviceFee=0; discount=0; discountFundedBy="MERCHANT"; paymentMethod="COD"; deliveredAt=(Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json
  Invoke-RestMethod "$wallet/wallets/settlement/accrue" -Method Post -Headers $svcHeaders -ContentType "application/json" -Body $codBody | Out-Null
  Show "C. COD driver 0d (KHONG duoc pass!)" "UNEXPECTED SUCCESS"
} catch {
  Show "C. COD driver 0d -> loi (dung, chan am)" $_.Exception.Message
}

# D. Clawback auto-deduct
try {
  $cb = Invoke-RestMethod "$wallet/wallets/settlement/clawback" -Method Post -Headers $svcHeaders -ContentType "application/json" -Body (@{ownerId=$merchantId; ownerType="MERCHANT"; sourceOrderId="e2e-order-online-0002"; amount=50000} | ConvertTo-Json)
  Show "D1. Tao clawback 50k cho merchant" $cb
} catch { Show "D1. ERROR" $_.Exception.Message }

# Accrue don moi cua merchant trong cua so ke tiep
$nextStart = "2026-09-19T16:00:00.000Z"
$nextEnd   = "2026-09-20T16:00:00.000Z"
try {
  $onBody = @{ merchantId=$merchantId; driverId=$driverId; orderId="e2e-order-online-0004"; foodTotal=100000; shippingFee=0; serviceFee=0; discount=0; discountFundedBy="MERCHANT"; paymentMethod="CREDIT_CARD"; deliveredAt="2026-09-19T20:00:00.000Z" } | ConvertTo-Json
  $a2 = Invoke-RestMethod "$wallet/wallets/settlement/accrue" -Method Post -Headers $svcHeaders -ContentType "application/json" -Body $onBody
  Show "D2. Accrue don moi (merchant gross 75000)" $a2
} catch { Show "D2. ERROR" $_.Exception.Message }

# Run settlement cua so ke tiep (explicit period)
try {
  $r = Invoke-RestMethod "$wallet/wallets/settlement/batches/run" -Method Post -Headers $authHeaders -ContentType "application/json" -Body (@{periodStart=$nextStart; periodEnd=$nextEnd} | ConvertTo-Json)
  Show "D3. Settle cua so ke tiep (ky vong merchant net=25000, clawback=50000)" $r
} catch { Show "D3. ERROR" $_.Exception.Message }

# Clawback remaining sau khi tru
try {
  $oc = Invoke-RestMethod "$wallet/wallets/settlement/clawback?ownerId=$merchantId&ownerType=MERCHANT" -Method Get -Headers $authHeaders
  Show "D4. Clawback cua merchant sau settle (ky vong totalOpen=0)" $oc
} catch { Show "D4. ERROR" $_.Exception.Message }
