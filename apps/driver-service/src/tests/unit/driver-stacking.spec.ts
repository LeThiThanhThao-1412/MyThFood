import { Driver } from "../../modules/driver/domain/driver.aggregate";

const createProps = {
  userId: "user-stack-1",
  fullName: "Tran Van Stack",
  phoneNumber: "+84901113333",
  email: "stack@example.com",
  idCardNumber: "123456780",
  driverLicenseNumber: "DL-999",
  vehicleRegistrationNumber: "VR-999",
  insuranceNumber: "INS-999",
};

function onlineDriver(): Driver {
  const driver = Driver.create(createProps);
  driver.completeTraining();
  driver.activate();
  driver.goOnline();
  return driver;
}

describe("Driver SAVER stacking", () => {
  it("giữ tối đa 3 đơn SAVER", () => {
    const driver = onlineDriver();

    driver.assignOrder("order-1", 3);
    driver.assignOrder("order-2", 3);
    driver.assignOrder("order-3", 3);

    expect(driver.driverCurrentOrderIds).toEqual([
      "order-1",
      "order-2",
      "order-3",
    ]);
    expect(driver.driverActiveOrderCount).toBe(3);
    expect(driver.driverMaxConcurrentOrders).toBe(3);
    expect(driver.canAcceptMoreOrders).toBe(false);
    expect(() => driver.assignOrder("order-4", 3)).toThrow(
      /maximum number of active orders/,
    );
  });

  it("FAST/PRIORITY vẫn giới hạn 1 đơn", () => {
    const driver = onlineDriver();
    driver.assignOrder("order-fast", 1);

    expect(driver.driverActiveOrderCount).toBe(1);
    expect(driver.canAcceptMoreOrders).toBe(false);
    expect(() => driver.assignOrder("order-fast-2", 1)).toThrow(
      /maximum number of active orders/,
    );
  });

  it("hoàn thành 1 đơn chỉ xoá đúng đơn đó", () => {
    const driver = onlineDriver();
    driver.assignOrder("order-1", 3);
    driver.assignOrder("order-2", 3);
    driver.assignOrder("order-3", 3);

    driver.completeOrder("order-2");

    expect(driver.driverCurrentOrderIds).toEqual(["order-1", "order-3"]);
    expect(driver.driverCurrentOrderId).toBe("order-1");
    expect(driver.driverTotalOrders).toBe(1);
  });

  it("giải phóng 1 đơn / toàn bộ đơn", () => {
    const driver = onlineDriver();
    driver.assignOrder("order-1", 3);
    driver.assignOrder("order-2", 3);

    driver.releaseOrder("order-1");
    expect(driver.driverCurrentOrderIds).toEqual(["order-2"]);

    driver.releaseOrder();
    expect(driver.driverCurrentOrderIds).toEqual([]);
    expect(driver.driverCurrentOrderId).toBeNull();
    expect(driver.driverTotalOrders).toBe(0);
  });

  it("assign lại cùng orderId là idempotent", () => {
    const driver = onlineDriver();
    driver.assignOrder("order-1", 3);
    driver.assignOrder("order-1", 3);

    expect(driver.driverCurrentOrderIds).toEqual(["order-1"]);
  });
});
