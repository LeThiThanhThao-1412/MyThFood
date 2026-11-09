# Báo cáo thí nghiệm IMAGE MATCHING (ảnh chuẩn ↔ ảnh khách chụp)

- Thời điểm chạy: 2026-11-07T13:53:48.240Z
- Chế độ: live (gọi model vision)
- Model đọc ảnh: glm-4.6v-flashx
- Prompt: **có danh sách món đã đặt** (`orderItemId` ⇒ code khớp theo mã, không đoán tên)
- Ngưỡng quyết định: duyệt khi khớp ≤ 85 %, bác khi khớp ≥ 100 % (còn lại → người xử lý)
- Tổng mẫu: 58 · đo được: 58 · loại khỏi chỉ số: 0

> Điểm "khớp" là **phép đếm phần** (Σ phần khớp ÷ Σ phần đặt), không phải độ giống ảnh.
> Tập `synthetic` và `real` báo cáo RIÊNG, không lấy trung bình gộp.

## 1. Chỉ số tổng hợp

| Tập       | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| --------- | --- | --------- | ------------- | -------- | ------------ | ------ |
| Tất cả    | 58  | 49        | 72.4%         | 0.045    | 0.0%         | 8.7%   |
| synthetic | 58  | 49        | 72.4%         | 0.045    | 0.0%         | 8.7%   |

## 2. Theo loại khiếm khuyết

| Loại     | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| -------- | --- | --------- | ------------- | -------- | ------------ | ------ |
| MISSING  | 46  | 37        | 65.2%         | 0.059    | —            | 8.7%   |
| COMPLETE | 12  | 12        | 100.0%        | 0.000    | 0.0%         | —      |

## 3. Quyết định tự động

| Quyết định   | Số mẫu |
| ------------ | ------ |
| AUTO_APPROVE | 26     |
| AUTO_REJECT  | 16     |
| NEEDS_REVIEW | 16     |

## 4. Mẫu lệch nhãn vàng (16)

| Mẫu                                   | Nhãn vàng | Dự đoán | Điểm | Kỳ vọng | Quyết định   | Ghi chú |
| ------------------------------------- | --------- | ------- | ---- | ------- | ------------ | ------- |
| MIS-combo1-thieu1ga1mi                | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo2-thieu1nuoc1khoai           | MISSING   | UNCLEAR | —    | 33%     | NEEDS_REVIEW |
| MIS-combo3-thieu1banhtrangtron        | MISSING   | UNCLEAR | —    | 75%     | NEEDS_REVIEW |
| MIS-combo3-thieu1banhtrangtron1trasua | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo3-thieu1cavien1trasua        | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo4-thieu1bunla                | MISSING   | MATCH   | 100% | 88%     | AUTO_REJECT  |
| MIS-combo4-thieu1chacom1nemchuaran    | MISSING   | MATCH   | 100% | 75%     | AUTO_REJECT  |
| MIS-combo4-thieu1dauhuchien           | MISSING   | MATCH   | 100% | 88%     | AUTO_REJECT  |
| MIS-combo4-thieu1longdoi1rau          | MISSING   | UNCLEAR | —    | 75%     | NEEDS_REVIEW |
| MIS-combo4-thieu1thitluoc             | MISSING   | MATCH   | 100% | 88%     | AUTO_REJECT  |
| MIS-combo5-thieu1trungopla1nuoc       | MISSING   | EXTRA   | 60%  | 60%     | NEEDS_REVIEW |
| MIS-combo6-thieu1chethapcam           | MISSING   | EXTRA   | 80%  | 80%     | NEEDS_REVIEW |
| MIS-combo6-thieu1chethapcam1tradau    | MISSING   | UNCLEAR | —    | 60%     | NEEDS_REVIEW |
| MIS-combo6-thieu1diatraicay           | MISSING   | UNCLEAR | —    | 80%     | NEEDS_REVIEW |
| MIS-combo6-thieu1diatraicay1tradau    | MISSING   | UNCLEAR | —    | 60%     | NEEDS_REVIEW |
| MIS-combo6-thieu1tradau               | MISSING   | EXTRA   | 60%  | 80%     | NEEDS_REVIEW |

## 5. Cách đọc báo cáo

- **Báo động sai** = ảnh đủ món nhưng kết luận thiếu/sai ⇒ hoàn tiền oan. Đây là chỉ số đắt nhất.
- **Bỏ sót** = ảnh thiếu món nhưng kết luận đủ ⇒ khách mất quyền lợi.
- **MAE điểm** = sai số % trung bình; > 0.15 nghĩa là model đếm sai số phần đáng kể.
- **Loại khỏi chỉ số** = provider bỏ ảnh / gọi model lỗi. Đừng đọc thành "model đếm kém".
- Nếu một combo lệch nhiều: kiểm tra ảnh CHUẨN của combo đó (ảnh catalog vs ảnh chụp thật) trước khi kết luận về model.

Chạy `npm run ai:eval:rescore` để quét ngưỡng trên report này mà **không** gọi lại model (report `.json` đã lưu kiểm kê từng ảnh).
