$ErrorActionPreference = 'Continue'
Set-Location 'd:\MyThFood\mythfood'

$walletUrl = "http://localhost:3009/api/v1"
$jwtSecret = "453a464b027340b982703bab1b281dce7c30cdfcdbf148a69695443d4859f68d"
$token = (node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:'e2e-admin', phoneNumber:'admin', roles:['ADMIN']}, '$jwtSecret', {expiresIn:'1h'}))" | Out-String).Trim()
$authHeaders = @{ Authorization = "Bearer $token" }

$merchantId = "bbbbbbbb-2222-4333-8444-555555555555"
$driverId   = "cccccccc-3333-4333-8444-555555555555"

function Show($label, $obj) { Write-Host ("== {0} ==`n{1}" -f $label, ($obj | ConvertTo-Json -Depth 8 -Compress)) }

# A. Merchant pending (qua endpoint JWT, tranh quoting psql)
try {
  $p = Invoke-RestMethod "$walletUrl/wallets/settlement/pending?ownerId=$merchantId&ownerType=MERCHANT" -Method Get -Headers $authHeaders
  Show "A. Merchant pending (ky vong 75000)" $p
} catch { Show "A. ERROR" $_.Exception.Message }

# B. Reset batch (xoa batch SUCCESS de settle lai window hien tai)
docker exec mythfood-postgres psql -U mythfood -d mythfood_wallet -c "DELETE FROM settlement_batches;" 2>&1
Write-Host "B. Da xoa settlement_batches"

# C. Re-run settlement -> settle entry PENDING con lai
try {
  $r = Invoke-RestMethod "$walletUrl/wallets/settlement/batches/run" -Method Post -Headers $authHeaders -ContentType "application/json" -Body (@{} | ConvertTo-Json)
  Show "C. Settle lai" $r
} catch { Show "C. ERROR" $_.Exception.Message }

# D. Balances
try {
  $mw = Invoke-RestMethod "$walletUrl/wallets?ownerId=$merchantId&ownerType=MERCHANT" -Method Get -Headers $authHeaders
  $dw = Invoke-RestMethod "$walletUrl/wallets?ownerId=$driverId&ownerType=DRIVER" -Method Get -Headers $authHeaders
  $pw = Invoke-RestMethod "$walletUrl/wallets?ownerId=PLATFORM_DEFAULT&ownerType=PLATFORM" -Method Get -Headers $authHeaders
  Write-Host ("== D. Balances ==")
  Write-Host ("Merchant = " + $mw.balance + "  (ky vong 75000)")
  Write-Host ("Driver   = " + $dw.balance + "  (ky vong 97000)")
  Write-Host ("Platform = " + $pw.balance + "  (ky vong 28000 + phan cu)")
} catch { Show "D. ERROR" $_.Exception.Message }
