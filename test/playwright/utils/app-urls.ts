/**
 * URL các app frontend dùng cho E2E test.
 * Mặc định khớp port trong apps/<app>/package.json (next dev/start -p <port>),
 * có thể override bằng env khi chạy CI hoặc môi trường khác.
 *
 * Lưu ý: merchant-app = 4002, driver-app = 4003 (không phải ngược lại).
 */
export const APP_URLS = {
  consumer: process.env.CONSUMER_APP_URL ?? "http://localhost:4001",
  merchant: process.env.MERCHANT_APP_URL ?? "http://localhost:4002",
  driver: process.env.DRIVER_APP_URL ?? "http://localhost:4003",
  admin: process.env.ADMIN_PORTAL_URL ?? "http://localhost:4004",
} as const;
