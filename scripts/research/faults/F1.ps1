# =============================================================================
# F1 — DỪNG DỊCH VỤ KHÔNG TỚI HẠN (§8.1): review-service
#
# review-service không nằm trên đường tới hạn của luồng đặt đơn, nên dự đoán của
# Eq. (6) là bán kính ảnh hưởng ~0: tỉ lệ đơn hoàn tất ở giai đoạn lỗi phải
# giữ nguyên so với baseline. Nếu tụt, đó là bằng chứng NGƯỢC lại mô hình và
# phải ghi vào nhật ký, không được bỏ qua.
# =============================================================================
param(
    [Parameter(Mandatory = $true)][string]$RunDir,
    [ValidateSet('apply', 'revert')][string]$Phase = 'apply'
)
& (Join-Path $PSScriptRoot 'stop-service.ps1') -RunDir $RunDir -Phase $Phase `
    -Service 'mythfood-review-service' -Label 'F1'
