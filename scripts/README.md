# scripts/ — cách nạp script SQL (đọc trước khi chạy)

## ⚠ Không dùng `Get-Content | docker exec`

```powershell
# SAI — làm hỏng tiếng Việt trong DB
Get-Content -Raw scripts\fix-x.sql | docker exec -i mythfood-postgres psql -U mythfood -d postgres
```

Windows PowerShell 5.1 mã hoá luồng stdin của lệnh native theo `$OutputEncoding`,
mặc định là **ASCII**. Mọi ký tự ngoài ASCII (ồ, ề, ỷ, đ, →, —) bị thay bằng `?`
**trước khi** tới Postgres, nên DB lưu `B?i th??ng ph? ship...` — đúng lỗi chữ
của đơn `883f25a8` (đã sửa bằng `fix-mojibake-utf8.sql`).

## ✅ Hai cách nạp đúng (byte-safe)

```powershell
# Cách 1 — cmd type chuyển nguyên byte
cmd /c "type scripts\fix-x.sql | docker exec -i mythfood-postgres psql -U mythfood -d postgres -v ON_ERROR_STOP=1"

# Cách 2 — copy file vào container rồi psql -f
docker cp scripts\fix-x.sql mythfood-postgres:/tmp/fix-x.sql
docker exec -i mythfood-postgres psql -U mythfood -d postgres -v ON_ERROR_STOP=1 -f /tmp/fix-x.sql
```

Cách 3 (nếu buộc phải dùng PowerShell pipe): đặt `$OutputEncoding` trước khi pipe.

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Get-Content -Raw -Encoding UTF8 scripts\fix-x.sql | docker exec -i mythfood-postgres psql ...
```

Lưu ý: dữ liệu do **ứng dụng** ghi (TypeORM, driver UTF-8) không bao giờ bị lỗi
này — chỉ dữ liệu do script `.sql` sinh ra.

## Kiểm tra sau khi chạy

```powershell
cmd /c "type scripts\verify_money_invariants.sql | docker exec -i mythfood-postgres psql -U mythfood -d mythfood_wallet -v ON_ERROR_STOP=1"
```

Kỳ vọng: cả 7 kiểm tra trả **0 dòng**.

Nếu nghi ngờ mất dấu, quét nhanh:

```sql
SET client_encoding = 'UTF8';
SELECT count(*) FROM wallet_transactions WHERE description LIKE '%?%';
SELECT count(*) FROM cases WHERE "resolutionNote" LIKE '%?%';
SELECT count(*) FROM case_timeline WHERE note LIKE '%?%';
SELECT count(*) FROM penalties WHERE reason LIKE '%?%';
```

## Danh mục script

| File                                      | Việc                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `fix-a13aae84-second-case.sql`            | Mở khoá escrow treo + huỷ bút toán bồi thường ảo của CASE-2026-000002 |
| `fix-883f25a8-late-delivery-ship-fee.sql` | Đưa đơn giao trễ về đúng chính sách "chỉ hoàn 100% phí ship"          |
| `fix-mojibake-utf8.sql`                   | Sửa chữ tiếng Việt bị `?` do nạp SQL qua PowerShell pipe              |
| `seed-admin-wallet.sql`                   | Nạp 100.000.000 VND vào ví admin (`PLATFORM_DEFAULT` / `PLATFORM`)    |
| `verify_money_invariants.sql`             | 7 bất biến tiền (số dư = sổ, escrow treo, nợ khấu trừ, …)             |
