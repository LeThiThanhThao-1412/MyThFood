# =============================================================================
# F4 — DỪNG DỊCH VỤ TỚI HẠN (§8.1): inventory-service
#
# inventory-service nằm trên đường tới hạn: nếu không giữ được tồn kho thì đơn
# không thể tạo — dự đoán tỉ lệ đơn hoàn tất ở giai đoạn lỗi gần 0. Đây là mốc
# so sánh cho thấy bán kính ảnh hưởng phân biệt được dịch vụ tới hạn với dịch vụ
# không tới hạn, đúng như Eq. (6) khẳng định.
# =============================================================================
param(
    [Parameter(Mandatory = $true)][string]$RunDir,
    [ValidateSet('apply', 'revert')][string]$Phase = 'apply'
)
& (Join-Path $PSScriptRoot 'stop-service.ps1') -RunDir $RunDir -Phase $Phase `
    -Service 'mythfood-inventory-service' -Label 'F4'
