// =============================================================================
// W3 — VÒNG ĐỜI MỘT ĐƠN (giao thức §6.3; là workload của E2/E3 theo §0.1/L1)
//
// Trình tự đo, mỗi bước một Trend riêng:
//   POST   /api/v1/orders                    (CONSUMER)  → 201
//   PATCH  /api/v1/orders/:id/confirm        (MERCHANT_OWNER)
//   PATCH  /api/v1/orders/:id/preparing      (MERCHANT_OWNER)
//   PATCH  /api/v1/orders/:id/ready          (MERCHANT_OWNER)
//   PATCH  /api/v1/orders/:id/out-for-delivery (DRIVER, body bắt buộc có driverId)
//   PATCH  /api/v1/orders/:id/delivered      (DRIVER, body bắt buộc có photoUrl
//                                             khi orderType = DELIVERY)
// Hai ràng buộc body cuối được xác nhận bằng lần chạy thật ngày 11/11/2026
// (`order.service.ts` ném lỗi nếu thiếu), không phải suy đoán từ tài liệu.
//
// Chạy:
//   docker compose -f docker-compose.yml -f docker-compose.research.yml \
//     --profile load run --rm -e RUN_ID=E3-W3-http-r1 k6 run /work/w3-lifecycle.js
// Tham số phụ: STEP_SLEEP_SECONDS (mặc định 1) — thời gian chờ giữa các bước.
// =============================================================================
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import {
  ORDER_URL,
  RUN_ID,
  STEP_SLEEP_SECONDS,
  forVU,
  jsonHeaders,
  loginAll,
  rate,
  stage,
} from "./lib/common.js";

const users = new SharedArray("users", () =>
  JSON.parse(open("./data/users.json")),
);
const merchants = new SharedArray("merchants", () =>
  JSON.parse(open("./data/merchants.json")),
);
const drivers = new SharedArray("drivers", () =>
  JSON.parse(open("./data/drivers.json")),
);

const placeLatency = new Trend("w3_place_latency", true);
const confirmLatency = new Trend("w3_confirm_latency", true);
const preparingLatency = new Trend("w3_preparing_latency", true);
const readyLatency = new Trend("w3_ready_latency", true);
const outLatency = new Trend("w3_out_latency", true);
const deliveredLatency = new Trend("w3_delivered_latency", true);
const cycleLatency = new Trend("w3_cycle_latency", true);
const stepErrors = new Rate("w3_step_errors");

export const options = {
  // 170 lần đăng nhập (100 khách + 50 chủ quán + 20 tài xế) trong setup().
  setupTimeout: "8m",
  scenarios: {
    lifecycle: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 80,
      maxVUs: 300,
      stages: [
        { target: 2, duration: stage("WARMUP_SECONDS", 60) }, // loại khỏi phân tích (§11.2)
        { target: rate("W3_RATE", 3), duration: stage("RAMP_SECONDS", 60) },
        { target: rate("W3_RATE", 3), duration: stage("MEASURE_SECONDS", 180) },
        { target: 0, duration: stage("DOWNTIME_SECONDS", 10) },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    w3_step_errors: ["rate<0.02"],
  },
};

export function setup() {
  const merchantLogins = loginAll(merchants, "merchantId");
  const driverLogins = loginAll(drivers, "driverId");

  // Mỗi khách hàng i dùng quán ((i-1) % 50) + 1 và tài xế ((i-1) % 20) + 1 —
  // đúng ánh xạ của scripts/research/sql/export-consumers.sql.
  return loginAll(users, "consumerId", (row) => {
    const m = merchantLogins[(row.consumerIndex - 1) % merchantLogins.length];
    const d = driverLogins[(row.consumerIndex - 1) % driverLogins.length];
    return {
      merchantToken: m.token,
      driverId: d.driverId,
      driverToken: d.token,
    };
  });
}

function patchStep(path, body, token, latency) {
  const res = http.patch(
    `${ORDER_URL}/api/v1/orders/${path}`,
    JSON.stringify(body || {}),
    {
      headers: jsonHeaders(token),
      tags: { step: path.split("/").pop(), profile: "W3", run: RUN_ID },
    },
  );
  latency.add(res.timings.duration);
  stepErrors.add(res.status >= 400);
  return res.status;
}

export default function (data) {
  const me = forVU(data);
  const startedAt = Date.now();

  const place = http.post(
    `${ORDER_URL}/api/v1/orders`,
    JSON.stringify({
      consumerId: me.consumerId,
      merchantId: me.merchantId,
      orderType: "DELIVERY",
      items: [
        {
          menuItemId: me.menuItemId,
          name: me.itemName,
          quantity: 1,
          unitPrice: me.unitPrice,
        },
      ],
      deliveryAddress: me.address,
      deliveryLatitude: me.latitude,
      deliveryLongitude: me.longitude,
      paymentMethod: "COD",
      deliveryOption: "SAVER",
    }),
    {
      headers: jsonHeaders(me.token),
      tags: { step: "place", profile: "W3", run: RUN_ID },
    },
  );
  placeLatency.add(place.timings.duration);
  stepErrors.add(place.status !== 201);
  check(place, { "tao don 201": (r) => r.status === 201 });
  if (place.status !== 201) return; // không có orderId thì không đi tiếp

  const orderId = place.json("id");
  sleep(STEP_SLEEP_SECONDS);

  if (
    patchStep(`${orderId}/confirm`, {}, me.merchantToken, confirmLatency) >= 400
  )
    return;
  sleep(STEP_SLEEP_SECONDS);

  if (
    patchStep(`${orderId}/preparing`, {}, me.merchantToken, preparingLatency) >=
    400
  )
    return;
  sleep(STEP_SLEEP_SECONDS);

  if (patchStep(`${orderId}/ready`, {}, me.merchantToken, readyLatency) >= 400)
    return;
  sleep(STEP_SLEEP_SECONDS);

  if (
    patchStep(
      `${orderId}/out-for-delivery`,
      { driverId: me.driverId },
      me.driverToken,
      outLatency,
    ) >= 400
  )
    return;
  sleep(STEP_SLEEP_SECONDS);

  const finalStatus = patchStep(
    `${orderId}/delivered`,
    { photoUrl: "https://example.invalid/bang-chung-giao-hang.jpg" },
    me.driverToken,
    deliveredLatency,
  );
  if (finalStatus < 400) {
    cycleLatency.add(Date.now() - startedAt);
  }
}
