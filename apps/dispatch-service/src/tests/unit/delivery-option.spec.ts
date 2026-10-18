import {
  Dispatch,
  DispatchStatus,
} from "../../modules/dispatch/domain/dispatch.aggregate";
import {
  dispatchTimeoutSeconds,
  driverResponseTimeoutSeconds,
  normalizeDeliveryOption,
  priorityRankOf,
} from "../../modules/dispatch/domain/delivery-option";

describe("Dispatch delivery option", () => {
  const validProps = {
    orderId: "e5f6a789-0123-4567-cdef-123456789045",
    merchantId: "c3d4e5f6-a789-0123-bcde-f12345678902",
    deliveryAddress: "456 Nguyen Hue, District 1, HCMC",
    deliveryLatitude: 10.777,
    deliveryLongitude: 106.702,
  };

  it("mặc định FAST khi không truyền phương thức", () => {
    const dispatch = Dispatch.create(validProps);

    expect(dispatch.dispatchDeliveryOption).toBe("FAST");
    expect(dispatch.dispatchPriorityRank).toBe(1);
    expect(dispatch.dispatchStatus).toBe(DispatchStatus.MATCHING);
  });

  it("PRIORITY có rank cao nhất và giữ promisedDeliveryAt", () => {
    const promised = new Date("2026-01-01T01:00:00.000Z");
    const dispatch = Dispatch.create({
      ...validProps,
      deliveryOption: "PRIORITY",
      promisedDeliveryAt: promised,
    });

    expect(dispatch.dispatchDeliveryOption).toBe("PRIORITY");
    expect(dispatch.dispatchPriorityRank).toBe(2);
    expect(dispatch.dispatchPromisedDeliveryAt).toEqual(promised);
  });

  it("SAVER có rank thấp nhất", () => {
    const dispatch = Dispatch.create({
      ...validProps,
      deliveryOption: "SAVER",
    });

    expect(dispatch.dispatchPriorityRank).toBe(0);
  });

  it("normalize/priorityRank xử lý giá trị lạ", () => {
    expect(normalizeDeliveryOption("unknown")).toBe("FAST");
    expect(normalizeDeliveryOption("priority")).toBe("PRIORITY");
    expect(priorityRankOf("PRIORITY")).toBe(2);
  });

  it("timeout điều phối theo phương thức", () => {
    expect(dispatchTimeoutSeconds("PRIORITY")).toBeLessThan(
      dispatchTimeoutSeconds("FAST"),
    );
    expect(dispatchTimeoutSeconds("SAVER")).toBeGreaterThan(
      dispatchTimeoutSeconds("FAST"),
    );
    expect(driverResponseTimeoutSeconds("PRIORITY")).toBeLessThan(
      driverResponseTimeoutSeconds("FAST"),
    );
  });
});
