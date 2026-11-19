/**
 * Cấu hình test cho @mythfood/instrumentation.
 * Chạy: pnpm --filter @mythfood/instrumentation test
 */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  testEnvironment: "node",
};
