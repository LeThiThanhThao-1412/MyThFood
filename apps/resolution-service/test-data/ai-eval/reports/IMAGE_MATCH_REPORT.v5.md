# Báo cáo thí nghiệm IMAGE MATCHING (ảnh chuẩn ↔ ảnh khách chụp)

- Thời điểm chạy: 2026-11-07T18:16:05.018Z
- Chế độ: live (gọi model vision)
- Model đọc ảnh: glm-4.6v-flash
- Prompt: **có danh sách món đã đặt** (`orderItemId` ⇒ code khớp theo mã, không đoán tên)
- Ngưỡng quyết định: duyệt khi khớp ≤ 80 %, bác khi khớp ≥ 100 % (còn lại → người xử lý)
- Tổng mẫu: 58 · đo được: 58 · loại khỏi chỉ số: 0

> Điểm "khớp" là **phép đếm phần** (Σ phần khớp ÷ Σ phần đặt), không phải độ giống ảnh.
> Tập `synthetic` và `real` báo cáo RIÊNG, không lấy trung bình gộp.

## 1. Chỉ số tổng hợp

| Tập       | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| --------- | --- | --------- | ------------- | -------- | ------------ | ------ |
| Tất cả    | 58  | 52        | 87.9%         | 0.019    | 0.0%         | 2.2%   |
| synthetic | 58  | 52        | 87.9%         | 0.019    | 0.0%         | 2.2%   |

## 2. Theo loại khiếm khuyết

| Loại     | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| -------- | --- | --------- | ------------- | -------- | ------------ | ------ |
| MISSING  | 46  | 40        | 84.8%         | 0.025    | —            | 2.2%   |
| COMPLETE | 12  | 12        | 100.0%        | 0.000    | 0.0%         | —      |

## 3. Quyết định tự động

| Quyết định   | Số mẫu |
| ------------ | ------ |
| AUTO_APPROVE | 32     |
| AUTO_REJECT  | 10     |
| NEEDS_REVIEW | 16     |

## 4. Mẫu lệch nhãn vàng (7)

| Mẫu                                   | Nhãn vàng | Dự đoán | Điểm | Kỳ vọng | Quyết định   | Ghi chú |
| ------------------------------------- | --------- | ------- | ---- | ------- | ------------ | ------- |
| MIS-combo3-thieu1banhtrangtron        | MISSING   | UNCLEAR | —    | 75%     | NEEDS_REVIEW |
| MIS-combo3-thieu1banhtrangtron1trasua | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo3-thieu1cavien1trasua        | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo4-thieu1bunla1longdoi        | MISSING   | UNCLEAR | —    | 75%     | NEEDS_REVIEW |
| MIS-combo4-thieu1dauhuchien           | MISSING   | MATCH   | 100% | 88%     | NEEDS_REVIEW |
| MIS-combo6-thieu1diatraicay           | MISSING   | UNCLEAR | —    | 80%     | NEEDS_REVIEW |
| MIS-combo6-thieu1diatraicay1tradau    | MISSING   | UNCLEAR | —    | 60%     | NEEDS_REVIEW |

## 5. Cách đọc báo cáo

- **Báo động sai** = ảnh đủ món nhưng kết luận thiếu/sai ⇒ hoàn tiền oan. Đây là chỉ số đắt nhất.
- **Bỏ sót** = ảnh thiếu món nhưng kết luận đủ ⇒ khách mất quyền lợi.
- **MAE điểm** = sai số % trung bình; > 0.15 nghĩa là model đếm sai số phần đáng kể.
- **Loại khỏi chỉ số** = provider bỏ ảnh / gọi model lỗi. Đừng đọc thành "model đếm kém".
- Nếu một combo lệch nhiều: kiểm tra ảnh CHUẨN của combo đó (ảnh catalog vs ảnh chụp thật) trước khi kết luận về model.

Chạy `npm run ai:eval:rescore` để quét ngưỡng trên report này mà **không** gọi lại model (report `.json` đã lưu kiểm kê từng ảnh).
