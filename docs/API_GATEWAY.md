# Kong Gateway (DB-less) - MyThFood

HTTP API của 15 microservice đi qua **một điểm vào duy nhất**: `http://localhost:8000`.
WebSocket (socket.io) **vẫn gọi trực tiếp** từng service — xem mục [WebSocket](#websocket).

```
Next.js apps ──HTTP──> Kong :8000 ──route theo path──> 15 NestJS services
             ──WS────> order-service :3004 (/socket.io)
                       chat-service  :3015 (/chat)
                       driver-service:3007 (/tracking)
```

## 1. Chạy

```bash
docker compose up -d postgres redis   # hạ tầng
docker compose up -d gateway          # gateway (DB-less, không cần DB)
docker compose up -d                  # toàn bộ hệ thống
curl http://localhost:8000/gateway/health   # -> 200 "mythfood gateway ok"

pwsh scripts/test-gateway.ps1         # smoke test toàn bộ route + auth + upload + webhook
```

Gateway dùng image `kong:3.9.4`, cấu hình khai báo trong `docker/kong/kong.yml`
(mount read-only vào `/kong/kong.yml`). Không có Admin GUI/DB; `8001` chỉ để
reload config ở máy dev.

## 2. Bảng route

| Prefix                                                                                            | Service              | Cổng nội bộ |
| ------------------------------------------------------------------------------------------------- | -------------------- | ----------- |
| `/api/v1/auth`                                                                                    | identity-service     | 3001        |
| `/api/v1/consumers`                                                                               | consumer-service     | 3002        |
| `/api/v1/merchants`, `/api/v1/health`                                                             | merchant-service     | 3003        |
| `/api/v1/orders`, `/api/v1/order-change-requests`, `/api/v1/shipping`                             | order-service        | 3004        |
| `/api/v1/inventory`                                                                               | inventory-service    | 3005        |
| `/api/v1/payments`                                                                                | payment-service      | 3006        |
| `/api/v1/drivers`                                                                                 | driver-service       | 3007        |
| `/api/v1/dispatches`                                                                              | dispatch-service     | 3008        |
| `/api/v1/wallets`                                                                                 | wallet-service       | 3009        |
| `/api/v1/upload`                                                                                  | upload-service       | 3010        |
| `/api/v1/reviews`                                                                                 | review-service       | 3011        |
| `/api/v1/promotions`                                                                              | promotion-service    | 3012        |
| `/api/v1/notifications`                                                                           | notification-service | 3013        |
| `/api/v1/cases`, `/api/v1/assistant`, `/api/v1/penalties`, `/api/v1/fraud-rules`, `/api/v1/fraud` | resolution-service   | 3014        |
| `/api/v1/chat`                                                                                    | chat-service         | 3015        |

Tất cả route đặt `strip_path: false` nên controller bên trong nhận đúng path
`/api/v1/...` như khi gọi trực tiếp.

## 3. Frontend dùng gateway

`packages/api-client/src/base-url.ts` là nơi duy nhất quyết định base URL:

```ts
resolveApiBase(servicePort);
// NEXT_PUBLIC_API_GATEWAY=http://localhost:8000  -> mọi service dùng chung gateway
// NEXT_PUBLIC_API_GATEWAY=http://localhost:3001  -> chế độ cũ: gọi thẳng :<port>
```

`.env.local` của từng app:

```dotenv
NEXT_PUBLIC_API_GATEWAY=http://localhost:8000
NEXT_PUBLIC_WS_URL=http://localhost:3004
NEXT_PUBLIC_CHAT_WS_URL=http://localhost:3015/chat
NEXT_PUBLIC_DRIVER_WS_URL=http://localhost:3007/tracking
```

Sau khi đổi `.env.local` phải restart `next dev` (biến `NEXT_PUBLIC_*` được nhúng
lúc build).

`apps/admin-portal` không có `.env.local`: nó dùng đúng giá trị mặc định trong
`base-url.ts` (`http://localhost:8000`) nên cũng đi qua gateway. Nếu cần trỏ sang
host khác thì phải tạo `.env.local` cho riêng nó (file này đang bị `.gitignore`).

## 4. Plugin và lý do

| Plugin                | Phạm vi                                                              | Lý do                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `correlation-id`      | toàn cục (`x-trace-id`)                                              | Bảo đảm mọi request có `x-trace-id` khớp `packages/instrumentation`. Nếu client đã gửi header, Kong **giữ nguyên**; ngược lại sinh UUID. `x-run-id` đi xuyên không bị sửa. |
| `rate-limiting`       | route `/api/v1/auth/login`, `/api/v1/auth/register` (60 req/phút/IP) | Chặn dò mật khẩu. Không áp cho `/auth/me` + `/auth/refresh` vì mỗi tab đều gọi khi tải trang → dễ 429.                                                                     |
| `request-termination` | route `/gateway/health`                                              | Smoke-test gateway khi chưa có upstream nào sống.                                                                                                                          |

**Không dùng (có chủ đích):**

- `jwt`: access token không có `iss`/`aud`, payload chỉ có `sub`/`roles` nên không
  map được với `consumer` + `jwt_secret` của Kong OSS (sẽ phải tạo 1 consumer cho
  mỗi user). Các service vẫn tự verify JWT như hiện tại.
- `cors`: 15 service đều đã `enableCors()` trong `main.ts`; thêm plugin nữa sẽ sinh
  `Access-Control-Allow-Origin` trùng → browser chặn.
- Bất kỳ plugin đọc/ghi body (`request-transformer`...): làm hỏng raw body của
  webhook Stripe và request multipart của upload-service.

Cấu hình nginx trong compose (không phải plugin):

- `proxy_request_buffering off`, `client_max_body_size 0`: upload 100MB và webhook
  Stripe đi thẳng tới upstream.
- `proxy_read_timeout/send_timeout 300s`: AI phân tích khiếu nại có thể chạy quá
  60s mặc định của nginx (nếu không sẽ 504).
- `worker_processes 1` (`KONG_NGINX_WORKER_PROCESSES`): `rate-limiting` dùng
  `policy: local` nên bộ đếm nằm trong từng worker. Chạy nhiều worker thì mức
  60 req/phút/IP bị nhân lên theo số worker; 1 worker giữ đúng con số này và
  vẫn thừa cho 4 frontend ở môi trường dev. Muốn nhiều worker + đếm chính xác
  thì đổi `policy` sang `redis` (cần `REDIS_PASSWORD` của `mythfood-redis`).

**URL file upload:** upload-service trả URL tuyệt đối (`UPLOAD_BASE_URL`), nên
`docker-compose.yml` đặt `UPLOAD_BASE_URL=http://localhost:8000` để ảnh cũng đi
qua gateway thay vì trỏ thẳng `:3010`.

## 5. WebSocket

Cả 3 socket server dùng path mặc định `/socket.io/`; namespace (`/chat`,
`/tracking`) nằm trong payload handshake chứ không phải path URL, nên Kong không
thể phân biệt được chúng. Vì vậy WS vẫn gọi trực tiếp:

```dotenv
NEXT_PUBLIC_WS_URL=http://localhost:3004
NEXT_PUBLIC_CHAT_WS_URL=http://localhost:3015/chat
NEXT_PUBLIC_DRIVER_WS_URL=http://localhost:3007/tracking
```

Muốn đưa WS qua gateway: đặt `path` riêng cho từng server (ví dụ
`new WebSocketGateway({ path: "/ws/chat" })`), thêm route Kong với
`protocols: [ws, wss]`, rồi truyền `{ path: "/ws/chat" }` ở client.

## 6. Sửa & nạp lại cấu hình

```bash
# 1. Kiểm tra cú pháp (không cần chạy Kong; cần KONG_DATABASE=off, nếu không Kong
#    sẽ cố kết nối PostgreSQL và báo "connection refused")
docker run --rm -e KONG_DATABASE=off -v "$PWD/docker/kong:/kong" kong:3.9.4 \
  kong config parse /kong/kong.yml

# 2. Nạp lại khi Kong đang chạy
curl -X POST http://localhost:8001/config \
  -H "Content-Type: text/yaml" \
  --data-binary @docker/kong/kong.yml

# 3. Hoặc đơn giản
docker compose restart gateway
```

`kong.yml` cố tình không dùng biến môi trường: upstream là DNS nội bộ Docker
network cố định trong `docker-compose.yml`.

## 7. Troubleshooting

| Hiện tượng                                             | Nguyên nhân thường gặp                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `404 {"message":"no Route matched with those paths."}` | Prefix chưa có trong `kong.yml`, hoặc sai `/api/v1/...`                   |
| `502` invalid response from upstream                   | Service đích chưa chạy / sai tên container                                |
| `401 Unauthorized`                                     | Đã tới service — lỗi token, không phải lỗi gateway                        |
| Browser báo CORS                                       | Kiểm tra `CORS_ORIGINS` của service, **đừng** bật plugin `cors` trên Kong |
| Request treo rồi `504`                                 | Vượt `proxy_read_timeout`; tăng trong compose nếu endpoint chạy lâu       |

## 8. Kiểm chứng nhanh

Script tự động (khuyến nghị, 35 kiểm tra: route 15 service, đăng ký/đăng nhập/me,
`x-trace-id`, upload multipart, Stripe webhook, rate-limit):

```powershell
pwsh scripts/test-gateway.ps1                    # bỏ qua rate-limit
pwsh scripts/test-gateway.ps1 -IncludeRateLimit  # thêm 65 request login
```

Kiểm tra tay:

```bash
curl -i http://localhost:8000/gateway/health                  # 200
curl -i http://localhost:8000/api/v1/auth/login -X POST \
  -H "Content-Type: application/json" -d '{}'                 # 4xx từ identity-service = đã route
curl -i http://localhost:8000/api/v1/khong-ton-tai            # 404 của Kong
```

Kết quả đã chạy thực tế (2026-11-17): `PASS: 35 FAIL: 0` — 22 prefix đều tới
đúng service (401/200/302/404-của-Nest), login qua gateway trả JWT dùng được cho
`/auth/me`, upload multipart 201 kèm URL `http://localhost:8000/api/v1/upload/...`,
webhook Stripe có chữ ký hợp lệ được payment-service xác minh (raw body nguyên
vẹn), `x-trace-id` của client được giữ nguyên, 429 xuất hiện ở request login thứ
60 trong cùng cửa sổ 1 phút.
