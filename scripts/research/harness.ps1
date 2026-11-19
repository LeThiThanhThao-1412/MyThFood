# =============================================================================
# HARNESS MỘT LỆNH CHO MỘT RUN ĐO (giao thức §6.5 + §12)
#
# Việc harness làm, theo đúng thứ tự của §6.5:
#   1. Dừng Kafka/Zookeeper và ghi lại thời điểm (§0.1/E10).
#   2. Tạo lại order-service với RUN_ID + SERVICE_CLIENT_MODE của run này.
#      Bắt buộc: RUN_ID được đọc lúc khởi động, và log hop phải mang đúng runId.
#   3. Qua bốn cổng của §2.2 (gọi scripts/wait-ready.ps1).
#   4. Bật bộ thu tài nguyên `docker stats` 5 s/lần → logs/<RUN_ID>/res.csv.
#   5. Chạy k6 với hồ sơ tương ứng → logs/<RUN_ID>/{k6.txt,k6.json,k6-summary.json}.
#   6. Sao lưu hop log → logs/<RUN_ID>/hops.jsonl.
#   7. Ghi meta.json (§12.2) rồi gọi aggregate-matrix.js để điền summary.csv.
#
# Ví dụ:
#   .\scripts\research\harness.ps1 -RunId E1-W2-r1 -Experiment E1 -Profile W2
#   .\scripts\research\harness.ps1 -RunId E3-W3-inproc-r1 -Experiment E3 -Profile W3 -Variant B1
#   .\scripts\research\harness.ps1 -RunId E1-W1-q1 -Experiment E1 -Profile W1 -Quick
#
# -Quick chỉ để kiểm tra đường ống (10 s warm-up / 60 s đo), KHÔNG lấy số.
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RunId,

    [Parameter(Mandatory = $true)]
    [ValidateSet('E1', 'E2', 'E3', 'E5')]
    [string]$Experiment,

    [Parameter(Mandatory = $true)]
    [ValidateSet('W0', 'W1', 'W2', 'W3', 'W4')]
    [string]$Profile,

    [ValidateSet('M2', 'B1', 'B2')]
    [string]$Variant = 'M2',

    # Rỗng = suy ra từ Variant: M2 → http, B1/B2 → inproc.
    [ValidateSet('', 'http', 'inproc')]
    [string]$ServiceClientMode = '',

    [int]$Repeat = 1,

    # Ghi đè tốc độ đến (mặc định lấy theo hồ sơ trong script k6).
    [int]$TargetRate = 0,

    [switch]$Quick,
    [switch]$SkipGates,
    [switch]$KeepKafka,
    [switch]$NoSample,

    # Bỏ bước dọn đơn tồn đọng trước khi đo (mặc định LÀ dọn — xem §14.1).
    [switch]$NoReset,

    # --- E5: tiêm lỗi (§8.2) -------------------------------------------------
    # Hai script PowerShell nhận tham số -RunDir. Harness bật lỗi ở giây thứ
    # -FaultAtSeconds (mặc định 127 = 120 s baseline + ~7 s setup/khởi động k6),
    # giữ -FaultDurationSeconds rồi tắt. Thời điểm thật được ghi vào
    # logs/<RunId>/fault.json để đối chiếu với cửa sổ đo.
    [string]$FaultApply = '',
    [string]$FaultRevert = '',
    [int]$FaultAtSeconds = 127,
    [int]$FaultDurationSeconds = 180,

    [string]$Note = ''
)

# 'Continue' là CHỦ Ý: các lệnh docker/compose ghi cảnh báo ra stderr (ví dụ
# "AI_PII_HMAC_SECRET is not set"); để 'Stop' thì PowerShell biến cảnh báo thành
# NativeCommandError và dừng run. Mọi lỗi thật được kiểm bằng $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
# Console đọc UTF-8 để chữ Việt trong output của node/k6 không bị lỗi mã hoá.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
if ($RunId -notmatch '^[A-Za-z0-9._-]+$') { throw "RunId chỉ được chứa chữ, số, dấu chấm, gạch dưới, gạch ngang: '$RunId'." }

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$logsRoot = Join-Path $repoRoot 'logs'
$runDir = Join-Path $logsRoot $RunId
$composeFiles = @('-f', 'docker-compose.yml', '-f', 'docker-compose.research.yml')

$scriptMap = @{
    W0 = 'w0-smoke.js'
    W1 = 'w1-read.js'
    W2 = 'w2-place-order.js'
    W3 = 'w3-lifecycle.js'
    W4 = 'w4-spike.js'
}
$k6Script = $scriptMap[$Profile]
# E5 dùng chung hồ sơ W2 nhưng là script riêng (hai giai đoạn baseline/fault).
if ($Experiment -eq 'E5') { $k6Script = 'e5-fault.js' }

if ([string]::IsNullOrWhiteSpace($ServiceClientMode)) {
    $ServiceClientMode = if ($Variant -eq 'M2') { 'http' } else { 'inproc' }
}

# Giai đoạn: mặc định = giao thức (§6.2/§6.3). -Quick rút ngắn để kiểm tra.
$stages = if ($Quick) {
    @{ WARMUP_SECONDS = 10; RAMP_SECONDS = 10; MEASURE_SECONDS = 60; DOWNTIME_SECONDS = 5 }
} else {
    @{ WARMUP_SECONDS = 60; RAMP_SECONDS = 60; MEASURE_SECONDS = 180; DOWNTIME_SECONDS = 10 }
}
if ($Profile -eq 'W4' -and -not $Quick) { $stages['MEASURE_SECONDS'] = 120 }
# E5 không có warm-up/ramp: hai giai đoạn baseline rồi fault (§8.2 bước 1–3).
if ($Experiment -eq 'E5') {
    $stages = if ($Quick) {
        @{ BASELINE_SECONDS = 20; FAULT_SECONDS = 60 }
    } else {
        @{ BASELINE_SECONDS = 120; FAULT_SECONDS = 180 }
    }
}

$rateEnvName = if ($Experiment -eq 'E5') { 'E5_RATE' } else { "${Profile}_RATE" }

New-Item -ItemType Directory -Path $runDir -Force | Out-Null
Write-Host "== Run $RunId | $Experiment | $Profile | $Variant | mode=$ServiceClientMode ==" -ForegroundColor Cyan
Write-Host ("   giai đoạn: warm-up {0}s, ramp {1}s, đo {2}s, hạ tải {3}s" -f `
    $stages.WARMUP_SECONDS, $stages.RAMP_SECONDS, $stages.MEASURE_SECONDS, $stages.DOWNTIME_SECONDS) -ForegroundColor DarkGray
if ($Quick) { Write-Host '   -Quick: KHÔNG dùng số liệu của run này vào bảng.' -ForegroundColor Yellow }
# -----------------------------------------------------------------------------
# Bước 1 — Kafka/Zookeeper phải TẮT (§0.1/E10). Ghi lại thời điểm dừng.
# -----------------------------------------------------------------------------
$startedAt = (Get-Date).ToUniversalTime()
$kafkaStoppedAt = $null
if (-not $KeepKafka) {
    $running = @(docker ps --filter 'name=mythfood-kafka' --filter 'name=mythfood-zookeeper' --format '{{.Names}}')
    if ($running.Count -gt 0) {
        docker stop mythfood-kafka mythfood-zookeeper 2>&1 | Out-Null
        $kafkaStoppedAt = (Get-Date).ToUniversalTime().ToString('o')
        Write-Host ("   đã dừng: {0}" -f ($running -join ', ')) -ForegroundColor DarkGray
    } else {
        Write-Host '   Kafka/Zookeeper đã tắt sẵn' -ForegroundColor DarkGray
    }
}

# -----------------------------------------------------------------------------
# Bước 2 — tạo lại order-service với RUN_ID + chế độ transport của run này.
# RUN_ID là biến môi trường đọc lúc khởi động, nên không thể đổi nóng.
# -----------------------------------------------------------------------------
# Hop log dùng chung một tệp /logs/hops.jsonl; lưu trữ bản cũ để không trộn run.
$hopFile = Join-Path $logsRoot 'hops.jsonl'
if (Test-Path $hopFile) {
    $archiveDir = Join-Path $logsRoot 'archive'
    New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
    Move-Item -LiteralPath $hopFile -Destination (Join-Path $archiveDir ("hops-{0}.jsonl" -f (Get-Date -Format 'yyyyMMdd-HHmmss')))
}

$env:RUN_ID = $RunId
$env:SERVICE_CLIENT_MODE = $ServiceClientMode
$orderReadyWatch = [System.Diagnostics.Stopwatch]::StartNew()
docker compose @composeFiles up -d --no-deps --force-recreate order-service 2>&1 | Out-Null
Remove-Item Env:\RUN_ID, Env:\SERVICE_CLIENT_MODE -ErrorAction SilentlyContinue
Write-Host '   order-service đã tạo lại với RUN_ID mới' -ForegroundColor DarkGray

# -----------------------------------------------------------------------------
# Bước 3 — bốn cổng sẵn sàng (§2.2). Cổng 4 (W0) chỉ chạy với run không -Quick
# để tiết kiệm thời gian khi kiểm tra đường ống.
# -----------------------------------------------------------------------------
if (-not $SkipGates) {
    $ready = & (Join-Path $repoRoot 'scripts\wait-ready.ps1') -SkipSmoke:$Quick
    $orderReadyWatch.Stop()
    $orderReadySeconds = [math]::Round($orderReadyWatch.Elapsed.TotalSeconds, 1)
    Write-Host ("   order-service healthy sau {0} s" -f $orderReadySeconds) -ForegroundColor DarkGray
} else {
    $ready = $null
    $orderReadyWatch.Stop()
    $orderReadySeconds = [math]::Round($orderReadyWatch.Elapsed.TotalSeconds, 1)
    Write-Host '   -SkipGates: bỏ qua bốn cổng (chỉ dùng khi đã kiểm tra tay)' -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# Bước 3.5 — DỌN ĐƠN TỒN ĐỌNG (bổ sung 11/11/2026, xem §14.1)
#
# Vì sao cần: W2/W4 tạo hàng nghìn đơn PENDING mà không gán tài xế. Hai cron
# 30 giây của order-service (`autoRejectExpiredPendingOrders`,
# `autoCancelNoDriverReadyOrders`) sẽ quét và huỷ chúng trong run KẾ TIẾP, mỗi
# lần huỷ phát sinh hop `POST /promotions/flash-sales/refund` + thông báo. Đo
# được: 3 572 hop nền và p50 mỗi bước của W3 tăng 4–8 lần so với lúc trạng thái
# sạch. UPDATE thẳng bằng SQL không đi qua service nên KHÔNG sinh hop, và trả
# hệ thống về cùng một trạng thái đầu cho mọi run.
# -----------------------------------------------------------------------------
$ordersReset = $null
$walletsReset = $null
if (-not $NoReset) {
    $resetSql = "UPDATE orders SET status='CANCELLED', updated_at=now() " +
                "WHERE status IN ('PENDING','CONFIRMED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY');"
    $ordersReset = (docker exec mythfood-postgres psql -U mythfood -d mythfood_order -tAc $resetSql 2>&1 | Out-String).Trim()
    Write-Host ("   dọn đơn tồn đọng: {0}" -f $ordersReset) -ForegroundColor DarkGray

    # Ví — bổ sung 11/11/2026 cùng ngày, xem §14.3. Bước `delivered` của W3/E3 gọi
    # `POST /wallets/settlement/accrue`; với đơn COD, ví TÀI XẾ bị trừ đúng tiền món
    # (`debitForCOD`). Định mức seed 5.000.000 đ/tài xế chỉ đủ ~200 đơn, nên sau
    # ~4 run W3 (795 đơn/run) ví cạn dần và hop đó trả 500 vì thiếu số dư — đo được:
    # lỗi ví 0 → 3 → 335 → 737 → 795 qua năm run liên tiếp. Nạp lại số dư về đúng
    # định mức seed để mọi run cùng một trạng thái đầu.
    $walletSql = @'
UPDATE wallets
   SET balance = CASE "ownerType" WHEN 'DRIVER' THEN 5000000 WHEN 'MERCHANT' THEN 100000000 ELSE balance END,
       "heldBalance" = 0
 WHERE "ownerType" IN ('DRIVER','MERCHANT');
'@
    $walletsReset = ($walletSql | docker exec -i mythfood-postgres psql -U mythfood -d mythfood_wallet -tA 2>&1 | Out-String).Trim()
    Write-Host ("   nạp lại số dư ví: {0}" -f $walletsReset) -ForegroundColor DarkGray
} else {
    Write-Host '   -NoReset: giữ nguyên đơn tồn đọng và số dư ví (chỉ dùng để tái hiện §14.1/§14.3)' -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# Bước 4 — bộ thu tài nguyên (§5.2, phương án B: docker stats 5 s/lần)
# -----------------------------------------------------------------------------
$resPath = Join-Path $runDir 'res.csv'
$sampler = $null
if (-not $NoSample) {
    $sampler = Start-Job -ScriptBlock {
        param($out)
        function ConvertTo-Mb([string]$value) {
            $text = $value.Trim()
            if ($text -match '^([\d.]+)\s*GiB$') { return [math]::Round([double]$Matches[1] * 1024, 1) }
            if ($text -match '^([\d.]+)\s*MiB$') { return [math]::Round([double]$Matches[1], 1) }
            if ($text -match '^([\d.]+)\s*KiB$') { return [math]::Round([double]$Matches[1] / 1024, 2) }
            if ($text -match '^([\d.]+)\s*B$')   { return 0 }
            return 0
        }
        'timestamp,container,cpu_percent,mem_used_mb,mem_limit_mb' | Set-Content -LiteralPath $out
        while ($true) {
            $ts = (Get-Date).ToUniversalTime().ToString('o')
            $rows = docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}}'
            foreach ($row in $rows) {
                $parts = $row -split ','
                if ($parts.Count -lt 3) { continue }
                $mem = $parts[2] -split ' / '
                $cpu = [double]($parts[1] -replace '%', '')
                "{0},{1},{2},{3},{4}" -f $ts, $parts[0], $cpu, (ConvertTo-Mb $mem[0]), (ConvertTo-Mb $mem[1]) |
                    Add-Content -LiteralPath $out
            }
            Start-Sleep -Seconds 5
        }
    } -ArgumentList $resPath
    Write-Host '   bộ thu tài nguyên đang chạy (docker stats, 5 s/lần)' -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
# Bước 5 — chạy k6 (§6.4)
# -----------------------------------------------------------------------------
$k6Env = @()
foreach ($key in $stages.Keys) { $k6Env += @('-e', "$key=$($stages[$key])") }
if ($TargetRate -gt 0) { $k6Env += @('-e', "$rateEnvName=$TargetRate") }

$k6Args = @('-f', 'docker-compose.yml', '-f', 'docker-compose.research.yml', '--profile', 'load', 'run', '--rm') +
          $k6Env +
          @('-e', "RUN_ID=$RunId", 'k6', 'run',
            '--out', "json=/logs/$RunId/k6.json",
            '--summary-export', "/logs/$RunId/k6-summary.json",
            "/work/$k6Script")

$k6Txt = Join-Path $runDir 'k6.txt'
$k6Watch = [System.Diagnostics.Stopwatch]::StartNew()
Write-Host ("   k6: {0} (log: logs\{1}\k6.txt)" -f $k6Script, $RunId) -ForegroundColor DarkGray

# --- E5: hẹn giờ tiêm lỗi, chạy song song với k6 -----------------------------
$faultJob = $null
if ($FaultApply) {
    $faultJob = Start-Job -ScriptBlock {
        param($apply, $revert, $targetDir, $atSeconds, $durationSeconds)
        Start-Sleep -Seconds $atSeconds
        $appliedAt = (Get-Date).ToUniversalTime().ToString('o')
        & $apply -RunDir $targetDir -Phase 'apply'
        $applyExit = $LASTEXITCODE
        Start-Sleep -Seconds $durationSeconds
        $revertedAt = (Get-Date).ToUniversalTime().ToString('o')
        if ($revert) { & $revert -RunDir $targetDir -Phase 'revert' }
        [ordered]@{
            appliedAt       = $appliedAt
            revertedAt      = $revertedAt
            applyScript     = $apply
            revertScript    = $revert
            applyExitCode   = $applyExit
            atSeconds       = $atSeconds
            durationSeconds = $durationSeconds
        } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $targetDir 'fault.json') -Encoding UTF8
    } -ArgumentList $FaultApply, $FaultRevert, $runDir, $FaultAtSeconds, $FaultDurationSeconds
    Write-Host ("   tiêm lỗi: bật ở giây {0}, giữ {1} s ({2})" -f $FaultAtSeconds, $FaultDurationSeconds, (Split-Path -Leaf $FaultApply)) -ForegroundColor DarkGray
}

docker compose @k6Args *> $k6Txt
$k6Exit = $LASTEXITCODE
$k6Watch.Stop()

if ($sampler) { Stop-Job $sampler; Remove-Job $sampler -Force }

# Đợi job tiêm lỗi hoàn tất (nếu có) để fault.json kịp được ghi.
$faultAppliedAt = $null
$faultRevertedAt = $null
if ($faultJob) {
    $null = Wait-Job $faultJob -Timeout ([math]::Max(120, $FaultAtSeconds + $FaultDurationSeconds))
    Remove-Job $faultJob -Force -ErrorAction SilentlyContinue
    $faultPath = Join-Path $runDir 'fault.json'
    if (Test-Path $faultPath) {
        $faultInfo = Get-Content -LiteralPath $faultPath -Raw | ConvertFrom-Json
        $faultAppliedAt = $faultInfo.appliedAt
        $faultRevertedAt = $faultInfo.revertedAt
        Write-Host ("   lỗi đã bật {0} và tắt {1}" -f $faultAppliedAt, $faultRevertedAt) -ForegroundColor DarkGray
    } else {
        Write-Host '   KHÔNG thấy fault.json — kiểm tra job tiêm lỗi' -ForegroundColor Yellow
    }
}

# Mã thoát của k6: 0 = đạt mọi ngưỡng, 99 = có ngưỡng bị vượt (run vẫn dùng
# được, phải ghi vào nhật ký), các mã khác = lỗi thật.
if ($k6Exit -eq 0) {
    Write-Host ("   k6 xong sau {0} s, mã thoát 0" -f [math]::Round($k6Watch.Elapsed.TotalSeconds, 1)) -ForegroundColor Green
} elseif ($k6Exit -eq 99) {
    Write-Host '   k6 xong nhưng CÓ NGƯỠNG BỊ VƯỢT (mã 99) — đọc logs\<RunId>\k6.txt' -ForegroundColor Yellow
} else {
    Write-Host ("   k6 THẤT BẠI (mã thoát {0}) — xem logs\{1}\k6.txt" -f $k6Exit, $RunId) -ForegroundColor Red
}

# -----------------------------------------------------------------------------
# Bước 6 — sao lưu hop log của run này (§12.1)
# -----------------------------------------------------------------------------
$hopsCollected = 0
if (Test-Path $hopFile) {
    Move-Item -LiteralPath $hopFile -Destination (Join-Path $runDir 'hops.jsonl') -Force
    $hopsCollected = (Get-Content -LiteralPath (Join-Path $runDir 'hops.jsonl') | Measure-Object -Line).Lines
    Write-Host ("   hops.jsonl: {0} dòng" -f $hopsCollected) -ForegroundColor DarkGray
} else {
    Write-Host '   KHÔNG có hops.jsonl — kiểm tra volume ./logs:/logs của order-service' -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# Bước 7 — meta.json (§12.2)
# -----------------------------------------------------------------------------
function Get-CommandOutput([scriptblock]$Action, [string]$Fallback = '') {
    try { return (& $Action | Out-String).Trim() } catch { return $Fallback }
}

$gitCommit = Get-CommandOutput { git -C $repoRoot rev-parse --short HEAD } 'unknown'
$nodeVersion = Get-CommandOutput { docker exec mythfood-order-service node --version } 'unknown'
$postgresVersion = Get-CommandOutput { docker exec mythfood-postgres psql -U mythfood -d postgres -tAc 'SHOW server_version' 2>$null } 'unknown'
$dockerVersion = Get-CommandOutput { docker version --format '{{.Server.Version}}' } 'unknown'
$hostCpu = Get-CommandOutput { (Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1).Name } 'unknown'
$hostRamGb = try { [math]::Round((Get-CimInstance -ClassName Win32_ComputerSystem).TotalPhysicalMemory / 1GB) } catch { $null }
$wslMemoryGb = $null
try {
    $memLine = (wsl -e free -g 2>$null | Where-Object { $_ -match '^\s*Mem:' } | Select-Object -First 1)
    if ($memLine) { $wslMemoryGb = [int](($memLine -split '\s+') | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1) }
} catch { }

$defaultRate = switch ($Profile) { 'W1' { 10 } 'W2' { 10 } 'W3' { 3 } 'W4' { 60 } default { 0 } }
if ($Experiment -eq 'E5') { $defaultRate = 5 }
$targetRateRps = if ($TargetRate -gt 0) { $TargetRate } else { $defaultRate }

$meta = [ordered]@{
    runId                    = $RunId
    experiment               = $Experiment
    profile                  = $Profile
    variant                  = $Variant
    serviceClientMode        = $ServiceClientMode
    repeat                   = $Repeat
    gitCommit                = $gitCommit
    startedAt                = $startedAt.ToString('o')
    durationSeconds          = $stages.MEASURE_SECONDS
    warmupSeconds            = $stages.WARMUP_SECONDS
    rampSeconds              = $stages.RAMP_SECONDS
    downtimeSeconds          = $stages.DOWNTIME_SECONDS
    baselineSeconds          = $stages.BASELINE_SECONDS
    faultSeconds             = $stages.FAULT_SECONDS
    faultApplyScript         = if ($FaultApply) { Split-Path -Leaf $FaultApply } else { $null }
    faultAppliedAt           = $faultAppliedAt
    faultRevertedAt          = $faultRevertedAt
    targetRateRps            = $targetRateRps
    quickMode                = [bool]$Quick
    servicesHealthy          = if ($ready) { $ready.HealthyCount } else { $null }
    databasesReady           = if ($ready) { $ready.DbOk } else { $null }
    smokeGateOk              = if ($ready) { $ready.SmokeOk } else { $null }
    kafkaStoppedAt           = $kafkaStoppedAt
    ordersReset              = $ordersReset
    walletsReset             = $walletsReset
    ordersResetDisabled      = [bool]$NoReset
    orderServiceReadySeconds = $orderReadySeconds
    k6ExitCode               = $k6Exit
    k6WallSeconds            = [math]::Round($k6Watch.Elapsed.TotalSeconds, 1)
    hopRecords               = $hopsCollected
    nodeVersion              = $nodeVersion
    postgresVersion          = $postgresVersion
    dockerVersion            = $dockerVersion
    hostCpu                  = $hostCpu
    hostRamGb                = $hostRamGb
    wslMemoryGb              = $wslMemoryGb
    notes                    = $Note
}
$metaPath = Join-Path $runDir 'meta.json'
# UTF-8 KHÔNG BOM: `Set-Content -Encoding utf8` của PowerShell 5.1 ghi BOM và
# JSON.parse trong aggregate-matrix.js sẽ chết ở byte đầu tiên.
[System.IO.File]::WriteAllText($metaPath, (($meta | ConvertTo-Json -Depth 5) + "`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("   meta.json đã ghi ({0})" -f $metaPath) -ForegroundColor DarkGray

# -----------------------------------------------------------------------------
# Bước 8 — tổng hợp số liệu và điền logs/summary.csv (§12.3)
# -----------------------------------------------------------------------------
$aggregate = Join-Path $PSScriptRoot 'aggregate-matrix.js'
if (Test-Path $aggregate) {
    node $aggregate $RunId --experiment $Experiment --profile $Profile --variant $Variant --repeat $Repeat
    if ($LASTEXITCODE -ne 0) { Write-Host '   aggregate-matrix.js lỗi — số liệu vẫn nằm trong logs\<RunId>' -ForegroundColor Yellow }
} else {
    Write-Host '   chưa có aggregate-matrix.js — bỏ qua bước tổng hợp' -ForegroundColor Yellow
}

Write-Host ''
Write-Host ("== XONG {0} — thư mục logs\{0} ==" -f $RunId) -ForegroundColor Green
Write-Host '   Nhật ký (§14): điền RUN_ID, thời gian, biến thể, p50/p95/p99, bất thường, run hợp lệ?' -ForegroundColor DarkGray
