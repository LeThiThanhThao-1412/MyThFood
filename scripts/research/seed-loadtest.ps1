# =============================================================================
# NẠP BỘ DỮ LIỆU HẠT GIỐNG CHO THỰC NGHIỆM (giao thức §2.3)
#
# Vì sao cần: trạng thái mặc định của stack chỉ có 2 khách hàng, 5 quán, 10 món,
# 0 dòng tồn kho và 1 tài xế — không đủ cho W1–W4 (cần 100 khách, 50 quán,
# 500 món, tồn kho >= 5 000/món, 20 tài xế). Script này nạp bộ dữ liệu đó bằng
# SQL tất định (UUID cố định, idempotent), rồi xuất `k6/data/*.json` cho k6.
#
# Cách dùng (từ thư mục mythfood):
#   .\scripts\research\seed-loadtest.ps1
#   .\scripts\research\seed-loadtest.ps1 -SkipExport      # chỉ nạp SQL
# =============================================================================
[CmdletBinding()]
param(
    [string]$PostgresContainer = 'mythfood-postgres',
    [string]$PostgresUser = 'mythfood',
    [switch]$SkipExport
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sqlDir = Join-Path $PSScriptRoot 'sql'
$k6DataDir = Join-Path $repoRoot 'k6\data'

function Invoke-PsqlFile {
    param([string]$Database, [string]$SqlFile)

    $name = Split-Path -Leaf $SqlFile
    $remote = "/tmp/seed/$name"
    docker exec $PostgresContainer mkdir -p /tmp/seed | Out-Null
    docker cp $SqlFile "${PostgresContainer}:$remote" | Out-Null
    $out = docker exec $PostgresContainer psql -U $PostgresUser -d $Database -v ON_ERROR_STOP=1 -q -f $remote 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Nạp thất bại ($Database <- $name):`n$($out -join "`n")"
    }
    Write-Host ("  ok  {0,-16} <- {1}" -f $Database, $name) -ForegroundColor DarkGray
}

function Invoke-Scalar {
    param([string]$Database, [string]$Query)
    $value = (docker exec $PostgresContainer psql -U $PostgresUser -d $Database -tA -c $Query | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Truy vấn thất bại ($Database): $Query" }
    return $value
}

function Export-Json {
    param([string]$Database, [string]$SqlFile, [string]$TargetPath)

    $remote = "/tmp/seed/$(Split-Path -Leaf $SqlFile)"
    docker cp $SqlFile "${PostgresContainer}:$remote" | Out-Null
    $lines = docker exec $PostgresContainer psql -U $PostgresUser -d $Database -tA -v ON_ERROR_STOP=1 -f $remote
    if ($LASTEXITCODE -ne 0) { throw "Xuất JSON thất bại: $(Split-Path -Leaf $SqlFile)" }

    $json = ($lines | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($json)) { throw "Xuất JSON rỗng: $(Split-Path -Leaf $SqlFile)" }
    $null = ConvertFrom-Json -InputObject $json   # kiểm tra cú pháp trước khi ghi

    # UTF-8 KHÔNG BOM: `Set-Content -Encoding utf8` của PowerShell 5.1 ghi BOM
    # và k6 sẽ chết ở JSON.parse.
    [System.IO.File]::WriteAllText($TargetPath, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
    $parsed = ConvertFrom-Json -InputObject $json
    $count = if ($parsed -is [System.Array]) { $parsed.Length } else { 1 }
    Write-Host ("  ok  {0} ({1} ban ghi)" -f (Split-Path -Leaf $TargetPath), $count) -ForegroundColor DarkGray
}

Write-Host '== Nap du lieu hat giong cho thuc nghiem ==' -ForegroundColor Cyan

$plan = @(
    @{ Db = 'mythfood_identity';  File = 'seed-identity.sql'  },
    @{ Db = 'mythfood_consumer';  File = 'seed-consumer.sql'  },
    @{ Db = 'mythfood_merchant';  File = 'seed-merchant.sql'  },
    @{ Db = 'mythfood_inventory'; File = 'seed-inventory.sql' },
    @{ Db = 'mythfood_driver';    File = 'seed-driver.sql'    },
    @{ Db = 'mythfood_wallet';    File = 'seed-wallet.sql'    }
)
foreach ($step in $plan) {
    Invoke-PsqlFile -Database $step.Db -SqlFile (Join-Path $sqlDir $step.File)
}
Write-Host '== Kiem tra nguong toi thieu ==' -ForegroundColor Cyan
$checks = @(
    @{ Label = 'khach hang';    Db = 'mythfood_identity';  Query = "SELECT count(*) FROM users WHERE phone_number LIKE '+8491%'"; Min = 100 },
    @{ Label = 'chu quan';      Db = 'mythfood_identity';  Query = "SELECT count(*) FROM users WHERE phone_number LIKE '+8492%'"; Min = 50 },
    @{ Label = 'tai xe (user)'; Db = 'mythfood_identity';  Query = "SELECT count(*) FROM users WHERE phone_number LIKE '+8493%'"; Min = 20 },
    @{ Label = 'ho so khach';   Db = 'mythfood_consumer';  Query = "SELECT count(*) FROM consumers WHERE id::text LIKE 'c2000000-%'"; Min = 100 },
    @{ Label = 'nha hang';      Db = 'mythfood_merchant';  Query = "SELECT count(*) FROM merchants WHERE id::text LIKE 'a2000000-%'"; Min = 50 },
    @{ Label = 'mon';           Db = 'mythfood_merchant';  Query = "SELECT count(*) FROM menu_items WHERE id::text LIKE 'b1000000-%'"; Min = 500 },
    @{ Label = 'ton kho';       Db = 'mythfood_inventory'; Query = "SELECT count(*) FROM inventories WHERE id::text LIKE 'b2000000-%'"; Min = 500 },
    @{ Label = 'tai xe';        Db = 'mythfood_driver';    Query = "SELECT count(*) FROM drivers WHERE id::text LIKE 'd2000000-%'"; Min = 20 },
    @{ Label = 'vi';            Db = 'mythfood_wallet';    Query = "SELECT count(*) FROM wallets WHERE id::text LIKE 'f1000000-%' OR id::text LIKE 'f2000000-%'"; Min = 70 }
)
foreach ($c in $checks) {
    $count = [int](Invoke-Scalar -Database $c.Db -Query $c.Query)
    if ($count -lt $c.Min) { throw "$($c.Label): $count < $($c.Min) - bo du lieu chua du" }
    Write-Host ("  ok  {0,-14} {1,5} (>= {2})" -f $c.Label, $count, $c.Min) -ForegroundColor DarkGray
}

$lowStock = [int](Invoke-Scalar -Database 'mythfood_inventory' -Query "SELECT min(available_quantity) FROM inventories WHERE id::text LIKE 'b2000000-%'")
if ($lowStock -lt 500) { throw "Ton kho kha dung thap nhat chi $lowStock - phai >= 500 de W4 khong can kho" }
Write-Host ("  ok  ton kho nho nhat {0}" -f $lowStock) -ForegroundColor DarkGray

if (-not $SkipExport) {
    Write-Host '== Xuat du lieu cho k6 ==' -ForegroundColor Cyan
    if (-not (Test-Path $k6DataDir)) { New-Item -ItemType Directory -Path $k6DataDir -Force | Out-Null }
    Export-Json -Database 'mythfood_consumer' -SqlFile (Join-Path $sqlDir 'export-consumers.sql') -TargetPath (Join-Path $k6DataDir 'users.json')
    Export-Json -Database 'mythfood_merchant' -SqlFile (Join-Path $sqlDir 'export-merchants.sql') -TargetPath (Join-Path $k6DataDir 'merchants.json')
    Export-Json -Database 'mythfood_driver'   -SqlFile (Join-Path $sqlDir 'export-drivers.sql')   -TargetPath (Join-Path $k6DataDir 'drivers.json')
}

Write-Host '== Xong. Tiep theo: .\scripts\wait-ready.ps1 roi .\scripts\research\harness.ps1 -RunId E1-W2-r1 ==' -ForegroundColor Green

