# Báo cáo thí nghiệm IMAGE MATCHING (ảnh chuẩn ↔ ảnh khách chụp)

- Thời điểm chạy: 2026-11-07T13:07:29.618Z
- Chế độ: live (gọi model vision)
- Model đọc ảnh: glm-4.6v-flashx
- Ngưỡng quyết định: duyệt khi khớp ≤ 85 %, bác khi khớp ≥ 100 % (còn lại → người xử lý)
- Tổng mẫu: 58 · đo được: 57 · loại khỏi chỉ số: 1
  > ⚠ 1 mẫu bị loại vì **provider không gửi được ảnh** (hết quota/quá tải/tắt vision) hoặc lỗi gọi model. Chúng **không** phải bằng chứng về khả năng đếm món — xem mục 4.

> Điểm "khớp" là **phép đếm phần** (Σ phần khớp ÷ Σ phần đặt), không phải độ giống ảnh.
> Tập `synthetic` và `real` báo cáo RIÊNG, không lấy trung bình gộp.

## 1. Chỉ số tổng hợp

| Tập       | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| --------- | --- | --------- | ------------- | -------- | ------------ | ------ |
| Tất cả    | 57  | 38        | 22.8%         | 0.334    | 66.7%        | 0.0%   |
| synthetic | 57  | 38        | 22.8%         | 0.334    | 66.7%        | 0.0%   |

## 2. Theo loại khiếm khuyết

| Loại     | Mẫu | Chấm được | Đúng kết luận | MAE điểm | Báo động sai | Bỏ sót |
| -------- | --- | --------- | ------------- | -------- | ------------ | ------ |
| MISSING  | 45  | 26        | 20.0%         | 0.272    | —            | 0.0%   |
| COMPLETE | 12  | 12        | 33.3%         | 0.469    | 66.7%        | —      |

## 3. Quyết định tự động

| Quyết định   | Số mẫu |
| ------------ | ------ |
| AUTO_APPROVE | 9      |
| AUTO_REJECT  | 4      |
| NEEDS_REVIEW | 44     |

## 4. Mẫu lệch nhãn vàng (44)

| Mẫu                                   | Nhãn vàng | Dự đoán | Điểm | Kỳ vọng | Quyết định   | Ghi chú                                                                   |
| ------------------------------------- | --------- | ------- | ---- | ------- | ------------ | ------------------------------------------------------------------------- |
| MIS-combo1-thieu1ga1khoai             | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo1-thieu1ga1mi                | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo1-thieu1ga1nuoc              | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo1-thieu1mi1khoai             | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo1-thieu1mi1nuoc              | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo1-thieu1nuoc1khoai           | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo2-thieu1khoai                | MISSING   | UNCLEAR | —    | 67%     | NEEDS_REVIEW |
| MIS-combo2-thieu1nuoc                 | MISSING   | UNCLEAR | —    | 67%     | NEEDS_REVIEW |
| MIS-combo2-thieu1nuoc1khoai           | MISSING   | UNCLEAR | —    | 33%     | NEEDS_REVIEW |
| MIS-combo3-thieu1banhtrangtron        | MISSING   | UNCLEAR | —    | 75%     | NEEDS_REVIEW |
| MIS-combo3-thieu1banhtrangtron1trasua | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo3-thieu1cavien               | MISSING   | UNCLEAR | —    | 75%     | NEEDS_REVIEW |
| MIS-combo3-thieu1cavien1trasua        | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| MIS-combo3-thieu1trasua               | MISSING   | EXTRA   | 50%  | 75%     | NEEDS_REVIEW |
| MIS-combo3-thieu2trasua               | MISSING   | UNCLEAR | —    | 50%     | NEEDS_REVIEW |
| COM-combo3-du-nghieng                 | MATCH     | EXTRA   | 25%  | 100%    | NEEDS_REVIEW | Đối chứng âm: đủ món nhưng khác cách chụp (nghieng) — phải kết luận MATCH |
| COM-combo3-du-toi                     | MATCH     | EXTRA   | 25%  | 100%    | NEEDS_REVIEW | Đối chứng âm: đủ món nhưng khác cách chụp (toi) — phải kết luận MATCH     |
| MIS-combo4-thieu1bunla                | MISSING   | UNCLEAR | —    | 88%     | NEEDS_REVIEW |
| MIS-combo4-thieu1chacom               | MISSING   | EXTRA   | 25%  | 88%     | NEEDS_REVIEW |
| MIS-combo4-thieu1chacom1nemchuaran    | MISSING   | EXTRA   | 50%  | 75%     | NEEDS_REVIEW |
| MIS-combo4-thieu1dauhuchien           | MISSING   | EXTRA   | 38%  | 88%     | NEEDS_REVIEW |
| MIS-combo4-thieu1longdoi              | MISSING   | EXTRA   | 63%  | 88%     | NEEDS_REVIEW |
| MIS-combo4-thieu1longdoi1rau          | MISSING   | EXTRA   | 38%  | 75%     | NEEDS_REVIEW |
| MIS-combo4-thieu1mamtom               | MISSING   | EXTRA   | 63%  | 88%     | NEEDS_REVIEW |
| MIS-combo4-thieu1nemchuaran           | MISSING   | EXTRA   | 63%  | 88%     | NEEDS_REVIEW |
| MIS-combo4-thieu1nemchuaran1rau       | MISSING   | EXTRA   | 38%  | 75%     | NEEDS_REVIEW |
| MIS-combo4-thieu1rau                  | MISSING   | EXTRA   | 38%  | 88%     | NEEDS_REVIEW |
| MIS-combo4-thieu1thitluoc             | MISSING   | EXTRA   | 63%  | 88%     | NEEDS_REVIEW |
| COM-combo4-du-nghieng                 | MATCH     | EXTRA   | 50%  | 100%    | NEEDS_REVIEW | Đối chứng âm: đủ món nhưng khác cách chụp (nghieng) — phải kết luận MATCH |
| COM-combo4-du-toi                     | MATCH     | EXTRA   | 38%  | 100%    | NEEDS_REVIEW | Đối chứng âm: đủ món nhưng khác cách chụp (toi) — phải kết luận MATCH     |
| MIS-combo5-thieu1suon                 | MISSING   | UNCLEAR | —    | 80%     | NEEDS_REVIEW |
| MIS-combo5-thieu1suon1trada           | MISSING   | EXTRA   | 40%  | 60%     | NEEDS_REVIEW |
| MIS-combo5-thieu1sup                  | MISSING   | EXTRA   | 60%  | 80%     | NEEDS_REVIEW |
| MIS-combo5-thieu1trungopla            | MISSING   | EXTRA   | 40%  | 80%     | NEEDS_REVIEW |
| COM-combo5-du-nghieng                 | MATCH     | EXTRA   | 40%  | 100%    | NEEDS_REVIEW | Đối chứng âm: đủ món nhưng khác cách chụp (nghieng) — phải kết luận MATCH |
| COM-combo5-du-toi                     | MATCH     | EXTRA   | 20%  | 100%    | NEEDS_REVIEW | Đối chứng âm: đủ món nhưng khác cách chụp (toi) — phải kết luận MATCH     |
| MIS-combo6-thieu1chethapcam           | MISSING   | UNCLEAR | —    | 80%     | NEEDS_REVIEW |
| MIS-combo6-thieu1chethapcam1tradau    | MISSING   | EXTRA   | 20%  | 60%     | NEEDS_REVIEW |
| MIS-combo6-thieu1diatraicay           | MISSING   | UNCLEAR | —    | 80%     | NEEDS_REVIEW |
| MIS-combo6-thieu1diatraicay1tradau    | MISSING   | UNCLEAR | —    | 60%     | NEEDS_REVIEW |
| MIS-combo6-thieu1tradau               | MISSING   | EXTRA   | 20%  | 80%     | NEEDS_REVIEW |
| MIS-combo6-thieu2tradau               | MISSING   | EXTRA   | 20%  | 60%     | NEEDS_REVIEW |
| COM-combo6-du-nghieng                 | MATCH     | EXTRA   | 20%  | 100%    | NEEDS_REVIEW | Đối chứng âm: đủ món nhưng khác cách chụp (nghieng) — phải kết luận MATCH |
| COM-combo6-du-toi                     | MATCH     | EXTRA   | 20%  | 100%    | NEEDS_REVIEW | Đối chứng âm: đủ món nhưng khác cách chụp (toi) — phải kết luận MATCH     |

## 4. Mẫu bị loại khỏi chỉ số (1)

Không phải bằng chứng về khả năng đếm món của model — sửa hạ tầng rồi chạy lại.

| Mẫu                             | Ảnh gửi / đọc được | Lý do                                                                                                                                                                                                                                                              |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MIS-combo5-thieu1trungopla1nuoc | gửi 2 / đọc 0      | VISION_ERROR — Provider bỏ 2/2 ảnh (VISION_ERROR: lỗi GLM "glm-4.6v-flashx" trả về nội dung không phải JSON hợp lệ (finish_reason=length, 12075 ký tự). Đoạn đầu: { "items": [ { "name": "cơm", "quantity": 1 }, { "na…) ⇒ mẫu không phải phép đo khả năng đếm món |

## 5. Cách đọc báo cáo

- **Báo động sai** = ảnh đủ món nhưng kết luận thiếu/sai ⇒ hoàn tiền oan. Đây là chỉ số đắt nhất.
- **Bỏ sót** = ảnh thiếu món nhưng kết luận đủ ⇒ khách mất quyền lợi.
- **MAE điểm** = sai số % trung bình; > 0.15 nghĩa là model đếm sai số phần đáng kể.
- **Loại khỏi chỉ số** = provider bỏ ảnh / gọi model lỗi. Đừng đọc thành "model đếm kém".
- Nếu một combo lệch nhiều: kiểm tra ảnh CHUẨN của combo đó (ảnh catalog vs ảnh chụp thật) trước khi kết luận về model.

Chạy `npm run ai:eval:rescore` để quét ngưỡng trên report này mà **không** gọi lại model (report `.json` đã lưu kiểm kê từng ảnh).
