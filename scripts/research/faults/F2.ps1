# =============================================================================
# F2 — DỪNG DỊCH VỤ PHỤ TRỢ (§8.1): promotion-service
#
# promotion-service CÓ nằm trên đường tới hạn của W2: order-service gọi
# POST /api/v1/promotions/flash-sales/apply khi tạo đơn. Bán kính ảnh hưởng
# theo Eq. (6) là 1 hop; câu hỏi thực nghiệm là order-service có chịu được
# lỗi này (bỏ qua khuyến mãi) hay làm hỏng cả đơn.
# =============================================================================
param(
    [Parameter(Mandatory = $true)][string]$RunDir,
    [ValidateSet('apply', 'revert')][string]$Phase = 'apply'
)
& (Join-Path $PSScriptRoot 'stop-service.ps1') -RunDir $RunDir -Phase $Phase `
    -Service 'mythfood-promotion-service' -Label 'F2'
