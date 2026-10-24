-- ============================================================================
-- Sửa lỗi MẤT DẤU TIẾNG VIỆT trong dữ liệu đã sinh ra bởi các script .sql
-- (đơn 883f25a8 — CASE-2026-000003, và 2 dấu vết điều chỉnh của a13aae84).
--
-- NGUYÊN NHÂN (không phải lỗi code):
--   `Get-Content -Raw x.sql | docker exec -i mythfood-postgres psql ...`
--   Windows PowerShell 5.1 mã hoá luồng stdin của lệnh native theo
--   `$OutputEncoding` (mặc định **ASCII**), nên mọi ký tự ngoài ASCII bị thay
--   bằng '?' NGAY TRƯỚC khi tới Postgres ⇒ DB lưu 'B?i th??ng ph? ship...'.
--   Ứng dụng ghi qua driver TypeORM (UTF-8) nên dữ liệu do app sinh ra KHÔNG bị.
--
-- CÁCH CHẠY ĐÚNG (byte-safe) — chọn 1 trong 2:
--   cmd /c "type scripts\fix-mojibake-utf8.sql | docker exec -i mythfood-postgres psql -U mythfood -d postgres -v ON_ERROR_STOP=1"
--   docker cp scripts\fix-mojibake-utf8.sql mythfood-postgres:/tmp/x.sql
--   docker exec -i mythfood-postgres psql -U mythfood -d postgres -v ON_ERROR_STOP=1 -f /tmp/x.sql
--
-- Chạy lại nhiều lần vẫn an toàn: mỗi lệnh chỉ sửa dòng còn chứa '?'.
-- ============================================================================

SET client_encoding = 'UTF8';

-- ============================ WALLET DB =====================================
\c mythfood_wallet;

BEGIN;

-- (1) Khách: bút toán bồi thường phí ship của đơn 883f25a8.
UPDATE wallet_transactions
   SET description = 'Bồi thường phí ship giao trễ đơn #883f25a8 (100% phí ship)'
 WHERE id = 'f89e3deb-92f4-46a3-8bbb-d1f0247d3550'
   AND description LIKE '%?%';

-- (2) Tài xế: khoản trừ ví (17.478 tiền mặt + 4.384 ghi nợ).
UPDATE wallet_transactions
   SET description = 'Bồi thường khách đơn #883f25a8 (đã trừ 17478, còn nợ 4384)'
 WHERE id = '4c8908ce-9217-4300-9f0d-0a6c7123ede4'
   AND description LIKE '%?%';

-- (3) Quỹ nền tảng: bút toán đối ứng cùng một dòng tiền.
UPDATE wallet_transactions
   SET description = 'Thu tiền bồi thường khách — đơn #883f25a8 (tài xế chịu chi phí)'
 WHERE id = '606bca78-1e81-4974-93d4-39c1dca04db0'
   AND description LIKE '%?%';

-- (4) Nhãn nợ của tài xế (app hiển thị trực tiếp dòng này ở "Nợ cần thanh toán").
UPDATE clawback_liabilities
   SET description = 'Bồi thường khách đơn #883f25a8 (lỗi tài xế giao trễ)',
       "updatedAt" = now()
 WHERE id = '443c64a3-be5e-4c76-92d3-05bed1e0bd15'
   AND description LIKE '%?%';

COMMIT;

-- ============================ RESOLUTION DB =================================
\c mythfood_resolution;

BEGIN;

-- (5) Ghi chú phán quyết của CASE-2026-000003 (khung "Kết luận" của vụ việc).
UPDATE cases
   SET "resolutionNote" = 'Giao trễ trên đơn đã giao: hoàn 100% phí ship (21.862đ) cho khách và trừ tài xế đúng 21.862đ (17.478đ trừ ví + 4.384đ ghi nợ). Tiền món 52.500đ của nhà hàng không bị ảnh hưởng.',
       "updatedAt"      = now()
 WHERE id = 'e72b4a0a-017d-4985-877c-7cc167cbbeda'
   AND "resolutionNote" LIKE '%?%';

-- (6) Lý do bút toán COMPENSATION đã huỷ: phần đầu còn nguyên (do app ghi),
--     cắt từ ký tự hỏng đầu tiên rồi gắn lại phần đuôi đúng chính tả.
UPDATE penalties
   SET reason = left(reason, strpos(reason, '?') - 1) ||
                '— HUỶ: ví trả FAILURE_ALREADY_SETTLED (đơn đã quyết toán ở CASE-2026-000001), không có khoản nào vào ví khách',
       "updatedAt" = now()
 WHERE id = '3170a01a-0d42-4d5c-b5e5-05739fa79c3c'
   AND reason LIKE '%?%';

-- (7) Dấu vết điều chỉnh của đơn 883f25a8 (timeline vụ việc).
UPDATE case_timeline
   SET note = 'Điều chỉnh tiền theo chính sách giao trễ: hoàn khách 93.262đ → 21.862đ (100% phí ship); tài xế gánh 69.990đ → 21.862đ; doanh thu nhà hàng giữ nguyên.'
 WHERE id = 'b0c4a952-24d1-4312-b167-62d54883cd15'
   AND note LIKE '%?%';

-- (8) Dấu vết huỷ bút toán ảo của CASE-2026-000002.
UPDATE case_timeline
   SET note = 'Huỷ bút toán bồi thường ảo 93.247đ: đơn đã được hoàn 100% ở CASE-2026-000001 (ví trả FAILURE_ALREADY_SETTLED) nên case này không phát sinh dòng tiền; đồng thời mở khoá escrow 75.769đ của đơn để nhà hàng được quyết toán 23:00.'
 WHERE id = '5d38992c-9ea0-4b59-aa06-7d1a0a350b43'
   AND note LIKE '%?%';

COMMIT;

-- ============================ KIỂM TRA ======================================
\c mythfood_wallet;

\echo '--- Bút toán + nợ của đơn 883f25a8 (chữ phải có dấu đầy đủ) ---'
SELECT "ownerType", amount, "referenceType", description
FROM wallet_transactions
WHERE "referenceId" = '883f25a8-587b-4f34-bb47-23a19cd29763'
  AND "referenceType" LIKE 'CASE_COMPENSATION%'
ORDER BY "createdAt";

SELECT category, "remainingAmount", description
FROM clawback_liabilities
WHERE "sourceOrderId" = '883f25a8-587b-4f34-bb47-23a19cd29763';

\echo '--- Còn dòng nào chứa "?" trong 2 cột chữ này không (kỳ vọng: 0) ---'
SELECT 'wallet_transactions' AS tbl, count(*) AS rows_with_questionmark
FROM wallet_transactions WHERE description LIKE '%?%'
UNION ALL
SELECT 'clawback_liabilities', count(*)
FROM clawback_liabilities WHERE description LIKE '%?%';

\c mythfood_resolution;

\echo '--- Chữ của 2 case + timeline (kỳ vọng: đủ dấu) ---'
SELECT "caseNumber", "resolutionNote" FROM cases WHERE "resolutionNote" LIKE '%phí ship%';
SELECT note FROM case_timeline WHERE id IN ('b0c4a952-24d1-4312-b167-62d54883cd15',
                                            '5d38992c-9ea0-4b59-aa06-7d1a0a350b43');
SELECT type, amount, status, reason FROM penalties WHERE id = '3170a01a-0d42-4d5c-b5e5-05739fa79c3c';

\echo '--- Còn dòng nào chứa "?" không (kỳ vọng: 0 / 0 / 0) ---'
SELECT 'cases' AS tbl, count(*) AS rows_with_questionmark FROM cases WHERE "resolutionNote" LIKE '%?%'
UNION ALL
SELECT 'case_timeline', count(*) FROM case_timeline WHERE note LIKE '%?%'
UNION ALL
SELECT 'penalties', count(*) FROM penalties WHERE reason LIKE '%?%';
