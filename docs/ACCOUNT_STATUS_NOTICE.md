# Thông báo khóa / từ chối tài khoản (Tài xế & Nhà hàng)

Tài liệu mô tả luồng xử lý khi tài khoản **tài xế** hoặc **nhà hàng** bị khóa
hoặc bị từ chối hồ sơ đăng ký, và thông báo hiển thị ở màn hình đăng nhập.

## 1. Trạng thái tài khoản

`users.status` (identity-service):

| Trạng thái  | Ý nghĩa          | Đăng nhập                                     |
| ----------- | ---------------- | --------------------------------------------- |
| `ACTIVE`    | Bình thường      | ✅                                            |
| `INACTIVE`  | Chưa kích hoạt   | ❌ (thông báo chưa kích hoạt)                 |
| `SUSPENDED` | Bị khóa          | ❌ (báo khóa đến ngày hoặc vĩnh viễn + lý do) |
| `BANNED`    | Khóa vĩnh viễn   | ❌ (báo khóa vĩnh viễn)                       |
| `REJECTED`  | Hồ sơ bị từ chối | ❌ (báo từ chối + lý do + ngày xóa)           |

- `SUSPENDED` có `suspended_until = NULL` → **khóa vĩnh viễn**.
- `REJECTED` lưu `rejected_at` + `reject_reason`.
- Sau **3 ngày** kể từ `rejected_at`, tài khoản bị **xóa vĩnh viễn** khỏi
  `users` (sweeper mỗi 60 giây trong `UserAdminService`, đồng thời kiểm tra lại
  ngay khi đăng nhập/refresh token).

## 2. API đăng nhập

`POST /api/v1/auth/login`

Khi tài khoản không được phép đăng nhập, identity-service trả **403** kèm:

```json
{
  "statusCode": 403,
  "code": "ACCOUNT_SUSPENDED | ACCOUNT_BANNED | ACCOUNT_REJECTED | ACCOUNT_DELETED | ACCOUNT_INACTIVE",
  "message": "Tài khoản của bạn đã bị khóa đến 20/10/2026 17:00. Lý do: ...",
  "account": {
    "status": "SUSPENDED",
    "reason": "Vi phạm chính sách",
    "permanent": false,
    "suspendedAt": "2026-10-17T10:00:00.000Z",
    "suspendedUntil": "2026-10-20T10:00:00.000Z",
    "rejectedAt": null,
    "deleteAt": null
  }
}
```

Merchant-app và driver-app dùng `getAccountBlockInfo()` +
`<AccountBlockNotice />` (package `frontend-shared`) để hiển thị:

- Khóa có thời hạn: **"Khóa đến dd/mm/yyyy HH:mm"** + lý do.
- Không có thời hạn: **"Khóa vĩnh viễn"** + lý do.
- Bị từ chối: lý do, thời điểm từ chối, **ngày tài khoản bị xóa (+3 ngày)**.

## 3. API quản trị / đồng bộ giữa các service

| API                                    | Mô tả                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `PATCH /api/v1/auth/users/:id/status`  | Khóa/mở khóa user (`durationDays`, `reason`). `durationDays` trống = vĩnh viễn |
| `PATCH /api/v1/auth/users/:id/reject`  | Từ chối tài khoản (`reason`)                                                   |
| `PATCH /api/v1/auth/users/:id/unlock`  | Mở khóa / bỏ từ chối                                                           |
| `PUT /api/v1/merchants/:id/reject`     | Từ chối nhà hàng (`reason`) → đồng bộ identity                                 |
| `PATCH /api/v1/merchants/:id/status`   | Khóa/mở khóa nhà hàng (`reason`, `durationDays`) → đồng bộ identity            |
| `PATCH /api/v1/drivers/:id/reject`     | Từ chối tài xế (`reason`) → đồng bộ identity                                   |
| `PATCH /api/v1/drivers/:id/suspend`    | Khóa tài xế (`reason`, `durationDays`) → đồng bộ identity                      |
| `PATCH /api/v1/drivers/:id/compliance` | Xử phạt từ resolution-service (`SUSPEND`/`BAN` + `reason`)                     |

Các call nội bộ dùng header `x-service-key` và biến môi trường
`IDENTITY_SERVICE_URL` / `MERCHANT_SERVICE_URL` / `DRIVER_SERVICE_URL`.

## 4. Migration

Chạy các file SQL ở thư mục gốc khi `synchronize=false`:

- `alter_users_rejection.sql` (mythfood_identity)
- `alter_merchants_rejection.sql` (mythfood_merchant)
- `alter_drivers_rejection.sql` (mythfood_driver)
