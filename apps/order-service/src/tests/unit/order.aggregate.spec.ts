import { Order } from "../../modules/order/domain/order.aggregate";

describe("Order Aggregate", () => {
  const validPlaceOrderProps = {
    consumerId: "550e8400-e29b-41d4-a716-446655440001",
    merchantId: "550e8400-e29b-41d4-a716-446655440002",
    orderType: "DELIVERY" as const,
    items: [
      {
        menuItemId: "550e8400-e29b-41d4-a716-446655440003",
        name: "Pho Bo",
        quantity: 2,
        unitPrice: 50000,
      },
      {
        menuItemId: "550e8400-e29b-41d4-a716-446655440004",
        name: "Tra Da",
        quantity: 1,
        unitPrice: 5000,
      },
    ],
    deliveryAddress: "123 Nguyen Hue, District 1, HCMC",
    deliveryLatitude: 10.775,
    deliveryLongitude: 106.7,
    deliveryFee: 15000,
    serviceFee: 5000,
    note: "Extra spicy please",
  };

  describe("place()", () => {
    it("should create an order with PENDING status", () => {
      const result = Order.place(validPlaceOrderProps);

      expect(result.isSuccess).toBe(true);
      const order = result.value;
      expect(order.id).toBeDefined();
      expect(order.orderStatus).toBe("PENDING");
      expect(order.orderItems).toHaveLength(2);
      expect(order.orderTotalAmount).toBe(125000); // (50000*2 + 5000) + 15000 + 5000
      expect(order.orderConsumerId).toBe(validPlaceOrderProps.consumerId);
      expect(order.orderMerchantId).toBe(validPlaceOrderProps.merchantId);
    });

    it("should emit OrderPlacedEvent", () => {
      const result = Order.place(validPlaceOrderProps);
      const order = result.value;
      const events = order.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe("com.mythfood.order.placed");
    });

    it("should fail if consumerId is empty", () => {
      const result = Order.place({
        ...validPlaceOrderProps,
        consumerId: "",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain("Consumer ID is required");
    });

    it("should fail if merchantId is empty", () => {
      const result = Order.place({
        ...validPlaceOrderProps,
        merchantId: "",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain("Merchant ID is required");
    });

    it("should fail if items array is empty", () => {
      const result = Order.place({
        ...validPlaceOrderProps,
        items: [],
      });

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain("at least one item");
    });

    it("should fail if delivery order has no delivery address", () => {
      const result = Order.place({
        ...validPlaceOrderProps,
        deliveryAddress: "",
      });

      expect(result.isFailure).toBe(true);
      expect(result.error?.message).toContain("Delivery address is required");
    });

    it("should allow pickup order without delivery address", () => {
      const result = Order.place({
        ...validPlaceOrderProps,
        orderType: "PICKUP",
        deliveryAddress: "",
      });

      expect(result.isSuccess).toBe(true);
    });

    it("should calculate total amount with discount", () => {
      const result = Order.place({
        ...validPlaceOrderProps,
        discount: 10000,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.orderTotalAmount).toBe(115000); // 125000 - 10000
    });
  });

  describe("Status Transitions", () => {
    let order: Order;

    beforeEach(() => {
      const result = Order.place(validPlaceOrderProps);
      order = result.value;
      order.pullDomainEvents(); // Clear events
    });

    it("should transition from PENDING to CONFIRMED", () => {
      order.confirm();
      expect(order.orderStatus).toBe("CONFIRMED");

      const events = order.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe("com.mythfood.order.status_changed");
    });

    it("should transition from CONFIRMED to PREPARING", () => {
      order.confirm();
      order.startPreparing();
      expect(order.orderStatus).toBe("PREPARING");
    });

    it("should transition from PREPARING to READY_FOR_PICKUP", () => {
      order.confirm();
      order.startPreparing();
      order.markReadyForPickup();
      expect(order.orderStatus).toBe("READY_FOR_PICKUP");
    });

    it("should transition from READY_FOR_PICKUP to OUT_FOR_DELIVERY", () => {
      order.confirm();
      order.startPreparing();
      order.markReadyForPickup();
      order.markOutForDelivery("550e8400-e29b-41d4-a716-446655440005");
      expect(order.orderStatus).toBe("OUT_FOR_DELIVERY");
      expect(order.orderDriverId).toBe("550e8400-e29b-41d4-a716-446655440005");
    });

    it("should transition from OUT_FOR_DELIVERY to DELIVERED", () => {
      order.confirm();
      order.startPreparing();
      order.markReadyForPickup();
      order.markOutForDelivery("550e8400-e29b-41d4-a716-446655440005");
      order.markDelivered();
      expect(order.orderStatus).toBe("DELIVERED");
    });

    it("should cancel order from PENDING", () => {
      order.cancel("Customer changed mind");
      expect(order.orderStatus).toBe("CANCELLED");
      expect(order.orderCancelReason).toBe("Customer changed mind");
    });

    it("should reject order from PENDING", () => {
      order.reject("Closed for the day");
      expect(order.orderStatus).toBe("REJECTED");
      expect(order.orderRejectionReason).toBe("Closed for the day");
    });

    it("should not allow invalid transitions", () => {
      expect(() => order.markDelivered()).toThrow(
        "Cannot transition order from PENDING to DELIVERED",
      );
    });

    it("should not allow transition from DELIVERED", () => {
      order.confirm();
      order.startPreparing();
      order.markReadyForPickup();
      order.markOutForDelivery("550e8400-e29b-41d4-a716-446655440005");
      order.markDelivered();

      expect(() => order.cancel("Late")).toThrow(
        "Cannot transition order from DELIVERED to CANCELLED",
      );
    });

    it("should not allow cancel without reason", () => {
      expect(() => order.cancel("")).toThrow("Cancellation reason is required");
    });

    it("should not allow reject without reason", () => {
      expect(() => order.reject("")).toThrow("Rejection reason is required");
    });

    it("should not allow out-for-delivery without driverId", () => {
      order.confirm();
      order.startPreparing();
      order.markReadyForPickup();
      expect(() => order.markOutForDelivery("")).toThrow(
        "Driver ID is required",
      );
    });
  });

  describe("Query methods", () => {
    it("should report active for non-terminal statuses", () => {
      const result = Order.place(validPlaceOrderProps);
      const order = result.value;
      expect(order.isActive()).toBe(true);
    });

    it("should report inactive for DELIVERED", () => {
      const result = Order.place(validPlaceOrderProps);
      const order = result.value;
      order.confirm();
      order.startPreparing();
      order.markReadyForPickup();
      order.markOutForDelivery("550e8400-e29b-41d4-a716-446655440005");
      order.markDelivered();
      expect(order.isActive()).toBe(false);
    });

    it("should report inactive for CANCELLED", () => {
      const result = Order.place(validPlaceOrderProps);
      const order = result.value;
      order.cancel("test");
      expect(order.isActive()).toBe(false);
    });

    it("should report inactive for REJECTED", () => {
      const result = Order.place(validPlaceOrderProps);
      const order = result.value;
      order.reject("test");
      expect(order.isActive()).toBe(false);
    });
  });

  describe("rehydrate()", () => {
    it("should reconstruct order without events", () => {
      const result = Order.place(validPlaceOrderProps);
      const original = result.value;

      const rehydrated = Order.rehydrate(original.id, {
        consumerId: original.orderConsumerId,
        merchantId: original.orderMerchantId,
        orderType: original.orderTypeValue,
        status: original.orderStatus,
        items: [...original.orderItems],
        subtotal: original.orderSubtotal,
        deliveryFee: original.orderDeliveryFee,
        serviceFee: original.orderServiceFee,
        discount: original.orderDiscount,
        totalAmount: original.orderTotalAmount,
        deliveryAddress: original.orderDeliveryAddress,
        deliveryLatitude: original.orderDeliveryLatitude,
        deliveryLongitude: original.orderDeliveryLongitude,
        estimatedDeliveryTime: original.orderEstimatedDeliveryTime,
        notes: original.orderNotes,
        driverId: original.orderDriverId,
        cancelReason: original.orderCancelReason,
        rejectionReason: original.orderRejectionReason,
      });

      expect(rehydrated.id.equals(original.id)).toBe(true);
      expect(rehydrated.orderStatus).toBe("PENDING");
      expect(rehydrated.pullDomainEvents()).toHaveLength(0); // No events on rehydrate
    });
  });
});
