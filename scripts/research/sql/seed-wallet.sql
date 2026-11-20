-- =============================================================================
-- BỘ DỮ LIỆU HẠT GIỐNG — CSDL: mythfood_wallet
--
-- Vì sao phải nạp ví: đo thực tế ngày 11/11/2026 cho thấy bước `delivered`
-- gọi `POST /wallets/settlement/accrue`, và với đơn COD ví của TÀI XẾ bị TRỪ
-- tiền món (`debitForCOD`). Khi ví chưa tồn tại (số dư 0) endpoint trả **500**
-- ("Số dư không đủ để trừ tiền món COD ... hiện có 0 VND") và dòng hop đó
-- xuất hiện trong hops.jsonl với status 500 — làm bẩn E2.
--
-- Định mức: mỗi quán 100.000.000 VND, mỗi tài xế 5.000.000 VND. Định mức tài
-- xế chỉ đủ ~200 đơn (mỗi đơn trừ ~25.000 đ), nên harness Bước 3.5 nạp lại
-- đúng hai định mức này trước MỖI run (giao thức §14.3); nếu không, sau ~4 run
-- W3 ví cạn và hop settlement/accrue chuyển sang 500 hàng loạt.
-- ownerId là varchar nên truyền thẳng chuỗi uuid (không ép ::uuid).
-- =============================================================================

INSERT INTO wallets (id, "ownerId", "ownerType", balance, "heldBalance", currency)
SELECT ('f1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'a2000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
       'MERCHANT', 100000000, 0, 'VND'
FROM generate_series(1, 50) AS i
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallets (id, "ownerId", "ownerType", balance, "heldBalance", currency)
SELECT ('f2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'd2000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
       'DRIVER', 5000000, 0, 'VND'
FROM generate_series(1, 20) AS i
ON CONFLICT (id) DO NOTHING;
