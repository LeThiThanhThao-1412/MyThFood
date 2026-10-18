import {
  applyOptionToFee,
  computePromisedDeliveryAt,
  deliveryOptionLabel,
  estimateEtaMinutes,
  getDeliveryOptionPolicy,
  normalizeDeliveryOption,
  priorityRankOf,
} from "../../modules/order/domain/delivery-option";
import { Order } from "../../modules/order/domain/order.aggregate";

const ENV_KEYS = [
  "SAVER_FEE_FACTOR",
  "PRIORITY_FEE_FACTOR",
  "PRIORITY_SURCHARGE",
  "PRIORITY_MAX_FEE",
] as const;

const originalEnv = ENV_KEYS.reduce<Record<string, string | undefined>>(
  (acc, key) => {
    acc[key] = process.env[key];
    return acc;
  },
  {},
);

describe("Delivery options", () => {
  beforeEach(() => {
    process.env.SAVER_FEE_FACTOR = "0.8";
    process.env.PRIORITY_FEE_FACTOR = "1.3";
    process.env.PRIORITY_SURCHARGE = "10000";
    process.env.PRIORITY_MAX_FEE = "120000";
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  describe("normalizeDeliveryOption", () => {
    it("defaults to FAST when empty or invalid", () => {
      expect(normalizeDeliveryOption()).toBe("FAST");
      expect(normalizeDeliveryOption("invalid")).toBe("FAST");
      expect(normalizeDeliveryOption(null)).toBe("FAST");
    });

    it("accepts lowercase and whitespace", () => {
      expect(normalizeDeliveryOption(" priority ")).toBe("PRIORITY");
      expect(normalizeDeliveryOption("saver")).toBe("SAVER");
    });
  });

  describe("priorityRankOf / labels", () => {
    it("orders SAVER < FAST < PRIORITY", () => {
      expect(priorityRankOf("SAVER")).toBe(0);
      expect(priorityRankOf("FAST")).toBe(1);
      expect(priorityRankOf("PRIORITY")).toBe(2);
    });

    it("returns Vietnamese labels", () => {
      expect(deliveryOptionLabel("SAVER")).toBe("Tiết kiệm");
      expect(deliveryOptionLabel("FAST")).toBe("Nhanh");
      expect(deliveryOptionLabel("PRIORITY")).toBe("Ưu tiên");
    });
  });

  describe("applyOptionToFee", () => {
    const baseFee = 20000;

    it("SAVER giảm 20% so với phí chuẩn", () => {
      expect(applyOptionToFee(baseFee, "SAVER")).toBe(16000);
    });

    it("FAST giữ nguyên phí chuẩn", () => {
      expect(applyOptionToFee(baseFee, "FAST")).toBe(20000);
    });

    it("PRIORITY cộng 30% và phụ thu cố định", () => {
      expect(applyOptionToFee(baseFee, "PRIORITY")).toBe(36000);
    });

    it("không vượt mức phí tối đa của PRIORITY", () => {
      expect(applyOptionToFee(200000, "PRIORITY")).toBe(120000);
    });
  });

  describe("ETA / promised delivery", () => {
    it("SAVER lâu hơn FAST, PRIORITY không chậm hơn FAST", () => {
      const fast = estimateEtaMinutes(5, "FAST");
      const saver = estimateEtaMinutes(5, "SAVER");
      const priority = estimateEtaMinutes(5, "PRIORITY");

      expect(saver).toBeGreaterThan(fast);
      expect(priority).toBeLessThanOrEqual(fast);
    });

    it("promisedDeliveryAt nằm sau createdAt theo ETA", () => {
      const createdAt = new Date("2026-01-01T00:00:00.000Z");
      const promised = computePromisedDeliveryAt(createdAt, 4, "PRIORITY");

      expect(promised.getTime()).toBeGreaterThan(createdAt.getTime());
      expect(promised.getTime() - createdAt.getTime()).toBe(
        estimateEtaMinutes(4, "PRIORITY") * 60_000,
      );
    });
  });

  describe("delivery option policy", () => {
    it("PRIORITY có timeout điều phối ngắn hơn FAST", () => {
      expect(
        getDeliveryOptionPolicy("PRIORITY").dispatchTimeoutSeconds,
      ).toBeLessThan(getDeliveryOptionPolicy("FAST").dispatchTimeoutSeconds);
      expect(
        getDeliveryOptionPolicy("SAVER").dispatchTimeoutSeconds,
      ).toBeGreaterThan(getDeliveryOptionPolicy("FAST").dispatchTimeoutSeconds);
    });
  });
});

describe("Order aggregate with delivery option", () => {
  const baseProps = {
    consumerId: "550e8400-e29b-41d4-a716-446655440001",
    merchantId: "550e8400-e29b-41d4-a716-446655440002",
    orderType: "DELIVERY" as const,
    items: [
      {
        menuItemId: "550e8400-e29b-41d4-a716-446655440003",
        name: "Pho Bo",
        quantity: 1,
        unitPrice: 50000,
      },
    ],
    deliveryAddress: "123 Nguyen Hue, District 1, HCMC",
    deliveryLatitude: 10.775,
    deliveryLongitude: 106.7,
    deliveryFee: 36000,
    serviceFee: 1000,
  };

  it("lưu đúng phương thức PRIORITY và thứ tự ưu tiên", () => {
    const result = Order.place({
      ...baseProps,
      deliveryOption: "PRIORITY",
      deliveryOptionFee: 11000,
      promisedDeliveryAt: new Date("2026-01-01T01:00:00.000Z"),
    });

    expect(result.isSuccess).toBe(true);
    const order = result.value;
    expect(order.orderDeliveryOption).toBe("PRIORITY");
    expect(order.orderDeliveryOptionLabel).toBe("Ưu tiên");
    expect(order.orderPriorityRank).toBe(2);
    expect(order.orderDeliveryOptionFee).toBe(11000);
    expect(order.orderPromisedDeliveryAt?.toISOString()).toBe(
      "2026-01-01T01:00:00.000Z",
    );
  });

  it("đơn PICKUP luôn là FAST và không có phụ thu", () => {
    const result = Order.place({
      ...baseProps,
      orderType: "PICKUP",
      deliveryOption: "PRIORITY",
      deliveryOptionFee: 11000,
    });

    expect(result.isSuccess).toBe(true);
    const order = result.value;
    expect(order.orderDeliveryOption).toBe("FAST");
    expect(order.orderPriorityRank).toBe(1);
    expect(order.orderDeliveryOptionFee).toBe(0);
    expect(order.orderPromisedDeliveryAt).toBeNull();
  });
});
