# =============================================================================
# F3 — DỪNG DỊCH VỤ THÔNG BÁO (§8.1): notification-service
#
# notification-service được gọi sau khi đơn đã ghi xong. Dự đoán: bán kính ảnh
# hưởng bằng 0 với tỉ lệ đơn hoàn tất, nhưng có thể tăng độ trễ nếu order-service
# chờ (await) lời gọi này — chính là điều cần đo ở cột độ trễ.
# =============================================================================
param(
    [Parameter(Mandatory = $true)][string]$RunDir,
    [ValidateSet('apply', 'revert')][string]$Phase = 'apply'
)
& (Join-Path $PSScriptRoot 'stop-service.ps1') -RunDir $RunDir -Phase $Phase `
    -Service 'mythfood-notification-service' -Label 'F3'
