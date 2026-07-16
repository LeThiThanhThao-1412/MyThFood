import {
  Dispatch,
  DispatchStatus,
  DispatchDeclineReason,
} from "../../modules/dispatch/domain/dispatch.aggregate";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";

describe("Dispatch Aggregate", () => {
  const validProps = {
    orderId: "e5f6a789-0123-4567-cdef-123456789045",
    merchantId: "c3d4e5f6-a789-0123-bcde-f12345678902",
    deliveryAddress: "456 Nguyen Hue, District 1, HCMC",
    deliveryLatitude: 10.777,
    deliveryLongitude: 106.702,
  };

  describe("create", () => {
    it("should create a dispatch in MATCHING status", () => {
      const dispatch = Dispatch.create(validProps);
      expect(dispatch).toBeDefined();
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.MATCHING);
      expect(dispatch.dispatchOrderId).toBe(validProps.orderId);
      expect(dispatch.dispatchMerchantId).toBe(validProps.merchantId);
      expect(dispatch.isActive).toBe(true);
      expect(dispatch.isTerminal).toBe(false);
      expect(dispatch.hasRemainingRetries).toBe(true);
      expect(dispatch.dispatchMatchedDriverIds).toHaveLength(0);
      expect(dispatch.dispatchRetryCount).toBe(0);
    });

    it("should have a valid UUID id", () => {
      const dispatch = Dispatch.create(validProps);
      expect(dispatch.id.value).toBeDefined();
      expect(typeof dispatch.id.value).toBe("string");
      expect(dispatch.id.value.length).toBeGreaterThan(0);
    });

    it("should generate a DispatchCreated domain event", () => {
      const dispatch = Dispatch.create(validProps);
      const events = dispatch.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe("com.mythfood.dispatch.created");
    });
  });

  describe("assignDriver", () => {
    it("should assign driver when in MATCHING status", () => {
      const dispatch = Dispatch.create(validProps);
      const driverId = "550e8400-e29b-41d4-a716-446655440099";
      dispatch.assignDriver(driverId);
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.DRIVER_ASSIGNED);
      expect(dispatch.dispatchDriverId).toBe(driverId);
      expect(dispatch.dispatchMatchedDriverIds).toContain(driverId);
    });

    it("should throw when not in MATCHING status", () => {
      const dispatch = Dispatch.create(validProps);
      const driverId = "550e8400-e29b-41d4-a716-446655440099";
      dispatch.assignDriver(driverId);
      expect(() => dispatch.assignDriver("another-driver")).toThrow(
        BusinessRuleViolationError,
      );
    });

    it("should not allow assigning same driver twice", () => {
      const dispatch = Dispatch.create(validProps);
      const driverId = "550e8400-e29b-41d4-a716-446655440099";
      dispatch.assignDriver(driverId);
      // driverDecline to go back to matching
      dispatch.driverDecline(DispatchDeclineReason.OTHER);
      // retry count < 3, goes back to MATCHING
      expect(dispatch.hasRemainingRetries).toBe(true);
      // Now try assigning same driver again
      expect(() => dispatch.assignDriver(driverId)).toThrow(
        BusinessRuleViolationError,
      );
    });
  });

  describe("driverAccept", () => {
    it("should accept when in DRIVER_ASSIGNED status", () => {
      const dispatch = Dispatch.create(validProps);
      dispatch.assignDriver("550e8400-e29b-41d4-a716-446655440099");
      dispatch.driverAccept();
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.DRIVER_ACCEPTED);
    });

    it("should throw when not in DRIVER_ASSIGNED", () => {
      const dispatch = Dispatch.create(validProps);
      expect(() => dispatch.driverAccept()).toThrow(BusinessRuleViolationError);
    });
  });

  describe("driverDecline", () => {
    it("should decline and retry", () => {
      const dispatch = Dispatch.create(validProps);
      dispatch.assignDriver("550e8400-e29b-41d4-a716-446655440099");
      dispatch.driverDecline(DispatchDeclineReason.TOO_FAR, "Too far");
      expect(dispatch.dispatchDeclineReason).toBe("Too far");
      expect(dispatch.dispatchDeclineReasonType).toBe(
        DispatchDeclineReason.TOO_FAR,
      );
      // Should go back to MATCHING if retries remain
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.MATCHING);
      expect(dispatch.dispatchRetryCount).toBe(1);
      expect(dispatch.hasRemainingRetries).toBe(true);
    });

    it("should expire after max retries", () => {
      const dispatch = Dispatch.create(validProps);
      const driverIds = [
        "d1-000000-0000-0000-000000000001",
        "d2-000000-0000-0000-000000000002",
        "d3-000000-0000-0000-000000000003",
      ];

      for (const driverId of driverIds) {
        dispatch.assignDriver(driverId);
        dispatch.driverDecline(DispatchDeclineReason.BUSY);
      }

      expect(dispatch.dispatchRetryCount).toBe(3);
      expect(dispatch.hasRemainingRetries).toBe(false);
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.EXPIRED);
    });
  });

  describe("lifecycle - full flow", () => {
    it("should go through full delivery lifecycle", () => {
      const dispatch = Dispatch.create(validProps);
      const driverId = "550e8400-e29b-41d4-a716-446655440099";

      // Assign & accept
      dispatch.assignDriver(driverId);
      dispatch.driverAccept();
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.DRIVER_ACCEPTED);

      // Driver arrived
      dispatch.driverArrived();
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.DRIVER_ARRIVED);

      // Picked up
      dispatch.markPickedUp();
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.PICKED_UP);
      expect(dispatch.dispatchPickedUpAt).not.toBeNull();

      // Start delivering
      dispatch.startDelivering();
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.DELIVERING);

      // Delivered
      dispatch.markDelivered();
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.DELIVERED);
      expect(dispatch.dispatchDeliveredAt).not.toBeNull();
      expect(dispatch.isTerminal).toBe(true);
      expect(dispatch.isActive).toBe(false);
    });
  });

  describe("cancel", () => {
    it("should cancel when in MATCHING status", () => {
      const dispatch = Dispatch.create(validProps);
      dispatch.cancel("Customer changed mind");
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.CANCELLED);
      expect(dispatch.dispatchCancellationReason).toBe("Customer changed mind");
      expect(dispatch.isTerminal).toBe(true);
    });

    it("should not cancel after delivery", () => {
      const dispatch = Dispatch.create(validProps);
      const driverId = "550e8400-e29b-41d4-a716-446655440099";
      dispatch.assignDriver(driverId);
      dispatch.driverAccept();
      dispatch.driverArrived();
      dispatch.markPickedUp();
      dispatch.startDelivering();
      dispatch.markDelivered();
      expect(() => dispatch.cancel("Too late")).toThrow(
        BusinessRuleViolationError,
      );
    });
  });

  describe("expire", () => {
    it("should expire when in MATCHING", () => {
      const dispatch = Dispatch.create(validProps);
      dispatch.expire();
      expect(dispatch.dispatchStatus).toBe(DispatchStatus.EXPIRED);
    });

    it("should not expire after delivery", () => {
      const dispatch = Dispatch.create(validProps);
      const driverId = "550e8400-e29b-41d4-a716-446655440099";
      dispatch.assignDriver(driverId);
      dispatch.driverAccept();
      dispatch.driverArrived();
      dispatch.markPickedUp();
      dispatch.startDelivering();
      dispatch.markDelivered();
      expect(() => dispatch.expire()).toThrow(BusinessRuleViolationError);
    });
  });
});
