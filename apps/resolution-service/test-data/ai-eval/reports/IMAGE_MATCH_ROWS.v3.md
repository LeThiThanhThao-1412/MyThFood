# Từng mẫu — chấm lại bằng code hiện tại (0 gọi model)

- Report nguồn: `D:\MyThFood\mythfood\apps\resolution-service\test-data\ai-eval\reports\IMAGE_MATCH_REPORT.v3.json`
- Ngưỡng dùng để xếp quyết định: duyệt ≤ 85.0% / bác ≥ 100.0%

## 1. Bảng chéo nhãn vàng × kết luận chấm lại

| Nhãn vàng | MATCH | MISSING | EXTRA | UNCLEAR |
| --------- | ----- | ------- | ----- | ------- |
| MISSING   | 0     | 26      | 1     | 19      |
| MATCH     | 12    | 0       | 0     | 0       |

- Số mẫu có quyết định KHÁC report gốc: **0/58** — khác là bình thường sau khi sửa code chấm; chỉ bất thường nếu bạn KHÔNG sửa gì.

## 2. Chi tiết từng mẫu

| Mẫu                                   | Nhãn vàng | Điểm vàng | Chấm lại | Khớp         | Quyết định   | Quyết định (report gốc) | Lý do                                                                                      |
| ------------------------------------- | --------- | --------- | -------- | ------------ | ------------ | ----------------------- | ------------------------------------------------------------------------------------------ |
| MIS-combo1-thieu1ga                   | MISSING   | 75.0%     | MISSING  | 75.0% (3/4)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 3/4 phần (75%) ≤ ngưỡng 85% — thiếu: gà rán x1                                |
| MIS-combo1-thieu1ga1khoai             | MISSING   | 50.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo1-thieu1ga1mi                | MISSING   | 50.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo1-thieu1ga1nuoc              | MISSING   | 50.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo1-thieu1khoai                | MISSING   | 75.0%     | MISSING  | 75.0% (3/4)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 3/4 phần (75%) ≤ ngưỡng 85% — thiếu: khoai tây chiên x1                       |
| MIS-combo1-thieu1mi                   | MISSING   | 75.0%     | MISSING  | 75.0% (3/4)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 3/4 phần (75%) ≤ ngưỡng 85% — thiếu: mì ý x1                                  |
| MIS-combo1-thieu1mi1khoai             | MISSING   | 50.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo1-thieu1mi1nuoc              | MISSING   | 50.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo1-thieu1nuoc                 | MISSING   | 75.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo1-thieu1nuoc1khoai           | MISSING   | 50.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| COM-combo1-du-nghieng                 | MATCH     | 100.0%    | MATCH    | 100.0% (4/4) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 4/4 phần ⇒ không có căn cứ thiếu món                                              |
| COM-combo1-du-toi                     | MATCH     | 100.0%    | MATCH    | 100.0% (4/4) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 4/4 phần ⇒ không có căn cứ thiếu món                                              |
| MIS-combo2-thieu1hambuger             | MISSING   | 66.7%     | MISSING  | 66.7% (2/3)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 2/3 phần (67%) ≤ ngưỡng 85% — thiếu: hamburger bò x1                          |
| MIS-combo2-thieu1hambuger1khoai       | MISSING   | 33.3%     | UNCLEAR  | — (0/3)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo2-thieu1hambuger1nuoc        | MISSING   | 33.3%     | UNCLEAR  | — (0/3)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo2-thieu1khoai                | MISSING   | 66.7%     | UNCLEAR  | — (0/3)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo2-thieu1nuoc                 | MISSING   | 66.7%     | UNCLEAR  | — (0/3)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo2-thieu1nuoc1khoai           | MISSING   | 33.3%     | UNCLEAR  | — (0/3)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| COM-combo2-du-nghieng                 | MATCH     | 100.0%    | MATCH    | 100.0% (3/3) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 3/3 phần ⇒ không có căn cứ thiếu món                                              |
| COM-combo2-du-toi                     | MATCH     | 100.0%    | MATCH    | 100.0% (3/3) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 3/3 phần ⇒ không có căn cứ thiếu món                                              |
| MIS-combo3-thieu1banhtrangtron        | MISSING   | 75.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo3-thieu1banhtrangtron1trasua | MISSING   | 50.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo3-thieu1cavien               | MISSING   | 75.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo3-thieu1cavien1trasua        | MISSING   | 50.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo3-thieu1trasua               | MISSING   | 75.0%     | MISSING  | 75.0% (3/4)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 3/4 phần (75%) ≤ ngưỡng 85% — thiếu: trà sữa x1                               |
| MIS-combo3-thieu2trasua               | MISSING   | 50.0%     | UNCLEAR  | — (0/4)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| COM-combo3-du-nghieng                 | MATCH     | 100.0%    | MATCH    | 100.0% (4/4) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 4/4 phần ⇒ không có căn cứ thiếu món                                              |
| COM-combo3-du-toi                     | MATCH     | 100.0%    | MATCH    | 100.0% (4/4) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 4/4 phần ⇒ không có căn cứ thiếu món                                              |
| MIS-combo4-thieu1bunla                | MISSING   | 87.5%     | MISSING  | 87.5% (7/8)  | NEEDS_REVIEW | NEEDS_REVIEW            | Khớp 88% nằm trong vùng xám (85%–100%)                                                     |
| MIS-combo4-thieu1bunla1longdoi        | MISSING   | 75.0%     | MISSING  | 87.5% (7/8)  | NEEDS_REVIEW | NEEDS_REVIEW            | Khớp 88% nằm trong vùng xám (85%–100%)                                                     |
| MIS-combo4-thieu1bunla1nemchuaran     | MISSING   | 75.0%     | MISSING  | 87.5% (7/8)  | NEEDS_REVIEW | NEEDS_REVIEW            | Khớp 88% nằm trong vùng xám (85%–100%)                                                     |
| MIS-combo4-thieu1chacom               | MISSING   | 87.5%     | MISSING  | 87.5% (7/8)  | NEEDS_REVIEW | NEEDS_REVIEW            | Khớp 88% nằm trong vùng xám (85%–100%)                                                     |
| MIS-combo4-thieu1chacom1nemchuaran    | MISSING   | 75.0%     | MISSING  | 75.0% (6/8)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 6/8 phần (75%) ≤ ngưỡng 85% — thiếu: chả cốm x1, nem chua rán x1              |
| MIS-combo4-thieu1dauhuchien           | MISSING   | 87.5%     | MISSING  | 87.5% (7/8)  | NEEDS_REVIEW | NEEDS_REVIEW            | Khớp 88% nằm trong vùng xám (85%–100%)                                                     |
| MIS-combo4-thieu1longdoi              | MISSING   | 87.5%     | MISSING  | 87.5% (7/8)  | NEEDS_REVIEW | NEEDS_REVIEW            | Khớp 88% nằm trong vùng xám (85%–100%)                                                     |
| MIS-combo4-thieu1longdoi1rau          | MISSING   | 75.0%     | MISSING  | 62.5% (5/8)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 5/8 phần (63%) ≤ ngưỡng 85% — thiếu: lòng dồi x1, rau sống x1, mắm tôm x1     |
| MIS-combo4-thieu1mamtom               | MISSING   | 87.5%     | MISSING  | 87.5% (7/8)  | NEEDS_REVIEW | NEEDS_REVIEW            | Khớp 88% nằm trong vùng xám (85%–100%)                                                     |
| MIS-combo4-thieu1nemchuaran           | MISSING   | 87.5%     | MISSING  | 75.0% (6/8)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 6/8 phần (75%) ≤ ngưỡng 85% — thiếu: chả cốm x1, nem chua rán x1              |
| MIS-combo4-thieu1nemchuaran1rau       | MISSING   | 75.0%     | MISSING  | 62.5% (5/8)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 5/8 phần (63%) ≤ ngưỡng 85% — thiếu: chả cốm x1, nem chua rán x1, rau sống x1 |
| MIS-combo4-thieu1rau                  | MISSING   | 87.5%     | MISSING  | 87.5% (7/8)  | NEEDS_REVIEW | NEEDS_REVIEW            | Khớp 88% nằm trong vùng xám (85%–100%)                                                     |
| MIS-combo4-thieu1thitluoc             | MISSING   | 87.5%     | MISSING  | 87.5% (7/8)  | NEEDS_REVIEW | NEEDS_REVIEW            | Khớp 88% nằm trong vùng xám (85%–100%)                                                     |
| COM-combo4-du-nghieng                 | MATCH     | 100.0%    | MATCH    | 100.0% (8/8) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 8/8 phần ⇒ không có căn cứ thiếu món                                              |
| COM-combo4-du-toi                     | MATCH     | 100.0%    | MATCH    | 100.0% (8/8) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 8/8 phần ⇒ không có căn cứ thiếu món                                              |
| MIS-combo5-thieu1suon                 | MISSING   | 80.0%     | MISSING  | 80.0% (4/5)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 4/5 phần (80%) ≤ ngưỡng 85% — thiếu: sườn nướng x1                            |
| MIS-combo5-thieu1suon1trada           | MISSING   | 60.0%     | MISSING  | 80.0% (4/5)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 4/5 phần (80%) ≤ ngưỡng 85% — thiếu: sườn nướng x1                            |
| MIS-combo5-thieu1sup                  | MISSING   | 80.0%     | MISSING  | 80.0% (4/5)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 4/5 phần (80%) ≤ ngưỡng 85% — thiếu: súp x1                                   |
| MIS-combo5-thieu1trungopla            | MISSING   | 80.0%     | MISSING  | 80.0% (4/5)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 4/5 phần (80%) ≤ ngưỡng 85% — thiếu: trứng ốp la x1                           |
| MIS-combo5-thieu1trungopla1nuoc       | MISSING   | 60.0%     | EXTRA    | 60.0% (3/5)  | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh có món KHÔNG nằm trong đơn ⇒ có thể giao nhầm, cần người xác minh                      |
| COM-combo5-du-nghieng                 | MATCH     | 100.0%    | MATCH    | 100.0% (5/5) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 5/5 phần ⇒ không có căn cứ thiếu món                                              |
| COM-combo5-du-toi                     | MATCH     | 100.0%    | MATCH    | 100.0% (5/5) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 5/5 phần ⇒ không có căn cứ thiếu món                                              |
| MIS-combo6-thieu1chethapcam           | MISSING   | 80.0%     | MISSING  | 80.0% (4/5)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 4/5 phần (80%) ≤ ngưỡng 85% — thiếu: chè thập cẩm x1                          |
| MIS-combo6-thieu1chethapcam1tradau    | MISSING   | 60.0%     | MISSING  | 60.0% (3/5)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 3/5 phần (60%) ≤ ngưỡng 85% — thiếu: chè thập cẩm x1, trà dâu x1              |
| MIS-combo6-thieu1diatraicay           | MISSING   | 80.0%     | UNCLEAR  | — (0/5)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo6-thieu1diatraicay1tradau    | MISSING   | 60.0%     | UNCLEAR  | — (0/5)      | NEEDS_REVIEW | NEEDS_REVIEW            | Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món                              |
| MIS-combo6-thieu1tradau               | MISSING   | 80.0%     | MISSING  | 80.0% (4/5)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 4/5 phần (80%) ≤ ngưỡng 85% — thiếu: trà dâu x1                               |
| MIS-combo6-thieu2tradau               | MISSING   | 60.0%     | MISSING  | 60.0% (3/5)  | AUTO_APPROVE | AUTO_APPROVE            | Ảnh chỉ khớp 3/5 phần (60%) ≤ ngưỡng 85% — thiếu: trà dâu x2                               |
| COM-combo6-du-nghieng                 | MATCH     | 100.0%    | MATCH    | 100.0% (5/5) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 5/5 phần ⇒ không có căn cứ thiếu món                                              |
| COM-combo6-du-toi                     | MATCH     | 100.0%    | MATCH    | 100.0% (5/5) | AUTO_REJECT  | AUTO_REJECT             | Ảnh khớp 5/5 phần ⇒ không có căn cứ thiếu món                                              |
