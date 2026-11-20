# =============================================================================
# CHẠY CẢ HÀNG ĐỢI RUN ĐO, TUẦN TỰ, KHÔNG CẦN NGƯỜI TRỰC
#
# Mỗi phần tử trong tệp kế hoạch (mặc định matrix-plan.json) được đưa cho
# harness.ps1 theo đúng thứ tự đã khai báo. Run nào đã có meta.json (harness
# chạy xong) thì BỎ QUA — nên có thể dừng giữa chừng và chạy lại, không mất số
# liệu đã đo và cũng không đo trùng.
#
# Dùng:
#   .\scripts\research\run-matrix.ps1                       # chạy cả kế hoạch
#   .\scripts\research\run-matrix.ps1 -From E3-W3-http-r1   # chạy tiếp từ một run
#   .\scripts\research\run-matrix.ps1 -DryRun               # chỉ liệt kê việc sẽ làm
#
# Tiến trình được ghi vào logs\matrix-progress.log (một dòng mỗi sự kiện), còn
# toàn bộ output của từng run nằm ở logs\<RunId>\harness.txt.
#
# BƯỚC 3.5 CỦA HARNESS — DỌN TRẠNG THÁI TRƯỚC KHI ĐO. Trước mỗi run, harness
# (a) chạy `UPDATE orders SET status='CANCELLED' …` để mọi run bắt đầu từ cùng một
# trạng thái và (b) nạp lại số dư ví về đúng định mức seed (`UPDATE wallets …`).
# Không có (a), hai cron 30 giây của order-service huỷ dồn đơn PENDING của run
# trước và sinh bão hop refund: đo được 3 572 hop nền và p50 tăng 4–8 lần
# (docs/RESEARCH/03_EXPERIMENT_PROTOCOL.md §14.1). Không có (b), ví TÀI XẾ bị trừ
# dần bởi COD settlement (5 triệu chỉ đủ ~200 đơn) nên hop `settlement/accrue`
# chuyển sang 500 sau khoảng bốn run W3 (§14.3). Dùng -NoReset khi gọi harness để
# tái hiện đúng trạng thái nhiễm đó.
# =============================================================================
[CmdletBinding()]
param(
    # Rỗng = scripts\research\matrix-plan.json. Không đặt Join-Path $PSScriptRoot
    # ngay trong khối param: PowerShell 5.1 để $PSScriptRoot trống ở đó.
    [string]$PlanFile = '',

    # Chạy tiếp từ run có mã này (bỏ qua mọi run đứng trước trong kế hoạch).
    [string]$From = '',

    # Chạy lại cả những run đã xong.
    [switch]$Force,

    # Không chạy gì, chỉ in ra việc sẽ làm.
    [switch]$DryRun,

    # Đặt lại order-service về chế độ http + RUN_ID adhoc khi kết thúc.
    # (Dùng -switch để chạy được cả bằng `powershell -File`, nơi tham số [bool]
    # bị truyền dưới dạng chuỗi.)
    [switch]$NoRestore
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($PlanFile)) { $PlanFile = Join-Path $PSScriptRoot 'matrix-plan.json' }
$logsRoot = Join-Path $repoRoot 'logs'
$harness = Join-Path $PSScriptRoot 'harness.ps1'
$progressPath = Join-Path $logsRoot 'matrix-progress.log'

New-Item -ItemType Directory -Path $logsRoot -Force | Out-Null

function Write-Progress-Line([string]$text) {
    $line = '{0} {1}' -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'), $text
    Add-Content -LiteralPath $progressPath -Value $line -Encoding UTF8
    Write-Host $line
}

# --- Khoá một tiến trình: hai phiên chạy song song sẽ tranh nhau cổng và CSDL ---
$lockPath = Join-Path $logsRoot 'matrix.lock'
if (Test-Path $lockPath) {
    $lockPid = (Get-Content -LiteralPath $lockPath -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($lockPid -and (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) {
        throw "Đã có phiên chạy ma trận (PID $lockPid). Dừng nó trước hoặc xoá $lockPath nếu chắc chắn nó đã chết."
    }
}
Set-Content -LiteralPath $lockPath -Value $PID -Encoding ASCII

try {
    if (-not (Test-Path $PlanFile)) { throw "Không thấy tệp kế hoạch: $PlanFile" }
    # ConvertFrom-Json trả về MỘT mảng cho cả tệp; ForEach-Object để bung ra từng
    # phần tử, nếu không $plan[0] sẽ là Object[] thay vì một run.
    $plan = @(Get-Content -LiteralPath $PlanFile -Raw -Encoding UTF8 | ConvertFrom-Json | ForEach-Object { $_ })
    if ($plan.Count -eq 0) { throw "Tệp kế hoạch rỗng: $PlanFile" }

    $index = 0
    if ($From) {
        $found = $false
        for ($i = 0; $i -lt $plan.Count; $i++) {
            if ($plan[$i].runId -eq $From) { $index = $i; $found = $true; break }
        }
        if (-not $found) { throw "Không thấy run '$From' trong kế hoạch." }
    }

    $queue = @($plan[$index..($plan.Count - 1)])
    Write-Progress-Line ("PLAN  {0} run trong kế hoạch, bắt đầu từ '{1}' — còn {2} run" -f
        $plan.Count, $queue[0].runId, $queue.Count)

    $done = 0; $skipped = 0; $failed = 0
    $watchAll = [System.Diagnostics.Stopwatch]::StartNew()

    foreach ($spec in $queue) {
        $runDir = Join-Path $logsRoot $spec.runId
        $metaPath = Join-Path $runDir 'meta.json'

        if ((Test-Path $metaPath) -and -not $Force) {
            Write-Progress-Line ("SKIP  {0} (đã có meta.json)" -f $spec.runId)
            $skipped++
            continue
        }
        if ($DryRun) {
            Write-Progress-Line ("WOULD {0} | {1} | {2} | {3}" -f $spec.runId, $spec.experiment, $spec.profile, $spec.variant)
            continue
        }

        New-Item -ItemType Directory -Path $runDir -Force | Out-Null
        $runLog = Join-Path $runDir 'harness.txt'
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        Write-Progress-Line ("START {0} | {1} | {2} | {3} | lặp {4}" -f
            $spec.runId, $spec.experiment, $spec.profile, $spec.variant, $spec.repeat)

        $params = @{
            RunId      = $spec.runId
            Experiment = $spec.experiment
            Profile    = $spec.profile
            Variant    = $spec.variant
            Repeat     = $spec.repeat
        }
        if (($spec.PSObject.Properties.Name -contains 'targetRate') -and $spec.targetRate -gt 0) {
            $params['TargetRate'] = [int]$spec.targetRate
        }
        if (($spec.PSObject.Properties.Name -contains 'note') -and $spec.note) {
            $params['Note'] = [string]$spec.note
        }
        # E5: kịch bản tiêm lỗi (đường dẫn tương đối so với scripts\research,
        # ví dụ "faults\F1.ps1"). Cùng một tệp nhận -Phase apply|revert.
        if (($spec.PSObject.Properties.Name -contains 'fault') -and $spec.fault) {
            $faultScript = Join-Path $PSScriptRoot ([string]$spec.fault)
            if (-not (Test-Path $faultScript)) { throw "Không thấy script tiêm lỗi: $faultScript" }
            $params['FaultApply'] = $faultScript
            $params['FaultRevert'] = $faultScript
        }

        try {
            & $harness @params *>&1 | Tee-Object -FilePath $runLog | Out-Null
        } catch {
            $_ | Out-String | Add-Content -LiteralPath $runLog -Encoding UTF8
        }
        $watch.Stop()
        $elapsed = [math]::Round($watch.Elapsed.TotalSeconds, 0)

        # Harness không trả mã thoát riêng; dấu hiệu hoàn tất là meta.json.
        # k6 mã 99 = có ngưỡng bị vượt, vẫn dùng được số liệu.
        if (Test-Path $metaPath) {
            $k6Exit = (Get-Content -LiteralPath $metaPath -Raw | ConvertFrom-Json).k6ExitCode
            Write-Progress-Line ("DONE  {0} sau {1} s | k6Exit={2}" -f $spec.runId, $elapsed, $k6Exit)
            $done++
        } else {
            Write-Progress-Line ("FAIL  {0} sau {1} s (không thấy meta.json) — xem {2}" -f $spec.runId, $elapsed, $runLog)
            $failed++
        }
    }

    $watchAll.Stop()
    Write-Progress-Line ("END   xong={0} bỏ_qua={1} lỗi={2} tổng={3} phút" -f
        $done, $skipped, $failed, [math]::Round($watchAll.Elapsed.TotalMinutes, 1))
}
finally {
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue

    # Để lại hệ thống ở trạng thái quen thuộc: transport http, RUN_ID adhoc.
    if (-not $NoRestore -and -not $DryRun) {
        try {
            $env:RUN_ID = 'adhoc'
            $env:SERVICE_CLIENT_MODE = 'http'
            docker compose -f docker-compose.yml -f docker-compose.research.yml up -d --no-deps --force-recreate order-service 2>&1 | Out-Null
            Remove-Item Env:\RUN_ID, Env:\SERVICE_CLIENT_MODE -ErrorAction SilentlyContinue
            Write-Progress-Line 'RESTORE order-service về RUN_ID=adhoc, mode=http'
        } catch {
            Write-Progress-Line ("RESTORE lỗi: {0}" -f $_.Exception.Message)
        }
    }
}
