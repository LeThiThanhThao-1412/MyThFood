# ============================================================================
# Fix legacy dispatches whose delivery option is out of sync.
#
# Before the fix, order-service called POST /dispatches with `priorityRank`
# but CreateDispatchDto did not declare it -> ValidationPipe returned 400 ->
# READY orders had no dispatch. When the driver tapped Accept, driver-app
# created a fallback dispatch without `deliveryOption` -> the dispatch became
# FAST (maxStackedOrders = 1) even though the order was SAVER, so SAVER
# stacking never worked.
#
# This script reads orders from the order-service DB and re-syncs
# deliveryOption / priorityRank / maxStackedOrders for active dispatches.
# Run once after deploying the fix.
#
#   cd d:\MyThFood\mythfood
#   .\scripts\fix-dispatches-delivery-option.ps1
# ============================================================================

param(
    [string]$Container = "mythfood-postgres",
    [string]$DbUser = "mythfood",
    [string]$OrderDb = "mythfood_order",
    [string]$DispatchDb = "mythfood_dispatch"
)

$ErrorActionPreference = "Stop"

$generatorSql = @'
SELECT format(
  'UPDATE dispatches SET "deliveryOption" = %L, "priorityRank" = %s, "maxStackedOrders" = %s WHERE "orderId" = %L AND status IN (''MATCHING'', ''DRIVER_ASSIGNED'', ''DRIVER_ACCEPTED'', ''DRIVER_ARRIVED'', ''PICKED_UP'', ''DELIVERING'');',
  o.delivery_option,
  CASE o.delivery_option WHEN 'SAVER' THEN 0 WHEN 'PRIORITY' THEN 2 ELSE 1 END,
  CASE o.delivery_option WHEN 'SAVER' THEN 3 ELSE 1 END,
  o.id
)
FROM orders o
WHERE o.delivery_option IS NOT NULL
  AND o.deleted_at IS NULL;
'@

$generatorFile = Join-Path $env:TEMP "mythfood-gen-fix-dispatches.sql"
$updatesFile = Join-Path $env:TEMP "mythfood-fix-dispatches.sql"

# ASCII output avoids the BOM that Windows PowerShell 5.1 adds with -Encoding UTF8.
Set-Content -Path $generatorFile -Value $generatorSql -Encoding ASCII

Write-Host "[1/3] Generating UPDATE statements from $OrderDb ..."
docker cp $generatorFile "${Container}:/tmp/mythfood-gen-fix-dispatches.sql" | Out-Null
$updates = docker exec $Container psql -U $DbUser -d $OrderDb -t -A -f /tmp/mythfood-gen-fix-dispatches.sql
$updates = @($updates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

if ($updates.Count -eq 0) {
    Write-Host "No orders found to sync."
    exit 0
}

Write-Host "[2/3] Found $($updates.Count) order(s), syncing to $DispatchDb ..."
Set-Content -Path $updatesFile -Value ($updates -join "`n") -Encoding ASCII
docker cp $updatesFile "${Container}:/tmp/mythfood-fix-dispatches.sql" | Out-Null

Write-Host "[3/3] Applying updates ..."
docker exec $Container psql -U $DbUser -d $DispatchDb -f /tmp/mythfood-fix-dispatches.sql

Write-Host "Done. Verify with:"
Write-Host "  docker exec $Container psql -U $DbUser -d $DispatchDb -c 'SELECT \"orderId\", \"deliveryOption\", \"maxStackedOrders\", status FROM dispatches ORDER BY \"createdAt\" DESC LIMIT 10;'"
