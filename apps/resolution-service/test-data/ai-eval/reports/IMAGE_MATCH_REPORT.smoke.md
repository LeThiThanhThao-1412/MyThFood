# Báo cáo thí nghiệm IMAGE MATCHING (ảnh chuẩn ↔ ảnh khách chụp)

- Thời điểm chạy: 2026-11-07T11:51:00.358Z
- Chế độ: live (gọi model vision)
- Model đọc ảnh: glm-4.5-flash
- Ngưỡng quyết định: duyệt khi khớp ≤ 85 %, bác khi khớp ≥ 100 % (còn lại → người xử lý)
- Tổng mẫu: 2 · đo được: 0 · loại khỏi chỉ số: 2
  > ⚠ 2 mẫu bị loại vì **provider không gửi được ảnh** (hết quota/quá tải/tắt vision) hoặc lỗi gọi model. Chúng **không** phải bằng chứng về khả năng đếm món — xem mục 4.

> Điểm "khớp" là **phép đếm phần** (Σ phần khớp ÷ Σ phần đặt), không phải độ giống ảnh.
> Tập `synthetic` và `real` báo cáo RIÊNG, không lấy trung bình gộp.

## 1. Chỉ số tổng hợp

| Tập    | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| ------ | --- | --------- | ------------- | -------- | ------------ | ------ |
| Tất cả | 0   | 0         | —             | —        | —            | —      |

## 2. Theo loại khiếm khuyết

| Loại | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| ---- | --- | --------- | ------------- | -------- | ------------ | ------ |

## 3. Quyết định tự động

| Quyết định   | Số mẫu |
| ------------ | ------ |
| AUTO_APPROVE | 0      |
| AUTO_REJECT  | 0      |
| NEEDS_REVIEW | 0      |

## 4. Mẫu bị loại khỏi chỉ số (2)

Không phải bằng chứng về khả năng đếm món của model — sửa hạ tầng rồi chạy lại.

| Mẫu                       | Ảnh gửi/đọc được | Lý do                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIS-combo1-thieu1ga       | 2/0              | VISION_OVERLOADED — Provider bỏ 2/2 ảnh (VISION_OVERLOADED: 429/1113 Tài khoản GLM không có gói/quota cho model "glm-4.5v" (1113): 余额不足或无可用资源包,请充值。 Model free đang dùng được: "glm-4.5-flash" (chữ) và "glm-4.6v-flash" (ảnh).) ⇒ mẫu không phải phép đo khả năng đếm món |
| MIS-combo1-thieu1ga1khoai | 2/0              | VISION_OVERLOADED — Provider bỏ 2/2 ảnh (VISION_OVERLOADED: 429/1113 Tài khoản GLM không có gói/quota cho model "glm-4.5v" (1113): 余额不足或无可用资源包,请充值。 Model free đang dùng được: "glm-4.5-flash" (chữ) và "glm-4.6v-flash" (ảnh).) ⇒ mẫu không phải phép đo khả năng đếm món |

## 5. Cách đọc báo cáo

- **Báo động sai** = ảnh đủ món nhưng kết luận thiếu/sai ⇒ hoàn tiền oan. Đây là chỉ số đắt nhất.
- **Bỏ sót** = ảnh thiếu món nhưng kết luận đủ ⇒ khách mất quyền lợi.
- **MAE điểm** = sai số % trung bình; > 0.15 nghĩa là model đếm sai số phần đáng kể.
- **Loại khỏi chỉ số** = provider bỏ ảnh / gọi model lỗi. Đừng đọc thành "model đếm kém".
- Nếu một combo lệch nhiều: kiểm tra ảnh CHUẨN của combo đó (ảnh catalog vs ảnh chụp thật) trước khi kết luận về model.

Chạy `npm run ai:eval:rescore` để quét ngưỡng trên report này mà **không** gọi lại model (report `.json` đã lưu kiểm kê từng ảnh).
