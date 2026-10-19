import {
  MAX_ACTIVE_ORDERS_ENV,
  isActiveOrderLimitReached,
  resolveMaxActiveOrdersPerConsumer,
} from "../../modules/order/domain/concurrent-order.policy";

describe("Concurrent order policy", () => {
  const originalEnv = process.env[MAX_ACTIVE_ORDERS_ENV];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[MAX_ACTIVE_ORDERS_ENV];
    } else {
      process.env[MAX_ACTIVE_ORDERS_ENV] = originalEnv;
    }
  });

  describe("resolveMaxActiveOrdersPerConsumer", () => {
    it("mặc định không giới hạn khi không cấu hình", () => {
      delete process.env[MAX_ACTIVE_ORDERS_ENV];
      expect(resolveMaxActiveOrdersPerConsumer()).toBe(0);
    });

    it("không giới hạn khi cấu hình 0, số âm hoặc giá trị rỗng", () => {
      expect(resolveMaxActiveOrdersPerConsumer(undefined)).toBe(0);
      expect(resolveMaxActiveOrdersPerConsumer("")).toBe(0);
      expect(resolveMaxActiveOrdersPerConsumer("0")).toBe(0);
      expect(resolveMaxActiveOrdersPerConsumer("-5")).toBe(0);
    });

    it("không giới hạn khi giá trị không phải số", () => {
      expect(resolveMaxActiveOrdersPerConsumer("abc")).toBe(0);
      expect(resolveMaxActiveOrdersPerConsumer(NaN as any)).toBe(0);
    });

    it("đọc trần hợp lệ từ biến môi trường", () => {
      process.env[MAX_ACTIVE_ORDERS_ENV] = "3";
      expect(resolveMaxActiveOrdersPerConsumer()).toBe(3);
      expect(resolveMaxActiveOrdersPerConsumer("5")).toBe(5);
    });

    it("làm tròn xuống số nguyên khi cấu hình số thập phân", () => {
      expect(resolveMaxActiveOrdersPerConsumer("2.9")).toBe(2);
    });
  });

  describe("isActiveOrderLimitReached", () => {
    it("luôn cho phép khi không giới hạn (0)", () => {
      expect(isActiveOrderLimitReached(0, 0)).toBe(false);
      expect(isActiveOrderLimitReached(10, 0)).toBe(false);
    });

    it("chưa chạm trần thì còn được đặt thêm", () => {
      expect(isActiveOrderLimitReached(0, 3)).toBe(false);
      expect(isActiveOrderLimitReached(2, 3)).toBe(false);
    });

    it("chạm hoặc vượt trần thì chặn đặt thêm", () => {
      expect(isActiveOrderLimitReached(3, 3)).toBe(true);
      expect(isActiveOrderLimitReached(4, 3)).toBe(true);
    });
  });
});
