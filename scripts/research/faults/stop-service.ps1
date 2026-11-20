# =============================================================================
# DÙNG CHUNG CHO F1–F4: dừng / khởi động lại MỘT dịch vụ (§8.2 bước 2 và 4)
#
# Luôn chờ dịch vụ healthy trở lại sau khi start (tối đa 90 s) để run kế tiếp
# không bị ảnh hưởng — cổng 1 của §2.2 sẽ chặn nếu còn thiếu dịch vụ healthy.
#
# Harness gọi:  & stop-service.ps1 -RunDir <logs\<RunId>> -Phase apply|revert
#               (qua các tệp F1.ps1 … F4.ps1, mỗi tệp ghim một dịch vụ)
# =============================================================================
param(
    [Parameter(Mandatory = $true)][string]$RunDir,
    [ValidateSet('apply', 'revert')][string]$Phase = 'apply',
    [Parameter(Mandatory = $true)][string]$Service,
    [string]$Label = 'F?'
)

$ErrorActionPreference = 'Continue'
$log = Join-Path $RunDir 'fault-log.txt'
$timestamp = (Get-Date).ToUniversalTime().ToString('o')

if ($Phase -eq 'apply') {
    docker stop $Service 2>&1 | Out-Null
    $exit = $LASTEXITCODE
    "{0} {1} apply  docker stop {2} -> exit {3}" -f $timestamp, $Label, $Service, $exit |
        Add-Content -LiteralPath $log -Encoding UTF8
}
else {
    docker start $Service 2>&1 | Out-Null
    $exit = $LASTEXITCODE
    $healthy = $false
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        $state = (docker inspect --format '{{.State.Health.Status}}' $Service 2>$null | Out-String).Trim()
        if ($state -eq 'healthy') { $healthy = $true; break }
    }
    "{0} {1} revert docker start {2} -> exit {3}, healthy={4}" -f $timestamp, $Label, $Service, $exit, $healthy |
        Add-Content -LiteralPath $log -Encoding UTF8
}
