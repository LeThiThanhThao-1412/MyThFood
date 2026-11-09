# Báo cáo thí nghiệm IMAGE MATCHING (ảnh chuẩn ↔ ảnh khách chụp)

- Thời điểm chạy: 2026-11-07T18:24:06.248Z
- Chế độ: **dry-run** (nhãn vàng tự dựng, KHÔNG gọi mạng)
- Model đọc ảnh: dry-run (không gọi mạng)
- Prompt: kiểm kê **mù** (không cho model xem danh sách món; code tự khớp tên)
- Ngưỡng quyết định: duyệt khi khớp ≤ 80 %, bác khi khớp ≥ 100 % (còn lại → người xử lý)
- Tổng mẫu: 58 · đo được: 58 · loại khỏi chỉ số: 0

> Điểm "khớp" là **phép đếm phần** (Σ phần khớp ÷ Σ phần đặt), không phải độ giống ảnh.
> Tập `synthetic` và `real` báo cáo RIÊNG, không lấy trung bình gộp.

## 1. Chỉ số tổng hợp

| Tập       | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| --------- | --- | --------- | ------------- | -------- | ------------ | ------ |
| Tất cả    | 58  | 58        | 100.0%        | 0.000    | 0.0%         | 0.0%   |
| synthetic | 58  | 58        | 100.0%        | 0.000    | 0.0%         | 0.0%   |

## 2. Theo loại khiếm khuyết

| Loại     | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| -------- | --- | --------- | ------------- | -------- | ------------ | ------ |
| MISSING  | 46  | 46        | 100.0%        | 0.000    | —            | 0.0%   |
| COMPLETE | 12  | 12        | 100.0%        | 0.000    | 0.0%         | —      |

## 3. Quyết định tự động

| Quyết định   | Số mẫu |
| ------------ | ------ |
| AUTO_APPROVE | 38     |
| AUTO_REJECT  | 10     |
| NEEDS_REVIEW | 10     |

## 5. Cách đọc báo cáo

- **Báo động sai** = ảnh đủ món nhưng kết luận thiếu/sai ⇒ hoàn tiền oan. Đây là chỉ số đắt nhất.
- **Bỏ sót** = ảnh thiếu món nhưng kết luận đủ ⇒ khách mất quyền lợi.
- **MAE điểm** = sai số % trung bình; > 0.15 nghĩa là model đếm sai số phần đáng kể.
- **Loại khỏi chỉ số** = provider bỏ ảnh / gọi model lỗi. Đừng đọc thành "model đếm kém".
- Nếu một combo lệch nhiều: kiểm tra ảnh CHUẨN của combo đó (ảnh catalog vs ảnh chụp thật) trước khi kết luận về model.

Chạy `npm run ai:eval:rescore` để quét ngưỡng trên report này mà **không** gọi lại model (report `.json` đã lưu kiểm kê từng ảnh).
