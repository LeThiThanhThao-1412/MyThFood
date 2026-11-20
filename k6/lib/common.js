// =============================================================================
// Tiện ích dùng chung cho các workload k6 (W1–W4)
//
// Ba điều dưới đây được ĐO trên hệ thống thật ngày 11/11/2026, không phải suy đoán:
//   1. Đăng nhập nhận `phoneNumber` + `password` (KHÔNG phải email) và trả
//      HTTP 201 với body `{ statusCode, data: { accessToken, ... } }`.
//   2. identity-service có ThrottlerGuard toàn cục 3 request/giây cho mỗi route
//      ⇒ đăng nhập hàng loạt trong `setup()` sẽ dính 429 nếu overlay không đặt
//      `THROTTLE_TTL=0` (§2.2, docker-compose.research.yml). Hàm `login()` dưới
//      đây chờ 1,1 s rồi thử lại để vẫn chạy được khi throttle còn bật.
//   3. Chỉ các mã 4xx được liệt kê mới không bị tính vào `http_req_failed`;
//      đặt ở init context nên phải gọi ngay khi module được nạp.
// =============================================================================
import http from "k6/http";

export const IDENTITY_URL =
  __ENV.IDENTITY_URL || "http://identity-service:3001";
export const ORDER_URL = __ENV.BASE_URL || "http://order-service:3004";
export const MERCHANT_URL =
  __ENV.MERCHANT_URL || "http://merchant-service:3003";
export const RUN_ID = __ENV.RUN_ID || "adhoc";
export const STEP_SLEEP_SECONDS = Number(__ENV.STEP_SLEEP_SECONDS || 1);

http.setResponseCallback(
  http.expectedStatuses(200, 201, 400, 401, 403, 404, 409, 422),
);

export function jsonHeaders(token) {
  return {
    "Content-Type": "application/json",
    "x-run-id": RUN_ID,
    // Truy vết: gắn mã duy nhất cho từng vòng lặp để hops.jsonl phân biệt được
    // hop do tải sinh ra với hop nền (cron/hàng đợi, có traceId "-").
    "x-trace-id": `${RUN_ID}-vu${__VU}-it${__ITER}`,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function waitMs(ms) {
  // Vòng chờ đồng bộ: `sleep()` của k6 không dùng được trong setup().
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* chờ */
  }
}

/**
 * Đăng nhập lấy access token. Trả `null` nếu thất bại.
 * Thử lại tối đa `attempts` lần, cách nhau 1,1 s (cửa sổ throttle ngắn nhất).
 */
export function login(phoneNumber, password, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const res = http.post(
      `${IDENTITY_URL}/api/v1/auth/login`,
      JSON.stringify({ phoneNumber, password }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { phase: "setup" },
      },
    );
    if (res.status === 200 || res.status === 201) {
      const body = res.json();
      const token = body?.data?.accessToken;
      if (token) return token;
    }
    // 429 = throttle; các mã khác (401/404) là lỗi dữ liệu, thử lại vô ích.
    if (res.status !== 429 || i === attempts) break;
    waitMs(1100);
  }
  return null;
}

/**
 * Đăng nhập cho cả một danh sách, gắn token vào bản sao của từng bản ghi.
 *
 * Vì sao theo lô: bcrypt cost 12 tốn ~130–500 ms/lần đăng nhập, nên 170 tài
 * khoản (100 khách + 50 chủ quán + 20 tài xế của W3) đăng nhập tuần tự vượt
 * giới hạn `setupTimeout` mặc định 60 s — đã quan sát thấy khi chạy thử. Gửi
 * theo lô 8 yêu cầu song song rồi thử lại tuần tự các tài khoản lỗi.
 *
 * `keyField` là trường dùng để báo lỗi (ví dụ `consumerId`).
 */
export function loginAll(rows, keyField, extra = () => ({}), batchSize = 8) {
  const tokens = new Array(rows.length).fill(null);

  const take = (res, index) => {
    if (res.status === 200 || res.status === 201) {
      const token = res.json()?.data?.accessToken;
      if (token) tokens[index] = token;
    }
  };

  for (let start = 0; start < rows.length; start += batchSize) {
    const slice = rows.slice(start, start + batchSize);
    const responses = http.batch(
      slice.map((row) => ({
        method: "POST",
        url: `${IDENTITY_URL}/api/v1/auth/login`,
        body: JSON.stringify({
          phoneNumber: row.phoneNumber,
          password: row.password,
        }),
        params: {
          headers: { "Content-Type": "application/json" },
          tags: { phase: "setup" },
        },
      })),
    );
    responses.forEach((res, i) => take(res, start + i));
  }

  // Thử lại tuần tự các tài khoản lỗi (429 do throttle, hoặc lỗi tạm thời).
  const failedIndexes = [];
  rows.forEach((row, index) => {
    if (tokens[index]) return;
    const token = login(row.phoneNumber, row.password);
    if (token) tokens[index] = token;
    else failedIndexes.push(index);
  });

  if (failedIndexes.length > 0) {
    const sample = failedIndexes
      .slice(0, 3)
      .map((i) => rows[i][keyField] ?? rows[i].phoneNumber)
      .join(", ");
    throw new Error(
      `Đăng nhập thất bại ${failedIndexes.length}/${rows.length} tài khoản (${sample}...). ` +
        `Chạy scripts/research/seed-loadtest.ps1 và kiểm tra THROTTLE_TTL trong ` +
        `docker-compose.research.yml.`,
    );
  }

  return rows.map((row, index) => ({
    ...row,
    token: tokens[index],
    ...extra(row, index),
  }));
}

/** Chọn bản ghi theo VU để mỗi VU dùng một khách hàng riêng (§6.2). */
export function forVU(rows) {
  return rows[(__VU - 1) % rows.length];
}

/**
 * Độ dài một giai đoạn, ghi đè được bằng biến môi trường để chạy kiểm tra nhanh
 * (ví dụ `-e WARMUP_SECONDS=5 -e RAMP_SECONDS=10 -e MEASURE_SECONDS=30`).
 * Giá trị mặc định = đúng giao thức §6.2/§6.3 cho ra số liệu vào bảng.
 */
export function stage(envName, fallbackSeconds) {
  return `${Number(__ENV[envName] || fallbackSeconds)}s`;
}

/**
 * Tốc độ đến (request/giây) của một hồ sơ, ghi đè được bằng biến môi trường.
 *
 * Vì sao các hồ sơ KHÔNG cùng một mức: trần CPU của mỗi dịch vụ là 1,0 CPU
 * (docker-compose.research.yml). Chạy thử W3 ở 10 rps cho thấy p50 mỗi bước
 * 2,5–3 s và 82 lượt bị bỏ — order-service cùng Postgres đã bão hoà, nên độ
 * trễ đo được là thời gian xếp hàng chứ không phải chi phí kiến trúc. E2/E3
 * cần vùng KHÔNG bão hoà và phải giống nhau ở M2 lẫn B1, nên W3 mặc định 3 rps.
 */
export function rate(envName, fallbackPerSecond) {
  return Number(__ENV[envName] || fallbackPerSecond);
}
