# Quét ngưỡng quyết định IMAGE MATCHING (tái chấm, 0 gọi model)

- Report nguồn: `D:\MyThFood\mythfood\apps\resolution-service\test-data\ai-eval\reports\IMAGE_MATCH_REPORT.v5.json`
- Report tạo lúc: 2026-11-07T18:16:05.020Z · chế độ: live · model: glm-4.6v-flash
- Ngưỡng gốc của report: duyệt ≤ 80.0% / bác ≥ 100.0%
- Số mẫu chấm lại: 58 · trần bác cố định 100.0%
- Nguồn dự đoán: chấm lại từ `label` 58 · từ điểm đã lưu 0

## 1. Bảng ngưỡng

| Duyệt khi ≤ | Bác khi ≥ | Duyệt tự động | Bác tự động | Chuyển người | % tự quyết | Hoàn tiền oan | Bỏ sót tiền | Đúng kết luận | MAE điểm |
| ----------- | --------- | ------------- | ----------- | ------------ | ---------- | ------------- | ----------- | ------------- | -------- |
| 80.0%       | 100.0%    | 32            | 10          | 16           | 72.4%      | 0             | 0           | 87.9%         | 0.0192   |
| 85.0%       | 100.0%    | 32            | 10          | 16           | 72.4%      | 0             | 0           | 87.9%         | 0.0192   |
| 75.0%       | 100.0%    | 27            | 10          | 21           | 63.8%      | 0             | 0           | 87.9%         | 0.0192   |
| 70.0%       | 100.0%    | 19            | 10          | 29           | 50.0%      | 0             | 0           | 87.9%         | 0.0192   |

> **Hoàn tiền oan** = ảnh đủ món mà máy tự duyệt hoàn tiền. **Bỏ sót tiền** = ảnh thiếu/sai món mà máy tự bác.
> Cột _% tự quyết_ mới là chỉ số vận hành: ngưỡng chặt tới mức 0 ca oan nhưng cũng 0 ca được duyệt là vô dụng.
> `Đúng kết luận` và `MAE điểm` KHÔNG phụ thuộc ngưỡng (chúng so nhãn vàng với điểm, không so quyết định).

## 2. Ca đổi quyết định so với ngưỡng gốc

| Duyệt khi ≤ | Mẫu                                | Nhãn vàng | Điểm | Quyết định gốc | Quyết định mới |
| ----------- | ---------------------------------- | --------- | ---- | -------------- | -------------- |
| 75.0%       | MIS-combo5-thieu1suon              | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 75.0%       | MIS-combo5-thieu1sup               | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 75.0%       | MIS-combo5-thieu1trungopla         | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 75.0%       | MIS-combo6-thieu1chethapcam        | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 75.0%       | MIS-combo6-thieu1tradau            | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo1-thieu1ga                | MISSING   | 75%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo1-thieu1khoai             | MISSING   | 75%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo1-thieu1mi                | MISSING   | 75%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo1-thieu1nuoc              | MISSING   | 75%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo3-thieu1cavien            | MISSING   | 75%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo3-thieu1trasua            | MISSING   | 75%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo4-thieu1chacom1nemchuaran | MISSING   | 75%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo4-thieu1nemchuaran1rau    | MISSING   | 75%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo5-thieu1suon              | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo5-thieu1sup               | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo5-thieu1trungopla         | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo6-thieu1chethapcam        | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |
| 70.0%       | MIS-combo6-thieu1tradau            | MISSING   | 80%  | AUTO_APPROVE   | NEEDS_REVIEW   |

## 4. Cách đọc & tự kiểm

- ✔ Tự kiểm: ở ngưỡng gốc, phân bố quyết định TRÙNG §3 của report gốc.
- Đổi ngưỡng thành quyết định sản phẩm: sửa `DEFAULT_IMAGE_MATCH_POLICY` (image-match.ts), không sửa prompt.
