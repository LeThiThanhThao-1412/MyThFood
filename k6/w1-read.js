// =============================================================================
// W1 — DUYỆT NHÀ HÀNG (hồ sơ đọc, giao thức §6.3)
// Ba route đọc của merchant-service: danh sách → chi tiết → thực đơn.
//
// Chạy:
//   docker compose -f docker-compose.yml -f docker-compose.research.yml \
//     --profile load run --rm -e RUN_ID=E1-W1-r1 k6 run /work/w1-read.js
//
// Ghi chú: mọi route của merchant-service nằm sau `ServiceKeyOrJwtGuard`, nên
// MỌI yêu cầu phải có Bearer token. Token lấy trong `setup()` (một lần cho mỗi
// VU), không nằm trong `default()` — đăng nhập tốn ~130 ms vì bcrypt (§6.1).
// =============================================================================
import http from "k6/http";
import { check } from "k6";
import { Trend, Rate } from "k6/metrics";
import { SharedArray } from "k6/data";
import {
  MERCHANT_URL,
  RUN_ID,
  forVU,
  jsonHeaders,
  loginAll,
  rate,
  stage,
} from "./lib/common.js";

const users = new SharedArray("users", () =>
  JSON.parse(open("./data/users.json")),
);

const listLatency = new Trend("w1_list_latency", true);
const detailLatency = new Trend("w1_detail_latency", true);
const menuLatency = new Trend("w1_menu_latency", true);
const errors = new Rate("w1_errors");

export const options = {
  // 100–170 lần đăng nhập trong setup() (bcrypt cost 12) — mặc định 60 s là quá ngắn.
  setupTimeout: "8m",
  scenarios: {
    browse: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: [
        { target: 2, duration: stage("WARMUP_SECONDS", 60) }, // loại khỏi phân tích (§11.2)
        { target: rate("W1_RATE", 10), duration: stage("RAMP_SECONDS", 60) },
        {
          target: rate("W1_RATE", 10),
          duration: stage("MEASURE_SECONDS", 180),
        },
        { target: 0, duration: stage("DOWNTIME_SECONDS", 10) },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    w1_errors: ["rate<0.01"],
  },
};

export function setup() {
  // 100 khách hàng đã nạp bởi scripts/research/seed-loadtest.ps1.
  return loginAll(users, "consumerId");
}

export default function (data) {
  const me = forVU(data);
  const headers = jsonHeaders(me.token);
  const skip = (__ITER * 5) % 30;

  const list = http.get(
    `${MERCHANT_URL}/api/v1/merchants?take=20&skip=${skip}`,
    { headers, tags: { step: "list", profile: "W1", run: RUN_ID } },
  );
  listLatency.add(list.timings.duration);
  errors.add(list.status >= 400);
  check(list, { "danh sach 200": (r) => r.status === 200 });

  // Chi tiết + thực đơn của quán gắn với khách hàng này (mỗi VU một quán khác nhau).
  const detail = http.get(`${MERCHANT_URL}/api/v1/merchants/${me.merchantId}`, {
    headers,
    tags: { step: "detail", profile: "W1", run: RUN_ID },
  });
  detailLatency.add(detail.timings.duration);
  errors.add(detail.status >= 400);
  check(detail, { "chi tiet 200": (r) => r.status === 200 });

  const menu = http.get(
    `${MERCHANT_URL}/api/v1/merchants/${me.merchantId}/menu`,
    { headers, tags: { step: "menu", profile: "W1", run: RUN_ID } },
  );
  menuLatency.add(menu.timings.duration);
  errors.add(menu.status >= 400);
  check(menu, { "thuc don 200": (r) => r.status === 200 });
}
