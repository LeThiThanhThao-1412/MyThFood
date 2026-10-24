-- ============================================================================
-- Sửa hệ quả của "case thứ hai trên cùng một đơn" — đơn a13aae84
-- (CASE-2026-000001 lỗi NHÀ HÀNG + CASE-2026-000002 giao trễ lỗi TÀI XẾ)
--
-- Hiện trạng:
--   • 14:50 tạo đơn → 4 dòng escrow PENDING (52.500 + 22.849 + 420 + 17.478).
--   • 15:21 CASE-000001 (WRONG_ITEM, MERCHANT) → `settleFailureMoney`:
--       khách +93.247 (hoàn 100%), tài xế +17.478 bồi thường,
--       nhà hàng nợ 110.725 (93.247 + 17.478) ⇒ escrow: HUỶ 1 (phí ship tài
--       xế) + GIẢI TOẢ 3 (tiền món/hoa hồng/quỹ) — đúng thiết kế.
--   • 15:24 CASE-000002 (DELIVERY_LATE, DRIVER) được tạo → hold escrow LẦN NỮA
--       ⇒ 3 dòng vừa giải toả quay lại HELD_BY_DISPUTE (75.769đ).
--   • 15:24 CASE-000002 xử VALID → policy `SHIP_COMPENSATION` → ví trả
--       `FAILURE_ALREADY_SETTLED` (đơn đã quyết toán) ⇒ KHÔNG có đồng nào vào
--       ví khách, nhưng resolution-service vẫn ghi hình phạt COMPENSATION
--       93.247đ vì đọc `policy.amount` thay vì kết quả ví ⇒ bút toán ảo.
--
-- Hai lỗi gốc đã được sửa trong code (không cần chạy script này cho case mới):
--   • `CaseService.settleCaseMoney()` đọc kết quả route tiền và chỉ ghi
--     COMPENSATION bằng `settledAmount` (số ví thực chuyển).
--   • `settleCaseMoney()` mở khoá escrow cho mọi phán quyết KHÔNG tiêu thụ
--     escrow (SHIP_COMPENSATION / NONE trên đơn đã giao).
--
-- Script này dọn dữ liệu đã phát sinh:
--   (1) WALLET: trả 3 dòng escrow của a13aae84 về PENDING để cron 23:00 quyết
--       toán tiền món cho nhà hàng (nợ 110.725 vẫn được thu hồi từ chính thu
--       nhập đó ở bước CLAWBACK_RECOVERY — hai luồng riêng, không netting).
--   (2) RESOLUTION: huỷ bút toán COMPENSATION ảo 93.247đ của CASE-2026-000002
--       (amount → 0, status → WAIVED) để tab hình phạt khớp sổ ví.
--
-- Chạy lại nhiều lần vẫn an toàn: mọi lệnh đều lọc theo trạng thái CŨ.
--   Get-Content -Raw scripts/fix-a13aae84-second-case.sql |
--     docker exec -i mythfood-postgres psql -U mythfood -d postgres -v ON_ERROR_STOP=1
-- ============================================================================

-- ============================ WALLET DB =====================================
\c mythfood_wallet;

BEGIN;

-- (1) Mở khoá escrow: chỉ áp dụng khi đơn ĐÃ có sổ quyết toán giao thất bại
--     (nếu chưa có thì phải để escrow chờ phán quyết, không được tự mở).
UPDATE settlement_entries e
   SET status = 'PENDING'
 WHERE e."orderId" = 'a13aae84-3f68-47f3-89d7-6439503a2215'
   AND e.status = 'HELD_BY_DISPUTE'
   AND EXISTS (
     SELECT 1 FROM failure_settlements f
      WHERE f."orderId" = e."orderId"
        AND f.status = 'COMPLETED'
   );

COMMIT;

-- ============================ RESOLUTION DB =================================
\c mythfood_resolution;

BEGIN;

-- (2) Huỷ bút toán bồi thường ảo của CASE-2026-000002.
--     `settledAmount = 0` vì wallet trả `FAILURE_ALREADY_SETTLED`: tiền đã được
--     hoàn cho khách ở CASE-2026-000001, ghi thêm 93.247đ nữa là báo khống.
UPDATE penalties p
   SET amount      = 0,
       status      = 'WAIVED',
       reason      = p.reason ||
                     ' — HUỶ: ví trả FAILURE_ALREADY_SETTLED (đơn đã quyết toán ở CASE-2026-000001), không có khoản nào vào ví khách',
       "updatedAt" = now()
  FROM cases c
 WHERE c.id = p."caseId"
   AND c."caseNumber" = 'CASE-2026-000002'
   AND p.type = 'COMPENSATION'
   AND p.amount = 93247;

-- (3) Dấu vết điều chỉnh trong timeline của vụ việc.
INSERT INTO case_timeline (id, "caseId", "fromStatus", "toStatus", "actorId", "actorType", note, "createdAt")
SELECT gen_random_uuid(), c.id, 'RESOLVED', 'RESOLVED', 'system', 'ADMIN',
       'Huỷ bút toán bồi thường ảo 93.247đ: đơn đã được hoàn 100% ở CASE-2026-000001 (ví trả FAILURE_ALREADY_SETTLED) nên case này không phát sinh dòng tiền; đồng thời mở khoá escrow 75.769đ của đơn để nhà hàng được quyết toán 23:00.',
       now()
  FROM cases c
 WHERE c."caseNumber" = 'CASE-2026-000002'
   AND NOT EXISTS (
     SELECT 1 FROM case_timeline t
      WHERE t."caseId" = c.id
        AND t.note LIKE 'Huỷ bút toán bồi thường ảo%'
   );

COMMIT;

-- ============================ KIỂM TRA SAU KHI SỬA ==========================
\c mythfood_wallet;

\echo '--- Escrow đơn a13aae84 (kỳ vọng: 3 dòng PENDING + 1 dòng DRIVER_SHIPPING_FEE VOID) ---'
SELECT kind, amount, status
FROM settlement_entries
WHERE "orderId" = 'a13aae84-3f68-47f3-89d7-6439503a2215'
ORDER BY kind;

\echo '--- Không còn escrow treo của đơn (kỳ vọng: 0 dòng) ---'
SELECT "orderId", kind, status, amount
FROM settlement_entries
WHERE "orderId" = 'a13aae84-3f68-47f3-89d7-6439503a2215'
  AND status = 'HELD_BY_DISPUTE';

\c mythfood_resolution;

\echo '--- Hình phạt của 2 case trên đơn (kỳ vọng: COMPENSATION 93.247 EXECUTED của CASE-000001, COMPENSATION 0 WAIVED của CASE-000002) ---'
SELECT c."caseNumber", p.type, p."targetType", p.amount, p.status
FROM penalties p JOIN cases c ON c.id = p."caseId"
WHERE c."orderId" = 'a13aae84-3f68-47f3-89d7-6439503a2215'
ORDER BY c."caseNumber", p.type;
