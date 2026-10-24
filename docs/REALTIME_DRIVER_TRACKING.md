# GPS realtime cho tài xế (Phase 0 + 1)

Tài liệu mô tả pipeline GPS kiểu Grab/Be/XanhSM đã triển khai: client lấy mẫu
thích ứng + WebSocket đẩy vị trí + Redis GEO hot cache + ghi lịch sử theo lô.
Thay cho mô hình cũ `getCurrentPosition` mỗi 5 giây + `PATCH` từng điểm.

## 1. Luồng dữ liệu

```
[driver-app] watchPosition (adaptive sampling, buffer offline)
      │  WS  namespace /tracking  event tracking:push  (ack)
      │  HTTP fallback: POST /api/v1/drivers/:id/location/batch
      ▼
[driver-service] DriverService.updateLocation / updateLocationsBatch
      ├─ UPDATE drivers (currentLat/Lng + lastLocationUpdateAt)   ← 1 lần / lô
      ├─ INSERT driver_location_history (1 INSERT / lô)
      ├─ DriverGeoService.upsertPosition → Redis GEOADD + TTL key
      └─ publishLocation → TrackingGateway fan-out
                                   │
             room order:<orderId>  → app khách (tracking:update)
             room driver:<driverId> → thiết bị tài xế
```

Matching (`dispatch-service`) gọi `GET /api/v1/drivers/available/nearby`,
driver-service trả lời bằng `GEOSEARCH` (Redis) + lọc trạng thái từ DB, kèm
`distanceKm` đã sắp xếp. Nếu Redis chết/không có dữ liệu → tự fallback về DB +
Haversine; dispatch-service cũng fallback về `/available/list` nếu endpoint mới
không dùng được.

## 2. Lấy mẫu phía client (`useDriverLocationStream`)

| Chế độ                   | Nhịp tối thiểu | Di chuyển tối thiểu | Nhịp tim tối đa | Sai số tối đa |
| ------------------------ | -------------- | ------------------- | --------------- | ------------- |
| Rảnh (`idle`)            | 10s            | 50m                 | 15s             | 100m          |
| Đang giao (`delivering`) | 4s             | 15m                 | 8s              | 75m           |

- `maxSilenceMs` luôn nhỏ hơn `DRIVER_OFFLINE_TIMEOUT_SECONDS` (20s) → tab bị
  throttle vẫn giữ được nhịp tim, không bị auto-offline oan.
- Điểm sai số lớn hoặc `(0,0)` bị loại; `visibilitychange`/`online` kích hoạt
  lấy vị trí mới ngay và flush buffer.
- Buffer offline tối đa 200 điểm, bỏ điểm cũ hơn 5 phút, gửi bù qua HTTP batch
  khi WS không khả dụng.

## 3. Giao thức WebSocket (`/tracking`)

Kết nối: `io("http://localhost:3007/tracking", { auth: { token: "<JWT>" } })`.

| Hướng           | Event                  | Payload                                                          |
| --------------- | ---------------------- | ---------------------------------------------------------------- |
| client → server | `tracking:push`        | `{ latitude, longitude }` → ack `{ ok, error? }`                 |
| client → server | `tracking:subscribe`   | `{ orderId }` (app khách theo dõi đơn)                           |
| client → server | `tracking:unsubscribe` | `{ orderId }`                                                    |
| server → client | `tracking:ready`       | `{ userId, driverId }` sau khi xác thực                          |
| server → client | `tracking:update`      | `{ driverId, orderId, latitude, longitude, recordedAt, source }` |

`driverId` do server suy ra từ JWT (`userId` → hồ sơ tài xế); client **không**
gửi `driverId` nên không thể giả mạo vị trí của tài xế khác.

## 4. HTTP API

- `POST /api/v1/drivers/:id/location/batch` — `{ points: [{ latitude,
longitude, recordedAt?, accuracy? }] }`, 1–100 điểm/lần.
- `GET /api/v1/drivers/available/nearby?latitude&longitude&radiusKm&includeStackable&limit`
  — danh sách tài xế khả dụng + `distanceKm`, sắp xếp gần → xa.

## 5. Redis keys

| Key                                   | Kiểu   | TTL | Mục đích                                                          |
| ------------------------------------- | ------ | --- | ----------------------------------------------------------------- |
| `mythfood:drivers:geo`                | GEO    | —   | Tập toạ độ tài xế đang online                                     |
| `mythfood:drivers:geo:seen`           | ZSET   | —   | Mốc cập nhật cuối, dùng để dọn rác                                |
| `mythfood:drivers:geo:pos:<driverId>` | STRING | 90s | "Độ nóng" của vị trí; hết hạn → không còn trong matching realtime |

`DriverGeoService` dọn member quá TTL mỗi 60 giây (tối đa 500/lần). Redis là
tuỳ chọn: thiếu `REDIS_URL` hoặc Redis lỗi → toàn bộ luồng vẫn chạy bằng DB.

## 6. Biến môi trường

```dotenv
REDIS_URL=redis://default:<password>@localhost:6379
DRIVER_GEO_TTL_SECONDS=90
DRIVER_OFFLINE_TIMEOUT_SECONDS=20
NEXT_PUBLIC_DRIVER_WS_URL=http://localhost:3007/tracking
```

## 7. Kiểm thử

```bash
pnpm --filter @mythfood/frontend-shared test        # sampling + khoảng cách
pnpm --filter @mythfood/driver-service test         # batch, fan-out, nearby
pnpm --filter @mythfood/dispatch-service test
pnpm --filter @mythfood/driver-service exec tsc --noEmit
```

## 8. Kiểm tra thủ công

1. Bật driver-app, bật ONLINE → log driver-service phải có `GPS hot cache ready`.
2. `redis-cli --pass <password> GEOSEARCH mythfood:drivers:geo FROMLONLAT 106.7009 10.7769 BYRADIUS 5 km ASC WITHDIST`.
3. Mở đơn đang giao trên consumer-app → marker tài xế nhảy mượt theo WS (không
   chờ 5s như trước).
4. Tắt Wi-Fi 30 giây rồi bật lại → các điểm trong buffer được gửi bù (kiểm tra
   `driver_location_history` có `recordedAt` cũ hơn thời điểm request).

## 9. Mô phỏng GPS khi demo (không cần GPS thật)

DevTools của Chrome chỉ cho **đặt** một toạ độ cố định nên không demo được cảnh
tài xế đang chạy, và cũng không sinh ra vết GPS thật trong
`driver_location_history` (thứ resolution-service dùng để tính tín hiệu GPS khi
giải quyết sự cố).

Công cụ demo: `apps/driver-app/src/lib/gps-simulator.ts` (engine + lớp shim
`navigator.geolocation`) và `components/GpsSimulatorPanel.tsx` (bảng điều khiển).

**Cách hoạt động**

- Engine **không** sửa pipeline: nó ghi đè `navigator.geolocation` bằng một lớp
  mỏng. Khi giả lập TẮT, mọi lời gọi được chuyển nguyên vẹn xuống GPS thiết bị;
  khi BẬT, lớp này tự phát `GeolocationPosition` theo lộ trình (kèm
  `accuracy`/`speed`/`heading` như thiết bị thật).
- Nhờ vậy dữ liệu đi đúng đường thật: `watchPosition` → lấy mẫu thích ứng →
  WS `tracking:push` / HTTP batch → `driver_location_history` →
  `deriveGpsSignals` của resolution-service.
- Shim được cài ngay khi module `gps-simulator.ts` được nạp (trước mọi
  `useEffect`), và idempotent.

**Dùng**

1. Đăng nhập tài khoản DRIVER → bấm **ONLINE** (backend từ chối điểm GPS khi tài
   xế offline; panel có cảnh báo).
2. Mở bong bóng **🧪 GPS demo** ở góc dưới phải.
3. Chọn tuyến:
   - **📦 Đơn đang giao** — vị trí bạn → quán → khách (hoặc vị trí bạn → khách
     khi đã lấy món).
   - **🏙️ Vòng Q1** — vòng quanh trung tâm Quận 1, lặp lại.
   - **🎯 Quanh đây** — vòng tròn 350 m quanh vị trí hiện tại.
4. **▶ Chạy mô phỏng** (tốc độ 10/20/30/45 km/h), `⏹` để dừng và trả GPS lại
   thiết bị, `⏭` để nhảy tới đích.
5. **📡 GPS lỗi** — bắn 1 điểm lệch ~1 km rồi quay lại lộ trình: tạo đúng 2 mốc
   nhảy vận tốc bất khả thi để thử tín hiệu `jumpCount` / `GPS_SPOOFING`.

**Bật/tắt**

```dotenv
# Chỉ cần khi build production; ở dev panel tự bật
NEXT_PUBLIC_GPS_SIMULATOR=1
```

Panel chỉ hiện với role DRIVER, ẩn ở `/login` và `/register`.

## 10. Ghi chú / giới hạn còn lại

- Background thật trên điện thoại cần Phase 2 (Capacitor background geolocation);
  hiện tại tab nền vẫn bị trình duyệt throttle.
- `delivery-flow.ts` snap toạ độ về merchant/customer trước khi gọi API trong một
  số bước → lịch sử có thể bị "nhảy"; nên dùng GPS thô cho `location` endpoint.
- Room `order:<orderId>` hiện chỉ yêu cầu JWT hợp lệ (chưa kiểm tra user có
  thuộc đơn hay không) — cần siết lại khi mở cho admin/điều phối.
