// =============================================================================
// E5 — ĐẶT ĐƠN CÓ TIÊM LỖI (giao thức §8.2)
//
// Một run gồm HAI giai đoạn liên tiếp, mỗi giai đoạn một scenario riêng:
//   baseline: 0 → 120 s, 5 đơn/s  (không có lỗi — mốc so sánh)
//   fault   : 120 s → 300 s, 5 đơn/s (lỗi đã được bật ở giây thứ ~125)
//
// Vì sao tách thành hai scenario thay vì một: k6 gộp điểm của metric theo tên,
// nên nếu dùng chung một Trend thì không tách được giai đoạn lỗi khỏi baseline.
// Hai scenario ⇒ hai bộ metric riêng (`e5_baseline_*`, `e5_fault_*`).
//
// Chỉ số của Bảng VIII là TỈ LỆ ĐƠN HOÀN TẤT trong giai đoạn lỗi
// (`e5_fault_completed`), so với baseline (`e5_baseline_completed`).
//
// Chạy (harness tự gắn -e tương ứng):
//   docker compose ... --profile load run --rm -e RUN_ID=E5-F1-r1 k6 run /work/e5-fault.js
// =============================================================================
import http from "k6/http";
import { Trend, Rate } from "k6/metrics";
import { SharedArray } from "k6/data";
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

// Mốc thời gian hai giai đoạn (giây). Harness ghi cùng giá trị vào meta.json để
// đối chiếu với thời điểm bật/tắt lỗi thật trong logs/<RUN_ID>/fault.json.
const BASELINE_SECONDS = Number(__ENV.BASELINE_SECONDS || 120);

const baselineLatency = new Trend("e5_baseline_latency", true);
const faultLatency = new Trend("e5_fault_latency", true);
const baselineCompleted = new Rate("e5_baseline_completed");
const faultCompleted = new Rate("e5_fault_completed");
const baselineErrors = new Rate("e5_baseline_errors");
const faultErrors = new Rate("e5_fault_errors");

export const options = {
  setupTimeout: "8m",
  scenarios: {
    baseline: {
      executor: "constant-arrival-rate",
      exec: "baselineOrder",
      startTime: "0s",
      rate: rate("E5_RATE", 5),
      timeUnit: "1s",
      duration: stage("BASELINE_SECONDS", 120),
      preAllocatedVUs: 20,
      maxVUs: 120,
      tags: { phase: "baseline" },
    },
    fault: {
      executor: "constant-arrival-rate",
      exec: "faultOrder",
      startTime: `${BASELINE_SECONDS}s`,
      rate: rate("E5_RATE", 5),
      timeUnit: "1s",
      duration: stage("FAULT_SECONDS", 180),
      preAllocatedVUs: 20,
      maxVUs: 120,
      tags: { phase: "fault" },
    },
  },
  // Không đặt ngưỡng: giai đoạn lỗi CHỦ Ý sinh lỗi, ngưỡng chỉ báo sai.
};

export function setup() {
  return loginAll(users, "consumerId");
}

function placeOrder(me, phase) {
  const payload = {
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
  };

  return http.post(`${ORDER_URL}/api/v1/orders`, JSON.stringify(payload), {
    headers: jsonHeaders(me.token),
    tags: { phase, profile: "E5", run: RUN_ID },
  });
}

function record(res, phase) {
  const created = res.status === 201;
  if (phase === "baseline") {
    baselineLatency.add(res.timings.duration);
    baselineCompleted.add(created);
    baselineErrors.add(!created);
  } else {
    faultLatency.add(res.timings.duration);
    faultCompleted.add(created);
    faultErrors.add(!created);
  }
}

export function baselineOrder(data) {
  record(placeOrder(forVU(data), "baseline"), "baseline");
}

export function faultOrder(data) {
  record(placeOrder(forVU(data), "fault"), "fault");
}
