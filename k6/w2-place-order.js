// =============================================================================
// W2 — ĐẶT MỘT ĐƠN (giao thức §6.2)
//
// Payload đúng theo `PlaceOrderDto` thật của order-service:
//   { consumerId, merchantId, orderType, items[{menuItemId,name,quantity,unitPrice}],
//     deliveryAddress, deliveryLatitude, deliveryLongitude, paymentMethod, deliveryOption }
// Có toạ độ ⇒ order-service gọi merchant-service lấy toạ độ quán (hop thật cho E2);
// `paymentMethod: COD` để không phụ thuộc số dư ví của khách.
//
// Chạy:
//   docker compose -f docker-compose.yml -f docker-compose.research.yml \
//     --profile load run --rm -e RUN_ID=E1-W2-r1 k6 run /work/w2-place-order.js
// =============================================================================
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";
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

const orderLatency = new Trend("place_order_latency", true);
const orderErrors = new Rate("place_order_errors");

export const options = {
  setupTimeout: "8m",
  scenarios: {
    place_order: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 300,
      stages: [
        { target: 2, duration: stage("WARMUP_SECONDS", 60) }, // loại khỏi phân tích (§11.2)
        { target: rate("W2_RATE", 10), duration: stage("RAMP_SECONDS", 60) },
        {
          target: rate("W2_RATE", 10),
          duration: stage("MEASURE_SECONDS", 180),
        },
        { target: 0, duration: stage("DOWNTIME_SECONDS", 10) },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    place_order_errors: ["rate<0.01"],
  },
};

export function setup() {
  // 100 khách hàng riêng biệt — mỗi VU một khách (§6.2).
  return loginAll(users, "consumerId");
}

export function placeOrder(me) {
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
    tags: { step: "place", profile: "W2", run: RUN_ID },
  });
}

export default function (data) {
  const me = forVU(data);
  const res = placeOrder(me);

  orderLatency.add(res.timings.duration);
  orderErrors.add(res.status !== 201);
  check(res, { "tao don 201": (r) => r.status === 201 });
}
