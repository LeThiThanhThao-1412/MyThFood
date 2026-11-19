// =============================================================================
// W0 — KIỂM TRA KHÓI (Cổng 4 của §2.2): hệ thống sẵn sàng NGHIỆP VỤ trước khi đo.
// 1 VU / 30 s / 0 lỗi. Không đạt thì không chạy run đo nào.
//
// Chạy trong container (khuyến nghị):
//   docker compose -f docker-compose.yml -f docker-compose.research.yml \
//     --profile load run --rm k6 run /work/w0-smoke.js
//
// Ghi chú: 4xx KHÔNG phải lỗi ở đây (401 là hành vi đúng của guard), nên
// expectedStatuses liệt kê rõ các mã được coi là "phản hồi hợp lệ".
// =============================================================================
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://order-service:3004";
const IDENTITY = __ENV.IDENTITY_URL || "http://identity-service:3001";

// BẮT BUỘC khai báo ở init context (không phải key trong options):
// coi các mã 4xx sau đây là phản hồi HỢP LỆ để http_req_failed chỉ bắt 5xx/lỗi mạng.
http.setResponseCallback(
  http.expectedStatuses(200, 201, 400, 401, 403, 404, 422),
);

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate==0"], // Cổng 4: không có 5xx, không lỗi mạng
  },
};

export default function () {
  // 1) Guard đã nạp: gọi danh sách đơn khi chưa có token phải trả 401, không phải 500/404.
  const anon = http.get(`${BASE}/api/v1/orders`);
  check(anon, {
    "guard tra 401 (route + guard da nap)": (r) => r.status === 401,
  });

  // 2) Identity phản hồi: sai thông tin đăng nhập phải trả 4xx, không 5xx.
  const login = http.post(
    `${IDENTITY}/api/v1/auth/login`,
    JSON.stringify({
      email: "smoke@example.invalid",
      password: "khong-ton-tai",
    }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(login, {
    "identity phan hoi (khong 5xx)": (r) => r.status >= 400 && r.status < 500,
  });

  // Giữ nhịp ~5 yêu cầu/giây cho 1 VU; nếu không, vòng lặp tự do sẽ tạo hàng trăm req/s
  // và W0 không còn là "kiểm tra khói" nữa.
  sleep(0.2);
}
