// Kiểm tra parity dữ liệu giữa handler in-process (đọc thẳng Postgres)
// và endpoint HTTP thật.
//
// Chạy:
//   docker cp scripts/research/parity-check.js mythfood-order-service:/app/parity-check.js
//   docker exec -w /app mythfood-order-service node parity-check.js
// (đặt trong /app để Node phân giải được `pg`/axios của image; không dùng /logs
//  vì thư mục đó gắn vào repo, tệp tạm sẽ làm bẩn mã nguồn)
//
// ID và khoá dịch vụ lấy từ biến môi trường để không phải sửa mã khi dữ liệu
// seed thay đổi; giá trị mặc định là bản ghi seed đã dùng cho báo cáo 11/11/2026.
const path = require("node:path");
const { pgReadHandlers } = require(
  path.join("/app/packages/instrumentation/dist", "index.js"),
);

const CID =
  process.env.BENCH_CONSUMER_ID || "d5e53af5-60bd-45c5-b7a2-cb50d1d3cb0b";
const MID =
  process.env.BENCH_MERCHANT_ID || "21b76b38-00fa-4c82-a68a-79ad754a012d";
const KEY = process.env.SERVICE_API_KEY || "3c1b7f539b204af7af26f378d67e9eb1";

async function viaHttp(kind, id) {
  const host =
    kind === "consumer"
      ? "http://consumer-service:3002"
      : "http://merchant-service:3003";
  const res = await fetch(`${host}/api/v1/${kind}s/${id}`, {
    headers: { "x-service-key": KEY },
  });
  return res.json();
}

const keys = (o) => Object.keys(o).sort();
const diff = (a, b) => ({
  onlyHttp: keys(a).filter((k) => !keys(b).includes(k)),
  onlyInproc: keys(b).filter((k) => !keys(a).includes(k)),
});

(async () => {
  const [consumerRoute, merchantRoute] = pgReadHandlers();
  const consumerLocal = await consumerRoute.handler({
    path: `/api/v1/consumers/${CID}`,
  });
  const merchantLocal = await merchantRoute.handler({
    path: `/api/v1/merchants/${MID}`,
  });

  const consumerHttp = await viaHttp("consumer", CID);
  const merchantHttp = await viaHttp("merchant", MID);

  console.log("CONSUMER_ENVELOPE_OK", consumerLocal.data.statusCode === 200);
  console.log(
    "CONSUMER_KEY_DIFF",
    JSON.stringify(diff(consumerHttp.data, consumerLocal.data.data)),
  );
  console.log(
    "CONSUMER_EQUAL",
    JSON.stringify(consumerHttp.data) ===
      JSON.stringify(consumerLocal.data.data),
  );
  console.log(
    "MERCHANT_KEY_DIFF",
    JSON.stringify(diff(merchantHttp, merchantLocal.data)),
  );
  console.log(
    "MERCHANT_HTTP",
    JSON.stringify({
      lat: merchantHttp.latitude,
      lng: merchantHttp.longitude,
      rating: merchantHttp.rating,
      orders: merchantHttp.totalOrders,
    }),
  );
  console.log(
    "MERCHANT_INPROC",
    JSON.stringify({
      lat: merchantLocal.data.latitude,
      lng: merchantLocal.data.longitude,
      rating: merchantLocal.data.rating,
      orders: merchantLocal.data.totalOrders,
    }),
  );
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e && e.message ? e.message : e);
  process.exit(1);
});
