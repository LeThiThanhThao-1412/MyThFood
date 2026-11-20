<#
.SYNOPSIS
  Dọn user rác trong mythfood_identity.users (và profile/ví mồ côi theo user id).

.DESCRIPTION
  Mặc định CHỈ IN kế hoạch (dry-run). Thêm -Apply để thực sự xoá.

  Nhóm rác được nhắm tới:
    • smoke        : full_name = 'Kong Smoke' hoặc LIKE 'CD Smoke%'
                     (do scripts/test-gateway.ps1 và job integration-test trong
                     .github/workflows/cd.yml tự đăng ký mỗi lần chạy)
    • extra        : các số điện thoại truyền qua -ExtraPhones
    • research-seed: chỉ khi bật -IncludeResearchSeed → +8491xxxxxxx (Khach Hang),
                     +8492xxxxxxx (Chu Quan), +8493xxxxxxx (Tai Xe) do
                     scripts/research/seed-*.sql sinh ra.

  LUÔN được bảo vệ (không bao giờ xoá):
    • 0987654321..0987654324  — fixture Playwright (scripts/e2e/seed-e2e-users.sql)
    • +84901112233            — Admin Master (scripts/create-accounts.ps1)

  Thứ tự xoá: consumers → drivers → wallets → users. Bảng merchants KHÔNG bị
  xoá vì các nhà hàng demo gắn với merchant; chỉ dọn merchant khi bạn tự nêu
  số điện thoại trong -ExtraPhones và tự kiểm tra nhà hàng đi kèm.

.EXAMPLE
  .\scripts\db\cleanup-test-users.ps1                      # xem sẽ xoá gì
  .\scripts\db\cleanup-test-users.ps1 -Apply               # xoá user smoke
  .\scripts\db\cleanup-test-users.ps1 -ExtraPhones 0364111112,0364111113 -Apply
  .\scripts\db\cleanup-test-users.ps1 -IncludeResearchSeed # xem thêm cả seed
#>
[CmdletBinding()]
param(
    # Thực sự xoá (mặc định chỉ in kế hoạch)
    [switch]$Apply,

    # Bao gồm dữ liệu seed của scripts/research/seed-*.sql
    [switch]$IncludeResearchSeed,

    # Số điện thoại cụ thể cần dọn (khớp chính xác)
    [string[]]$ExtraPhones = @(),

    [string]$Container = 'mythfood-postgres',
    [string]$DbUser = 'mythfood',
    [string]$IdentityDb = 'mythfood_identity'
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
# stdin của lệnh native: giữ nguyên byte ASCII/UTF-8 thay vì hạ về ASCII
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Invoke-Sql {
    param([string]$Database, [string]$Query)

    # Nạp SQL qua stdin (-f -) thay vì -c: nếu dùng -c, dấu nháy kép của
    # identifier camelCase ("userId", "ownerId") bị PowerShell/cmd nuốt mất và
    # Postgres hạ chữ thường -> column "userid" does not exist.
    # SQL trong script này thuần ASCII nên không gặp lỗi mã hoá của pipe.
    $out = $Query | docker exec -i $Container psql -U $DbUser -d $Database -tA -F '|' 2>&1
    $code = $LASTEXITCODE
    return [pscustomobject]@{ ExitCode = $code; Output = @($out) }
}

# ---------------------------------------------------------------------------
# 1. Xác định nhóm user rác
# ---------------------------------------------------------------------------
$fromSmoke = "full_name = 'Kong Smoke' OR full_name LIKE 'CD Smoke%'"

$extra = @($ExtraPhones | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$fromExtra = if ($extra.Count -gt 0) {
    $quoted = ($extra | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ','
    "phone_number IN ($quoted)"
} else { $null }

$fromSeed = if ($IncludeResearchSeed) {
    "phone_number LIKE '+8491%' OR phone_number LIKE '+8492%' OR phone_number LIKE '+8493%'"
} else { $null }

$criteria = (@($fromSmoke, $fromExtra, $fromSeed) | Where-Object { $_ }) -join ' OR '

# Bảo vệ fixture E2E + Admin Master
$guard = "phone_number NOT LIKE '098765432%' AND phone_number <> '+84901112233'"


$listSql = @"
SELECT phone_number, full_name, roles, created_at
FROM users
WHERE ($criteria) AND $guard
ORDER BY phone_number
"@

Write-Host '=== User rac se bi xoa ===' -ForegroundColor Cyan
$listed = Invoke-Sql -Database $IdentityDb -Query $listSql
if ($listed.ExitCode -ne 0) {
    Write-Host "Khong truy van duoc $IdentityDb (container $Container dang chay?)" -ForegroundColor Red
    $listed.Output | ForEach-Object { Write-Host "  $_" }
    exit 1
}

$rows = @($listed.Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($rows.Count -eq 0) {
    Write-Host '  (khong co user nao khop) - DB da sach.' -ForegroundColor Green
    exit 0
}
$rows | ForEach-Object { Write-Host "  $_" }
Write-Host "Tong: $($rows.Count) user" -ForegroundColor Yellow
if (-not $Apply) {
    Write-Host ''
    Write-Host 'DRY-RUN: chua xoa gi. Them -Apply de thuc hien.' -ForegroundColor Yellow
    exit 0
}

# ---------------------------------------------------------------------------
# 2. Lay danh sach id (users.id) de don profile/vi truoc khi xoa user
# ---------------------------------------------------------------------------
$idSql = @"
SELECT string_agg(id::text, ',')
FROM users
WHERE ($criteria) AND $guard
"@
$idResult = Invoke-Sql -Database $IdentityDb -Query $idSql
$rawIds = ($idResult.Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($rawIds)) {
    Write-Host 'Khong lay duoc id - dung de tranh xoa do.' -ForegroundColor Red
    exit 1
}
$idList = ($rawIds -split ',' | ForEach-Object { "'" + $_.Trim() + "'" }) -join ','

# ---------------------------------------------------------------------------
# 3. Don du lieu con (idempotent - bang/cot khong ton tai thi bo qua)
# ---------------------------------------------------------------------------
$children = @(
    @{ Db = 'mythfood_consumer'; Table = 'consumers'; Column = 'user_id' },
    @{ Db = 'mythfood_driver'; Table = 'drivers'; Column = '"userId"' },
    @{ Db = 'mythfood_wallet'; Table = 'wallets'; Column = '"ownerId"' }
)

foreach ($child in $children) {
    $deleteSql = @"
WITH deleted AS (
  DELETE FROM $($child.Table) WHERE $($child.Column) IN ($idList) RETURNING 1
)
SELECT count(*) FROM deleted
"@
    $r = Invoke-Sql -Database $child.Db -Query $deleteSql
    $count = ($r.Output | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1)
    if ($r.ExitCode -ne 0 -or -not $count) {
        Write-Host ("  [skip] {0}.{1}: {2}" -f $child.Db, $child.Table, (($r.Output | Select-Object -First 1))) -ForegroundColor DarkYellow
    } else {
        Write-Host ("  [ok]   {0}.{1}: xoa {2} dong" -f $child.Db, $child.Table, $count) -ForegroundColor Green
    }
}

# ---------------------------------------------------------------------------
# 4. Xoa user
# ---------------------------------------------------------------------------
$deleteUsers = @"
WITH deleted AS (
  DELETE FROM users WHERE id IN ($idList) RETURNING 1
)
SELECT count(*) FROM deleted
"@
$deleted = Invoke-Sql -Database $IdentityDb -Query $deleteUsers
$deletedCount = ($deleted.Output | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1)
if ($deleted.ExitCode -ne 0 -or -not $deletedCount) {
    Write-Host 'Xoa user that bai:' -ForegroundColor Red
    $deleted.Output | ForEach-Object { Write-Host "  $_" }
    exit 1
}

$remaining = Invoke-Sql -Database $IdentityDb -Query 'SELECT count(*) FROM users'
Write-Host ''
Write-Host ("Da xoa {0} user khoi {1}.users - con lai {2} user." -f $deletedCount, $IdentityDb, ($remaining.Output | Select-Object -First 1)) -ForegroundColor Cyan
Write-Host 'Fixture E2E 0987654321..0987654324 va Admin +84901112233 luon duoc giu.' -ForegroundColor DarkGray
