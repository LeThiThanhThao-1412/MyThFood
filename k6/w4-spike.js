// =============================================================================
// W4 — ĐỘT BIẾN TẢI (giao thức §6.3): 0 → 60 rps trong 60 s → giữ 120 s → 0
//
// Khác W2 ở chỗ: KHÔNG có giai đoạn warm-up riêng (bản thân đoạn tăng tải là
// phép thử), và mỗi lần đặt đơn lỗi đầu tiên được ghi lại kèm thời điểm xuất
// hiện (giây tính từ lúc scenario bắt đầu) — đây là số liệu của Bảng VII.
//
// Chạy:
//   docker compose -f docker-compose.yml -f docker-compose.research.yml \
//     --profile load run --rm -e RUN_ID=E1-W4-r1 k6 run /work/w4-spike.js
// =============================================================================
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import {
  ORDER_URL,
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

const spikeLatency = new Trend("w4_place_latency", true);
const spikeErrors = new Rate("w4_place_errors");
const firstErrorOffset = new Trend("w4_first_error_offset_ms");

// Mỗi VU giữ cờ riêng: chỉ lần lỗi ĐẦU TIÊN của VU đó được ghi.
let firstErrorRecorded = false;

export const options = {
  setupTimeout: "8m",
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 120,
      maxVUs: 500,
      // W4 KHÔNG có warm-up riêng: chính đoạn tăng tải là phép thử.
      stages: [
        { target: rate("W4_RATE", 60), duration: stage("RAMP_SECONDS", 60) }, // 0 → 60 rps
        {
          target: rate("W4_RATE", 60),
          duration: stage("MEASURE_SECONDS", 120),
        }, // giữ đỉnh
        { target: 0, duration: stage("DOWNTIME_SECONDS", 10) },
      ],
    },
  },
  thresholds: {
    // Ngưỡng chỉ để cảnh báo; harness chấp nhận mã thoát 99 (ngưỡng bị vượt).
    http_req_failed: ["rate<0.10"],
    w4_place_errors: ["rate<0.10"],
  },
};

export function setup() {
  return loginAll(users, "consumerId");
}

export default function (data) {
  const me = forVU(data);

  const res = http.post(
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
      tags: { step: "place", profile: "W4", run: RUN_ID },
    },
  );

  spikeLatency.add(res.timings.duration);
  spikeErrors.add(res.status !== 201);
  check(res, { "tao don 201": (r) => r.status === 201 });

  if (res.status !== 201 && !firstErrorRecorded) {
    firstErrorRecorded = true;
    firstErrorOffset.add(Date.now() - exec.scenario.startTime);
  }
}
