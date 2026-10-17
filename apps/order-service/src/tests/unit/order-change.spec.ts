import { Order } from "../../modules/order/domain/order.aggregate";
import {
  computeAfterDiscount,
  getItemEditableStatuses,
  isItemEditable,
  resolveAdjustmentMoney,
} from "../../modules/order/domain/order-change.policy";

const baseProps = {
  consumerId: "550e8400-e29b-41d4-a716-446655440001",
  merchantId: "550e8400-e29b-41d4-a716-446655440002",
  orderType: "DELIVERY" as const,
  items: [
    {
      menuItemId: "550e8400-e29b-41d4-a716-446655440003",
      name: "Phở bò",
      quantity: 2,
      unitPrice: 50000,
    },
    {
      menuItemId: "550e8400-e29b-41d4-a716-446655440004",
      name: "Trà đá",
      quantity: 1,
      unitPrice: 5000,
    },
  ],
  deliveryAddress: "123 Nguyễn Huệ, Quận 1",
  deliveryLatitude: 10.775,
  deliveryLongitude: 106.7,
  deliveryFee: 15000,
  serviceFee: 5000,
  discount: 10000,
  paymentMethod: "WALLET",
};

function confirmedOrder(): Order {
  const result = Order.place(baseProps);
  expect(result.isSuccess).toBe(true);
  const order = result.value;
  order.confirm();
  return order;
}

describe("Order change policy", () => {
  describe("getItemEditableStatuses()", () => {
    const original = process.env.ORDER_EDIT_ALLOWED_STATUSES;

    afterEach(() => {
      if (original === undefined) {
        delete process.env.ORDER_EDIT_ALLOWED_STATUSES;
      } else {
        process.env.ORDER_EDIT_ALLOWED_STATUSES = original;
      }
    });

    it("defaults to CONFIRMED and PREPARING", () => {
      delete process.env.ORDER_EDIT_ALLOWED_STATUSES;
      expect(getItemEditableStatuses()).toEqual(["CONFIRMED", "PREPARING"]);
      expect(isItemEditable("CONFIRMED")).toBe(true);
      expect(isItemEditable("PREPARING")).toBe(true);
      expect(isItemEditable("PENDING")).toBe(false);
      expect(isItemEditable("READY_FOR_PICKUP")).toBe(false);
      expect(isItemEditable("DELIVERED")).toBe(false);
    });

    it("supports env override and ignores invalid values", () => {
      process.env.ORDER_EDIT_ALLOWED_STATUSES =
        "pending, preparing, NOT_A_STATUS";
      expect(getItemEditableStatuses()).toEqual(["PENDING", "PREPARING"]);
    });
  });

  describe("resolveAdjustmentMoney()", () => {
    it("returns NONE when no delta", () => {
      expect(resolveAdjustmentMoney("WALLET", 0)).toEqual({
        mode: "NONE",
        amount: 0,
        requiresPayment: false,
      });
    });

    it("handles COD: only update amount to collect", () => {
      expect(resolveAdjustmentMoney("COD", 25000).mode).toBe("COD_UPDATE");
      expect(resolveAdjustmentMoney("CASH", -25000).mode).toBe("COD_UPDATE");
    });

    it("handles WALLET charge/refund", () => {
      expect(resolveAdjustmentMoney("WALLET", 25000)).toEqual({
        mode: "WALLET_CHARGE",
        amount: 25000,
        requiresPayment: false,
      });
      expect(resolveAdjustmentMoney("WALLET", -25000)).toEqual({
        mode: "WALLET_REFUND",
        amount: 25000,
        requiresPayment: false,
      });
    });

    it("handles CREDIT_CARD: extra payment vs refund to wallet", () => {
      expect(resolveAdjustmentMoney("CREDIT_CARD", 25000)).toEqual({
        mode: "CARD_CHARGE",
        amount: 25000,
        requiresPayment: true,
      });
      expect(resolveAdjustmentMoney("CREDIT_CARD", -25000)).toEqual({
        mode: "CARD_REFUND_TO_WALLET",
        amount: 25000,
        requiresPayment: false,
      });
    });
  });

  describe("computeAfterDiscount()", () => {
    it("caps discount at the new items subtotal", () => {
      expect(computeAfterDiscount(10000, 50000)).toBe(10000);
      expect(computeAfterDiscount(10000, 6000)).toBe(6000);
      expect(computeAfterDiscount(0, 6000)).toBe(0);
    });
  });
});

describe("Order.applyItemChange()", () => {
  it("replaces items, recalculates totals and bumps itemsVersion", () => {
    const order = confirmedOrder();
    expect(order.orderItemsVersion).toBe(1);
    const beforeTotal = order.orderTotalAmount;

    order.applyItemChange({
      items: [
        {
          menuItemId: "550e8400-e29b-41d4-a716-446655440003",
          name: "Phở bò",
          imageUrl: null,
          quantity: 1,
          unitPrice: 50000,
          originalPrice: null,
          subtotal: 50000,
          specialInstructions: null,
        },
      ],
      reason: "Khách đổi số lượng",
    });

    expect(order.orderItems).toHaveLength(1);
    expect(order.orderSubtotal).toBe(50000);
    expect(order.orderDiscount).toBe(10000);
    expect(order.orderTotalAmount).toBe(
      50000 + baseProps.deliveryFee + baseProps.serviceFee - 10000,
    );
    expect(order.orderTotalAmount).toBeLessThan(beforeTotal);
    expect(order.orderItemsVersion).toBe(2);

    const events = order.pullDomainEvents();
    expect(
      events.some(
        (event) => event.eventType === "com.mythfood.order.items_changed",
      ),
    ).toBe(true);
  });

  it("rejects change when order is not editable", () => {
    const pending = Order.place(baseProps).value;
    expect(() =>
      pending.applyItemChange({
        items: [
          {
            menuItemId: "550e8400-e29b-41d4-a716-446655440003",
            name: "Phở bò",
            imageUrl: null,
            quantity: 1,
            unitPrice: 50000,
            originalPrice: null,
            subtotal: 50000,
            specialInstructions: null,
          },
        ],
      }),
    ).toThrow(/Không thể chỉnh sửa món/);
  });

  it("rejects an empty item list (không thể xóa món cuối)", () => {
    const order = confirmedOrder();
    expect(() => order.applyItemChange({ items: [] })).toThrow(
      /ít nhất một món/,
    );
  });

  it("caps discount when the new subtotal is smaller", () => {
    const order = confirmedOrder();
    order.applyItemChange({
      items: [
        {
          menuItemId: "550e8400-e29b-41d4-a716-446655440004",
          name: "Trà đá",
          imageUrl: null,
          quantity: 1,
          unitPrice: 5000,
          originalPrice: null,
          subtotal: 5000,
          specialInstructions: null,
        },
      ],
    });
    expect(order.orderDiscount).toBe(5000);
    expect(order.orderTotalAmount).toBe(5000 + 15000 + 5000 - 5000);
  });
});
