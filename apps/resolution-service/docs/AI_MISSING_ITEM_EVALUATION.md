# Đối chiếu cặp ảnh cho khiếu nại THIẾU MÓN / SAI MÓN

Tài liệu này mô tả pipeline đang chạy **trong production** (không phải shadow):
mỗi món trong đơn được đối chiếu theo **cặp ảnh**

```
ẢNH 1 = ảnh món do NHÀ HÀNG tự upload lên thực đơn (menu_items.image_url)
ẢNH 2 = ảnh KHÁCH chụp khi nhận hàng (case_evidence)
```

## 1. Vì sao phải ghép cặp

| Cách cũ (một lượt 6 ảnh)                                                                             | Cách mới (ghép cặp)                                                              |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Model tự đoán ảnh nào là ảnh chuẩn của món nào                                                       | Cặp được ghép bằng **khoá ngoại** `orderItem.menuItemId` ↔ `menuItem.imageUrl`   |
| Ảnh chuẩn món gần như luôn bị ảnh bằng chứng đẩy ra khỏi ngân sách ảnh (`AI_ASSISTANT_MAX_IMAGES=6`) | Ảnh chuẩn món có **ngân sách riêng** (`AI_PAIRWISE_MAX_PAIRS`), không tranh suất |
| Không có con số "giống bao nhiêu %"                                                                  | Mỗi cặp trả `similarityPercent` 0–100 + `sameDish`                               |
| Không so được đúng cặp                                                                               | So sánh chỉ trong phạm vi **một món**, nên "khác món" là kết luận đo được        |

## 2. Luồng chạy trong `analyzeCase`

1. `CaseContextService.build()` dựng snapshot + ảnh bằng chứng như cũ, rồi **thêm**
   `pairs` (mỗi cặp đã tải base64) nếu:
   - `AI_IMAGE_PAIRWISE=on` (mặc định), **và**
   - danh mục thuộc nhóm món ăn (`MISSING_ITEM`, `WRONG_ITEM`, `ORDER_QUALITY`,
     `DAMAGED_ITEM`, `FOOD_SAFETY`), **và**
   - `maxImages > 0` (tôn trọng `skipImages`), **và**
   - dựng được ít nhất một cặp có đủ 2 phía ảnh.

   Ảnh đã tải cho lượt gộp được **dùng lại** theo URL (`getOrDownload`), nên chi phí
   thêm chủ yếu là ảnh thực đơn mà ngân sách cũ đã bỏ rơi.

2. Lượt 1 (như cũ): đọc ảnh gộp bằng `AI_IMAGE_SCHEMA` → `deliveryProof`, `respondentImages`, `sideComparison`.
3. Lượt 1b (**mới**): mỗi cặp 1 lượt gọi `AI_PAIR_IMAGE_SCHEMA` (schema nhỏ, 2 ảnh),
   chạy song song `AI_PAIRWISE_CONCURRENCY` (2), tổng thời gian chặn bởi
   `AI_PAIRWISE_BUDGET_MS` (25 s).
4. `scoreImagePairs()` (hàm thuần) gộp các cặp thành **một nhãn kiểm kê** + tín hiệu
   sai món; nhãn này **thay** `reporterImages.items` trước khi chấm điểm.
5. `applyImageMatchScoring()` chấm điểm tất định (0 token) và, khi đủ điều kiện, ghi đè
   `reporterImages.support` (`CONTRADICTS` nếu ảnh khớp đủ đơn, `SUPPORTS` nếu thiếu rõ).
6. Lượt 2 (chữ) đọc `pairComparison` + `imageMatch` trong `<PHAN_TICH_ANH>` rồi ra
   verdict như cũ. **Tiền vẫn do `matchScore` (đếm phần) quyết định**, không do
   `similarityPercent`.

## 3. Bốn quy tắc không được vi phạm

1. **Số phần lấy MAX theo món, không cộng.** Mỗi cặp/ảnh chỉ thấy một phần bàn ăn;
   cộng dồn sẽ biến hai ảnh chụp cùng một hộp thành "2 hộp".
2. **Dòng đơn chưa ghép được cặp không bị coi là thiếu.** Điểm chỉ chấm trên
   `scopedOrderItems` (các dòng đã ghép cặp thành công) và `pairComparison.missingPairs`
   nêu rõ dòng nào chưa có cặp.
3. **Chỉ ghi đè khi bằng chứng một chiều** — `canOverride` đòi đồng thời: đọc được
   ≥ 2/3 số cặp, phủ đủ mọi nhóm món, `countable=true`, `coverage != partial`.
4. **Sai món ≠ thiếu món.** `sameDish=false` (hoặc `similarityPercent ≤ 35`) đưa món vào
   `wrongItems` và **không** tính là đã giao; code không tự đổi danh mục vụ việc
   (`MISSING_ITEM` ↔ `WRONG_ITEM` cùng ra `FULL_REFUND` theo `case.money-policy.ts`).

## 4. Cờ cấu hình

| Biến                          | Mặc định | Ý nghĩa                                                            |
| ----------------------------- | -------- | ------------------------------------------------------------------ |
| `AI_IMAGE_PAIRWISE`           | `on`     | `off` = tắt ghép cặp, quay lại đúng hành vi một lượt gộp           |
| `AI_PAIRWISE_MAX_PAIRS`       | `4`      | Số cặp/vụ việc (0 = tắt); ưu tiên `unitPrice × quantity` cao trước |
| `AI_PAIRWISE_CONCURRENCY`     | `2`      | Số lượt gọi vision song song                                       |
| `AI_PAIRWISE_BUDGET_MS`       | `25000`  | Trần thời gian; quá hạn ⇒ bỏ cặp còn lại, không ghi đè             |
| `AI_PAIRWISE_EVIDENCE_IMAGES` | `1`      | Số ảnh khách/cặp; `>1` ⇒ mỗi ảnh một lượt gọi (MAX theo món)       |
| `AI_IMAGE_MATCH_SCORING`      | `on`     | `off` = kill-switch; `shadow` = chỉ ghi số, không đổi kết luận     |

## 5. Kiểm thử

- `src/tests/unit/image-pair.spec.ts` — quy tắc MAX (không cộng), món khác loại,
  `coverage=partial` chặn ghi đè, cặp lỗi bị loại khỏi mẫu số, điểm chỉ chấm trên
  phần đã ghép cặp.
- `src/tests/unit/pair-plan.spec.ts` — ghép theo `menuItemId`, gộp hai dòng cùng món,
  bỏ cặp khi thiếu ảnh một bên, cắt ngân sách theo giá trị tiền, ghép theo tên chỉ khi
  **duy nhất**.
- `src/tests/unit/assistant.spec.ts` — mặc định `AI_IMAGE_MATCH_SCORING=on` được ghi
  đè kết luận; `shadow` không đổi kết luận.

Lệnh chạy:

```bash
cd apps/resolution-service
npx jest src/tests/unit/image-pair.spec.ts src/tests/unit/pair-plan.spec.ts
npx jest --silent            # toàn bộ unit test
```

## 6. Việc còn lại (chưa làm trong bước này)

- Bộ **32 kịch bản** (`meta/scenarios.json`) + script seed ảnh thực đơn thật qua
  upload-service (`folder=menu-items`) cho 6 merchant test.
- Harness `src/tests/ai-eval/e2e/run-e2e.ts` chấm end-to-end
  (`analyzeCase` → `applyAiDecision` → settlement/penalty) theo thang Likert 5 điểm,
  chạy `--dry-run` trước rồi mới chạy live (tốn lượt gọi vision).
- Điền `unitPrice` cho toàn bộ `combos.json` để `refundCap`/`missingValue` có nghĩa.
